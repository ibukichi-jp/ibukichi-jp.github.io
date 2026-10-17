import sys
from datetime import date
from pathlib import Path

# .src ディレクトリを sys.path に追加してインポート可能にする
sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

from bot_bsky import (
    holiday_bot_message,
    is_business_day,
    is_holiday,
    is_premium_friday,
    is_weekend,
    premium_friday_bot_message,
)


def test_is_weekend():
    """週末判定のテスト"""
    saturday = date(2026, 10, 17)
    sunday = date(2026, 10, 18)
    monday = date(2026, 10, 19)

    assert is_weekend(saturday) is True
    assert is_weekend(sunday) is True
    assert is_weekend(monday) is False


def test_is_holiday():
    """祝日判定のテスト（日本の祝日）"""
    new_years_day = date(2026, 1, 1)  # 元日
    coming_of_age_day = date(2026, 1, 12)  # 成人の日
    normal_weekday = date(2026, 10, 15)  # 通常の平日（木曜日）

    assert is_holiday(new_years_day) is True
    assert is_holiday(coming_of_age_day) is True
    assert is_holiday(normal_weekday) is False


def test_is_business_day():
    """営業日判定のテスト（平日かつ祝日でない日）"""
    normal_weekday = date(2026, 10, 15)  # 木曜日（平日）
    saturday = date(2026, 10, 17)  # 土曜日
    holiday_weekday = date(2026, 1, 1)  # 木曜日だが元日（祝日）

    assert is_business_day(normal_weekday) is True
    assert is_business_day(saturday) is False
    assert is_business_day(holiday_weekday) is False


def test_is_premium_friday():
    """プレミアムフライデー（月末の金曜日かつ営業日）のテスト"""
    # 2026年10月: 10/2, 10/9, 10/16, 10/23, 10/30 (金曜日)
    # 最終金曜日は 10/30
    assert is_premium_friday(date(2026, 10, 30)) is True
    assert is_premium_friday(date(2026, 10, 23)) is False
    assert is_premium_friday(date(2026, 10, 16)) is False
    assert is_premium_friday(date(2026, 10, 31)) is False  # 土曜日


def test_holiday_bot_message():
    """祝日ボットメッセージ生成のテスト"""
    new_years_day = date(2026, 1, 1)
    msg = holiday_bot_message(new_years_day)
    assert "元日" in msg
    assert "自動投稿" in msg

    normal_day = date(2026, 10, 15)
    assert holiday_bot_message(normal_day) == ""


def test_premium_friday_bot_message():
    """プレミアムフライデーメッセージ生成のテスト"""
    pf_day = date(2026, 10, 30)
    msg = premium_friday_bot_message(pf_day)
    assert "プレミアムフライデー" in msg
    assert "自動投稿" in msg

    non_pf_day = date(2026, 10, 23)
    assert premium_friday_bot_message(non_pf_day) == ""
