import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDirective, resolveDirective } from '../scripts/lib/directive.mjs';

const r = (body, baseDate = '2026-11-07', ownerDate = '2026-11-07') =>
  resolveDirective(extractDirective(body).directive, { baseDate, ownerDate });

test('1 行目の日付指定を取り出して本文から除く（R2.3）', () => {
  const { directive, body } = extractDirective('\n@11/5 18:30\n本文です');
  assert.equal(directive.token1, '11/5');
  assert.equal(directive.token2, '18:30');
  assert.equal(body.trim(), '本文です');
  assert.equal(extractDirective('本文\n@11/5').directive, null); // 1 行目以外は対象外
  assert.equal(extractDirective('@someone こんにちは さん').directive, null); // 3 語以上は対象外
  assert.equal(extractDirective('@tanaka よろしく').directive, null); // メンションは本文のまま
});

test('日付の書き方', () => {
  assert.deepEqual(r('@2026-11-05'), { date: '2026-11-05', time: null });
  assert.deepEqual(r('@11/5'), { date: '2026-11-05', time: null });
  assert.deepEqual(r('@昨日'), { date: '2026-11-06', time: null });
  assert.deepEqual(r('@一昨日 21時'), { date: '2026-11-05', time: { h: 21, min: 0 } });
  assert.deepEqual(r('@おととい'), { date: '2026-11-05', time: null });
  assert.deepEqual(r('@3日前 7時15分'), { date: '2026-11-04', time: { h: 7, min: 15 } });
});

test('年を省略したら、書いた日以前で最も近いその月日（R2.4）', () => {
  assert.deepEqual(r('@12/30', '2027-01-02'), { date: '2026-12-30', time: null });
  assert.deepEqual(r('@1/1', '2027-01-02'), { date: '2027-01-01', time: null });
});

test('時刻だけなら投稿日（コメントは元 Issue の日付）（R2.9）', () => {
  assert.deepEqual(r('@18:30', '2026-11-08', '2026-11-07'), { date: '2026-11-07', time: { h: 18, min: 30 } });
  assert.deepEqual(r('@21時', '2026-11-07', '2026-11-07'), { date: '2026-11-07', time: { h: 21, min: 0 } });
});

test('未来の日付や読めない指定はエラー（R2.7）', () => {
  assert.ok(r('@2026-11-10').error);
  assert.ok(r('@11/31').error);
  assert.ok(r('@11/5 夜').error);
  assert.ok(r('@31:00').error);
});
