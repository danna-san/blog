import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInline, renderParagraphs, plainify } from '../scripts/lib/markdown.mjs';
import { esc } from '../scripts/lib/html.mjs';
import { fillTemplate } from '../scripts/lib/template.mjs';

test('HTML は必ずエスケープする（R12.7）', () => {
  assert.equal(esc('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
  assert.equal(renderInline('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(renderInline('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
});

test('リンク・太字・URL', () => {
  assert.equal(renderInline('**太字** と [店](https://example.com/a?b=1&c=2)'), '<strong>太字</strong> と <a href="https://example.com/a?b=1&amp;c=2" rel="noopener">店</a>');
  assert.equal(renderInline('見て https://example.com です'), '見て <a href="https://example.com" rel="noopener">https://example.com</a> です');
});

test('段落と改行', () => {
  assert.equal(renderParagraphs('一\n二\n\n三'), '<p>一<br>二</p>\n<p>三</p>');
});

test('Markdown 記法を素の文章に寄せる', () => {
  assert.equal(plainify('## 見出し\n- りんご\n- [x] みかん\n> 引用'), '見出し\n・りんご\n・みかん\n引用');
});

test('テンプレート: 区間差し替え・変数・パス・説明コメント除去', () => {
  const tpl = '<!--# 説明 -->\n<title>{{t}}</title><link href="../docs/a.css"><main><!--@main-->サンプル<!--/@main--></main><p><!--@keep-->残る<!--/@keep--></p>';
  assert.equal(fillTemplate(tpl, { vars: { t: 'A&B' }, slots: { main: '<b>本文</b>' }, root: '' }),
    '<title>A&amp;B</title><link href="a.css"><main><b>本文</b></main><p><!--@keep-->残る<!--/@keep--></p>');
});
