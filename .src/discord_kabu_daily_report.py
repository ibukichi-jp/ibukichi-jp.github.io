from datetime import datetime
from discord_kabu_common import load_prices, get_prices, send_discord, get_env
import jpholiday

def is_market_open(today):
    """市場が開いているか判定する関数"""
    # 1. 土日チェック
    if today.weekday() >= 5:
        return False

    # 2. 祝日チェック
    if jpholiday.is_holiday(today):
        return False

    # 3. 年末年始チェック (12/31-1/3は休場)
    if (today.month == 12 and today.day == 31) or (today.month == 1 and today.day <= 3):
        return False

    return True


def main():
    today = datetime.now().date()
    if not is_market_open(today):
        print(f"{today} is market holiday. Skip report.")
        return

    total_assets      = 0
    total_prev_assets = 0
    total_cost        = 0

    lines  = [f"📊 株価終値チェック ({today})\n"]
    stocks = load_prices()
    for symbol, info in stocks.items():
        hist       = get_prices(symbol)
        prev_close = float(hist.iloc[-2]["Close"])
        close      = float(hist.iloc[-1]["Close"])

        name      = info["name"]
        buy_price = info["price"]
        units     = info["unit"]

        asset      = close      * units
        prev_asset = prev_close * units
        cost       = buy_price  * units

        diff_buy  = close - buy_price
        diff_prev = close - prev_close

        icon = "🟢" if diff_buy >= 0 else "🔴"
        sb = "+" if diff_buy >= 0 else ""
        sp = "+" if diff_prev >= 0 else ""

        lines.append(
            f"{symbol} ({name})\n"
            f"  購入価格: {buy_price:,.0f}円\n"
            f"  終値: {close:,.0f}円 "
            f"(購入比: {sb}{diff_buy:,.0f}円、前日比: {sp}{diff_prev:,.0f}円)\n"
            f"  資産額: {asset:,.0f}円 {icon}\n"
        )

        total_assets      += asset
        total_prev_assets += prev_asset
        total_cost        += cost

    total_profit    = total_assets - total_cost
    total_prev_diff = total_assets - total_prev_assets

    mood = "😊" if total_profit >= 0 and total_prev_diff >= 0 else \
           "😱" if total_profit < 0 and total_prev_diff < 0 else "😐"

    lines.append(
        "―――――――――――――\n"
        f"{mood} 総資産サマリー\n"
        f"📦 総資産額: {total_assets:,.0f}円 "
        f"(前日比: {total_prev_diff:+,.0f}円)\n"
        f"📈 評価損益: {total_profit:+,.0f}円"
    )

    webhook_url = get_env("DISCORD_URL_DAILY_REPORT")
    send_discord("\n".join(lines), webhook_url)


if __name__ == "__main__":
    main()
