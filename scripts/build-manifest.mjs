#!/usr/bin/env node
/**
 * Builds content/manifest.json from every file in content/articles/.
 *
 * The manifest is what the site loads first. It holds only what the home and
 * library views need to render a card — titles per language, dates, series
 * position, lesson colours — so those views stay fast no matter how many
 * articles the repo grows to. Full summaries are fetched per article on demand.
 *
 * Run: npm run build
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, readJSON, writeJSON, listArticleFiles } from './lib/paths.mjs';

const site = await readJSON(path.join(ROOT, 'content', 'site.json'));
const langs = site.languages.map((l) => l.code);

const files = await listArticleFiles();
const entries = [];

for (const file of files) {
  const a = await readJSON(file);
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

await writeJSON(path.join(ROOT, 'content', 'manifest.json'), manifest);
console.log(`manifest: ${entries.length} article(s), ${series.length} series, ${langs.length} languages`);

// The home page's progress line reads content/progress.json, whose denominator
// only `npm run discover` can know — it comes from Wizards' sitemap. The
// numerator, though, is just how many summaries are on disk, so keep it current
// here rather than leaving the count stale until the next networked run.
const progressFile = path.join(ROOT, 'content', 'progress.json');
try {
  const progress = await readJSON(progressFile);
  if (progress.done !== entries.length) {
    await writeJSON(progressFile, { ...progress, done: entries.length });
    console.log(`progress: done ${progress.done} -> ${entries.length}`);
  }
} catch {
  /* no queue has been built yet — the progress line is an extra, not load-bearing */
}
