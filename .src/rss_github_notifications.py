"""Generate an Atom feed for GitHub release notifications."""

from __future__ import annotations

import os
from collections.abc import Iterable
from typing import Any

import requests
from feedgen.feed import FeedGenerator

API_NOTIFICATIONS_URL = "https://api.github.com/notifications"
TOKEN_ENV_VAR = "GITHUB_TOKEN"
REQUEST_TIMEOUT = 10  # seconds


def get_github_token(env_var: str = TOKEN_ENV_VAR) -> str:
    """Return the GitHub token from the environment or raise an error."""
    token = os.getenv(env_var)
    if not token:
        raise ValueError("環境変数 GITHUB_TOKEN が設定されていません。")
    return token


def github_headers(token: str) -> dict[str, str]:
    """Build shared headers for GitHub API requests."""
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def request_json(url: str, headers: dict[str, str]) -> Any:
    """Perform a GET request and return the JSON payload."""
    response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    if response.status_code != 200:
        raise RuntimeError(f"GitHub API Error: {response.status_code} - {response.text}")
    return response.json()


def fetch_notifications(headers: dict[str, str]) -> list[dict[str, Any]]:
    """Fetch GitHub notifications."""
    data = request_json(API_NOTIFICATIONS_URL, headers)
    if not isinstance(data, list):
        raise RuntimeError("GitHub API Error: Unexpected response structure")
    return data


def fetch_release_link(subject_url: str | None, headers: dict[str, str]) -> str:
    """Retrieve the HTML URL for a release subject."""
    if not subject_url:
        return ""
    try:
        release_data = request_json(subject_url, headers)
    except RuntimeError:
        return ""
    return release_data.get("html_url", "")


def extract_release_entries(
    notifications: Iterable[dict[str, Any]], headers: dict[str, str]
) -> list[dict[str, str]]:
    """Build feed entries from release notifications."""
    entries: list[dict[str, str]] = []
    for notification in notifications:
        subject = notification.get("subject") or {}
        if subject.get("type") != "Release":
            continue

        repository = notification.get("repository") or {}
        updated = notification.get("updated_at", "")

        repo_name = repository.get("full_name", "")
        summary = repository.get("description") or ""
        title = subject.get("title", "")
        subject_url = subject.get("url")

        link = fetch_release_link(subject_url, headers)

        entries.append(
            {
                "title": f"[{repo_name}] {title}".strip(),
                "link": link,
                "updated": updated,
                "summary": summary,
            }
        )
    return entries


def build_feed(entries: Iterable[dict[str, str]]) -> FeedGenerator:
    """Create an Atom feed from feed entries."""
    fg = FeedGenerator()
    fg.id("https://github.com/notifications")
    fg.title("Tracking GitHub notifications")
    fg.link(href="https://github.com/notifications", rel="alternate")
    fg.language("en")

    for entry in entries:
        entry_link = entry.get("link", "")
        entry_id = entry_link or entry.get("title", "")

        fe = fg.add_entry()
        fe.id(entry_id)
        fe.title(entry.get("title", ""))
        if entry_link:
            fe.link(href=entry_link)
        fe.updated(entry.get("updated", ""))
        if summary := entry.get("summary"):
            fe.summary(summary)

    return fg


def write_atom_feed(
    feed: FeedGenerator, output_path: str = "./rss/github_notifications.atom"
) -> None:
    """Write the Atom feed to disk."""
    atom_feed = feed.atom_str(pretty=True)
    with open(output_path, "wb") as atom_file:
        atom_file.write(atom_feed)


def generate_feed() -> None:
    """Orchestrate the feed generation process."""
    token = get_github_token()
    headers = github_headers(token)
    notifications = fetch_notifications(headers)
    entries = extract_release_entries(notifications, headers)
    feed = build_feed(entries)
    write_atom_feed(feed)
    print("✅ Atomフィードを 'github_notifications.atom' に出力しました。")


if __name__ == "__main__":
    generate_feed()
