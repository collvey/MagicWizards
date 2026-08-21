#!/usr/bin/env node
/**
 * Static file server for local preview. ES modules and fetch() don't work over
 * file://, so use this rather than opening index.html directly.
 *
 * Run: npm run serve   (then open http://localhost:8080)
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib/paths.mjs';

const PORT = Number(process.env.PORT ?? 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';

  const file = path.join(ROOT, rel);
  // Never serve outside the repo, whatever the request path claims.
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store, must-revalidate',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, () => console.log(`serving ${ROOT}\n  http://localhost:${PORT}`));
