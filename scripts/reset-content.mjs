#!/usr/bin/env node
// フォークした人向け: 記事データ・生成ページ・メディアを消して、空のブログに戻す。
//   npm run reset-content -- --yes
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadConfig } from './lib/config.mjs';
import { buildSite } from './lib/site.mjs';

if (!process.argv.includes('--yes')) {
  console.log('記事・生成ページ・写真をすべて削除します。よければ --yes を付けて実行してください。');
  console.log('  npm run reset-content -- --yes');
  process.exit(0);
}
const posts = join(ROOT, 'content/posts');
if (existsSync(posts)) for (const f of readdirSync(posts)) if (f.endsWith('.json')) rmSync(join(posts, f));
const docs = join(ROOT, 'docs');
for (const f of readdirSync(docs)) if (/^\d{4}-\d{2}-\d{2}\.html$/.test(f)) rmSync(join(docs, f));
for (const p of ['data', 'assets/media', 'feed.xml', 'sitemap.xml']) rmSync(join(docs, p), { recursive: true, force: true });
buildSite({ contentDir: join(ROOT, 'content'), outDir: docs, templatesDir: join(ROOT, 'templates'), config: loadConfig() });
console.log('空のブログに戻しました。blog.config.json と config/ を書き換えてから使い始めてください。');
