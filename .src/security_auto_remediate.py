#!/usr/bin/env python3
"""Security Auto-Remediation with Grype, Sakura AI, Discord alerts, and automated PR creation."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple

from openai import OpenAI, OpenAIError


def load_grype_results(json_path: Path) -> List[Dict[str, Any]]:
    """Parse Grype JSON output and return High/Critical vulnerability matches."""
    if not json_path.exists():
        print(f"Warning: {json_path} が見つかりません。")
        return []

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading {json_path}: {e}")
        return []

    matches = data.get("matches", [])
    high_critical = [
        m for m in matches
        if m.get("vulnerability", {}).get("severity", "").lower() in ["high", "critical"]
    ]
    return high_critical


def build_primary_advisory_links(cve_id: str, vuln: Dict[str, Any]) -> List[Tuple[str, str]]:
    """Extract and build official primary advisory links (NVD, CVE.org, GitHub Advisory)."""
    links: List[Tuple[str, str]] = []
    seen: set[str] = set()

    def add_link(label: str, url: str) -> None:
        if url and url not in seen:
            seen.add(url)
            links.append((label, url))

    # NVD & CVE.org
    if cve_id.startswith("CVE-"):
        add_link("NVD (National Vulnerability Database)", f"https://nvd.nist.gov/vuln/detail/{cve_id}")
        add_link("CVE.org 公式レコード", f"https://www.cve.org/CVERecord?id={cve_id}")
    elif cve_id.startswith("GHSA-"):
        add_link("GitHub Security Advisory", f"https://github.com/advisories/{cve_id}")

    # Grype dataSource
    data_source = vuln.get("dataSource")
    if data_source:
        add_link("公式データソース", data_source)

    # Reference URLs from Grype
    for ref_url in vuln.get("urls", [])[:3]:
        if "github.com/advisories" in ref_url:
            add_link("GitHub Security Advisory", ref_url)
        elif "nvd.nist.gov" in ref_url:
            add_link("NVD", ref_url)
        else:
            add_link("参考情報 (Patch/Bulletin)", ref_url)

    return links


def summarize_vulnerability_with_ai(
    pkg_name: str,
    current_ver: str,
    cve_id: str,
    severity: str,
    description: str,
    fix_versions: List[str],
    primary_links: List[Tuple[str, str]],
    api_key: str | None,
) -> str:
    """Use Sakura AI (OpenAI-compatible gpt-oss-120b) to summarize the CVE in Japanese with primary sources."""
    if not api_key:
        return f"{cve_id} ({severity}): {description[:200]}..."

    client = OpenAI(api_key=api_key, base_url="https://api.ai.sakura.ad.jp/v1")
    fix_text = ", ".join(fix_versions) if fix_versions else "修正バージョン未定"
    links_text = "\n".join([f"- {label}: {url}" for label, url in primary_links])

    prompt = (
        f"以下のオープンソースパッケージで高深刻度のセキュリティ脆弱性が検知されました。\n"
        f"- パッケージ名: {pkg_name} (現在のバージョン: {current_ver})\n"
        f"- 深刻度: {severity}\n"
        f"- 識別子: {cve_id}\n"
        f"- 修正バージョン: {fix_text}\n"
        f"- 1次資料リンク:\n{links_text}\n"
        f"- 脆弱性詳細(英語): {description}\n\n"
        f"開発者向けに、以下の4点を日本語で簡潔に箇条書きで要約してください（200〜250文字程度）：\n"
        f"1. 脆弱性の内容（何が危険か）\n"
        f"2. 想定される攻撃シナリオ・リスク\n"
        f"3. 修正の指針（アップデート内容）\n"
        f"4. 1次資料（公式アドバイザリURLの案内）"
    )

    try:
        response = client.chat.completions.create(
            model="gpt-oss-120b",
            messages=[
                {"role": "system", "content": "あなたは優秀なセキュリティエンジニアです。専門用語をわかりやすく解説し、1次資料の参照先も明確に伝えてください。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except (OpenAIError, Exception) as e:
        print(f"Sakura AI API Error: {e}", file=sys.stderr)
        return f"{cve_id} ({severity}): {description[:200]}..."


def send_discord_message(webhook_url: str | None, content: str) -> None:
    """Send alert message to Discord webhook."""
    if not webhook_url:
        print("Warning: DISCORD_URL_GITHUB is not set. Skipping Discord notification.")
        return

    payload = json.dumps({"username": "Security Sentinel", "content": content}).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "GitHub-Actions-Security"},
    )
    try:
        urllib.request.urlopen(req)
        print("✅ Discord に通知を送信しました。")
    except Exception as e:
        print(f"Discord notification failed: {e}", file=sys.stderr)


def create_remediation_pr(
    pkg_name: str,
    cve_id: str,
    severity: str,
    ai_summary: str,
    primary_links: List[Tuple[str, str]],
    token: str,
    repo_actor: str,
) -> str:
    """Apply uv update, commit to a new branch, and create a Pull Request via GitHub CLI or direct URL."""
    branch_name = f"security/auto-patch-{pkg_name}"
    
    # 既存ブランチがあれば削除して最新のmainから切り直す
    subprocess.run(["git", "checkout", "main"], check=False)
    subprocess.run(["git", "branch", "-D", branch_name], check=False)
    subprocess.run(["git", "checkout", "-b", branch_name], check=True)

    # パッケージをアップデート（既存の古いピン留めを解除して最新化）
    print(f"\n📦 {pkg_name} の最新化を試行中...")
    subprocess.run(["uv", "remove", pkg_name], check=False)
    subprocess.run(["uv", "add", pkg_name], check=True)
    subprocess.run(["uv", "sync", "--frozen", "--no-dev"], check=True)

    # 差分の確認
    diff_status = subprocess.run(
        ["git", "status", "--porcelain", "uv.lock", "pyproject.toml"],
        capture_output=True,
        text=True,
        check=True,
    )
    if not diff_status.stdout.strip():
        print(f"ℹ️ {pkg_name} にアップデート可能なバージョンが存在しないため、PR作成をスキップします。")
        subprocess.run(["git", "checkout", "main"], check=True)
        return ""

    # コミット
    commit_msg = f"fix(security): auto-patch {pkg_name} for {cve_id}"
    subprocess.run(["git", "add", "uv.lock", "pyproject.toml"], check=True)
    subprocess.run(["git", "commit", "-m", commit_msg], check=True)

    # プッシュ
    push_url = f"https://x-access-token:{token}@github.com/{repo_actor}/{repo_actor}.github.io.git"
    subprocess.run(["git", "push", "-f", push_url, f"{branch_name}:{branch_name}"], check=True)

    # 1次資料リンクのMarkdown
    links_markdown = "\n".join([f"- [{label}]({url})" for label, url in primary_links])
    ai_summary_quoted = "\n".join([f"> {line}" for line in ai_summary.split("\n")])

    # PR本文の作成
    pr_body = (
        f"## 🛡️ セキュリティ脆弱性の自動修正 PR\n\n"
        f"Grype による定期セキュリティスキャンにより **`{pkg_name}`** で深刻度（**{severity}**）の脆弱性が検知されたため、自律修復エージェントが修正パッチを自動適用しました。\n\n"
        f"---\n\n"
        f"### 🤖 AIによる脆弱性解説 & 影響度要約\n"
        f"> **さくらの高火力AI (`gpt-oss-120b`) による自動分析レポート**\n>\n"
        f"{ai_summary_quoted}\n\n"
        f"---\n\n"
        f"### 🔗 1次情報・公式アドバイザリ（一次資料）\n"
        f"{links_markdown}\n\n"
        f"---\n\n"
        f"### 📦 パッチ内容と変更差分\n"
        f"- **対象パッケージ**: `{pkg_name}`\n"
        f"- **検知識別子**: `{cve_id}`\n"
        f"- **修正内容**: `pyproject.toml` および `uv.lock` を更新し、安全な最新バージョンへアップデートしました。\n"
        f"- **整合性チェック**: `uv sync --frozen --no-dev` による環境構築テストをパス済み。\n\n"
        f"---\n"
        f"*Generated automatically by `Security Sentinel (Grype & Sakura AI)`*"
    )

    pr_cmd = [
        "gh", "pr", "create",
        "--title", f"fix(security): auto-patch {pkg_name} ({cve_id})",
        "--body", pr_body,
        "--head", branch_name,
        "--base", "main",
    ]
    env = os.environ.copy()
    env["GH_TOKEN"] = token
    result = subprocess.run(pr_cmd, capture_output=True, text=True, env=env)

    # すでにPRが存在している場合またはパーミッション制限時のフォールバック
    if result.returncode == 0:
        pr_url = result.stdout.strip()
        print(f"✅ Pull Request を作成しました: {pr_url}")
        subprocess.run(["git", "checkout", "main"], check=True)
        return pr_url
    else:
        print(f"Notice from gh pr create: {result.stderr}")
        fallback_url = f"https://github.com/{repo_actor}/{repo_actor}.github.io/pull/new/{branch_name}"
        print(f"Direct PR URL: {fallback_url}")
        subprocess.run(["git", "checkout", "main"], check=True)
        return fallback_url


def main() -> None:
    grype_file = Path(os.getenv("GRYPE_RESULT_FILE", "grype-results.json"))
    sakura_api_key = os.getenv("SAKURA_API_KEY")
    discord_url = os.getenv("DISCORD_URL_GITHUB")
    token = os.getenv("GITHUB_TOKEN") or os.getenv("TOKEN_FOR_WRITE", "")
    repo_actor = os.getenv("GITHUB_ACTOR", "ibukichi-jp")
    server_url = os.getenv("GITHUB_SERVER_URL", "https://github.com")
    repo = os.getenv("GITHUB_REPOSITORY", f"{repo_actor}/{repo_actor}.github.io")
    run_id = os.getenv("GITHUB_RUN_ID", "")
    run_url = f"{server_url}/{repo}/actions/runs/{run_id}" if run_id else ""

    vulnerabilities = load_grype_results(grype_file)
    if not vulnerabilities:
        print("✅ High / Critical 深刻度の脆弱性は検知されませんでした。")
        sys.exit(0)

    print(f"⚠️ {len(vulnerabilities)} 件の高深刻度脆弱性を検知しました。AIによる分析と自動パッチ作成を開始します...")

    # パッケージごとに集約
    pkg_groups: Dict[str, List[Dict[str, Any]]] = {}
    for match in vulnerabilities:
        pkg_name = match.get("artifact", {}).get("name", "unknown")
        pkg_groups.setdefault(pkg_name, []).append(match)

    for pkg_name, matches in pkg_groups.items():
        first_match = matches[0]
        vuln = first_match.get("vulnerability", {})
        cve_id = vuln.get("id", "N/A")
        severity = vuln.get("severity", "High")
        description = vuln.get("description", "No description available.")
        current_ver = first_match.get("artifact", {}).get("version", "unknown")
        fix_versions = vuln.get("fix", {}).get("versions", [])

        # 1次資料リンクの抽出
        primary_links = build_primary_advisory_links(cve_id, vuln)

        # AIで要約（1次資料リンクも含める）
        print(f"\n🧠 [{pkg_name}] {cve_id} をさくらのAIで要約中...")
        ai_summary = summarize_vulnerability_with_ai(
            pkg_name=pkg_name,
            current_ver=current_ver,
            cve_id=cve_id,
            severity=severity,
            description=description,
            fix_versions=fix_versions,
            primary_links=primary_links,
            api_key=sakura_api_key,
        )

        # 自動PR作成
        pr_url = create_remediation_pr(
            pkg_name=pkg_name,
            cve_id=cve_id,
            severity=severity,
            ai_summary=ai_summary,
            primary_links=primary_links,
            token=token,
            repo_actor=repo_actor,
        )

        # 1次資料リンクのDiscord用フォーマット (<URL>で囲むことでDiscordのプレビューカード乱立を防止)
        discord_links = "\n".join([f"・[{label}](<{url}>)" for label, url in primary_links[:3]])

        # Discord通知作成
        if pr_url:
            msg = (
                f"🚨 **【セキュリティ脆弱性検知】AI自動修正PRを作成しました**\n"
                f"・**対象パッケージ**: `{pkg_name}` (現在: `{current_ver}`)\n"
                f"・**識別子**: `{cve_id}` (深刻度: **{severity}**)\n\n"
                f"🤖 **AIによる解説・影響要約**:\n"
                f"{ai_summary}\n\n"
                f"🔗 **1次情報（公式アドバイザリ）**:\n"
                f"{discord_links}\n\n"
                f"📦 **作成された修正PR**: <{pr_url}>\n"
                f"📋 **スキャン実行ログ**: <{run_url}>"
            )
        else:
            msg = (
                f"⚠️ **【セキュリティ脆弱性検知】修正バージョン待機中**\n"
                f"・**対象パッケージ**: `{pkg_name}` (現在: `{current_ver}`)\n"
                f"・**識別子**: `{cve_id}` (深刻度: **{severity}**)\n\n"
                f"🤖 **AIによる解説・影響要約**:\n"
                f"{ai_summary}\n\n"
                f"🔗 **1次情報（公式アドバイザリ）**:\n"
                f"{discord_links}\n\n"
                f"※現在PyPI上に自動適用可能な修正バージョンが未提供のため、PRは作成されませんでした。\n"
                f"📋 **スキャン実行ログ**: <{run_url}>"
            )

        send_discord_message(discord_url, msg)

    print("\n❌ 脆弱性が検知されたため、ワークフローを要対応（Failure）として終了します。")
    sys.exit(1)


if __name__ == "__main__":
    main()
