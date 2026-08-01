from datetime import datetime
from discord_kabu_common import load_prices, get_prices, send_discord, get_env


def main():
    today = datetime.now()

    stocks = load_prices()

    total_now = 0
    total_prev_week = 0

    lines = [
        "📅 週間レポート（前週比）",
        f"🗓 実行日: {today:%Y/%m/%d}",
        ""
    ]

    for symbol, info in stocks.items():
        name = info["name"]
        units = info["unit"]

        # 余裕を持って 20 営業日分取得
        hist = get_prices(symbol, period="20d")

        # 日付順に並んでいる前提（yfinanceは基本OK）
        closes = hist["Close"]

        # 今週の最終取引日（直近）
        now_price = float(closes.iloc[-1])

        # 前週の最終取引日
        # 「5営業日前より前」の最後の値を使う
        prev_week_price = float(closes.iloc[-6])

        total_now += now_price * units
        total_prev_week += prev_week_price * units

        diff = (now_price - prev_week_price) * units
        icon = "📈" if diff >= 0 else "📉"

        lines.append(
            f"{icon} {name}\n"
            f"　前週比: {diff:+,.0f}円"
        )

    total_diff = total_now - total_prev_week
    mood_icon = "🚀" if total_diff > 0 else "😇" if total_diff == 0 else "😱"

    lines.extend([
        "",
        "―――――――――――――",
        f"{mood_icon} 総資産サマリー",
        f"📦 総資産額: {total_now:,.0f}円",
        f"📊 前週比: {total_diff:+,.0f}円",
    ])

    webhook_url = get_env("DISCORD_URL_WEEKLY_REPORT")
    send_discord("\n".join(lines), webhook_url)


if __name__ == "__main__":
    main()
