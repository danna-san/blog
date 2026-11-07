// テンプレート処理。
//   - <!--@name-->サンプル<!--/@name--> の区間を差し替える（ブラウザで開くとサンプルが見える）
//   - {{name}} を値（エスケープ済み）で置き換える
//   - "../docs/" をサイトのルートへの相対パスに置き換える（テンプレートを直接開いてもCSSが効くように）
import { esc } from './html.mjs';

export function fillTemplate(tpl, { vars = {}, slots = {}, root = './' } = {}) {
  let out = tpl.replace(/<!--@([\w-]+)-->[\s\S]*?<!--\/@\1-->/g, (all, name) => (name in slots ? slots[name] : all));
  out = out.replace(/\{\{([\w-]+)\}\}/g, (all, name) => (name in vars ? esc(vars[name]) : ''));
  return out.split('../docs/').join(root);
}
