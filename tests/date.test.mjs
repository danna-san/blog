import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logicalDate, timeLabel, japaneseDate, zonedToUtc, diaryTimeToUtc, endOfDiaryDay, addDays, isValidDate } from '../scripts/lib/date.mjs';

const TZ = 'Asia/Tokyo';

test('朝 4 時より前は前日扱い（R2.1）', () => {
  assert.equal(logicalDate('2026-11-06T17:10:00Z', TZ, 4), '2026-11-06'); // JST 11/7 02:10
  assert.equal(logicalDate('2026-11-06T19:00:00Z', TZ, 4), '2026-11-07'); // JST 11/7 04:00
  assert.equal(logicalDate('2026-11-06T17:10:00Z', TZ, 0), '2026-11-07');
});

test('時刻と和暦の表示', () => {
  assert.equal(timeLabel('2026-11-06T00:20:00Z', TZ), '09:20');
  assert.equal(japaneseDate('2026-11-07'), '2026年11月7日（土）');
});

test('ローカル時刻から UTC への変換', () => {
  assert.equal(zonedToUtc('2026-11-05', 21, 0, TZ).toISOString(), '2026-11-05T12:00:00.000Z');
  assert.equal(zonedToUtc('2026-07-01', 9, 0, 'America/New_York').toISOString(), '2026-07-01T13:00:00.000Z');
});

test('深夜の時刻は日記上の日付を変えない（R2.10）', () => {
  // 11/5 の「1:30」→ 暦の上では 11/6 1:30
  assert.equal(diaryTimeToUtc('2026-11-05', 1, 30, TZ, 4).toISOString(), '2026-11-05T16:30:00.000Z');
  assert.equal(diaryTimeToUtc('2026-11-05', 25, 30, TZ, 4).toISOString(), '2026-11-05T16:30:00.000Z');
  assert.equal(logicalDate(diaryTimeToUtc('2026-11-05', 1, 30, TZ, 4), TZ, 4), '2026-11-05');
});

test('その日の最後は次の区切り時刻の 1 分前', () => {
  const end = endOfDiaryDay('2026-11-05', TZ, 4);
  assert.equal(end.toISOString(), '2026-11-05T18:59:00.000Z');
  assert.equal(logicalDate(end, TZ, 4), '2026-11-05');
});

test('日付の補助関数', () => {
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.ok(isValidDate('2028-02-29'));
  assert.ok(!isValidDate('2026-02-30'));
});
