#!/usr/bin/env node
/**
 * Checks every article file against the rules the site relies on.
 *
 * Two kinds of problem, treated differently, because they differ in what they
 * would break:
 *
 *   - Repo-wide (a missing UI string file) breaks every page in a language.
 *     Nothing can be published around it, so it always exits non-zero.
 *   - Article-level (a half-translated summary) breaks exactly that article.
 *     The build withholds it and ships everything else, so on a deploy this is
 *     reported and tolerated — one unfinished summary is not a reason to hold
 *     back the other eighty-nine.
 *
 * Run: npm run validate            hard failure on anything wrong, for authors
 *      npm run validate -- --ship  article problems are warnings, for the deploy
 */
import path from 'node:path';
import { ROOT, readJSON } from './lib/paths.mjs';
import { checkRepo, loadArticles } from './lib/validate.mjs';

// The deploy passes --ship: it wants to know what it is withholding, not to be
// stopped by it. Authors get the strict default, so `npm run check` still says
// no to an article that isn't finished.
const ship = process.argv.includes('--ship');

const site = await readJSON(path.join(ROOT, 'content', 'site.json'));
const langs = site.languages.map((l) => l.code);

const blocking = await checkRepo(site);
const { published, withheld } = await loadArticles(langs);

// Series listed in site.json must resolve to an article that is actually going
// to be published — a reference to a withheld article is the withheld
// article's problem, already reported below, so it isn't repeated here.
const publishedIds = new Set(published.map((p) => p.article.id));
const withheldIds = new Set(withheld.map((w) => w.id).filter(Boolean));
for (const s of site.series ?? []) {
  for (const id of s.articleIds ?? s.articles ?? []) {
    if (!publishedIds.has(id) && !withheldIds.has(id)) {
      blocking.push(`site.json: series "${s.id}" references unknown article "${id}"`);
    }
  }
}

if (withheld.length) {
  // A green build that quietly drops an article is worse than a red one, so on
  // CI each withheld article also becomes an annotation on the run itself —
  // visible without opening the log.
  if (ship && process.env.GITHUB_ACTIONS) {
    for (const w of withheld) {
      const where = path.relative(ROOT, w.file).split(path.sep).join('/');
      console.log(`::warning file=${where}::withheld from the site — ${w.problems.length} problem(s): ${w.problems[0]}`);
    }
  }

  const count = withheld.reduce((n, w) => n + w.problems.length, 0);
  const verb = ship ? 'will not be published' : 'would not be published';
  console.error(`validate: ${withheld.length} article(s) ${verb} — ${count} problem(s)\n`);
  for (const w of withheld) {
    console.error(`  ${w.name}`);
    for (const p of w.problems) console.error(`    - ${p}`);
    console.error('');
  }
}

if (blocking.length) {
  console.error(`validate: ${blocking.length} problem(s) affecting the whole site\n`);
  for (const p of blocking) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `validate: ${published.length} article(s) across ${langs.length} languages ready to publish` +
    (withheld.length ? `, ${withheld.length} withheld` : ' — all good'),
);

// An author running this wants a hard no on an unfinished article; the deploy
// has already been told which ones it is leaving out and should carry on.
if (withheld.length && !ship) process.exit(1);
