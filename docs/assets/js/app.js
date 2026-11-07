/*
 * 日記ブログの動き（ライブラリなし）
 * - data/index.json を読んで、ヘッダーのタグ・左メニュー・前後リンク・タグページを描画する
 * - ドロワー、ライトボックス、スクロールで現れる演出、トップへ戻る、テーマ切り替え
 * データから要素を作るときは textContent / setAttribute だけを使う（innerHTML は使わない）。
 */
(function () {
  'use strict';

  var doc = document;
  var body = doc.body;
  var rootMeta = doc.querySelector('meta[name="blog-root"]');
  var ROOT = rootMeta ? rootMeta.getAttribute('content') || '' : '';
  // テンプレートを直接開いたとき（{{pageType}} が置き換わっていない）はサンプルをそのまま見せる
  var TEMPLATE_PREVIEW = /^\{\{/.test(body.getAttribute('data-page') || '');
  var PAGE = TEMPLATE_PREVIEW ? 'template' : body.getAttribute('data-page');
  var CURRENT_DATE = TEMPLATE_PREVIEW ? '' : body.getAttribute('data-date') || '';
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  doc.documentElement.classList.add('js');

  /* ---------- 小さな道具 ---------- */
  function el(tag, attrs, children) {
    var node = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') node.textContent = v;
        else if (k === 'className') node.className = v;
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function parts(date) { var p = date.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function weekday(date) { var p = parts(date); return WEEK[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; }
  function jpDate(date) { var p = parts(date); return p.y + '年' + p.m + '月' + p.d + '日（' + weekday(date) + '）'; }
  function shortDate(date) { var p = parts(date); return p.m + '/' + p.d; }
  function tagHref(name) { return ROOT + 'tags.html?tag=' + encodeURIComponent(name); }
  function postHref(date) { return ROOT + date + '.html'; }
  function storage(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { /* プライベートモードなど */ }
    return null;
  }

  /* ---------- データ ---------- */
  function loadData() {
    if (TEMPLATE_PREVIEW || !window.fetch) return Promise.resolve(null);
    return fetch(ROOT + 'data/index.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* ---------- ヘッダーのタグ ---------- */
  function renderTagNav(data) {
    var nav = doc.getElementById('tag-nav');
    if (!nav) return;
    clear(nav);
    var max = (data.ui && data.ui.headerTagCount) || 12;
    var active = PAGE === 'tags' ? new URLSearchParams(location.search).get('tag') : null;
    data.tags.slice(0, max).forEach(function (t) {
      nav.appendChild(el('li', null, [
        el('a', { className: 'tag', href: tagHref(t.name), 'aria-current': t.name === active ? 'true' : null, text: '#' + t.name }),
      ]));
    });
  }

  /* ---------- 左メニュー（年 → 月 → 日） ---------- */
  function renderArchiveTree(data) {
    var box = doc.getElementById('archive-tree');
    if (!box) return;
    clear(box);
    if (!data.posts.length) { box.appendChild(el('p', { className: 'empty', text: 'まだ日記はありません。' })); return; }
    var focus = CURRENT_DATE || data.posts[0].date;
    var years = {};
    var order = [];
    data.posts.forEach(function (p) {
      var y = p.date.slice(0, 4);
      var m = p.date.slice(5, 7);
      if (!years[y]) { years[y] = { months: {}, order: [], count: 0 }; order.push(y); }
      var Y = years[y];
      if (!Y.months[m]) { Y.months[m] = []; Y.order.push(m); }
      Y.months[m].push(p);
      Y.count++;
    });
    order.forEach(function (y) {
      var Y = years[y];
      var yd = el('details', { className: 'tree-year', open: focus.slice(0, 4) === y });
      yd.appendChild(el('summary', null, [y + '年 ', el('span', { className: 'count', text: String(Y.count) })]));
      Y.order.forEach(function (m) {
        var list = Y.months[m];
        var md = el('details', { className: 'tree-month', open: focus.slice(0, 7) === y + '-' + m });
        md.appendChild(el('summary', null, [Number(m) + '月 ', el('span', { className: 'count', text: String(list.length) })]));
        var ul = el('ul', { className: 'tree-days' });
        list.forEach(function (p) {
          ul.appendChild(el('li', null, [el('a', {
            href: postHref(p.date),
            title: p.title,
            'aria-current': p.date === CURRENT_DATE ? 'page' : null,
            text: parts(p.date).d + '日（' + weekday(p.date) + '）' + p.title,
          })]));
        });
        md.appendChild(ul);
        yd.appendChild(md);
      });
      box.appendChild(yd);
    });
    var current = box.querySelector('[aria-current="page"]');
    if (current && current.scrollIntoView && window.innerWidth > 960) current.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- 前後の日記 ---------- */
  function renderPostNav(data) {
    var nav = doc.getElementById('post-nav');
    if (!nav || PAGE !== 'post') return;
    clear(nav);
    var i = data.posts.findIndex(function (p) { return p.date === CURRENT_DATE; });
    if (i < 0) return;
    var older = data.posts[i + 1];
    var newer = data.posts[i - 1];
    if (older) nav.appendChild(navLink(older, 'prev', '前の日'));
    if (newer) nav.appendChild(navLink(newer, 'next', '次の日'));
  }
  function navLink(p, cls, label) {
    return el('a', { className: 'post-nav-link ' + cls, href: postHref(p.date), rel: cls }, [
      el('span', { className: 'post-nav-label', text: label }),
      el('span', { className: 'post-nav-title', text: shortDate(p.date) + ' ' + p.title }),
    ]);
  }

  /* ---------- 記事カード（タグページ用。HTML 側の postCard と同じ形） ---------- */
  function card(p) {
    var li = el('li', { className: 'card reveal' });
    if (p.thumb) {
      li.appendChild(el('a', { className: 'card-thumb', href: postHref(p.date), tabindex: '-1', 'aria-hidden': 'true' }, [
        el('img', { src: ROOT + p.thumb, alt: '', loading: 'lazy', decoding: 'async' }),
      ]));
    }
    var tags = el('ul', { className: 'card-tags' });
    (p.tags || []).forEach(function (t) { tags.appendChild(el('li', null, [el('a', { className: 'tag', href: tagHref(t), text: '#' + t })])); });
    li.appendChild(el('div', { className: 'card-body' }, [
      el('p', { className: 'card-date' }, [el('time', { datetime: p.date, text: jpDate(p.date) })]),
      el('h2', { className: 'card-title' }, [el('a', { href: postHref(p.date), text: p.title })]),
      p.description ? el('p', { className: 'card-desc', text: p.description }) : null,
      tags,
    ]));
    return li;
  }

  /* ---------- タグページ ---------- */
  function initTagsPage(data) {
    var cloud = doc.getElementById('tag-cloud');
    var results = doc.getElementById('tag-results');
    var count = doc.getElementById('result-count');
    var title = doc.getElementById('tags-title');
    var input = doc.getElementById('search-input');
    if (!cloud || !results) return;
    var params = new URLSearchParams(location.search);
    var state = { tag: params.get('tag') || '', q: params.get('q') || '' };
    if (input) input.value = state.q;

    function sync() {
      var p = new URLSearchParams();
      if (state.tag) p.set('tag', state.tag);
      if (state.q) p.set('q', state.q);
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }
    function render() {
      clear(cloud);
      data.tags.forEach(function (t) {
        var b = el('button', { type: 'button', className: 'tag', 'aria-pressed': t.name === state.tag ? 'true' : 'false', 'aria-current': t.name === state.tag ? 'true' : null }, [
          '#' + t.name, el('span', { className: 'tag-count', text: String(t.count) }),
        ]);
        b.addEventListener('click', function () { state.tag = state.tag === t.name ? '' : t.name; sync(); render(); });
        cloud.appendChild(b);
      });
      var q = state.q.trim().toLowerCase();
      var list = data.posts.filter(function (p) {
        if (state.tag && (p.tags || []).indexOf(state.tag) < 0) return false;
        if (q && (p.title + ' ' + (p.description || '') + ' ' + (p.tags || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      if (title) title.textContent = state.tag ? '#' + state.tag + ' の日記' : 'タグ';
      doc.title = (state.tag ? '#' + state.tag + ' | ' : 'タグ | ') + (data.site && data.site.title ? data.site.title : '');
      clear(results);
      if (state.tag || q) {
        count.textContent = list.length ? list.length + ' 件の日記' : '見つかりませんでした。';
        list.forEach(function (p) { results.appendChild(card(p)); });
      } else {
        count.textContent = 'タグを選ぶか、言葉で探してください。';
      }
      observeReveal(results);
    }
    if (input) {
      var timer;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { state.q = input.value; sync(); render(); }, 150);
      });
    }
    render();
  }

  /* ---------- ドロワー（スマホの左メニュー） ---------- */
  function initDrawer() {
    var btn = doc.querySelector('.menu-toggle');
    var sidebar = doc.getElementById('sidebar');
    var overlay = doc.querySelector('.overlay');
    if (!btn || !sidebar) return;
    function set(open) {
      body.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      if (overlay) overlay.hidden = !open;
      if (open) { var first = sidebar.querySelector('a, summary'); if (first) first.focus({ preventScroll: true }); }
    }
    btn.addEventListener('click', function () { set(!body.classList.contains('menu-open')); });
    if (overlay) overlay.addEventListener('click', function () { set(false); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && body.classList.contains('menu-open')) { set(false); btn.focus(); }
    });
    sidebar.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) set(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 960 && body.classList.contains('menu-open')) set(false); });
  }

  /* ---------- ライトボックス ---------- */
  function initLightbox() {
    var images = Array.prototype.slice.call(doc.querySelectorAll('.post .media img'));
    if (!images.length) return;
    var box, img, counter, index = 0, lastFocus = null, touchX = null;
    function build() {
      img = el('img', { alt: '' });
      counter = el('p', { className: 'lb-count' });
      var close = el('button', { type: 'button', className: 'lb-close', 'aria-label': '閉じる', text: '×' });
      var prev = el('button', { type: 'button', className: 'lb-prev', 'aria-label': '前の写真', text: '‹' });
      var next = el('button', { type: 'button', className: 'lb-next', 'aria-label': '次の写真', text: '›' });
      box = el('div', { className: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': '写真' }, [img, close, prev, next, counter]);
      close.addEventListener('click', hide);
      prev.addEventListener('click', function (e) { e.stopPropagation(); show(index - 1); });
      next.addEventListener('click', function (e) { e.stopPropagation(); show(index + 1); });
      box.addEventListener('click', function (e) { if (e.target === box) hide(); });
      box.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', function (e) {
        if (touchX === null) return;
        var dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
        touchX = null;
      });
      if (images.length < 2) { prev.hidden = true; next.hidden = true; counter.hidden = true; }
    }
    function show(i) {
      index = (i + images.length) % images.length;
      img.src = images[index].currentSrc || images[index].src;
      img.alt = images[index].alt || '';
      counter.textContent = (index + 1) + ' / ' + images.length;
    }
    function open(i) {
      if (!box) build();
      lastFocus = doc.activeElement;
      show(i);
      body.appendChild(box);
      body.style.overflow = 'hidden';
      requestAnimationFrame(function () { box.classList.add('is-open'); });
      box.querySelector('.lb-close').focus();
    }
    function hide() {
      if (!box || !box.parentNode) return;
      box.classList.remove('is-open');
      body.style.overflow = '';
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, reduceMotion ? 0 : 250);
      if (lastFocus) lastFocus.focus();
    }
    images.forEach(function (im, i) {
      im.setAttribute('tabindex', '0');
      im.setAttribute('role', 'button');
      im.setAttribute('aria-label', (im.alt ? im.alt + '：' : '') + '写真を大きく表示');
      im.addEventListener('click', function () { open(i); });
      im.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
    });
    doc.addEventListener('keydown', function (e) {
      if (!box || !box.parentNode) return;
      if (e.key === 'Escape') hide();
      else if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === 'ArrowRight') show(index + 1);
    });
  }

  /* ---------- スクロールで現れる ---------- */
  var observer = null;
  // JS が動いたときだけ「隠してから現す」。app.js が読めなくても本文は見える。
  if (!reduceMotion && 'IntersectionObserver' in window) doc.documentElement.classList.add('reveal-ready');
  function observeReveal(scope) {
    var items = (scope || doc).querySelectorAll('.reveal:not(.is-visible)');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (n) { n.classList.add('is-visible'); });
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-visible'); observer.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    }
    Array.prototype.forEach.call(items, function (n) { observer.observe(n); });
  }

  /* ---------- トップへ戻る ---------- */
  function initToTop() {
    var btn = doc.querySelector('.to-top');
    if (!btn) return;
    btn.hidden = false;
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { btn.classList.toggle('is-visible', window.scrollY > 600); ticking = false; });
    }, { passive: true });
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });
  }

  /* ---------- テーマ切り替え ---------- */
  function initTheme() {
    var btn = doc.querySelector('.theme-toggle');
    if (!btn) return;
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function effective() {
      var t = doc.documentElement.getAttribute('data-theme');
      if (t) return t;
      return media && media.matches ? 'dark' : 'light';
    }
    function label() { btn.setAttribute('aria-label', effective() === 'dark' ? '明るい表示にする' : '暗い表示にする'); }
    btn.addEventListener('click', function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      doc.documentElement.setAttribute('data-theme', next);
      storage('theme', next);
      label();
    });
    label();
  }

  /* ---------- 起動 ---------- */
  function start() {
    initDrawer();
    initLightbox();
    initToTop();
    initTheme();
    observeReveal(doc);
    loadData().then(function (data) {
      if (!data || !data.posts) return;
      renderTagNav(data);
      renderArchiveTree(data);
      renderPostNav(data);
      if (PAGE === 'tags') initTagsPage(data);
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})();
