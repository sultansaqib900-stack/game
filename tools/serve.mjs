/* Zero-dependency static server for NEONVOID: `node tools/serve.mjs [port]` */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const root = process.cwd();
const port = +(process.argv[2] || process.env.PORT || 8080);

createServer(async (req, res) => {
  let pathname = '/';
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch {}
  if (pathname === '/') pathname = '/index.html';
  const file = join(root, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404');
  }
}).listen(port, '0.0.0.0', () => console.log(`NEONVOID serving on http://0.0.0.0:${port}`));
