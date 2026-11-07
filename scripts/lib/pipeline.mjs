// 公開処理の本体。
//   collect  : 対象の日付と、その日に属する素材を決める
//   prepare  : 素材に ID を振り、メディアを保存し、AI への依頼ファイルと state を書く
//   compose  : AI の応答を検証（だめなら予備生成）→ 記事 JSON → サイト生成 → 結果を書く
//   finalize : push 後に、取り込んだ Issue へラベルを付けて閉じる（コメントは残さない）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logicalDate, addDays, shortDate } from './date.mjs';
import { issueToMaterials, sortMaterials, isCommand, labelNames } from './issues.mjs';
import { saveMedia } from './images.mjs';
import { loadStyle, buildRequestFile, composeArticle, lint, isUsable } from './writer.mjs';
import { generateFallback, parseJsonLoose } from './ai.mjs';
import { buildSite } from './site.mjs';

export function makeFilters(config, owner) {
  const allowed = (config.publish.allowedAuthors?.length ? config.publish.allowedAuthors : [owner]).map((a) => String(a).toLowerCase());
  const isAllowed = (user) => !!user && user.type !== 'Bot' && allowed.includes(String(user.login).toLowerCase());
  const isPostIssue = (issue) =>
    !issue.pull_request &&
    isAllowed(issue.user) &&
    !String(issue.title || '').trim().startsWith('/') &&
    !labelNames(issue).some((l) => config.publish.skipLabels.includes(l));
  const isPublished = (issue) => labelNames(issue).includes(config.publish.publishedLabel);
  // 閉じられていて published ラベルが無い Issue は、書き手が手で閉じたもの（R1.4）
  const isEligible = (issue) => isPostIssue(issue) && (issue.state === 'open' || isPublished(issue));
  return { isAllowed, isPostIssue, isPublished, isEligible };
}

export function readPost(contentDir, date) {
  const p = join(contentDir, 'posts', `${date}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

/**
 * @param mode 'scheduled'（前日まで）| 'publish'（当日まで）| 'date'（指定日だけ作り直す）
 */
export async function collect({ gh, config, contentDir, now = new Date(), mode = 'scheduled', targetDate = null, log = console }) {
  const { timezone, dayStartHour, systemLabels, lookbackDays } = config.publish;
  const f = makeFilters(config, gh.owner);
  const today = logicalDate(now, timezone, dayStartHour);
  const warnings = [];

  const candidates = new Map();
  const add = (list) => { for (const i of list) if (f.isEligible(i)) candidates.set(i.number, i); };
  add(await gh.listIssues({ state: 'open' }));
  const since = new Date(now.getTime() - lookbackDays * 86400_000).toISOString();
  add((await gh.listIssues({ state: 'all', since })).filter(f.isPublished));
  if (mode === 'date') add(await gh.listIssues({ state: 'all', since: `${addDays(targetDate, -2)}T00:00:00Z` }));

  const materialCache = new Map();
  const materialsOf = async (issue) => {
    if (!materialCache.has(issue.number)) {
      const comments = (await gh.listComments(issue.number)).filter((c) => f.isAllowed(c.user) && !isCommand(c.body));
      const list = issueToMaterials(issue, comments, { timezone, dayStartHour, systemLabels });
      for (const m of list) warnings.push(...m.warnings);
      materialCache.set(issue.number, list);
    }
    return materialCache.get(issue.number);
  };

  // 未処理の素材 = 開いている Issue の素材、または公開済み Issue の「その日の記事を作った後に書かれた」素材
  const pendingDates = new Set();
  for (const issue of candidates.values()) {
    for (const m of await materialsOf(issue)) {
      const post = readPost(contentDir, m.date);
      if (issue.state === 'open' || !post || m.createdAt > post.generatedAt) pendingDates.add(m.date);
    }
  }

  let dates;
  if (mode === 'date') dates = [targetDate];
  else dates = [...pendingDates].filter((d) => (mode === 'publish' ? d <= today : d < today)).sort();

  const days = [];
  for (const date of dates) {
    const numbers = new Set();
    for (const issue of candidates.values()) if ((await materialsOf(issue)).some((m) => m.date === date)) numbers.add(issue.number);
    for (const s of readPost(contentDir, date)?.sources || []) numbers.add(s.issue); // 範囲外の古い Issue も拾う
    const issues = [];
    for (const n of numbers) {
      let issue = candidates.get(n);
      if (!issue) {
        try { issue = await gh.getIssue(n); } catch (e) { log.warn?.(`#${n} を取得できませんでした: ${e.message}`); continue; }
        if (!f.isEligible(issue)) continue;
        candidates.set(n, issue);
      }
      issues.push(issue);
    }
    const materials = [];
    for (const issue of issues) materials.push(...(await materialsOf(issue)).filter((m) => m.date === date));
    if (!materials.length) continue;
    days.push({
      date,
      issues: issues.filter((i) => materials.some((m) => m.issue === i.number)).sort((a, b) => a.number - b.number),
      materials: sortMaterials(materials),
    });
  }
  for (const w of new Set(warnings)) log.warn?.(w);
  return { today, days };
}

/** 素材に ID を振り、メディアを保存し、依頼ファイルと state を書く */
export async function prepare({ gh, config, contentDir, outDir, workDir, fixtureDir, collected, style, log = console }) {
  style ||= loadStyle(undefined, { sampleMaxChars: config.ai.sampleMaxChars });
  mkdirSync(join(workDir, 'requests'), { recursive: true });
  mkdirSync(join(workDir, 'responses'), { recursive: true });
  const days = [];
  for (const d of collected.days) {
    const tags = [];
    for (const m of d.materials) for (const t of m.tags) if (!tags.includes(t)) tags.push(t);
    const media = [];
    let seq = 0;
    const entries = [];
    for (const [i, m] of d.materials.entries()) {
      const segments = [];
      for (const s of m.segments) {
        if (s.type !== 'media') { segments.push(s); continue; }
        const mediaId = `m${++seq}`;
        media.push([mediaId, await saveMedia(s, { date: d.date, outDir, config, token: process.env.GITHUB_TOKEN, fixtureDir, log })]);
        segments.push({ ...s, mediaId });
      }
      entries.push({ id: `e${i + 1}`, issue: m.issue, label: m.label, at: m.at, title: m.title, segments });
    }
    const day = {
      date: d.date,
      tags,
      entries,
      media,
      issues: d.issues.map((i) => ({ number: i.number, state: i.state, url: i.html_url })),
      existed: !!readPost(contentDir, d.date),
    };
    writeFileSync(join(workDir, 'requests', `${d.date}.md`), buildRequestFile(day, { style, rewriteLevel: config.ai.rewriteLevel }));
    days.push(day);
    log.log?.(`${d.date}: 素材 ${entries.length} 件、メディア ${media.length} 件、Issue ${day.issues.map((i) => `#${i.number}`).join(' ')}`);
  }
  const state = { today: collected.today, days };
  writeFileSync(join(workDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

/** AI の応答を検証して記事 JSON を書き、サイトを組み立てる */
export async function compose({ config, contentDir, outDir, templatesDir, workDir, style, now = new Date(), log = console }) {
  style ||= loadStyle(undefined, { sampleMaxChars: config.ai.sampleMaxChars });
  const state = JSON.parse(readFileSync(join(workDir, 'state.json'), 'utf8'));
  const published = [];
  const failed = [];
  for (const day of state.days) {
    const mediaMap = new Map(day.media);
    let generated = null;
    let generator = null;
    const resPath = join(workDir, 'responses', `${day.date}.json`);
    if (config.ai.provider === 'claude-code' && existsSync(resPath)) {
      const parsed = parseJsonLoose(readFileSync(resPath, 'utf8'));
      if (isUsable(parsed, day.entries)) {
        generated = parsed;
        generator = { provider: 'claude-code', model: config.ai.model || null };
        const problems = lint(parsed, day.entries, style.banned);
        if (problems.length) log.warn?.(`${day.date}: Claude の生成結果に気になる点があります: ${problems.join(' / ')}`);
      } else {
        log.warn?.(`${day.date}: Claude の応答が使えない形でした`);
      }
    } else if (config.ai.provider === 'claude-code') {
      log.warn?.(`${day.date}: Claude の応答がありません`);
    }
    if (!generated && config.ai.provider === 'none') {
      generator = { provider: 'none', model: null }; // 生成しない設定。素材の文章をそのまま使う
    } else if (!generated) {
      const providerFirst = config.ai.provider === 'claude-code' ? null : config.ai.provider;
      const fbConfig = providerFirst ? { ...config, ai: { ...config.ai, fallback: { ...config.ai.fallback, provider: providerFirst } } } : config;
      generated = await generateFallback(day, { config: fbConfig, style, log });
      if (generated) generator = { provider: fbConfig.ai.fallback.provider, model: fbConfig.ai.fallback.model || null };
    }
    if (!generated && generator?.provider !== 'none') {
      log.error?.(`${day.date}: 文章を生成できなかったので、この日は公開しません（Issue は開いたまま残します）`);
      failed.push(day.date);
      continue;
    }
    const article = composeArticle(day, generated, mediaMap);
    const post = {
      date: day.date,
      title: article.title,
      description: article.description,
      tags: day.tags,
      entries: article.entries,
      closing: article.closing,
      sources: day.issues.map((i) => ({ issue: i.number, url: i.url })),
      generatedAt: now.toISOString(),
      generator,
    };
    mkdirSync(join(contentDir, 'posts'), { recursive: true });
    writeFileSync(join(contentDir, 'posts', `${day.date}.json`), `${JSON.stringify(post, null, 2)}\n`);
    published.push(day);
    log.log?.(`${day.date}: 記事を書きました（${generator.provider}）`);
  }
  if (published.length) buildSite({ contentDir, outDir, templatesDir, config, log });

  const created = published.filter((d) => !d.existed).map((d) => shortDate(d.date));
  const updated = published.filter((d) => d.existed).map((d) => shortDate(d.date));
  const msg = [created.length ? `${created.join('、')} の日記` : '', updated.length ? `${updated.join('、')} の日記を更新` : ''].filter(Boolean).join('、');
  const result = {
    published: published.map((d) => d.date),
    failed,
    closeIssues: [...new Set(published.flatMap((d) => d.issues.filter((i) => i.state === 'open').map((i) => i.number)))],
    commitMessage: msg,
  };
  writeFileSync(join(workDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

/** push 後: 取り込んだ Issue に published ラベルを付けて閉じる。コメントは残さない（R8.2） */
export async function finalize({ gh, config, result, log = console }) {
  if (!result.closeIssues.length) return { closed: 0 };
  await gh.ensureLabel(config.publish.publishedLabel, '0e8a16', 'ブログ記事に取り込み済み');
  for (const n of result.closeIssues) {
    await gh.addLabels(n, [config.publish.publishedLabel]);
    await gh.close(n);
    log.log?.(`#${n} を閉じました`);
  }
  return { closed: result.closeIssues.length };
}
