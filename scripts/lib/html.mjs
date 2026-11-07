// HTML エスケープ。生成するすべての文字列はここを通す。
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
}
export function safeUrl(url) {
  const u = String(url ?? '').trim();
  return /^(https?:\/\/|\.{0,2}\/|[\w-]+\.html|assets\/|tags\.html|#)/i.test(u) && !/^javascript:/i.test(u) ? u : '#';
}
