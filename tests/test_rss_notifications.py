import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

from rss_github_notifications import build_feed, extract_release_entries, github_headers


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

    feed = build_feed(entries)
    atom_str = feed.atom_str(pretty=True).decode("utf-8")

    assert "<title>Tracking GitHub notifications</title>" in atom_str
    assert "[astral-sh/uv] 0.5.0" in atom_str
    assert "https://github.com/astral-sh/uv/releases/tag/0.5.0" in atom_str


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
