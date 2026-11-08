# ibukichi-jp.github.io

GitHub Actions と Python (`uv`) を活用した、個人用自動化・統合ダッシュボードプラットフォームです。  
愛犬たち（いぶき・いろは）との日々の記録、体組成情報の推移グラフ、さくらの高火力AIによる日々の俳句生成、GitHub通知のRSS(Atom)フィード化、CI通知の自動既読化などを自動運用しています。

---

## 🚀 主な機能

### 1. 日次定期バッチ (`.github/workflows/daily.yml`)
毎日定刻（JST 9:00）に起動し、以下の処理を実行してデータを自動コミットします。
タニタの同期スクリプトは標準ライブラリだけで動くため、書き込み権限のあるジョブでも PyPI の依存パッケージ（外部のコード）を一切動かしません。

| ジョブ | 権限 | 内容 |
|---|---|---|
| `sync` | 書き込み | タニタのデータを取得して `.data/tanita.json` を更新し、変更があればコミットして push。タニタの秘密は取得のステップだけ、push 用の `GITHUB_TOKEN` は `gh auth setup-git` 経由で push のステップだけに渡す（URL・設定ファイルには書かない） |
| `notify` | なし | `sync` が失敗したときだけ動き、Discord に通知（失敗したことと実行ログの URL のみ） |

- **タニタ体組成データ自動同期 (`.src/tanita_sync.py`)**: 体組成計で計測した直近データを取得し、[`.data/tanita.json`](.data/tanita.json) にマージして蓄積
- **さくらのAI 俳句生成器 (`.src/haiku_generator.py`)**: さくらのクラウド 高火力AIサービス（OpenAI互換API / `gpt-oss-120b`）を利用し、日付と季節に合わせた俳句を生成して [`.data/haiku.log`](.data/haiku.log) に蓄積
- **ブログ記事の取得 (`.src/blog_feed.py`)**: ブログ（[blog.ibukichi.jp](https://blog.ibukichi.jp/)）の Atom フィードから最新を含む直近3件の記事（タイトル・URL・投稿日・抜粋・サムネイル）を取得して [`.data/blog.json`](.data/blog.json) に保存。取得時刻などは書き出さないため、記事が増えた・変わった日だけ差分が発生。取得失敗時は既存データを保持
- **脆弱性ウォッチ (`.src/vuln_watch.py`)**: 監視している技術の脆弱性情報を各プロジェクトの公式発表から取得し、新しく出たものがあれば日次レポート（[`vulnerabilities/`](vulnerabilities/)）を作成（詳しくは下記「5. 脆弱性ウォッチ」）
- **日次データ自動コミット**: 更新された体組成データ・俳句ログ・ブログ記事データ・脆弱性レポートを1回のコミットで安全にプッシュ
- **脆弱性レポートの Discord 通知**: レポートを作成した日だけ、GitHub Pages への反映を待ってからレポートの URL を Discord に通知

### 2. 毎時定期バッチ (`.github/workflows/hourly.yml`)
毎時0分に起動し、通知の収集から既読化までを一括処理します。
- **GitHub リリース通知の RSS/Atom フィード化 (`.src/rss_github_notifications.py`)**: 未読通知から `Release` 種別を抽出して [`rss/github_notifications.atom`](rss/github_notifications.atom) を生成・自動コミット
- **GitHub CI通知の自動既読化 (`.src/change_github_notifications_to_read.py`)**: 成功したCI実行完了通知（`ci_activity`）を自動的に既読化

### 3. セキュリティスキャン & AI自動修正PR (`.github/workflows/security-scan.yml`)
- **Syft**: 依存関係から SBOM（Software Bill of Materials）を生成
- **Grype**: SBOM から脆弱性（CVE）をスキャン
- **さくらのAI による脆弱性自動要約**: High 以上の脆弱性を検知した場合、さくらの高火力AIが CVE の内容・攻撃リスク・修正方針を日本語で要約
- **Discord 即時アラート**: AI の要約解説および修正 PR へのリンクを Discord に即時通知
- **自動修正 Pull Request 作成**: 影響を受けるパッケージのパッチを自動適用した修正ブランチを作成し、Pull Request を自動起票

### 4. GitHub Pages ダッシュボード (`index.html`)
GitHub Pages（[`https://ibukichi-jp.github.io`](https://ibukichi-jp.github.io)）で公開されるリアルタイムダッシュボードです。Bootstrap 5によるレスポンシブなダークテーマデザインを採用しています。
- **ヘッダー**: GitHubプロフィールへのアバターリンク、リアルタイム秒刻みデジタル時計
- **Blueskyの投稿**: Bluesky 公開API（`public.api.bsky.app` / 認証不要）から [@bsky.ibukichi.jp](https://bsky.app/profile/bsky.ibukichi.jp) の直近3件の自分の投稿（返信・リポストを除く。引用リポストは表示）を取得して表示。リンク・メンション・ハッシュタグ、画像・動画サムネイル・リンクカード・引用投稿に対応。カード内の @ハンドル からプロフィールへ移動可能
- **ブログの記事**: [`.data/blog.json`](.data/blog.json)（日次CIで更新）を読み込み、直近3件の記事のサムネイル・投稿日・タイトル（記事へのリンク）・抜粋を表示
- **ライフステージ**: JST（日本標準時）基準で自動算出される、結婚してから（2014/06/27〜）の経過日数および「X年Yヶ月Z日」のリアルタイム表示カード。左側に写真スペース（光彩リング装飾・フォールバック対応）を配置
- **愛犬たちとの日々**: JST基準で自動算出される、いぶきと暮らした日数（2021/12/09〜2025/01/14の1,133日間 [3年1ヶ月5日] のメモリアル）、いろはと暮らし始めてからのカウントアップ（2025/03/10〜）、ワン公と別れてからの経過年数（2003/02/11〜の「X年Yヶ月Z日」表示）の3連カード。写真アセット（光彩リング装飾・フォールバック対応）を左側に配置
- **体組成情報可視化**: [`.data/tanita.json`](.data/tanita.json) に蓄積された過去全データを Chart.js でインタラクティブにグラフ化（体重・体脂肪率の2連グラフ）
- **5大KPIカード**: 身長、体重（目標67.4kg = 身長と目標BMIから算出）、体脂肪率（目標19.9%）、BMI（目標22.0）、最新測定日時を表示
- **期間絞り込み**: 年単位（初期値: 現在の年）のドロップダウンによる推移トレンドの即時フィルタリング
- **今日の一句（AIが作成）**: 毎朝生成される最新の俳句と過去アーカイブの閲覧、Twitter (X) および Bluesky へのワンクリックシェア機能
- **モバイル対応横スライドUI**: スマートフォン閲覧時には各セクションを左右スワイプまたはカード横の矢印アイコン（‹ ›）で直感的に切り替え可能（下部ドットインジケーター連動、PC時は通常の縦並び一覧表示）。ドットはセクションから自動生成されるため、セクションの追加・並べ替え時に手直しは不要

#### ダッシュボードの変更ポイント
| 変更したいこと | 編集する場所 |
|---|---|
| 記念日カードの追加・変更（ライフステージ / 愛犬） | [`js/anniversaries.js`](js/anniversaries.js) の `ANNIVERSARIES` に1行追加・変更 |
| 体重・体脂肪率・BMI の目標値 | [`js/health.js`](js/health.js) の `HEALTH_CONFIG`（目標体重は身長と目標BMIから自動計算） |
| Bluesky の表示件数・アカウント | [`js/bluesky.js`](js/bluesky.js) の `BLUESKY_HANDLE` / `BLUESKY_DISPLAY_COUNT` |
| ブログの表示件数 | [`js/blog.js`](js/blog.js) の `BLOG_DISPLAY_COUNT`（取得件数は `.src/blog_feed.py` の `POST_COUNT`） |
| セクションの追加・並べ替え | `index.html` の `.dashboard-slide-item` を追加・移動（スマホのドットは自動追従） |

#### キャッシュ対策（自動）
`index.html` が読み込む `style.css` と `js/*.js` の URL には、ファイル内容のハッシュ（`?v=<hash>`）が付きます。CSS / JS を変更して main に push すると、[`asset-version.yml`](.github/workflows/asset-version.yml) が [`.src/update_asset_versions.py`](.src/update_asset_versions.py) でハッシュを自動更新してコミットします（手で書き換える必要はありません）。ローカルで先に更新する場合は `python3 .src/update_asset_versions.py` を実行します。

### 5. 脆弱性ウォッチ（`.src/vuln_watch.py` / [`vulnerabilities/`](vulnerabilities/)）
指定した技術の脆弱性情報を、**各プロジェクト自身の公式発表**から毎日（日次バッチ）取得し、新しく出たものを Markdown のレポートにまとめます。
- **監視対象**: [`.data/vuln_watchlist.toml`](.data/vuln_watchlist.toml) で設定（現在: Node.js / Next.js / TypeScript / Python / Django）。レポートに載せる深刻度の下限 `min_severity` もここで変更できます

| 技術 | 取得元（公式の一次情報） | 深刻度・バージョンの取得元 |
|---|---|---|
| Node.js | 公式フィード `nodejs.org/en/feed/vulnerability.xml`（リリース予告を含む） | Node.js Security WG の CVE 一覧 / 予告記事の本文 |
| Next.js / TypeScript | GitHub Advisory Database（npm の `next` / `typescript`） | 各 Advisory |
| Python（CPython） | PSF 公式アドバイザリ（`psf/advisory-database`） | PSF が登録した CVE レコード（cve.org） |
| Django | 公式ブログ RSS のセキュリティリリース記事 | 記事本文（`severity "moderate"` など） |

- **AI の役割**: 脆弱性を探すのは公式データのみ。さくらのAI（`gpt-oss-120b`）は取得した公式情報をもとに、日本語のタイトルと要約を作るだけ（AI が失敗してもレポートは作成）
- **レポート**: `vulnerabilities/YYYY/YYYY-MM-DD.md`（一覧表: 日時・技術・修正版・CVE・内容 ／ 詳細: 影響を受けるバージョン・AI要約・公式リンク）。新しい脆弱性がない日は作成しない
- **閲覧ページ**: [`https://ibukichi-jp.github.io/vulnerabilities/`](https://ibukichi-jp.github.io/vulnerabilities/)（一覧）／ `?report=YYYY/YYYY-MM-DD` で各レポート
- **セキュリティ対策**: 公式情報や AI の応答に細工があっても、レポートにリンク・画像・見出しなどを差し込めないよう外部の文字列は1行のただの文字として書き出し（文中の URL は `https[:]//` 表記）、閲覧ページでは DOMPurify による無害化・画像等のタグの禁止・CSP・SRI で二重に防御。取得先は公式ドメインに限定し、Discord 通知のメンションは無効化
- **注意**: 監視対象とレポートは公開されます。`.data/vuln_watchlist.toml` に本番環境の正確なバージョンなどは書かないでください
- **重複防止**: 一度記録した脆弱性は [`.data/vuln_seen.json`](.data/vuln_seen.json) に残し、二度とレポートに載せない。監視対象に技術を追加した直後は、その技術の既存分を既読にするだけ（翌日以降に出たものから掲載）

---

## 📁 ディレクトリ構成

```plaintext
.
├── assets/
│   └── images/                       # 写真アセット（結婚写真・いぶき・いろは・ワン公）
├── .data/
│   ├── blog.json                     # ブログの直近記事データ（3件）
│   ├── vuln_seen.json                # 脆弱性ウォッチの既読記録（重複レポート防止）
│   ├── vuln_watchlist.toml           # 脆弱性ウォッチの監視対象・深刻度の下限
│   ├── haiku.log                     # 生成された俳句の履歴データ
│   └── tanita.json                   # 蓄積された体重・体脂肪率のヘルスデータ
├── .github/
│   └── workflows/                    # 各種定期実行・CIワークフロー
│       ├── asset-version.yml         # CSS/JS 変更時に index.html の ?v= を内容ハッシュで自動更新
│       ├── daily.yml                 # 日次定期実行（タニタ同期・俳句生成・ブログ記事取得・脆弱性ウォッチ）
│       ├── hourly.yml                # 毎時定期実行（RSS生成 & CI通知既読化）
│       ├── lint.yml                  # コード静的解析・構文チェック（Ruff）
│       ├── test.yml                  # 単体テスト自動実行（pytest）
│       └── security-scan.yml         # Syft / Grype スキャン & AI自動修正PR
├── .src/
│   ├── blog_feed.py                  # ブログ直近記事取得スクリプト
│   ├── change_github_notifications_to_read.py # CI通知既読化スクリプト
│   ├── haiku_generator.py            # AI俳句生成スクリプト
│   ├── rss_github_notifications.py   # Atomフィード生成スクリプト
│   ├── security_auto_remediate.py    # 脆弱性検知時のAI要約 & 自動PR作成スクリプト
│   ├── tanita_sync.py                # タニタデータ取得・保存スクリプト
│   ├── vuln_watch.py                 # 脆弱性ウォッチ（公式情報の取得・レポート作成・Discord通知）
│   ├── update_asset_versions.py      # index.html の CSS/JS 参照に内容ハッシュを付与
│   └── update_manager.py             # 対話型パッケージ更新マネージャー
├── docs/                             # 開発用メモ・技術ドキュメント
├── vulnerabilities/
│   ├── index.html                    # 脆弱性レポートの閲覧ページ（GitHub Pages / CSP・SRI 付き）
│   ├── viewer.js                     # 閲覧ページのロジック（Markdown の無害化表示）
│   ├── index.json                    # レポートの一覧（CI が更新）
│   └── YYYY/YYYY-MM-DD.md            # 日次の脆弱性レポート（新規がある日のみ）
├── rss/
│   └── github_notifications.atom     # 生成されたAtomフィード
├── .nojekyll                         # GitHub Pages用Jekyll無効化ファイル
├── index.html                        # GitHub Pages ダッシュボード本体
├── style.css                         # ダッシュボード用スタイルシート
├── js/                               # ダッシュボード用ロジック（読み込み順は index.html の通り）
│   ├── utils.js                      # 共通部品（DOM生成・URL検証・日本時間の日付処理）
│   ├── clock.js                      # ヘッダーのデジタル時計
│   ├── anniversaries.js              # 記念日カード（ライフステージ・愛犬）
│   ├── health.js                     # 体組成 KPI・推移グラフ（Chart.js）・年の絞り込み
│   ├── haiku.js                      # 今日の一句・アーカイブ・SNSシェア
│   ├── bluesky.js                    # Bluesky の投稿
│   ├── blog.js                       # ブログの記事
│   ├── slider.js                     # スマホ用横スライダー（ドット自動生成）
│   └── main.js                       # 初期化（エントリーポイント）
├── pyproject.toml                    # プロジェクト設定・依存パッケージ定義
├── uv.lock                           # uv ロックファイル
├── update_package.sh                 # 対話型パッケージ更新スクリプト
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

### コード品質チェック・自動整形（Ruff）
Python 3.12 基準の静的解析およびフォーマッターとして [Ruff](https://docs.astral.sh/ruff/) を導入しています。

```bash
# 静的解析チェック
uv run ruff check .

# 自動修正
uv run ruff check --fix .

# コードフォーマット
uv run ruff format .
```

---

## 🔑 必要な環境変数・GitHub Secrets

GitHub Actions の実行には、以下の Secrets の設定が必要です。

| シークレット名 | 用途 |
|---|---|
| `TANITA_CLIENT_ID` | タニタ Health Planet API クライアントID |
| `TANITA_CLIENT_SECRET` | タニタ Health Planet API クライアントシークレット |
| `TANITA_REFRESH_TOKEN` | タニタ Health Planet API リフレッシュトークン |
| `SAKURA_API_KEY` | さくらのAI APIキー |
| `PERSONAL_GITHUB_TOKEN` | GitHub API 操作用パーソナルアクセストークン |
| `TOKEN_FOR_WRITE` | 毎時バッチ・アセットのバージョン更新の push 用に指定されているトークン（日次バッチは `GITHUB_TOKEN` で push するため使用しない） |
| `GIT_USER_NAME` | 自動コミット用 Git ユーザー名 |
| `GIT_EMAIL` | 自動コミット用 Git メールアドレス |
| `DISCORD_URL_GITHUB` | Discord Webhook URL（各バッチの失敗通知・セキュリティスキャン・脆弱性レポートの作成通知） |

---

## 📄 ドキュメント
[`docs/`](docs/) 配下に各種技術メモを格納しています。
- [`docs/uv.md`](docs/uv.md): uv のコマンドリファレンスと運用ガイド
- [`docs/git-flow.md`](docs/git-flow.md): Git 運用フロー
- [`docs/code-review-point-of-view.md`](docs/code-review-point-of-view.md): コードレビューの観点
- [`docs/next-js.md`](docs/next-js.md): Next.js 関連メモ
