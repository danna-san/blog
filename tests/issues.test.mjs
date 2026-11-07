import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBody, extractHashtags, cleanAlt, issueToMaterials, parseCommand, isCommand } from '../scripts/lib/issues.mjs';

const OPT = { timezone: 'Asia/Tokyo', dayStartHour: 4, systemLabels: ['published', 'draft'] };
const user = { login: 'me', type: 'User' };

test('本文をテキストとメディアに分ける', () => {
  const segs = parseBody('一行目\n\n<img width="10" alt="Image" src="https://github.com/user-attachments/assets/abc">\n二行目 ![どんぐり](https://example.com/a.png)\nhttps://github.com/user-attachments/assets/0d1e-video\n<!-- コメント -->最後');
  assert.deepEqual(segs.map((s) => s.type), ['text', 'media', 'text', 'media', 'media', 'text']);
  assert.equal(segs[1].alt, '');
  assert.equal(segs[3].alt, 'どんぐり');
  assert.equal(segs[4].url, 'https://github.com/user-attachments/assets/0d1e-video');
  assert.equal(segs[5].text, '最後');
});

test('#タグの抽出（R4.4）', () => {
  const { tags, text } = extractHashtags('ラーメン食べた #ラーメン #123 は参照\n# 見出しは対象外\n#散歩 ');
  assert.deepEqual(tags, ['ラーメン', '散歩']);
  assert.match(text, /#123/);
  assert.match(text, /# 見出し/);
  assert.doesNotMatch(text, /#ラーメン/);
});

test('意味のない代替テキストは空にする', () => {
  assert.equal(cleanAlt('Image'), '');
  assert.equal(cleanAlt('IMG_1234'), '');
  assert.equal(cleanAlt('IMG_1234.HEIC'), '');
  assert.equal(cleanAlt('娘とどんぐり'), '娘とどんぐり');
});

test('素材化: ラベルとタグ、コメントの日付（R2.2, R2.8）', () => {
  const issue = { number: 5, title: '公園 #こども', body: '午後は公園', user, labels: [{ name: '週末' }, { name: 'published' }], created_at: '2026-11-07T06:00:00Z' };
  const comments = [
    { id: 1, user, created_at: '2026-11-07T08:00:00Z', body: '夕方の追加' },
    { id: 2, user, created_at: '2026-11-08T04:00:00Z', body: '翌日のコメント' },
  ];
  const ms = issueToMaterials(issue, comments, OPT);
  assert.equal(ms.length, 3);
  assert.deepEqual(ms[0].tags, ['週末', 'こども']);
  assert.equal(ms[0].title, '公園');
  assert.equal(ms[0].label, '15:00');
  assert.equal(ms[1].label, '17:00');
  assert.equal(ms[2].date, '2026-11-07');
  assert.equal(ms[2].label, '追記');
});

test('素材化: 日付指定（R2.3, R2.6, R2.9）', () => {
  const issue = { number: 4, title: '', body: '@一昨日\n書き忘れ', user, labels: [], created_at: '2026-11-07T01:00:00Z' };
  const [m] = issueToMaterials(issue, [{ id: 9, user, created_at: '2026-11-07T02:00:00Z', body: '@20時\nコメント' }], OPT);
  assert.equal(m.date, '2026-11-05');
  assert.equal(m.label, '追記');
  const all = issueToMaterials(issue, [{ id: 9, user, created_at: '2026-11-07T02:00:00Z', body: '@20時\nコメント' }], OPT);
  assert.equal(all[1].date, '2026-11-05'); // コメントは元 Issue の（指定後の）日付
  assert.equal(all[1].label, '20:00');
  assert.equal(all[1].at, '2026-11-05T11:00:00.000Z');
});

test('読めない日付指定は無視して警告（R2.7）', () => {
  const issue = { number: 1, title: 't', body: '@11/31\n本文', user, labels: [], created_at: '2026-11-07T01:00:00Z' };
  const [m] = issueToMaterials(issue, [], OPT);
  assert.equal(m.date, '2026-11-07');
  assert.equal(m.warnings.length, 1);
  assert.equal(m.segments[0].text, '本文');
});

test('/publish コマンド', () => {
  assert.deepEqual(parseCommand('/publish'), { date: null });
  assert.deepEqual(parseCommand(' /publish 2026-11-05 お願い'), { date: '2026-11-05' });
  assert.equal(parseCommand('publish'), null);
  assert.ok(isCommand('/publish'));
  assert.ok(!isCommand('今日は /publish しない'));
});
