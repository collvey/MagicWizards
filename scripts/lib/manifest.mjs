/**
 * Builds the manifest the site loads first.
 *
 * It holds only what the home and library views need to render a card — titles
 * per language, dates, series position, lesson colours — so those views stay
 * fast no matter how many articles the repo grows to. Full summaries are
 * fetched per article on demand.
 *
 * The manifest is derived entirely from content/articles/, so it is never
 * committed: the deploy builds it, and `npm run serve` rebuilds it on every
 * request. Nothing has to remember to regenerate it.
 *
 * Only articles that pass validation get in. An article that is half-translated
 * or mis-shaped is withheld rather than published: it is the one article that
 * would render badly, so it is the one article that disappears, and everything
 * else ships as usual.
 */
import path from 'node:path';
import { ROOT, readJSON, writeJSON } from './paths.mjs';
import { loadArticles } from './validate.mjs';

export const MANIFEST_FILE = path.join(ROOT, 'content', 'manifest.json');

export async function buildManifest() {
  const site = await readJSON(path.join(ROOT, 'content', 'site.json'));
  const langs = site.languages.map((l) => l.code);

  const { published, withheld } = await loadArticles(langs);
  const entries = [];

  for (const { article: a } of published) {
    const titles = {};
    const deks = {};
    for (const lang of langs) {
      const t = a.translations?.[lang];
      if (t) {
        titles[lang] = t.title;
        deks[lang] = t.dek ?? '';
      }
    }
    entries.push({
      id: a.id,
      slug: a.slug,
      column: a.column,
      author: a.author,
      publishedAt: a.publishedAt,
      // When the summary was written here, as opposed to when Rosewater
      // published the essay. The home page's "recently summarized" band ranks on
      // this: the archive is worked through out of order, so a summary of a 2010
      // column is news here even though the column isn't.
      summarizedAt: a.summarizedAt ?? a.publishedAt,
      series: a.series ?? null,
      tags: a.tags ?? [],
      canonical: a.source.canonical,
      sourceLocales: a.source.locales ?? ['en'],
      lessonCount: a.lessons?.length ?? 0,
      lessons: (a.lessons ?? []).map((l) => ({ n: l.n, color: l.color })),
      languages: Object.keys(titles),
      titles,
      deks,
    });
  }

  entries.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));

  // Series get their article list resolved and ordered here so the client never
  // has to stitch it together itself.
  const series = (site.series ?? []).map((s) => {
    const members = entries
      .filter((e) => e.series?.id === s.id)
      .sort((a, b) => (a.series.order ?? 0) - (b.series.order ?? 0));
    return {
      id: s.id,
      featured: !!s.featured,
      translations: s.translations,
      articleIds: members.map((m) => m.id),
      lessonCount: members.reduce((n, m) => n + m.lessonCount, 0),
      partCount: members.length,
      firstPublishedAt: members.at(0)?.publishedAt ?? null,
    };
  });

  const manifest = {
    generatedAt: new Date().toISOString().slice(0, 10),
    languages: site.languages,
    defaultLanguage: site.defaultLanguage,
    count: entries.length,
    series,
    articles: entries,
  };

  await writeJSON(MANIFEST_FILE, manifest);
  const progress = await syncProgress(entries.length);

  return {
    manifest,
    articleCount: entries.length,
    seriesCount: series.length,
    langCount: langs.length,
    progress,
    withheld,
  };
}

/**
 * The home page's progress line reads content/progress.json, whose denominator
 * only `npm run discover` can know — it comes from Wizards' sitemap. The
 * numerator, though, is just how many summaries are on disk, so keep it current
 * here rather than leaving the count stale until the next networked run.
 *
 * Returns the before/after pair when it changed, so callers can report it.
 */
async function syncProgress(done) {
  const file = path.join(ROOT, 'content', 'progress.json');
  try {
    const progress = await readJSON(file);
    if (progress.done === done) return null;
    await writeJSON(file, { ...progress, done });
    return { from: progress.done, to: done };
  } catch {
    /* no queue has been built yet — the progress line is an extra, not load-bearing */
    return null;
  }
}
