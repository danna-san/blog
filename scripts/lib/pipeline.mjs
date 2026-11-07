// 公開処理の本体: Issue 収集 → 日付ごとに素材化 → メディア保存 → 文章生成 → content/posts/*.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logicalDate, addDays, japaneseDate } from './date.mjs';
import { issueToEntries, isCommand } from './issues.mjs';
import { saveMedia } from './images.mjs';
import { writeDay, loadStyle } from './writer.mjs';

const labelNames = (issue) => (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));

export function makeFilters(config, owner) {
  const allowed = (config.publish.allowedAuthors?.length ? config.publish.allowedAuthors : [owner]).map((a) => a.toLowerCase());
  const isAllowed = (user) => !!user && allowed.includes(String(user.login).toLowerCase()) && user.type !== 'Bot';
  const isPostIssue = (issue) =>
    isAllowed(issue.user) &&
    !isCommand(issue.title) &&
    !labelNames(issue).some((l) => config.publish.skipLabels.includes(l));
  return { isAllowed, isPostIssue };
}

/** 今回作る日付と、その日に含める Issue を決める */
export async function collectWork({ gh, config, now = new Date(), targetDate = null, includeToday = false }) {
  const { timezone, dayStartHour, publishedLabel } = config.publish;
  const { isPostIssue } = makeFilters(config, gh.owner);
  const dayOf = (iso) => logicalDate(iso, timezone, dayStartHour);
  const today = dayOf(now);

  let dates;
  if (targetDate) {
    dates = [targetDate];
  } else {
    const open = (await gh.listIssues({ state: 'open' })).filter(isPostIssue);
    dates = [...new Set(open.map((i) => dayOf(i.created_at)))]
      .filter((d) => (includeToday ? d <= today : d < today))
      .sort();
  }
  if (!dates.length) return { today, days: [] };

  const since = `${addDays(dates[0], -2)}T00:00:00Z`;
  const all = (await gh.listIssues({ state: 'all', since })).filter(isPostIssue);
  const days = dates.map((date) => ({
    date,
    issues: all
      .filter((i) => dayOf(i.created_at) === date)
      .filter((i) => i.state === 'open' || labelNames(i).includes(publishedLabel))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  })).filter((d) => d.issues.length);
  return { today, days };
}

/** 1 日分の記事データを作って content/posts/<date>.json に書く */
export async function buildDay({ gh, config, day, contentDir, outDir, fixtureDir, style = loadStyle(), log = console }) {
  const { timezone, dayStartHour, systemLabels } = config.publish;
  const { isAllowed } = makeFilters(config, gh.owner);
  const entries = [];
  const tags = [];
  for (const issue of day.issues) {
    const comments = (await gh.listComments(issue.number))
      .filter((c) => isAllowed(c.user) && !isCommand(c.body));
    const res = issueToEntries(issue, comments, { timezone, dayStartHour, systemLabels });
    entries.push(...res.entries);
    for (const t of res.tags) if (!tags.includes(t)) tags.push(t);
  }
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const mediaMap = new Map();
  let mediaSeq = 0;
  for (const [i, e] of entries.entries()) {
    e.id = `e${i + 1}`;
    for (const s of e.segments) {
      if (s.type !== 'media') continue;
      s.mediaId = `m${++mediaSeq}`;
      mediaMap.set(s.mediaId, await saveMedia(s, { date: day.date, outDir, config, token: process.env.GITHUB_TOKEN, fixtureDir, log }));
    }
  }

  const written = await writeDay({ date: day.date, tags, entries }, { config, mediaMap, style, log });
  const post = {
    date: day.date,
    title: written.title,
    description: written.description,
    tags,
    entries: written.entries,
    closing: written.closing,
    sources: day.issues.map((i) => ({ issue: i.number, url: i.html_url })),
    generatedAt: new Date().toISOString(),
    generator: written.generator,
  };
  mkdirSync(join(contentDir, 'posts'), { recursive: true });
  writeFileSync(join(contentDir, 'posts', `${day.date}.json`), `${JSON.stringify(post, null, 2)}\n`);
  log.log?.(`${day.date}: ${day.issues.length} 件の Issue から記事を作りました（${post.generator.provider}）`);
  return post;
}

export function postUrl(config, date) {
  return config.site.baseUrl ? `${config.site.baseUrl}/${date}.html` : `${date}.html`;
}

/** push 後に Issue へ結果を反映する */
export async function finalize({ gh, config, result, log = console }) {
  const { publishedLabel, mode, prBranch } = config.publish;
  const opened = result.days.flatMap((d) => d.issues.filter((i) => i.state === 'open').map((i) => ({ number: i.number, date: d.date })));
  if (opened.length) await gh.ensureLabel(publishedLabel, '0e8a16', 'ブログ記事に取り込み済み');

  let prUrl = '';
  if (mode === 'pull-request' && result.days.length) {
    const dates = result.days.map((d) => d.date);
    const pr = await gh.upsertPullRequest({
      head: prBranch,
      base: result.baseBranch,
      title: `日記: ${dates.join(', ')}`,
      body: [
        '自動で組み立てた日記です。内容を確認してマージすると公開されます。',
        '',
        ...result.days.map((d) => `- ${japaneseDate(d.date)}: ${d.title}`),
        '',
        ...opened.map((o) => `Closes #${o.number}`),
      ].join('\n'),
    });
    prUrl = pr.html_url;
    log.log?.(`Pull Request: ${prUrl}`);
  }

  for (const o of opened) {
    await gh.addLabels(o.number, [publishedLabel]);
    if (mode === 'direct') {
      await gh.comment(o.number, `${japaneseDate(o.date)} の日記にしました。\n${postUrl(config, o.date)}`);
      await gh.close(o.number);
    }
  }

  if (result.commandIssue) {
    const lines = result.days.length
      ? result.days.map((d) => `- ${japaneseDate(d.date)}: ${mode === 'direct' ? postUrl(config, d.date) : d.title}`)
      : ['公開対象の Issue はありませんでした。'];
    if (prUrl) lines.push('', `確認用の Pull Request: ${prUrl}`);
    const isPost = opened.some((o) => o.number === result.commandIssue.number);
    if (!isPost || mode === 'pull-request') await gh.comment(result.commandIssue.number, lines.join('\n'));
    if (result.commandIssue.closeAfter) await gh.close(result.commandIssue.number);
  }
  return { prUrl, closed: mode === 'direct' ? opened.length : 0 };
}
