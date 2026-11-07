#!/usr/bin/env node
// 公開処理の CLI。
//   node scripts/publish.mjs prepare   … 対象の Issue を集め、依頼ファイルを作る
//   node scripts/publish.mjs compose   … 応答を検証して記事とサイトを作る
//   node scripts/publish.mjs finalize  … push 後に Issue を閉じる
//   node scripts/publish.mjs run       … prepare + compose（ローカル確認用。AI は予備の provider を使う）
// オプション: --fixture <issues.json> --content <dir> --out <dir> --work <dir> --now <ISO> --mode scheduled|publish|date --date YYYY-MM-DD
// ワークフローからは環境変数 EVENT_NAME / COMMENT_BODY / COMMENT_AUTHOR / INPUT_DATE / INPUT_INCLUDE_TODAY で渡す。
import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { ROOT, loadConfig } from './lib/config.mjs';
import { isValidDate } from './lib/date.mjs';
import { parseCommand } from './lib/issues.mjs';
import { createGitHub } from './lib/github.mjs';
import { createFixtureGitHub } from './lib/fixture-github.mjs';
import { collect, prepare, compose, finalize } from './lib/pipeline.mjs';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value).replace(/\n/g, ' ')}\n`);
}

/** claude-code-action に渡す引数。許可するツールは最小限（R12.2） */
export function claudeArgs(config) {
  const tools = ['Read', 'Write', 'Skill', 'Bash(python3 .claude/skills/yomiyasu/scripts/yomiyasu_lint.py:*)'];
  const model = String(config.ai.model || '').trim();
  if (model && !/^[\w.:\[\]-]+$/.test(model)) throw new Error(`ai.model に使えない文字があります: ${model}`);
  return `--allowedTools "${tools.join(',')}"${model ? ` --model ${model}` : ''}`;
}

/** きっかけ（イベント）から処理モードを決める */
export function decideMode(env, args, { allowed }) {
  if (args.mode) return { mode: args.mode, date: args.date || null };
  if (env.EVENT_NAME === 'issue_comment') {
    if (!allowed(env.COMMENT_AUTHOR)) return { skip: `書き手ではないユーザー（${env.COMMENT_AUTHOR}）のコメントなので何もしません` };
    const cmd = parseCommand(env.COMMENT_BODY);
    if (!cmd) return { skip: '/publish コマンドではありません' };
    return cmd.date ? { mode: 'date', date: cmd.date } : { mode: 'publish', date: null };
  }
  if (env.EVENT_NAME === 'workflow_dispatch') {
    if (env.INPUT_DATE) return { mode: 'date', date: env.INPUT_DATE };
    return { mode: env.INPUT_INCLUDE_TODAY === 'true' ? 'publish' : 'scheduled', date: null };
  }
  return { mode: 'scheduled', date: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const config = loadConfig();
  const contentDir = resolve(args.content || join(ROOT, 'content'));
  const outDir = resolve(args.out || join(ROOT, 'docs'));
  const workDir = resolve(args.work || join(ROOT, '.tmp/ai'));
  const templatesDir = join(ROOT, 'templates');
  const fixtureDir = args.fixture ? dirname(resolve(args.fixture)) : join(ROOT, 'tests/fixtures');
  const now = args.now ? new Date(args.now) : new Date();
  const gh = () => (args.fixture ? createFixtureGitHub(resolve(args.fixture)) : createGitHub());

  if (cmd === 'prepare' || cmd === 'run') {
    const client = gh();
    const owner = client.owner;
    const allowedList = (config.publish.allowedAuthors.length ? config.publish.allowedAuthors : [owner]).map((a) => a.toLowerCase());
    const decided = decideMode(process.env, args, { allowed: (u) => !!u && allowedList.includes(String(u).toLowerCase()) });
    if (decided.skip) { console.log(decided.skip); output('has_work', 'false'); return; }
    if (decided.mode === 'date' && !isValidDate(decided.date)) throw new Error(`日付が正しくありません: ${decided.date}`);
    console.log(`モード: ${decided.mode}${decided.date ? ` (${decided.date})` : ''}`);
    const collected = await collect({ gh: client, config, contentDir, now, mode: decided.mode, targetDate: decided.date });
    if (!collected.days.length) { console.log('記事にする Issue はありませんでした'); output('has_work', 'false'); return; }
    await prepare({ gh: client, config, contentDir, outDir, workDir, fixtureDir, collected });
    output('has_work', 'true');
    output('dates', collected.days.map((d) => d.date).join(' '));
    output('ai_provider', config.ai.provider);
    output('request_files', collected.days.map((d) => `.tmp/ai/requests/${d.date}.md`).join(' '));
    output('claude_args', claudeArgs(config));
    if (cmd === 'prepare') return;
  }

  if (cmd === 'compose' || cmd === 'run') {
    const result = await compose({ config, contentDir, outDir, templatesDir, workDir, now });
    output('published', result.published.join(' '));
    output('failed', result.failed.join(' '));
    output('commit_message', result.commitMessage);
    console.log(`公開: ${result.published.join(' ') || 'なし'} / 失敗: ${result.failed.join(' ') || 'なし'}`);
    return;
  }

  if (cmd === 'finalize') {
    const result = JSON.parse(readFileSync(join(workDir, 'result.json'), 'utf8'));
    const res = await finalize({ gh: gh(), config, result });
    console.log(`Issue を ${res.closed} 件閉じました`);
    return;
  }

  console.error('使い方: node scripts/publish.mjs <prepare|compose|finalize|run> [--fixture path] [--mode ...] [--date YYYY-MM-DD]');
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
