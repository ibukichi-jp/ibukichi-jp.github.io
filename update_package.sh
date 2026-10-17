#!/bin/bash
set -e

# uv run --with questionary を使って対話型パッケージ更新マネージャーを起動
exec uv run --with questionary python3 .src/update_manager.py "$@"
