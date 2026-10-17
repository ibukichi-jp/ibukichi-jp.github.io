# ibukichi-jp.github.io

GitHub Actions と Python (`uv`) を活用した、個人用ライフログ・自動化プラットフォームです。  
Blueskyへの定期投稿ボット、AIによる日々の俳句生成、GitHub通知のRSS(Atom)フィード化、CI通知の自動既読化などを自動運用しています。

---

## 🚀 主な機能

### 1. Bluesky 自動投稿ボット (`.src/bot_bsky.py`)
毎日定刻（JST 9:00）に GitHub Actions から起動し、当日の各種情報を Bluesky に自動ポストします。
- **祝日・記念日通知**: `jpholiday` による日本の祝日判定および月末金曜日のプレミアムフライデー判定・お知らせ
- **タニタ ヘルスプラネット連携**: 体組成計で計測した直近24時間の体重・体脂肪率データを取得して投稿
- **今日の一句**: 後述の俳句生成器が生成した最新の俳句をポスト

### 2. さくらのAI 俳句生成器 (`.src/haiku_generator.py`)
毎日定刻（JST 8:00）に実行される俳句ジェネレーターです。
- さくらのクラウド 高火力AIサービス（OpenAI互換API / `gpt-oss-120b`）を利用
- 実行日の日付と季節に合わせた五・七・五の俳句を生成
- 過去に詠んだ句との重複を防止するリトライロジックを搭載
- 生成された俳句は [`.data/haiku.log`](.data/haiku.log) に蓄積され、自動コミット

### 3. GitHub リリース通知の RSS/Atom フィード化 (`.src/rss_github_notifications.py`)
毎時0分に実行され、GitHub通知から関心のあるリリース情報をフィード化します。
- GitHub API から未読通知を取得し、`Release` 種別のものを抽出
- Atomフィード形式（[`rss/github_notifications.atom`](rss/github_notifications.atom)）に変換して自動更新コミット
- RSSリーダーでお気に入りのOSSのリリースをまとめて追跡可能

### 4. GitHub CI通知の自動既読化 (`.src/change_github_notifications_to_read.py`)
毎時3分に実行され、GitHub通知ボックスのノイズを低減します。
- GitHub Actions の CI 実行完了通知（`ci_activity`）のうち、成功（`succeeded`）した通知を自動的に既読に変更

### 5. セキュリティスキャン & SBOM 生成 (`.github/workflows/security-scan.yml`)
- Syft による SBOM（Software Bill of Materials）生成
- Grype による脆弱性スキャン（High以上の脆弱性検知時にCIを停止）
- スキャン失敗時の Discord 通知

---

## 📁 ディレクトリ構成

```plaintext
.
├── .data/
│   └── haiku.log                     # 生成された俳句の履歴データ
├── .github/
│   └── workflows/                    # 各種定期実行・CIワークフロー
│       ├── bot.yml                   # Blueskyボット定期実行
│       ├── change_github_notifications_to_read.yml # CI通知既読化
│       ├── haiku.yml                 # 俳句生成 & コミット
│       ├── rss.yml                   # GitHubリリースAtomフィード生成 & コミット
│       └── security-scan.yml         # Syft / Grype セキュリティスキャン
├── .src/
│   ├── bot_bsky.py                   # Bluesky投稿ボット本体
│   ├── change_github_notifications_to_read.py # CI通知既読化スクリプト
│   ├── haiku_generator.py            # AI俳句生成スクリプト
│   └── rss_github_notifications.py   # Atomフィード生成スクリプト
├── docs/                             # 開発用メモ・技術ドキュメント
├── rss/
│   └── github_notifications.atom     # 生成されたAtomフィード
├── pyproject.toml                    # プロジェクト設定・依存パッケージ定義
├── uv.lock                           # uv ロックファイル
├── update_package.sh                 # 依存パッケージ更新スクリプト
└── README.md
```

---

## 🛠️ 開発環境・セットアップ

パッケージマネージャーとして [uv](https://docs.astral.sh/uv/) を採用しています。

### 必要要件
- Python 3.12 以上
- uv

### セットアップ手順

```bash
# リポジトリのクローン
git clone https://github.com/ibukichi-jp/ibukichi-jp.github.io.git
cd ibukichi-jp.github.io

# 依存パッケージの同期
uv sync
```

### パッケージのアップデート
付属のシェルスクリプトで最新パッケージの確認と対話的更新が可能です。

```bash
./update_package.sh
```

---

## 🔑 必要な環境変数・GitHub Secrets

GitHub Actions の実行には、以下の Secrets の設定が必要です。

| シークレット名 | 用途 |
|---|---|
| `BSKY_HANDLE` | Bluesky のハンドル名（アカウントID） |
| `BSKY_APP_PASSWORD` | Bluesky のアプリパスワード |
| `TANITA_CLIENT_ID` | タニタ Health Planet API クライアントID |
| `TANITA_CLIENT_SECRET` | タニタ Health Planet API クライアントシークレット |
| `TANITA_REFRESH_TOKEN` | タニタ Health Planet API リフレッシュトークン |
| `SAKURA_API_KEY` | さくらのAI APIキー |
| `PERSONAL_GITHUB_TOKEN` | GitHub API 操作用パーソナルアクセストークン |
| `TOKEN_FOR_WRITE` | 成果物（`haiku.log` や Atom フィード）をリポジトリへ Push するためのトークン |
| `GIT_USER_NAME` | 自動コミット用 Git ユーザー名 |
| `GIT_EMAIL` | 自動コミット用 Git メールアドレス |
| `DISCORD_URL_GITHUB` | セキュリティスキャン失敗時の Discord Webhook URL |

---

## 📄 ドキュメント
[`docs/`](docs/) 配下に各種技術メモを格納しています。
- [`docs/uv.md`](docs/uv.md): uv のコマンドリファレンスと運用ガイド
- [`docs/git-flow.md`](docs/git-flow.md): Git 運用フロー
- [`docs/code-review-point-of-view.md`](docs/code-review-point-of-view.md): コードレビューの観点
- [`docs/next-js.md`](docs/next-js.md): Next.js 関連メモ
