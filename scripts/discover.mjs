#!/usr/bin/env node
/**
 * Builds content/todo.json: every Making Magic article Wizards has published,
 * with its status in this repo.
 *
 * This is the working queue for the archive. It is regenerated rather than
 * hand-maintained, so it can never drift from reality: `status` comes from
 * whether content/articles/<id>.json exists, and the article list comes from
 * Wizards' own sitemap.
 *
 * Ordering is the useful part. Entries are grouped into tiers so that
 * "process the next one" is a meaningful instruction:
 *   1  curated  — foundational essays listed in content/priority.json
 *   2  recent   — published in the last three years
 *   3  archive  — everything else, newest first
 *
 * Run: npm run discover            regenerate the whole queue
 *      npm run discover -- --next  print the next N pending URLs and exit
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { ROOT, readJSON, writeJSON, listArticleFiles } from './lib/paths.mjs';
import { listColumnUrls, parseUrl } from './lib/wotc.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i > -1 ? (argv[i + 1] ?? fallback) : fallback;
};
const nextOnly = argv.includes('--next');
const nextCount = Number(flag('--next', 10)) || 10;
const COLUMN = flag('--column', 'making-magic');

const RECENT_CUTOFF = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

/** Slug -> a readable title, good enough to scan a 1,200-row queue by eye. */
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);
function titleFromSlug(slug) {
  const words = slug
    .replace(/-(19|20)\d{2}-\d{2}-\d{2}(-\d+)?$/, '')
    .split('-')
    .filter(Boolean);
  return words
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

let priority = { ids: [] };
try {
  priority = await readJSON(path.join(ROOT, 'content', 'priority.json'));
} catch {
  /* the curated list is optional — without it everything falls to tier 2/3 */
}
const priorityRank = new Map((priority.ids ?? []).map((id, i) => [id, i]));

const done = new Set();
for (const file of await listArticleFiles()) done.add((await readJSON(file)).id);

if (!nextOnly) console.log(`reading sitemap for ${COLUMN}…`);
const urls = await listColumnUrls(COLUMN);

const items = urls.map(({ url, lastmod }) => {
  const { id, slug, column, publishedAt } = parseUrl(url);
  const date = publishedAt ?? lastmod ?? null;
  const tier = priorityRank.has(id) ? 1 : date && date >= RECENT_CUTOFF ? 2 : 3;
  return {
    id,
    title: titleFromSlug(slug),
    slug,
    column,
    url,
    // Exact when the slug carries the date; otherwise the sitemap's lastmod,
    // which is when Wizards last touched the page, not when it went up.
    publishedAt: date,
    dateSource: publishedAt ? 'slug' : lastmod ? 'sitemap' : 'unknown',
    tier,
    status: done.has(id) ? 'done' : 'pending',
  };
});

items.sort((a, b) => {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.tier === 1) return priorityRank.get(a.id) - priorityRank.get(b.id);
  return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.slug.localeCompare(b.slug);
});

const pending = items.filter((i) => i.status === 'pending');

if (nextOnly) {
  for (const item of pending.slice(0, nextCount)) console.log(item.url);
  process.exit(0);
}

const byTier = (n, list = items) => list.filter((i) => i.tier === n).length;

await writeJSON(path.join(ROOT, 'content', 'todo.json'), {
  checkedAt: new Date().toISOString().slice(0, 10),
  column: COLUMN,
  total: items.length,
  done: items.length - pending.length,
  pending: pending.length,
  tiers: {
    '1-curated': { total: byTier(1), pending: byTier(1, pending) },
    '2-recent': { total: byTier(2), pending: byTier(2, pending) },
    '3-archive': { total: byTier(3), pending: byTier(3, pending) },
  },
  items,
});

// A tiny public summary the site can show without parsing the whole queue.
await writeJSON(path.join(ROOT, 'content', 'progress.json'), {
  checkedAt: new Date().toISOString().slice(0, 10),
  total: items.length,
  done: items.length - pending.length,
});

console.log(`total ${items.length} · done ${items.length - pending.length} · pending ${pending.length}`);
console.log(`  tier 1 curated: ${byTier(1) - byTier(1, pending)}/${byTier(1)}`);
console.log(`  tier 2 recent:  ${byTier(2) - byTier(2, pending)}/${byTier(2)}`);
console.log(`  tier 3 archive: ${byTier(3) - byTier(3, pending)}/${byTier(3)}`);
console.log('\nnext up:');
for (const item of pending.slice(0, 8)) {
  console.log(`  [t${item.tier}] ${item.publishedAt ?? '??????????'}  ${item.title}`);
}

// backlog.json was the earlier, truncated version of this file.
await fs.rm(path.join(ROOT, 'content', 'backlog.json'), { force: true });
