"""Stamp local CSS/JS references in index.html with a hash of each file's content.

index.html が読み込むローカルの CSS / JS（例: style.css, js/main.js）の URL に、
ファイル内容のハッシュを `?v=<hash>` として付け直す。

- ファイルが変わったときだけ URL が変わるので、ブラウザのキャッシュに古いファイルが残らない
- 外部 URL（https://...）は対象外
- `--check` を付けると書き換えずに検査だけ行い、更新が必要なら終了コード 1 を返す
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

HASH_LENGTH = 10

# src="..." / href="..." のうち、ローカルの .css / .js を指すもの（?v= の有無は問わない）
ASSET_REF_RE = re.compile(
    r'(?P<attr>\b(?:src|href)=")(?P<path>(?![a-z][a-z0-9+.-]*:|//)[^"?#]+\.(?:css|js))(?:\?v=[^"]*)?"'
)


def file_hash(path: Path, length: int = HASH_LENGTH) -> str:
    """ファイル内容の SHA-256 ハッシュ（先頭 length 文字）を返す。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:length]


def stamp_asset_versions(html: str, base_dir: Path) -> str:
    """HTML 内のローカル CSS/JS 参照に内容ハッシュの ?v= を付けた HTML を返す。"""

    def replace(match: re.Match[str]) -> str:
        rel_path = match.group("path")
        # "./style.css" や "/style.css"（サイトルート基準）も HTML と同じ場所のファイルとして扱う
        asset = base_dir / rel_path.removeprefix("./").lstrip("/")
        if not asset.is_file():
            raise FileNotFoundError(f"index.html が参照するファイルがありません: {rel_path}")
        return f'{match.group("attr")}{rel_path}?v={file_hash(asset)}"'

    return ASSET_REF_RE.sub(replace, html)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "html", nargs="?", default="index.html", help="対象の HTML（既定: index.html）"
    )
    parser.add_argument("--check", action="store_true", help="書き換えずに検査だけ行う")
    args = parser.parse_args(argv)

    html_path = Path(args.html)
    original = html_path.read_text(encoding="utf-8")
    updated = stamp_asset_versions(original, html_path.parent)

    if updated == original:
        print("アセットのバージョンは最新です。")
        return 0
    if args.check:
        print(
            "アセットのバージョンが古くなっています。update_asset_versions.py を実行してください。"
        )
        return 1

    html_path.write_text(updated, encoding="utf-8")
    print(f"{html_path} のアセットのバージョンを更新しました。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
