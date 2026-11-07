// fixture の Issue とモック AI で、収集 → 準備 → 組み立て → 後処理 を通しで確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, normalizeConfig } from '../scripts/lib/config.mjs';
import { createFixtureGitHub } from '../scripts/lib/fixture-github.mjs';
import { collect, prepare, compose, finalize } from '../scripts/lib/pipeline.mjs';
import { decideMode } from '../scripts/publish.mjs';

const FIXTURE = join(ROOT, 'tests/fixtures/issues.json');
const quiet = { log() {}, warn() {}, error() {} };
const style = { persona: '', banned: [], samples: [] };

function setup(aiProvider = 'mock') {
  const dir = mkdtempSync(join(tmpdir(), 'blog-test-'));
  const config = normalizeConfig({ site: { title: 'テスト', baseUrl: 'https://example.com/blog' }, ai: { provider: aiProvider, fallback: { provider: 'mock' } } });
  return { dir, config, content: join(dir, 'content'), out: join(dir, 'site'), work: join(dir, 'work'), gh: createFixtureGitHub(FIXTURE) };
}

async function runAll(ctx, opts) {
  const collected = await collect({ gh: ctx.gh, config: ctx.config, contentDir: ctx.content, log: quiet, ...opts });
  await prepare({ gh: ctx.gh, config: ctx.config, contentDir: ctx.content, outDir: ctx.out, workDir: ctx.work, fixtureDir: join(ROOT, 'tests/fixtures'), collected, style, log: quiet });
  return { collected, result: await compose({ config: ctx.config, contentDir: ctx.content, outDir: ctx.out, templatesDir: join(ROOT, 'templates'), workDir: ctx.work, style, now: opts.now, log: quiet }) };
}

test('定期実行: 前日までの記事を作り、対象外の Issue は入れない（R1, R2, R3.1）', async () => {
  const ctx = setup();
  const now = new Date('2026-11-09T00:00:00Z'); // JST 11/9 9:00
  const { result } = await runAll(ctx, { now, mode: 'scheduled' });
  assert.deepEqual(result.published, ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.deepEqual(result.closeIssues.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]); // 他人(#7)・draft(#8)・/publish(#9)・当日(#10)は含まない
  assert.equal(result.commitMessage, '11/5、11/6、11/7、11/8 の日記');

  const p6 = JSON.parse(readFileSync(join(ctx.content, 'posts/2026-11-06.json'), 'utf8'));
  assert.deepEqual(p6.entries.map((e) => e.label), ['09:20', '11:00', '12:40', '02:10']); // 2:10 は前日扱い
  assert.ok(!JSON.stringify(p6).includes('他人のコメント'));
  assert.deepEqual(p6.tags, ['散歩', 'ラーメン']);
  const p5 = JSON.parse(readFileSync(join(ctx.content, 'posts/2026-11-05.json'), 'utf8'));
  assert.equal(p5.entries[0].label, '21:00'); // @一昨日 21時
  const p7 = JSON.parse(readFileSync(join(ctx.content, 'posts/2026-11-07.json'), 'utf8'));
  assert.equal(p7.entries.at(-1).label, '追記'); // 翌日のコメント
  assert.equal(p7.entries[0].blocks.filter((b) => b.type === 'image').length, 2);
  const p8 = JSON.parse(readFileSync(join(ctx.content, 'posts/2026-11-08.json'), 'utf8'));
  assert.equal(p8.entries[0].label, '18:30'); // @18:30

  const html = readFileSync(join(ctx.out, '2026-11-07.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="assets\/css\/style\.css\?v=/);
  assert.match(html, /<meta name="blog-root" content="">/);
  assert.match(html, /og:image" content="https:\/\/example\.com\/blog\/assets\/media\/2026\/11\//);
  assert.doesNotMatch(html, /\{\{|<!--@|<!--#|mock|AI/);
  const img = p7.entries[0].blocks.find((b) => b.type === 'image');
  assert.ok(existsSync(join(ctx.out, img.src)));
  assert.ok(img.width > 0 && img.height > 0);
  const index = JSON.parse(readFileSync(join(ctx.out, 'data/index.json'), 'utf8'));
  assert.equal(index.posts[0].date, '2026-11-08');
  for (const f of ['index.html', 'archive.html', 'tags.html', '404.html', 'feed.xml', 'sitemap.xml', '.nojekyll']) assert.ok(existsSync(join(ctx.out, f)), f);

  await finalize({ gh: ctx.gh, config: ctx.config, result, log: quiet });
  assert.ok(ctx.gh.calls.some((c) => c[0] === 'close' && c[1] === 5));
  assert.ok(!ctx.gh.calls.some((c) => c[0] === 'comment')); // コメントを残さない（R8.2）
  rmSync(ctx.dir, { recursive: true, force: true });
});

test('/publish: 当日分も含める（R3.2）', async () => {
  const ctx = setup();
  const { result } = await runAll(ctx, { now: new Date('2026-11-09T00:00:00Z'), mode: 'publish' });
  assert.ok(result.published.includes('2026-11-09'));
  rmSync(ctx.dir, { recursive: true, force: true });
});

test('公開後に付いたコメントで、その日を作り直す（R3.4）', async () => {
  const ctx = setup();
  const now = new Date('2026-11-09T00:00:00Z');
  const first = await runAll(ctx, { now, mode: 'scheduled' });
  // 公開済みとして閉じた状態にする
  const data = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  for (const i of data.issues) if (first.result.closeIssues.includes(i.number)) { i.state = 'closed'; i.labels = [...i.labels, { name: 'published' }]; }
  data.issues.find((i) => i.number === 2).comments.push({ id: 900, user: { login: 'danna-san', type: 'User' }, created_at: '2026-11-09T01:00:00Z', body: '@13時\n替え玉もした' });
  data.issues.find((i) => i.number === 2).updated_at = '2026-11-09T01:00:00Z';
  const fx = join(ctx.dir, 'issues.json');
  writeFileSync(fx, JSON.stringify(data));
  ctx.gh = createFixtureGitHub(fx);
  const { result } = await runAll(ctx, { now: new Date('2026-11-09T02:00:00Z'), mode: 'scheduled' });
  assert.deepEqual(result.published, ['2026-11-06']);
  assert.deepEqual(result.closeIssues, []); // 既に閉じている
  assert.equal(result.commitMessage, '11/6 の日記を更新');
  const p6 = JSON.parse(readFileSync(join(ctx.content, 'posts/2026-11-06.json'), 'utf8'));
  assert.ok(p6.entries.some((e) => e.label === '13:00'));
  assert.equal(p6.entries.length, 5); // 以前の素材も全部入っている
  rmSync(ctx.dir, { recursive: true, force: true });
});

test('/publish 日付: 指定日だけ作り直す（R3.3）', async () => {
  const ctx = setup();
  const { result } = await runAll(ctx, { now: new Date('2026-11-09T00:00:00Z'), mode: 'date', targetDate: '2026-11-07' });
  assert.deepEqual(result.published, ['2026-11-07']);
  rmSync(ctx.dir, { recursive: true, force: true });
});

test('Claude の応答が無く予備も失敗したら公開しない（R6.1, R6.2）', async () => {
  const ctx = setup('claude-code');
  ctx.config.ai.fallback.provider = 'none';
  const { result } = await runAll(ctx, { now: new Date('2026-11-09T00:00:00Z'), mode: 'scheduled' });
  assert.deepEqual(result.published, []);
  assert.equal(result.failed.length, 4);
  assert.deepEqual(result.closeIssues, []);
  assert.ok(!existsSync(join(ctx.content, 'posts/2026-11-06.json')));
  rmSync(ctx.dir, { recursive: true, force: true });
});

test('Claude の応答があればそれを使い、無い日だけ予備で作る（R6.1, R6.3）', async () => {
  const ctx = setup('claude-code');
  const now = new Date('2026-11-09T00:00:00Z');
  const collected = await collect({ gh: ctx.gh, config: ctx.config, contentDir: ctx.content, now, mode: 'scheduled', log: quiet });
  const state = await prepare({ gh: ctx.gh, config: ctx.config, contentDir: ctx.content, outDir: ctx.out, workDir: ctx.work, fixtureDir: join(ROOT, 'tests/fixtures'), collected, style, log: quiet });
  const d6 = state.days.find((d) => d.date === '2026-11-06');
  writeFileSync(join(ctx.work, 'responses/2026-11-06.json'), JSON.stringify({
    title: '雨の金曜日', description: '雨の一日。',
    entries: d6.entries.map((e) => ({ id: e.id, heading: '', body: `書き直した${e.id}` })), closing: '',
  }));
  const result = await compose({ config: ctx.config, contentDir: ctx.content, outDir: ctx.out, templatesDir: join(ROOT, 'templates'), workDir: ctx.work, style, now, log: quiet });
  assert.equal(result.published.length, 4);
  const p6 = JSON.parse(readFileSync(join(ctx.content, 'posts/2026-11-06.json'), 'utf8'));
  assert.equal(p6.title, '雨の金曜日');
  assert.equal(p6.generator.provider, 'claude-code');
  const p7 = JSON.parse(readFileSync(join(ctx.content, 'posts/2026-11-07.json'), 'utf8'));
  assert.equal(p7.generator.provider, 'mock');
  rmSync(ctx.dir, { recursive: true, force: true });
});

test('きっかけの判定（R3, R12.3）', () => {
  const allowed = (u) => u === 'danna-san';
  assert.deepEqual(decideMode({ EVENT_NAME: 'schedule' }, {}, { allowed }), { mode: 'scheduled', date: null });
  assert.deepEqual(decideMode({ EVENT_NAME: 'issue_comment', COMMENT_AUTHOR: 'danna-san', COMMENT_BODY: '/publish' }, {}, { allowed }), { mode: 'publish', date: null });
  assert.deepEqual(decideMode({ EVENT_NAME: 'issue_comment', COMMENT_AUTHOR: 'danna-san', COMMENT_BODY: '/publish 2026-11-05' }, {}, { allowed }), { mode: 'date', date: '2026-11-05' });
  assert.ok(decideMode({ EVENT_NAME: 'issue_comment', COMMENT_AUTHOR: 'spammer', COMMENT_BODY: '/publish' }, {}, { allowed }).skip);
  assert.deepEqual(decideMode({ EVENT_NAME: 'workflow_dispatch', INPUT_INCLUDE_TODAY: 'true' }, {}, { allowed }), { mode: 'publish', date: null });
  assert.deepEqual(decideMode({ EVENT_NAME: 'workflow_dispatch', INPUT_DATE: '2026-11-01' }, {}, { allowed }), { mode: 'date', date: '2026-11-01' });
});
