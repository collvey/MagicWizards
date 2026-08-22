/**
 * The content rules the site relies on, in one place.
 *
 * The checks are split by blast radius, because the two kinds want opposite
 * treatment on a deploy:
 *
 *   - Repo-wide problems (a missing UI string file) break every page in a
 *     language, so they stop the deploy.
 *   - Article problems break exactly one article, so they only withhold that
 *     article: the manifest leaves it out, the rest of the site ships, and the
 *     half-finished summary is invisible rather than blank.
 *
 * Used by `scripts/validate.mjs` to report and by `lib/manifest.mjs` to decide
 * what is publishable — the same rules either way, so nothing can be listed on
 * the site that the validator would have rejected.
 */
import path from 'node:path';
import { ROOT, readJSON, listArticleFiles } from './paths.mjs';

const COLORS = new Set(['W', 'U', 'B', 'R', 'G']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// summarizedAt is a full ISO timestamp, not a bare date. The home page ranks
// its "recently summarized" band on it, and several articles often land on
// the same day — a bare date ties them all, which silently sinks the newest
// below whichever happens to carry the latest publication date.
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Problems that no single article owns, and that no per-article skip can
 * contain: every UI string file must carry the same keys as English, or the
 * interface silently falls back mid-page and looks broken in one language only.
 */
export async function checkRepo(site) {
  const problems = [];
  const enKeys = Object.keys(await readJSON(path.join(ROOT, 'i18n', 'en.json')));

  for (const lang of site.languages.map((l) => l.code)) {
    const file = path.join(ROOT, 'i18n', `${lang}.json`);
    let strings;
    try {
      strings = await readJSON(file);
    } catch {
      problems.push(`i18n/${lang}.json: missing or unparseable UI string file`);
      continue;
    }
    const missing = enKeys.filter((k) => !(k in strings));
    const extra = Object.keys(strings).filter((k) => !enKeys.includes(k));
    if (missing.length) problems.push(`i18n/${lang}.json: missing UI keys: ${missing.join(', ')}`);
    if (extra.length) problems.push(`i18n/${lang}.json: unknown UI keys: ${extra.join(', ')}`);
  }
  return problems;
}

/** Everything one article file has to get right to be worth rendering. */
export function checkArticle(a, langs) {
  const problems = [];

  for (const field of ['id', 'slug', 'column', 'author', 'publishedAt']) {
    if (!a[field]) problems.push(`missing required field "${field}"`);
  }
  if (a.publishedAt && !DATE.test(a.publishedAt)) problems.push('publishedAt must be YYYY-MM-DD');
  // The home page ranks on summarizedAt, so a missing or mis-shaped one would
  // silently drop the article to the bottom of the "recently summarized" band.
  if (!a.summarizedAt) problems.push('missing required field "summarizedAt"');
  else if (!STAMP.test(a.summarizedAt)) {
    problems.push(`summarizedAt must be a full ISO timestamp, not "${a.summarizedAt}"`);
  }
  if (!a.source?.canonical?.startsWith('https://magic.wizards.com/')) {
    problems.push('source.canonical must be a magic.wizards.com URL');
  }
  if (a.pointNoun && !['lesson', 'point'].includes(a.pointNoun)) {
    problems.push('pointNoun must be "lesson" or "point"');
  }

  const lessons = a.lessons ?? [];
  lessons.forEach((l, i) => {
    if (!Number.isInteger(l.n)) problems.push(`lessons[${i}].n must be an integer`);
    if (!COLORS.has(l.color)) problems.push(`lessons[${i}].color must be one of W U B R G`);
  });

  // A missing language leaves a reader stranded on a blank page, so every
  // configured language must be present and complete.
  for (const lang of langs) {
    const t = a.translations?.[lang];
    if (!t) {
      problems.push(`missing translation for "${lang}"`);
      continue;
    }
    for (const field of ['title', 'overview', 'takeaway']) {
      if (!t[field]?.trim()) problems.push(`translations.${lang}.${field} is empty`);
    }
    const tl = t.lessons ?? [];
    if (tl.length !== lessons.length) {
      problems.push(`translations.${lang}.lessons has ${tl.length} entries, expected ${lessons.length}`);
    }
    tl.forEach((l, i) => {
      for (const field of ['title', 'rules', 'flavor']) {
        if (!l[field]?.trim()) problems.push(`translations.${lang}.lessons[${i}].${field} is empty`);
      }
    });
  }

  return problems;
}

/**
 * Reads content/articles/ and sorts it into what can be published and what
 * cannot, with the reasons. Callers decide what to do about the rejects: the
 * validator prints them, the manifest simply leaves them out.
 */
export async function loadArticles(langs) {
  const files = await listArticleFiles();
  const published = [];
  const withheld = [];
  const seenIds = new Map();

  for (const file of files) {
    const name = path.basename(file);
    let a;
    try {
      a = await readJSON(file);
    } catch (err) {
      withheld.push({ file, name, id: null, problems: [`invalid JSON — ${err.message}`] });
      continue;
    }

    const problems = checkArticle(a, langs);
    // Whichever file sorts second loses: the first one is already the article
    // that id refers to everywhere else.
    if (a.id && seenIds.has(a.id)) {
      problems.push(`duplicate id "${a.id}" — already claimed by ${path.basename(seenIds.get(a.id))}`);
    }
    if (a.id && name !== `${a.id}.json`) problems.push(`filename should be "${a.id}.json"`);

    if (problems.length) {
      withheld.push({ file, name, id: a.id ?? null, problems });
      continue;
    }
    seenIds.set(a.id, file);
    published.push({ file, name, article: a });
  }

  return { published, withheld };
}
