// usage: node render.mjs start end out.mp4 [port]
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { startServer } from './server.mjs';
const [start, end, out, port = 8140] = process.argv.slice(2);
const FPS = 60, W = 1920, H = 1080;
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-vf', 'vflip', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', out], { stdio: ['pipe', 'inherit', 'inherit'] });
let sendOn = false;
const srv = await startServer(+port, async (i, buf) => {
  if (!sendOn) return;
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
});
const b = await chromium.launch({ headless: false, args: ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox', '--window-size=1920,1080'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:${port}/index.html`); await p.waitForFunction('window.ready', null, { timeout: 120000 });
const s = +start, e = +end, t0 = Date.now();
for (let i = Math.max(0, s - 12); i < s; i++) await p.evaluate(i => window.renderFrame(i / 60), i); // afterimage warm-up
sendOn = true;
for (let i = s; i < e; i++) {
  await p.evaluate(([t, i]) => window.renderAndSend(t, i), [i / FPS, i]);
  if ((i - s) % 120 === 0) console.log(`[${out}] frame ${i}/${e}  ${((Date.now() - t0) / 1000 / (i - s + 1)).toFixed(2)} s/f`);
}
ff.stdin.end(); await new Promise(r => ff.on('close', r));
await b.close(); srv.close();
console.log('done', out, (Date.now() - t0) / 1000, 's');
