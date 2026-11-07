// 各ページのメイン領域の HTML を作る。クラス名は docs/assets/css/style.css と対応。
import { esc } from './html.mjs';
import { renderParagraphs } from './markdown.mjs';
import { japaneseDate } from './date.mjs';

export const tagUrl = (tag) => `tags.html?tag=${encodeURIComponent(tag)}`;

function tagList(tags, cls = 'post-tags') {
  if (!tags?.length) return '';
  return `<ul class="${cls}">${tags.map((t) => `<li><a class="tag" href="${esc(tagUrl(t))}">#${esc(t)}</a></li>`).join('')}</ul>`;
}

function mediaHtml(b) {
  if (b.type === 'image') {
    const size = b.width && b.height ? ` width="${b.width}" height="${b.height}"` : '';
    return `<figure class="media"><img src="${esc(b.src)}" alt="${esc(b.alt || '')}"${size} loading="lazy" decoding="async"></figure>`;
  }
  if (b.type === 'video') return `<figure class="media"><video src="${esc(b.src)}" controls playsinline preload="metadata"></video></figure>`;
  if (b.type === 'link') return `<p><a href="${esc(b.src)}" rel="noopener">${esc(b.alt || '添付ファイル')}</a></p>`;
  return '';
}

export function renderPostMain(post) {
  const entries = post.entries.map((e) => {
    const body = e.blocks.map((b) => (b.type === 'text' ? renderParagraphs(b.text) : mediaHtml(b))).join('\n');
    return `<section class="entry reveal" id="${esc(e.id)}">
  <div class="entry-meta"><time class="entry-time" datetime="${esc(e.createdAt || '')}">${esc(e.time)}</time></div>
  <div class="entry-content">
    ${e.heading ? `<h2 class="entry-heading">${esc(e.heading)}</h2>` : ''}
    ${body}
  </div>
</section>`;
  }).join('\n');
  return `<article class="post" data-date="${esc(post.date)}">
  <header class="post-header reveal">
    <p class="post-date"><time datetime="${esc(post.date)}">${esc(japaneseDate(post.date))}</time></p>
    <h1 class="post-title">${esc(post.title)}</h1>
    ${tagList(post.tags)}
  </header>
  <div class="timeline">
${entries}
  </div>
  ${post.closing ? `<div class="post-closing reveal">${renderParagraphs(post.closing)}</div>` : ''}
  <nav class="post-nav" id="post-nav" aria-label="前後の日記"></nav>
</article>`;
}

export function postCard(p) {
  const thumb = p.thumb
    ? `<a class="card-thumb" href="${esc(p.date)}.html" tabindex="-1" aria-hidden="true"><img src="${esc(p.thumb)}" alt="" loading="lazy" decoding="async"></a>`
    : '';
  return `<li class="card reveal">
  ${thumb}
  <div class="card-body">
    <p class="card-date"><time datetime="${esc(p.date)}">${esc(japaneseDate(p.date))}</time></p>
    <h2 class="card-title"><a href="${esc(p.date)}.html">${esc(p.title)}</a></h2>
    ${p.description ? `<p class="card-desc">${esc(p.description)}</p>` : ''}
    ${tagList(p.tags, 'card-tags')}
  </div>
</li>`;
}

export function renderIndexMain(posts, { siteTitle, siteDescription }) {
  const list = posts.length
    ? `<ul class="cards">${posts.map(postCard).join('\n')}</ul>`
    : '<p class="empty">まだ日記はありません。</p>';
  return `<section class="page-intro reveal">
  <h1 class="page-title">${esc(siteTitle)}</h1>
  ${siteDescription ? `<p class="page-lead">${esc(siteDescription)}</p>` : ''}
</section>
${list}
${posts.length ? '<p class="more"><a href="archive.html">これまでの日記をすべて見る</a></p>' : ''}`;
}

export function renderArchiveMain(posts) {
  const byMonth = new Map();
  for (const p of posts) {
    const key = p.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(p);
  }
  const sections = [...byMonth].map(([ym, list]) => {
    const [y, m] = ym.split('-');
    return `<section class="archive-month reveal">
  <h2>${Number(y)}年${Number(m)}月</h2>
  <ul class="archive-list">${list.map((p) => `<li><a href="${esc(p.date)}.html"><time datetime="${esc(p.date)}">${Number(p.date.slice(8))}日</time><span>${esc(p.title)}</span></a></li>`).join('')}</ul>
</section>`;
  }).join('\n');
  return `<h1 class="page-title">これまでの日記</h1>\n${sections || '<p class="empty">まだ日記はありません。</p>'}`;
}

export function renderTagsMain() {
  return `<h1 class="page-title" id="tags-title">タグ</h1>
<form class="search" id="search-form" role="search" onsubmit="return false">
  <label class="visually-hidden" for="search-input">日記を探す</label>
  <input id="search-input" type="search" placeholder="タイトルや紹介文から探す" autocomplete="off">
</form>
<div class="tag-cloud" id="tag-cloud" aria-label="タグ一覧"></div>
<p class="result-count" id="result-count" aria-live="polite"></p>
<ul class="cards" id="tag-results"></ul>
<noscript><p>このページは JavaScript で表示しています。<a href="archive.html">日記の一覧</a>からもたどれます。</p></noscript>`;
}

export function render404Main() {
  return `<h1 class="page-title">ページが見つかりません</h1>
<p>日付が変わっているかもしれません。<a href="archive.html">これまでの日記</a>から探してみてください。</p>`;
}
