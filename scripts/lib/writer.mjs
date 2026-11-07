// 素材から「AI への依頼」を作り、AI の応答を検査し、素材と突き合わせて記事の本文にする。
// 文体の中身は config/ のファイルにだけ書く（ここには書かない）。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readTextIfExists } from './config.mjs';
import { japaneseDate } from './date.mjs';
import { plainify } from './markdown.mjs';

const REWRITE = {
  light: '本人の文章をほぼそのまま使う。直すのは誤字・句読点・明らかに足りない接続だけ。言い回しは変えない。',
  medium: '本人の言い回しや口癖は残しつつ、メモ書きや箇条書きをつないで自然な文章にする。内容は足さない。',
  full: '素材を元に、ペルソナの文体で書き直してよい。ただし事実は素材にあることだけ。',
};

/** config/ から文体の設定を読む */
export function loadStyle(root = ROOT, { sampleMaxChars = 6000 } = {}) {
  const persona = readTextIfExists(join(root, 'config/persona.md'), '').trim();
  const banned = readTextIfExists(join(root, 'config/banned-phrases.txt'), '')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const dir = join(root, 'config/samples');
  const samples = [];
  if (existsSync(dir)) {
    let total = 0;
    const files = readdirSync(dir).filter((f) => /\.(md|txt)$/i.test(f) && !/^readme\./i.test(f)).sort().reverse();
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8').trim();
      if (!text || total + text.length > sampleMaxChars) continue;
      samples.push({ name: f, text });
      total += text.length;
    }
  }
  return { persona, banned, samples };
}

function rules() {
  return [
    '- 素材に書かれていない出来事・人物・場所・感想を作らない。写真の中身も想像で描写しない。',
    '- 時刻は記事に別に表示されるので、本文に「10時23分に」のような時刻を書かない（「朝」「夕方」程度はよい）。',
    '- 箇条書き、Markdown の見出し、絵文字の多用、過剰な「！」を使わない。',
    '- 読者への呼びかけ、記事の目的の説明、最後のまとめや教訓、無理に前向きな締めをしない。',
    '- 固有名詞・数字・本人の言葉の引用はそのまま残す。',
    '- 素材中の [[IMG:m1]] のような写真の目印は、文章の流れに合う位置に、元のエントリの中で、そのままの形で全部残す。増やしたり別のエントリに移したりしない。',
    '- 素材が短いメモでも、無理に膨らませない。短い日は短くてよい。',
  ].join('\n');
}

function outputSpec() {
  return [
    'JSON だけを出力する。形式:',
    '{"title": "その日の記事タイトル（短く、日記らしく。日付は入れない）",',
    ' "description": "一覧に出す一文の紹介（60字以内）",',
    ' "entries": [{"id": "素材の id（e1 など）", "heading": "そのエントリの小見出し（不要なら空文字）", "body": "本文。段落は空行で区切る"}],',
    ' "closing": "一日の終わりのひとこと（素材に根拠がなければ空文字）"}',
    'entries は素材の id ごとに 1 つずつ、同じ順で全部出す。',
  ].join('\n');
}

/** 素材を AI に渡すテキストにする */
export function materialText(day) {
  const lines = [`日付: ${japaneseDate(day.date)}`, `タグ: ${day.tags.join(', ') || 'なし'}`, '=== 素材（その日に書いたメモ。時系列順） ==='];
  for (const e of day.entries) {
    lines.push(`[${e.id}] ${e.label}${e.title ? ` 見出し: ${e.title}` : ''}`);
    for (const s of e.segments) lines.push(s.type === 'text' ? plainify(s.text) : `[[IMG:${s.mediaId}]]`);
  }
  lines.push('=== 素材ここまで ===');
  return lines.join('\n');
}

function personaBlock(style) {
  const parts = ['# 書き手（ペルソナ）', style.persona || '（指定なし。落ち着いた普段着の日本語で書く）'];
  if (style.samples.length) {
    parts.push('', '# 書き手本人が過去に書いた文章（文体の参考。内容は使わない）');
    for (const s of style.samples) parts.push(`--- ${s.name} ---`, s.text);
  }
  return parts.join('\n');
}

/** GitHub Models など API 用のプロンプト（system / user） */
export function buildPrompt(day, { style, rewriteLevel }) {
  const system = [
    'あなたは、ある人の個人ブログを、その人本人として書く。読者が「この人が自分で書いた日記だ」と自然に感じる文章にすること。',
    '', personaBlock(style),
    '', '# 書き直しの度合い', REWRITE[rewriteLevel],
    '', '# 守ること', rules(),
    style.banned.length ? `- 次の言い回しは使わない: ${style.banned.join(' / ')}` : '',
    '', '# 出力', outputSpec(),
  ].join('\n');
  return { system, user: materialText(day) };
}

/** claude-code-action が読む依頼ファイル（.tmp/ai/requests/<date>.md）の中身 */
export function buildRequestFile(day, { style, rewriteLevel }) {
  return [
    `# ${day.date} の日記の依頼`,
    '',
    'あなたは、ある人の個人ブログを、その人本人として書く。読者が「この人が自分で書いた日記だ」と自然に感じる文章にすること。',
    '', personaBlock(style),
    '', '# 書き直しの度合い', REWRITE[rewriteLevel],
    '', '# 守ること', rules(),
    '',
    '# 手順',
    '1. 下の素材から、ペルソナの文体で下書きを書く（頭の中で。ファイルには書かない）。',
    '2. 下書きの本文（entries の body、title、description、closing）を、yomiyasu スキルで推敲する。文書の種類はエッセイ（体験を書いた日記）として扱い、書き手の語り口・話し言葉・個性は残す。推敲で事実を足さない。',
    '   - スキルとして呼べない場合は、`.claude/skills/yomiyasu/SKILL.md` と `.claude/skills/yomiyasu/references/doc-types/essay.md` を Read して、その手順で推敲する。',
    '3. 書き終えたら自分で確認する。',
    '   - entries が素材の id の数だけ、同じ順で揃っているか',
    '   - [[IMG:m数字]] の目印が全部、元のエントリの中に残っているか',
    `   - 次の言い回しを使っていないか: ${style.banned.join(' / ') || 'なし'}`,
    '   - 箇条書き・見出し記号を使っていないか',
    `4. 結果の JSON だけを \`.tmp/ai/responses/${day.date}.json\` に Write する。他のファイルは作らない・変えない。`,
    '',
    '# 出力', outputSpec(),
    '',
    '# 素材',
    materialText(day),
  ].join('\n');
}

/** 生成結果の検査。問題点の配列を返す（空なら OK） */
export function lint(generated, entries, banned = []) {
  if (!generated || typeof generated !== 'object' || !Array.isArray(generated.entries)) return ['JSON として読めませんでした'];
  const problems = [];
  const ids = new Set(generated.entries.map((e) => e && e.id));
  for (const e of entries) if (!ids.has(e.id)) problems.push(`エントリ ${e.id} がありません`);
  const all = [generated.title, generated.description, generated.closing, ...generated.entries.flatMap((e) => [e?.heading, e?.body])]
    .filter((v) => typeof v === 'string').join('\n');
  for (const p of banned) if (all.includes(p)) problems.push(`「${p}」という言い回しは使わない`);
  if (/^\s*([-*・]|\d+\.)\s/m.test(all)) problems.push('箇条書きは使わない');
  if (/^\s*#{1,6}\s/m.test(all)) problems.push('Markdown の見出しは使わない');
  return problems;
}

/** 使える応答か（全エントリが欠けているような応答は使わない） */
export function isUsable(generated, entries) {
  if (!generated || !Array.isArray(generated.entries)) return false;
  const ids = new Set(entries.map((e) => e.id));
  return generated.entries.some((e) => e && ids.has(e.id) && typeof e.body === 'string' && e.body.trim());
}

/** 生成結果と素材を突き合わせ、記事の entries を作る。欠けた部分は素材で補う */
export function merge(generated, entries, mediaMap) {
  const genById = new Map((generated?.entries || []).filter(Boolean).map((e) => [e.id, e]));
  return entries.map((src) => {
    const gen = genById.get(src.id);
    const own = src.segments.filter((s) => s.type === 'media').map((s) => s.mediaId);
    let blocks;
    if (gen && typeof gen.body === 'string' && gen.body.trim()) {
      blocks = [];
      const used = new Set();
      for (const part of gen.body.split(/(\[\[IMG:m\d+\]\])/)) {
        const m = part.match(/^\[\[IMG:(m\d+)\]\]$/);
        if (m) {
          if (own.includes(m[1]) && !used.has(m[1])) { used.add(m[1]); blocks.push(mediaMap.get(m[1])); }
        } else if (part.trim()) {
          blocks.push({ type: 'text', text: part.trim() });
        }
      }
      for (const id of own) if (!used.has(id)) blocks.push(mediaMap.get(id)); // 抜けた写真は末尾へ
    } else {
      blocks = src.segments.map((s) => (s.type === 'text' ? { type: 'text', text: plainify(s.text) } : mediaMap.get(s.mediaId)));
    }
    return {
      id: src.id,
      label: src.label,
      at: src.at,
      heading: gen ? String(gen.heading || '').trim() : src.title,
      blocks: blocks.filter(Boolean).map((b) => ({ ...b })),
    };
  });
}

/** 生成結果と素材から、記事データの本文部分を作る */
export function composeArticle(day, generated, mediaMap) {
  const first = day.entries[0];
  return {
    title: String(generated?.title || first?.title || japaneseDate(day.date)).trim(),
    description: String(generated?.description || '').trim() || summarize(day.entries),
    entries: merge(generated, day.entries, mediaMap),
    closing: String(generated?.closing || '').trim(),
  };
}

function summarize(entries) {
  const text = entries.flatMap((e) => e.segments.filter((s) => s.type === 'text').map((s) => plainify(s.text))).join(' ').replace(/\s+/g, ' ');
  return text.length > 60 ? `${text.slice(0, 58)}…` : text;
}
