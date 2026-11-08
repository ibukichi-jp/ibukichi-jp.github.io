import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

from rss_github_notifications import (
    atom_bytes,
    build_feed,
    extract_release_entries,
    fetch_release_link,
    github_headers,
)


def test_github_headers():
    """GitHub APIリクエスト用ヘッダーの生成テスト"""
    headers = github_headers("my_secret_token")
    assert headers["Authorization"] == "Bearer my_secret_token"
    assert headers["Accept"] == "application/vnd.github+json"
    assert headers["X-GitHub-Api-Version"] == "2022-11-28"


def test_build_feed():
    """エントリリストからAtomフィードが正しく生成されるかのテスト"""
    entries = [
        {
            "title": "[astral-sh/uv] 0.5.0",
            "link": "https://github.com/astral-sh/uv/releases/tag/0.5.0",
            "updated": "2026-10-15T12:00:00Z",
            "summary": "Extremely fast Python package installer and resolver",
        }
    ]

    atom_str = atom_bytes(build_feed(entries)).decode("utf-8")

    assert atom_str.startswith("<?xml version='1.0' encoding='UTF-8'?>")
    assert '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">' in atom_str
    assert "<title>Tracking GitHub notifications</title>" in atom_str
    assert "[astral-sh/uv] 0.5.0" in atom_str
    assert '<link href="https://github.com/astral-sh/uv/releases/tag/0.5.0" />' in atom_str
    assert "<updated>2026-10-15T12:00:00+00:00</updated>" in atom_str


def test_build_feed_escapes_and_skips_entries_without_link():
    """特殊文字がエスケープされ、リンクのないエントリは出力されないかのテスト"""
    entries = [
        {
            "title": "[o/r] <script>",
            "link": "https://github.com/o/r/releases/tag/v1",
            "updated": "2026-10-15T12:00:00Z",
            "summary": "a & b",
        },
        {"title": "[o/r] no link", "link": "", "updated": "2026-10-15T12:00:00Z", "summary": ""},
    ]

    atom_str = atom_bytes(build_feed(entries)).decode("utf-8")

    assert "&lt;script&gt;" in atom_str
    assert "<script>" not in atom_str
    assert "a &amp; b" in atom_str
    assert "no link" not in atom_str


@patch("rss_github_notifications.fetch_release_link")
def test_extract_release_entries(mock_fetch_link):
    """Release通知のみがエントリとして抽出されるかのテスト"""
    mock_fetch_link.return_value = "https://github.com/owner/repo/releases/tag/v1.0"

    notifications = [
        # 対象: type == Release
        {
            "subject": {
                "type": "Release",
                "title": "v1.0",
                "url": "https://api.github.com/repos/owner/repo/releases/1",
            },
            "repository": {"full_name": "owner/repo", "description": "Awesome tool"},
            "updated_at": "2026-10-15T10:00:00Z",
        },
        # 除外: type == Issue
        {
            "subject": {
                "type": "Issue",
                "title": "Bug report",
                "url": "https://api.github.com/repos/owner/repo/issues/1",
            },
            "repository": {"full_name": "owner/repo", "description": "Awesome tool"},
            "updated_at": "2026-10-15T10:00:00Z",
        },
    ]

    entries = extract_release_entries(notifications, headers={})
    assert len(entries) == 1
    assert entries[0]["title"] == "[owner/repo] v1.0"
    assert entries[0]["link"] == "https://github.com/owner/repo/releases/tag/v1.0"
    assert entries[0]["summary"] == "Awesome tool"


def test_build_feed_removes_invalid_xml_chars():
    """XML で使えない制御文字が取り除かれ、正しい XML として読めるかのテスト"""
    entries = [
        {
            "title": "[o/r] bad\x0bname\x00",
            "link": "https://github.com/o/r/releases/tag/v1",
            "updated": "2026-10-15T12:00:00Z",
            "summary": "desc\x1f",
        }
    ]

    data = atom_bytes(build_feed(entries))
    root = ET.fromstring(data)  # 不正な文字が残っていれば ParseError になる
    ns = {"a": "http://www.w3.org/2005/Atom"}
    assert root.findtext("a:entry/a:title", namespaces=ns) == "[o/r] badname"
    assert root.findtext("a:entry/a:summary", namespaces=ns) == "desc"


@pytest.mark.parametrize("updated", ["", "not-a-date"])
def test_build_feed_skips_entries_with_invalid_updated(updated):
    """updated が空や不正な形式のエントリは飛ばし、フィード全体は生成されるかのテスト"""
    entries = [
        {"title": "bad", "link": "https://github.com/o/r/1", "updated": updated, "summary": ""},
        {
            "title": "good",
            "link": "https://github.com/o/r/2",
            "updated": "2026-10-15T12:00:00Z",
            "summary": "",
        },
    ]

    atom_str = atom_bytes(build_feed(entries)).decode("utf-8")
    assert "good" in atom_str
    assert "<title>bad</title>" not in atom_str


@pytest.mark.parametrize(
    "error",
    [
        RuntimeError("GitHub API Error"),
        ValueError("invalid json"),
        TimeoutError("timed out"),
        OSError("connection refused"),
    ],
)
def test_fetch_release_link_returns_empty_on_error(error):
    """リリース情報の取得に失敗しても例外を外に出さず、空文字を返すかのテスト"""
    with patch("rss_github_notifications.request_json", side_effect=error):
        assert fetch_release_link("https://api.github.com/repos/o/r/releases/1", {}) == ""


@pytest.mark.parametrize(
    "payload",
    [[], {"html_url": None}, {"html_url": "javascript:alert(1)"}, {}],
)
def test_fetch_release_link_rejects_unexpected_payload(payload):
    """想定外の応答や https 以外の URL はリンクとして使わないかのテスト"""
    with patch("rss_github_notifications.request_json", return_value=payload):
        assert fetch_release_link("https://api.github.com/repos/o/r/releases/1", {}) == ""
