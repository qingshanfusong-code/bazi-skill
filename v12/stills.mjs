// usage: node stills.mjs out_dir t1 t2 ...
import { chromium } from 'playwright';
import fs from 'fs';
import { startServer } from './server.mjs';
const [out, ...ts] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const srv = await startServer(8130);
const b = await chromium.launch({ headless: false, args: ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox', '--window-size=1920,1080'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('http://localhost:8130/index.html'); await p.waitForFunction('window.ready', null, { timeout: 120000 });
for (const t of ts) {
  const t0 = Date.now();
  // warm a few frames before for afterimage continuity
  const url = await p.evaluate(t => window.still(+t), t);
  fs.writeFileSync(`${out}/t${(+t).toFixed(2).padStart(6, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('t', t, Date.now() - t0, 'ms');
}
await b.close(); srv.close();
