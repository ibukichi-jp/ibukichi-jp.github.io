import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

from change_github_notifications_to_read import (
    call_github_api_by_get,
    call_github_api_by_patch,
    set_request_headers,
)


def test_set_request_headers():
    """GitHub APIヘッダーがBearer認証およびAPIバージョン付きで正しく生成されるかテスト"""
    headers = set_request_headers("sample_token_123")
    assert headers["Authorization"] == "Bearer sample_token_123"
    assert headers["Accept"] == "application/vnd.github+json"
    assert headers["X-GitHub-Api-Version"] == "2022-11-28"


@patch("change_github_notifications_to_read.github_request")
def test_call_github_api_by_get_success(mock_request):
    """GETリクエストが200のときに本文を返すテスト"""
    mock_request.return_value = (200, b"[]")

    body = call_github_api_by_get("https://api.github.com/notifications", "token", 10)
    assert body == b"[]"
    assert mock_request.call_args.args[2] == "GET"


@patch("change_github_notifications_to_read.github_request")
def test_call_github_api_by_get_error(mock_request):
    """GETリクエストがエラー（例: 401 Unauthorized）のときにRuntimeErrorをスローするテスト"""
    mock_request.return_value = (401, b"Bad credentials")

    with pytest.raises(RuntimeError, match="GitHub API Error: GET:.*401"):
        call_github_api_by_get("https://api.github.com/notifications", "token", 10)


@patch("change_github_notifications_to_read.github_request")
def test_call_github_api_by_patch_success(mock_request):
    """PATCHリクエストが205 Reset Contentのときに正常終了するテスト"""
    mock_request.return_value = (205, b"")

    call_github_api_by_patch("https://api.github.com/notifications/threads/1", "token", 10)
    assert mock_request.call_args.args[2] == "PATCH"


@patch("change_github_notifications_to_read.github_request")
def test_call_github_api_by_patch_error(mock_request):
    """PATCHリクエストが205以外のときにRuntimeErrorをスローするテスト"""
    mock_request.return_value = (404, b"Not Found")

    with pytest.raises(RuntimeError, match="GitHub API Error: PATCH:"):
        call_github_api_by_patch("https://api.github.com/notifications/threads/1", "token", 10)


def test_notification_filtering_logic():
    """CI成功通知のみが既読化対象として抽出されるかのロジックテスト"""
    notifications = [
        # 対象: ci_activity + unread + succeeded
        {
            "reason": "ci_activity",
            "unread": True,
            "subject": {"title": "CI workflow succeeded on main"},
            "url": "url_1",
        },
        # 除外: unread=False（既読済み）
        {
            "reason": "ci_activity",
            "unread": False,
            "subject": {"title": "CI workflow succeeded on main"},
            "url": "url_2",
        },
        # 除外: 失敗通知
        {
            "reason": "ci_activity",
            "unread": True,
            "subject": {"title": "CI workflow failed on main"},
            "url": "url_3",
        },
        # 除外: CI以外の通知（PRレビューなど）
        {
            "reason": "review_requested",
            "unread": True,
            "subject": {"title": "Please review succeeded changes"},
            "url": "url_4",
        },
    ]

    target_urls = [
        n["url"]
        for n in notifications
        if n.get("reason") == "ci_activity"
        and n.get("unread")
        and "succeeded" in n.get("subject", {}).get("title", "")
    ]

    assert target_urls == ["url_1"]
