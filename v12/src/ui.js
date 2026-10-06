// 2D HUD layer (drawn into a 1920x1080 canvas, composited in the final post pass)
import { clamp, lerp, smooth, easeOut, easeIn, win } from './timeline.js';

export const W = 1920, H = 1080;
const CN = '"Noto Sans SC", "WenQuanYi Zen Hei", sans-serif';
const EN = 'Orbitron, sans-serif';
const EN2 = 'Rajdhani, sans-serif';
const RED = '#ff2b1c', AMBER = '#ffb52e', CYAN = '#3fe0ff', WHITE = '#f4f6f8';

// ------------------------------------------------------------------ captions
export const CAPTIONS = [
  [4.1, 7.9, '这是一台【V12 自然吸气发动机】—— 跑车圈的终极信仰'],
  [8.0, 11.9, '12 个气缸分成两排，夹角 60°，排成一个【V】字'],
  [12.1, 15.9, '开启透视 —— 外壳之下，是【12 个活塞】和一根曲轴'],
  [16.0, 19.9, '活塞上下猛冲，连杆把它变成【曲轴的旋转】'],
  [20.1, 25.9, '① 进气：活塞下行，进气门打开，吸入【空气 + 汽油雾】'],
  [26.1, 31.9, '② 压缩：气门全关，混合气被压缩到原来的【1/13】'],
  [32.1, 37.9, '③ 做功：火花塞点火，【2000°C+】 爆燃把活塞狠狠砸下去'],
  [38.1, 43.9, '④ 排气：排气门打开，高温废气冲进【排气管】'],
  [44.1, 48.9, '12 个缸轮流点火，曲轴每转【60°】就爆一次'],
  [49.0, 53.9, '动力几乎没有断档 —— 这就是 V12【丝滑】的秘密'],
  [54.1, 55.9, '现在，把转速拉满 ——'],
  [58.1, 61.9, '每秒【900 次】爆炸，每个活塞每秒往返【150 次】'],
  [62.1, 65.9, '这就是内燃机的巅峰：【极致的燃烧】'],
];

// ------------------------------------------------------------------ helpers
function txt(g, s, x, y, font, color, align = 'left', base = 'alphabetic') { g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = base; g.fillText(s, x, y); }
function spaced(g, s, x, y, font, color, sp, align = 'left') {
  g.font = font; g.fillStyle = color; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  let w = 0; for (const ch of s) w += g.measureText(ch).width + sp; w -= sp;
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  for (const ch of s) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp; }
  return w;
}
function rich(g, s, size, weight = 900) {
  // split 【...】 segments → [{t, hi}]
  const out = []; let hi = false, buf = '';
  for (const ch of s) { if (ch === '【') { if (buf) out.push({ t: buf, hi }); buf = ''; hi = true; } else if (ch === '】') { if (buf) out.push({ t: buf, hi }); buf = ''; hi = false; } else buf += ch; }
  if (buf) out.push({ t: buf, hi });
  g.font = `${weight} ${size}px ${CN}`;
  let w = 0; for (const p of out) { p.w = g.measureText(p.t).width; w += p.w; }
  return { parts: out, w };
}
function para(g, x, y, w, h, skew, fill) { g.beginPath(); g.moveTo(x + skew, y); g.lineTo(x + w + skew, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); g.fillStyle = fill; g.fill(); }
function glowStroke(g, color, blur) { g.shadowColor = color; g.shadowBlur = blur; }
function noGlow(g) { g.shadowBlur = 0; g.shadowColor = 'transparent'; }
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

// ------------------------------------------------------------------ pieces
function brand(g, t, a) {
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  para(g, 64, 46, 92, 44, 10, RED);
  txt(g, 'V12', 112, 80, `italic 900 30px ${EN}`, WHITE, 'center');
  txt(g, '极致的燃烧', 176, 78, `900 34px ${CN}`, WHITE);
  spaced(g, 'ULTIMATE COMBUSTION · 原理拆解', 178, 106, `600 17px ${EN2}`, 'rgba(220,226,235,0.7)', 3);
  g.restore();
}

function progress(g, t, dur) {
  const k = clamp(t / dur);
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, H - 6, W, 6);
  const grd = g.createLinearGradient(0, 0, W * k, 0); grd.addColorStop(0, '#7a0d08'); grd.addColorStop(1, RED);
  g.fillStyle = grd; g.fillRect(0, H - 6, W * k, 6);
}

function caption(g, t) {
  for (const [a, b, s] of CAPTIONS) {
    if (t < a - 0.01 || t > b + 0.01) continue;
    const kin = easeOut(clamp((t - a) / 0.28)), kout = clamp((b - t) / 0.2);
    const al = kin * kout; if (al <= 0) continue;
    const size = 46;
    const R = rich(g, s, size);
    const padX = 34, bh = 78;
    const cx = W / 2, y = H - 150 + (1 - kin) * 24;
    const bw = R.w + padX * 2;
    g.save(); g.globalAlpha = al;
    // panel
    const grd = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
    grd.addColorStop(0, 'rgba(8,10,14,0.82)'); grd.addColorStop(1, 'rgba(8,10,14,0.62)');
    g.fillStyle = grd; g.fillRect(cx - bw / 2, y - bh / 2, bw, bh);
    g.fillStyle = RED; g.fillRect(cx - bw / 2, y - bh / 2, 8, bh);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(cx - bw / 2 + 8, y + bh / 2 - 2, (bw - 8) * kin, 2);
    // text
    let x = cx - R.w / 2 + 4;
    g.font = `900 ${size}px ${CN}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    for (const p of R.parts) {
      if (p.hi) { glowStroke(g, 'rgba(255,150,30,0.9)', 18); g.fillStyle = AMBER; } else { noGlow(g); g.fillStyle = WHITE; }
      g.fillText(p.t, x, y + 2); x += p.w;
    }
    noGlow(g); g.restore();
  }
}

function tach(g, t, S, a) {
  if (a <= 0) return;
  const cx = 1736, cy = 182, R = 112;
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25; // 270° sweep
  const max = 10000, rpm = S.rpm;
  const ang = v => a0 + (a1 - a0) * clamp(v / max);
  g.save(); g.globalAlpha = a;
  // backdrop
  const bg = g.createRadialGradient(cx, cy, 10, cx, cy, R + 34); bg.addColorStop(0, 'rgba(10,12,16,0.75)'); bg.addColorStop(1, 'rgba(10,12,16,0.0)');
  g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R + 34, 0, Math.PI * 2); g.fill();
  g.lineWidth = 10; g.strokeStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  g.strokeStyle = 'rgba(255,43,28,0.45)'; g.beginPath(); g.arc(cx, cy, R, ang(9000), a1); g.stroke();
  // fill arc
  const hot = clamp((rpm - 6500) / 2500);
  const grd = g.createLinearGradient(cx - R, cy + R, cx + R, cy - R);
  grd.addColorStop(0, CYAN); grd.addColorStop(0.6, AMBER); grd.addColorStop(1, RED);
  glowStroke(g, hot > 0.2 ? 'rgba(255,60,30,1)' : 'rgba(60,220,255,0.9)', 16 + hot * 20);
  g.strokeStyle = grd; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, R, a0, ang(rpm)); g.stroke(); noGlow(g);
  // ticks
  for (let i = 0; i <= 10; i++) {
    const an = ang(i * 1000), c = Math.cos(an), s = Math.sin(an);
    g.strokeStyle = i >= 9 ? RED : 'rgba(230,236,245,0.75)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx + c * (R - 20), cy + s * (R - 20)); g.lineTo(cx + c * (R - 32), cy + s * (R - 32)); g.stroke();
    txt(g, String(i), cx + c * (R - 48), cy + s * (R - 48) + 7, `600 18px ${EN2}`, i >= 9 ? RED : 'rgba(230,236,245,0.8)', 'center');
  }
  // needle tip
  const an = ang(rpm); g.fillStyle = WHITE; glowStroke(g, WHITE, 12);
  g.beginPath(); g.arc(cx + Math.cos(an) * R, cy + Math.sin(an) * R, 7, 0, Math.PI * 2); g.fill(); noGlow(g);
  // digits
  const shown = Math.round(rpm / 10) * 10;
  txt(g, String(shown).padStart(4, ' '), cx, cy + 14, `800 44px ${EN}`, hot > 0.5 ? '#ff4a32' : WHITE, 'center');
  spaced(g, 'RPM', cx, cy + 44, `600 18px ${EN2}`, 'rgba(220,226,235,0.7)', 4, 'center');
  if (S.slowmo) {
    const w = 168; para(g, cx - w / 2, cy + R + 16, w, 34, 8, 'rgba(255,181,46,0.95)');
    txt(g, S.slowmo, cx + 4, cy + R + 41, `900 22px ${CN}`, '#1a1204', 'center');
  }
  if (rpm > 8800 && Math.sin(t * 40) > 0) { txt(g, 'SHIFT', cx, cy - 34, `900 22px ${EN}`, RED, 'center'); }
  g.restore();
}

const ORDER = ['A1', 'B1', 'A5', 'B5', 'A3', 'B3', 'A6', 'B6', 'A2', 'B2', 'A4', 'B4'];
function firingMap(g, t, S, a) {
  if (a <= 0) return;
  const x0 = 1560, y0 = 372;
  g.save(); g.globalAlpha = a;
  g.fillStyle = 'rgba(8,10,14,0.7)'; g.fillRect(x0, y0, 300, 150);
  g.fillStyle = RED; g.fillRect(x0, y0, 4, 150);
  txt(g, '气缸状态', x0 + 18, y0 + 32, `900 22px ${CN}`, WHITE);
  spaced(g, 'CYLINDER MAP', x0 + 122, y0 + 31, `600 14px ${EN2}`, 'rgba(220,226,235,0.6)', 2);
  for (const C of S.cyl) {
    const x = x0 + 30 + C.idx * 44, y = y0 + 62 + C.bank * 44;
    const st = C.psi;
    let col, glow = 0;
    if (st < 150) { col = '#ff6a1a'; glow = clamp(1 - st / 60); }
    else if (st < 360) col = '#8a3a22';
    else if (st < 540) col = '#2fc8ff';
    else col = '#ffb02e';
    if (glow > 0) { glowStroke(g, '#ffd8a0', 30 * glow); }
    g.fillStyle = glow > 0.4 ? '#fff2dc' : col; g.fillRect(x - 15, y - 15, 30, 30); noGlow(g);
    txt(g, C.name, x, y + 6, `700 13px ${EN}`, glow > 0.4 ? '#2a1000' : 'rgba(10,10,10,0.85)', 'center');
  }
  // legend
  const lg = [['#2fc8ff', '进气'], ['#ffb02e', '压缩'], ['#ff6a1a', '做功'], ['#8a3a22', '排气']];
  lg.forEach(([c, s], i) => { g.fillStyle = c; g.fillRect(x0 + 18 + i * 70, y0 + 128, 12, 12); txt(g, s, x0 + 35 + i * 70, y0 + 140, `700 15px ${CN}`, 'rgba(230,236,245,0.85)'); });
  g.restore();
}

function stageTabs(g, t, S, a) {
  if (a <= 0) return;
  const names = [['01', '进气', 'INTAKE'], ['02', '压缩', 'COMPRESSION'], ['03', '做功', 'POWER'], ['04', '排气', 'EXHAUST']];
  const tw = 230, th = 64, gap = 10, x0 = W / 2 - (tw * 4 + gap * 3) / 2, y0 = 40;
  const psi = S.focusPsi;
  // which stroke: intake 360-540, comp 540-720, power 0-180, exhaust 180-360
  let st, prog;
  if (psi >= 360 && psi < 540) { st = 0; prog = (psi - 360) / 180; } else if (psi >= 540) { st = 1; prog = (psi - 540) / 180; } else if (psi < 180) { st = 2; prog = psi / 180; } else { st = 3; prog = (psi - 180) / 180; }
  g.save(); g.globalAlpha = a;
  names.forEach(([n, cn, en], i) => {
    const x = x0 + i * (tw + gap), on = i === st;
    para(g, x, y0, tw, th, 12, on ? 'rgba(255,43,28,0.92)' : 'rgba(10,12,16,0.72)');
    if (on) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x + 4, y0 + th - 5, (tw - 8) * prog, 4); }
    txt(g, n, x + 26, y0 + 41, `800 20px ${EN}`, on ? '#ffe2dc' : 'rgba(220,226,235,0.45)');
    txt(g, cn, x + 70, y0 + 42, `900 30px ${CN}`, on ? WHITE : 'rgba(230,236,245,0.55)');
    spaced(g, en, x + 140, y0 + 40, `600 13px ${EN2}`, on ? '#ffe2dc' : 'rgba(220,226,235,0.4)', 1.5);
  });
  spaced(g, `曲轴转角  θ = ${String(Math.floor(psi)).padStart(3, '0')}°  /  720°`, W / 2, y0 + th + 34, `600 20px ${EN2}`, 'rgba(220,226,235,0.75)', 2, 'center');
  g.restore();
}

// leader-line label
export function label(g, t, L, p) {
  if (!p || !p.vis) return;
  const a = win(t, L.t0, L.t1, 0.35, 0.25); if (a <= 0) return;
  const k = easeOut(clamp((t - L.t0) / 0.45));
  const [dx, dy] = L.off || [90, -80];
  const ex = p.x + dx * k, ey = p.y + dy * k;
  const dir = dx >= 0 ? 1 : -1, hl = 26 * k;
  g.save(); g.globalAlpha = a;
  // anchor pulse
  const pulse = (t * 1.6) % 1;
  g.strokeStyle = `rgba(63,224,255,${0.8 * (1 - pulse)})`; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 6 + pulse * 18, 0, Math.PI * 2); g.stroke();
  g.fillStyle = WHITE; glowStroke(g, CYAN, 12); g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2); g.fill(); noGlow(g);
  g.strokeStyle = 'rgba(240,248,255,0.85)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(ex, ey); g.lineTo(ex + dir * hl, ey); g.stroke();
  // text block
  const ta = clamp((t - L.t0 - 0.25) / 0.3);
  if (ta > 0) {
    g.globalAlpha = a * ta;
    const tx = ex + dir * (hl + 10);
    g.font = `900 30px ${CN}`; const w1 = g.measureText(L.title).width;
    g.font = `600 17px ${EN2}`; const w2 = (L.sub || '').length * 10.5;
    const bw = Math.max(w1, w2) + 30, bx = dir > 0 ? tx : tx - bw;
    g.fillStyle = 'rgba(8,10,14,0.72)'; g.fillRect(bx, ey - 36, bw, 70);
    g.fillStyle = L.color || CYAN; g.fillRect(dir > 0 ? bx : bx + bw - 4, ey - 36, 4, 70);
    txt(g, L.title, bx + 15, ey + 2, `900 30px ${CN}`, WHITE);
    spaced(g, L.sub || '', bx + 16, ey + 25, `600 17px ${EN2}`, L.color || CYAN, 1.5);
  }
  g.restore();
}

// ------------------------------------------------------------------ special cards
function hook(g, t) {
  if (t > 2.05) return;
  const a = win(t, 0.55, 1.95, 0.15, 0.08); if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  const k = easeOut(clamp((t - 0.6) / 1.1));
  const n = Math.round(54000 * k);
  const s = n.toLocaleString('en-US');
  txt(g, '1 分钟', W / 2, 400, `900 64px ${CN}`, WHITE, 'center');
  glowStroke(g, 'rgba(255,90,20,1)', 50);
  txt(g, s, W / 2, 590, `italic 900 190px ${EN}`, '#ffd9a8', 'center');
  noGlow(g);
  txt(g, '次  爆  炸', W / 2, 690, `900 64px ${CN}`, AMBER, 'center');
  g.restore();
}

function titleCard(g, t) {
  if (t < 1.98 || t > 4.4) return;
  const a = win(t, 2.0, 4.3, 0.06, 0.35);
  g.save(); g.globalAlpha = a;
  const gl = t < 2.35 ? 1 - (t - 2.0) / 0.35 : 0; // glitch-in
  const cy = 500;
  g.font = `900 168px ${CN}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  if (gl > 0) {
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,0,40,0.8)'; g.fillText('极致的燃烧', W / 2 - 14 * gl, cy);
    g.fillStyle = 'rgba(0,220,255,0.8)'; g.fillText('极致的燃烧', W / 2 + 14 * gl, cy);
    g.globalCompositeOperation = 'source-over';
  }
  glowStroke(g, 'rgba(255,40,20,0.9)', 40);
  const grd = g.createLinearGradient(0, cy - 150, 0, cy + 10); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.55, '#ffe3d6'); grd.addColorStop(1, '#ff6a4a');
  g.fillStyle = grd; g.fillText('极致的燃烧', W / 2, cy);
  noGlow(g);
  // slice glitch
  if (gl > 0) { for (let i = 0; i < 6; i++) { const y = cy - 150 + hash(i + Math.floor(t * 40)) * 160; g.drawImage(g.canvas, 0, y, W, 10, (hash(i * 3.1 + t) - 0.5) * 60 * gl, y, W, 10); } }
  const k = easeOut(clamp((t - 2.25) / 0.5));
  g.fillStyle = RED; g.fillRect(W / 2 - 360 * k, cy + 40, 720 * k, 5);
  spaced(g, 'V12 · NATURALLY ASPIRATED · 9000 RPM', W / 2, cy + 92, `700 28px ${EN2}`, 'rgba(235,240,248,0.9)', 6, 'center');
  txt(g, '跑车 V12 发动机 · 原理全拆解', W / 2, cy + 150, `700 34px ${CN}`, 'rgba(255,200,170,0.95)', 'center');
  g.restore();
}

function vAngle(g, t, S) {
  const a = win(t, 9.6, 12.2, 0.4, 0.3); if (a <= 0 || !S.vAngle) return;
  const { c, pa, pb } = S.vAngle;
  const k = easeOut(clamp((t - 9.6) / 0.7));
  g.save(); g.globalAlpha = a;
  g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeStyle = AMBER; glowStroke(g, AMBER, 12);
  g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(lerp(c.x, pa.x, k), lerp(c.y, pa.y, k)); g.moveTo(c.x, c.y); g.lineTo(lerp(c.x, pb.x, k), lerp(c.y, pb.y, k)); g.stroke();
  g.setLineDash([]);
  const r = 120, an1 = Math.atan2(pa.y - c.y, pa.x - c.x), an2 = Math.atan2(pb.y - c.y, pb.x - c.x);
  g.beginPath(); g.arc(c.x, c.y, r, an1, an1 + (an2 - an1) * k, an2 < an1); g.stroke(); noGlow(g);
  const mid = (an1 + an2) / 2;
  if (k > 0.6) {
    g.globalAlpha = a * clamp((k - 0.6) / 0.4);
    glowStroke(g, 'rgba(255,150,30,1)', 24);
    txt(g, '60°', c.x + Math.cos(mid) * (r + 64), c.y + Math.sin(mid) * (r + 64) + 24, `italic 900 64px ${EN}`, '#ffe0a8', 'center');
    noGlow(g);
  }
  g.restore();
}

function bigStat(g, t, a, x, y, big, unit, sub, color = AMBER) {
  if (a <= 0) return;
  const k = easeOut(clamp(a * 1.5));
  g.save(); g.globalAlpha = a;
  glowStroke(g, color, 30);
  txt(g, big, x + (1 - k) * -40, y, `italic 900 104px ${EN}`, '#fff3e0', 'left');
  noGlow(g);
  g.font = `italic 900 104px ${EN}`; const w = g.measureText(big).width;
  txt(g, unit, x + w + 16, y, `900 40px ${CN}`, color, 'left');
  g.fillStyle = color; g.fillRect(x, y + 22, 90 * k, 5);
  txt(g, sub, x, y + 66, `700 28px ${CN}`, 'rgba(235,240,248,0.92)', 'left');
  g.restore();
}

function stats(g, t) {
  bigStat(g, t, win(t, 21.2, 25.7, 0.4, 0.3), 92, 360, '3', 'ms', '9000转时，这一步只要 3 毫秒', CYAN);
  bigStat(g, t, win(t, 27.4, 31.8, 0.4, 0.3), 92, 360, '13:1', '', '压缩比 · 气体温度飙到 400°C+', AMBER);
  bigStat(g, t, win(t, 32.35, 37.7, 0.2, 0.3), 92, 360, '7', '吨', '活塞顶瞬间承受的冲击力', '#ff5a2a');
  bigStat(g, t, win(t, 39.0, 43.7, 0.4, 0.3), 92, 360, '900', '°C', '排气温度 · 排气管被烧到发红', '#ff7a2a');
}

function boom(g, t) {
  const a = win(t, 32.0, 33.1, 0.04, 0.4); if (a <= 0) return;
  const k = easeOut(clamp((t - 32.0) / 0.5));
  g.save(); g.globalAlpha = a;
  g.translate(W / 2 + 330, 470); g.rotate(-0.08); g.scale(0.7 + k * 0.4, 0.7 + k * 0.4);
  glowStroke(g, 'rgba(255,80,10,1)', 60);
  txt(g, 'BOOM', 0, 0, `italic 900 150px ${EN}`, '#fff1d8', 'center', 'middle');
  noGlow(g); g.restore();
}

function torqueChart(g, t) {
  const a = win(t, 49.2, 53.9, 0.4, 0.3); if (a <= 0) return;
  const x0 = 70, y0 = 330, w = 520, h = 300;
  const k = clamp((t - 49.3) / 2.2);
  g.save(); g.globalAlpha = a;
  g.fillStyle = 'rgba(8,10,14,0.78)'; g.fillRect(x0, y0, w, h); g.fillStyle = RED; g.fillRect(x0, y0, 4, h);
  txt(g, '输出扭矩波动', x0 + 22, y0 + 40, `900 28px ${CN}`, WHITE);
  spaced(g, 'TORQUE RIPPLE', x0 + 210, y0 + 38, `600 15px ${EN2}`, 'rgba(220,226,235,0.6)', 2);
  const plot = (yb, fn, col, name) => {
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 120, yb); g.lineTo(x0 + w - 24, yb); g.stroke();
    txt(g, name, x0 + 22, yb - 8, `900 26px ${CN}`, col);
    g.strokeStyle = col; g.lineWidth = 3; glowStroke(g, col, 10); g.beginPath();
    const n = 260; for (let i = 0; i <= n * k; i++) { const u = i / n; const x = x0 + 120 + u * (w - 144); const y = yb - fn(u * 720) * 50; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke(); noGlow(g);
  };
  const pulse = (deg, period) => { const p = ((deg % period) + period) % period; return Math.max(-0.25, Math.sin(Math.PI * p / period) * Math.exp(-p / period * 1.2) * 1.6 - 0.25); };
  plot(y0 + 145, d => pulse(d, 180), '#9aa3ad', '4 缸');
  plot(y0 + 250, d => 0.55 + 0.08 * Math.sin(d * Math.PI / 30), AMBER, 'V12');
  g.restore();
}

function revCard(g, t, S) {
  const a = win(t, 56.0, 58.0, 0.03, 0.25); if (a <= 0) return;
  const k = easeOut(clamp((t - 56.0) / 0.3));
  g.save(); g.globalAlpha = a;
  const sc = 1.6 - k * 0.6; g.translate(W / 2, 520); g.scale(sc, sc);
  glowStroke(g, 'rgba(255,40,20,1)', 60);
  g.font = `italic 900 210px ${EN}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,0,40,0.5)'; g.fillText('9000', -10, 0); g.fillStyle = 'rgba(0,220,255,0.5)'; g.fillText('9000', 10, 0);
  g.fillStyle = '#fff4ea'; g.fillText('9000', 0, 0);
  noGlow(g);
  spaced(g, 'R P M', 0, 150, `800 48px ${EN}`, RED, 18, 'center');
  g.restore();
}
function outro(g, t) {
  const a = win(t, 66.4, 71.2, 0.6, 0.5); if (a <= 0) return;
  const k = easeOut(clamp((t - 66.4) / 0.9));
  g.save(); g.globalAlpha = a;
  glowStroke(g, 'rgba(255,40,20,0.9)', 40);
  txt(g, '极致的燃烧', W / 2, 430 + (1 - k) * 30, `900 120px ${CN}`, WHITE, 'center');
  noGlow(g);
  g.fillStyle = RED; g.fillRect(W / 2 - 300 * k, 470, 600 * k, 4);
  spaced(g, 'V12 · 内燃机的最后浪漫', W / 2, 532, `700 34px ${CN}`, 'rgba(255,215,195,0.95)', 6, 'center');
  const b = clamp((t - 67.6) / 0.5);
  if (b > 0) {
    g.globalAlpha = a * b;
    const s = '你心中最强的 V12 是哪一台？评论区告诉我';
    g.font = `900 40px ${CN}`; const w = g.measureText(s).width + 70;
    para(g, W / 2 - w / 2, 800, w, 70, 12, 'rgba(255,43,28,0.95)');
    txt(g, s, W / 2 + 6, 848, `900 40px ${CN}`, WHITE, 'center');
  }
  g.restore();
}

function corners(g, a) {
  if (a <= 0) return;
  g.save(); g.globalAlpha = a * 0.6; g.strokeStyle = 'rgba(220,235,255,0.7)'; g.lineWidth = 2;
  const m = 34, l = 44;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m - 6, 1, -1], [W - m, H - m - 6, -1, -1]]) { g.beginPath(); g.moveTo(x, y + sy * l); g.lineTo(x, y); g.lineTo(x + sx * l, y); g.stroke(); }
  g.restore();
}

function firingBadges(g, t, S) {
  const a = win(t, 44.3, 53.9, 0.3, 0.3); if (a <= 0 || !S.badges) return;
  g.save(); g.globalAlpha = a;
  for (const B of S.badges) {
    if (!B.p.vis) continue;
    const order = ORDER.indexOf(B.name) + 1;
    const glow = B.glow;
    g.fillStyle = glow > 0.05 ? `rgba(255,${120 + 100 * glow | 0},40,${0.55 + 0.45 * glow})` : 'rgba(8,10,14,0.7)';
    glowStroke(g, '#ff8a2a', 30 * glow);
    g.beginPath(); g.arc(B.p.x, B.p.y, 20 + glow * 8, 0, Math.PI * 2); g.fill(); noGlow(g);
    txt(g, String(order), B.p.x, B.p.y + 1, `800 ${20 + glow * 6 | 0}px ${EN}`, glow > 0.3 ? '#1a0a00' : WHITE, 'center', 'middle');
  }
  // firing order strip
  const x0 = W / 2 - 430, y0 = 70;
  g.fillStyle = 'rgba(8,10,14,0.72)'; g.fillRect(x0 - 20, y0 - 30, 900, 92);
  txt(g, '点火顺序', x0, y0 + 2, `900 24px ${CN}`, WHITE);
  spaced(g, 'FIRING ORDER · 每 60° 一次', x0 + 112, y0, `600 15px ${EN2}`, 'rgba(220,226,235,0.6)', 2);
  ORDER.forEach((n, i) => {
    const C = S.cyl.find(c => c.name === n); const glow = C ? clamp(1 - C.psi / 60) * (C.psi < 60 ? 1 : 0) : 0;
    const x = x0 + i * 72, y = y0 + 38;
    g.fillStyle = glow > 0 ? `rgba(255,${110 + 120 * glow | 0},40,1)` : 'rgba(255,255,255,0.1)';
    if (glow > 0) glowStroke(g, '#ff8a2a', 20 * glow);
    g.fillRect(x, y - 18, 62, 30); noGlow(g);
    txt(g, n, x + 31, y + 3, `800 17px ${EN}`, glow > 0.3 ? '#1a0a00' : 'rgba(235,240,248,0.8)', 'center', 'middle');
  });
  g.restore();
}

// ------------------------------------------------------------------ main
export function drawUI(g, t, S) {
  g.clearRect(0, 0, W, H);
  // subtle top/bottom gradient for legibility
  const tg = g.createLinearGradient(0, 0, 0, 170); tg.addColorStop(0, 'rgba(0,0,0,0.45)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
  const hudA = win(t, 4.0, 71.0, 0.5, 0.6);
  if (hudA > 0) { g.globalAlpha = hudA; g.fillStyle = tg; g.fillRect(0, 0, W, 170); g.globalAlpha = 1; }
  corners(g, win(t, 12.2, 54, 0.6, 0.6));
  brand(g, t, win(t, 4.0, 66.2, 0.5, 0.4));
  tach(g, t, S, win(t, 4.3, 66.2, 0.5, 0.4) * (1 - win(t, 44.1, 54.0, 0.3, 0.3) * 0));
  firingMap(g, t, S, win(t, 13.0, 54.2, 0.5, 0.4) * (1 - win(t, 20.0, 44.0, 0.4, 0.4)));
  stageTabs(g, t, S, win(t, 20.0, 43.9, 0.35, 0.25));
  for (const L of S.labels) label(g, t, L, L.p);
  vAngle(g, t, S);
  firingBadges(g, t, S);
  stats(g, t);
  boom(g, t);
  torqueChart(g, t);
  hook(g, t);
  titleCard(g, t);
  revCard(g, t, S);
  outro(g, t);
  caption(g, t);
  if (hudA > 0) { g.globalAlpha = hudA; progress(g, t, 72); g.globalAlpha = 1; }
}
