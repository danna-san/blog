# Issue から書く日記ブログ

スマホの GitHub アプリで Issue を書いておくと、毎朝 6 時に GitHub Actions がその日の日記に仕上げて、GitHub Pages で公開します。
GitHub の無料プランだけで動きます。文章は書き手の Claude サブスクリプション（失敗したときは GitHub Models の無料枠）で、書き手本人の文体に整えます。

```
Issue を書く ──▶ 毎朝 6:00 Actions ──▶ Claude が日記に仕上げる ──▶ GitHub Pages で公開
（メモ・写真）     （前日分をまとめる）    （persona の文体 + yomiyasu で推敲）  https://<ユーザー名>.github.io/<リポジトリ名>/YYYY-MM-DD.html
```

- 外部の SaaS・サーバー・npm パッケージ・JS ライブラリは使っていません（ブラウザ側も素の JavaScript と CSS だけ）。
- 仕様は `.kiro/`（要件・設計・タスク）、AI エージェント向けの作業ルールは `CLAUDE.md` にあります。

---

## 書き方

### 基本

1. GitHub アプリでこのリポジトリに **Issue を作る**。1 つの出来事につき 1 つの Issue（1 日に何件でも）。
2. タイトルは出来事の見出し、本文にメモを書き、写真や動画を添付する。
3. 翌朝 6 時ごろ、その日の Issue がまとめて 1 本の日記になり、Issue は自動で閉じられます（`published` ラベルが付きます）。

記事には、その日の出来事が時刻順に並びます。写真は Issue に添付した位置の近くに入ります。

### 追記したいとき

- **Issue にコメント**すると、そのコメントも出来事の 1 つとして記事に入ります（コメントした時刻で並びます）。
- 翌日以降のコメントは、元の Issue の日の最後に「追記」として入ります。
- 公開済みの Issue にコメントした場合も、次の実行でその日の記事が自動で作り直されます。

### 日付や時刻を指定したいとき

Issue 本文またはコメントの **1 行目** に、`@` から始まる日付・時刻を書きます（この行は記事には出ません）。

| 書き方 | 意味 |
|---|---|
| `@11/5 18:30` | 11 月 5 日の 18:30 の出来事 |
| `@2026-11-05` | 2026 年 11 月 5 日の最後に「追記」 |
| `@昨日` / `@一昨日` / `@3日前` | 書いた日から数えた日の最後に「追記」 |
| `@昨日 21時` / `@一昨日 21時30分` | その日のその時刻 |
| `@18:30` / `@21時` | 日付を省略。Issue なら投稿した日、コメントなら元の Issue の日のその時刻 |

- 日付は朝 4 時で切り替わります（深夜 2 時の投稿は前日の日記に入ります）。`@1:30` のように 4 時より前の時刻を書くと、その日の深夜として扱います。
- 公開済みの日付を指定すると、その日の記事が作り直されます。
- 未来の日付や読めない書き方は無視されます（その行は記事に出ません）。

### タグ

- Issue に **ラベル** を付けるか、本文やタイトルに **`#タグ`** と書くと、記事のタグになります（`#123` のような数字だけのものは Issue 番号とみなして無視します）。
- ヘッダーの下にはよく使うタグが並び、タグページ（`tags.html`）で絞り込めます。

### すぐ公開したいとき・作り直したいとき

| やりたいこと | 操作 |
|---|---|
| 今日の分も含めて今すぐ公開 | どれかの Issue に `/publish` とコメント |
| ある日の記事を作り直す | どれかの Issue に `/publish 2026-11-05` とコメント |
| PC から | Actions タブ → publish → Run workflow（日付・当日分を含めるかを指定可） |

`/publish` に反応するのは書き手のコメントだけです。数分で公開されます。

### 記事にしたくない Issue

- `draft` か `no-blog` のラベルを付ける（外せば次回から対象になります）
- 記事にしないまま **手で閉じる**（`published` ラベルが無い閉じた Issue は無視されます）
- タイトルが `/` で始まる Issue は記事になりません

### 公開後に文章を直したいとき

- 誤字程度なら `content/posts/YYYY-MM-DD.json` を GitHub 上で直して保存すれば、自動でページが作り直されます。
- Issue を直してから `/publish YYYY-MM-DD` で作り直すこともできます（文章は毎回少し変わります）。

---

## はじめての設定

このリポジトリをフォークした人も、同じ手順で使えます。

### 1. リポジトリを公開にして、記事を空にする

GitHub Pages を無料で使うには、リポジトリを公開（Public）にします。フォークした場合は、まず元の人の記事を消します。

```bash
npm run reset-content -- --yes
```

### 2. 設定を書き換える

- `blog.config.json` … ブログ名（`site.title`）、説明、作者名、URL（`site.baseUrl` = `https://<ユーザー名>.github.io/<リポジトリ名>`）。
- `config/persona.md` … **文体の質問票**です。上から順に答えを書くだけで文体が決まります。
- `config/samples/` … 自分が過去に書いた文章を置くと、文体の参考になります（任意）。
- `config/banned-phrases.txt` … 使わせたくない言い回し。

### 3. GitHub Pages を有効にする

Settings → Pages → Build and deployment で、Source を **Deploy from a branch**、Branch を **main / `/docs`** にします。

### 4. Actions の権限を設定する

Settings → Actions → General → Workflow permissions を **Read and write permissions** にします。

### 5. Claude のトークンを登録する

1. 手元の PC で Claude Code をインストールし、`claude setup-token` を実行して、表示されたトークンをコピーする（Claude Pro / Max のサブスクリプションが必要です）。
2. Settings → Secrets and variables → Actions → New repository secret で、名前 `CLAUDE_CODE_OAUTH_TOKEN`、値にトークンを貼る。

- このトークンは **1 年で期限が切れます**。切れると GitHub Models での生成に切り替わります（その間も公開は続きます）。期限が近づいたら同じ手順で登録し直してください。
- Secrets に登録した値は、本人も含めて誰も読み出せず、ログにも伏せ字で出ます。フォークした人にも引き継がれません。
- トークンを登録しない場合は GitHub Models だけで動きます（`blog.config.json` の `ai.provider` を `github-models` にすると、最初から GitHub Models を使います）。

### 6. 動かしてみる

Issue を 1 つ書いて、`/publish` とコメントします。Actions タブで進み具合を見られます。

---

## 見た目を変える

| ファイル | 内容 |
|---|---|
| `templates/layout.html` | 全ページ共通の HTML。ブラウザで直接開くとサンプル記事入りで見えます |
| `docs/assets/css/style.css` | 色・余白・レイアウト。色は先頭の変数でまとめて変えられます |
| `docs/assets/js/app.js` | メニュー・タグ・ライトボックスなどの動き |

変更して push すると、全ページが自動で作り直されます（AI は使いません）。

### 手元で確認する

Node.js 20 以上があれば動きます（追加のインストールは不要です）。

```bash
npm run preview
```

テスト用の Issue からサンプルのブログを組み立てて `http://localhost:8080` で表示します。

```bash
npm run serve
```

リポジトリ全体を配信します。`http://localhost:8080/templates/layout.html` でテンプレートを確認できます。

```bash
npm test
```

---

## 知っておいてほしいこと

- **リポジトリは公開されています。** 元の Issue（メモと写真）、文体の設定、ワークフローは誰でも見られます。家族の実名や住所など、知られたくないことは Issue に書かないでください。
- **写真の位置情報。** ブログに載せる写真からは位置情報などを消しますが、Issue に添付した元の写真はそのまま残ります。
- **容量。** 写真は長辺 1600px に縮小して保存しますが、GitHub Pages の公開サイトには 1GB の上限があります。何年も続けると近づくので、そのときは古い写真の扱いを考えます。
- **定期実行の時刻。** GitHub の都合で 6:00 から数十分遅れることがあります。また、リポジトリに 60 日間コミットが無いと定期実行が止まります（日記を続けていれば止まりません）。止まったら Actions タブから有効にし直してください。
- **AI が失敗した日。** Claude も GitHub Models も失敗した日は公開せず、Issue を開いたまま残します。GitHub から失敗の通知が届き、次回の実行か `/publish` で再挑戦します。
- **他の人の Issue。** 公開リポジトリには誰でも Issue を立てられますが、記事になるのは書き手（`publish.allowedAuthors`、空ならリポジトリ所有者）の Issue とコメントだけです。

## ディレクトリ

```
blog.config.json   設定            config/      文体の設定
templates/         HTML テンプレート  docs/        公開されるサイト（GitHub Pages）
content/posts/     記事データ（JSON） scripts/     ビルド用スクリプト（Node.js 標準機能のみ）
tests/             テスト          .kiro/       仕様（要件・設計・タスク）
.claude/skills/yomiyasu/  推敲スキル（nanaism/yomiyasu v2.5.0, MIT）
```

## ライセンスと謝辞

- 推敲には [yomiyasu](https://github.com/nanaism/yomiyasu)（MIT License, © nanaism）を同梱して使っています。
