import http from 'http';
import fs from 'fs';
import path from 'path';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
export function startServer(port, onFrame) {
  return new Promise(res => {
    const s = http.createServer((req, rsp) => {
      const u = new URL(req.url, 'http://x');
      if (req.method === 'POST' && u.pathname === '/frame') {
        const chunks = []; req.on('data', c => chunks.push(c));
        req.on('end', async () => { await onFrame(+u.searchParams.get('i'), Buffer.concat(chunks)); rsp.end('ok'); });
        return;
      }
      const f = path.join(ROOT, decodeURIComponent(u.pathname));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.statusCode = 404; return rsp.end(); }
      rsp.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
      fs.createReadStream(f).pipe(rsp);
    });
    s.listen(port, () => res(s));
  });
}
