"""Fetch the latest posts from the blog's Atom feed and save them for the dashboard.

ブログ（Blogger）の Atom フィードから直近の記事（POST_COUNT 件）を取得し、
ダッシュボード表示用に .data/blog.json へ保存する。

- 標準の Atom フィードを使うため、ブログの移転時も BLOG_FEED_URL の差し替えだけで済む
- 取得時刻などの毎回変わる値は書き出さない（記事が変わったときだけ git の差分が出る）
- 取得・解析に失敗した場合は既存ファイルを上書きせずに終了コード 1 で終わる
"""

from __future__ import annotations

import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from typing import Any

import requests

POST_COUNT = 3  # 保存する記事数（最新を含む直近 N 件）
BLOG_FEED_URL = f"https://blog.ibukichi.jp/feeds/posts/default?max-results={POST_COUNT}"
OUTPUT_PATH = ".data/blog.json"
REQUEST_TIMEOUT = 10  # seconds
EXCERPT_LENGTH = 120  # 抜粋の最大文字数
THUMBNAIL_SIZE = "w640-h360-c"  # Blogger 画像URLのサイズ指定（16:9 で切り抜き）

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "media": "http://search.yahoo.com/mrss/",
}

# Blogger 画像URL内のサイズ指定部分（例: /s72-c/ や /w640-h360-c/）
_BLOGGER_SIZE_RE = re.compile(r"/(?:s\d+|w\d+-h\d+)(?:-[a-z0-9]+)*/(?=[^/]+$)")


class _TextExtractor(HTMLParser):
    """HTML からテキストだけを取り出す（script/style の中身は除外）。"""

    _SKIP_TAGS = {"script", "style"}
    _BLOCK_TAGS = {"p", "br", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._SKIP_TAGS:
            self._skip_depth += 1
        elif tag in self._BLOCK_TAGS:
            self._parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag in self._BLOCK_TAGS:
            self._parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            self._parts.append(data)

    def text(self) -> str:
        return re.sub(r"\s+", " ", "".join(self._parts)).strip()


def html_to_text(html: str) -> str:
    """HTML 文字列をプレーンテキストに変換する。"""
    parser = _TextExtractor()
    parser.feed(html or "")
    parser.close()
    return parser.text()


def make_excerpt(text: str, length: int = EXCERPT_LENGTH) -> str:
    """指定文字数で切り詰めた抜粋を返す。"""
    if len(text) <= length:
        return text
    return text[:length].rstrip() + "…"


def enlarge_blogger_thumbnail(url: str, size: str = THUMBNAIL_SIZE) -> str:
    """Blogger の小さなサムネイルURL（/s72-c/）を表示用サイズに差し替える。"""
    if not url:
        return ""
    return _BLOGGER_SIZE_RE.sub(f"/{size}/", url, count=1)


def fetch_feed(url: str = BLOG_FEED_URL) -> str:
    """Atom フィードを取得して XML 文字列を返す。"""
    response = requests.get(url, timeout=REQUEST_TIMEOUT)
    if response.status_code != 200:
        raise RuntimeError(f"フィードの取得に失敗しました: HTTP {response.status_code}")
    response.encoding = "utf-8"
    return response.text


def _text(entry: ET.Element, tag: str) -> str:
    node = entry.find(tag, NS)
    return (node.text or "").strip() if node is not None else ""


def parse_entry(entry: ET.Element) -> dict[str, Any]:
    """Atom の entry 要素1件を表示用の辞書に変換する。"""
    url = ""
    for link in entry.findall("atom:link", NS):
        if link.get("rel") == "alternate" and link.get("href"):
            url = link.get("href", "")
            break

    body_html = _text(entry, "atom:content") or _text(entry, "atom:summary")

    thumbnail_node = entry.find("media:thumbnail", NS)
    thumbnail = thumbnail_node.get("url", "") if thumbnail_node is not None else ""

    title = _text(entry, "atom:title")
    if not title or not url:
        raise ValueError("記事のタイトルまたはURLが取得できませんでした。")

    return {
        "title": title,
        "url": url,
        "published": _text(entry, "atom:published"),
        "updated": _text(entry, "atom:updated"),
        "excerpt": make_excerpt(html_to_text(body_html)),
        "thumbnail": enlarge_blogger_thumbnail(thumbnail),
    }


def parse_entries(xml_text: str, limit: int = POST_COUNT) -> list[dict[str, Any]]:
    """Atom フィードから新しい順に最大 limit 件の記事を取り出す。"""
    root = ET.fromstring(xml_text)
    return [parse_entry(entry) for entry in root.findall("atom:entry", NS)[:limit]]


def write_blog_data(posts: list[dict[str, Any]], output_path: str = OUTPUT_PATH) -> None:
    """記事データを JSON として保存する（内容が同じなら出力も同一になる）。"""
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"posts": posts}, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main() -> int:
    try:
        posts = parse_entries(fetch_feed())
        if not posts:
            raise RuntimeError("フィードに記事がありません。")
        write_blog_data(posts, OUTPUT_PATH)
        print(f"直近 {len(posts)} 件の記事を {OUTPUT_PATH} に保存しました:")
        for post in posts:
            print(f"  - {post['title']}")
        return 0
    except Exception as e:
        print(f"ブログフィードの処理に失敗しました（既存データは保持）: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
