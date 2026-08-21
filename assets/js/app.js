/**
 * Router and bootstrap.
 *
 * Routes live in the hash so GitHub Pages needs no rewrite rules:
 *   #/                  home
 *   #/library           all summaries
 *   #/about             about
 *   #/a/<id>            one summary        (?l=<n> scrolls to a lesson)
 * Any route accepts ?lang=<code>, which is how a link carries its language.
 */

import { loadManifest, loadArticle } from './data.js';
import * as i18n from './i18n.js';
import * as views from './views.js';
import { clear } from './dom.js';

const main = document.querySelector('#main');
const repoUrl = document.querySelector('#repo-link').href;
const libraryState = { q: '', sort: 'newest' };

let manifest = null;
let renderToken = 0;

/* --------------------------------------------------------------------- */

function parseRoute() {
  const raw = location.hash.slice(1) || '/';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path, parts, params: new URLSearchParams(query) };
}

/** Rewrites ?lang= on the current route without adding a history entry. */
function syncLangInUrl(lang) {
  const { path, params } = parseRoute();
  params.set('lang', lang);
  history.replaceState(null, '', `#${path}?${params}`);
}

function setActiveNav(parts) {
  const key = parts[0] === 'library' ? 'library' : parts[0] === 'about' ? 'about' : parts.length ? '' : 'home';
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function render() {
  const token = ++renderToken;
  const { parts, params } = parseRoute();
  setActiveNav(parts);

  const stale = () => token !== renderToken;

  try {
    if (parts.length === 0) {
      clear(main).append(views.home(manifest));
    } else if (parts[0] === 'library') {
      clear(main).append(views.library(manifest, libraryState, () => {}));
    } else if (parts[0] === 'about') {
      clear(main).append(views.about(repoUrl));
    } else if (parts[0] === 'a' && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      if (!manifest.articles.some((a) => a.id === id)) {
        clear(main).append(views.errorState('notFound'));
        return;
      }
      clear(main).append(views.loading());
      const data = await loadArticle(id);
      if (stale()) return;
      clear(main).append(views.article(manifest, data));
      focusLesson(params.get('l'));
    } else {
      clear(main).append(views.errorState('notFound'));
    }
  } catch (err) {
    console.error(err);
    if (!stale()) clear(main).append(views.errorState('error'));
  }

  updateTitle(parts);
}

function focusLesson(n) {
  if (!n) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }
  const target = document.querySelector(`#lesson-${CSS.escape(n)}`);
  if (!target) return;
  // Let the layout settle before scrolling, so the sticky rail offset applies.
  requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'auto' }));
}

function updateTitle(parts) {
  const site = i18n.t('site.name');
  if (parts[0] === 'a' && parts[1]) {
    const entry = manifest.articles.find((a) => a.id === decodeURIComponent(parts[1]));
    const title = entry?.titles[i18n.getLang()] ?? entry?.titles.en;
    document.title = title ? `${title} · ${site}` : site;
  } else if (parts[0] === 'library') {
    document.title = `${i18n.t('library.title')} · ${site}`;
  } else if (parts[0] === 'about') {
    document.title = `${i18n.t('about.title')} · ${site}`;
  } else {
    document.title = site;
  }
}

/* --- Language picker --------------------------------------------------- */

function setupLanguagePicker() {
  const btn = document.querySelector('#lang-btn');
  const menu = document.querySelector('#lang-menu');
  const label = document.querySelector('#lang-current');

  const close = () => {
    menu.dataset.open = 'false';
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu.dataset.open = 'true';
    btn.setAttribute('aria-expanded', 'true');
    menu.querySelector('button[aria-selected="true"]')?.focus();
  };

  const paint = () => {
    label.textContent = i18n.langMeta().endonym;
    menu.replaceChildren(
      ...views.languageMenu(i18n.getLang(), async (code) => {
        close();
        await changeLanguage(code);
        btn.focus();
      }),
    );
  };

  btn.addEventListener('click', () => (menu.dataset.open === 'true' ? close() : open()));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.lang')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.dataset.open === 'true') {
      close();
      btn.focus();
    }
  });

  return paint;
}

let repaintLanguagePicker = () => {};

async function changeLanguage(code) {
  if (code === i18n.getLang()) return;
  await i18n.setLang(code);
  syncLangInUrl(code);
  i18n.applyStaticStrings();
  repaintLanguagePicker();
  await render();
}

/* --- Boot -------------------------------------------------------------- */

async function boot() {
  try {
    manifest = await loadManifest();
  } catch (err) {
    console.error(err);
    main.append(views.errorState('error'));
    return;
  }

  i18n.configure(manifest);
  const { params } = parseRoute();
  await i18n.setLang(i18n.resolveInitialLang(params.get('lang')));
  syncLangInUrl(i18n.getLang());
  i18n.applyStaticStrings();

  repaintLanguagePicker = setupLanguagePicker();
  repaintLanguagePicker();

  await render();

  // The language lives in the URL, so a plain hash change must not be mistaken
  // for navigation when only ?lang= differs — render() is cheap and idempotent.
  window.addEventListener('hashchange', () => {
    const lang = parseRoute().params.get('lang');
    if (lang && lang !== i18n.getLang()) {
      changeLanguage(lang);
      return;
    }
    render();
  });
}

boot();
