# CLAUDE.md

このリポジトリは「GitHub Issue に書いたメモを、GitHub Actions と Claude が毎朝日記ブログに仕上げ、GitHub Pages で公開する」仕組みです。AI エージェントはこのファイルを最初に読んでください。

## 最初に読むもの

1. `.kiro/steering/product.md` … 何を作るか、何を大事にするか
2. `.kiro/steering/tech.md` … 技術方針・依存の禁止・セキュリティ
3. `.kiro/steering/structure.md` … ディレクトリ構成、手書きと生成物の区別
4. `.kiro/specs/<機能名>/` … 機能ごとの要件・設計・タスク

## 書き手（リポジトリ所有者）との進め方

- **書き手は対等な仲間です。** 言われたことをただ実行するのではなく、仕様の穴・矛盾・もっと良いやり方に気づいたら指摘してください。
- **不明点や判断が分かれる点は、実装の前に質問してください。** 質問は選択肢つきの QA 形式（AskUserQuestion）で行います。推測で進めて後から「実はこうしました」と報告するのは避けます。
- 後から変えられる細部は、妥当な既定値で進めてかまいません。その場合も、何を決めたかを報告に書きます。
- 返答は日本語で書きます。

## 開発の流れ（仕様駆動・cc-sdd 互換）

機能の追加や変更は、次の順で進めます。**承認なしに実装へ進まないでください。**

1. `.kiro/specs/<kebab-case の機能名>/requirements.md` … EARS 形式の要件（ID つき）
2. `design.md` … 設計（モジュール、データ形式、ワークフロー、リスク）
3. `tasks.md` … 実装タスク（要件 ID との対応つき）
4. 書き手の承認を得たら `spec.json` の approvals を更新して実装する
5. 実装後、タスクを `[x]` にし、設計と実装がずれた点は design.md を直す

小さなバグ修正や文言の修正は、仕様を作らずに直してよいです。ただし既存の要件と食い違う変更は、要件を先に直します。全体方針が変わるときは `.kiro/steering/` も更新します。

## 絶対に守ること

- **npm パッケージ・ブラウザ用ライブラリ・CDN・Web フォントを追加しない。** Node.js 標準機能と素の JS/CSS で書く。例外は `tech.md` に書かれたもの（actions/checkout、anthropics/claude-code-action、ImageMagick、同梱 yomiyasu）だけ。
- **Actions はコミット SHA で固定する**（`uses: owner/action@<sha> # vX.Y.Z`）。
- **秘密情報をファイル・ログ・コミットに書かない。** `blog.config.json` にも書かない。
- **Issue のタイトルや本文などの外部入力を `${{ }}` でシェルに直接埋め込まない。** `env:` 経由で渡す。
- **書き手以外の文章を AI に渡さない。** Claude に許可するツールを広げない（Read / Write / Skill / yomiyasu の lint だけ。`scripts/publish.mjs` の `claudeArgs()`）。
- **生成物（`docs/*.html`、`docs/data/`、`docs/assets/media/`、feed、sitemap）を手で編集しない。** テンプレート・CSS・JS・`content/posts/*.json` を直して `npm run build` する。
- **文章の個性に関わる内容をコードに書かない。** `config/persona.md`、`config/samples/`、`config/banned-phrases.txt` で扱う。
- **`.claude/skills/yomiyasu/` の中身を書き換えない。** 更新手順は同ディレクトリの `VENDORED.md`。
- AI が組み立てたことを示す表示（「AI 生成」等）を、公開されるページに出さない。

## よく使うコマンド

```bash
npm test                 # テスト（node --test）
npm run build            # content/ から docs/ を作り直す（AI を呼ばない）
npm run preview          # fixture の記事でサイトを組み立て、http://localhost:8080 で表示
npm run reset-content    # 記事を全部消す（フォークした人向け）
```

## 注意点

- `docs/` は GitHub Pages の公開フォルダです。ドキュメントは `.kiro/` と README に置きます。
- 日記上の日付は朝 4 時区切り（`publish.dayStartHour`）です。日付の計算は必ず `scripts/lib/date.mjs` を使います。
- リポジトリは公開されています。Issue・設定・ワークフローは誰でも見られる前提で設計します。
