// 用法:
//   NODE_PATH=$(npm root -g) node render.js preview out_dir 5 12.5 30   # 指定时间点出 PNG 预览
//   NODE_PATH=$(npm root -g) node render.js video out.mp4 [workers]      # 渲染整片（无声）
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const FPS = 30;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.evaluate(() => window.ready());
  return page;
}

const grab = (page, t, type) => page.evaluate(([t, type]) => {
  window.renderFrame(t);
  return document.getElementById('c').toDataURL(type, 0.95);
}, [t, type]);

async function main() {
  const [mode, out, ...rest] = process.argv.slice(2);
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] });
  try {
    if (mode === 'preview') {
      fs.mkdirSync(out, { recursive: true });
      const page = await openPage(browser, port);
      for (const ts of rest) {
        const t0 = Date.now();
        const url = await grab(page, parseFloat(ts), 'image/png');
        fs.writeFileSync(path.join(out, `t${ts}.png`), Buffer.from(url.split(',')[1], 'base64'));
        console.log(`t=${ts} ${Date.now() - t0}ms`);
      }
    } else if (mode === 'video') {
      const workers = parseInt(rest[0] || '4', 10);
      const page0 = await openPage(browser, port);
      const dur = await page0.evaluate(() => window.DURATION);
      await page0.close();
      const total = Math.round(dur * FPS);
      const per = Math.ceil(total / workers);
      const segs = [];
      const t0 = Date.now();
      await Promise.all(Array.from({ length: workers }, async (_, w) => {
        const a = w * per, b = Math.min(total, a + per);
        const seg = `${out}.part${w}.mp4`; segs.push([w, seg]);
        const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
        const done = new Promise((r, j) => ff.on('close', (c) => c === 0 ? r() : j(new Error('ffmpeg ' + c))));
        const page = await openPage(browser, port);
        for (let f = a; f < b; f++) {
          const url = await grab(page, f / FPS, 'image/jpeg');
          const buf = Buffer.from(url.split(',')[1], 'base64');
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
          if ((f - a) % 60 === 0) console.log(`worker ${w}: frame ${f}/${b} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
        ff.stdin.end();
        await done;
        await page.close();
      }));
      segs.sort((x, y) => x[0] - y[0]);
      const list = `${out}.list.txt`;
      fs.writeFileSync(list, segs.map(([, s]) => `file '${path.resolve(s)}'`).join('\n'));
      await new Promise((r, j) => spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'inherit' })
        .on('close', (c) => c === 0 ? r() : j(new Error('concat ' + c))));
      segs.forEach(([, s]) => fs.unlinkSync(s)); fs.unlinkSync(list);
      console.log(`done: ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
