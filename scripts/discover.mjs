#!/usr/bin/env node
/**
 * Finds Making Magic articles that exist on magic.wizards.com but have no
 * summary in this repo, and writes the backlog to content/backlog.json.
 *
 * This is the tracking half of "track the site and update automatically". It
 * runs on a schedule in CI and reports what's new; turning a backlog entry into
 * a summary is a separate step (`npm run fetch -- <url>`), because writing a
 * good summary is the part that needs judgement.
 *
 * Run: npm run discover [-- --limit 20]
 */
import path from 'node:path';
import { ROOT, readJSON, writeJSON, listArticleFiles } from './lib/paths.mjs';
import { listColumnUrls, parseUrl } from './lib/wotc.mjs';

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const have = new Set();
for (const file of await listArticleFiles()) {
  have.add((await readJSON(file)).id);
}

console.log('reading sitemap…');
const urls = await listColumnUrls('making-magic');

const missing = [];
for (const { url, lastmod } of urls) {
  const { id, slug, column, publishedAt } = parseUrl(url);
  if (have.has(id)) continue;
  missing.push({ id, slug, column, publishedAt, lastmod, url });
}

// Newest first. Wizards stopped putting the date in the slug at some point, so
// an undated slug is from the newer scheme and belongs above every dated one;
// its real date has to come from the article page at fetch time.
missing.sort((a, b) => {
  if (!a.publishedAt && !b.publishedAt) {
    return (b.lastmod ?? '').localeCompare(a.lastmod ?? '') || a.slug.localeCompare(b.slug);
  }
  if (!a.publishedAt) return -1;
  if (!b.publishedAt) return 1;
  return b.publishedAt.localeCompare(a.publishedAt);
});
const undated = missing.filter((m) => !m.publishedAt).length;

const backlog = {
  checkedAt: new Date().toISOString().slice(0, 10),
  column: 'making-magic',
  publishedTotal: urls.length,
  summarized: have.size,
  pending: missing.length,
  undatedSlugs: undated,
  items: missing.slice(0, Number.isFinite(limit) ? limit : missing.length),
};

await writeJSON(path.join(ROOT, 'content', 'backlog.json'), backlog);

console.log(`published: ${urls.length}`);
console.log(`summarized: ${have.size}`);
console.log(`pending: ${missing.length} (${undated} with no date in the slug)`);
if (missing.length) {
  console.log('\nmost recent unsummarized:');
  for (const m of missing.slice(0, 10)) {
    console.log(`  ${m.publishedAt ?? `~${m.lastmod ?? '????-??-??'}`}  ${m.url}`);
  }
}
