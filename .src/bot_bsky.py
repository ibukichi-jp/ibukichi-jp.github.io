import os
import sys
from datetime import date, datetime, timedelta, timezone
from typing import Final

import jpholiday
import requests
from atproto import Client

# 定数の明示 (既存)
BSKY_HANDLE_ENV: Final[str] = "BSKY_HANDLE"
BSKY_APP_PASSWORD_ENV: Final[str] = "BSKY_APP_PASSWORD"

# 定数の明示 (タニタAPI用追加)
TANITA_CLIENT_ID_ENV: Final[str] = "TANITA_CLIENT_ID"
TANITA_CLIENT_SECRET_ENV: Final[str] = "TANITA_CLIENT_SECRET"
TANITA_REFRESH_TOKEN_ENV: Final[str] = "TANITA_REFRESH_TOKEN"

TANITA_TOKEN_URL: Final[str] = "https://www.healthplanet.jp/oauth/token"
TANITA_DATA_URL: Final[str] = "https://www.healthplanet.jp/status/innerscan.json"


def get_required_env(name: str) -> str:
    """環境変数を取得する。設定されていない場合はRuntimeErrorをスローする。"""
    value = os.environ.get(name)

    if not value:
        raise RuntimeError(f"環境変数 {name} が設定されていません。")

    return value


def is_weekend(target_date: date) -> bool:
    """土日かどうかを判定する（5: 土曜日, 6: 日曜日）。"""
    return target_date.weekday() >= 5


def is_holiday(target_date: date) -> bool:
    """祝日かどうかを判定する。"""
    return jpholiday.is_holiday(target_date)


def is_business_day(target_date: date) -> bool:
    """営業日（平日かつ祝日でない日）かどうかを判定する。"""
    return not is_weekend(target_date) and not is_holiday(target_date)


def is_premium_friday(target_date: date) -> bool:
    """月末の金曜日（プレミアムフライデー）かつ営業日であるかを判定する。"""
    if target_date.weekday() != 4:
        return False

    if not is_business_day(target_date):
        return False

    next_week_date = target_date + timedelta(days=7)
    return target_date.month != next_week_date.month


def holiday_bot_message(target_date: date) -> str:
    """祝日の場合のボットメッセージを生成する。"""
    holiday_name = jpholiday.is_holiday_name(target_date)

    if not holiday_name:
        return ""

    return f"今日は祝日「{holiday_name}」です。ゆっくり過ごしましょう！\n（この投稿は自動投稿です。）"


def premium_friday_bot_message(target_date: date) -> str:
    """プレミアムフライデーの場合のボットメッセージを生成する。"""
    if not is_premium_friday(target_date):
        return ""

    return "皆さん今日は月末金曜です。プレミアムフライデー、覚えていますか？ 仕事を早く切り上げて、ゆっくり過ごしましょう！\n（この投稿は自動投稿です。）"


def haiku_bot_message() -> str:
    """haiku.logから最新の俳句を取得してボットメッセージを生成する。"""
    log_path = ".data/haiku.log"

    # ファイルが存在しない場合は空文字を返す
    if not os.path.exists(log_path):
        return ""

    try:
        with open(log_path, "r", encoding="utf-8") as f:
            # 空行を除外して行のリストを取得
            lines = [line.strip() for line in f if line.strip()]

        if not lines:
            return ""

        # 最後の行（最新の俳句）を取得
        latest_haiku = lines[-1]
        return f"今日の一句\n- {latest_haiku}\n(この投稿は自動投稿です。)"

    except Exception as e:
        print(f"俳句データ取得中にエラーが発生しました: {e}", file=sys.stderr)
        return ""


def get_tanita_access_token() -> str:
    """リフレッシュトークンを使って新しいアクセストークンを取得する。"""
    # 既存の get_required_env を活用して安全に取得
    refresh_token = get_required_env(TANITA_REFRESH_TOKEN_ENV)
    client_id = get_required_env(TANITA_CLIENT_ID_ENV)
    client_secret = get_required_env(TANITA_CLIENT_SECRET_ENV)

    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": "https://www.healthplanet.jp/success.html",
        "grant_type": "refresh_token",
        "refresh_token": refresh_token
    }

    response = requests.post(TANITA_TOKEN_URL, data=payload)
    response.raise_for_status()
    return response.json().get("access_token", "")


def tanita_weight_bot_message() -> str:
    """過去24時間以内の最新の体重・体脂肪率データからボットメッセージを生成する。"""
    try:
        access_token = get_tanita_access_token()

        # 期間の設定 (日本時間)
        jst = timezone(timedelta(hours=9))
        now = datetime.now(jst)
        one_day_ago = now - timedelta(days=1)

        params = {
            "access_token": access_token,
            "date": "1",
            "from": one_day_ago.strftime("%Y%m%d%H%M%S"),
            "to": now.strftime("%Y%m%d%H%M%S"),
            "tag": "6021,6022"
        }

        response = requests.get(TANITA_DATA_URL, params=params)
        response.raise_for_status()
        json_data = response.json()

        data_list = json_data.get("data", [])
        if not data_list:
            return ""

        # 測定日時ごとにデータを整理
        records = {}
        for item in data_list:
            date_str = item.get("date")
            dt = datetime.strptime(date_str, "%Y%m%d%H%M")
            display_time = dt.strftime("%Y-%m-%d %H:%M")

            keyname = ""
            unit = ""

            tag = item.get("tag")
            match tag:
                case "6021":
                    keyname, unit = "体重", "kg"
                case "6022":
                    keyname, unit = "体脂肪率", "%"

            value = item.get("keydata")

            if display_time not in records:
                records[display_time] = {}
            records[display_time][keyname] = f"{value}{unit}"

        # 最新の1件のみを抽出
        latest_time = sorted(records.keys(), reverse=True)[0]
        latest_values = records[latest_time]

        weight = latest_values.get("体重", "データなし")
        fat = latest_values.get("体脂肪率", "データなし")

        # Blueskyに投稿するメッセージの生成
        return f"昨日、体組成計で計ったら、\n- 体重: {weight}\n- 体脂肪率: {fat}\n({latest_time} 測定)\nでした。ちなみに私の身長は175cmです。\n（この投稿は自動投稿です。）"

    except Exception as e:
        # ボット全体の停止を防ぐため、エラー時はログ出力に留めて空文字を返す
        print(f"タニタデータ取得中にエラーが発生しました: {e}", file=sys.stderr)
        return ""


def build_bot_messages(target_date: date) -> list[str]:
    """配信対象となるメッセージのリストを構築する。"""
    candidates = [
        holiday_bot_message(target_date),
        premium_friday_bot_message(target_date),
        tanita_weight_bot_message(),
        haiku_bot_message(),
    ]
    # 空文字を除外してリストを返す
    return [msg for msg in candidates if msg]


def create_bsky_client() -> Client:
    """Blueskyクライアントを生成し、ログインする。"""
    handle = get_required_env(BSKY_HANDLE_ENV)
    app_password = get_required_env(BSKY_APP_PASSWORD_ENV)

    client = Client()
    client.login(handle, app_password)
    return client


def send_posts(client: Client, messages: list[str]) -> None:
    """Blueskyにメッセージを投稿する。"""
    for message in messages:
        client.send_post(message)


def main() -> None:
    today = date.today()
    messages = build_bot_messages(today)

    if not messages:
        print(f"{today} has no bot messages.")
        return

    print(f"Sending {len(messages)} messages...")

    client = create_bsky_client()
    send_posts(client, messages)


if __name__ == "__main__":
    main()