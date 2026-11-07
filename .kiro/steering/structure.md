# ディレクトリ構成（structure）

```
.
├── CLAUDE.md                 # AI エージェント向けの作業ルール（最初に読む）
├── README.md                 # 使い方・セットアップ・フォーク手順（人向け）
├── blog.config.json          # サイト名・URL・タイムゾーン・AI 設定など（秘密情報は書かない）
├── config/                   # 文体の設定（フォークしたら書き換える）
│   ├── persona.md            #   文体の質問票
│   ├── samples/              #   書き手本人の文章サンプル（任意）
│   └── banned-phrases.txt    #   使わせない言い回し
├── templates/
│   └── layout.html           # 全ページ共通の HTML。ブラウザで直接開くとサンプル記事入りで見える
├── content/
│   └── posts/YYYY-MM-DD.json # 記事データ（生成結果の正本。HTML はここから毎回作る）
├── docs/                     # ★GitHub Pages の公開フォルダ（ドキュメント置き場ではない）
│   ├── assets/css/style.css  #   手書き。ビルドで上書きされない
│   ├── assets/js/app.js      #   手書き。ビルドで上書きされない
│   ├── assets/media/YYYY/MM/ #   生成。記事の写真・動画
│   ├── data/index.json       #   生成。記事一覧・タグ（メニューとタグページが読む単一 JSON）
│   ├── index.html, archive.html, tags.html, 404.html   # 生成
│   ├── YYYY-MM-DD.html       #   生成。記事ページ
│   └── feed.xml, sitemap.xml #   生成
├── scripts/
│   ├── publish.mjs           # 公開処理の CLI（prepare / compose / finalize）
│   ├── build.mjs             # content/ → docs/ の再生成だけ（AI を呼ばない）
│   ├── preview.mjs, serve.mjs# ローカル確認用
│   ├── reset-content.mjs     # フォークした人向け: 記事を全部消す
│   └── lib/                  # 処理の部品
├── tests/                    # node --test。fixtures/ にサンプル Issue と画像
├── .claude/skills/yomiyasu/  # 同梱した推敲スキル（書き換え禁止）
├── .github/workflows/        # publish.yml / rebuild.yml / ci.yml
└── .kiro/                    # 仕様駆動開発のドキュメント（cc-sdd 互換）
    ├── steering/             #   product / tech / structure（全体方針）
    └── specs/<機能名>/        #   requirements / design / tasks / spec.json
```

## 生成物と手書きの区別

- **手書き**: `templates/`、`docs/assets/css/`、`docs/assets/js/`、`config/`、`scripts/`、`.kiro/`
- **生成（手で直さない）**: `docs/*.html`、`docs/data/`、`docs/feed.xml`、`docs/sitemap.xml`、`docs/assets/media/`
- **生成だが手で直してよい**: `content/posts/*.json`（誤字の修正など。push すると rebuild ワークフローが HTML を作り直す）

## 名前の決まり

- 記事の URL とファイル名は `YYYY-MM-DD`（日記上の日付。朝 4 時区切り）。
- 機能ごとの仕様は `.kiro/specs/<kebab-case の機能名>/`。
