# 技術方針（tech）

## 実行環境

| 用途 | 使うもの |
|---|---|
| ホスティング | GitHub Pages（`main` ブランチの `docs/` を公開） |
| 定期実行・ビルド | GitHub Actions（ubuntu-latest、Node.js 20 以上） |
| 文章生成（主） | Claude サブスクリプション + `anthropics/claude-code-action` |
| 文章生成（予備） | GitHub Models（`GITHUB_TOKEN` + `permissions: models: read`） |
| 推敲 | yomiyasu スキル（`.claude/skills/yomiyasu/` に固定版を同梱） |
| 画像縮小 | ランナー付属の ImageMagick（無ければ JS で GPS 情報だけ消す） |

## 依存ライブラリの方針（厳守）

- **npm パッケージを一切入れない。** `package.json` の dependencies / devDependencies は空のまま。ビルドスクリプトは Node.js 標準機能（`node:fs`、`fetch`、`node:test` など）だけで書く。
- **ブラウザ側も JS / CSS ライブラリ・Web フォント・CDN を使わない。** アニメーション、JSON 読み込み、メニュー、ライトボックスなどは素の JavaScript と CSS で書く。
- 例外として許可するのは次だけ。
  - `actions/checkout`（GitHub 公式）と `anthropics/claude-code-action`（Anthropic 公式）。**タグではなくコミット SHA で固定**し、横にバージョンをコメントで書く。
  - ランナー付属の ImageMagick。
  - 同梱した yomiyasu（MIT）。中身は書き換えない。更新手順は `.claude/skills/yomiyasu/VENDORED.md`。
- 例外を増やすときは、仕様（`.kiro/specs/`）で理由を書いて承認を得る。

## セキュリティ方針

- 秘密情報は GitHub の Secrets にだけ置く（`CLAUDE_CODE_OAUTH_TOKEN`）。設定ファイル・コード・ログに書かない。
- Claude に許可するツールは Read / Write と、yomiyasu の lint スクリプトの実行だけ。任意のコマンド実行（Bash 全般）は許可しない。
- AI に渡すのは、許可した書き手（既定はリポジトリ所有者）が書いた Issue とコメントだけ。他人の文章はプロンプトに入れない。
- `/publish` コマンドに反応するのは許可した書き手のコメントだけ。ワークフローの `if` とスクリプトの両方で確かめる。
- Issue 本文などの外部入力は環境変数経由で渡し、`${{ }}` でシェルに直接埋め込まない。
- `pull_request_target` は使わない。
- claude-code-action の `show_full_output` と `display_report` は `false`。
- ワークフローの `permissions` は必要最小限に絞る。
- ブラウザ側では、データから DOM を作るとき `innerHTML` を使わず `textContent` / `createElement` を使う。ビルド時の HTML 生成は必ずエスケープ関数を通す。
- ブログ用にコピーする画像からは位置情報などのメタデータを消す（元の Issue 添付は消せない点を README に書く）。

## 文章生成の流れ

1. **prepare**（Node）: Issue を集め、日ごとに素材をまとめ、メディアを保存し、依頼ファイル `.tmp/ai/requests/<date>.md` を作る。
2. **generate**（claude-code-action）: 依頼ファイルを読み、persona の文体で下書き → yomiyasu（エッセイとして）で推敲 → `.tmp/ai/responses/<date>.json` に書く。
3. **compose**（Node）: 応答を検証する。応答が無い・壊れている日は GitHub Models で生成し直す。それも失敗した日は公開しない（Issue は開いたまま残し、ジョブを失敗させて通知する）。

## 文体のカスタマイズ

文章の個性に関わることはコードに書かない。次のファイルだけで決める。

- `config/persona.md`: 上から答えていけば文体が決まる質問票。自由記述も可。
- `config/samples/*.md`: 書き手本人の過去の文章（任意）。あれば参考として AI に渡す。
- `config/banned-phrases.txt`: 使わせない言い回し。生成後に検査する。
- `blog.config.json` の `ai.rewriteLevel`: 書き直しの度合い（light / medium / full）。

## コーディング規約

- ES Modules（`.mjs`）。2 スペース。セミコロンあり。
- コメント・ログ・エラーメッセージは日本語。
- 副作用（ネットワーク・ファイル書き込み）は `scripts/lib/pipeline.mjs` と CLI に寄せ、他の lib は純粋関数に近づけてテストしやすくする。
- テストは `node --test`。新しいロジックには `tests/` にテストを足す。
