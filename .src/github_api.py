"""GitHub API を標準ライブラリだけで呼び出すための共通処理。

CI では python3 -I で実行し、PyPI の依存パッケージを読み込まない。
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Final

USER_AGENT: Final[str] = "ibukichi-jp-github-notifications"


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """リダイレクトを追わない。

    urllib はリダイレクト先にも Authorization ヘッダーをそのまま送るため、
    トークンが別のホストへ渡らないように、リダイレクトはエラーとして扱う。
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirectHandler)


def github_headers(token: str) -> dict[str, str]:
    """GitHub API 用の共通ヘッダーを作る。"""
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
    }


def github_request(
    url: str, headers: dict[str, str], method: str, timeout: int
) -> tuple[int, bytes]:
    """リクエストを送り、(ステータスコード, 本文) を返す。

    HTTP エラー（4xx/5xx、リダイレクトを含む）でも例外にせず、そのまま返す。
    """
    if not url.startswith("https://api.github.com/"):
        raise ValueError(f"GitHub API 以外の URL には送信しません: {url}")
    req = urllib.request.Request(url, headers=headers, method=method)
    try:
        with _OPENER.open(req, timeout=timeout) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        with e:
            return e.code, e.read()


def decode_json(body: bytes) -> Any:
    """JSON の本文を読み取る。"""
    return json.loads(body.decode("utf-8"))
