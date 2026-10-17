# ibukichi-jp.github.io

GitHub Actions と Python (`uv`) を活用した、個人用自動化・ダッシュボードプラットフォームです。  
Blueskyへの定期投稿ボット、AIによる日々の俳句生成、GitHub通知のRSS(Atom)フィード化、CI通知の自動既読化などを自動運用しています。

---

## 🚀 主な機能

### 1. 日次定期バッチ (`.github/workflows/daily.yml`)
毎日定刻（JST 9:00）に起動し、以下の処理を順次実行してデータを自動コミットします。
- **タニタ体組成データ自動同期 (`.src/tanita_sync.py`)**: 体組成計で計測した直近データを取得し、[`.data/tanita.json`](.data/tanita.json) にマージして蓄積
- **さくらのAI 俳句生成器 (`.src/haiku_generator.py`)**: さくらのクラウド 高火力AIサービス（OpenAI互換API / `gpt-oss-120b`）を利用し、日付と季節に合わせた俳句を生成して [`.data/haiku.log`](.data/haiku.log) に蓄積
- **日次データ自動コミット**: 更新された体組成データと俳句ログを1回のコミットで安全にプッシュ
- **Bluesky 自動投稿ボット (`.src/bot_bsky.py`)**: `jpholiday` による日本の祝日判定および月末金曜日のプレミアムフライデー判定・お知らせをBlueskyに自動ポスト

### 2. 毎時定期バッチ (`.github/workflows/hourly.yml`)
毎時0分に起動し、通知の収集から既読化までを一括処理します。
- **GitHub リリース通知の RSS/Atom フィード化 (`.src/rss_github_notifications.py`)**: 未読通知から `Release` 種別を抽出して [`rss/github_notifications.atom`](rss/github_notifications.atom) を生成・自動コミット
- **GitHub CI通知の自動既読化 (`.src/change_github_notifications_to_read.py`)**: 成功したCI実行完了通知（`ci_activity`）を自動的に既読化

### 3. セキュリティスキャン & SBOM 生成 (`.github/workflows/security-scan.yml`)
- Syft による SBOM（Software Bill of Materials）生成
- Grype による脆弱性スキャン（High以上の脆弱性検知時にCIを停止）
- スキャン失敗時の Discord 通知

### 4. GitHub Pages ダッシュボード (`index.html`)
GitHub Pages（[`https://ibukichi-jp.github.io`](https://ibukichi-jp.github.io)）で公開されるリアルタイムダッシュボードです。Bootstrap 5によるレスポンシブなダークテーマデザインを採用しています。
- **ヘッダー**: GitHubプロフィールアイコン連携、リアルタイム秒刻みデジタル時計
- **タニタ体組成データ可視化**: [`.data/tanita.json`](.data/tanita.json) に蓄積された過去2年分の全データを Chart.js でインタラクティブにグラフ化（体重・体脂肪率・筋肉量の3連グラフ）
- **5大KPIカード**: 身長、体重（目標67.4kg）、体脂肪率（目標19.9%）、BMI（目標22.0）、筋肉量の現在値を表示
- **期間絞り込み**: 年単位（初期値: 現在の年）のドロップダウンによる推移トレンドの即時フィルタリング
- **今日の一句（AIが作成）**: 毎朝生成される最新の俳句と過去アーカイブの閲覧

---

## 📁 ディレクトリ構成

```plaintext
.
├── .data/
│   ├── haiku.log                     # 生成された俳句の履歴データ
│   └── tanita.json                   # 蓄積された体重・体脂肪率のヘルスデータ
├── .github/
│   └── workflows/                    # 各種定期実行・CIワークフロー
│       ├── daily.yml                 # 日次定期実行（タニタ同期・俳句生成・Bluesky投稿）
│       ├── hourly.yml                # 毎時定期実行（RSS生成 & CI通知既読化）
│       └── security-scan.yml         # Syft / Grype セキュリティスキャン
├── .src/
│   ├── bot_bsky.py                   # Bluesky投稿ボット本体
│   ├── change_github_notifications_to_read.py # CI通知既読化スクリプト
│   ├── haiku_generator.py            # AI俳句生成スクリプト
│   ├── rss_github_notifications.py   # Atomフィード生成スクリプト
│   └── tanita_sync.py                # タニタデータ取得・保存スクリプト
├── docs/                             # 開発用メモ・技術ドキュメント
├── rss/
│   └── github_notifications.atom     # 生成されたAtomフィード
├── .nojekyll                         # GitHub Pages用Jekyll無効化ファイル
├── index.html                        # GitHub Pages ダッシュボード本体
├── style.css                         # ダッシュボード用スタイルシート
├── app.js                            # ダッシュボード用ロジック（Chart.js / データ連携）
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
