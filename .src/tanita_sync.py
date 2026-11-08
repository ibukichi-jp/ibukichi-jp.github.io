"""タニタ Health Planet API から体組成データを取得し、.data/tanita.json に蓄積する。

外部パッケージを使わず標準ライブラリだけで動く（CI では python3 -I で実行し、
PyPI の依存パッケージを一切読み込まない）。
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Final

TANITA_CLIENT_ID_ENV: Final[str] = "TANITA_CLIENT_ID"
TANITA_CLIENT_SECRET_ENV: Final[str] = "TANITA_CLIENT_SECRET"
TANITA_REFRESH_TOKEN_ENV: Final[str] = "TANITA_REFRESH_TOKEN"

TANITA_TOKEN_URL: Final[str] = "https://www.healthplanet.jp/oauth/token"
TANITA_DATA_URL: Final[str] = "https://www.healthplanet.jp/status/innerscan.json"
DEFAULT_HEIGHT_CM: Final[float] = 175.0
TANITA_DATA_PATH: Final[str] = ".data/tanita.json"
REQUEST_TIMEOUT: Final[int] = 30  # 秒
USER_AGENT: Final[str] = "ibukichi-jp-tanita-sync"


def request_json(url: str, form: dict[str, str] | None = None) -> Any:
    """URL に GET（form を渡した場合はフォーム形式で POST）し、JSON を返す。

    HTTP エラー（4xx/5xx）は urllib.error.HTTPError として送出される。
    """
    data = urllib.parse.urlencode(form).encode("ascii") if form is not None else None
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as res:
        charset = res.headers.get_content_charset() or "utf-8"
        return json.loads(res.read().decode(charset))


def get_required_env(name: str) -> str:
    """環境変数を取得する。設定されていない場合はRuntimeErrorをスローする。"""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"環境変数 {name} が設定されていません。")
    return value


def get_tanita_access_token() -> str:
    """リフレッシュトークンを使って新しいアクセストークンを取得する。"""
    refresh_token = get_required_env(TANITA_REFRESH_TOKEN_ENV)
    client_id = get_required_env(TANITA_CLIENT_ID_ENV)
    client_secret = get_required_env(TANITA_CLIENT_SECRET_ENV)

    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": "https://www.healthplanet.jp/success.html",
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }

    token = request_json(TANITA_TOKEN_URL, form=payload).get("access_token")
    if not token:
        # 応答の中身には秘密が含まれうるので、ログには出さない
        raise RuntimeError("アクセストークンを取得できませんでした。")
    return token


def fetch_tanita_raw_data(days: int = 2) -> list[dict]:
    """過去指定日数のタニタ生データを取得する。"""
    access_token = get_tanita_access_token()
    jst = timezone(timedelta(hours=9))
    now = datetime.now(jst)
    from_date = now - timedelta(days=days)

    params = {
        "access_token": access_token,
        "date": "1",
        "from": from_date.strftime("%Y%m%d%H%M%S"),
        "to": now.strftime("%Y%m%d%H%M%S"),
        "tag": "6021,6022",
    }

    json_data = request_json(f"{TANITA_DATA_URL}?{urllib.parse.urlencode(params)}")
    return json_data.get("data", [])


def update_tanita_data_store(raw_data: list[dict], filepath: str = TANITA_DATA_PATH) -> dict:
    """タニタデータを .data/tanita.json にマージして保存する。"""
    existing_store = {
        "height_cm": DEFAULT_HEIGHT_CM,
        "updated_at": "",
        "records": [],
    }
    if os.path.exists(filepath):
        try:
            with open(filepath, encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict) and "records" in loaded:
                    existing_store = loaded
        except Exception as e:
            print(f"既存のタニタデータ読み込みエラー: {e}", file=sys.stderr)

    height_cm = existing_store.get("height_cm", DEFAULT_HEIGHT_CM)
    height_m = height_cm / 100.0

    records_by_date = {r["date"]: r for r in existing_store.get("records", []) if "date" in r}

    for item in raw_data:
        date_str = item.get("date")
        if not date_str:
            continue
        try:
            dt = datetime.strptime(date_str, "%Y%m%d%H%M")
            display_time = dt.strftime("%Y-%m-%d %H:%M")
        except ValueError:
            continue

        tag = item.get("tag")
        val_str = item.get("keydata")
        try:
            val_float = float(val_str)
        except (ValueError, TypeError):
            continue

        if display_time not in records_by_date:
            records_by_date[display_time] = {
                "date": display_time,
                "weight": None,
                "fat": None,
                "bmi": None,
            }

        rec = records_by_date[display_time]
        if tag == "6021":
            rec["weight"] = val_float
        elif tag == "6022":
            rec["fat"] = val_float

        if rec.get("weight") is not None:
            rec["bmi"] = round(rec["weight"] / (height_m * height_m), 2)

    # 日付昇順でソート
    sorted_records = sorted(records_by_date.values(), key=lambda r: r["date"])
    existing_store["records"] = sorted_records
    jst = timezone(timedelta(hours=9))
    existing_store["updated_at"] = datetime.now(jst).isoformat()

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(existing_store, f, ensure_ascii=False, indent=2)

    return existing_store


def main() -> None:
    """タニタAPIから最新データを取得し、.data/tanita.json に保存・蓄積する。"""
    try:
        raw_data = fetch_tanita_raw_data(days=2)
        if not raw_data:
            print("新規のタニタ測定データはありませんでした。")
            return

        store = update_tanita_data_store(raw_data)
        record_count = len(store.get("records", []))
        print(f"タニタ体組成データを正常に同期しました（総レコード数: {record_count}件）。")

    except Exception as e:
        print(f"タニタデータ同期中にエラーが発生しました: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
