// 本文 1 行目の日付指定（例: "@11/5 18:30"、"@一昨日"、"@21時"）を解釈する。
import { addDays, isValidDate } from './date.mjs';

const LINE = /^@(\S+)(?:[ \t　]+(\S+))?[ \t　]*$/;

function parseTime(tok) {
  let m = tok.match(/^(\d{1,2})[:：](\d{2})$/);
  if (!m) m = tok.match(/^(\d{1,2})時(?:(\d{1,2})分)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 29 || min > 59) return null;
  return { h, min };
}

function parseDate(tok, baseDate) {
  let m;
  if ((m = tok.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    const s = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return isValidDate(s) ? s : null;
  }
  if ((m = tok.match(/^(\d{1,2})\/(\d{1,2})$/))) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    const year = Number(baseDate.slice(0, 4));
    for (const y of [year, year - 1]) { // 基準日以前で最も近いその月日
      const s = `${y}-${mm}-${dd}`;
      if (isValidDate(s) && s <= baseDate) return s;
    }
    return null;
  }
  if (tok === '今日') return baseDate;
  if (tok === '昨日') return addDays(baseDate, -1);
  if (tok === '一昨日' || tok === 'おととい') return addDays(baseDate, -2);
  if ((m = tok.match(/^(\d{1,3})日前$/))) return addDays(baseDate, -Number(m[1]));
  return null;
}

/**
 * 本文から 1 行目の日付指定を取り出す。
 * @returns {{ directive: null | { line, token1, token2 }, body: string }}
 */
export function extractDirective(body) {
  const text = String(body || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l.trim() !== '');
  if (idx < 0) return { directive: null, body: text };
  const m = lines[idx].trim().match(LINE);
  // 日付・時刻らしい書き出しのときだけ日付指定とみなす（「@tanaka よろしく」のようなメンションは本文のまま）
  if (!m || !/^(\d|今日|昨日|一昨日|おととい)/.test(m[1])) return { directive: null, body: text };
  lines.splice(idx, 1);
  return { directive: { line: m[0], token1: m[1], token2: m[2] || null }, body: lines.join('\n') };
}

/**
 * 日付指定を日付と時刻にする。
 * @param directive extractDirective の結果
 * @param baseDate 数え始めの日記上の日付（素材を書いた日）
 * @param ownerDate 日付省略時に使う日付（Issue 本文なら投稿日、コメントなら元 Issue の日付）
 * @returns {{ date, time: {h,min}|null } | { error }}
 */
export function resolveDirective(directive, { baseDate, ownerDate }) {
  if (!directive) return null;
  const { token1, token2 } = directive;
  const timeOnly = parseTime(token1);
  if (timeOnly && !token2) return { date: ownerDate, time: timeOnly };
  const date = parseDate(token1, baseDate);
  if (!date) return { error: `日付として読めません: ${directive.line}` };
  if (date > baseDate) return { error: `書いた日より未来の日付です: ${directive.line}` };
  let time = null;
  if (token2) {
    time = parseTime(token2);
    if (!time) return { error: `時刻として読めません: ${directive.line}` };
  }
  return { date, time };
}
