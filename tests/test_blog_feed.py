import io
import json
import sys
import urllib.error
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


# --- URL の制限 ------------------------------------------------------------


@pytest.mark.parametrize(
    "url, allowed",
    [
        ("https://blog.ibukichi.jp/2026/11/a.html", True),
        ("https://BLOG.ibukichi.jp/a.html", True),
        ("http://blog.ibukichi.jp/a.html", False),
        ("https://blog.ibukichi.jp./a.html", False),
        ("https://blog.ibukichi.jp:8443/a.html", False),
        ("https://blog.ibukichi.jp:443/a.html", False),
        ("https://:@blog.ibukichi.jp/a.html", False),
        ("https://[::1/a.html", False),
        ("https://blog.ibukichi.jp:99999/a.html", False),
        ("https://evil.example/a.html", False),
        ("https://blog.ibukichi.jp.evil.example/a.html", False),
        ("https://user@blog.ibukichi.jp/a.html", False),
        ("javascript:alert(1)", False),
        ("", False),
    ],
)
def test_is_allowed_post_url(url, allowed):
    assert blog_feed.is_allowed_post_url(url) is allowed


@pytest.mark.parametrize(
    "url, allowed",
    [
        ("https://blogger.googleusercontent.com/img/b/x/w640-h360-c/p.png", True),
        ("https://1.bp.blogspot.com/x/w640-h360-c/p.png", True),
        ("http://blogger.googleusercontent.com/img/p.png", False),
        ("https://evil.example/p.png", False),
        ("https://blogger.googleusercontent.com.evil.example/p.png", False),
        ("https://bp.blogspot.com.evil.example/p.png", False),
        ("", False),
    ],
)
def test_is_allowed_thumbnail_url(url, allowed):
    assert blog_feed.is_allowed_thumbnail_url(url) is allowed


def test_parse_entries_rejects_unexpected_post_url():
    """記事の URL がブログ以外のホストなら、データを書き換えずに失敗させる"""
    xml = """<feed xmlns='http://www.w3.org/2005/Atom'><entry>
      <title>t</title><link rel='alternate' href='https://evil.example/a.html'/>
    </entry></feed>"""
    with pytest.raises(ValueError, match="想定外の記事URL"):
        parse_entries(xml)


def test_parse_entries_drops_unexpected_thumbnail():
    """サムネイルが Blogger の画像サーバー以外なら、サムネイルだけを空にする"""
    xml = """<feed xmlns='http://www.w3.org/2005/Atom' xmlns:media='http://search.yahoo.com/mrss/'>
      <entry>
        <title>t</title><link rel='alternate' href='https://blog.ibukichi.jp/a.html'/>
        <media:thumbnail url='https://evil.example/s72-c/p.png'/>
      </entry></feed>"""
    assert parse_entries(xml)[0]["thumbnail"] == ""


# --- 依存パッケージ ----------------------------------------------------------


def test_blog_feed_uses_only_standard_library():
    """CI では python3 -I で実行するため、標準ライブラリ以外を import していないことを確かめる"""
    import ast

    source = Path(blog_feed.__file__).read_text(encoding="utf-8")
    imported: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            imported.add(node.module.split(".")[0])

    non_stdlib = imported - sys.stdlib_module_names - {"__future__"}
    assert non_stdlib == set()


# --- フィードの取得（urllib） -------------------------------------------------


class FakeResponse(io.BytesIO):
    def __init__(self, body: bytes, status=200, url=blog_feed.BLOG_FEED_URL, charset="utf-8"):
        super().__init__(body)
        self.status = status
        self._url = url
        self.headers = type("H", (), {"get_content_charset": lambda _self: charset})()

    def geturl(self):
        return self._url


def _urlopen_returning(response):
    def fake_urlopen(req, timeout):
        assert req.get_header("User-agent") == blog_feed.USER_AGENT
        assert timeout == blog_feed.REQUEST_TIMEOUT
        return response

    return fake_urlopen


def test_fetch_feed_decodes_with_declared_charset():
    body = SAMPLE_FEED.encode("euc_jp", errors="ignore")
    with patch(
        "blog_feed.urllib.request.urlopen", _urlopen_returning(FakeResponse(body, charset="euc_jp"))
    ):
        assert "2番目の記事" in blog_feed.fetch_feed()


def test_fetch_feed_defaults_to_utf8():
    body = SAMPLE_FEED.encode("utf-8")
    with patch(
        "blog_feed.urllib.request.urlopen", _urlopen_returning(FakeResponse(body, charset=None))
    ):
        assert "2番目の記事" in blog_feed.fetch_feed()


def test_fetch_feed_rejects_non_200():
    with (
        patch(
            "blog_feed.urllib.request.urlopen", _urlopen_returning(FakeResponse(b"", status=204))
        ),
        pytest.raises(RuntimeError, match="HTTP 204"),
    ):
        blog_feed.fetch_feed()


def test_fetch_feed_rejects_redirect_to_other_host():
    response = FakeResponse(b"<feed/>", url="http://evil.example/feed")
    with (
        patch("blog_feed.urllib.request.urlopen", _urlopen_returning(response)),
        pytest.raises(RuntimeError, match="リダイレクト"),
    ):
        blog_feed.fetch_feed()


def test_fetch_feed_rejects_too_large(monkeypatch):
    monkeypatch.setattr(blog_feed, "MAX_FEED_BYTES", 10)
    with (
        patch("blog_feed.urllib.request.urlopen", _urlopen_returning(FakeResponse(b"x" * 11))),
        pytest.raises(RuntimeError, match="大きすぎます"),
    ):
        blog_feed.fetch_feed()


def test_main_returns_1_on_http_error(tmp_path, monkeypatch):
    """HTTP エラーでも既存ファイルを書き換えずに終了コード 1 を返す"""
    out = tmp_path / "blog.json"
    out.write_text("old", encoding="utf-8")
    monkeypatch.setattr(blog_feed, "OUTPUT_PATH", str(out))
    error = urllib.error.HTTPError(blog_feed.BLOG_FEED_URL, 503, "unavailable", None, None)
    with patch("blog_feed.urllib.request.urlopen", side_effect=error):
        assert blog_feed.main() == 1
    assert out.read_text(encoding="utf-8") == "old"


# --- ログ出力 ---------------------------------------------------------------


def test_for_log_removes_line_breaks_and_control_chars():
    text = "title\n::warning::fake\r\u2028x\x00y"
    logged = blog_feed.for_log(text)
    assert "\n" not in logged and "\r" not in logged and "\u2028" not in logged
    assert "\x00" not in logged
    assert logged.startswith("title ::warning::fake")


def test_main_logs_titles_on_one_line(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(blog_feed, "OUTPUT_PATH", str(tmp_path / "blog.json"))
    posts = [{"title": "a\n::error::injected", "url": "https://blog.ibukichi.jp/a.html"}]
    with (
        patch("blog_feed.parse_entries", return_value=posts),
        patch("blog_feed.fetch_feed", return_value=""),
    ):
        assert blog_feed.main() == 0
    out = capsys.readouterr().out
    assert not any(line.startswith("::") for line in out.splitlines())
