"""Watch official vulnerability sources for selected technologies and write daily reports.

指定した技術（.data/vuln_watchlist.toml）の脆弱性情報を、各プロジェクトの公式発表から取得し、
新しく出たものを Markdown のレポート（vulnerabilities/YYYY/YYYY-MM-DD.md）にまとめる。

サブコマンド:
  check   取得 → 新規分の AI 要約 → レポート作成 → 既読の記録（.data/vuln_seen.json）
  notify  GitHub Pages への反映を待ってから、レポート作成を Discord に通知する

方針:
- 脆弱性を「探す」のは公式データ（AI は使わない）。AI は取得した公式情報の日本語要約だけを行う
- 深刻度・バージョンもプログラムで公式データから読み取る
- 一度記録したものは二度とレポートに載せない。技術を追加した直後は既存分を既読にするだけ
- 新しい脆弱性がない日はレポートを作らない
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
import tomllib
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

import requests

JST = timezone(timedelta(hours=9))
CONFIG_PATH = Path(".data/vuln_watchlist.toml")
STATE_PATH = Path(".data/vuln_seen.json")
REPORT_DIR = Path("vulnerabilities")
INDEX_PATH = REPORT_DIR / "index.json"
SITE_URL = "https://ibukichi-jp.github.io"
REQUEST_TIMEOUT = 30
USER_AGENT = "ibukichi-jp-vuln-watch (+https://github.com/ibukichi-jp/ibukichi-jp.github.io)"

NODE_FEED_URL = "https://nodejs.org/en/feed/vulnerability.xml"
NODE_CORE_INDEX_URL = (
    "https://raw.githubusercontent.com/nodejs/security-wg/main/vuln/core/index.json"
)
NODE_FEED_ITEMS = 3  # 直近いくつのセキュリティリリース記事を確認するか
GITHUB_ADVISORIES_URL = "https://api.github.com/advisories"
PSF_LISTING_URL = "https://api.github.com/repos/psf/advisory-database/contents/advisories/python"
PSF_RAW_URL = (
    "https://raw.githubusercontent.com/psf/advisory-database/main/advisories/python/{id}.json"
)
CVE_RECORD_URL = "https://cveawg.mitre.org/api/cve/{cve}"
DJANGO_FEED_URL = "https://www.djangoproject.com/rss/weblog/"

MAX_NEW_PER_SOURCE = 50  # 異常時に大量のレポートが出ないための上限
MAX_AI_ITEMS = 40
AI_MODEL = "gpt-oss-120b"
AI_BASE_URL = "https://api.ai.sakura.ad.jp/v1"

SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}
SEVERITY_MARK = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "⚪", "unknown": "❔"}
SEVERITY_LABEL = {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "unknown": "不明",
}


# ==========================================================================
# データ構造
# ==========================================================================
@dataclass
class Vuln:
    """レポートの1行分（脆弱性1件、または Node.js のセキュリティリリース予告1件）。"""

    key: str  # 既読管理用の一意なキー
    tech: str
    severity: str = "unknown"  # low / medium / high / critical / unknown
    ident: str = ""  # CVE-ID（無ければ GHSA-ID など）。予告など未発表なら空
    title: str = ""  # 公式の（英語の）タイトル
    published: str = ""  # ISO 8601
    date_only: bool = False  # 公開日の時刻が不明なら True
    fixed: list[str] = field(default_factory=list)
    affected: str = ""
    url: str = ""
    details: str = ""  # AI 要約の材料にする公式の説明文
    title_ja: str = ""
    summary_ja: str = ""


def normalize_severity(value: str | None) -> str:
    v = (value or "").strip().lower()
    if v == "moderate":  # Django / GitHub の表記
        return "medium"
    if v in SEVERITY_RANK:
        return v
    if v == "none":
        return "low"
    return "unknown"


def html_to_text(fragment: str) -> str:
    fragment = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragment or "", flags=re.S | re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
    return re.sub(r"\s+", " ", text).strip()


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(v for v in values if v))


# ==========================================================================
# HTTP
# ==========================================================================
class Http:
    def __init__(self, github_token: str | None = None) -> None:
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.github_token = github_token

    def get(self, url: str, **kwargs: Any) -> requests.Response:
        headers = kwargs.pop("headers", {})
        if url.startswith("https://api.github.com/"):
            headers.setdefault("Accept", "application/vnd.github+json")
            if self.github_token:
                headers.setdefault("Authorization", f"Bearer {self.github_token}")
        res = self.session.get(url, headers=headers, timeout=REQUEST_TIMEOUT, **kwargs)
        res.raise_for_status()
        return res

    def text(self, url: str, **kwargs: Any) -> str:
        res = self.get(url, **kwargs)
        res.encoding = res.encoding or "utf-8"
        return res.text

    def json(self, url: str, **kwargs: Any) -> Any:
        return self.get(url, **kwargs).json()


# ==========================================================================
# 取得元: GitHub Advisory Database（Next.js / TypeScript）
# ==========================================================================
def parse_github_advisories(
    advisories: list[dict[str, Any]], tech: str, package: str
) -> list[Vuln]:
    items = []
    for a in advisories:
        fixed, ranges = [], []
        for v in a.get("vulnerabilities") or []:
            if (v.get("package") or {}).get("name", "").lower() != package.lower():
                continue
            patched = v.get("first_patched_version")
            if isinstance(patched, dict):
                patched = patched.get("identifier")
            fixed.append(patched or "")
            ranges.append(v.get("vulnerable_version_range") or "")
        items.append(
            Vuln(
                key=a["ghsa_id"],
                tech=tech,
                severity=normalize_severity(a.get("severity")),
                ident=a.get("cve_id") or a["ghsa_id"],
                title=a.get("summary") or "",
                published=a.get("published_at") or "",
                fixed=unique(fixed),
                affected=" / ".join(unique(ranges)),
                url=a.get("html_url") or f"https://github.com/advisories/{a['ghsa_id']}",
                details=(a.get("description") or "")[:3000],
            )
        )
    return items


def fetch_github_advisory(http: Http, target: dict, seen: set[str], bootstrap: bool) -> list[Vuln]:
    data = http.json(
        GITHUB_ADVISORIES_URL,
        params={
            "ecosystem": target["ecosystem"],
            "affects": target["package"],
            "per_page": 100,
            "sort": "published",
            "direction": "desc",
        },
    )
    return parse_github_advisories(data, target["name"], target["package"])


# ==========================================================================
# 取得元: Node.js 公式フィード（+ Security WG の CVE 詳細）
# ==========================================================================
def parse_node_release_date(title: str) -> datetime | None:
    m = re.search(r"([A-Z][a-z]+ \d{1,2}, \d{4}) Security Releases", title or "")
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%B %d, %Y").replace(tzinfo=JST)
    except ValueError:
        return None


def extract_article_text(page_html: str) -> str:
    m = re.search(r"<article[^>]*>(.*?)</article>", page_html, re.S)
    return html_to_text(m.group(1) if m else page_html)


def parse_node_release(
    tech: str, title: str, link: str, pub_date: datetime, text: str, core_index: dict[str, Any]
) -> list[Vuln]:
    """1つのセキュリティリリース記事から、CVE ごとの項目（リリース後）か予告1件を作る。"""
    norm = lambda u: (u or "").rstrip("/")  # noqa: E731
    by_cve = {cve: entry for entry in core_index.values() for cve in entry.get("cve", [])}
    release_date = parse_node_release_date(title)

    own = []
    for cve in sorted(set(re.findall(r"CVE-\d{4}-\d+", text))):
        entry = by_cve.get(cve)
        if entry and entry.get("ref") and norm(entry["ref"]) != norm(link):
            continue  # 過去のリリースへの言及
        own.append((cve, entry or {}))

    if own:
        # 予告記事がリリース時に更新された場合は記事の公開日（予告日）ではなくリリース日を使う
        use_release_date = release_date is not None and release_date > pub_date
        published = (release_date if use_release_date else pub_date).isoformat()
        return [
            Vuln(
                key=f"node:{cve}",
                tech=tech,
                severity=normalize_severity(entry.get("severity")),
                ident=cve,
                title=entry.get("description")
                or (entry.get("overview") or "").split("\n")[0][:200]
                or title,
                published=published,
                date_only=use_release_date,
                fixed=[p.strip().lstrip("^") for p in (entry.get("patched") or "").split("||")],
                affected=" / ".join(p.strip() for p in (entry.get("vulnerable") or "").split("||")),
                url=link,
                details=(entry.get("overview") or "")[:3000],
            )
            for cve, entry in own
        ]

    # CVE がまだ載っていない = リリース予告
    severities = [
        normalize_severity(s)
        for s in re.findall(r"highest severity issue fixed in [^.]*? is (\w+)", text, re.I)
    ]
    severity = max(severities, key=lambda s: SEVERITY_RANK.get(s, 0), default="unknown")
    lines = re.search(r"new versions of the (.+?) releases? lines?", text)
    return [
        Vuln(
            key=f"node-announce:{norm(link)}",
            tech=tech,
            severity=severity,
            ident="",
            title=f"Security release pre-announcement: {title}",
            published=pub_date.isoformat(),
            fixed=[f"{release_date:%Y/%m/%d} リリース予定"] if release_date else [],
            affected=lines.group(1) if lines else "",
            url=link,
            details=text[:3000],
        )
    ]


def fetch_nodejs(http: Http, target: dict, seen: set[str], bootstrap: bool) -> list[Vuln]:
    feed = ET.fromstring(http.text(NODE_FEED_URL))
    core_index = http.json(NODE_CORE_INDEX_URL)
    items = []
    for item in feed.findall(".//item")[:NODE_FEED_ITEMS]:
        link = item.findtext("link") or ""
        text = extract_article_text(http.text(link))
        items += parse_node_release(
            target["name"],
            item.findtext("title") or "",
            link,
            parsedate_to_datetime(item.findtext("pubDate")),
            text,
            core_index,
        )
    return items


# ==========================================================================
# 取得元: PSF 公式アドバイザリ + CVE レコード（Python / CPython）
# ==========================================================================
def parse_cve_record(record: dict[str, Any]) -> dict[str, Any]:
    """CVE レコード（CNA が登録した内容）から深刻度・バージョン・タイトルを取り出す。"""
    cna = (record.get("containers") or {}).get("cna") or {}
    severity = "unknown"
    for metric in cna.get("metrics") or []:
        for key in ("cvssV4_0", "cvssV3_1", "cvssV3_0"):
            if key in metric:
                severity = normalize_severity(metric[key].get("baseSeverity"))
                break
        if severity != "unknown":
            break
    fixed, ranges = [], []
    for affected in cna.get("affected") or []:
        for v in affected.get("versions") or []:
            if v.get("status") != "affected" or not v.get("lessThan"):
                continue
            fixed.append(v["lessThan"])
            start = v.get("version")
            ranges.append(
                f"{v['lessThan']} 未満"
                if start in (None, "0")
                else f"{start}〜{v['lessThan']} 未満"
            )
    return {
        "severity": severity,
        "fixed": unique(fixed),
        "affected": " / ".join(unique(ranges)),
        "title": cna.get("title") or "",
        "published": (record.get("cveMetadata") or {}).get("datePublished") or "",
    }


def parse_psf_advisory(
    tech: str, advisory: dict[str, Any], cve_info: dict[str, Any] | None
) -> Vuln:
    cve = next((a for a in advisory.get("aliases", []) if a.startswith("CVE-")), "")
    info = cve_info or {}
    refs = advisory.get("references") or []
    url = next((r["url"] for r in refs if r.get("type") == "ADVISORY"), "") or (
        f"https://www.cve.org/CVERecord?id={cve}" if cve else ""
    )
    details = advisory.get("details") or ""
    return Vuln(
        key=advisory["id"],
        tech=tech,
        severity=info.get("severity", "unknown"),
        ident=cve or advisory["id"],
        title=info.get("title") or advisory.get("summary") or details.split("\n")[0][:200],
        published=info.get("published") or advisory.get("published") or "",
        fixed=info.get("fixed", []),
        affected=info.get("affected", ""),
        url=url,
        details=details[:3000],
    )


def fetch_psf(http: Http, target: dict, seen: set[str], bootstrap: bool) -> list[Vuln]:
    listing = http.json(PSF_LISTING_URL)
    ids = [x["name"][:-5] for x in listing if re.fullmatch(r"PSF-\d{4}-\d+\.json", x["name"])]
    if bootstrap:
        # 既読にするだけなので、詳細は取りに行かない
        return [Vuln(key=i, tech=target["name"]) for i in ids]
    items = []
    for advisory_id in [i for i in ids if i not in seen][:MAX_NEW_PER_SOURCE]:
        advisory = http.json(PSF_RAW_URL.format(id=advisory_id))
        cve = next((a for a in advisory.get("aliases", []) if a.startswith("CVE-")), "")
        cve_info = parse_cve_record(http.json(CVE_RECORD_URL.format(cve=cve))) if cve else None
        items.append(parse_psf_advisory(target["name"], advisory, cve_info))
    return items


# ==========================================================================
# 取得元: Django 公式ブログ（セキュリティリリース記事）
# ==========================================================================
def parse_django_feed(tech: str, feed_xml: str) -> list[Vuln]:
    items: dict[str, Vuln] = {}
    for item in ET.fromstring(feed_xml).findall(".//item"):
        title = item.findtext("title") or ""
        if not re.search(r"security releases? issued", title, re.I):
            continue
        body = item.findtext("description") or ""
        text = html_to_text(body)
        fixed = re.findall(r"\d+\.\d+\.\d+", title)
        affected_m = re.search(r"Affected supported versions (.*?) Resolution", text)
        affected = (
            " / ".join(re.findall(r"Django ([\w.]+)", affected_m.group(1))) if affected_m else ""
        )
        published = parsedate_to_datetime(item.findtext("pubDate")).isoformat()
        link = item.findtext("link") or ""
        for m in re.finditer(r"<h(\d)[^>]*>(.*?)</h\1>(.*?)(?=<h\d|$)", body, re.S):
            heading = html_to_text(m.group(2))
            cve_m = re.match(r"(CVE-\d{4}-\d+):?\s*(.*)", heading)
            if not cve_m:
                continue
            section = html_to_text(m.group(3))
            sev_m = re.search(r'severity "(\w+)"', section)
            cve = cve_m.group(1)
            if cve in items and items[cve].severity != "unknown":
                continue  # 本文の後半（パッチ一覧）に同じ見出しがもう一度出てくる
            items[cve] = Vuln(
                key=f"django:{cve}",
                tech=tech,
                severity=normalize_severity(sev_m.group(1) if sev_m else None),
                ident=cve,
                title=cve_m.group(2),
                published=published,
                fixed=fixed,
                affected=affected,
                url=link,
                details=section[:3000],
            )
    return list(items.values())


def fetch_django(http: Http, target: dict, seen: set[str], bootstrap: bool) -> list[Vuln]:
    return parse_django_feed(target["name"], http.text(DJANGO_FEED_URL))


SOURCES = {
    "github_advisory": fetch_github_advisory,
    "nodejs": fetch_nodejs,
    "psf": fetch_psf,
    "django": fetch_django,
}


# ==========================================================================
# AI による日本語要約（取得した公式情報だけを材料にする）
# ==========================================================================
AI_SYSTEM_PROMPT = (
    "あなたはセキュリティアナリストです。与えられた公式情報だけを根拠に、日本語で簡潔にまとめてください。"
    "公式情報に書かれていないこと（攻撃手法の詳細、影響範囲、数値など）を推測で補ってはいけません。"
    '出力は JSON オブジェクト1つだけにしてください: {"title_ja": "...", "summary_ja": "..."}'
)


def build_ai_prompt(v: Vuln) -> str:
    payload = {
        "技術": v.tech,
        "識別子": v.ident or "（未発表）",
        "深刻度": SEVERITY_LABEL[v.severity],
        "公式タイトル": v.title,
        "影響を受けるバージョン": v.affected or "不明",
        "修正版": " / ".join(v.fixed) or "不明",
        "公式の説明": v.details,
    }
    return (
        "以下の公式情報を要約してください。\n"
        "- title_ja: 内容を表す30文字程度の日本語タイトル\n"
        "- summary_ja: 何が起きるか・どういう条件で影響を受けるか・どう対応すべきか を2〜3文で\n\n"
        + json.dumps(payload, ensure_ascii=False)
    )


def parse_ai_response(content: str) -> dict[str, str] | None:
    m = re.search(r"\{.*\}", content or "", re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    title, summary = data.get("title_ja"), data.get("summary_ja")
    if not isinstance(title, str) or not isinstance(summary, str):
        return None
    return {"title_ja": title.strip()[:80], "summary_ja": summary.strip()[:600]}


def enrich_with_ai(items: list[Vuln], api_key: str | None) -> None:
    if not api_key:
        print("SAKURA_API_KEY が無いため、AI 要約はスキップします。")
        return
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=AI_BASE_URL)
    for v in items[:MAX_AI_ITEMS]:
        try:
            res = client.chat.completions.create(
                model=AI_MODEL,
                messages=[
                    {"role": "system", "content": AI_SYSTEM_PROMPT},
                    {"role": "user", "content": build_ai_prompt(v)},
                ],
                temperature=0.2,
            )
            parsed = parse_ai_response(res.choices[0].message.content)
            if parsed:
                v.title_ja, v.summary_ja = parsed["title_ja"], parsed["summary_ja"]
            else:
                print(f"AI の応答を解釈できませんでした: {v.key}", file=sys.stderr)
        except Exception as e:  # AI が失敗してもレポートは作る
            print(f"AI 要約に失敗しました ({v.key}): {e}", file=sys.stderr)


# ==========================================================================
# レポート（Markdown）
# ==========================================================================
def escape_md(text: str, table: bool = False) -> str:
    # HTML タグとして解釈されうる "<" だけを無害化する（"<= 16.4.0" などはそのまま読めるように）
    text = re.sub(r"<(?=[A-Za-z/!?])", "&lt;", text or "")
    if table:
        text = re.sub(r"\s+", " ", text).replace("|", "\\|")
    return text


def published_dt(v: Vuln) -> datetime | None:
    try:
        return datetime.fromisoformat(v.published.replace("Z", "+00:00"))
    except ValueError:
        return None


def format_published(v: Vuln) -> str:
    dt = published_dt(v)
    if not dt:
        return "—"
    return dt.strftime("%Y/%m/%d") if v.date_only else dt.astimezone(JST).strftime("%Y/%m/%d %H:%M")


def count_by_severity(items: list[Vuln]) -> dict[str, int]:
    counts = {s: 0 for s in SEVERITY_MARK}
    for v in items:
        counts[v.severity] += 1
    return {s: n for s, n in counts.items() if n}


def format_counts(counts: dict[str, int]) -> str:
    return " ／ ".join(f"{SEVERITY_MARK[s]} {SEVERITY_LABEL[s]} {n}" for s, n in counts.items())


def sort_items(items: list[Vuln]) -> list[Vuln]:
    oldest = datetime.min.replace(tzinfo=UTC)
    return sorted(items, key=lambda v: published_dt(v) or oldest, reverse=True)


def render_report(items: list[Vuln], generated_at: datetime, techs: list[str]) -> str:
    items = sort_items(items)
    lines = [
        f"# 脆弱性レポート {generated_at:%Y/%m/%d}",
        "",
        f"- 作成日時: {generated_at:%Y/%m/%d %H:%M} (JST)",
        f"- 新規: {len(items)} 件（{format_counts(count_by_severity(items))}）",
        f"- 監視対象: {', '.join(techs)}",
        "",
        "## 一覧",
        "",
        "| 日時（JST） | 技術 | 修正版 | CVE | 内容 |",
        "|---|---|---|---|---|",
    ]
    for v in items:
        cells = [
            format_published(v),
            v.tech,
            " / ".join(v.fixed) or "—",
            v.ident or "（未発表）",
            f"{SEVERITY_MARK[v.severity]} {v.title_ja or v.title}",
        ]
        lines.append("| " + " | ".join(escape_md(c, table=True) for c in cells) + " |")

    lines += ["", "## 詳細"]
    for v in items:
        heading = v.ident or "セキュリティリリース予告"
        lines += [
            "",
            f"### {SEVERITY_MARK[v.severity]} {escape_md(v.tech)}｜{escape_md(heading)}",
            "",
            f"- **内容**: {escape_md(v.title_ja or v.title)}",
        ]
        if v.title_ja and v.title:
            lines.append(f"- **原文タイトル**: {escape_md(v.title)}")
        lines += [
            f"- **公開日時**: {format_published(v)}",
            f"- **深刻度**: {SEVERITY_LABEL[v.severity]}",
            f"- **影響を受けるバージョン**: {escape_md(v.affected) or '不明'}",
            f"- **修正版**: {escape_md(' / '.join(v.fixed)) or '不明'}",
            f"- **公式情報**: <{v.url}>" if v.url else "- **公式情報**: —",
            "",
            escape_md(v.summary_ja)
            if v.summary_ja
            else "（AI による要約はありません。公式情報を確認してください）",
        ]

    lines += [
        "",
        "---",
        "",
        "> 一覧・深刻度・バージョンは各プロジェクトの公式情報から自動で取得しています。"
        f"日本語の内容と要約は、公式情報をもとにさくらのAI（{AI_MODEL}）が作成したものです。"
        "対応の判断は必ず公式情報で確認してください。",
        "",
    ]
    return "\n".join(lines)


def next_report_path(report_dir: Path, generated_at: datetime) -> Path:
    base = report_dir / f"{generated_at:%Y}" / f"{generated_at:%Y-%m-%d}"
    path, n = base.with_suffix(".md"), 2
    while path.exists():  # 同じ日に2回目以降の実行があった場合
        path, n = base.parent / f"{base.name}-{n}.md", n + 1
    return path


def load_index(path: Path) -> dict[str, Any]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"reports": []}


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def viewer_url(report_rel: str) -> str:
    return f"{SITE_URL}/vulnerabilities/?report={report_rel.removesuffix('.md')}"


# ==========================================================================
# check: 取得 → レポート作成 → 既読の記録
# ==========================================================================
def load_state(path: Path) -> dict[str, Any]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"initialized_targets": [], "seen": {}}


def meets_threshold(v: Vuln, min_severity: str) -> bool:
    if v.severity == "unknown":
        return True  # 深刻度不明は見逃さないよう常に載せる
    return SEVERITY_RANK[v.severity] >= SEVERITY_RANK[min_severity]


def run_check(
    *,
    config_path: Path = CONFIG_PATH,
    state_path: Path = STATE_PATH,
    report_dir: Path = REPORT_DIR,
    now: datetime | None = None,
    http: Http | None = None,
    api_key: str | None = None,
) -> tuple[int, str | None]:
    """Returns (exit_code, 作成したレポートの report_dir からの相対パス or None)."""
    config = tomllib.loads(config_path.read_text(encoding="utf-8"))
    min_severity = normalize_severity(config.get("min_severity", "low"))
    if min_severity == "unknown":
        min_severity = "low"
    targets = config.get("targets", [])
    state = load_state(state_path)
    seen: dict[str, str] = state.setdefault("seen", {})
    initialized: list[str] = state.setdefault("initialized_targets", [])
    now = (now or datetime.now(JST)).astimezone(JST)
    http = http or Http(os.getenv("GITHUB_TOKEN"))
    today = now.strftime("%Y-%m-%d")

    to_report: list[Vuln] = []
    errors = []
    for target in targets:
        name = target["name"]
        bootstrap = name not in initialized
        try:
            items = SOURCES[target["source"]](http, target, set(seen), bootstrap)
        except Exception as e:
            errors.append(f"{name}: {e}")
            print(f"[{name}] 取得に失敗しました: {e}", file=sys.stderr)
            continue

        new = list({v.key: v for v in items if v.key not in seen}.values())
        for v in new:
            seen[v.key] = today
        if bootstrap:
            initialized.append(name)
            print(
                f"[{name}] 初回のため既存の {len(new)} 件を既読として記録しました（レポートなし）"
            )
            continue
        reportable = [v for v in new if meets_threshold(v, min_severity)][:MAX_NEW_PER_SOURCE]
        print(f"[{name}] 新規 {len(new)} 件（レポート対象 {len(reportable)} 件）")
        to_report += reportable

    report_rel = None
    if to_report:
        enrich_with_ai(to_report, api_key)
        path = next_report_path(report_dir, now)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            render_report(to_report, now, [t["name"] for t in targets]), encoding="utf-8"
        )
        report_rel = path.relative_to(report_dir).as_posix()
        index = load_index(report_dir / INDEX_PATH.name)
        index["reports"].insert(
            0,
            {
                "date": today,
                "path": report_rel,
                "generated_at": now.isoformat(timespec="seconds"),
                "count": len(to_report),
                "counts": count_by_severity(to_report),
                "techs": unique([v.tech for v in sort_items(to_report)]),
            },
        )
        write_json(report_dir / INDEX_PATH.name, index)
        print(f"レポートを作成しました: {path}")
    else:
        print("新しい脆弱性はありません。レポートは作成しません。")

    write_json(state_path, state)
    return (1 if errors else 0), report_rel


# ==========================================================================
# notify: Pages への反映を待って Discord に通知
# ==========================================================================
def wait_for_url(url: str, timeout: float = 600, interval: float = 15) -> bool:
    deadline = time.monotonic() + timeout
    while True:
        try:
            if requests.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": USER_AGENT}).ok:
                return True
        except requests.RequestException:
            pass
        if time.monotonic() >= deadline:
            return False
        time.sleep(interval)


def build_discord_message(entry: dict[str, Any], published: bool) -> str:
    date = entry["date"].replace("-", "/")
    lines = [
        f"🛡️ 脆弱性レポート（{date}）を作成しました",
        f"新規 {entry['count']}件：{format_counts(entry.get('counts', {}))}",
        f"対象: {', '.join(entry.get('techs', []))}",
        viewer_url(entry["path"]),
    ]
    if not published:
        lines.append(
            "（GitHub Pages への反映に時間がかかっています。開けない場合は少し待ってください）"
        )
    return "\n".join(lines)


def run_notify(
    report_rel: str, *, report_dir: Path = REPORT_DIR, webhook_url: str | None = None
) -> int:
    webhook_url = webhook_url or os.getenv("DISCORD_URL_GITHUB")
    if not webhook_url:
        print("DISCORD_URL_GITHUB が設定されていません。", file=sys.stderr)
        return 1
    entry = next(
        (r for r in load_index(report_dir / INDEX_PATH.name)["reports"] if r["path"] == report_rel),
        None,
    )
    if not entry:
        print(f"index.json にレポートがありません: {report_rel}", file=sys.stderr)
        return 1
    published = wait_for_url(f"{SITE_URL}/vulnerabilities/{report_rel}")
    res = requests.post(
        webhook_url,
        json={
            "username": "Vulnerability Watch",
            "content": build_discord_message(entry, published),
        },
        timeout=REQUEST_TIMEOUT,
    )
    if not res.ok:
        print(f"Discord への通知に失敗しました: HTTP {res.status_code}", file=sys.stderr)
        return 1
    print("Discord に通知しました。")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="指定した技術の脆弱性情報を監視してレポートを作る")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check", help="取得してレポートを作成する")
    notify = sub.add_parser("notify", help="レポート作成を Discord に通知する")
    notify.add_argument("--report", required=True, help="vulnerabilities/ からの相対パス")
    args = parser.parse_args(argv)

    if args.command == "check":
        code, report_rel = run_check(api_key=os.getenv("SAKURA_API_KEY"))
        if report_rel and os.getenv("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
                f.write(f"report={report_rel}\n")
        return code
    return run_notify(args.report)


if __name__ == "__main__":
    sys.exit(main())
