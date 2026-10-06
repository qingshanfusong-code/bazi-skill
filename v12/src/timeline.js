// All timing for the film lives here. 120 BPM → 1 bar = 2 s.
export const FPS = 60;
export const DURATION = 72;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = k => k * k * (3 - 2 * k);
export const easeOut = k => 1 - Math.pow(1 - k, 3);
export const easeIn = k => k * k * k;
export const easeInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// scalar keyframes: [[t, v, cut?], ...] smoothstep between keys, cut = jump to v at t
export function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, cut] = keys[i];
    if (t < t1) {
      const [t0, v0] = keys[i - 1];
      if (cut) return v0;
      return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}
export const win = (t, a, b, fi = 0.25, fo = 0.25) => clamp((t - a) / fi) * clamp((b - t) / fo);

// ---------------- crank angle (visual) ----------------
// piecewise; anchors chosen so the focus cylinder B1 (fires at θ≡30 mod 720)
// starts its intake at t=20 and fires exactly at t=32; firings land on beats in 44–54.
function rateA(t) { // 2..20
  if (t < 12) return 420;
  if (t < 19) return lerp(420, 30, smooth((t - 12) / 7));
  return 30;
}
function rateRev(t) { // 54..72
  if (t < 56) return lerp(120, 2200, easeIn((t - 54) / 2));
  if (t < 62) return lerp(2200, 2500, (t - 56) / 6);
  if (t < 62.6) return lerp(2500, 1400, smooth((t - 62) / 0.6));
  if (t < 63.2) return lerp(1400, 2500, smooth((t - 62.6) / 0.6));
  if (t < 66) return 2500;
  if (t < 71) return lerp(2500, 150, easeOut((t - 66) / 5));
  return 150;
}
const DT = 1 / 1200;
const tabA = []; // θ from t=2..20, anchored θ(20)=390
{ let th = 390; const n = Math.round(18 / DT); tabA[n] = th; for (let i = n - 1; i >= 0; i--) { const t = 2 + (i + 0.5) * DT; th -= rateA(t) * DT; tabA[i] = th; } }
const tabR = []; { let th = 2310; tabR[0] = th; const n = Math.round(18 / DT); for (let i = 1; i <= n; i++) { const t = 54 + (i - 0.5) * DT; th += rateRev(t) * DT; tabR[i] = th; } }
function sample(tab, t0, t) { const x = (t - t0) / DT; const i = Math.floor(x); const f = x - i; const a = tab[Math.max(0, Math.min(tab.length - 1, i))], b = tab[Math.max(0, Math.min(tab.length - 1, i + 1))]; return a + (b - a) * f; }
export function thetaAt(t) {
  if (t < 2) return 750 + (t - 0.5) * 22;
  if (t < 20) return sample(tabA, 2, t);
  if (t < 44) return 390 + 30 * (t - 20);
  if (t < 54) return 1110 + 120 * (t - 44);
  return sample(tabR, 54, t);
}

// ---------------- story RPM (HUD + audio) ----------------
export function rpmAt(t) {
  if (t < 2) return 0;
  if (t < 2.6) return 260 + 40 * Math.sin(t * 60);
  if (t < 2.9) return lerp(300, 6800, easeOut((t - 2.6) / 0.3));
  if (t < 4.6) return lerp(6800, 1150, easeOut((t - 2.9) / 1.7));
  if (t < 54) {
    let r = 1100 + 25 * Math.sin(t * 7.3) + 12 * Math.sin(t * 17.1);
    // throttle blip on the x-ray reveal
    if (t > 12 && t < 13.6) { const k = (t - 12); r += (k < 0.18 ? easeOut(k / 0.18) : Math.exp(-(k - 0.18) * 3.2)) * 3800; }
    return r;
  }
  if (t < 56) return lerp(1100, 9000, easeIn((t - 54) / 2) * 0.35 + smooth((t - 54) / 2) * 0.65);
  const lim = () => 8920 + 120 * Math.abs(Math.sin(t * Math.PI * 7));
  if (t < 62) return lim();
  if (t < 62.6) return lerp(9000, 5600, smooth((t - 62) / 0.6));
  if (t < 63.2) return lerp(5600, 9000, smooth((t - 62.6) / 0.6));
  if (t < 66) return lim();
  if (t < 70) return lerp(9000, 1100, easeOut((t - 66) / 4));
  return 1100 + 20 * Math.sin(t * 7);
}
export function throttleAt(t) {
  if (t < 2.6) return 0;
  if (t < 3.0) return 1;
  if (t > 12 && t < 12.25) return 1;
  if (t >= 54 && t < 62) return 1;
  if (t >= 62.6 && t < 66) return 1;
  return 0.08;
}
export function slowmoLabel(t) {
  if (t < 2) return '慢放 1/5000';
  if (t >= 19 && t < 44) return '慢放 1/200';
  if (t >= 44 && t < 54) return '慢放 1/50';
  return '';
}

// ---------------- events ----------------
// exhaust flame bursts [t, intensity, bank(0/1/2=both)]
export const FLAMES = [
  [56.02, 1.2, 2], [56.45, 0.8, 0], [56.8, 0.9, 1], [57.2, 1.0, 2], [57.55, 0.7, 1], [57.9, 0.9, 0],
  [62.02, 1.3, 2], [62.25, 0.9, 1], [62.45, 0.8, 0],
  [66.08, 1.2, 2], [66.32, 0.8, 1], [66.55, 1.0, 0], [66.9, 0.9, 2], [67.3, 0.7, 1], [67.65, 0.8, 0], [68.1, 0.6, 2],
];
export function flameAt(t, bank) {
  let v = 0;
  for (const [t0, I, b] of FLAMES) {
    if (b !== 2 && b !== bank) continue;
    const d = t - t0; if (d < -0.02 || d > 0.6) continue;
    v = Math.max(v, I * (d < 0 ? (d + 0.02) / 0.02 : Math.exp(-d * 7)));
  }
  if (t > 56 && t < 66) v = Math.max(v, 0.22 + 0.12 * Math.sin(t * 53) * Math.sin(t * 31));
  return v;
}
export const FLASHES = [[0.5, 0.85], [2.0, 0.7], [12.0, 0.35], [32.0, 0.75], [44.0, 0.45], [56.0, 1.0], [58.0, 0.3], [60.0, 0.3], [62.0, 0.45], [64.0, 0.3], [66.05, 0.4]];
export const GLITCH = [[1.92, 2.18], [43.88, 44.16], [55.9, 56.12], [57.96, 58.06], [59.96, 60.06], [61.96, 62.06], [63.96, 64.06], [65.95, 66.08]];
export const SHAKE = [[0.5, 1.6, 1.2], [2.65, 0.9, 1.5], [12.0, 0.5, 1], [32.0, 2.2, 1.6], [56.0, 2.0, 1.0], [62.0, 1.0, 1.0], [66.1, 0.8, 1.2]];
export const CUTS = [2.0, 44.0, 56.0, 58.0, 60.0, 62.0, 64.0, 66.0];

export function flashAt(t) { let v = 0; for (const [t0, a] of FLASHES) { const d = t - t0; if (d >= -0.03 && d < 0.8) v = Math.max(v, a * (d < 0 ? (d + 0.03) / 0.03 : Math.exp(-d * 6))); } return v; }
export function glitchAt(t) { let v = 0; for (const [a, b] of GLITCH) if (t >= a && t <= b) v = Math.max(v, Math.sin(Math.PI * (t - a) / (b - a))); return v; }
export function shakeAt(t) {
  let v = 0; for (const [t0, a, d] of SHAKE) { const x = t - t0; if (x >= 0 && x < d * 2) v = Math.max(v, a * Math.exp(-x * 3 / d)); }
  if (t > 55 && t < 66) v = Math.max(v, 0.28 + (t > 56 ? 0.15 : 0));
  return v;
}

// ---------------- camera ----------------
// [t, pos, target, fov, cut]
export const CAM = [
  [0.0, [-63, 27, 29], [-25.5, 18.5, 10.5], 32],
  [2.0, [-57, 25, 26], [-25.5, 18.5, 10.5], 30],
  [2.0, [-112, 4, 78], [0, 14, 0], 34, true],
  [4.0, [-100, 9, 68], [0, 14, 0], 33],
  [7.5, [-45, 72, 102], [0, 13, 0], 34],
  [10.5, [-128, 24, 8], [0, 15, 0], 30],
  [12.0, [-122, 26, 4], [0, 15, 0], 30],
  [15.5, [-72, 46, 82], [-4, 13, 2], 32],
  [18.6, [-80, 22, 44], [-22, 17, 9], 31],
  [20.0, [-111, 15, 24], [-25, 19, 11], 30],
  [26.0, [-108, 17, 20], [-25, 19, 11], 30],
  [31.8, [-100, 15, 22], [-25, 18.5, 11.5], 30],
  [32.25, [-90, 15, 21], [-25, 18.5, 11.5], 25],
  [34.0, [-103, 15, 23], [-25, 18.5, 11.5], 29],
  [38.0, [-107, 15, 26], [-25, 19, 12], 30],
  [44.0, [-104, 18, 22], [-25, 19, 12], 30],
  [44.0, [-100, 108, 8], [0, 12, 0], 34, true],
  [49.0, [-58, 118, 58], [2, 12, 0], 34],
  [54.0, [-25, 96, 95], [4, 12, 0], 34],
  [54.0, [-118, 26, 74], [0, 14, 0], 36, true],
  [56.0, [-84, 18, 52], [0, 14, 0], 32],
  [56.0, [104, 3, 60], [72, -3, 14], 34, true],
  [58.0, [94, 5, 50], [70, -3, 14], 32],
  [58.0, [-74, 72, -84], [0, 13, 0], 34, true],
  [60.0, [-28, 82, -104], [0, 13, 0], 34],
  [60.0, [-6, 16, 64], [14, 8, 20], 32, true],
  [62.0, [26, 11, 61], [16, 7, 20], 32],
  [62.0, [-82, -7, 32], [0, 16, 0], 40, true],
  [64.0, [-68, -4, 18], [0, 17, 0], 40],
  [64.0, [-40, 44, 102], [5, 12, 0], 34, true],
  [66.0, [-96, 54, 122], [5, 12, 0], 34],
  [66.0, [-118, 34, 96], [5, 12, 0], 32, true],
  [72.0, [-134, 40, 52], [5, 12, 0], 32],
];
// Catmull-Rom across non-cut segments
function cr(p0, p1, p2, p3, k) {
  const k2 = k * k, k3 = k2 * k;
  return 0.5 * ((2 * p1) + (-p0 + p2) * k + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k2 + (-p0 + 3 * p1 - 3 * p2 + p3) * k3);
}
export function cameraAt(t) {
  let a = 0;
  for (let j = 0; j < CAM.length; j++) if (CAM[j][0] <= t) a = j;
  const b = a + 1;
  if (b >= CAM.length || CAM[b][4]) { const c = CAM[a]; return { pos: c[1], tgt: c[2], fov: c[3] }; }
  const A = CAM[a], B = CAM[b];
  const P = (a - 1 >= 0 && !A[4]) ? CAM[a - 1] : A;
  const N = (b + 1 < CAM.length && !CAM[b + 1][4]) ? CAM[b + 1] : B;
  const k = (t - A[0]) / (B[0] - A[0]);
  const f = (x, y) => cr(P[x][y], A[x][y], B[x][y], N[x][y], k);
  return { pos: [f(1, 0), f(1, 1), f(1, 2)], tgt: [f(2, 0), f(2, 1), f(2, 2)], fov: cr(P[3], A[3], B[3], N[3], k) };
}

// ---------------- scene parameters ----------------
export function paramsAt(t) {
  return {
    xray: kf(t, [[0, 1], [2, 0, true], [12.2, 0], [13.8, 1], [54, 1], [55.2, 0]]),
    dim: kf(t, [[0, 1], [2, 0, true], [18.8, 0], [20.4, 1], [44, 0, true]]),
    gasAll: kf(t, [[0, 0], [12.6, 0], [14.4, 1], [18.8, 1], [20.4, 0.6], [44, 1, true], [54, 1], [55.2, 0]]),
    gasFocus: kf(t, [[0, 1], [2, 0, true], [18.8, 0], [20.2, 1], [44, 0, true]]),
    particles: kf(t, [[0, 1], [2, 0, true], [19.4, 0], [20.4, 1], [43.7, 1], [44, 0]]),
    heat: kf(t, [[0, 0.55], [2, 0.12, true], [54, 0.14], [56, 0.55], [62, 1.0], [66, 1.0], [72, 0.55]]),
    after: kf(t, [[0, 0], [55.6, 0], [56.0, 0.6], [65.8, 0.6], [66.6, 0.25], [72, 0]]),
    bloom: kf(t, [[0, 0.7], [2, 0.75, true], [12, 0.75], [13.5, 0.55], [54, 0.55], [56, 0.8], [66, 0.8], [72, 0.7]]),
    exposure: kf(t, [[0, 1.0], [2, 0.75, true], [4, 1.0], [72, 1.0]]),
    fade: kf(t, [[0, 1], [0.25, 0], [71.0, 0], [72, 1]]),
    vib: kf(t, [[0, 0], [2.6, 0], [2.7, 0.5], [4.5, 0.06], [54, 0.06], [56, 0.35], [66, 0.35], [69, 0.06]]),
    focus: (t < 2 || (t >= 18.8 && t < 44)) ? 'B1' : null,
  };
}
