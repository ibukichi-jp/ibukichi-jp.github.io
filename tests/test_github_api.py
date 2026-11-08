import io
import sys
import urllib.error
from email.message import Message
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

import github_api  # noqa: E402


def test_github_headers():
    headers = github_api.github_headers("t")
    assert headers["Authorization"] == "Bearer t"
    assert headers["User-Agent"]


def test_refuses_non_github_api_url():
    """GitHub API 以外の URL にはトークンを送らない"""
    with pytest.raises(ValueError):
        github_api.github_request("https://example.com/", {"Authorization": "x"}, "GET", 1)


def test_redirect_is_not_followed():
    """リダイレクト先を返さない（Authorization ヘッダーを転送しない）"""
    handler = github_api._NoRedirectHandler()
    assert handler.redirect_request(None, None, 302, "Found", {}, "https://evil.example/") is None


@pytest.mark.parametrize("code", [302, 401, 500])
def test_http_error_is_returned_as_status_and_body(code):
    """3xx（追わなかったリダイレクト）や 4xx/5xx を例外にせず (code, body) で返すかのテスト"""
    error = urllib.error.HTTPError(
        "https://api.github.com/notifications", code, "error", Message(), io.BytesIO(b"oops")
    )
    with patch.object(github_api._OPENER, "open", side_effect=error):
        status, body = github_api.github_request(
            "https://api.github.com/notifications", {}, "GET", 1
        )
    assert (status, body) == (code, b"oops")
