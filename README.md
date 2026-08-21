# Making Magic, Distilled

A static site that condenses [Mark Rosewater's *Making Magic*](https://magic.wizards.com/en/news/making-magic)
design column into its key points, in five languages, always linking back to the
original essay.

The archive starts with the *Twenty Years, Twenty Lessons* series — Rosewater's
2016 GDC talk, adapted into three columns — and is built to take the rest of the
column one article at a time.

> Unofficial fan project. *Magic: The Gathering* and *Making Magic* are property
> of Wizards of the Coast LLC. This site is not produced, endorsed, or reviewed
> by Wizards of the Coast. Summaries are original writing; the essays themselves
> belong to their author and publisher and are only ever linked, never reproduced.

## What it does

- **Summarizes, doesn't replace.** Each key point is set like a Magic card's text
  box: the principle as rules text, then the example from the essay as flavour
  text. Every article links back to the full original.
- **Five languages.** English, Spanish, French, Portuguese, and Chinese
  (Simplified). Switching language also switches the link to the original —
  Wizards publishes localized versions under the same slug, and each article
  records which locales actually exist.
- **A colour-pie reading.** Every lesson is tagged with one of Magic's five
  colours according to which slice of the colour pie the principle belongs to,
  which doubles as a way to browse. This is our interpretation, not Rosewater's,
  and the site says so.

## Running it locally

```bash
npm run serve      # http://localhost:8080
```

There is no build step and no dependencies — it is plain HTML, CSS, and ES
modules. The dev server exists only because ES modules and `fetch` don't work
over `file://`.

```bash
npm run validate   # check every article and translation file
npm run build      # regenerate content/manifest.json
npm run check      # both of the above; run this before committing
npm run discover   # rebuild the queue of every Making Magic article
npm run discover -- --next 5   # print the next few URLs to work on
```

## Adding an article

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version:

```bash
npm run fetch -- https://magic.wizards.com/en/news/making-magic/<slug>
```

That writes `content/articles/<slug>.json` pre-filled with the metadata, the
locales Wizards published, and a slot per numbered key point, then prints the
essay text so you can write from it. Fill in the five translations, assign each
lesson a colour, run `npm run check`, and commit.

## How it's laid out

```
index.html                 app shell
assets/css/app.css         the whole design system
assets/js/
  app.js                   hash router and bootstrap
  views.js                 every screen
  data.js                  manifest and article loading
  i18n.js                  language resolution and UI strings
  dom.js                   small element helpers
content/
  site.json                languages and series definitions — edit this
  manifest.json            generated; do not edit
  articles/<id>.json       one file per article, all languages inside
  priority.json            curated order for the queue's first tier — edit this
  skip.json                articles not worth summarizing, with reasons — edit this
  todo.json                generated; the full queue, every article + status
  progress.json            generated; the done/total counts the site displays
i18n/<lang>.json           UI strings, one file per language
scripts/                   validate, build, fetch, discover, serve
```

### Why the content is shaped this way

One file per article, with every language inside it, means adding an article is
adding a file and nothing else — no index to update by hand, no per-language
directory tree to keep in sync. `npm run build` regenerates the manifest from
whatever is on disk, and CI refuses to deploy if the committed manifest is stale.

The manifest holds only what a card needs to render (titles, dates, series
position, lesson colours), so the home and library views stay fast as the archive
grows toward the column's 1,265 published articles. Full summaries load per
article, on demand.

## Adding a language

1. Add an entry to `languages` in `content/site.json`. `wotcLocale` must match
   the locale segment Wizards uses in its URLs (`es`, `fr`, `pt-BR`, `zh-Hans`,
   `de`, `it`, `ja`, `ko`, `ru`, `zh-Hant`), so source links resolve.
2. Copy `i18n/en.json` to `i18n/<code>.json` and translate the values.
3. Add a `translations.<code>` block to every article, and a `translations.<code>`
   entry to each series in `content/site.json`.
4. `npm run check` — the validator fails on any missing key or empty field.

Until an article has the new language, readers of that language fall back to the
English summary rather than an empty page, and the article header says so.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which validates the
content, confirms the manifest is current, and publishes to GitHub Pages.

## The queue

`npm run discover` rebuilds `content/todo.json`: every Making Magic article
Wizards has published, each with its status here. It is generated, never
hand-edited, so it cannot drift — `status` is derived from whether
`content/articles/<id>.json` exists, and the article list comes from Wizards'
own sitemap.

Entries are grouped into tiers so "do the next one" means something:

| tier | what | order |
|---|---|---|
| 1 | curated foundational essays, listed in `content/priority.json` | that file's order |
| 2 | published in the last three years | newest first |
| 3 | everything else | newest first |

`npm run discover -- --next 5` prints the next few URLs, ready to paste into
`npm run fetch`.

Not every column is summarizable. Some are link roundups, some are card-by-card
preview galleries, some are mailbags with no through-line — condensing those
produces a page that says nothing. List those in `content/skip.json` with a
reason and they stop surfacing at the top of the queue. They're excluded from
the progress count too, so a handful of link indexes can't make the total
permanently unreachable.

Dates are exact where the slug carries one. Wizards dropped the date suffix from
newer slugs, so those fall back to the sitemap's `lastmod` — an approximation,
flagged per row as `dateSource`. `npm run fetch` pulls the true date from the
article's own JSON-LD when it scaffolds the file.

`.github/workflows/track-new-articles.yml` runs this every Monday, commits the
refreshed queue, and keeps a single tracking issue current.

It stops at reporting rather than generating summaries. Discovery and fetching
are mechanical and safe to automate; condensing an essay well is the part this
site exists for, so it stays a deliberate step.
