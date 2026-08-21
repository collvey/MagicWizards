#!/usr/bin/env node
/**
 * Checks every article file against the rules the site relies on.
 *
 * This is what stops a half-translated or mis-shaped article from reaching the
 * site. CI runs it on every push; run it yourself before opening a PR.
 *
 * Run: npm run validate
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { ROOT, readJSON, listArticleFiles } from './lib/paths.mjs';

const COLORS = new Set(['W', 'U', 'B', 'R', 'G']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// summarizedAt is a full ISO timestamp, not a bare date. The home page ranks
// its "recently summarized" band on it, and several articles often land on
// the same day — a bare date ties them all, which silently sinks the newest
// below whichever happens to carry the latest publication date.
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const site = await readJSON(path.join(ROOT, 'content', 'site.json'));
const langs = site.languages.map((l) => l.code);

const problems = [];
const fail = (file, msg) => problems.push(`${path.basename(file)}: ${msg}`);

// Every UI string file must carry the same keys as English, or the interface
// silently falls back mid-page and looks broken in one language only.
const enKeys = Object.keys(await readJSON(path.join(ROOT, 'i18n', 'en.json')));
for (const lang of langs) {
  const file = path.join(ROOT, 'i18n', `${lang}.json`);
  let strings;
  try {
    strings = await readJSON(file);
  } catch {
    fail(file, 'missing or unparseable UI string file');
    continue;
  }
  const missing = enKeys.filter((k) => !(k in strings));
  const extra = Object.keys(strings).filter((k) => !enKeys.includes(k));
  if (missing.length) fail(file, `missing UI keys: ${missing.join(', ')}`);
  if (extra.length) fail(file, `unknown UI keys: ${extra.join(', ')}`);
}

const seenIds = new Set();
const files = await listArticleFiles();

for (const file of files) {
  let a;
  try {
    a = await readJSON(file);
  } catch (err) {
    fail(file, `invalid JSON — ${err.message}`);
    continue;
  }

  for (const field of ['id', 'slug', 'column', 'author', 'publishedAt']) {
    if (!a[field]) fail(file, `missing required field "${field}"`);
  }
  if (a.id && seenIds.has(a.id)) fail(file, `duplicate id "${a.id}"`);
  seenIds.add(a.id);

  const expected = `${a.id}.json`;
  if (path.basename(file) !== expected) fail(file, `filename should be "${expected}"`);
  if (a.publishedAt && !DATE.test(a.publishedAt)) fail(file, 'publishedAt must be YYYY-MM-DD');
  // The home page ranks on summarizedAt, so a missing or mis-shaped one would
  // silently drop the article to the bottom of the "recently summarized" band.
  if (!a.summarizedAt) fail(file, 'missing required field "summarizedAt"');
  else if (!STAMP.test(a.summarizedAt)) {
    fail(file, `summarizedAt must be a full ISO timestamp, not "${a.summarizedAt}"`);
  }
  if (!a.source?.canonical?.startsWith('https://magic.wizards.com/')) {
    fail(file, 'source.canonical must be a magic.wizards.com URL');
  }

  if (a.pointNoun && !['lesson', 'point'].includes(a.pointNoun)) {
    fail(file, 'pointNoun must be "lesson" or "point"');
  }

  const lessons = a.lessons ?? [];
  lessons.forEach((l, i) => {
    if (!Number.isInteger(l.n)) fail(file, `lessons[${i}].n must be an integer`);
    if (!COLORS.has(l.color)) fail(file, `lessons[${i}].color must be one of W U B R G`);
  });

  // A missing language leaves a reader stranded on a blank page, so every
  // configured language must be present and complete.
  for (const lang of langs) {
    const t = a.translations?.[lang];
    if (!t) {
      fail(file, `missing translation for "${lang}"`);
      continue;
    }
    for (const field of ['title', 'overview', 'takeaway']) {
      if (!t[field]?.trim()) fail(file, `translations.${lang}.${field} is empty`);
    }
    const tl = t.lessons ?? [];
    if (tl.length !== lessons.length) {
      fail(file, `translations.${lang}.lessons has ${tl.length} entries, expected ${lessons.length}`);
    }
    tl.forEach((l, i) => {
      for (const field of ['title', 'rules', 'flavor']) {
        if (!l[field]?.trim()) fail(file, `translations.${lang}.lessons[${i}].${field} is empty`);
      }
    });
  }
}

// Series listed in site.json must actually resolve to files on disk.
for (const s of site.series ?? []) {
  for (const id of s.articleIds ?? s.articles ?? []) {
    if (!seenIds.has(id)) problems.push(`site.json: series "${s.id}" references unknown article "${id}"`);
  }
}

if (problems.length) {
  console.error(`validate: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`validate: ${files.length} article(s) across ${langs.length} languages — all good`);
