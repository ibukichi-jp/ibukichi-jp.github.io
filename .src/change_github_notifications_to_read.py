import os

import requests


def set_request_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def call_github_api_by_get(url: str, token: str, timeout: int) -> requests.Response:
    headers = set_request_headers(token)
    response = requests.get(url, headers=headers, timeout=timeout)
    if response.status_code != 200:
        raise RuntimeError(
            f"GitHub API Error: GET:{url} - {response.status_code} - {response.text}"
        )
    return response


def call_github_api_by_patch(url: str, token: str, timeout: int) -> requests.Response:
    headers = set_request_headers(token)
    response = requests.patch(url, headers=headers, timeout=timeout)
    if response.status_code != 205:
        raise RuntimeError(
            f"GitHub API Error: PATCH:{url} - {response.status_code} - {response.text}"
        )
    return response


if __name__ == "__main__":
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        raise ValueError("環境変数 GITHUB_TOKEN が設定されていません。")

    api_url = "https://api.github.com/notifications"
    response = call_github_api_by_get(api_url, token, 10)
    notifications = response.json()

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
