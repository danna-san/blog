#!/usr/bin/env node
// content/posts/*.json から docs/ を作り直す。AI は呼ばない。
//   node scripts/build.mjs [--content <dir>] [--out <dir>]
import { join, resolve } from 'node:path';
import { ROOT, loadConfig } from './lib/config.mjs';
import { buildSite } from './lib/site.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? resolve(args[i + 1]) : def; };
buildSite({
  contentDir: opt('content', join(ROOT, 'content')),
  outDir: opt('out', join(ROOT, 'docs')),
  templatesDir: join(ROOT, 'templates'),
  config: loadConfig(),
});
