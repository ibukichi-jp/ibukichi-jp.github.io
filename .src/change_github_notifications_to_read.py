import os

import requests


def set_request_headers(token: str) -> dict:
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
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
        raise ValueError("Failed to get ENV.")

    url = "https://api.github.com/notifications"
    response = call_github_api_by_get(url, token, 10)
    notifications = response.json()

    for notification in notifications:
        reason = notification.get("reason")
        is_unread = notification.get("unread")
        title = notification.get("subject", {}).get("title")
        url = notification.get("url")

        if reason != "ci_activity" or not is_unread or "succeeded" not in title:
            continue

        call_github_api_by_patch(url, token, 10)

        print(f"✅ Marked as read: {url}")
