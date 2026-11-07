import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

import blog_feed
from blog_feed import (
    enlarge_blogger_thumbnail,
    html_to_text,
    make_excerpt,
    parse_entries,
    write_blog_data,
)

SAMPLE_FEED = """<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom'>
  <title type='text'>いぶきちブログ</title>
  <entry>
    <id>tag:blogger.com,1999:blog-1.post-2</id>
    <published>2026-11-01T19:08:00.000+09:00</published>
    <updated>2026-11-03T19:10:10.730+09:00</updated>
    <title type='text'>GitHubとClaudeのサブスクを始めた</title>
    <content type='html'>&lt;p&gt;今月から&amp;amp;サブスクを始めた。&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;p&gt;二段落目&lt;br/&gt;改行&lt;/p&gt;</content>
    <link rel='edit' type='application/atom+xml' href='https://www.blogger.com/feeds/1/posts/default/2'/>
    <link rel='alternate' type='text/html' href='https://blog.ibukichi.jp/2026/11/githubclaude.html' title='x'/>
    <media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="https://blogger.googleusercontent.com/img/b/R29v/AVvX/s72-c/image.png" height="72" width="72"/>
  </entry>
  <entry>
    <title type='text'>2番目の記事</title>
    <link rel='alternate' type='text/html' href='https://blog.ibukichi.jp/2.html'/>
  </entry>
  <entry>
    <title type='text'>3番目の記事</title>
    <link rel='alternate' type='text/html' href='https://blog.ibukichi.jp/3.html'/>
  </entry>
  <entry>
    <title type='text'>4番目の記事</title>
    <link rel='alternate' type='text/html' href='https://blog.ibukichi.jp/4.html'/>
  </entry>
</feed>
"""


def test_parse_entries_returns_latest_three_in_order():
    """新しい順に直近3件だけが取り出されるテスト"""
    posts = parse_entries(SAMPLE_FEED)
    assert [p["title"] for p in posts] == [
        "GitHubとClaudeのサブスクを始めた",
        "2番目の記事",
        "3番目の記事",
    ]


def test_parse_entries_respects_limit():
    assert len(parse_entries(SAMPLE_FEED, limit=1)) == 1


def test_parse_entries_formats_fields():
    """各項目（本文の抜粋・サムネイル等）が整形されるテスト"""
    entry = parse_entries(SAMPLE_FEED)[0]

    assert entry == {
        "title": "GitHubとClaudeのサブスクを始めた",
        "url": "https://blog.ibukichi.jp/2026/11/githubclaude.html",
        "published": "2026-11-01T19:08:00.000+09:00",
        "updated": "2026-11-03T19:10:10.730+09:00",
        "excerpt": "今月から&サブスクを始めた。 二段落目 改行",
        "thumbnail": "https://blogger.googleusercontent.com/img/b/R29v/AVvX/w640-h360-c/image.png",
    }


def test_parse_entries_without_entries_returns_empty():
    """記事が無いフィードでは空リストが返るテスト"""
    xml = "<feed xmlns='http://www.w3.org/2005/Atom'><title>empty</title></feed>"
    assert parse_entries(xml) == []


def test_parse_entries_without_thumbnail_and_with_summary():
    """サムネイルなし・content の代わりに summary の記事も扱えるテスト"""
    xml = """<feed xmlns='http://www.w3.org/2005/Atom'><entry>
      <title>要約のみ</title><summary type='html'>短い要約</summary>
      <link rel='alternate' href='https://blog.ibukichi.jp/a.html'/>
    </entry></feed>"""
    entry = parse_entries(xml)[0]
    assert entry["excerpt"] == "短い要約"
    assert entry["thumbnail"] == ""


def test_parse_entries_missing_url_raises():
    """記事URLが無い場合はエラーになるテスト"""
    xml = "<feed xmlns='http://www.w3.org/2005/Atom'><entry><title>t</title></entry></feed>"
    with pytest.raises(ValueError):
        parse_entries(xml)


def test_html_to_text_strips_tags_and_scripts():
    assert html_to_text("<p>A&amp;B</p><style>p{}</style><p>C</p>") == "A&B C"


def test_make_excerpt_truncates_with_ellipsis():
    assert make_excerpt("あいうえお", 3) == "あいう…"
    assert make_excerpt("あいう", 3) == "あいう"


@pytest.mark.parametrize(
    ("src", "expected"),
    [
        (
            "https://x.googleusercontent.com/img/a/b/s72-c/p.png",
            "https://x.googleusercontent.com/img/a/b/w640-h360-c/p.png",
        ),
        (
            "https://x.googleusercontent.com/img/a/b/w100-h50-p-k-no-nu/p.png",
            "https://x.googleusercontent.com/img/a/b/w640-h360-c/p.png",
        ),
        ("https://example.com/no-size/p.png", "https://example.com/no-size/p.png"),
        ("", ""),
    ],
)
def test_enlarge_blogger_thumbnail(src, expected):
    assert enlarge_blogger_thumbnail(src) == expected


def test_write_blog_data_is_deterministic(tmp_path):
    """同じ記事なら毎回同じ内容が書き出される（不要なコミットが発生しない）テスト"""
    posts = parse_entries(SAMPLE_FEED)
    out = tmp_path / "sub" / "blog.json"

    write_blog_data(posts, str(out))
    first = out.read_bytes()
    write_blog_data(posts, str(out))

    assert out.read_bytes() == first
    assert len(json.loads(first)["posts"]) == 3


def test_main_keeps_existing_file_on_failure(tmp_path, monkeypatch):
    """取得に失敗した場合は既存ファイルを上書きせず終了コード1になるテスト"""
    out = tmp_path / "blog.json"
    out.write_text('{"posts": [{"title": "前回の記事"}]}\n', encoding="utf-8")
    monkeypatch.setattr(blog_feed, "OUTPUT_PATH", str(out))

    with patch("blog_feed.fetch_feed", side_effect=RuntimeError("network down")):
        assert blog_feed.main() == 1

    assert json.loads(out.read_text(encoding="utf-8"))["posts"][0]["title"] == "前回の記事"
