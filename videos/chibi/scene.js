'use strict';
// 赤壁之战 · 程序化电影短片渲染器（1080x1920 竖屏）
// 所有画面都是 t（秒）的纯函数：renderFrame(t) 可任意顺序/并行渲染。

const W = 1080, H = 1920;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

// ---------------------------------------------------------------- utils
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function R(a, b = 0) { const x = Math.sin(a * 127.1 + b * 311.7 + 0.123) * 43758.5453; return x - Math.floor(x); }
function n1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(R(i, 7.7), R(i + 1, 7.7), u) * 2 - 1; }
function fbm(x) { return n1(x) * 0.6 + n1(x * 2.1 + 5) * 0.3 + n1(x * 4.3 + 9) * 0.1; }

let WIND = 0;   // 火焰/烟/余烬的水平风向

function glowSprite(r, g, b, size = 128, mid = 0.25, midA = 0.5) {
  const c = mk(size, size), x = c.getContext('2d');
  const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(mid, `rgba(${r},${g},${b},${midA})`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  return c;
}
const SP = {
  white: glowSprite(255, 248, 230),
  yellow: glowSprite(255, 196, 90),
  orange: glowSprite(255, 112, 28),
  red: glowSprite(190, 36, 8),
  smoke: glowSprite(34, 26, 24, 128, 0.45, 0.7),
  warm: glowSprite(150, 62, 22, 128, 0.4, 0.6),
  fog: glowSprite(110, 140, 145, 128, 0.4, 0.5),
  cloud: glowSprite(22, 34, 40, 128, 0.45, 0.6),
  blue: glowSprite(110, 185, 255),
  moon: glowSprite(200, 220, 255, 128, 0.15, 0.4),
  ember: glowSprite(255, 160, 60, 32, 0.25, 0.6),
};
function spr(c, img, x, y, w, h, a) {
  if (a <= 0.003) return;
  c.globalAlpha = a > 1 ? 1 : a;
  c.drawImage(img, x - w / 2, y - h / 2, w, h);
}

// 胶片颗粒
const GRAIN = [];
for (let k = 0; k < 4; k++) {
  const g = mk(540, 960), gx = g.getContext('2d'), id = gx.createImageData(540, 960);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
  }
  gx.putImageData(id, 0, 0); GRAIN.push(g);
}

const scn = mk(W, H), sx = scn.getContext('2d');           // 场景层
const tmp = mk(W, H), tx = tmp.getContext('2d');           // 倒影用
const fig = mk(W, H), fx = fig.getContext('2d');           // 剪影/轮廓光用
const blm = mk(W / 4, H / 4), bx = blm.getContext('2d');   // 泛光

// ---------------------------------------------------------------- particles
function fire(c, x, y, w, h, t, seed, I = 1, n = 50) {
  if (I <= 0.01) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const fl = 0.85 + 0.15 * n1(t * 9 + seed);
  spr(c, SP.orange, x, y - h * 0.3, w * 2.6, h * 1.5, 0.32 * I * fl);
  spr(c, SP.yellow, x, y - h * 0.12, w * 1.3, h * 0.6, 0.35 * I * fl);
  // 火舌
  const nT = Math.max(2, Math.round(n / 7));
  for (let k = 0; k < nT; k++) {
    const bx = x + (R(k, seed + 20) - 0.5) * w * 0.85;
    const hh = h * (0.4 + 0.55 * R(k, seed + 21)) * (0.7 + 0.4 * n1(t * 4.5 + k * 2.3 + seed)) * (0.4 + 0.6 * I);
    const bw = w * (0.1 + 0.12 * R(k, seed + 22));
    const sway = n1(t * 2.7 + k * 1.9 + seed) * w * 0.22 + WIND * hh * 0.55;
    const by = y + (R(k, seed + 23) - 0.3) * h * 0.18;
    const tipx = bx + sway, tipy = by - hh;
    const g = c.createLinearGradient(0, by + bw * 0.7, 0, tipy);
    g.addColorStop(0, 'rgba(255,190,110,0)'); g.addColorStop(0.24, 'rgba(255,228,175,0.48)'); g.addColorStop(0.45, 'rgba(255,160,50,0.45)');
    g.addColorStop(0.78, 'rgba(225,70,15,0.25)'); g.addColorStop(1, 'rgba(160,25,5,0)');
    c.globalAlpha = clamp(I); c.fillStyle = g;
    c.beginPath(); c.moveTo(bx - bw, by);
    c.bezierCurveTo(bx - bw * 1.3, by - hh * 0.45, tipx - bw * 0.25, by - hh * 0.8, tipx, tipy);
    c.bezierCurveTo(tipx + bw * 0.25, by - hh * 0.8, bx + bw * 1.3, by - hh * 0.45, bx + bw, by);
    c.quadraticCurveTo(bx, by + bw * 1.4, bx - bw, by);
    c.closePath(); c.fill();
  }
  const N = Math.max(4, Math.round(n * Math.min(1, I + 0.2)));
  for (let k = 0; k < N; k++) {
    const per = 0.5 + R(k, seed) * 0.55;
    const life = ((t / per) + R(k, seed + 1)) % 1;
    const ox = (R(k, seed + 2) - 0.5) * w;
    const px = x + ox * (1 - life * 0.75) + n1(t * 3.3 + k * 1.7 + seed) * w * 0.12 * life + WIND * life * life * h * 0.6;
    const py = y - life * h * (0.55 + R(k, seed + 3) * 0.6) * (0.5 + 0.5 * I);
    const sz = (w * 0.2 + R(k, seed + 4) * w * 0.25) * (1 - life * 0.6);
    let img, a;
    if (life < 0.22) { img = SP.white; a = 0.45; }
    else if (life < 0.5) { img = SP.yellow; a = 0.55; }
    else if (life < 0.78) { img = SP.orange; a = 0.55; }
    else { img = SP.red; a = 0.5; }
    a *= (1 - life) * 1.5 * I * ss(0, 0.08, life);
    spr(c, img, px, py, sz * 0.6, sz * 1.5, a);
  }
  c.restore();
}

function smoke(c, x, y, w, h, t, seed, I = 1, n = 16, lit = 0.6) {
  if (I <= 0.01) return;
  c.save();
  for (let k = 0; k < n; k++) {
    const per = 4.5 + R(k, seed) * 4;
    const ph = ((t / per) + R(k, seed + 1)) % 1;
    const px = x + (R(k, seed + 2) - 0.5) * w + WIND * ph * h * 0.7 + n1(t * 0.4 + k * 3 + seed) * w * 0.6 * ph;
    const py = y - ph * h;
    const sz = w * (0.7 + ph * 2.6) * (0.6 + R(k, seed + 3) * 0.6);
    const a = 0.55 * I * ss(0, 0.12, ph) * (1 - ph);
    spr(c, SP.smoke, px, py, sz, sz * 0.8, a);
    if (ph < 0.45) spr(c, SP.warm, px, py, sz, sz * 0.8, a * lit * (1 - ph / 0.45));
  }
  c.restore();
}

function embers(c, t, seed, n, x0, x1, y0, y1, I = 1, size = 1) {
  if (I <= 0.01) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < n; k++) {
    const per = 2.5 + R(k, seed) * 4;
    const ph = ((t / per) + R(k, seed + 1)) % 1;
    const x = lerp(x0, x1, R(k, seed + 2)) + n1(t * 0.8 + k * 3.1) * 90 + WIND * ph * 500;
    const y = lerp(y0, y1, ph);
    const s = (2 + R(k, seed + 3) * 5) * size;
    const a = I * (1 - ph) * ss(0, 0.1, ph) * (0.55 + 0.45 * Math.sin(t * 17 + k));
    spr(c, SP.ember, x, y, s * 4, s * 4, a);
  }
  c.restore();
}

function cloudLayer(c, t, y0, y1, n, img, alpha, speed, seed, sz = 1, sq = 0.45) {
  c.save();
  for (let k = 0; k < n; k++) {
    const span = W + 1200;
    const x = ((R(k, seed) * span + t * speed * (0.6 + R(k, seed + 1) * 0.8)) % span + span) % span - 600;
    const y = lerp(y0, y1, R(k, seed + 2));
    const s = (300 + R(k, seed + 3) * 500) * sz;
    spr(c, img, x, y, s * 2, s * sq, alpha * (0.5 + 0.5 * R(k, seed + 4)));
  }
  c.restore();
}

function skyGrad(c, stops, y1) {
  const g = c.createLinearGradient(0, 0, 0, y1);
  for (const [p, col] of stops) g.addColorStop(p, col);
  c.fillStyle = g; c.fillRect(0, 0, W, y1 + 2);
}
function stars(c, t, n, y1, a = 1, seed = 1) {
  c.save(); c.fillStyle = '#dfe8ff';
  for (let k = 0; k < n; k++) {
    const x = R(k, seed) * W, y = R(k, seed + 1) * y1, s = R(k, seed + 2);
    const tw = 0.55 + 0.45 * Math.sin(t * (1 + R(k, seed + 3) * 3) + k);
    c.globalAlpha = a * tw * (0.25 + 0.75 * s * s);
    const d = s * 2.4 + 0.8; c.fillRect(x, y, d, d);
  }
  c.restore();
}
function waterBase(c, hy, c0, c1) {
  const g = c.createLinearGradient(0, hy, 0, H);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  c.fillStyle = g; c.fillRect(0, hy, W, H - hy);
}
// 水面高光：围绕若干光源 x 的横向闪烁短线
function glints(c, hy, t, sources, n, seed) {
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < n; k++) {
    const src = sources[k % sources.length];
    const d = Math.pow(R(k, seed), 1.6);
    const y = hy + 4 + d * (H - hy);
    const spread = src.w * (0.4 + d * 1.6);
    const x = src.x + (R(k, seed + 1) - 0.5) * spread + Math.sin(t * 1.3 + k) * 6;
    const len = (10 + R(k, seed + 2) * 50) * (0.4 + d * 2);
    const a = src.a * (0.5 + 0.5 * Math.sin(t * (3 + R(k, seed + 3) * 5) + k * 2.3)) * (1 - d * 0.5);
    if (a <= 0.01) continue;
    c.globalAlpha = clamp(a); c.fillStyle = src.col;
    c.fillRect(x - len / 2, y, len, 1 + d * 1.6);
  }
  c.restore();
}

// 以 y=yw 为水线画倒影（带波纹扰动），然后画实体（裁到水线以上）
function reflect(c, yw, t, draw, o = {}) {
  const a = o.a ?? 0.5, maxH = o.h ?? 700, amp = o.amp ?? 1;
  tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, W, H);
  tx.save(); tx.translate(0, 2 * yw); tx.scale(1, -1); draw(tx); tx.restore();
  c.save();
  const bh = 3, yEnd = Math.min(H, yw + maxH);
  for (let y = yw; y < yEnd; y += bh) {
    const d = y - yw;
    const off = (Math.sin(d * 0.11 - t * 2.4 + yw * 0.01) * (1.5 + d * 0.05) + Math.sin(d * 0.031 + t * 1.1) * (1 + d * 0.03)) * amp;
    c.globalAlpha = a * (1 - d / maxH);
    c.drawImage(tmp, 0, y, W, bh, off, y, W, bh);
  }
  c.restore();
  c.save(); c.beginPath(); c.rect(0, 0, W, yw); c.clip(); draw(c); c.restore();
}

// 剪影 + 轮廓光
function rimDraw(c, draw, dx, dy, rimCol, bodyCol, blur = 3, rimA = 1) {
  fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1; fx.clearRect(0, 0, W, H);
  draw(fx);
  fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalAlpha = 1;
  fx.globalCompositeOperation = 'source-in';
  fx.fillStyle = rimCol; fx.fillRect(0, 0, W, H);
  c.save();
  if (rimA > 0.01) {
    c.globalAlpha = rimA;
    c.filter = `blur(${blur}px)`; c.drawImage(fig, dx, dy); c.filter = 'none';
    c.drawImage(fig, dx * 0.45, dy * 0.45);
  }
  c.restore();
  fx.fillStyle = bodyCol; fx.fillRect(0, 0, W, H);
  fx.globalCompositeOperation = 'source-over';
  c.drawImage(fig, 0, 0);
}

// ---------------------------------------------------------------- ships
// 楼船：局部坐标，原点在水线中心，船长约 680
function mastSail(c, o, mx, mh, sw, ang, seed) {
  c.save(); c.translate(mx, -58); c.rotate(ang);
  c.fillStyle = o.col; c.fillRect(-5, -mh, 10, mh);
  const top = -mh * 0.94, bot = -mh * 0.3, lx = -sw * 0.32, rx = sw * 0.68;
  c.beginPath();
  c.moveTo(lx, top + 26); c.lineTo(rx * 0.92, top);
  c.quadraticCurveTo(rx * 1.14, (top + bot) / 2, rx, bot);
  c.lineTo(lx - 8, bot); c.closePath();
  c.fillStyle = o.sail; c.fill();
  c.strokeStyle = o.col; c.lineWidth = 4;
  for (let i = 1; i < 7; i++) {
    const f = i / 7, yy = lerp(top + 20, bot, f);
    c.beginPath(); c.moveTo(lx - 6, yy); c.lineTo(rx * (1.02 + 0.08 * Math.sin(f * Math.PI)), yy - 10 + f * 6); c.stroke();
  }
  // 绳索
  c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -mh); c.lineTo(rx * 1.4, 0); c.moveTo(0, -mh); c.lineTo(lx * 1.8, 0); c.stroke();
  // 旗
  const L = 70, dir = WIND >= 0 ? 1 : -1;
  c.beginPath(); c.moveTo(0, -mh);
  for (let i = 1; i <= 8; i++) c.lineTo(dir * i / 8 * L, -mh + Math.sin(o.t * 7 - i * 0.9 + seed) * 6 * i / 8);
  for (let i = 8; i >= 0; i--) c.lineTo(dir * i / 8 * L, -mh + 18 * (1 - i / 10) + Math.sin(o.t * 7 - i * 0.9 + seed) * 6 * i / 8);
  c.closePath(); c.fillStyle = o.flag || o.col; c.fill();
  c.restore();
}

function tier(c, x, y, w, h, over, o, nWin, seed) {
  c.fillStyle = o.col;
  c.fillRect(x - w / 2, y - h, w, h + 2);
  const rw = w / 2 + over, ry = y - h;
  c.beginPath();
  c.moveTo(x - rw, ry - 16);
  c.quadraticCurveTo(x - rw + 14, ry + 2, x - w / 2, ry + 2);
  c.lineTo(x + w / 2, ry + 2);
  c.quadraticCurveTo(x + rw - 14, ry + 2, x + rw, ry - 16);
  c.lineTo(x + w * 0.36, ry - h * 0.42);
  c.lineTo(x - w * 0.36, ry - h * 0.42);
  c.closePath(); c.fill();
  c.fillRect(x - w * 0.4, ry - h * 0.48, w * 0.8, 6);
  if (o.lit > 0 && nWin > 0) {
    const ww = w / (nWin * 2 + 1);
    for (let i = 0; i < nWin; i++) {
      const fl = 0.55 + 0.45 * n1(o.t * 5 + seed * 13 + i * 3.7);
      const on = R(i, seed + 40) < 0.8 ? 1 : 0.15;
      c.fillStyle = `rgba(255,${130 + 50 * fl | 0},50,${o.lit * fl * on})`;
      c.fillRect(x - w / 2 + ww * (2 * i + 1), y - h * 0.72, ww, h * 0.36);
    }
  }
}

function ship(c, o) {
  const t = o.t, F = o.fire || 0, seed = o.seed || 0, det = o.det ?? 1;
  o.sail = o.sail || o.col;
  if (F > 0) {
    smoke(c, 0, -330, 300, 1500, t, seed + 50, F, Math.round(10 + 8 * det), 0.7);
    c.save(); c.globalCompositeOperation = 'lighter';
    spr(c, SP.orange, 0, -230, 1200, 760, 0.35 * F);
    spr(c, SP.red, 0, -120, 1600, 520, 0.35 * F);
    c.restore();
  }
  // 桅帆
  mastSail(c, o, -220, 470, 250, o.fall1 || 0, seed + 1);
  mastSail(c, o, 170, 400, 220, o.fall2 || 0, seed + 2);
  // 船体
  c.fillStyle = o.col;
  c.beginPath();
  c.moveTo(-345, -96);
  c.quadraticCurveTo(-290, -58, -200, -58);
  c.lineTo(220, -58);
  c.quadraticCurveTo(292, -64, 318, -128);
  c.lineTo(338, -126);
  c.quadraticCurveTo(326, -20, 250, 12);
  c.lineTo(-232, 12);
  c.quadraticCurveTo(-305, 2, -345, -96);
  c.fill();
  // 女墙盾牌
  for (let x = -262; x < 262; x += 24) c.fillRect(x, -80, 15, 24);
  c.fillRect(-270, -62, 540, 6);
  // 楼阁
  tier(c, -10, -60, 380, 92, 30, o, 7, seed + 3);
  tier(c, -20, -168, 260, 72, 24, o, 5, seed + 4);
  tier(c, -30, -258, 140, 58, 20, o, 3, seed + 5);
  // 舵
  c.fillRect(300, -60, 10, 80);
  // 铁索
  if (o.chain) {
    c.strokeStyle = o.chainCol || o.col; c.lineWidth = 6;
    for (const sgn of [-1, 1]) {
      c.beginPath();
      const x0 = sgn * 330, x1 = sgn * (330 + o.chain);
      c.moveTo(x0, -40); c.quadraticCurveTo((x0 + x1) / 2, 10, x1, -40); c.stroke();
    }
  }
  // 火把
  if (o.lit > 0) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = -250 + i * 100, fl = 0.6 + 0.4 * n1(t * 7 + i * 5 + seed);
      c.fillStyle = o.col;
      spr(c, SP.yellow, x, -112, 30, 40, o.lit * fl);
      spr(c, SP.orange, x, -110, 110, 110, 0.35 * o.lit * fl);
    }
    c.restore();
  }
  // 火
  if (F > 0) {
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(255,120,40,${0.5 * F})`; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-300, -60); c.lineTo(300, -60); c.stroke();
    c.restore();
    const FS = [[-120, -110, 170, 230], [70, -170, 150, 260], [200, -70, 130, 180], [-250, -80, 120, 160],
      [-30, -280, 120, 300], [-230, -300, 120, 340], [220, -250, 110, 300]];
    const nP = Math.round(46 * det);
    FS.forEach(([fx_, fy, fw, fh], k) => {
      const I = clamp((F - k * 0.09) * 1.8);
      fire(c, fx_, fy, fw, fh, t, seed * 7 + k * 31, I, nP);
    });
  }
}

function shipAt(c, x, yw, s, o) {
  c.save(); c.translate(x, yw); c.scale(o.flip ? -s : s, s); ship(c, o); c.restore();
}

// 小火船
function boat(c, o) {
  const t = o.t, F = o.fire || 0, seed = o.seed || 0;
  if (F > 0) {
    smoke(c, 0, -260, 160, 900, t, seed + 9, F, 10, 0.8);
    c.save(); c.globalCompositeOperation = 'lighter';
    spr(c, SP.orange, 0, -160, 700, 520, 0.4 * F);
    c.restore();
  }
  c.fillStyle = o.col;
  // 帆
  c.fillRect(-4, -330, 8, 300);
  c.beginPath(); c.moveTo(-70, -300); c.lineTo(110, -320); c.quadraticCurveTo(140, -200, 120, -90); c.lineTo(-80, -90); c.closePath();
  c.fillStyle = o.sail || o.col; c.fill();
  c.fillStyle = o.col;
  // 船体 + 柴草
  c.beginPath(); c.moveTo(-170, -60); c.quadraticCurveTo(-120, -32, -80, -32); c.lineTo(120, -32);
  c.quadraticCurveTo(160, -40, 175, -70); c.quadraticCurveTo(170, 0, 120, 8); c.lineTo(-110, 8); c.quadraticCurveTo(-160, 0, -170, -60); c.fill();
  for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(-110 + i * 42, -48, 26, 18, 0, 0, Math.PI * 2); c.fill(); }
  if (F > 0) {
    const FS = [[-90, -50, 110, 190], [20, -55, 120, 220], [110, -45, 100, 170], [20, -200, 130, 260]];
    FS.forEach(([a, b, w, h], k) => fire(c, a, b, w, h, t, seed * 11 + k * 17, clamp((F - k * 0.12) * 1.6), 40));
  }
}

// ---------------------------------------------------------------- text
function textGlow(c, str, x, y, font, fill, glow, blur, a) {
  if (a <= 0.003) return;
  c.save(); c.globalAlpha = clamp(a); c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = glow; c.shadowBlur = blur; c.fillStyle = fill; c.fillText(str, x, y);
  c.shadowBlur = blur * 0.4; c.fillText(str, x, y);
  c.restore();
}

const SUBS = [
  [4.1, 6.7, '曹操八十万大军 陈兵长江', 'Cao Cao\'s 800,000 men line the Yangtze'],
  [6.9, 9.4, '战船首尾相连 铁索横江', 'Their warships chained bow to stern'],
  [10.0, 11.9, '这一夜 风向变了', 'That night, the wind turned'],
  [12.1, 14.1, '东南风起', 'The southeast wind rises'],
  [14.6, 16.9, '黄盖诈降 火船借风而来', 'Huang Gai feigns surrender — fire ships ride the wind'],
  [17.1, 19.4, '船载柴草 灌以膏油', 'Laden with kindling, soaked in oil'],
  [20.0, 21.9, '周郎一声令下', 'At Zhou Yu\'s command'],
  [22.1, 23.1, '放箭！', 'Loose!'],
  [28.0, 30.9, '风盛火猛 烟炎张天', 'Fierce wind, raging fire — smoke and flame fill the sky'],
  [31.1, 35.1, '铁索连舟 一船起火 百船难逃', 'Chained together — when one ship burns, none escape'],
  [35.9, 37.8, '后来的人都说', 'Later, people would say'],
  [38.0, 40.0, '这一把火 烧出了三分天下', 'This one fire forged the Three Kingdoms'],
];
function subtitles(c, t) {
  for (const [a, b, zh, en] of SUBS) {
    if (t < a || t > b) continue;
    const al = ss(a, a + 0.18, t) * (1 - ss(b - 0.2, b, t));
    const big = zh.length <= 4;
    c.save(); c.globalAlpha = al; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 12; c.fillStyle = '#f4f1ea';
    c.font = big ? '500 64px NSans' : '500 50px NSans';
    c.fillText(zh, W / 2, 1340);
    c.font = '400 32px NSans'; c.fillStyle = 'rgba(240,236,228,0.92)';
    c.fillText(en, W / 2, big ? 1406 : 1400);
    c.restore();
  }
}

// ---------------------------------------------------------------- scenes
const SC = [
  { id: 'title', t0: 0, t1: 3.6 },
  { id: 'fleet', t0: 3.6, t1: 9.6 },
  { id: 'wind', t0: 9.6, t1: 14.2 },
  { id: 'fireships', t0: 14.2, t1: 19.6 },
  { id: 'archer', t0: 19.6, t1: 23.2 },
  { id: 'volley', t0: 23.2, t1: 27.4 },
  { id: 'inferno', t0: 27.4, t1: 35.4 },
  { id: 'under', t0: 35.4, t1: 40.2 },
  { id: 'end', t0: 40.2, t1: 48.0 },
];
const DURATION = 48.0;

let CAM = { z: 1, x: 0, y: 0, r: 0 };
let POST = { bloom: 0.55, vig: 0.7, grain: 0.10, flash: 0 };

function sceneTitle(c, u, t) {
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  WIND = 0.1;
  embers(c, t, 3, 20, 100, 980, 1900, 1100, 0.35 * ss(0.3, 1.5, u));
  const a = ss(0.35, 1.1, u) * (1 - ss(2.9, 3.5, u));
  textGlow(c, '「建安十三年 · 冬」', W / 2, 920, '600 64px NSerif', '#f2eee6', 'rgba(255,255,255,0.25)', 16, a);
  textGlow(c, 'Winter, the 13th year of Jian\'an · AD 208', W / 2, 1000, '400 30px NSans', '#d8d4cc', 'rgba(0,0,0,0)', 0, a * 0.9);
  CAM = { z: 1 + u * 0.01, x: 0, y: 0, r: 0 };
  POST = { bloom: 0.3, vig: 0.6, grain: 0.08, flash: 0 };
}

function sceneFleet(c, u, t) {
  const hy = 1090; WIND = -0.15;
  skyGrad(c, [[0, '#020407'], [0.55, '#0a1a20'], [1, '#2a4446']], hy);
  stars(c, t, 170, hy * 0.6, 0.55, 1);
  c.save(); c.globalCompositeOperation = 'lighter';
  spr(c, SP.moon, 790, 360, 520, 520, 0.35); spr(c, SP.white, 790, 360, 90, 90, 0.9);
  c.restore();
  c.fillStyle = 'rgba(225,235,245,0.9)'; c.beginPath(); c.arc(790, 360, 30, 0, 7); c.fill();
  cloudLayer(c, t, 250, 700, 14, SP.cloud, 0.8, 12, 5, 1.1);
  cloudLayer(c, t, 900, 1100, 10, SP.fog, 0.18, 8, 9, 1.0, 0.3);
  waterBase(c, hy, '#1d3234', '#020506');
  // 月光倒影
  glints(c, hy, t, [{ x: 790, w: 120, a: 0.55, col: '#cfe3ec' }], 140, 11);
  // 远排
  const far = (cc) => { for (let i = 0; i < 9; i++) shipAt(cc, -90 + i * 160 + (R(i, 9) - 0.5) * 40, hy + 6, 0.19, { t, col: '#25393c', sail: '#2b4245', lit: 0.8, seed: i + 10, chain: 120, det: 0.3 }); };
  reflect(c, hy + 6, t, far, { a: 0.35, h: 120, amp: 0.4 });
  cloudLayer(c, t, hy - 30, hy + 20, 10, SP.fog, 0.22, 10, 13, 0.8, 0.25);
  // 中排
  const midY = hy + 48;
  const mid = (cc) => { for (let i = 0; i < 5; i++) shipAt(cc, -40 + i * 290, midY, 0.42, { t, col: '#0f1c20', sail: '#152429', lit: 0.9, seed: i + 30, chain: 120, chainCol: '#0f1c20', det: 0.5 }); };
  reflect(c, midY, t, mid, { a: 0.45, h: 260, amp: 0.7 });
  glints(c, midY, t, [{ x: 160, w: 260, a: 0.35, col: '#ffad5a' }, { x: 700, w: 260, a: 0.35, col: '#ffad5a' }], 90, 21);
  cloudLayer(c, t, midY - 20, midY + 60, 8, SP.fog, 0.16, 14, 17, 1, 0.25);
  // 近排
  const nearY = hy + 260;
  const near = (cc) => {
    shipAt(cc, 170, nearY, 0.92, { t, col: '#05090b', sail: '#0a1317', lit: 1, seed: 51, chain: 400, chainCol: '#05090b' });
    shipAt(cc, 960, nearY + 30, 0.95, { t, col: '#05090b', sail: '#0a1317', lit: 1, seed: 52, chain: 400, chainCol: '#05090b', flip: true });
  };
  reflect(c, nearY, t, near, { a: 0.5, h: 560, amp: 1 });
  glints(c, nearY, t, [{ x: 170, w: 500, a: 0.45, col: '#ff9c48' }, { x: 960, w: 500, a: 0.45, col: '#ff9c48' }], 110, 31);
  cloudLayer(c, t, nearY + 60, H, 8, SP.fog, 0.10, 20, 19, 1.4, 0.3);
  const p = u / 6;
  CAM = { z: 1.0 + 0.09 * p, x: 0, y: -40 * p, r: 0 };
  POST = { bloom: 0.55, vig: 0.75, grain: 0.10, flash: 0 };
}

let flagTex = null;
function buildFlag() {
  const w = 520, h = 340, c = mk(w, h), x = c.getContext('2d');
  x.fillStyle = '#8c1a12'; x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // 火焰齿边
  x.fillStyle = '#2b0805';
  const tooth = (x0, y0, x1, y1, nx, ny) => {
    const n = 14; x.beginPath(); x.moveTo(x0, y0);
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 0.5) / n, cpx = lerp(x0, x1, b), cpy = lerp(y0, y1, b);
      x.lineTo(lerp(x0, x1, a), lerp(y0, y1, a)); x.lineTo(cpx + nx * 28, cpy + ny * 28);
    }
    x.lineTo(x1, y1); x.lineTo(x1 - nx * 6, y1 - ny * 6); x.lineTo(x0 - nx * 6, y0 - ny * 6); x.closePath(); x.fill();
  };
  tooth(0, 0, w, 0, 0, 1); tooth(w, h, 0, h, 0, -1); tooth(w, 0, w, h, -1, 0);
  x.fillStyle = '#e8c27a'; x.globalAlpha = 0.9;
  x.beginPath(); x.arc(w * 0.5, h * 0.5, 120, 0, 7); x.lineWidth = 6; x.strokeStyle = '#e8c27a'; x.stroke();
  x.fillStyle = '#140403'; x.globalAlpha = 1; x.font = '220px MSZ'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('曹', w * 0.5, h * 0.53);
  flagTex = c;
}

function drawFlag(c, px, py, hgt, L, t, wind, seed) {
  // wind: 0 = 垂落, 1 = 猎猎招展
  const ext = lerp(0.32, 1, wind), sag = lerp(1.0, 0.06, wind);
  const amp = lerp(10, 26, wind), freq = lerp(7, 9, wind), spd = lerp(2, 11, wind);
  const sc = hgt / flagTex.height, N = 90;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const wave = Math.sin(s * freq - t * spd + seed) * amp * s + Math.sin(s * freq * 2.3 - t * spd * 1.7) * amp * 0.35 * s;
    const fold = (1 - wind) * Math.sin(s * 22 - t * 1.5) * 10 * s;
    pts.push([px + s * L * ext + fold, py + sag * s * s * hgt * 0.9 + wave]);
  }
  for (let i = 0; i < N; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const tw = flagTex.width / N, sw = Math.max(1, x1 - x0 + 1.2);
    c.drawImage(flagTex, i * tw, 0, tw + 0.5, flagTex.height, x0, y0, sw, hgt);
    const slope = (y1 - y0) / Math.max(1, x1 - x0);
    const sh = clamp(0.35 + slope * 0.9, 0, 0.85);
    c.fillStyle = `rgba(0,0,0,${sh})`; c.fillRect(x0, y0, sw, hgt);
    const hl = clamp(-slope * 0.6 - 0.1, 0, 0.3);
    if (hl > 0) { c.fillStyle = `rgba(255,170,90,${hl})`; c.fillRect(x0, y0, sw, hgt); }
  }
}

function sceneWind(c, u, t) {
  const gust = ss(1.5, 2.3, u);
  WIND = lerp(-0.05, 0.9, gust);
  skyGrad(c, [[0, '#05080c'], [0.6, '#122127'], [1, '#253034']], H);
  stars(c, t, 80, 700, 0.3 * (1 - gust * 0.6), 4);
  // 疾云
  const cloudT = 9 * u + 140 * Math.max(0, u - 1.6) * Math.max(0, u - 1.6) * 0.5 + 30 * Math.max(0, u - 1.6);
  cloudLayer(c, cloudT, 0, 1400, 22, SP.cloud, 0.9, 6, 41, 1.3, 0.4);
  cloudLayer(c, cloudT * 1.6, 100, 1600, 12, SP.fog, 0.10, 6, 43, 1.1, 0.3);
  // 远处旗杆
  for (let k = 0; k < 3; k++) {
    const x = 120 + k * 380 + 60, top = 980 + k * 40;
    c.fillStyle = '#0b1215'; c.fillRect(x, top, 6, H - top);
    c.save(); c.globalAlpha = 0.55; drawFlag(c, x + 6, top + 10, 70, 120, t + k, gust, k * 2); c.restore();
  }
  // 主桅
  c.fillStyle = '#05080a';
  c.fillRect(312, 380, 22, H - 380);
  c.beginPath(); c.moveTo(323, 330); c.lineTo(336, 384); c.lineTo(310, 384); c.closePath(); c.fill();
  c.strokeStyle = '#05080a'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(323, 420); c.lineTo(-40, 1920); c.moveTo(323, 420); c.lineTo(1120, 1700); c.moveTo(323, 520); c.lineTo(900, 1920); c.stroke();
  // 火把光照旗面
  c.save(); c.globalCompositeOperation = 'lighter';
  spr(c, SP.orange, 600, 1100, 1100, 700, 0.18);
  c.restore();
  drawFlag(c, 334, 520, 380, 640, t, gust, 0);
  // 下方船舷与火把
  c.fillStyle = '#030506';
  c.beginPath(); c.moveTo(0, 1600); c.quadraticCurveTo(540, 1560, 1080, 1640); c.lineTo(1080, 1920); c.lineTo(0, 1920); c.fill();
  for (let x = 20; x < 1080; x += 46) c.fillRect(x, 1560 + (x - 540) * (x - 540) / 9000, 26, 60);
  for (const [x, k] of [[150, 1], [560, 2], [930, 3]]) {
    const y = 1530 + (x - 540) * (x - 540) / 9000;
    c.fillStyle = '#030506'; c.fillRect(x - 4, y, 8, 120);
    fire(c, x, y + 4, 34, 90, t, 300 + k, 1, 26);
  }
  // 飞叶与灰烬
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 90; k++) {
    const sp = (900 + R(k, 61) * 900) * gust;
    const x = ((R(k, 62) * 1600 + u * sp) % 1600) - 260;
    const y = R(k, 63) * H + Math.sin(t * 3 + k) * 40 - x * 0.12;
    const len = 6 + sp * 0.03;
    c.globalAlpha = (0.15 + 0.35 * R(k, 64)) * gust;
    c.strokeStyle = k % 3 === 0 ? '#ffab5c' : '#9aa59a'; c.lineWidth = 1.5 + R(k, 65) * 2.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - len, y + len * 0.12); c.stroke();
  }
  c.restore();
  embers(c, t, 70, 40, -200, 900, 1700, 600, gust);
  const sh = gust * (1 - ss(2.3, 3.6, u)) * 9 + gust * 2;
  CAM = { z: 1.06 + 0.04 * u / 4.6, x: n1(t * 13) * sh, y: n1(t * 11 + 5) * sh, r: 0 };
  POST = { bloom: 0.5, vig: 0.75, grain: 0.11, flash: 0 };
}

function sceneFireships(c, u, t) {
  const hy = 980; WIND = -0.6;
  skyGrad(c, [[0, '#020305'], [0.6, '#0b141c'], [1, '#2a2622']], hy);
  stars(c, t, 120, hy * 0.6, 0.45, 7);
  cloudLayer(c, t * 4, 200, 800, 14, SP.cloud, 0.8, 10, 71, 1.2);
  waterBase(c, hy, '#161a1c', '#020304');
  // 曹营远景
  const farY = hy + 8;
  const far = (cc) => { for (let i = 0; i < 8; i++) shipAt(cc, -60 + i * 165, farY, 0.24, { t, col: '#1a2226', sail: '#1f292d', lit: 0.9, seed: i + 80, chain: 100, det: 0.3 }); };
  reflect(c, farY, t, far, { a: 0.35, h: 140, amp: 0.4 });
  cloudLayer(c, t, hy - 20, hy + 30, 8, SP.fog, 0.12, 12, 73, 0.8, 0.25);
  // 火船（由近及远驶向曹营）
  const ign = (k) => ss(1.0 + k * 0.22, 1.9 + k * 0.22, u);
  const boats = [];
  for (let k = 0; k < 7; k++) {
    const z = clamp(-0.05 + R(k, 91) * 0.5 + u * 0.085);
    const y = hy + (1830 - hy) * Math.pow(1 - z, 1.6);
    const s = 0.12 + 1.0 * Math.pow(1 - z, 1.6);
    const lane = [-420, -200, 20, 230, 430, 620, -640][k];
    const x = W / 2 + lane * (0.35 + s * 0.9) + 40;
    boats.push({ k, z, y, s, x });
  }
  boats.sort((a, b) => b.z - a.z);
  const sources = [];
  for (const b of boats) {
    const F = ign(b.k);
    const dr = (cc) => {
      cc.save(); cc.translate(b.x, b.y); cc.scale(b.s, b.s); cc.rotate(Math.sin(t * 1.4 + b.k) * 0.02);
      boat(cc, { t, col: '#040506', sail: '#0b0d0f', fire: F, seed: b.k + 100 });
      cc.restore();
    };
    reflect(c, b.y, t, dr, { a: 0.55, h: 500 * b.s + 60, amp: b.s });
    // 船尾浪花
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#ffcf9a'; c.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      c.globalAlpha = (0.12 + 0.25 * F) * (1 - i / 5);
      const yy = b.y + (6 + i * 9) * b.s, ww = (190 + i * 40) * b.s;
      c.beginPath(); c.moveTo(b.x - ww, yy + Math.sin(t * 6 + i) * 2); c.quadraticCurveTo(b.x, yy + 6 * b.s, b.x + ww * 0.6, yy - 2); c.stroke();
    }
    c.restore();
    sources.push({ x: b.x, w: 300 * b.s + 40, a: 0.7 * F, col: '#ff9a3c' });
  }
  glints(c, hy, t, sources, 220, 97);
  embers(c, t, 99, 60, 0, W, 1800, 500, ss(1, 2.5, u));
  const p = u / 5.4;
  CAM = { z: 1.0 + 0.1 * p, x: 0, y: Math.sin(t * 1.3) * 6, r: Math.sin(t * 0.9) * 0.004 };
  POST = { bloom: 0.6, vig: 0.75, grain: 0.11, flash: 0 };
}

function sceneArcher(c, u, t) {
  WIND = -0.2;
  skyGrad(c, [[0, '#06111f'], [0.5, '#0f2440'], [1, '#1a2f45']], H);
  stars(c, t, 90, 900, 0.5, 13);
  // 帆与索具
  c.fillStyle = '#060b12';
  c.fillRect(110, 0, 26, H);
  c.beginPath(); c.moveTo(136, 60); c.lineTo(470, 30); c.quadraticCurveTo(540, 500, 470, 900); c.lineTo(136, 920); c.closePath();
  c.fillStyle = '#0a1422'; c.fill();
  c.strokeStyle = '#04080e'; c.lineWidth = 6;
  for (let i = 1; i < 8; i++) { const y = 60 + i * 110; c.beginPath(); c.moveTo(136, y); c.lineTo(500 - Math.abs(i - 4) * 10, y - 12); c.stroke(); }
  c.lineWidth = 2.5; c.strokeStyle = '#070d16';
  for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(123, 40 + i * 30); c.lineTo(-20 + i * 150, 1920); c.stroke(); }
  // 远处同袍的火箭（虚焦）
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 14; k++) {
    const x = 40 + R(k, 201) * 520, y = 1350 + R(k, 202) * 450, fl = 0.7 + 0.3 * n1(t * 8 + k);
    spr(c, SP.orange, x, y, 120, 120, 0.5 * fl); spr(c, SP.yellow, x, y, 40, 50, 0.6 * fl);
  }
  c.restore();
  cloudLayer(c, t, 1200, 1900, 8, SP.fog, 0.08, 15, 205, 1.2, 0.3);

  // 弓手
  const pull = ss(0.2, 1.8, u);
  const rel = 2.85;
  const released = u > rel;
  const dir = [-0.85, -0.53];
  const B = [330, 820];
  const dl = released ? 110 : lerp(110, 462, pull);
  const D = [B[0] - dir[0] * dl, B[1] - dir[1] * dl];
  const curl = released ? 60 : lerp(60, 135, pull);
  const p = [0.53, -0.85];
  const T1 = [B[0] + p[0] * 380 - dir[0] * curl, B[1] + p[1] * 380 - dir[1] * curl];
  const T2 = [B[0] - p[0] * 380 - dir[0] * curl, B[1] - p[1] * 380 - dir[1] * curl];
  const E = [lerp(660, 905, pull), lerp(1150, 1005, pull)];
  const fly = released ? (u - rel) : 0;
  const arrowNock = released ? [D[0] + dir[0] * (fly * 4200 + 350), D[1] + dir[1] * (fly * 4200 + 350) + fly * fly * 300] : [D[0] - dir[0] * 10, D[1] - dir[1] * 10];
  const tip = [arrowNock[0] + dir[0] * 560, arrowNock[1] + dir[1] * 560];
  const L = released ? [B[0] + dir[0] * 120, B[1] + dir[1] * 120] : tip;
  const lightI = released ? Math.max(0.35, 1 - fly * 2) : 1;

  // 背后光晕
  c.save(); c.globalCompositeOperation = 'lighter';
  spr(c, SP.orange, L[0], L[1], 900, 900, 0.35 * lightI);
  c.restore();

  const draw = (g) => {
    g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
    // 躯干
    g.beginPath(); g.moveTo(585, 1120); g.quadraticCurveTo(720, 1080, 840, 1130); g.quadraticCurveTo(900, 1300, 905, 1920);
    g.lineTo(480, 1920); g.quadraticCurveTo(520, 1400, 585, 1120); g.fill();
    // 披膊
    g.beginPath(); g.ellipse(625, 1135, 70, 52, -0.5, 0, 7); g.fill();
    g.beginPath(); g.ellipse(818, 1145, 75, 55, 0.4, 0, 7); g.fill();
    // 颈、头、盔
    g.fillRect(690, 1040, 70, 80);
    g.beginPath(); g.arc(725, 1015, 58, 0, 7); g.fill();
    g.beginPath(); g.moveTo(668, 1012); g.lineTo(652, 1032); g.lineTo(670, 1040); g.fill(); // 鼻
    g.beginPath(); g.arc(727, 1000, 66, Math.PI, 0); g.lineTo(800, 1010); g.lineTo(650, 1010); g.fill(); // 盔
    g.beginPath(); g.moveTo(780, 1000); g.quadraticCurveTo(830, 1040, 820, 1110); g.lineTo(770, 1080); g.fill(); // 顿项
    g.lineWidth = 7; g.beginPath(); g.moveTo(727, 935); g.lineTo(735, 870); g.stroke();
    g.beginPath(); g.ellipse(737, 872, 14, 22, 0.2, 0, 7); g.fill();
    // 前臂（持弓）
    g.lineWidth = 58; g.beginPath(); g.moveTo(625, 1125); g.lineTo(480, 975); g.stroke();
    g.lineWidth = 42; g.beginPath(); g.moveTo(480, 975); g.lineTo(B[0] + 15, B[1] + 10); g.stroke();
    g.beginPath(); g.arc(B[0], B[1], 30, 0, 7); g.fill();
    // 后臂（拉弦）
    g.lineWidth = 60; g.beginPath(); g.moveTo(815, 1140); g.lineTo(E[0], E[1]); g.stroke();
    g.lineWidth = 44; g.beginPath(); g.moveTo(E[0], E[1]); g.lineTo(D[0], D[1]); g.stroke();
    g.beginPath(); g.arc(D[0], D[1], 28, 0, 7); g.fill();
    // 弓
    g.lineWidth = 16;
    g.beginPath(); g.moveTo(T1[0], T1[1]);
    g.quadraticCurveTo(B[0] + p[0] * 200 + dir[0] * 40, B[1] + p[1] * 200 + dir[1] * 40, B[0], B[1]);
    g.quadraticCurveTo(B[0] - p[0] * 200 + dir[0] * 40, B[1] - p[1] * 200 + dir[1] * 40, T2[0], T2[1]);
    g.stroke();
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(T1[0], T1[1]); g.lineTo(T1[0] + dir[0] * 30 + p[0] * 20, T1[1] + dir[1] * 30 + p[1] * 20); g.stroke();
    g.beginPath(); g.moveTo(T2[0], T2[1]); g.lineTo(T2[0] + dir[0] * 30 - p[0] * 20, T2[1] + dir[1] * 30 - p[1] * 20); g.stroke();
    // 弦
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(T1[0], T1[1]);
    if (released) {
      const vib = Math.sin(fly * 90) * Math.exp(-fly * 6) * 40;
      const m = [(T1[0] + T2[0]) / 2 - dir[0] * vib, (T1[1] + T2[1]) / 2 - dir[1] * vib];
      g.quadraticCurveTo(m[0], m[1], T2[0], T2[1]);
    } else { g.lineTo(D[0], D[1]); g.lineTo(T2[0], T2[1]); }
    g.stroke();
    // 箭
    if (!released || fly < 0.6) { g.lineWidth = 6; g.beginPath(); g.moveTo(arrowNock[0], arrowNock[1]); g.lineTo(tip[0], tip[1]); g.stroke(); }
  };
  const ld = Math.hypot(L[0] - 720, L[1] - 1150);
  const dx = (L[0] - 720) / ld * 7, dy = (L[1] - 1150) / ld * 7;
  rimDraw(c, draw, dx, dy, `rgba(255,${150 + 40 * n1(t * 9) | 0},70,1)`, '#04060a', 3, lightI);
  // 箭头火焰
  if (!released || fly < 0.6) {
    WIND = 0.15;
    fire(c, tip[0] - dir[0] * 30, tip[1] - dir[1] * 30, 46, 120, t, 777, 1, 40);
  }
  CAM = { z: 1.0 + 0.07 * ss(0, 2.8, u) + (released ? 0.02 * Math.exp(-fly * 5) : 0), x: released ? n1(t * 30) * 6 * Math.exp(-fly * 4) : 0, y: 0, r: 0 };
  POST = { bloom: 0.6, vig: 0.8, grain: 0.11, flash: 0 };
}

function arrowPath(k, s) {
  const x0 = -260 + R(k, 301) * 520, y0 = 1950 + R(k, 302) * 300;
  const x1 = 260 + R(k, 303) * 840, y1 = 1330 + R(k, 304) * 70;
  const hgt = 1300 + R(k, 305) * 500;
  return [lerp(x0, x1, s), lerp(y0, y1, s) - hgt * 4 * s * (1 - s)];
}
function sceneVolley(c, u, t) {
  const hy = 1340; WIND = -0.4;
  skyGrad(c, [[0, '#03060d'], [0.6, '#0b1624'], [1, '#2c2a2a']], hy);
  stars(c, t, 260, hy * 0.85, 0.8, 17);
  cloudLayer(c, t * 3, 900, 1300, 10, SP.cloud, 0.6, 10, 311, 1.0, 0.35);
  waterBase(c, hy, '#1a1c1e', '#020304');
  const burn = ss(1.9, 4.2, u);
  const fleet = (cc) => { for (let i = 0; i < 5; i++) shipAt(cc, -20 + i * 270, hy + 10, 0.45, { t, col: '#06090b', sail: '#0c1013', lit: 0.8, fire: burn * (0.6 + 0.4 * R(i, 333)), seed: i + 330, chain: 100, det: 0.55 }); };
  reflect(c, hy + 10, t, fleet, { a: 0.5, h: 520, amp: 0.8 });
  glints(c, hy + 10, t, [{ x: 300, w: 500, a: 0.2 + 0.6 * burn, col: '#ff9a3c' }, { x: 800, w: 500, a: 0.2 + 0.6 * burn, col: '#ff9a3c' }], 160, 313);
  // 火箭
  c.save(); c.globalCompositeOperation = 'lighter';
  const N = 420;
  for (let k = 0; k < N; k++) {
    const t0 = R(k, 320) * 1.6, fl = 1.5 + R(k, 321) * 0.6;
    const s = (u - t0) / fl;
    if (s <= 0) continue;
    if (s >= 1) {
      const ag = (s - 1) * fl;
      if (ag < 0.35) { const [x, y] = arrowPath(k, 1); spr(c, SP.yellow, x, y, 60, 60, 0.8 * (1 - ag / 0.35)); }
      continue;
    }
    const [x, y] = arrowPath(k, s), [px, py] = arrowPath(k, Math.max(0, s - 0.05));
    c.globalAlpha = 0.45; c.strokeStyle = '#ffb066'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
    spr(c, SP.orange, x, y, 40, 40, 0.7); spr(c, SP.white, x, y, 12, 12, 0.9);
  }
  c.restore();
  embers(c, t, 340, 50, 0, W, 1500, 600, burn);
  const shk = burn * 4;
  CAM = { z: 1.02 + 0.05 * u / 4.2, x: n1(t * 20) * shk, y: n1(t * 17 + 3) * shk, r: 0 };
  POST = { bloom: 0.7, vig: 0.75, grain: 0.11, flash: u < 0.25 ? 0.35 * (1 - u / 0.25) : 0 };
}

function sceneInferno(c, u, t) {
  const hy = 960; WIND = -0.4;
  skyGrad(c, [[0, '#070404'], [0.45, '#2a1209'], [0.8, '#7a3412'], [1, '#c2601e']], hy);
  stars(c, t, 50, 400, 0.2, 23);
  // 烟柱
  for (let k = 0; k < 6; k++) smoke(c, 60 + k * 190 + (R(k, 403) - 0.5) * 80, hy, 220, 1500, t, 405 + k * 3, 1, 18, 0.9);
  c.save();
  for (let k = 0; k < 14; k++) {
    const x = ((R(k, 401) * (W + 600) - t * 25) % (W + 600) + W + 600) % (W + 600) - 300, y = 120 + R(k, 402) * 600;
    spr(c, SP.smoke, x, y, 800, 450, 0.55);
  }
  c.restore();
  waterBase(c, hy, '#5a2610', '#050201');
  glints(c, hy, t, [{ x: 560, w: 700, a: 0.55, col: '#ff9a3c' }, { x: 150, w: 400, a: 0.45, col: '#ff7a2c' }, { x: 900, w: 400, a: 0.45, col: '#ff7a2c' }], 200, 431);
  const fl = (k) => 0.75 + 0.25 * n1(t * 1.5 + k);
  const far = (cc) => { for (let i = 0; i < 9; i++) shipAt(cc, -90 + i * 160, hy + 6, 0.2, { t, col: '#1c0c07', sail: '#3a1608', fire: 0.9 * fl(i), seed: i + 410, chain: 120, det: 0.25 }); };
  reflect(c, hy + 6, t, far, { a: 0.45, h: 160, amp: 0.4 });
  const midY = hy + 70;
  const mid = (cc) => { for (let i = 0; i < 4; i++) shipAt(cc, 40 + i * 330 + (i % 2) * 30, midY, 0.46, { t, col: '#0a0504', sail: '#2a0e05', fire: 1 * fl(i + 20), seed: i + 430, chain: 140, chainCol: '#3a1a0a', det: 0.5 }); };
  reflect(c, midY, t, mid, { a: 0.55, h: 360, amp: 0.7 });
  // 主船 + 倒桅
  const nearY = hy + 420;
  const fall = ss(4.2, 6.0, u);
  const near = (cc) => shipAt(cc, 560, nearY, 1.38, { t, col: '#050302', sail: '#240c04', fire: 1.0, seed: 470, chain: 600, chainCol: '#2a1206', det: 1, fall1: -fall * 1.15, fall2: fall * 0.12 });
  reflect(c, nearY, t, near, { a: 0.6, h: 600, amp: 1.2 });
  // 倒桅火星
  if (u > 5.6 && u < 7.2) {
    const v = u - 5.6;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 140; k++) {
      const ang = -Math.PI * R(k, 451), sp = 300 + R(k, 452) * 900;
      const x = 130 + Math.cos(ang) * sp * v, y = nearY - 40 + Math.sin(ang) * sp * v + 900 * v * v;
      spr(c, SP.ember, x, y, 14, 14, (1 - v / 1.6) * 1.2);
    }
    spr(c, SP.yellow, 130, nearY - 40, 900, 500, 0.7 * Math.exp(-v * 4));
    c.restore();
  }
  // 前景漂浮燃烧残骸
  WIND = -0.3;
  for (let k = 0; k < 4; k++) {
    const x = [90, 380, 760, 1010][k] + Math.sin(t * 0.5 + k) * 20, y = 1700 + k % 2 * 120;
    c.fillStyle = '#030201'; c.save(); c.translate(x, y); c.rotate(0.2 * (k - 1.5)); c.fillRect(-90, -10, 180, 18); c.restore();
    fire(c, x, y - 6, 120, 200, t, 480 + k, 0.9, 30);
  }
  embers(c, t, 490, 140, -300, W + 100, 1900, 0, 1, 1.2);
  const shk = 4 + (u > 5.6 && u < 6.4 ? 14 * (1 - (u - 5.6) / 0.8) : 0);
  CAM = { z: 1.0 + 0.12 * u / 8, x: n1(t * 12) * shk, y: n1(t * 10 + 7) * shk, r: n1(t * 3) * 0.004 };
  POST = { bloom: 0.75, vig: 0.8, grain: 0.12, flash: 0 };
}

function sceneUnder(c, u, t) {
  WIND = 0;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0e3550'); g.addColorStop(0.35, '#06192a'); g.addColorStop(1, '#010407');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // 水面火光
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 40; k++) {
    const x = R(k, 501) * W + Math.sin(t * 0.8 + k) * 40, y = 40 + R(k, 502) * 200 + Math.sin(t * 1.7 + k * 2) * 15;
    const fl = 0.5 + 0.5 * n1(t * 3 + k);
    spr(c, k % 3 ? SP.orange : SP.blue, x, y, 300, 80, 0.35 * fl);
  }
  // 光束
  for (let k = 0; k < 9; k++) {
    const x = 80 + k * 120 + Math.sin(t * 0.6 + k) * 50, w = 40 + R(k, 503) * 80, sk = 120 + Math.sin(t * 0.4 + k) * 60;
    const gr = c.createLinearGradient(0, 0, 0, 1500);
    const col = k % 2 ? '255,150,70' : '120,190,255';
    gr.addColorStop(0, `rgba(${col},${0.10 + 0.05 * Math.sin(t + k)})`); gr.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = gr; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w, 0); c.lineTo(x + w + sk + 120, 1500); c.lineTo(x + sk - 60, 1500); c.closePath(); c.fill();
  }
  c.restore();
  // 下沉的楼船
  const cy = lerp(780, 1060, u / 4.8), rot = -0.28 - u * 0.03;
  rimDraw(c, (gg) => {
    gg.save(); gg.translate(560, cy); gg.rotate(rot); gg.scale(1.35, 1.35);
    ship(gg, { t, col: '#000', sail: '#000', seed: 5 });
    gg.restore();
  }, 0, -6, 'rgba(255,140,60,1)', '#020911', 4, 0.75);
  // 船上残火
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 10; k++) {
    const lx = -260 + k * 55, ly = -90 - R(k, 511) * 120;
    const x = 560 + (lx * Math.cos(rot) - ly * Math.sin(rot)) * 1.35, y = cy + (lx * Math.sin(rot) + ly * Math.cos(rot)) * 1.35;
    spr(c, SP.orange, x, y, 90, 90, 0.45 * (1 - u / 6) * (0.6 + 0.4 * n1(t * 5 + k)));
  }
  c.restore();
  // 下落的长矛与木板
  c.strokeStyle = '#03090f'; c.fillStyle = '#03090f';
  for (let k = 0; k < 7; k++) {
    const x = R(k, 521) * W, y = (R(k, 522) * 1600 + u * 90) % 2000 - 60, a = R(k, 523) * 3 + u * 0.2 * (k % 2 ? 1 : -1);
    c.save(); c.translate(x, y); c.rotate(a);
    if (k % 2) { c.lineWidth = 5; c.beginPath(); c.moveTo(-160, 0); c.lineTo(160, 0); c.stroke(); c.beginPath(); c.moveTo(160, -8); c.lineTo(190, 0); c.lineTo(160, 8); c.fill(); }
    else c.fillRect(-90, -9, 180, 18);
    c.restore();
  }
  // 气泡
  c.save();
  for (let k = 0; k < 140; k++) {
    const per = 3 + R(k, 531) * 4, ph = ((u / per) + R(k, 532)) % 1;
    const x0 = k < 80 ? 280 + R(k, 533) * 600 : R(k, 533) * W;
    const y0 = k < 80 ? cy + (R(k, 534) - 0.5) * 300 : H + 50;
    const x = x0 + Math.sin(t * 3 + k) * 12, y = y0 - ph * (y0 + 60);
    const r = 2 + R(k, 535) * 9 * (0.6 + ph);
    c.globalAlpha = 0.55 * (1 - ph) * ss(0, 0.05, ph);
    c.strokeStyle = '#a8d4ff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
    c.fillStyle = '#e6f4ff'; c.fillRect(x - r * 0.4, y - r * 0.5, Math.max(1, r * 0.3), Math.max(1, r * 0.3));
  }
  c.restore();
  // 悬浮颗粒
  c.save(); c.fillStyle = '#9cc4e0';
  for (let k = 0; k < 160; k++) {
    const x = (R(k, 541) * W + t * 6) % W, y = (R(k, 542) * H + Math.sin(t * 0.5 + k) * 20);
    c.globalAlpha = 0.15 + 0.25 * R(k, 543); c.fillRect(x, y, 2, 2);
  }
  c.restore();
  cloudLayer(c, t, 400, 1900, 10, SP.fog, 0.06, 6, 551, 1.4, 0.6);
  CAM = { z: 1.05 + 0.05 * u / 4.8, x: Math.sin(t * 0.7) * 10, y: Math.sin(t * 0.5) * 8, r: Math.sin(t * 0.4) * 0.01 };
  POST = { bloom: 0.8, vig: 0.85, grain: 0.10, flash: 0 };
}

function sceneEnd(c, u, t) {
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  WIND = 0.05;
  c.save(); c.globalCompositeOperation = 'lighter';
  spr(c, SP.red, W / 2, 1950, 1800, 700, 0.5 * ss(0, 1.5, u));
  c.restore();
  embers(c, t, 601, 70, -100, W + 100, 1950, 300, 0.8 * ss(0, 1, u));
  // 赤 壁
  const chars = ['赤', '壁'];
  chars.forEach((ch, i) => {
    const s0 = 0.4 + i * 0.55, p = ss(s0, s0 + 0.8, u);
    if (p <= 0) return;
    const cy = 560 + i * 360, top = cy - 190, bot = cy + 190;
    c.save();
    c.beginPath(); c.rect(0, top - 40, W, (bot - top + 80) * p); c.clip();
    c.font = '360px MSZ'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const gr = c.createLinearGradient(0, top, 0, bot);
    gr.addColorStop(0, '#fff2d6'); gr.addColorStop(0.5, '#ffb24a'); gr.addColorStop(1, '#c42a14');
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + i);
    c.shadowColor = `rgba(255,110,30,${0.9 * pulse})`; c.shadowBlur = 70;
    c.fillStyle = gr; c.fillText(ch, W / 2 + 20, cy);
    c.shadowBlur = 20; c.fillText(ch, W / 2 + 20, cy);
    c.restore();
  });
  // 竖排小字
  textGlow(c, '建', 300, 460, '600 34px NSerif', '#d9cbb0', 'rgba(0,0,0,0)', 0, 0.75 * ss(1.5, 2.2, u));
  textGlow(c, '安', 300, 505, '600 34px NSerif', '#d9cbb0', 'rgba(0,0,0,0)', 0, 0.75 * ss(1.6, 2.3, u));
  textGlow(c, '十', 300, 550, '600 34px NSerif', '#d9cbb0', 'rgba(0,0,0,0)', 0, 0.75 * ss(1.7, 2.4, u));
  textGlow(c, '三', 300, 595, '600 34px NSerif', '#d9cbb0', 'rgba(0,0,0,0)', 0, 0.75 * ss(1.8, 2.5, u));
  textGlow(c, '年', 300, 640, '600 34px NSerif', '#d9cbb0', 'rgba(0,0,0,0)', 0, 0.75 * ss(1.9, 2.6, u));
  // 诗句逐字点亮
  const lines = ['大江东去 浪淘尽', '千古风流人物'];
  let idx = 0;
  lines.forEach((ln, li) => {
    const y = 1270 + li * 110, chs = [...ln], cw = 84, x0 = W / 2 - (chs.length - 1) * cw / 2;
    chs.forEach((ch, ci) => {
      if (ch === ' ') { idx++; return; }
      const s0 = 2.5 + idx * 0.17; idx++;
      const a = ss(s0, s0 + 0.5, u);
      const hot = ss(s0, s0 + 0.25, u) * (1 - ss(s0 + 0.3, s0 + 1.4, u));
      textGlow(c, ch, x0 + ci * cw, y, '78px MSZ', '#f5f3ee', `rgba(255,255,255,${0.6 + hot * 0.4})`, 14 + hot * 30, a * (1 - ss(7.0, 7.7, u)) + 0.0);
      if (a < 1) textGlow(c, ch, x0 + ci * cw, y, '78px MSZ', '#777', 'rgba(0,0,0,0)', 0, 0.25 * ss(s0 - 0.6, s0, u) * (1 - a));
    });
  });
  textGlow(c, '—— 苏轼《念奴娇 · 赤壁怀古》', W / 2, 1490, '400 30px NSerif', '#bdb5a6', 'rgba(0,0,0,0)', 0, 0.75 * ss(5.6, 6.2, u));
  CAM = { z: 1.0 + 0.03 * u / 7.8, x: 0, y: 0, r: 0 };
  POST = { bloom: 0.55, vig: 0.6, grain: 0.09, flash: u > 1.75 && u < 2.1 ? 0.18 * (1 - (u - 1.75) / 0.35) : 0 };
}

const SCENE_FN = { title: sceneTitle, fleet: sceneFleet, wind: sceneWind, fireships: sceneFireships, archer: sceneArcher, volley: sceneVolley, inferno: sceneInferno, under: sceneUnder, end: sceneEnd };
// 每个镜头的淡入/淡出（秒）；0 = 硬切
const FADES = { title: [0, 0.3], fleet: [0.5, 0.3], wind: [0.3, 0.25], fireships: [0.3, 0.3], archer: [0.3, 0], volley: [0, 0.2], inferno: [0.2, 0.4], under: [0.4, 0.3], end: [0.5, 1.0] };

// ---------------------------------------------------------------- frame
let built = false;
function renderFrame(t) {
  if (!built) { buildFlag(); built = true; }
  const sc = SC.find(s => t >= s.t0 && t < s.t1) || SC[SC.length - 1];
  const u = t - sc.t0;
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over'; sx.filter = 'none';
  sx.fillStyle = '#000'; sx.fillRect(0, 0, W, H);
  SCENE_FN[sc.id](sx, u, t);
  sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over';

  // 镜头
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2 + CAM.x, H / 2 + CAM.y); ctx.rotate(CAM.r); ctx.scale(CAM.z, CAM.z); ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(scn, 0, 0);
  ctx.restore();

  // 泛光
  bx.setTransform(1, 0, 0, 1, 0, 0); bx.clearRect(0, 0, W / 4, H / 4);
  bx.filter = 'brightness(0.9) contrast(2.6) blur(7px)'; bx.drawImage(cv, 0, 0, W / 4, H / 4); bx.filter = 'none';
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = POST.bloom; ctx.drawImage(blm, 0, 0, W, H); ctx.restore();

  // 调色：暗部偏青，亮部偏暖
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.25; ctx.fillStyle = '#16323a'; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 暗角
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${POST.vig})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  // 闪白
  if (POST.flash > 0) { ctx.fillStyle = `rgba(255,236,210,${POST.flash})`; ctx.fillRect(0, 0, W, H); }

  // 转场
  const [fi, fo] = FADES[sc.id];
  let k = 1;
  if (fi > 0) k *= ss(0, fi, u);
  if (fo > 0) k *= 1 - ss(sc.t1 - sc.t0 - fo, sc.t1 - sc.t0, u);
  if (k < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - k})`; ctx.fillRect(0, 0, W, H); }

  // 颗粒
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = POST.grain;
  ctx.drawImage(GRAIN[Math.floor(t * 30) % 4], 0, 0, W, H); ctx.restore();

  subtitles(ctx, t);
}

window.renderFrame = renderFrame;
window.DURATION = DURATION;
window.ready = async () => {
  await Promise.all(['100px MSZ', '500 50px NSans', '400 32px NSans', '600 64px NSerif', '400 30px NSerif'].map(f => document.fonts.load(f, '赤壁曹Aa')));
  await document.fonts.ready;
  return true;
};
