// タイムゾーンと「日付の切り替わり時刻」を考慮した日付計算。外部ライブラリなし。

const fmtCache = new Map();
function formatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }));
  }
  return fmtCache.get(tz);
}

export function partsInTz(instant, tz) {
  const parts = {};
  for (const p of formatter(tz).formatToParts(new Date(instant))) parts[p.type] = p.value;
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/** その瞬間が属する「日記上の日付」(YYYY-MM-DD)。dayStartHour 時より前は前日扱い。 */
export function logicalDate(instant, tz, dayStartHour = 0) {
  const shifted = new Date(new Date(instant).getTime() - dayStartHour * 3600_000);
  const p = partsInTz(shifted, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function timeLabel(instant, tz) {
  const p = partsInTz(instant, tz);
  return `${p.hour}:${p.minute}`;
}

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export function japaneseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}年${m}月${d}日（${w}）`;
}

/** タイムゾーン tz における「dateStr の hh:mm」を UTC の Date にする */
export function zonedToUtc(dateStr, hh, mm, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const target = Date.UTC(y, mo - 1, d, hh, mm);
  let t = target;
  for (let i = 0; i < 3; i++) {
    const p = partsInTz(t, tz);
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    const diff = seen - target;
    if (diff === 0) break;
    t -= diff;
  }
  return new Date(t);
}

/** 日記上の日付 dateStr の「HH:MM」を実際の日時にする。区切り時刻より前・24時以降は深夜（翌暦日）扱い */
export function diaryTimeToUtc(dateStr, hh, mm, tz, dayStartHour) {
  let day = dateStr;
  let h = hh;
  if (h >= 24) { h -= 24; day = addDays(dateStr, 1); }
  else if (h < dayStartHour) { day = addDays(dateStr, 1); }
  return zonedToUtc(day, h, mm, tz);
}

/** 日記上の日付 dateStr の最後の瞬間（次の区切り時刻の 1 分前） */
export function endOfDiaryDay(dateStr, tz, dayStartHour) {
  return new Date(zonedToUtc(addDays(dateStr, 1), dayStartHour, 0, tz).getTime() - 60_000);
}

export function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}
