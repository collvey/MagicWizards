/**
 * Language state and UI string lookup.
 *
 * Language is resolved once, in this order: an explicit ?lang= in the hash,
 * a previous choice in localStorage, the browser's Accept-Language, then the
 * site default. Whatever wins is written back to the URL so a link to a summary
 * carries its language with it.
 */

const STORAGE_KEY = 'mmd.lang';

let languages = [];
let defaultLang = 'en';
let current = 'en';
let strings = {};
const cache = new Map();

export function configure(manifest) {
  languages = manifest.languages;
  defaultLang = manifest.defaultLanguage ?? 'en';
}

export const getLanguages = () => languages;
export const getLang = () => current;
export const langMeta = (code = current) => languages.find((l) => l.code === code) ?? languages[0];

/** Matches a browser tag like "zh-CN" or "pt" against our configured codes. */
function negotiate(tags) {
  const codes = languages.map((l) => l.code);
  for (const raw of tags) {
    const tag = raw.toLowerCase();
    const exact = codes.find((c) => c.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split('-')[0];
    const prefixed = codes.find((c) => c.toLowerCase().split('-')[0] === base);
    if (prefixed) return prefixed;
  }
  return null;
}

export function resolveInitialLang(fromUrl) {
  const codes = languages.map((l) => l.code);
  if (fromUrl && codes.includes(fromUrl)) return fromUrl;
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* private browsing, or storage disabled — fall through to negotiation */
  }
  if (stored && codes.includes(stored)) return stored;
  return negotiate(navigator.languages ?? [navigator.language ?? '']) ?? defaultLang;
}

export async function setLang(code) {
  current = code;
  strings = await loadStrings(code);
  const meta = langMeta(code);
  document.documentElement.lang = meta.htmlLang ?? code;
  document.documentElement.dir = meta.dir ?? 'ltr';
  document.body.dataset.lang = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* nothing to do — the choice still applies for this page view */
  }
}

async function loadStrings(code) {
  if (cache.has(code)) return cache.get(code);
  const res = await fetch(`./i18n/${code}.json`);
  if (!res.ok) throw new Error(`Missing UI strings for ${code}`);
  const json = await res.json();
  cache.set(code, json);
  return json;
}

/** Look up a UI string, filling {placeholders} from `vars`. */
export function t(key, vars) {
  let s = strings[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/**
 * Picks the best available translation of a piece of content, preferring the
 * current language, then the site default, then whatever exists. Content can
 * lag the UI — a newly added article may not be translated yet — and a reader
 * is better served by an English summary than by an empty page.
 */
export function pick(translations, code = current) {
  return translations?.[code] ?? translations?.[defaultLang] ?? Object.values(translations ?? {})[0];
}

/** True when the requested language isn't the one we're actually showing. */
export function isFallback(translations, code = current) {
  return !!translations && !translations[code];
}

export function formatDate(iso) {
  const meta = langMeta();
  try {
    // Format in UTC: the date is a publication date, not a moment. Without
    // this, a reader west of Greenwich sees every article dated a day early.
    return new Intl.DateTimeFormat(meta.htmlLang ?? current, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

/** Applies translations to any static markup carrying data-i18n. */
export function applyStaticStrings(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}
