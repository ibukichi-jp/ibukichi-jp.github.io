import json
import sys
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

import vuln_watch as vw

JST = timezone(timedelta(hours=9))
NOW = datetime(2026, 11, 8, 9, 5, tzinfo=JST)


# ==========================================================================
# 深刻度・エスケープ
# ==========================================================================
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("HIGH", "high"),
        ("moderate", "medium"),
        ("Medium", "medium"),
        ("NONE", "low"),
        ("", "unknown"),
        (None, "unknown"),
    ],
)
def test_normalize_severity(raw, expected):
    assert vw.normalize_severity(raw) == expected


def test_escape_md_keeps_version_ranges_and_neutralizes_tags():
    assert vw.escape_md(">= 16.0.0, <= 16.4.0") == ">= 16.0.0, <= 16.4.0"
    assert vw.escape_md("<img src=x onerror=alert(1)>") == "&lt;img src=x onerror=alert(1)>"
    assert vw.escape_md("a | b\nc", table=True) == "a \\| b c"


# ==========================================================================
# 取得元ごとの解析
# ==========================================================================
def test_parse_github_advisories_picks_target_package():
    advisories = [
        {
            "ghsa_id": "GHSA-aaaa-bbbb-cccc",
            "cve_id": None,
            "severity": "critical",
            "summary": "RCE",
            "published_at": "2026-10-22T16:42:00Z",
            "html_url": "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
            "description": "desc",
            "vulnerabilities": [
                {
                    "package": {"name": "next"},
                    "vulnerable_version_range": ">= 16.0.0, <= 16.4.0",
                    "first_patched_version": "16.4.1",
                },
                {
                    "package": {"name": "other"},
                    "vulnerable_version_range": "< 1",
                    "first_patched_version": "1.0.0",
                },
            ],
        }
    ]
    [v] = vw.parse_github_advisories(advisories, "Next.js", "next")
    assert (v.key, v.ident, v.severity) == (
        "GHSA-aaaa-bbbb-cccc",
        "GHSA-aaaa-bbbb-cccc",
        "critical",
    )
    assert v.fixed == ["16.4.1"] and v.affected == ">= 16.0.0, <= 16.4.0"


CORE_INDEX = {
    "1": {
        "cve": ["CVE-2026-1"],
        "ref": "https://nodejs.org/en/blog/vulnerability/oct",
        "severity": "high",
        "description": "Brotli OOB write",
        "overview": "details",
        "vulnerable": "22.x || 24.x",
        "patched": "^22.23.4 || ^24.22.1",
    },
    "2": {
        "cve": ["CVE-2025-9"],
        "ref": "https://nodejs.org/en/blog/vulnerability/old",
        "severity": "low",
        "description": "old one",
        "vulnerable": "20.x",
        "patched": "^20.1.0",
    },
}


def test_parse_node_release_lists_only_this_release_cves():
    pub = datetime(2026, 10, 21, 22, 0, tzinfo=UTC)
    items = vw.parse_node_release(
        "Node.js",
        "Wednesday, October 21, 2026 Security Releases",
        "https://nodejs.org/en/blog/vulnerability/oct",
        pub,
        "fixes CVE-2026-1 ... previously CVE-2025-9",
        CORE_INDEX,
    )
    assert [v.key for v in items] == ["node:CVE-2026-1"]  # 過去のリリースの CVE は除外
    v = items[0]
    assert (
        v.fixed == ["22.23.4", "24.22.1"] and v.affected == "22.x / 24.x" and v.severity == "high"
    )
    assert (
        not v.date_only and v.published == pub.isoformat()
    )  # リリースと同時の記事は記事の公開日時


def test_parse_node_pre_announcement():
    pub = datetime(2026, 11, 3, 23, 0, tzinfo=UTC)
    text = (
        "The Node.js project will release new versions of the 26.x, 24.x, 22.x releases lines on or shortly after "
        "Wednesday, November 11, 2026 in order to address: The highest severity issue fixed in this release is HIGH."
    )
    [v] = vw.parse_node_release(
        "Node.js",
        "Wednesday, November 11, 2026 Security Releases",
        "https://nodejs.org/en/blog/vulnerability/nov/",
        pub,
        text,
        CORE_INDEX,
    )
    assert v.key == "node-announce:https://nodejs.org/en/blog/vulnerability/nov"
    assert (v.severity, v.ident, v.affected) == ("high", "", "26.x, 24.x, 22.x")
    assert v.fixed == ["2026/11/11 リリース予定"]


def test_parse_node_release_after_pre_announcement_uses_release_date():
    """予告記事がリリース時に更新された場合は、リリース日（日付のみ）を使う"""
    pub = datetime(2026, 11, 3, 23, 0, tzinfo=UTC)
    index = {
        "3": {
            "cve": ["CVE-2026-3"],
            "ref": "https://nodejs.org/en/blog/vulnerability/nov",
            "severity": "medium",
            "description": "x",
            "vulnerable": "22.x",
            "patched": "^22.24.0",
        }
    }
    [v] = vw.parse_node_release(
        "Node.js",
        "Wednesday, November 11, 2026 Security Releases",
        "https://nodejs.org/en/blog/vulnerability/nov",
        pub,
        "CVE-2026-3",
        index,
    )
    assert v.date_only and vw.format_published(v) == "2026/11/11"


def test_parse_cve_record_and_psf_advisory():
    record = {
        "cveMetadata": {"datePublished": "2026-10-24T14:15:00Z"},
        "containers": {
            "cna": {
                "title": "Distrust compromised certificates",
                "metrics": [{"cvssV4_0": {"baseSeverity": "CRITICAL", "baseScore": 9.4}}],
                "affected": [
                    {
                        "versions": [
                            {"version": "0", "lessThan": "3.11.18", "status": "affected"},
                            {"version": "3.12.0", "lessThan": "3.12.16", "status": "affected"},
                            {"version": "3.13.0", "status": "unaffected"},
                        ]
                    }
                ],
            }
        },
    }
    info = vw.parse_cve_record(record)
    assert info["severity"] == "critical" and info["fixed"] == ["3.11.18", "3.12.16"]
    assert info["affected"] == "3.11.18 未満 / 3.12.0〜3.12.16 未満"

    advisory = {
        "id": "PSF-2026-46",
        "aliases": ["CVE-2026-115557"],
        "details": "ssl ...",
        "references": [{"type": "ADVISORY", "url": "https://mail.python.org/x"}],
    }
    v = vw.parse_psf_advisory("Python", advisory, info)
    assert (v.key, v.ident, v.url, v.title) == (
        "PSF-2026-46",
        "CVE-2026-115557",
        "https://mail.python.org/x",
        "Distrust compromised certificates",
    )


DJANGO_FEED = """<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<item><title>Planned leave</title><link>https://www.djangoproject.com/weblog/x/</link>
<pubDate>Mon, 26 Oct 2026 12:00:00 -0500</pubDate><description>nothing</description></item>
<item><title>Django security releases issued: 6.1.3, 6.0.10, and 5.2.19</title>
<link>https://www.djangoproject.com/weblog/2026/nov/03/security-releases/</link>
<pubDate>Tue, 03 Nov 2026 09:30:00 -0600</pubDate>
<description>&lt;p&gt;intro&lt;/p&gt;
&lt;h2&gt;CVE-2026-111362: Server-side request forgery via crs&lt;/h2&gt;&lt;p&gt;This issue has severity "moderate" according to the policy.&lt;/p&gt;
&lt;h2&gt;CVE-2026-113733: Password hash disclosure&lt;/h2&gt;&lt;p&gt;This issue has severity "low" according to the policy.&lt;/p&gt;
&lt;h2&gt;Affected supported versions&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Django main&lt;/li&gt;&lt;li&gt;Django 6.1&lt;/li&gt;&lt;li&gt;Django 5.2&lt;/li&gt;&lt;/ul&gt;
&lt;h2&gt;Resolution&lt;/h2&gt;&lt;p&gt;Patches&lt;/p&gt;
&lt;h3&gt;CVE-2026-111362: Server-side request forgery via crs&lt;/h3&gt;&lt;p&gt;On the main branch&lt;/p&gt;
</description></item>
</channel></rss>"""


def test_parse_django_feed():
    items = vw.parse_django_feed("Django", DJANGO_FEED)
    assert [(v.ident, v.severity) for v in items] == [
        ("CVE-2026-111362", "medium"),
        ("CVE-2026-113733", "low"),
    ]
    v = items[0]
    assert v.fixed == ["6.1.3", "6.0.10", "5.2.19"] and v.affected == "main / 6.1 / 5.2"
    assert vw.format_published(v) == "2026/11/04 00:30"  # JST


# ==========================================================================
# AI 応答の解釈
# ==========================================================================
def test_parse_ai_response():
    assert vw.parse_ai_response('```json\n{"title_ja": "タイトル", "summary_ja": "要約"}\n```') == {
        "title_ja": "タイトル",
        "summary_ja": "要約",
    }
    assert vw.parse_ai_response("JSON ではない") is None
    assert vw.parse_ai_response('{"title_ja": 1, "summary_ja": "x"}') is None


# ==========================================================================
# check の全体の流れ
# ==========================================================================
@pytest.fixture
def workspace(tmp_path, monkeypatch):
    config = tmp_path / "watch.toml"
    config.write_text(
        'min_severity = "medium"\n[[targets]]\nname = "Next.js"\nsource = "fake"\n',
        encoding="utf-8",
    )
    feed: list[vw.Vuln] = []
    monkeypatch.setitem(vw.SOURCES, "fake", lambda http, target, seen, bootstrap: list(feed))
    kwargs = dict(
        config_path=config,
        state_path=tmp_path / "seen.json",
        report_dir=tmp_path / "vulnerabilities",
        http=object(),
        api_key=None,
    )
    return tmp_path, feed, kwargs


def make(key, severity="high", published="2026-11-07T10:00:00Z"):
    return vw.Vuln(
        key=key,
        tech="Next.js",
        severity=severity,
        ident=key,
        title=f"title {key}",
        published=published,
        fixed=["16.4.1"],
        url="https://example.com",
    )


def test_first_run_only_records_existing_items(workspace):
    tmp, feed, kwargs = workspace
    feed += [make("GHSA-old-1"), make("GHSA-old-2")]

    code, report = vw.run_check(now=NOW, **kwargs)

    assert (code, report) == (0, None)
    state = json.loads((tmp / "seen.json").read_text(encoding="utf-8"))
    assert set(state["seen"]) == {"GHSA-old-1", "GHSA-old-2"} and state["initialized_targets"] == [
        "Next.js"
    ]
    assert not (tmp / "vulnerabilities").exists()


def test_new_items_create_report_and_index(workspace):
    tmp, feed, kwargs = workspace
    feed.append(make("GHSA-old"))
    vw.run_check(now=NOW, **kwargs)  # 初回（既読にするだけ）

    feed += [
        make("GHSA-new-critical", "critical"),
        make("GHSA-new-low", "low"),
        make("GHSA-new-unknown", "unknown"),
    ]
    code, report = vw.run_check(now=NOW, **kwargs)

    assert (code, report) == (0, "2026/2026-11-08.md")
    md = (tmp / "vulnerabilities" / report).read_text(encoding="utf-8")
    assert "GHSA-new-critical" in md and "GHSA-new-unknown" in md  # 深刻度不明は常に載せる
    assert "GHSA-new-low" not in md and "GHSA-old" not in md  # 基準未満・既読は載せない
    index = json.loads((tmp / "vulnerabilities" / "index.json").read_text(encoding="utf-8"))
    assert index["reports"][0] == {
        "date": "2026-11-08",
        "path": "2026/2026-11-08.md",
        "generated_at": "2026-11-08T09:05:00+09:00",
        "count": 2,
        "counts": {"critical": 1, "unknown": 1},
        "techs": ["Next.js"],
    }
    # 基準未満のものも既読になり、翌日以降に再び出てこない
    state = json.loads((tmp / "seen.json").read_text(encoding="utf-8"))
    assert "GHSA-new-low" in state["seen"]

    # 同じ日にもう一度実行しても、新規がなければレポートは作らない
    assert vw.run_check(now=NOW, **kwargs) == (0, None)
    # 同じ日に新規が出たら別ファイルにする
    feed.append(make("GHSA-later"))
    assert vw.run_check(now=NOW, **kwargs)[1] == "2026/2026-11-08-2.md"


def test_failing_source_is_retried_next_time(workspace, monkeypatch):
    tmp, feed, kwargs = workspace

    def boom(*args):
        raise RuntimeError("network down")

    monkeypatch.setitem(vw.SOURCES, "fake", boom)
    code, report = vw.run_check(now=NOW, **kwargs)
    assert (code, report) == (1, None)
    state = json.loads((tmp / "seen.json").read_text(encoding="utf-8"))
    assert state["initialized_targets"] == []  # 初回扱いのまま、次回にやり直す


# ==========================================================================
# 通知
# ==========================================================================
def test_build_discord_message():
    entry = {
        "date": "2026-11-08",
        "path": "2026/2026-11-08.md",
        "count": 3,
        "counts": {"critical": 1, "high": 2},
        "techs": ["Next.js", "Python"],
    }
    message = vw.build_discord_message(entry, published=True)
    assert message.splitlines() == [
        "🛡️ 脆弱性レポート（2026/11/08）を作成しました",
        "新規 3件：🔴 Critical 1 ／ 🟠 High 2",
        "対象: Next.js, Python",
        "https://ibukichi-jp.github.io/vulnerabilities/?report=2026/2026-11-08",
    ]
    assert "反映に時間" in vw.build_discord_message(entry, published=False)


def test_run_notify_waits_for_pages_then_posts(tmp_path, monkeypatch):
    report_dir = tmp_path / "vulnerabilities"
    vw.write_json(
        report_dir / "index.json",
        {
            "reports": [
                {
                    "date": "2026-11-08",
                    "path": "2026/2026-11-08.md",
                    "count": 1,
                    "counts": {"high": 1},
                    "techs": ["Django"],
                }
            ]
        },
    )
    waited, posted = [], []
    monkeypatch.setattr(vw, "wait_for_url", lambda url, **kw: waited.append(url) or True)

    class Res:
        ok, status_code = True, 204

    monkeypatch.setattr(
        vw.requests, "post", lambda url, json, timeout: posted.append((url, json)) or Res()
    )

    assert (
        vw.run_notify(
            "2026/2026-11-08.md", report_dir=report_dir, webhook_url="https://discord.example/hook"
        )
        == 0
    )
    assert waited == ["https://ibukichi-jp.github.io/vulnerabilities/2026/2026-11-08.md"]
    assert posted[0][0] == "https://discord.example/hook"
    assert "?report=2026/2026-11-08" in posted[0][1]["content"]
    assert vw.run_notify("2026/unknown.md", report_dir=report_dir, webhook_url="https://x") == 1


def test_enrich_with_ai_uses_response_and_survives_failures(monkeypatch):
    """AI の要約が入ること、AI が失敗しても処理が止まらないことのテスト"""
    import types

    replies = iter(
        [
            '{"title_ja": "未認証RCE", "summary_ja": "16.4.1 に更新してください。"}',
            RuntimeError("timeout"),
        ]
    )
    prompts = []

    class FakeClient:
        def __init__(self, **kwargs):
            self.chat = types.SimpleNamespace(completions=self)

        def create(self, **kwargs):
            prompts.append(kwargs["messages"][1]["content"])
            reply = next(replies)
            if isinstance(reply, Exception):
                raise reply
            msg = types.SimpleNamespace(content=reply)
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=msg)])

    monkeypatch.setitem(sys.modules, "openai", types.SimpleNamespace(OpenAI=FakeClient))
    ok, failed = make("GHSA-1", "critical"), make("GHSA-2")
    vw.enrich_with_ai([ok, failed], api_key="dummy")

    assert (ok.title_ja, ok.summary_ja) == ("未認証RCE", "16.4.1 に更新してください。")
    assert (failed.title_ja, failed.summary_ja) == ("", "")
    assert "16.4.1" in prompts[0] and "GHSA-1" in prompts[0]  # 公式情報が材料として渡っている
    md = vw.render_report([ok, failed], NOW, ["Next.js"])
    assert "🔴 未認証RCE" in md and "原文タイトル**: title GHSA-1" in md
    assert "AI による要約はありません" in md  # 失敗した分は公式情報の確認を促す
