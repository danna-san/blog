# 実装タスク: blog-core

承認後に上から順に進める。各タスクの括弧内は対応する要件 ID。完了したら `[x]` にする。

## 1. 基盤

- [ ] 1.1 `blog.config.json` と `lib/config.mjs` を設計どおりにする（PR モードの削除、`ai.fallback`、`ai.sampleMaxChars`、`publish.lookbackDays`、`commitAuthor` 関連）（R13.2）
- [ ] 1.2 `lib/date.mjs` のテスト（区切り時刻、和暦表示）（R2.1）
- [ ] 1.3 `lib/directive.mjs` を実装しテスト（R2.3〜R2.7）

## 2. 素材の収集

- [ ] 2.1 `lib/issues.mjs`: 本文分解・`#タグ`・日付指定の適用・コメントの日付・「追記」表示（R1, R2, R4.4）
- [ ] 2.2 `lib/pipeline.mjs` collect: 対象日付の決定（cron / `/publish` / `/publish 日付` / 過去日への追記 / 公開後コメント）（R3.1〜R3.4）
- [ ] 2.3 書き手以外・コマンド・skip ラベル・手で閉じた Issue の除外テスト（R1.1〜R1.4）

## 3. メディア

- [ ] 3.1 `lib/images.mjs`: 保存・冪等性・縮小・向き補正・メタデータ除去・動画サイズ上限（R7）
- [ ] 3.2 `lib/exif.mjs` のテスト（GPS が消え、向きが残る）（R7.2）

## 4. 文章生成

- [ ] 4.1 `config/persona.md`（質問票形式）、`config/samples/README.md`、`config/banned-phrases.txt` を作る（R5.1）
- [ ] 4.2 `lib/writer.mjs`: 依頼ファイル（yomiyasu の手順を含む）、lint、merge（R5）
- [ ] 4.3 `lib/ai.mjs`: GitHub Models と mock だけに整理（Anthropic API 直接呼び出しは削除）（R6.1）
- [ ] 4.4 compose: 応答検証 → 予備生成 → 失敗日の除外（R6）

## 5. サイト生成

- [ ] 5.1 `templates/layout.html`（サンプル入り）（R10.1）
- [ ] 5.2 `lib/render.mjs` / `lib/site.mjs`: 各ページ、index.json、feed、sitemap、OGP、アセットのハッシュ（R4.5, R9, R11.2）
- [ ] 5.3 `docs/assets/css/style.css`（R9.1, R10.2, R10.4, R10.5）
- [ ] 5.4 `docs/assets/js/app.js`（R9.2〜R9.4, R10.2〜R10.5）

## 6. CLI とワークフロー

- [ ] 6.1 `scripts/publish.mjs`（prepare / compose / finalize）、`build.mjs`、`preview.mjs`、`serve.mjs`、`reset-content.mjs`（R11, R13.1）
- [ ] 6.2 `.github/workflows/publish.yml`（R3, R6.2, R8, R12）
- [ ] 6.3 `.github/workflows/rebuild.yml`、`ci.yml`（R11.1）

## 7. 確認とドキュメント

- [ ] 7.1 fixture とモック AI による結合テスト、`npm run preview` で見た目を確認（スクリーンショットを共有）
- [ ] 7.2 README（セットアップ、Issue の書き方、日付指定、`/publish`、フォーク手順、トークン更新、公開リポジトリの注意）（R13.3）
- [ ] 7.3 design.md の「実装時に確かめること」を初回実行で確認し、結果を追記
