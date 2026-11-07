// content/posts/*.json から docs/ 以下の HTML・JSON・フィードを組み立てる。AI は呼ばない。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fillTemplate } from './template.mjs';
import { esc } from './html.mjs';
import { japaneseDate } from './date.mjs';
import { renderPostMain, renderIndexMain, renderArchiveMain, renderTagsMain, render404Main } from './render.mjs';

export function loadPosts(contentDir) {
  const dir = join(contentDir, 'posts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function firstImage(post) {
  for (const e of post.entries) for (const b of e.blocks) if (b.type === 'image') return b.src;
  return '';
}

export function buildIndexData(posts, config) {
  const counts = new Map();
  for (const p of posts) for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return {
    site: { title: config.site.title },
    generatedAt: new Date().toISOString(),
    posts: posts.map((p) => ({ date: p.date, title: p.title, description: p.description, tags: p.tags || [], thumb: firstImage(p) })),
    tags: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja')),
    ui: { headerTagCount: config.ui.headerTagCount },
  };
}

function assetVersion(outDir) {
  const h = createHash('sha1');
  for (const f of ['assets/css/style.css', 'assets/js/app.js']) {
    const p = join(outDir, f);
    if (existsSync(p)) h.update(readFileSync(p));
  }
  return h.digest('hex').slice(0, 8);
}

const abs = (config, path) => (config.site.baseUrl ? `${config.site.baseUrl}/${path}` : path);

export function buildSite({ contentDir, outDir, templatesDir, config, log = console }) {
  const layout = readFileSync(join(templatesDir, 'layout.html'), 'utf8');
  const posts = loadPosts(contentDir);
  const data = buildIndexData(posts, config);
  const version = assetVersion(outDir);
  const year = new Date().getFullYear();

  const page = (file, { title, description, main, pageType, date = '', ogImage = '', ogType = 'website' }) => {
    const html = fillTemplate(layout, {
      vars: {
        lang: config.site.language,
        pageTitle: title ? `${title} | ${config.site.title}` : config.site.title,
        description: description || config.site.description,
        canonical: abs(config, file === 'index.html' ? '' : file),
        ogImage: ogImage ? abs(config, ogImage) : '',
        ogType,
        siteName: config.site.title,
        pageType,
        date,
        v: version,
      },
      slots: {
        siteTitle: esc(config.site.title),
        siteDescription: esc(config.site.description),
        main,
        footer: `&copy; ${year} ${esc(config.site.author || config.site.title)}`,
      },
      root: '',
    });
    writeFileSync(join(outDir, file), html);
  };

  mkdirSync(join(outDir, 'data'), { recursive: true });
  for (const p of posts) {
    page(`${p.date}.html`, {
      title: p.title, description: p.description, main: renderPostMain(p), pageType: 'post',
      date: p.date, ogImage: firstImage(p), ogType: 'article',
    });
  }
  page('index.html', { main: renderIndexMain(data.posts.slice(0, config.ui.indexPostCount), { siteTitle: config.site.title, siteDescription: config.site.description }), pageType: 'index' });
  page('archive.html', { title: 'これまでの日記', main: renderArchiveMain(data.posts), pageType: 'archive' });
  page('tags.html', { title: 'タグ', main: renderTagsMain(), pageType: 'tags' });
  page('404.html', { title: 'ページが見つかりません', main: render404Main(), pageType: 'notfound' });
  writeFileSync(join(outDir, 'data/index.json'), `${JSON.stringify(data)}\n`);
  writeFileSync(join(outDir, 'feed.xml'), renderFeed(posts.slice(0, config.ui.feedPostCount), config));
  writeFileSync(join(outDir, 'sitemap.xml'), renderSitemap(posts, config));
  writeFileSync(join(outDir, '.nojekyll'), '');
  log.log?.(`サイトを組み立てました: 記事 ${posts.length} 件 -> ${outDir}`);
  return { posts: posts.length };
}

function renderFeed(posts, config) {
  const base = config.site.baseUrl;
  const updated = posts[0]?.generatedAt || new Date().toISOString();
  const items = posts.map((p) => `  <entry>
    <title>${esc(p.title)}</title>
    <link href="${esc(`${base}/${p.date}.html`)}"/>
    <id>${esc(`${base}/${p.date}.html`)}</id>
    <updated>${esc(p.generatedAt || `${p.date}T00:00:00Z`)}</updated>
    <summary>${esc(`${japaneseDate(p.date)} ${p.description || ''}`)}</summary>
  </entry>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(config.site.title)}</title>
  <link href="${esc(`${base}/`)}"/>
  <link rel="self" href="${esc(`${base}/feed.xml`)}"/>
  <id>${esc(`${base}/`)}</id>
  <updated>${esc(updated)}</updated>
  <author><name>${esc(config.site.author || config.site.title)}</name></author>
${items}
</feed>
`;
}

function renderSitemap(posts, config) {
  const base = config.site.baseUrl;
  const urls = ['', 'archive.html', 'tags.html', ...posts.map((p) => `${p.date}.html`)];
  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(`${base}/${u}`)}</loc></url>`).join('\n')}
</urlset>
`;
}
