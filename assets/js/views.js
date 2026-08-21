/** Every screen the router can render. */

import { el, frag, stagger } from './dom.js';
import { t, pick, getLang, langMeta, formatDate, getLanguages } from './i18n.js';
import { sourceUrl, MANA_KEYS, MANA_VAR } from './data.js';

const href = (path) => `#${path}`;

/* --------------------------------------------------------------------- */
/* Shared pieces                                                          */
/* --------------------------------------------------------------------- */

function colorDots(lessons) {
  const seen = [...new Set(lessons.map((l) => l.color))];
  return el(
    'span',
    { class: 'card-pips', 'aria-hidden': 'true' },
    seen.map((c) => el('span', { class: 'dot', style: { background: MANA_VAR[c] } })),
  );
}

function articleCard(entry) {
  const title = entry.titles[getLang()] ?? entry.titles.en ?? entry.id;
  const dek = entry.deks[getLang()] ?? entry.deks.en ?? '';
  return el(
    'li',
    {},
    el(
      'a',
      { class: 'card', href: href(`/a/${entry.id}`) },
      el('span', { class: 'util' }, formatDate(entry.publishedAt)),
      el('h3', { text: title }),
      dek && el('p', { text: dek }),
      el(
        'span',
        { class: 'card-meta util' },
        entry.series ? t('article.part', { n: entry.series.order, total: entry.series.total }) : entry.column,
        colorDots(entry.lessons),
      ),
    ),
  );
}

/* --------------------------------------------------------------------- */
/* Home                                                                   */
/* --------------------------------------------------------------------- */

export function home(manifest) {
  const featured = manifest.series.find((s) => s.featured) ?? manifest.series[0];
  const out = frag();

  out.append(
    el(
      'section',
      { class: 'wrap hero', 'data-animate': 'in' },
      el('p', { class: 'hero-eyebrow util' }, t('home.eyebrow')),
      el('h1', { text: t('site.name') }),
      el('p', { class: 'lead', text: t('home.lead') }),
    ),
  );

  if (featured) out.append(wall(manifest, featured));

  const recent = manifest.articles.slice(0, 6);
  if (recent.length) {
    const list = el('ul', { class: 'cards' }, recent.map(articleCard));
    out.append(
      el(
        'section',
        { class: 'wrap band' },
        el(
          'div',
          { class: 'band-head' },
          el('h2', { text: t('home.recent') }),
          el('a', { href: href('/library') }, t('home.browse')),
        ),
        stagger(list),
      ),
    );
  }

  out.append(
    el(
      'section',
      { class: 'wrap band' },
      el('div', { class: 'band-head' }, el('h2', { text: t('home.howItWorks') })),
      el(
        'ul',
        { class: 'notes' },
        [1, 2, 3].map((i) =>
          el('li', {}, el('h3', { text: t(`home.how.${i}.title`) }), el('p', { text: t(`home.how.${i}.body`) })),
        ),
      ),
    ),
  );

  return out;
}

/**
 * The wall: every lesson in the featured series as one grid, coloured by which
 * slice of the colour pie the principle belongs to. It is the site's table of
 * contents and its argument at once — the whole curriculum visible at a glance,
 * filterable by colour.
 */
function wall(manifest, series) {
  const parts = series.articleIds
    .map((id) => manifest.articles.find((a) => a.id === id))
    .filter(Boolean);

  const tiles = parts.flatMap((article) =>
    article.lessons.map((lesson) =>
      el(
        'li',
        {},
        el(
          'a',
          {
            class: 'tile',
            href: href(`/a/${article.id}?l=${lesson.n}`),
            style: { '--tile-color': MANA_VAR[lesson.color] },
            dataset: { color: lesson.color },
            title: t('article.lesson', { n: lesson.n }),
          },
          el('span', { class: 'tile-n', text: String(lesson.n).padStart(2, '0') }),
          el('span', { class: 'tile-c', 'aria-hidden': 'true', text: lesson.color }),
          el('span', { class: 'sr-only' }, t('article.lesson', { n: lesson.n })),
        ),
      ),
    ),
  );

  const grid = el('ul', { class: 'wall-grid' }, tiles);
  stagger(grid);

  const st = pick(series.translations) ?? {};
  const filter = colorFilter((color) => {
    for (const li of grid.children) {
      const tile = li.firstElementChild;
      li.hidden = !!color && tile.dataset.color !== color;
    }
  });

  return el(
    'section',
    { class: 'wrap wall' },
    el(
      'div',
      { class: 'wall-head' },
      el('h2', { text: st.title ?? series.id }),
      el('span', { class: 'util' }, `${t('series.parts', { n: series.partCount })} · ${t('series.lessons', { n: series.lessonCount })}`),
    ),
    st.blurb && el('p', { class: 'lead', text: st.blurb }),
    filter,
    grid,
    el('p', { class: 'pie-note', text: t('filter.note') }),
  );
}

function colorFilter(onChange) {
  let active = null;
  const bar = el('div', { class: 'pie', role: 'group', 'aria-label': t('filter.colorPie') });

  const buttons = [
    { key: null, label: t('filter.all') },
    ...MANA_KEYS.map((k) => ({ key: k, label: t(`color.${k}`) })),
  ].map((opt) => {
    const btn = el('button', {
      class: 'pip',
      type: 'button',
      'aria-pressed': opt.key === null ? 'true' : 'false',
      style: opt.key ? { '--pip-color': MANA_VAR[opt.key] } : {},
      text: opt.label,
      onClick: () => {
        active = active === opt.key ? null : opt.key;
        for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.key === String(active)));
        onChange(active);
      },
    });
    btn.dataset.key = String(opt.key);
    return btn;
  });

  bar.append(...buttons);
  return bar;
}

/* --------------------------------------------------------------------- */
/* Article                                                                */
/* --------------------------------------------------------------------- */

export function article(manifest, data) {
  const tr = pick(data.translations);
  const lang = getLang();
  const series = data.series ? manifest.series.find((s) => s.id === data.series.id) : null;

  const lessons = el(
    'ul',
    { class: 'lessons' },
    data.lessons.map((meta, i) => {
      const l = tr.lessons[i] ?? {};
      return el(
        'li',
        {
          class: 'lesson',
          id: `lesson-${meta.n}`,
          style: { '--lesson-color': MANA_VAR[meta.color] },
          dataset: { color: meta.color },
        },
        el('span', { class: 'lesson-n', text: t('article.lesson', { n: meta.n }) }),
        el('h3', { text: l.title ?? '' }),
        el('p', { class: 'lesson-rules', text: l.rules ?? '' }),
        l.flavor && el('p', { class: 'lesson-flavor', text: l.flavor }),
        el(
          'p',
          { class: 'lesson-collector' },
          el('span', { class: 'c-color', text: t(`color.${meta.color}`) }),
          el('span', { text: `${data.column} · ${meta.n}/${series?.lessonCount ?? data.lessons.length}` }),
        ),
      );
    }),
  );

  const filter = colorFilter((color) => {
    let any = false;
    for (const li of lessons.children) {
      const hide = !!color && li.dataset.color !== color;
      li.hidden = hide;
      any ||= !hide;
    }
    empty.hidden = any;
  });
  const empty = el('p', { class: 'util util-lower', hidden: true, text: t('filter.empty') });

  const body = el(
    'div',
    { class: 'article-body' },
    el(
      'div',
      {},
      el('h2', { class: 'util section-label', text: t('article.overview') }),
      el('p', { class: 'overview', text: tr.overview }),
      el('h2', { class: 'util section-label', text: t('article.keyPoints') }),
      filter,
      el('div', { style: { marginTop: '1.2rem' } }, lessons, empty),
      el(
        'div',
        { class: 'takeaway' },
        el('h2', { class: 'util', style: { margin: 0 }, text: t('article.takeaway') }),
        el('p', { text: tr.takeaway }),
      ),
    ),
    aside(data, series, manifest),
  );

  return frag(
    el(
      'article',
      { class: 'wrap article' },
      el(
        'header',
        { class: 'article-head' },
        el(
          'p',
          { class: 'util', style: { margin: 0 } },
          data.series ? t('article.part', { n: data.series.order, total: data.series.total }) : data.column,
        ),
        el('h1', { text: tr.title }),
        el(
          'p',
          { class: 'article-meta util', style: { margin: '1.2rem 0 0' } },
          el('span', { text: t('article.by', { author: data.author }) }),
          el('span', { text: t('article.published', { date: formatDate(data.publishedAt) }) }),
          el('span', { text: t('series.lessons', { n: data.lessons.length }) }),
          isFallbackNotice(data, lang),
        ),
      ),
      body,
      pager(manifest, data, series),
    ),
  );
}

function isFallbackNotice(data, lang) {
  if (data.translations[lang]) return null;
  return el('span', { style: { color: 'var(--r)' }, text: `EN · ${t('article.originalEnglish')}` });
}

function aside(data, series, manifest) {
  const box = el('div', { class: 'aside' });

  // Source links: the reader's own language first when Wizards published one,
  // with the English original always available underneath.
  const locales = new Set(data.source.locales ?? ['en']);
  const meta = langMeta();
  const links = el('div', { class: 'aside-box' }, el('h2', { text: t('article.readOriginal') }));

  if (meta.code !== 'en' && locales.has(meta.code)) {
    links.append(
      el(
        'a',
        { class: 'src-link is-primary', href: sourceUrl(data, meta.wotcLocale), target: '_blank', rel: 'noopener' },
        t('article.readOriginalIn', { language: meta.endonym }),
      ),
    );
  }
  links.append(
    el(
      'a',
      {
        class: meta.code === 'en' ? 'src-link is-primary' : 'src-link',
        href: data.source.canonical,
        target: '_blank',
        rel: 'noopener',
      },
      meta.code === 'en' ? t('article.readOriginal') : t('article.originalEnglish'),
    ),
  );
  box.append(links);

  if (series && series.articleIds.length > 1) {
    const nav = el(
      'ul',
      { class: 'seriesnav' },
      series.articleIds.map((id, i) => {
        const entry = manifest.articles.find((a) => a.id === id);
        if (!entry) return null;
        return el(
          'li',
          {},
          el(
            'a',
            { href: href(`/a/${id}`), 'aria-current': id === data.id ? 'page' : null },
            el('span', { class: 'sn-n', text: String(i + 1).padStart(2, '0') }),
            el('span', { text: entry.titles[getLang()] ?? entry.titles.en }),
          ),
        );
      }),
    );
    const st = pick(series.translations) ?? {};
    box.append(el('div', { class: 'aside-box' }, el('h2', { text: st.title ?? t('article.backToSeries') }), nav));
  }

  return box;
}

function pager(manifest, data, series) {
  if (!series) return null;
  const idx = series.articleIds.indexOf(data.id);
  const prevId = series.articleIds[idx - 1];
  const nextId = series.articleIds[idx + 1];
  if (!prevId && !nextId) return null;

  const link = (id, dir, cls) => {
    const entry = manifest.articles.find((a) => a.id === id);
    if (!entry) return null;
    return el(
      'a',
      { href: href(`/a/${id}`), class: cls },
      el('span', { class: 'p-dir', text: t(dir) }),
      el('span', { class: 'p-title', text: entry.titles[getLang()] ?? entry.titles.en }),
    );
  };

  return el('nav', { class: 'pager' }, link(prevId, 'article.prev', ''), link(nextId, 'article.next', 'is-next'));
}

/* --------------------------------------------------------------------- */
/* Library                                                                */
/* --------------------------------------------------------------------- */

export function library(manifest, state, onState) {
  const list = el('ul', { class: 'cards' });
  const empty = el('p', { class: 'util util-lower', hidden: true, text: t('library.empty') });
  const count = el('span', { class: 'util' });

  const search = el('input', {
    class: 'search',
    type: 'search',
    value: state.q ?? '',
    placeholder: t('library.searchPlaceholder'),
    'aria-label': t('library.search'),
    onInput: (e) => {
      state.q = e.target.value;
      onState(state);
      render();
    },
  });

  const sort = el(
    'select',
    {
      class: 'select',
      'aria-label': t('library.sort'),
      onChange: (e) => {
        state.sort = e.target.value;
        onState(state);
        render();
      },
    },
    el('option', { value: 'newest', selected: state.sort !== 'oldest' }, t('library.sort.newest')),
    el('option', { value: 'oldest', selected: state.sort === 'oldest' }, t('library.sort.oldest')),
  );

  function render() {
    const q = (state.q ?? '').trim().toLowerCase();
    let rows = manifest.articles;
    if (q) {
      rows = rows.filter((a) =>
        Object.values(a.titles).concat(Object.values(a.deks)).some((s) => s.toLowerCase().includes(q)),
      );
    }
    rows = [...rows].sort((a, b) =>
      state.sort === 'oldest'
        ? a.publishedAt.localeCompare(b.publishedAt)
        : b.publishedAt.localeCompare(a.publishedAt),
    );
    list.replaceChildren(...rows.map(articleCard));
    stagger(list);
    empty.hidden = rows.length > 0;
    count.textContent = t('library.count', { n: rows.length });
  }

  render();

  return el(
    'section',
    { class: 'wrap band', style: { paddingTop: 'clamp(2.5rem,6vw,4rem)' } },
    el('div', { class: 'band-head' }, el('h2', { text: t('library.title') }), count),
    el('div', { class: 'tools' }, search, sort),
    list,
    empty,
  );
}

/* --------------------------------------------------------------------- */
/* About and states                                                       */
/* --------------------------------------------------------------------- */

export function about(repoUrl) {
  return el(
    'section',
    { class: 'wrap band prose', style: { paddingTop: 'clamp(2.5rem,6vw,4rem)' } },
    el('h1', { text: t('about.title') }),
    el('p', { text: t('about.body') }),
    el('p', { text: t('about.contribute') }),
    el('p', {}, el('a', { class: 'btn', href: repoUrl, target: '_blank', rel: 'noopener' }, t('about.sourceRepo'))),
  );
}

export function loading() {
  return el('section', { class: 'wrap state' }, el('p', { class: 'util', text: t('state.loading') + '…' }));
}

export function errorState(kind = 'error') {
  return el(
    'section',
    { class: 'wrap state' },
    el('h1', { text: t(`state.${kind}.title`) }),
    el('p', { text: t(`state.${kind}.body`) }),
    el('a', { class: 'btn', href: href('/') }, t('state.goHome')),
  );
}

export function languageMenu(current, onPick) {
  return getLanguages().map((l) =>
    el(
      'li',
      { role: 'none' },
      el(
        'button',
        {
          type: 'button',
          role: 'option',
          'aria-selected': String(l.code === current),
          lang: l.htmlLang,
          onClick: () => onPick(l.code),
        },
        el('span', { text: l.endonym }),
        el('span', { class: 'lang-en', text: l.label }),
      ),
    ),
  );
}
