// その日の素材(Issue/コメント)から記事データを作る。AI はここからだけ呼ぶ。
import { join } from 'node:path';
import { complete, parseJsonLoose } from './ai.mjs';
import { ROOT, readTextIfExists } from './config.mjs';
import { japaneseDate } from './date.mjs';
import { plainify } from './markdown.mjs';

const REWRITE = {
  light: '本人の文章をほぼそのまま使う。直すのは誤字・句読点・明らかに足りない接続だけ。言い回しは変えない。',
  medium: '本人の言い回しや口癖は残しつつ、メモ書きや箇条書きをつないで自然な文章にする。内容は足さない。',
  full: '素材を元に、ペルソナの文体で書き直してよい。ただし事実は素材にあることだけ。',
};

export function loadStyle(root = ROOT) {
  const persona = readTextIfExists(join(root, 'config/persona.md'), '').trim();
  const banned = readTextIfExists(join(root, 'config/banned-phrases.txt'), '')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  return { persona, banned };
}

export function buildPrompt({ date, tags, entries }, { persona, rewriteLevel }) {
  const system = [
    'あなたは、ある人の個人ブログを、その人本人として書く。読者が「この人が自分で書いた日記だ」と自然に感じる文章にすること。',
    '',
    '# 書き手（ペルソナ）',
    persona || '（指定なし。落ち着いた普段着の日本語で書く）',
    '',
    '# 書き直しの度合い',
    REWRITE[rewriteLevel],
    '',
    '# 守ること',
    '- 素材に書かれていない出来事・人物・場所・感想を作らない。写真の中身も想像で描写しない。',
    '- 時刻は別に表示されるので、本文に「10時23分に」のような時刻を書かない（「朝」「夕方」程度はよい）。',
    '- 箇条書き、Markdown の見出し、絵文字の多用、過剰な「！」を使わない。',
    '- 読者への呼びかけ、記事の目的説明、最後のまとめや教訓、無理な前向き締めをしない。',
    '- 文末を単調にしない。短い文と長い文を混ぜる。少し雑なくらいでよい。',
    '- 固有名詞・数字・本人の言葉の引用はそのまま残す。',
    '- 素材中の [[IMG:m1]] のような写真の目印は、文章の流れに合う位置に、そのままの形で必ず全部残す。勝手に増やしたり別のエントリに移したりしない。',
    '',
    '# 出力',
    'JSON だけを出力する。形式:',
    '{"title": "その日の記事タイトル（短く、日記らしく。日付は入れない）",',
    ' "description": "一覧に出す一文の紹介（60字以内、です・ます調にしない）",',
    ' "entries": [{"id": "素材のid（e1 など）", "heading": "そのエントリの小見出し（不要なら空文字）", "body": "本文。段落は空行で区切る"}],',
    ' "closing": "一日の終わりのひとこと（素材に根拠がなければ空文字）"}',
    'entries は素材の id ごとに 1 つずつ、同じ順で全部出す。',
  ].join('\n');

  const lines = [`日付: ${japaneseDate(date)}`, `タグ: ${tags.join(', ') || 'なし'}`, '=== 素材（その日に書いたメモ。時系列順） ==='];
  for (const e of entries) {
    lines.push(`[${e.id}] ${e.time}${e.title ? ` 見出し: ${e.title}` : ''}`);
    for (const s of e.segments) lines.push(s.type === 'text' ? plainify(s.text) : `[[IMG:${s.mediaId}]]`);
  }
  lines.push('=== 素材ここまで ===');
  return { system, user: lines.join('\n') };
}

/** 生成結果のチェック。問題点の配列を返す（空なら OK）。 */
export function lint(generated, entries, banned) {
  const problems = [];
  if (!generated || typeof generated !== 'object') return ['JSON として読めませんでした'];
  const ids = new Set((generated.entries || []).map((e) => e.id));
  for (const e of entries) if (!ids.has(e.id)) problems.push(`エントリ ${e.id} がありません`);
  const all = [generated.title, generated.description, generated.closing, ...(generated.entries || []).flatMap((e) => [e.heading, e.body])].join('\n');
  for (const p of banned) if (all.includes(p)) problems.push(`「${p}」という言い回しは使わない`);
  if (/^\s*([-*・]|\d+\.)\s/m.test(all)) problems.push('箇条書きは使わない');
  if (/^\s*#{1,6}\s/m.test(all)) problems.push('Markdown の見出しは使わない');
  return problems;
}

/** 生成結果と素材を突き合わせ、記事の entries を組み立てる。足りない部分は素材で補う。 */
export function merge(generated, entries, mediaMap) {
  const genById = new Map((generated?.entries || []).map((e) => [e.id, e]));
  return entries.map((src) => {
    const gen = genById.get(src.id);
    const own = new Set(src.segments.filter((s) => s.type === 'media').map((s) => s.mediaId));
    let blocks;
    if (gen && typeof gen.body === 'string' && gen.body.trim()) {
      blocks = [];
      const used = new Set();
      for (const part of gen.body.split(/(\[\[IMG:m\d+\]\])/)) {
        const m = part.match(/^\[\[IMG:(m\d+)\]\]$/);
        if (m) {
          if (own.has(m[1]) && !used.has(m[1])) { used.add(m[1]); blocks.push(mediaBlock(mediaMap, m[1])); }
        } else if (part.trim()) {
          blocks.push({ type: 'text', text: part.trim() });
        }
      }
      for (const id of own) if (!used.has(id)) blocks.push(mediaBlock(mediaMap, id)); // 抜けた写真は末尾へ
    } else {
      blocks = src.segments.map((s) => (s.type === 'text' ? { type: 'text', text: plainify(s.text) } : mediaBlock(mediaMap, s.mediaId)));
    }
    return {
      id: src.id,
      time: src.time,
      createdAt: src.createdAt,
      heading: gen ? String(gen.heading || '').trim() : src.title,
      blocks: blocks.filter(Boolean),
    };
  });
}

function mediaBlock(mediaMap, id) {
  const m = mediaMap.get(id);
  return m ? { ...m } : null;
}

/** 依頼ファイル（claude-code-action が読む）の中身。指示・素材・自己チェック項目を 1 つにまとめる。 */
export function buildRequestFile(day, { config, style }) {
  const { system, user } = buildPrompt(day, { persona: style.persona, rewriteLevel: config.ai.rewriteLevel });
  return [
    '# 依頼', '', system, '', '# 素材', '', user, '',
    '# 書き終えたら自分で確認すること',
    '- entries が素材の id の数だけ、同じ順で揃っているか',
    '- [[IMG:m数字]] の目印が全部、元のエントリの中に残っているか',
    '- 次の言い回しを使っていないか: ' + (style.banned.join(' / ') || 'なし'),
    '- 箇条書き・見出し記号を使っていないか',
  ].join('\n');
}

/** API 型のプロバイダ（github-models / anthropic / mock）で生成する。失敗時は null。 */
export async function generateViaApi(day, { config, style, log = console }) {
  const { provider, model, temperature, rewriteLevel, lintRetries } = config.ai;
  if (!['github-models', 'anthropic', 'mock'].includes(provider)) return null;
  const { system, user } = buildPrompt(day, { persona: style.persona, rewriteLevel });
  let messages = user;
  let generated = null;
  for (let attempt = 0; attempt <= lintRetries; attempt++) {
    try {
      const text = await complete({ provider, model, temperature, system, user: messages });
      const parsed = parseJsonLoose(text);
      const problems = lint(parsed, day.entries, style.banned);
      if (parsed) generated = parsed;
      if (!problems.length) break;
      log.warn?.(`生成結果の手直しを依頼します: ${problems.join(' / ')}`);
      messages = `${user}\n\n前回の出力には次の問題がありました。直して JSON だけを出し直してください。\n- ${problems.join('\n- ')}\n\n前回の出力:\n${text}`;
    } catch (e) {
      log.warn?.(`文章生成に失敗したので素材の文章をそのまま使います: ${e.message}`);
      return null;
    }
  }
  return generated;
}

/** 生成結果（null 可）と素材から記事データを組み立てる。生成がなくても必ず返す。 */
export function composeDay(day, generated, { config, mediaMap, style, log = console }) {
  if (generated) {
    const problems = lint(generated, day.entries, style.banned);
    if (problems.length) log.warn?.(`${day.date}: 生成結果に気になる点があります: ${problems.join(' / ')}`);
  }
  const first = day.entries[0];
  return {
    title: String(generated?.title || first?.title || japaneseDate(day.date)).trim(),
    description: String(generated?.description || '').trim() || summarize(day.entries),
    entries: merge(generated, day.entries, mediaMap),
    closing: String(generated?.closing || '').trim(),
    generator: generated
      ? { provider: config.ai.provider, model: config.ai.model || null }
      : { provider: config.ai.provider === 'none' ? 'none' : 'fallback', model: null },
  };
}

function summarize(entries) {
  const text = entries.flatMap((e) => e.segments.filter((s) => s.type === 'text').map((s) => plainify(s.text))).join(' ').replace(/\s+/g, ' ');
  return text.length > 60 ? `${text.slice(0, 58)}…` : text;
}
