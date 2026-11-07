import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lint, merge, isUsable, buildRequestFile, composeArticle } from '../scripts/lib/writer.mjs';
import { parseJsonLoose } from '../scripts/lib/ai.mjs';

const entries = [
  { id: 'e1', label: '09:20', at: 'a', title: '散歩', segments: [{ type: 'text', text: '雨' }, { type: 'media', mediaId: 'm1' }, { type: 'media', mediaId: 'm2' }] },
  { id: 'e2', label: '追記', at: 'b', title: '', segments: [{ type: 'text', text: '- パン\n- 牛乳' }] },
];
const mediaMap = new Map([['m1', { type: 'image', src: 'a.jpg' }], ['m2', { type: 'image', src: 'b.jpg' }]]);
const style = { persona: 'Q1. 一人称は？\nA: 自分', banned: ['いかがでしたか'], samples: [{ name: 's.md', text: '昔の文章' }] };

test('写真の目印どおりに並べ、抜けた写真は末尾に足す（R4.3）', () => {
  const gen = { entries: [{ id: 'e1', heading: '雨の朝', body: '雨だった。\n\n[[IMG:m2]]\n\nおわり [[IMG:m9]]' }] };
  const out = merge(gen, entries, mediaMap);
  assert.deepEqual(out[0].blocks.map((b) => b.src || b.text), ['雨だった。', 'b.jpg', 'おわり', 'a.jpg']);
  assert.equal(out[0].heading, '雨の朝');
  // 生成されなかったエントリは素材を整形して使う（R5.7）
  assert.deepEqual(out[1].blocks, [{ type: 'text', text: '・パン\n・牛乳' }]);
  assert.equal(out[1].label, '追記');
});

test('検査（R5.6, R5.7）', () => {
  const gen = { entries: [{ id: 'e1', body: 'いかがでしたか\n- 箇条書き' }] };
  const p = lint(gen, entries, style.banned);
  assert.ok(p.some((x) => x.includes('e2')));
  assert.ok(p.some((x) => x.includes('いかがでしたか')));
  assert.ok(p.some((x) => x.includes('箇条書き')));
  assert.deepEqual(lint(null, entries), ['JSON として読めませんでした']);
  assert.ok(isUsable(gen, entries));
  assert.ok(!isUsable({ entries: [{ id: 'x', body: 'a' }] }, entries));
});

test('依頼ファイルに文体・サンプル・yomiyasu の手順・素材が入る（R5.1, R5.5）', () => {
  const day = { date: '2026-11-06', tags: ['散歩'], entries };
  const text = buildRequestFile(day, { style, rewriteLevel: 'medium' });
  for (const s of ['A: 自分', '昔の文章', 'yomiyasu', 'エッセイ', '.tmp/ai/responses/2026-11-06.json', '[e1] 09:20 見出し: 散歩', '[[IMG:m1]]', '[e2] 追記', 'いかがでしたか']) {
    assert.ok(text.includes(s), s);
  }
});

test('生成がなくてもタイトルと紹介文を作る', () => {
  const a = composeArticle({ date: '2026-11-06', entries }, null, mediaMap);
  assert.equal(a.title, '散歩');
  assert.ok(a.description.length > 0);
});

test('応答 JSON の取り出し', () => {
  assert.deepEqual(parseJsonLoose('はい\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('前置き {"a":2} 後ろ'), { a: 2 });
  assert.equal(parseJsonLoose('だめ'), null);
});
