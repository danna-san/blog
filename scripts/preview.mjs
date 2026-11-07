#!/usr/bin/env node
// fixture の Issue からサンプルのブログを .preview/ に組み立てて表示する（AI はモック）。
//   npm run preview            … 組み立てて http://localhost:8080 で表示
//   npm run preview -- --build … 組み立てるだけ
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadConfig } from './lib/config.mjs';
import { createFixtureGitHub } from './lib/fixture-github.mjs';
import { collect, prepare, compose } from './lib/pipeline.mjs';
import { serve } from './serve.mjs';

const base = join(ROOT, '.preview');
const out = join(base, 'site');
const content = join(base, 'content');
const work = join(base, 'work');
rmSync(base, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(ROOT, 'docs/assets/css'), join(out, 'assets/css'), { recursive: true });
cpSync(join(ROOT, 'docs/assets/js'), join(out, 'assets/js'), { recursive: true });

const config = loadConfig();
config.ai.provider = 'mock';
config.site.baseUrl = '';
const fixture = join(ROOT, 'tests/fixtures/issues.json');
const gh = createFixtureGitHub(fixture);
const now = new Date('2026-11-09T00:00:00Z');
const quiet = { log() {}, warn() {}, error: console.error };
const collected = await collect({ gh, config, contentDir: content, now, mode: 'scheduled', log: quiet });
await prepare({ gh, config, contentDir: content, outDir: out, workDir: work, fixtureDir: join(ROOT, 'tests/fixtures'), collected, log: quiet });
await compose({ config, contentDir: content, outDir: out, templatesDir: join(ROOT, 'templates'), workDir: work, now, log: console });

if (!process.argv.includes('--build')) serve(out, 8080);
