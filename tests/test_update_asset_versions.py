import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

from update_asset_versions import file_hash, main, stamp_asset_versions

HTML = """<link rel="stylesheet" href="style.css?v=old">
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script defer src="js/main.js"></script>
<a href="docs/readme.md">doc</a>
"""


@pytest.fixture
def site(tmp_path):
    (tmp_path / "js").mkdir()
    (tmp_path / "style.css").write_text("body{}", encoding="utf-8")
    (tmp_path / "js" / "main.js").write_text("console.log(1);", encoding="utf-8")
    (tmp_path / "index.html").write_text(HTML, encoding="utf-8")
    return tmp_path


def test_stamps_local_assets_with_content_hash(site):
    """ローカルの CSS/JS だけに内容ハッシュが付き、外部URLや他のファイルは変わらないテスト"""
    result = stamp_asset_versions(HTML, site)

    assert f'href="style.css?v={file_hash(site / "style.css")}"' in result
    assert f'src="js/main.js?v={file_hash(site / "js" / "main.js")}"' in result
    assert 'href="https://fonts.googleapis.com/css2?family=Inter"' in result
    assert 'src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"' in result
    assert 'href="docs/readme.md"' in result


def test_hash_changes_only_when_content_changes(site):
    first = stamp_asset_versions(HTML, site)
    assert stamp_asset_versions(first, site) == first  # 再実行しても変わらない

    (site / "js" / "main.js").write_text("console.log(2);", encoding="utf-8")
    second = stamp_asset_versions(first, site)
    assert second != first
    assert f'?v={file_hash(site / "style.css")}"' in second  # 変更していない CSS はそのまま


def test_missing_asset_raises(site):
    with pytest.raises(FileNotFoundError):
        stamp_asset_versions('<script src="js/missing.js?v=1"></script>', site)


def test_main_check_mode(site):
    """--check は書き換えずに、更新が必要なら 1 を返すテスト"""
    html_path = site / "index.html"
    assert main([str(html_path), "--check"]) == 1
    assert html_path.read_text(encoding="utf-8") == HTML

    assert main([str(html_path)]) == 0
    assert main([str(html_path), "--check"]) == 0


def test_root_relative_and_dot_slash_paths(site):
    """ "/style.css" や "./js/main.js" も同じファイルとして扱われるテスト"""
    html = '<link href="/style.css"><script src="./js/main.js?v=x"></script>'
    result = stamp_asset_versions(html, site)
    assert f'href="/style.css?v={file_hash(site / "style.css")}"' in result
    assert f'src="./js/main.js?v={file_hash(site / "js" / "main.js")}"' in result
