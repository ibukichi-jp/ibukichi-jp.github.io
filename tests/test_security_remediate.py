import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

from security_auto_remediate import build_primary_advisory_links, load_grype_results


def test_load_grype_results_severity_filter(tmp_path):
    """GrypeのJSON結果からHighとCritical深刻度のみが抽出されるかのテスト"""
    dummy_grype = {
        "matches": [
            {
                "artifact": {"name": "urllib3", "version": "1.26.4"},
                "vulnerability": {"id": "CVE-2021-33503", "severity": "High"},
            },
            {
                "artifact": {"name": "requests", "version": "2.20.0"},
                "vulnerability": {"id": "CVE-2023-32681", "severity": "Medium"},
            },
            {
                "artifact": {"name": "django", "version": "2.2.0"},
                "vulnerability": {"id": "CVE-2021-3281", "severity": "Critical"},
            },
            {
                "artifact": {"name": "pip", "version": "20.0.0"},
                "vulnerability": {"id": "CVE-2021-9999", "severity": "Low"},
            },
        ]
    }

    json_file = tmp_path / "grype_test.json"
    json_file.write_text(json.dumps(dummy_grype), encoding="utf-8")

    matches = load_grype_results(json_file)
    assert len(matches) == 2

    pkg_names = {m["artifact"]["name"] for m in matches}
    assert pkg_names == {"urllib3", "django"}


def test_build_primary_advisory_links():
    """CVEおよびGHSAから公式1次資料リンクが重複なく生成されるかのテスト"""
    vuln = {
        "id": "CVE-2024-34064",
        "dataSource": "https://nvd.nist.gov/vuln/detail/CVE-2024-34064",
        "urls": [
            "https://github.com/advisories/GHSA-h75v-3vvj-5mfj",
            "https://github.com/pallets/jinja/security/advisories/GHSA-h75v-3vvj-5mfj",
        ],
    }

    links = build_primary_advisory_links("CVE-2024-34064", vuln)
    link_urls = [url for _, url in links]

    # NVDとCVE.org公式が生成されているか
    assert "https://nvd.nist.gov/vuln/detail/CVE-2024-34064" in link_urls
    assert "https://www.cve.org/CVERecord?id=CVE-2024-34064" in link_urls
    # GitHub Advisoryリンクが含まれているか
    assert "https://github.com/advisories/GHSA-h75v-3vvj-5mfj" in link_urls
    # 重複URLが存在しないか
    assert len(link_urls) == len(set(link_urls))


def test_build_primary_advisory_links_ghsa():
    """GHSA識別子の場合のリンク生成テスト"""
    vuln = {"id": "GHSA-1234-5678-90ab", "urls": []}
    links = build_primary_advisory_links("GHSA-1234-5678-90ab", vuln)
    link_urls = [url for _, url in links]
    assert "https://github.com/advisories/GHSA-1234-5678-90ab" in link_urls
