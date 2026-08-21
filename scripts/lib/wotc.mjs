/**
 * Reading magic.wizards.com.
 *
 * Two things are needed to grow this archive: a list of what exists, and the
 * text of any one article. Wizards renders its article index client-side, so
 * the listing comes from the sitemap instead — which is both complete and
 * cheap. Article pages embed their body in the page payload as an escaped
 * string, which is what extractArticle() unpacks.
 *
 * Everything here is read-only and hits public URLs only.
 */

const UA = 'making-magic-distilled/1.0 (+https://github.com/collvey/MagicWizards)';
const SITEMAP = 'https://magic.wizards.com/en/sitemap.xml';

export async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/**
 * Every article in a column, as { url, lastmod }. Defaults to Making Magic.
 *
 * lastmod is when Wizards last touched the page, not when it was published, so
 * it is only a hint — but for the newer slugs that carry no date it is the only
 * ordering signal available without fetching each page.
 */
export async function listColumnUrls(column = 'making-magic') {
  const xml = await fetchText(SITEMAP);
  const entryRe = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
  const prefix = `https://magic.wizards.com/en/news/${column}/`;
  const seen = new Map();

  for (const [, loc, lastmod] of xml.matchAll(entryRe)) {
    if (!loc.startsWith(prefix)) continue;
    if (!seen.has(loc)) seen.set(loc, { url: loc, lastmod: lastmod?.slice(0, 10) ?? null });
  }
  return [...seen.values()].sort((a, b) => a.url.localeCompare(b.url));
}

/** Derives our article id and publication date from a Wizards URL. */
export function parseUrl(url) {
  const m = url.match(/magic\.wizards\.com\/([^/]+)\/news\/([^/]+)\/([a-z0-9-]+)/);
  if (!m) throw new Error(`Not a Wizards article URL: ${url}`);
  const [, locale, column, slug] = m;
  // Most slugs end in the date, but some carry a de-duplication suffix after
  // it (…-2014-02-24-0), so look for the date anywhere rather than anchoring.
  const date = slug.match(/(20\d{2}|19\d{2})-(\d{2})-(\d{2})/);
  return {
    locale,
    column,
    slug,
    id: slug,
    publishedAt: date ? `${date[1]}-${date[2]}-${date[3]}` : null,
  };
}

/** Where the article body stops: the end of <main>, or the end of the page. */
function endOfBody(html, from) {
  const rel = html.slice(from).search(/<\/main>/i);
  return rel === -1 ? html.length : from + rel;
}

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&rsquo;': '’', '&lsquo;': '‘',
  '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
};

function decode(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    // Numeric character references, decimal and hex. Wizards writes its
    // titles with &#x27; rather than &#39; or &rsquo;, so without the hex
    // form every title with an apostrophe reaches the site entity and all.
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCodePoint(parseInt(c, 16)))
    .replace(/&#([0-9]+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e] ?? e);
}

/**
 * Pulls the readable body, title, and byline out of an article page.
 * Returns plain text, which is what a human (or a summarizer) needs in order to
 * write the summary — this deliberately does not attempt to auto-generate one.
 */
export function extractArticle(html) {
  const decoded = decode(html);

  const title =
    decoded.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ??
    decoded.match(/<title>([^<]+)<\/title>/)?.[1] ??
    null;

  const author = decoded.match(/"author"\s*:\s*"([^"]+)"/)?.[1] ?? null;

  // Newer slugs carry no date, so the page's own JSON-LD is the only source.
  const publishedAt = decoded.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

  // Scope to the article container before stripping tags. Without this the
  // entire site chrome — product menus, format lists, footer — lands in the
  // output and buries the essay under a few thousand words of navigation.
  const start = decoded.search(/<div[^>]*class="[^"]*article-body/i);
  const scoped = start > -1 ? decoded.slice(start, endOfBody(decoded, start)) : decoded;

  const text = scoped
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Rosewater numbers his key points; surfacing them gives the summary its
  // skeleton without anyone having to re-read the whole essay for structure.
  const headings = [...new Set(scoped.match(/Lesson #\d+[:—-][^<\\\n]{3,90}/g) ?? [])];

  return { title, author, publishedAt, text, headings };
}

/** Checks which locales Wizards actually published this slug under. */
export async function detectLocales(column, slug, locales) {
  const found = [];
  for (const locale of locales) {
    const url = `https://magic.wizards.com/${locale}/news/${column}/${slug}`;
    try {
      const res = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA } });
      if (res.ok) found.push(locale);
    } catch {
      /* a network blip shouldn't fail the whole run — just omit the locale */
    }
  }
  return found;
}
