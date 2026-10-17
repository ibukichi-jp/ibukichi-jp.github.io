import os
import sys
from datetime import date, timedelta
from typing import Final

import jpholiday
from atproto import Client

BSKY_HANDLE_ENV: Final[str] = "BSKY_HANDLE"
BSKY_APP_PASSWORD_ENV: Final[str] = "BSKY_APP_PASSWORD"


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


def build_bot_messages(target_date: date) -> list[str]:
    """配信対象となるメッセージのリストを構築する（祝日・プレミアムフライデー等）。"""
    candidates = [
        holiday_bot_message(target_date),
        premium_friday_bot_message(target_date),
    ]
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
        print(f"{today} has no bot messages to send to Bluesky.")
        return

    print(f"Sending {len(messages)} messages to Bluesky...")
    client = create_bsky_client()
    send_posts(client, messages)


if __name__ == "__main__":
    main()