// 最小限の Markdown（段落・改行・太字・リンク・URL自動リンク）を HTML にする。
import { esc } from './html.mjs';

const INLINE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|(https?:\/\/[^\s<>()（）「」]+)/g;

export function renderInline(text) {
  let out = '';
  let last = 0;
  for (const m of String(text).matchAll(INLINE)) {
    out += esc(text.slice(last, m.index));
    if (m[1] !== undefined) out += `<a href="${esc(m[2])}" rel="noopener">${esc(m[1])}</a>`;
    else if (m[3] !== undefined) out += `<strong>${esc(m[3])}</strong>`;
    else out += `<a href="${esc(m[4])}" rel="noopener">${esc(m[4])}</a>`;
    last = m.index + m[0].length;
  }
  return out + esc(String(text).slice(last));
}

export function renderParagraphs(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split('\n').map(renderInline).join('<br>')}</p>`)
    .join('\n');
}

/** Issue に書かれた Markdown 記法を、ブログ本文向けの素の文章に寄せる（AI なしの時に使う）。 */
export function plainify(text) {
  return String(text ?? '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '・')
    .replace(/^\s*[-*+]\s+/gm, '・')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
