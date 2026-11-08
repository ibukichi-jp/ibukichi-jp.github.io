import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

from tanita_sync import DEFAULT_HEIGHT_CM, update_tanita_data_store


def test_update_tanita_data_store(tmp_path):
    """タニタの生データからBMIが正確に計算され、日付昇順でマージされるかのテスト"""
    test_file = tmp_path / "tanita_test.json"

    # サンプル生データ（未ソート）
    raw_data = [
        {"date": "202610122000", "tag": "6021", "keydata": "70.0"},
        {"date": "202610122000", "tag": "6022", "keydata": "20.0"},
        {"date": "202610111900", "tag": "6021", "keydata": "69.5"},
        {"date": "202610111900", "tag": "6022", "keydata": "19.5"},
        # 不正なデータ（スキップされるべき）
        {"date": "invalid_date", "tag": "6021", "keydata": "70.0"},
        {"date": "202610132100", "tag": "6021", "keydata": "not_a_number"},
    ]

    store = update_tanita_data_store(raw_data, filepath=str(test_file))

    assert store["height_cm"] == DEFAULT_HEIGHT_CM
    records = store["records"]
    assert len(records) == 2

    # 日付昇順（古い順）になっているか
    assert records[0]["date"] == "2026-10-11 19:00"
    assert records[0]["weight"] == 69.5
    assert records[0]["fat"] == 19.5
    # BMI = 69.5 / (1.75 * 1.75) = 22.6938... -> 22.69
    assert records[0]["bmi"] == 22.69

    assert records[1]["date"] == "2026-10-12 20:00"
    assert records[1]["weight"] == 70.0
    assert records[1]["fat"] == 20.0
    # BMI = 70.0 / (1.75 * 1.75) = 22.857... -> 22.86
    assert records[1]["bmi"] == 22.86

    # ファイルに保存されたJSONの整合性確認
    with open(test_file, encoding="utf-8") as f:
        saved_json = json.load(f)
    assert len(saved_json["records"]) == 2


# ==========================================================================
# 通信部分（標準ライブラリの urllib）と、外部パッケージを使わないことの確認
# ==========================================================================
import ast  # noqa: E402
import io  # noqa: E402
import urllib.parse  # noqa: E402
from unittest.mock import patch  # noqa: E402

import tanita_sync  # noqa: E402


class FakeResponse(io.BytesIO):
    def __init__(self, payload):
        super().__init__(json.dumps(payload).encode("utf-8"))
        self.headers = type("H", (), {"get_content_charset": lambda self: "utf-8"})()


def test_fetch_uses_form_post_for_token_and_get_with_params(monkeypatch):
    monkeypatch.setenv("TANITA_CLIENT_ID", "cid")
    monkeypatch.setenv("TANITA_CLIENT_SECRET", "secret")
    monkeypatch.setenv("TANITA_REFRESH_TOKEN", "refresh")
    calls = []

    def fake_urlopen(req, timeout):
        calls.append((req, timeout))
        if req.full_url == tanita_sync.TANITA_TOKEN_URL:
            return FakeResponse({"access_token": "token-123"})
        return FakeResponse({"data": [{"date": "202611080700", "tag": "6021", "keydata": "68.0"}]})

    with patch("tanita_sync.urllib.request.urlopen", fake_urlopen):
        data = tanita_sync.fetch_tanita_raw_data(days=2)

    assert data == [{"date": "202611080700", "tag": "6021", "keydata": "68.0"}]
    token_req, token_timeout = calls[0]
    assert token_req.get_method() == "POST" and token_timeout == tanita_sync.REQUEST_TIMEOUT
    form = urllib.parse.parse_qs(token_req.data.decode())
    assert form["grant_type"] == ["refresh_token"] and form["refresh_token"] == ["refresh"]

    data_req, _ = calls[1]
    assert data_req.get_method() == "GET"
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(data_req.full_url).query)
    assert query["access_token"] == ["token-123"] and query["tag"] == ["6021,6022"]


def test_tanita_sync_uses_only_standard_library():
    """CI では python3 -I で依存パッケージなしに実行するため、標準ライブラリ以外を import しない"""
    source = (Path(__file__).parent.parent / ".src" / "tanita_sync.py").read_text(encoding="utf-8")
    modules = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            modules |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module.split(".")[0])
    assert modules <= set(sys.stdlib_module_names), modules - set(sys.stdlib_module_names)


def test_missing_access_token_is_an_error(monkeypatch):
    """トークンが返ってこなければ、データ取得に進まずエラーにする（成功扱いで終わらない）"""
    monkeypatch.setenv("TANITA_CLIENT_ID", "cid")
    monkeypatch.setenv("TANITA_CLIENT_SECRET", "secret")
    monkeypatch.setenv("TANITA_REFRESH_TOKEN", "refresh")
    calls = []

    def fake_urlopen(req, timeout):
        calls.append(req.full_url)
        return FakeResponse({"error": "invalid_grant"})

    with patch("tanita_sync.urllib.request.urlopen", fake_urlopen):
        try:
            tanita_sync.fetch_tanita_raw_data()
            raise AssertionError("例外が出るべき")
        except RuntimeError as e:
            assert "アクセストークン" in str(e) and "invalid_grant" not in str(e)
    assert calls == [tanita_sync.TANITA_TOKEN_URL]  # データ取得には進まない
