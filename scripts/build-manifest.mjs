#!/usr/bin/env node
/**
 * Writes content/manifest.json from every file in content/articles/.
 *
 * The manifest is generated, never committed — the deploy builds it and
 * `npm run serve` rebuilds it per request, so this command exists only for
 * when you want to inspect the result by hand.
 *
 * Run: npm run build
 */
import { buildManifest } from './lib/manifest.mjs';

const { articleCount, seriesCount, langCount, progress } = await buildManifest();
console.log(`manifest: ${articleCount} article(s), ${seriesCount} series, ${langCount} languages`);
if (progress) console.log(`progress: done ${progress.from} -> ${progress.to}`);
