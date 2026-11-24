// Tiny static file server so headless Chrome can load the engine as ES modules.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

export function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://x');
        if (url.pathname === '/api/scenes') {
          const list = fs.readdirSync(path.join(ROOT, 'engine', 'scenes')).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.slice(0, -3));
          res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(list)); return;
        }
        const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const file = path.normalize(path.join(ROOT, rel));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        fs.createReadStream(file).pipe(res);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, close: () => new Promise((r) => server.close(r)) }));
  });
}
