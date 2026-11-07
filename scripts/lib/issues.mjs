// Issue / コメントを「素材」（記事の出来事 1 件分）にする。
// 本文のテキスト/メディア分解、#タグ抽出、日付指定の適用、表示時刻の決定を行う。純粋関数のみ。
import { logicalDate, timeLabel, diaryTimeToUtc, endOfDiaryDay } from './date.mjs';
import { extractDirective, resolveDirective } from './directive.mjs';

const MEDIA_PATTERNS = [
  // ![alt](url "title")
  { re: /!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/y, pick: (m) => ({ alt: m[1], url: m[2] }) },
  // <img ... src="..." alt="...">（GitHub Mobile で画像を添付するとこの形）
  { re: /<img\b[^>]*>/iy, pick: (m) => ({ alt: attr(m[0], 'alt'), url: attr(m[0], 'src') }) },
  // <video src="..."></video>
  { re: /<video\b[^>]*>(?:[\s\S]*?<\/video>)?/iy, pick: (m) => ({ alt: '', url: attr(m[0], 'src'), kind: 'video' }) },
];
// 1 行に URL だけ置かれた添付（動画はこの形になる）
const BARE_ATTACHMENT = /^[ \t]*(https:\/\/(?:github\.com\/user-attachments\/assets\/[\w-]+|(?:private-)?user-images\.githubusercontent\.com\/\S+))[ \t]*$/my;

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
}

/** "Image" や "IMG_1234" のような意味のない代替テキストを空にする */
export function cleanAlt(alt) {
  const a = String(alt || '').trim();
  if (!a) return '';
  if (/^(image|img|photo|screenshot|画像|写真)$/i.test(a)) return '';
  if (/^(IMG|DSC|PXL|DCIM)[_-]?\d+/i.test(a)) return '';
  if (/^[\w-]+\.(jpe?g|png|gif|heic|webp|mov|mp4)$/i.test(a)) return '';
  if (/^\d+$/.test(a)) return '';
  return a;
}

const HASHTAG = /(^|[\s　(（「])#([^\s#　、。，．,.!?！？()（）\[\]「」『』<>"'`*]+)/g;

/** 本文から #タグ を抜き出し、本文からは取り除く。#123 は Issue 参照なので残す */
export function extractHashtags(text) {
  const tags = [];
  const stripped = String(text || '').replace(HASHTAG, (all, pre, tag) => {
    if (/^\d+$/.test(tag)) return all;
    if (!tags.includes(tag)) tags.push(tag);
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
    if (i === 0 || src[i - 1] === '\n') {
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
          if (media.url) {
            flush();
            segments.push({ type: 'media', ...media, alt: cleanAlt(media.alt) });
            i += m[0].length;
            continue outer;
          }
        }
      }
    }
    buf += src[i++];
  }
  flush();
  return segments;
}

export const labelNames = (issue) => (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);

/**
 * 1 つの Issue（とコメント）から素材を作る。
 * 素材: { issue, kind, sourceId, createdAt, date, at, label, title, tags, segments, warnings }
 */
export function issueToMaterials(issue, comments, { timezone, dayStartHour, systemLabels = [] }) {
  const labelTags = labelNames(issue).filter((n) => !systemLabels.includes(n));
  const issueDate = logicalDate(issue.created_at, timezone, dayStartHour);
  const materials = [];

  const make = (kind, src, rawTitle, ownerDate) => {
    const warnings = [];
    const written = logicalDate(src.created_at, timezone, dayStartHour);
    const { directive, body } = extractDirective(src.body || '');
    const resolved = resolveDirective(directive, { baseDate: written, ownerDate });
    let date = ownerDate;
    let time = null;
    const bodyText = body;
    if (resolved?.error) {
      // 指定は無視するが、@ の行は書き間違いの可能性が高いので本文からは除いたままにする
      warnings.push(`#${issue.number}: ${resolved.error}（日付指定を無視しました）`);
    } else if (resolved) {
      date = resolved.date;
      time = resolved.time;
    }

    const hashBody = extractHashtags(bodyText);
    const hashTitle = extractHashtags(rawTitle || '');
    const tags = [...labelTags];
    for (const t of [...hashTitle.tags, ...hashBody.tags]) if (!tags.includes(t)) tags.push(t);
    const segments = parseBody(hashBody.text);
    const title = hashTitle.text.trim();
    if (!segments.length && !title) return null;

    let at;
    let label;
    if (time) {
      at = diaryTimeToUtc(date, time.h, time.min, timezone, dayStartHour).toISOString();
      label = `${String(time.h).padStart(2, '0')}:${String(time.min).padStart(2, '0')}`;
    } else if (resolved && !resolved.error) {
      // 日付だけ指定 → その日の最後に「追記」
      at = endOfDiaryDay(date, timezone, dayStartHour).toISOString();
      label = '追記';
    } else if (written !== date) {
      // 翌日以降に書かれたコメント → 元の日の最後に「追記」
      at = endOfDiaryDay(date, timezone, dayStartHour).toISOString();
      label = '追記';
    } else {
      at = new Date(src.created_at).toISOString();
      label = timeLabel(src.created_at, timezone);
    }
    return {
      issue: issue.number,
      kind,
      sourceId: kind === 'issue' ? `issue-${issue.number}` : `comment-${src.id}`,
      createdAt: new Date(src.created_at).toISOString(),
      date, at, label, title, tags, segments, warnings,
    };
  };

  const head = make('issue', issue, issue.title, issueDate);
  if (head) materials.push(head);
  const ownerDate = head ? head.date : issueDate; // コメントは元 Issue の（指定後の）日付に入る
  for (const c of comments) {
    const m = make('comment', c, '', ownerDate);
    if (m) materials.push(m);
  }
  return materials;
}

/** 素材の並べ替え（実効日時 → 書いた日時） */
export function sortMaterials(list) {
  return [...list].sort((a, b) => a.at.localeCompare(b.at) || a.createdAt.localeCompare(b.createdAt));
}

export function isCommand(text) {
  return /^\s*\/publish\b/i.test(String(text || ''));
}

/** "/publish" または "/publish 2026-11-07" を解釈する */
export function parseCommand(text) {
  const m = String(text || '').match(/^\s*\/publish(?:[ \t]+(\d{4}-\d{2}-\d{2}))?/i);
  if (!m) return null;
  return { date: m[1] || null };
}
