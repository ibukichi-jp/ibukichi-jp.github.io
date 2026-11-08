"""Generate an Atom feed for GitHub release notifications."""

from __future__ import annotations

import os
import re
import sys
import xml.etree.ElementTree as ET
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

sys.path.insert(0, str(Path(__file__).resolve().parent))

from github_api import decode_json, github_request  # noqa: E402
from github_api import github_headers as _github_headers  # noqa: E402

API_NOTIFICATIONS_URL = "https://api.github.com/notifications"
TOKEN_ENV_VAR = "GITHUB_TOKEN"
REQUEST_TIMEOUT = 10  # seconds

ATOM_NS: Final[str] = "http://www.w3.org/2005/Atom"
XML_NS: Final[str] = "http://www.w3.org/XML/1998/namespace"
ET.register_namespace("", ATOM_NS)

# XML 1.0 で使えない文字（制御文字など）。ElementTree はエスケープせずに書き出すため、取り除く
_INVALID_XML_CHARS: Final[re.Pattern[str]] = re.compile(
    "[^\t\n\r\x20-\ud7ff\ue000-\ufffd\U00010000-\U0010ffff]"
)


def get_github_token(env_var: str = TOKEN_ENV_VAR) -> str:
    """Return the GitHub token from the environment or raise an error."""
    token = os.getenv(env_var)
    if not token:
        raise ValueError("環境変数 GITHUB_TOKEN が設定されていません。")
    return token


def github_headers(token: str) -> dict[str, str]:
    """Build shared headers for GitHub API requests."""
    return _github_headers(token)


def request_json(url: str, headers: dict[str, str]) -> Any:
    """Perform a GET request and return the JSON payload."""
    status, body = github_request(url, headers, "GET", REQUEST_TIMEOUT)
    if status != 200:
        text = body.decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API Error: {status} - {text}")
    return decode_json(body)


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
    except (RuntimeError, ValueError, OSError):
        # 1件の取得失敗でフィード全体を止めない（リンクのないエントリは build_feed で飛ばす）
        # ValueError: JSON の読み取り失敗や api.github.com 以外の URL
        # OSError: 接続エラーやタイムアウト（urllib.error.URLError, TimeoutError）
        return ""
    if not isinstance(release_data, dict):
        return ""
    html_url = release_data.get("html_url")
    if not isinstance(html_url, str) or not html_url.startswith("https://"):
        return ""
    return html_url


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


def _atom(tag: str) -> str:
    return f"{{{ATOM_NS}}}{tag}"


def _clean(text: str) -> str:
    return _INVALID_XML_CHARS.sub("", text)


def _add_text(parent: ET.Element, tag: str, text: str) -> None:
    ET.SubElement(parent, _atom(tag)).text = _clean(text)


def _format_updated(value: str) -> str:
    """Normalize an ISO 8601 timestamp (e.g. ``2026-10-14T17:48:10Z``) for Atom."""
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.isoformat()


def build_feed(entries: Iterable[dict[str, str]]) -> ET.ElementTree:
    """Create an Atom feed from feed entries.

    Entries without a link are skipped because Atom requires an alternate link
    (or content) for each entry. Entries whose ``updated`` is not a valid ISO 8601
    timestamp are also skipped. Entries are written in reverse order, matching
    the previous feedgen-based output.
    """
    feed = ET.Element(_atom("feed"), {f"{{{XML_NS}}}lang": "en"})
    _add_text(feed, "id", "https://github.com/notifications")
    _add_text(feed, "title", "Tracking GitHub notifications")
    _add_text(feed, "updated", datetime.now(UTC).isoformat())
    ET.SubElement(
        feed, _atom("link"), {"href": "https://github.com/notifications", "rel": "alternate"}
    )

    for entry in reversed(list(entries)):
        entry_link = _clean(entry.get("link", ""))
        if not entry_link:
            continue
        try:
            updated = _format_updated(entry.get("updated", ""))
        except ValueError:
            continue

        element = ET.SubElement(feed, _atom("entry"))
        _add_text(element, "id", entry_link)
        _add_text(element, "title", entry.get("title", ""))
        _add_text(element, "updated", updated)
        ET.SubElement(element, _atom("link"), {"href": entry_link})
        if summary := entry.get("summary"):
            _add_text(element, "summary", summary)

    ET.indent(feed)
    return ET.ElementTree(feed)


def atom_bytes(feed: ET.ElementTree) -> bytes:
    """Serialize the Atom feed as UTF-8 XML."""
    return ET.tostring(feed.getroot(), encoding="UTF-8", xml_declaration=True) + b"\n"


def write_atom_feed(
    feed: ET.ElementTree, output_path: str = "./rss/github_notifications.atom"
) -> None:
    """Write the Atom feed to disk."""
    with open(output_path, "wb") as atom_file:
        atom_file.write(atom_bytes(feed))


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
