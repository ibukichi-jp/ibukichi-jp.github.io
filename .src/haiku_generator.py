import os
import sys
from openai import OpenAI, OpenAIError

SAKURA_API_KEY = os.getenv("SAKURA_API_KEY")

client = OpenAI(
    api_key=SAKURA_API_KEY,
    base_url="https://api.ai.sakura.ad.jp/v1"
)


def get_season(month: int) -> str:
    if 3 <= month <= 5:
        return "春"
    elif 6 <= month <= 8:
        return "夏"
    elif 9 <= month <= 11:
        return "秋"
    else:
        return "冬"


def generate_haiku(prompt: str = None, model: str = "gpt-oss-120b") -> str:
    if not SAKURA_API_KEY:
        raise ValueError("環境変数 'SAKURA_API_KEY' が設定されていません。")

    if prompt is None:
        from datetime import datetime, timezone, timedelta
        jst = timezone(timedelta(hours=9))
        today = datetime.now(jst)
        date_str = today.strftime("%Y年%m月%d日")
        season = get_season(today.month)
        prompt = f"今日の日付は{date_str}、季節は{season}です。この季節感や日付にちなんだ俳句を詠んでください。"

    system_instruction = (
        "あなたは優秀な俳人です。季語を含めた俳句を一つ作成してください。\n"
        "【出力ルール】\n"
        "- 俳句を1行だけで出力すること。\n"
        "- 五・七・五の各節は半角スペースで区切ること。\n"
        "- 解説や余計な説明は一切含めないこと。"
    )

    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt}
    ]

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=1.0,
        )
        return response.choices[0].message.content.strip()

    except OpenAIError as e:
        raise RuntimeError(f"APIエラーが発生しました: {e}")
    except Exception as e:
        raise RuntimeError(f"予期せぬエラーが発生しました: {e}")


if __name__ == "__main__":
    try:
        haiku = generate_haiku()

        # .dataディレクトリが存在しない場合は作成する
        os.makedirs(".data", exist_ok=True)

        # haiku.log に追記モード('a')で書き込み
        with open(".data/haiku.log", "a", encoding="utf-8") as f:
            f.write(f"{haiku}\n")

        print(f"俳句を .data/haiku.log に保存しました: {haiku}")

    except Exception as e:
        print(e, file=sys.stderr)
        sys.exit(1)