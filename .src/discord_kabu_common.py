import os
import json
import base64
import requests
import yfinance as yf


def get_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"環境変数 {name} が設定されていません。\n"
            f"GitHub Actions の Secrets またはローカル環境を確認してください。"
        )
    return value


PRICES_JSON_BASE64 = get_env("KABU_PRICES_JSON_BASE64")


def load_prices() -> dict:
    decoded = base64.b64decode(PRICES_JSON_BASE64).decode("utf-8")
    return json.loads(decoded)


def get_prices(symbol: str, period="2d"):
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period=period)

    if len(hist) < 2:
        raise RuntimeError(f"価格データ不足: {symbol}")

    return hist


def send_discord(message: str, webhook_url: str):
    payload = {"content": message}
    r = requests.post(webhook_url, json=payload, timeout=10)
    r.raise_for_status()

