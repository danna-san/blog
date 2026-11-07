// Issue / コメント本文を「テキスト」と「メディア」の並びに分解し、タグを取り出す。
import { logicalDate, timeLabel } from './date.mjs';

const MEDIA_PATTERNS = [
  // ![alt](url "title")
  { re: /!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/y, pick: (m) => ({ alt: m[1], url: m[2] }) },
  // <img ... src="..." alt="...">
  { re: /<img\b[^>]*>/iy, pick: (m) => ({ alt: attr(m[0], 'alt'), url: attr(m[0], 'src') }) },
  // <video src="..."></video>
  { re: /<video\b[^>]*>(?:[\s\S]*?<\/video>)?/iy, pick: (m) => ({ alt: '', url: attr(m[0], 'src'), kind: 'video' }) },
];
// 行だけで置かれた添付 URL（動画は GitHub Mobile だとこの形になる）
const BARE_ATTACHMENT = /^[ \t]*(https:\/\/(?:github\.com\/user-attachments\/assets\/[\w-]+|(?:private-)?user-images\.githubusercontent\.com\/\S+))[ \t]*$/my;

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
}

export function cleanAlt(alt) {
  const a = String(alt || '').trim();
  if (!a || /^(image|img|photo|screenshot|画像|写真)$/i.test(a) || /^(IMG|DSC|PXL|DCIM)[_-]?\d+/i.test(a) || /^[\w-]+\.(jpe?g|png|gif|heic|webp|mov|mp4)$/i.test(a) || /^\d+$/.test(a)) return '';
  return a;
}

const HASHTAG = /(^|[\s　(（「])#([^\s#　、。，．,.!?！？()（）\[\]「」『』<>"'`*]+)/g;

/** 本文からハッシュタグを抜き出し、本文からは取り除く */
export function extractHashtags(text) {
  const tags = [];
  const stripped = String(text).replace(HASHTAG, (all, pre, tag) => {
    if (/^\d+$/.test(tag)) return all; // #123 は Issue 参照
    tags.push(tag);
    return pre;
  });
  return { tags, text: stripped.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n') };
}

/** 本文を [{type:'text', text} | {type:'media', url, alt, kind?}] に分解する */
export function parseBody(body) {
  const src = String(body || '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const segments = [];
  let buf = '';
  const flush = () => {
    const t = buf.replace(/^\n+|\s+$/g, '');
    if (t.trim()) segments.push({ type: 'text', text: t });
    buf = '';
  };
  let i = 0;
  outer: while (i < src.length) {
    const atLineStart = i === 0 || src[i - 1] === '\n';
    if (atLineStart) {
      BARE_ATTACHMENT.lastIndex = i;
      const m = BARE_ATTACHMENT.exec(src);
      if (m) { flush(); segments.push({ type: 'media', url: m[1], alt: '' }); i += m[0].length; continue; }
    }
    if (src[i] === '!' || src[i] === '<') {
      for (const p of MEDIA_PATTERNS) {
        p.re.lastIndex = i;
        const m = p.re.exec(src);
        if (m) {
          const media = p.pick(m);
          if (media.url) { flush(); segments.push({ type: 'media', ...media, alt: cleanAlt(media.alt) }); i += m[0].length; continue outer; }
        }
      }
    }
    buf += src[i++];
  }
  flush();
  return segments;
}

/** Issue と、その Issue へのコメントを、時系列の entry 配列にする */
export function issueToEntries(issue, comments, opts) {
  const { timezone, dayStartHour, systemLabels = [] } = opts;
  const labelTags = (issue.labels || [])
    .map((l) => (typeof l === 'string' ? l : l.name))
    .filter((n) => n && !systemLabels.includes(n));
  const tags = new Set(labelTags);
  const entries = [];
  const push = (kind, src, title) => {
    const { tags: hash, text } = extractHashtags(src.body || '');
    hash.forEach((t) => tags.add(t));
    const titleTags = title ? extractHashtags(title) : { tags: [], text: '' };
    titleTags.tags.forEach((t) => tags.add(t));
    const segments = parseBody(text);
    if (!segments.length && !(title && titleTags.text.trim())) return;
    entries.push({
      kind,
      issue: issue.number,
      createdAt: src.created_at,
      date: logicalDate(src.created_at, timezone, dayStartHour),
      time: timeLabel(src.created_at, timezone),
      title: title ? titleTags.text.trim() : '',
      segments,
    });
  };
  push('issue', issue, issue.title);
  for (const c of comments) push('comment', c, '');
  return { entries, tags: [...tags] };
}

export function isCommand(text) {
  return /^\s*\/publish\b/i.test(String(text || ''));
}

/** "/publish" または "/publish 2026-11-07" を解釈する */
export function parseCommand(text) {
  const m = String(text || '').match(/^\s*\/publish(?:\s+(\d{4}-\d{2}-\d{2}))?/i);
  if (!m) return null;
  return { date: m[1] || null };
}
