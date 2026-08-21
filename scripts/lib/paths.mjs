import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ARTICLES_DIR = path.join(ROOT, 'content', 'articles');

export async function readJSON(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function writeJSON(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function listArticleFiles() {
  const names = await fs.readdir(ARTICLES_DIR);
  return names
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => path.join(ARTICLES_DIR, n));
}
