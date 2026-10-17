#!/usr/bin/env python3
"""Interactive package update manager with supply-chain safety intervals."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore

import questionary


def get_dependencies() -> list[str]:
    pyproject_path = Path("pyproject.toml")
    if not pyproject_path.exists():
        print("Error: pyproject.toml が見つかりません。", file=sys.stderr)
        sys.exit(1)

    with open(pyproject_path, "rb") as f:
        data = tomllib.load(f)

    deps: list[str] = []
    for req in data.get("project", {}).get("dependencies", []):
        name = req.split(">=")[0].split("==")[0].split("<")[0].split("~=")[0].split(">")[0].strip()
        if name:
            deps.append(name)
    return sorted(deps)


def run_command(cmd: list[str]) -> bool:
    print(f"\n\033[36m実行コマンド: {' '.join(cmd)}\033[m")
    try:
        subprocess.run(cmd, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"\033[31mコマンド実行中にエラーが発生しました: {e}\033[m", file=sys.stderr)
        return False


def main() -> None:
    print("\n\033[36m========================================\033[m")
    print("\033[36m     uv パッケージ更新マネージャー      \033[m")
    print("\033[36m========================================\033[m\n")

    mode = questionary.select(
        "更新モードを選択してください:",
        choices=[
            questionary.Choice("🛡️  通常安全更新 (5日間のクールダウンを適用・推奨)", value="safe"),
            questionary.Choice("⚡ 特定パッケージを選択して例外更新 (チェックボックスで複数選択)", value="partial"),
            questionary.Choice("🚀 全パッケージ即時更新 (クールダウンなしで全て最新化)", value="force_all"),
            questionary.Choice("❌ キャンセル", value="cancel"),
        ],
    ).ask()

    if not mode or mode == "cancel":
        print("キャンセルしました。")
        return

    if mode == "safe":
        print("\n\033[32m【通常安全更新】5日以上前に公開された安定バージョンを対象にします。\033[m")
        print("\033[33m--- 更新候補のプレビュー (Dry-run) ---\033[m")
        subprocess.run(["uv", "sync", "-U", "--exclude-newer=5d", "--dry-run"])

        confirm = questionary.confirm("上記の内容でパッケージを更新しますか？", default=True).ask()
        if confirm:
            print("\n\033[32mパッケージ更新中...\033[m")
            if run_command(["uv", "sync", "-U", "--exclude-newer=5d"]):
                print("\n\033[32m✅ パッケージ更新が完了しました！\033[m")
                subprocess.run(["uv", "tree", "--outdated"])

    elif mode == "partial":
        deps = get_dependencies()
        if not deps:
            print("更新可能な依存パッケージが見つかりません。")
            return

        choices = [questionary.Choice(pkg, value=pkg) for pkg in deps]
        selected_pkgs = questionary.checkbox(
            "例外として即時最新化するパッケージを選択してください (Spaceキーでチェック / aで全選択):",
            choices=choices,
        ).ask()

        if not selected_pkgs:
            print("パッケージが選択されませんでした。")
            return

        print(f"\n選択されたパッケージ: \033[33m{', '.join(selected_pkgs)}\033[m")
        print("\033[33m--- 更新候補のプレビュー (Dry-run) ---\033[m")
        lock_cmd = ["uv", "lock"]
        for pkg in selected_pkgs:
            lock_cmd.extend(["--upgrade-package", pkg])

        subprocess.run(lock_cmd + ["--dry-run"])

        confirm = questionary.confirm(f"{', '.join(selected_pkgs)} を今すぐ最新化しますか？", default=True).ask()
        if confirm:
            print("\n\033[32m選択したパッケージを最新化中...\033[m")
            if run_command(lock_cmd):
                subprocess.run(["uv", "sync", "--frozen", "--no-dev"], check=True)
                print(f"\n\033[32m✅ {', '.join(selected_pkgs)} の即時最新化が完了しました！\033[m")

    elif mode == "force_all":
        print("\n\033[31m【全パッケージ即時更新】クールダウンなしで最新版を対象にします。\033[m")
        print("\033[33m--- 更新候補のプレビュー (Dry-run) ---\033[m")
        subprocess.run(["uv", "sync", "-U", "--dry-run"])

        confirm = questionary.confirm("全パッケージを今すぐ最新化しますか？", default=False).ask()
        if confirm:
            print("\n\033[31m全パッケージ更新中...\033[m")
            if run_command(["uv", "sync", "-U"]):
                print("\n\033[32m✅ 全パッケージ更新が完了しました！\033[m")
                subprocess.run(["uv", "tree", "--outdated"])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n中断しました。")
        sys.exit(0)
