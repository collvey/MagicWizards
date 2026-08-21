#!/usr/bin/env node
/**
 * Scaffolds a new article file from a magic.wizards.com URL.
 *
 * It fetches the essay, works out the metadata, checks which locales Wizards
 * published, and writes content/articles/<id>.json with the translation blocks
 * stubbed out. It does NOT write the summary — a person (or a model with the
 * source text in front of it) still has to do that, which is the point: the
 * value of this site is the quality of the condensing.
 *
 * The extracted source text is printed to stdout so you can write from it, and
 * the numbered key points it finds are pre-filled as lesson slots.
 *
 * Run: npm run fetch -- <url> [--text]
 *   --text   print the full article text and exit without writing a file
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { ROOT, ARTICLES_DIR, readJSON, writeJSON } from './lib/paths.mjs';
import { fetchText, parseUrl, extractArticle, detectLocales } from './lib/wotc.mjs';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http'));
const textOnly = args.includes('--text');

if (!url) {
  console.error('Usage: npm run fetch -- <magic.wizards.com article URL> [--text]');
  process.exit(1);
}

const site = await readJSON(path.join(ROOT, 'content', 'site.json'));
const langs = site.languages.map((l) => l.code);

const meta = parseUrl(url);
console.error(`fetching ${url}`);
const article = extractArticle(await fetchText(url));

if (textOnly) {
  console.log(article.text);
  process.exit(0);
}

const target = path.join(ARTICLES_DIR, `${meta.id}.json`);
try {
  await fs.access(target);
  console.error(`\n${meta.id}.json already exists — edit it directly rather than refetching.`);
  process.exit(1);
} catch {
  /* the file doesn't exist yet, which is what we want */
}

const wotcLocales = site.languages.map((l) => l.wotcLocale).filter((l) => l !== 'en');
console.error('checking which locales Wizards published…');
const locales = ['en', ...(await detectLocales(meta.column, meta.slug, wotcLocales))];

const lessonSlots = article.headings.length
  ? article.headings.map((h, i) => ({ n: i + 1, color: 'W', _heading: h.trim() }))
  : [{ n: 1, color: 'W' }];

const translationStub = () => ({
  title: article.title ?? '',
  dek: '',
  overview: '',
  takeaway: '',
  lessons: lessonSlots.map((s) => ({ title: s._heading ?? '', rules: '', flavor: '' })),
});

const doc = {
  id: meta.id,
  slug: meta.slug,
  column: meta.column,
  author: article.author ?? 'Mark Rosewater',
  // The page's own JSON-LD wins over the slug. They agree almost always, but
  // where they differ the slug is the one that's wrong — fun-part-1-2010-02-26
  // is slugged a Friday and was published the Monday, as the column always is.
  publishedAt: article.publishedAt ?? meta.publishedAt ?? new Date().toISOString().slice(0, 10),
  series: null,
  tags: [],
  pointNoun: article.headings.length ? 'lesson' : 'point',
  source: { canonical: `https://magic.wizards.com/en/news/${meta.column}/${meta.slug}`, locales },
  summaryVersion: 1,
  summarizedAt: new Date().toISOString().slice(0, 10),
  lessons: lessonSlots.map(({ n, color }) => ({ n, color })),
  translations: Object.fromEntries(langs.map((l) => [l, translationStub()])),
};

await writeJSON(target, doc);

console.error(`\nwrote content/articles/${meta.id}.json`);
console.error(`  locales on wizards.com: ${locales.join(', ')}`);
console.error(`  key points found: ${article.headings.length || 'none — add them by hand'}`);
console.error('\nNext: fill in the summary for each language, assign a colour to each');
console.error('lesson, set `series` if it belongs to one, then run `npm run check`.');
console.error('\n--- source text follows on stdout ---');
console.log(article.text);
