# ibukichi-jp.github.io

GitHub Actions と Python (`uv`) を活用した、個人用自動化・統合ダッシュボードプラットフォームです。  
愛犬たち（いぶき・いろは）との日々の記録、体組成情報の推移グラフ、GitHub通知のRSS(Atom)フィード化、CI通知の自動既読化などを自動運用しています。

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
- **日次データ自動コミット**: 更新された体組成データを安全にプッシュ

### 2. 毎時定期バッチ (`.github/workflows/hourly.yml`)
毎時0分に起動し、通知の収集から既読化までを一括処理します。
- **GitHub リリース通知の RSS/Atom フィード化 (`.src/rss_github_notifications.py`)**: 未読通知から `Release` 種別を抽出して [`rss/github_notifications.atom`](rss/github_notifications.atom) を生成・自動コミット
- **GitHub CI通知の自動既読化 (`.src/change_github_notifications_to_read.py`)**: 成功したCI実行完了通知（`ci_activity`）を自動的に既読化
- **失敗時の通知**: どれかの処理が失敗したら、Discord に通知（失敗したことと実行ログの URL のみ）。RSS の生成や push に失敗しても、通知の既読化は実行する

### 3. push・Pull Request 時のチェック (`.github/workflows/push-check.yml`)
main への push と Pull Request のときに、Ruff（lint・フォーマット）と pytest を実行します（Discord には通知しません）。
本番用の Python ライブラリはなく、`uv.lock` にあるのは開発用（pytest・Ruff）だけです。依存パッケージの脆弱性は、GitHub の Dependabot alerts で見張っています。

### 4. アセットのバージョン更新 (`.github/workflows/asset-version.yml`)
`index.html`・`style.css`・`js/` を変更して main に push したときに起動します。
- **キャッシュ対策 (`.src/update_asset_versions.py`)**: `index.html` が読み込む `style.css` と `js/*.js` の URL に付けた `?v=<hash>` を、ファイル内容のハッシュに更新して自動コミット（詳しくは下の「キャッシュ対策（自動）」）
- **失敗時の通知**: 失敗したら、Discord に通知（失敗したことと実行ログの URL のみ）

### 5. GitHub Pages ダッシュボード (`index.html`)
GitHub Pages（[`https://ibukichi-jp.github.io`](https://ibukichi-jp.github.io)）で公開されるリアルタイムダッシュボードです。Bootstrap 5によるレスポンシブなダークテーマデザインを採用しています。
- **ヘッダー**: GitHubプロフィールへのアバターリンク、リアルタイム秒刻みデジタル時計
- **Blueskyの投稿**: Bluesky 公開API（`public.api.bsky.app` / 認証不要）から [@bsky.ibukichi.jp](https://bsky.app/profile/bsky.ibukichi.jp) の直近3件の自分の投稿（返信・リポストを除く。引用リポストは表示）を取得して表示。リンク・メンション・ハッシュタグ、画像・動画サムネイル・リンクカード・引用投稿に対応。カード内の @ハンドル からプロフィールへ移動可能
- **ライフステージ**: JST（日本標準時）基準で自動算出される、結婚してから（2014/06/27〜）の経過日数および「X年Yヶ月Z日」のリアルタイム表示カード。左側に写真スペース（光彩リング装飾・フォールバック対応）を配置
- **愛犬たちとの日々**: JST基準で自動算出される、いぶきと暮らした日数（2021/12/09〜2025/01/14の1,133日間 [3年1ヶ月5日] のメモリアル）、いろはと暮らし始めてからのカウントアップ（2025/03/10〜）、ワン公と別れてからの経過年数（2003/02/11〜の「X年Yヶ月Z日」表示）の3連カード。写真アセット（光彩リング装飾・フォールバック対応）を左側に配置
- **体組成情報可視化**: [`.data/tanita.json`](.data/tanita.json) に蓄積された過去全データを Chart.js でインタラクティブにグラフ化（体重・体脂肪率の2連グラフ）
- **5大KPIカード**: 身長、体重（目標67.4kg = 身長と目標BMIから算出）、体脂肪率（目標19.9%）、BMI（目標22.0）、最新測定日時を表示
- **期間絞り込み**: 年単位（初期値: 現在の年）のドロップダウンによる推移トレンドの即時フィルタリング
- **モバイル対応横スライドUI**: スマートフォン閲覧時には各セクションを左右スワイプまたはカード横の矢印アイコン（‹ ›）で直感的に切り替え可能（下部ドットインジケーター連動、PC時は通常の縦並び一覧表示）。ドットはセクションから自動生成されるため、セクションの追加・並べ替え時に手直しは不要

#### ダッシュボードの変更ポイント
| 変更したいこと | 編集する場所 |
|---|---|
| 記念日カードの追加・変更（ライフステージ / 愛犬） | [`js/anniversaries.js`](js/anniversaries.js) の `ANNIVERSARIES` に1行追加・変更 |
| 体重・体脂肪率・BMI の目標値 | [`js/health.js`](js/health.js) の `HEALTH_CONFIG`（目標体重は身長と目標BMIから自動計算） |
| Bluesky の表示件数・アカウント | [`js/bluesky.js`](js/bluesky.js) の `BLUESKY_HANDLE` / `BLUESKY_DISPLAY_COUNT` |
| セクションの追加・並べ替え | `index.html` の `.dashboard-slide-item` を追加・移動（スマホのドットは自動追従） |

#### 外部ライブラリ（`assets/vendor/`）
Bootstrap と Chart.js は CDN を使わず、npm パッケージのファイルをそのまま `assets/vendor/<名前>-<バージョン>/` に置いて配信しています。`index.html` の `integrity` 属性で、ファイルが意図せず変わっていないかをブラウザが確かめます。
バージョンを上げるときは、次の手順で入れ替えます。
1. npm のパッケージ（`https://registry.npmjs.org/<名前>/<バージョン>` の `dist.tarball`）を取得し、`dist.integrity` と一致することを確かめる
2. 必要なファイルを新しいバージョンのフォルダに置き、古いフォルダを削除する
3. `index.html` のパスと `integrity`（`openssl dgst -sha384 -binary <ファイル> | openssl base64 -A` の値に `sha384-` を付けたもの）を書き換え、`python3 .src/update_asset_versions.py` を実行する

#### キャッシュ対策（自動）
`index.html` が読み込む `style.css` と `js/*.js` の URL には、ファイル内容のハッシュ（`?v=<hash>`）が付きます。CSS / JS を変更して main に push すると、[`asset-version.yml`](.github/workflows/asset-version.yml) が [`.src/update_asset_versions.py`](.src/update_asset_versions.py) でハッシュを自動更新してコミットします（手で書き換える必要はありません）。ローカルで先に更新する場合は `python3 .src/update_asset_versions.py` を実行します。

---

## 📁 ディレクトリ構成

```plaintext
.
├── assets/
│   ├── images/                       # 写真アセット（結婚写真・いぶき・いろは・ワン公）
│   └── vendor/                       # 外部ライブラリ（Bootstrap 5.3.3・Chart.js 4.4.1。CDN は使わずここから配信）
├── .data/
│   └── tanita.json                   # 蓄積された体重・体脂肪率のヘルスデータ
├── .github/
│   ├── actions/
│   │   └── commit-and-push/          # 変更をコミットして GITHUB_TOKEN で push する共通部品
│   └── workflows/                    # 各種定期実行・CIワークフロー
│       ├── asset-version.yml         # CSS/JS 変更時に index.html の ?v= を内容ハッシュで自動更新
│       ├── daily.yml                 # 日次定期実行（タニタ同期）
│       ├── hourly.yml                # 毎時定期実行（RSS生成 & CI通知既読化）
│       ├── notify-failure.yml        # 失敗時の Discord 通知（各ワークフローから呼び出す共通部品）
│       └── push-check.yml            # push・PR 時のチェック（Ruff・pytest）
├── .src/
│   ├── change_github_notifications_to_read.py # CI通知既読化スクリプト
│   ├── rss_github_notifications.py   # Atomフィード生成スクリプト
│   ├── tanita_sync.py                # タニタデータ取得・保存スクリプト
│   ├── update_asset_versions.py      # index.html の CSS/JS 参照に内容ハッシュを付与
│   └── update_manager.py             # 対話型パッケージ更新マネージャー
├── docs/                             # 開発用メモ・技術ドキュメント
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
│   ├── bluesky.js                    # Bluesky の投稿
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
| `PERSONAL_GITHUB_TOKEN` | GitHub API 操作用パーソナルアクセストークン |
| `GIT_USER_NAME` | 自動コミット用 Git ユーザー名 |
| `GIT_EMAIL` | 自動コミット用 Git メールアドレス |
| `DISCORD_URL_GITHUB` | Discord Webhook URL（各ワークフローの失敗通知） |

---

## 📄 ドキュメント
[`docs/`](docs/) 配下に各種技術メモを格納しています。
- [`docs/uv.md`](docs/uv.md): uv のコマンドリファレンスと運用ガイド
- [`docs/git-flow.md`](docs/git-flow.md): Git 運用フロー
- [`docs/code-review-point-of-view.md`](docs/code-review-point-of-view.md): コードレビューの観点
- [`docs/next-js.md`](docs/next-js.md): Next.js 関連メモ
