import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from github_api import decode_json, github_headers, github_request  # noqa: E402


def set_request_headers(token: str) -> dict[str, str]:
    return github_headers(token)


def call_github_api_by_get(url: str, token: str, timeout: int) -> bytes:
    status, body = github_request(url, set_request_headers(token), "GET", timeout)
    if status != 200:
        text = body.decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API Error: GET:{url} - {status} - {text}")
    return body


def call_github_api_by_patch(url: str, token: str, timeout: int) -> bytes:
    status, body = github_request(url, set_request_headers(token), "PATCH", timeout)
    if status != 205:
        text = body.decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API Error: PATCH:{url} - {status} - {text}")
    return body


if __name__ == "__main__":
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        raise ValueError("環境変数 GITHUB_TOKEN が設定されていません。")

    api_url = "https://api.github.com/notifications"
    notifications = decode_json(call_github_api_by_get(api_url, token, 10))

    marked_count = 0
    for notification in notifications:
        reason = notification.get("reason")
        is_unread = notification.get("unread")
        title = notification.get("subject", {}).get("title", "")
        thread_url = notification.get("url")

        if reason != "ci_activity" or not is_unread or "succeeded" not in title or not thread_url:
            continue

        call_github_api_by_patch(thread_url, token, 10)
        marked_count += 1
        print(f"✅ Marked as read: {thread_url}")

    print(f"合計 {marked_count} 件のCI成功通知を既読化しました。")
