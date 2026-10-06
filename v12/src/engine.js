// Procedural 60° V12 — crank, rods, pistons, valvetrain, block, heads, intake, exhaust.
// Units: 1 = 1 cm. Crank axis = X (front of engine at -X). Y up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const D2R = Math.PI / 180;

export const SPEC = {
  bore: 9.4, stroke: 7.8, r: 3.9, L: 15.2, pitch: 10.8, off: 2.6,
  bankDeg: 30, pinToCrown: 3.2, deck: 23.0, valveTilt: 20 * D2R, lift: 1.25,
};
// crankpin phase per pair (deg) — inline-six style throws
const PIN_PHASE = [0, 240, 120, 120, 240, 0];
// firing offsets inside a bank (inline-six order 1-5-3-6-2-4)
const FIRE_OFF = [0, 480, 240, 600, 120, 360];

export function mod(a, n) { return ((a % n) + n) % n; }

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- shaders ----------
function xrayMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.); vW=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ float f = 1.0-abs(dot(normalize(vN),vV)); f = pow(f,2.2);
        float scan = 0.5+0.5*sin(vW.y*1.6 - uTime*3.0); scan = smoothstep(0.92,1.0,scan)*0.35;
        float a = (0.012 + pow(f,2.5)*0.42 + scan*f*0.3)*uOpacity;
        gl_FragColor = vec4(uColor*(0.5+f*0.9), a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function gasMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x40d0ff) }, uI: { value: 0 }, uTime: { value: 0 }, uHot: { value: 0 } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP=position; vec4 wp=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; uniform float uTime; uniform float uHot; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float h(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){ float f = 1.0-abs(dot(normalize(vN),vV));
        float n = n3(vP*vec3(0.6,3.0,0.6)+vec3(0.,-uTime*2.,uTime)) * 0.6 + n3(vP*1.7 - uTime*1.3)*0.4;
        vec3 c = uColor*(0.55 + n*0.9) + vec3(1.0,0.9,0.7)*uHot*n*n*1.6;
        float a = uI*(0.28 + f*0.5 + n*0.25);
        gl_FragColor = vec4(c*uI*(0.6+uHot*2.0), a*0.8); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uI; uniform float uTime; varying vec2 vUv; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){ float along = vUv.y; // 0 base -> 1 tip
        float n = n2(vec2(vUv.x*6.0, along*4.0 - uTime*18.0))*0.6 + n2(vec2(vUv.x*13.0, along*9.0 - uTime*31.0))*0.4;
        float core = (1.0-along); float a = uI*core*core*(0.4+n);
        vec3 c = mix(vec3(1.0,0.35,0.05), vec3(1.0,0.95,0.8), core*core) + vec3(0.2,0.4,1.0)*smoothstep(0.85,1.0,core)*0.6;
        gl_FragColor = vec4(c*a*1.4, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ---------- textures ----------
function carbonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, 256, 256);
  const s = 16;
  for (let y = 0; y < 256 / s; y++) for (let x = 0; x < 256 / s; x++) {
    const hor = ((x + y) >> 1) % 2 === 0;
    const grd = hor ? g.createLinearGradient(x * s, 0, x * s + s, 0) : g.createLinearGradient(0, y * s, 0, y * s + s);
    grd.addColorStop(0, '#15171b'); grd.addColorStop(0.5, '#3a3f47'); grd.addColorStop(1, '#15171b');
    g.fillStyle = grd; g.fillRect(x * s + 0.5, y * s + 0.5, s - 1, s - 1);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function heatTintTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 4; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 512, 0);
  grd.addColorStop(0.0, '#8a6a3c'); grd.addColorStop(0.12, '#b98a4a'); grd.addColorStop(0.25, '#6a3a6e');
  grd.addColorStop(0.38, '#2f4fa0'); grd.addColorStop(0.55, '#7b8fb0'); grd.addColorStop(0.8, '#9da3ab'); grd.addColorStop(1, '#a8acb2');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function heatGlowTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 4; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 512, 0);
  grd.addColorStop(0, '#ffc890'); grd.addColorStop(0.35, '#ff8040'); grd.addColorStop(0.7, '#a03010'); grd.addColorStop(1, '#300800');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function badgeTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.font = 'italic 900 170px Orbitron, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const grd = g.createLinearGradient(0, 40, 0, 220); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#b8bec6'); grd.addColorStop(1, '#6d737b');
  g.fillStyle = grd; g.fillText('V12', 512, 132);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---------- geometry helpers ----------
const tmpV = new THREE.Vector3();
export function bankToWorld(beta, x, y, z, out = new THREE.Vector3()) {
  const c = Math.cos(beta), s = Math.sin(beta);
  return out.set(x, y * c - z * s, y * s + z * c);
}
export function worldToBank(beta, v, out = new THREE.Vector3()) {
  const c = Math.cos(-beta), s = Math.sin(-beta);
  return out.set(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

function cyl(rt, rb, h, seg = 32, open = false) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); }
function alongX(g) { g.rotateZ(Math.PI / 2); return g; }

function webGeometry(r, t) {
  const sh = new THREE.Shape();
  const pr = 2.9;
  sh.moveTo(pr, r);
  sh.absarc(0, r, pr, 0, Math.PI, false);
  sh.lineTo(-3.4, 0.0);
  sh.absarc(0, 0, 6.6, Math.PI + 0.42, 2 * Math.PI - 0.42, false);
  sh.lineTo(3.4, 0.0);
  sh.lineTo(pr, r);
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2, curveSegments: 24 });
  g.translate(0, 0, -t / 2);
  g.rotateY(Math.PI / 2); // shape XY -> (z,y) plane, extrude along x
  return g;
}

function lobeGeometry() {
  const sh = new THREE.Shape();
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const nose = Math.pow(Math.max(0, Math.cos(a)), 3) * 0.95;
    const rr = 1.35 + nose;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1 });
  g.translate(0, 0, -0.7);
  // shape +X is nose; map shape (x,y) -> (y,z) local plane, extrude along X
  g.rotateY(Math.PI / 2); // shape x -> -z, extrude -> +x
  g.rotateX(Math.PI / 2); // nose -> +Y
  return g;
}

function rodGeometry(L) {
  const parts = [];
  const big = alongX(cyl(3.3, 3.3, 2.2, 40)); parts.push(big);
  const small = alongX(cyl(1.7, 1.7, 2.0, 32)); small.translate(0, L, 0); parts.push(small);
  const beam = new THREE.BoxGeometry(1.0, L - 4.2, 1.6, 1, 1, 1); beam.translate(0, L / 2 + 0.6, 0);
  // taper beam: scale z by y
  const p = beam.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = THREE.MathUtils.lerp(1.5, 0.75, (y - 2.6) / (L - 4.2)); p.setZ(i, p.getZ(i) * k); }
  beam.computeVertexNormals(); parts.push(beam);
  const flangeL = new THREE.BoxGeometry(0.6, L - 4.4, 0.5); flangeL.translate(0.7, L / 2 + 0.6, 0); parts.push(flangeL);
  const flangeR = flangeL.clone(); flangeR.translate(-1.4, 0, 0); parts.push(flangeR);
  // cap bolts
  for (const z of [-2.6, 2.6]) { const b = cyl(0.45, 0.45, 2.0, 12); b.translate(0, -1.6, z); parts.push(b); }
  return mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
}

function pistonGeometry() {
  const R = SPEC.bore / 2 - 0.08;
  const crownY = SPEC.pinToCrown;
  const body = cyl(R, R, crownY + 1.6, 48); body.translate(0, (crownY - 1.6) / 2, 0);
  const dome = new THREE.SphereGeometry(R * 3.0, 48, 6, 0, Math.PI * 2, 0, Math.asin(1 / 3.0));
  dome.translate(0, crownY - R * 3.0 * Math.cos(Math.asin(1 / 3.0)), 0);
  const pin = alongX(cyl(1.05, 1.05, SPEC.bore - 1.2, 20));
  return mergeGeometries([body.toNonIndexed(), dome.toNonIndexed(), pin.toNonIndexed()]);
}
function ringGeometry() {
  const R = SPEC.bore / 2 - 0.02; const parts = [];
  for (const y of [2.75, 2.25, 1.75]) { const g = cyl(R, R, 0.16, 48, true); g.translate(0, y, 0); parts.push(g); }
  return mergeGeometries(parts);
}
function valveGeometry() {
  const head = cyl(1.75, 1.95, 0.35, 32); head.translate(0, 0.0, 0);
  const neck = cyl(0.32, 1.2, 0.9, 24); neck.translate(0, 0.6, 0);
  const stem = cyl(0.3, 0.3, 9.0, 12); stem.translate(0, 5.5, 0);
  const ret = cyl(0.9, 0.9, 0.4, 20); ret.translate(0, 8.4, 0);
  return mergeGeometries([head.toNonIndexed(), neck.toNonIndexed(), stem.toNonIndexed(), ret.toNonIndexed()]);
}
function springGeometry() {
  const pts = []; const turns = 6, h = 4.2, rr = 1.05;
  for (let i = 0; i <= turns * 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * rr, (i / (turns * 24)) * h, Math.sin(a) * rr)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.14, 6, false);
}

// ======================================================================
export function buildEngine(scene) {
  const root = new THREE.Group(); root.name = 'engine'; scene.add(root);
  const { r, L, pitch, off, deck } = SPEC;
  const BETA = [-SPEC.bankDeg * D2R, SPEC.bankDeg * D2R]; // bank A (left, -z), bank B (right, +z)
  const SIN = [1, -1]; // local +z is inward for A, outward for B
  const rand = rng(7);

  // ---- materials ----
  const M = {
    steel: new THREE.MeshPhysicalMaterial({ color: 0xa4aab2, metalness: 1, roughness: 0.22, clearcoat: 0.3 }),
    darkSteel: new THREE.MeshPhysicalMaterial({ color: 0x3a3d42, metalness: 1, roughness: 0.35 }),
    titanium: new THREE.MeshPhysicalMaterial({ color: 0x8e96a4, metalness: 1, roughness: 0.3, clearcoat: 0.5 }),
    alu: new THREE.MeshPhysicalMaterial({ color: 0xd4d7db, metalness: 1, roughness: 0.28 }),
    ring: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.8, roughness: 0.4 }),
    block: new THREE.MeshPhysicalMaterial({ color: 0x55585e, metalness: 0.85, roughness: 0.5, transparent: true, opacity: 1 }),
    head: new THREE.MeshPhysicalMaterial({ color: 0x6a6e74, metalness: 0.9, roughness: 0.42, transparent: true, opacity: 1 }),
    red: new THREE.MeshPhysicalMaterial({ color: 0xb30d1f, metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 1 }),
    carbon: new THREE.MeshPhysicalMaterial({ map: carbonTexture(), color: 0xffffff, metalness: 0.4, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 1 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x0e0f11, metalness: 0.3, roughness: 0.5, clearcoat: 0.6, transparent: true, opacity: 1 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xf2efe8, metalness: 0, roughness: 0.25 }),
    valveI: new THREE.MeshPhysicalMaterial({ color: 0xbfc6cf, metalness: 1, roughness: 0.2 }),
    valveE: new THREE.MeshPhysicalMaterial({ color: 0xc8a27a, metalness: 1, roughness: 0.25 }),
    spring: new THREE.MeshStandardMaterial({ color: 0x9fd23a, metalness: 0.6, roughness: 0.35 }),
    exhaust: new THREE.MeshPhysicalMaterial({ map: heatTintTexture(), emissiveMap: heatGlowTexture(), emissive: 0xff5a14, emissiveIntensity: 0, metalness: 1, roughness: 0.28, clearcoat: 0.4 }),
    badge: new THREE.MeshPhysicalMaterial({ map: badgeTexture(), transparent: true, metalness: 1, roughness: 0.2, depthWrite: false }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xc9a050, metalness: 1, roughness: 0.25 }),
  };
  M.carbon.map.repeat.set(6, 1.5);
  const X = {
    block: xrayMaterial(0x36d6ff), head: xrayMaterial(0x36d6ff), red: xrayMaterial(0xff3a3a), carbon: xrayMaterial(0x6aa8ff), liner: xrayMaterial(0x7fe8ff),
  };
  const shellPairs = []; // [solidMesh, xrayMesh]
  function shell(geo, solidMat, xrayMat, parent = root) {
    const s = new THREE.Mesh(geo, solidMat); s.castShadow = true; s.receiveShadow = true; parent.add(s);
    const x = new THREE.Mesh(geo, xrayMat); x.visible = false; x.renderOrder = 5; parent.add(x);
    shellPairs.push([s, x]); return s;
  }

  // ---- crankshaft ----
  const crank = new THREE.Group(); root.add(crank);
  const pinX = i => (i - 2.5) * pitch;
  const cylX = (i, b) => pinX(i) + (b === 0 ? -off / 2 : off / 2);
  const pinLen = off + 2.6;
  const webT = 1.5;
  const crankParts = [];
  for (let i = 0; i < 6; i++) {
    const ph = PIN_PHASE[i] * D2R;
    const pin = alongX(cyl(2.2, 2.2, pinLen, 32)); pin.translate(pinX(i), r, 0); pin.rotateX(ph); crankParts.push(pin.toNonIndexed());
    for (const sgn of [-1, 1]) {
      const w = webGeometry(r, webT); w.translate(pinX(i) + sgn * (pinLen / 2 + webT / 2), 0, 0); w.rotateX(ph); crankParts.push(w.toNonIndexed());
    }
  }
  for (let i = 0; i <= 6; i++) {
    const x0 = i === 0 ? pinX(0) - pinLen / 2 - webT - 3.5 : pinX(i - 1) + pinLen / 2 + webT;
    const x1 = i === 6 ? pinX(5) + pinLen / 2 + webT + 3.0 : pinX(i) - pinLen / 2 - webT;
    const j = alongX(cyl(2.9, 2.9, x1 - x0, 32)); j.translate((x0 + x1) / 2, 0, 0); crankParts.push(j.toNonIndexed());
  }
  const crankMesh = new THREE.Mesh(mergeGeometries(crankParts), M.steel); crankMesh.castShadow = true; crank.add(crankMesh);
  // front damper / pulley
  const front = pinX(0) - pinLen / 2 - webT - 3.5;
  const pul = alongX(cyl(6.2, 6.2, 2.4, 64)); pul.translate(front - 3.2, 0, 0);
  const pul2 = alongX(cyl(4.2, 4.2, 2.6, 48)); pul2.translate(front - 3.2, 0, 0);
  const pulley = new THREE.Mesh(mergeGeometries([pul, pul2]), M.darkSteel); crank.add(pulley);
  const pulGroove = new THREE.Mesh(alongX(cyl(6.3, 6.3, 0.5, 64)).translate(front - 3.2, 0, 0), M.gold); crank.add(pulGroove);
  // flywheel with drilled holes + ring gear
  const rear = pinX(5) + pinLen / 2 + webT + 4.2;
  const fwG = alongX(cyl(13, 13, 1.6, 96)); fwG.translate(rear + 1.0, 0, 0);
  const fw = new THREE.Mesh(fwG, M.steel); fw.castShadow = true; crank.add(fw);
  const teeth = []; for (let k = 0; k < 120; k++) { const b = new THREE.BoxGeometry(1.4, 0.55, 0.5); b.translate(rear + 1.0, 13.2, 0); b.rotateX(k / 120 * Math.PI * 2); teeth.push(b); }
  crank.add(new THREE.Mesh(mergeGeometries(teeth), M.darkSteel));
  const holes = []; for (let k = 0; k < 8; k++) { const h = alongX(cyl(1.3, 1.3, 1.7, 20)); h.translate(rear + 1.0, 8.5, 0); h.rotateX(k / 8 * Math.PI * 2); holes.push(h); }
  crank.add(new THREE.Mesh(mergeGeometries(holes), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 })));
  const fwRing = new THREE.Mesh(alongX(cyl(6, 6, 1.8, 48)).translate(rear + 1.0, 0, 0), M.gold); crank.add(fwRing);

  // ---- block (V profile extruded along X) ----
  const prof = [];
  const cA = (zp, yp) => { const b = BETA[0]; return [yp * Math.sin(b) + zp * Math.cos(b), yp * Math.cos(b) - zp * Math.sin(b)]; }; // returns (z,y)
  const W = 6.5;
  const pA_in = cA(W, deck), pA_out = cA(-W, deck);
  // outer face line A at z=-12.5
  const oa = cA(-W, deck), ob = cA(-W, 7);
  const fz = (-12.5 - oa[0]) / (ob[0] - oa[0]); const yOut = oa[1] + (ob[1] - oa[1]) * fz;
  const vy = (function () { // intersection of inner face A with z=0
    const b = BETA[0]; const yp = -(W * Math.cos(b)) / Math.sin(b); return yp * Math.cos(b) - W * Math.sin(b);
  })();
  prof.push([0, vy], [pA_in[0], pA_in[1]], [pA_out[0], pA_out[1]], [-12.5, yOut], [-12.5, -5.5], [-13.6, -5.5], [-13.6, -7.2], [-11, -7.4], [-10, -14], [10, -14], [11, -7.4], [13.6, -7.2], [13.6, -5.5], [12.5, -5.5], [12.5, yOut], [-pA_out[0], pA_out[1]], [-pA_in[0], pA_in[1]]);
  const bs = new THREE.Shape(); bs.moveTo(prof[0][0], prof[0][1]); for (let i = 1; i < prof.length; i++) bs.lineTo(prof[i][0], prof[i][1]); bs.closePath();
  const blockLen = 6 * pitch + 6;
  const bg = new THREE.ExtrudeGeometry(bs, { depth: blockLen, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 });
  // shape (x=z, y=y), extrude +Z -> map: rotateY(-90°): (x,y,z)->(-z,y,x)... we want shapeX->worldZ, extrude->worldX
  bg.rotateY(-Math.PI / 2); // shape x -> z, extrude -> -x
  bg.computeBoundingBox(); bg.translate(-(bg.boundingBox.min.x + bg.boundingBox.max.x) / 2, 0, 0);
  shell(bg, M.block, X.block);
  // block ribs (outer side) — decorative
  const ribs = [];
  for (let i = 0; i < 7; i++) for (const b of [0, 1]) {
    const g = new THREE.BoxGeometry(0.9, 12, 0.9); g.translate(pinX(0) - pitch / 2 + i * pitch, 15, -SIN[b] * (W + 0.4)); g.rotateX(BETA[b]);
    ribs.push(g);
  }
  shell(mergeGeometries(ribs), M.block, X.block);

  // ---- per-bank parts ----
  const banks = [];
  const cylinders = [];
  const pistonGeo = pistonGeometry(), ringGeo = ringGeometry(), rodGeo = rodGeometry(L), valveGeo = valveGeometry(), springGeo = springGeometry(), lobeGeo = lobeGeometry();
  const bucketGeo = cyl(0.78, 0.78, 0.8, 20); bucketGeo.translate(0, 5.95, 0);
  const gasGeo = cyl(SPEC.bore / 2 - 0.12, SPEC.bore / 2 - 0.12, 1, 40, false); gasGeo.translate(0, 0.5, 0);
  const linerGeo = cyl(SPEC.bore / 2 + 0.05, SPEC.bore / 2 + 0.05, deck - 8.5, 48, true); linerGeo.translate(0, 8.5 + (deck - 8.5) / 2, 0);

  for (let b = 0; b < 2; b++) {
    const beta = BETA[b], sgn = SIN[b];
    const g = new THREE.Group(); g.rotation.x = beta; root.add(g);
    const x0 = cylX(0, b), x5 = cylX(5, b), xm = (x0 + x5) / 2, len = x5 - x0 + pitch;
    // head
    const hg = new THREE.BoxGeometry(len + 1, 7, 15.0, 1, 1, 1); hg.translate(xm, deck + 3.5, 0);
    shell(hg, M.head, X.head, g);
    // cam cover (red) + fins + badge
    const cg = new RoundedBoxGeometry(len, 5.2, 14.4, 4, 1.6); cg.translate(xm, deck + 7 + 2.4, 0);
    shell(cg, M.red, X.red, g);
    const fins = [];
    for (let k = -2; k <= 2; k++) { if (k === 0) continue; const f = new RoundedBoxGeometry(len - 6, 0.5, 0.6, 2, 0.2); f.translate(xm, deck + 7 + 5.05, k * 2.2 + (k > 0 ? 1.4 : -1.4)); fins.push(f); }
    shell(mergeGeometries(fins), M.red, X.red, g);
    // central coil channel (black) with 6 coils
    const ch = new RoundedBoxGeometry(len - 2, 0.8, 4.0, 2, 0.3); ch.translate(xm, deck + 7 + 5.0, 0);
    shell(ch, M.black, X.carbon, g);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), M.badge);
    badge.position.set(x0 - 0.5, deck + 7 + 5.12, sgn * -4.6); badge.rotation.x = -Math.PI / 2; badge.rotation.z = b === 0 ? Math.PI / 2 * 0 : 0;
    if (b === 1) { badge.rotation.z = Math.PI; badge.position.z = sgn * -4.6; }
    g.add(badge);
    // cams
    const camI = new THREE.Group(), camE = new THREE.Group();
    const tilt = SPEC.valveTilt;
    const vClosedI = new THREE.Vector3(0, deck + 0.18, sgn * 2.3);
    const stemI = new THREE.Vector3(0, Math.cos(tilt), sgn * Math.sin(tilt));
    const vClosedE = new THREE.Vector3(0, deck + 0.18, -sgn * 2.3);
    const stemE = new THREE.Vector3(0, Math.cos(tilt), -sgn * Math.sin(tilt));
    const camPosI = vClosedI.clone().addScaledVector(stemI, 7.2);
    const camPosE = vClosedE.clone().addScaledVector(stemE, 7.2);
    camI.position.set(0, camPosI.y, camPosI.z); camE.position.set(0, camPosE.y, camPosE.z);
    g.add(camI, camE);
    for (const cg2 of [camI, camE]) {
      const sh = alongX(cyl(0.95, 0.95, len + 4, 20)); sh.translate(xm, 0, 0);
      const m = new THREE.Mesh(sh, M.steel); cg2.add(m);
    }
    const bank = { group: g, beta, sgn, camI, camE, cyl: [] };
    banks.push(bank);

    for (let i = 0; i < 6; i++) {
      const xc = cylX(i, b);
      const thF = SPEC.bankDeg * (b === 0 ? -1 : 1) + FIRE_OFF[i];
      const C = { bank: b, idx: i, x: xc, beta, sgn, thF, phase: PIN_PHASE[i] * D2R, name: (b === 0 ? 'A' : 'B') + (i + 1) };
      // piston
      const pg = new THREE.Group(); g.add(pg);
      const pm = new THREE.Mesh(pistonGeo, M.alu); pm.castShadow = true; pg.add(pm);
      pg.add(new THREE.Mesh(ringGeo, M.ring));
      pg.position.x = xc; C.piston = pg;
      // rod (in root frame)
      const rod = new THREE.Mesh(rodGeo, M.titanium); rod.castShadow = true; rod.position.x = xc; root.add(rod); C.rod = rod;
      // liner xray
      const liner = new THREE.Mesh(linerGeo, X.liner); liner.position.x = xc; liner.visible = false; liner.renderOrder = 4; g.add(liner); C.liner = liner;
      // gas
      const gm = gasMaterial(); const gas = new THREE.Mesh(gasGeo, gm); gas.position.x = xc; gas.renderOrder = 6; gas.visible = false; g.add(gas); C.gas = gas; C.gasMat = gm;
      // valves
      for (const [kind, vc, st, mat] of [['I', vClosedI, stemI, M.valveI], ['E', vClosedE, stemE, M.valveE]]) {
        for (const dx of [-1.15, 1.15]) {
          const vg = new THREE.Group(); g.add(vg);
          const v = new THREE.Mesh(valveGeo, mat); v.scale.setScalar(0.62); vg.add(v);
          const sp = new THREE.Mesh(springGeo, M.spring); sp.position.y = 1.6; sp.scale.set(0.6, 0.9, 0.6); vg.add(sp); vg.userData.spring = sp;
          const bucket = new THREE.Mesh(bucketGeo, M.steel); vg.add(bucket);
          vg.rotation.x = Math.atan2(st.z, st.y);
          vg.userData.base = new THREE.Vector3(xc + dx, vc.y, vc.z); vg.userData.dir = st.clone();
          vg.position.copy(vg.userData.base);
          (kind === 'I' ? (C.vI ||= []) : (C.vE ||= [])).push(vg);
        }
        // cam lobes
        const camG = kind === 'I' ? camI : camE;
        for (const dx of [-1.15, 1.15]) {
          const lobe = new THREE.Mesh(lobeGeo, M.steel); lobe.scale.set(0.62, 0.62, 0.62);
          lobe.position.set(xc + dx, 0, 0);
          // nose direction must face the valve (= -stem dir) at max lift
          const psiMax = kind === 'I' ? 470 : 250;
          const target = Math.atan2(-st.z, -st.y); // angle in (y,z) measured as rotation.x
          lobe.rotation.x = target + ((thF + psiMax) / 2) * D2R; // cam rot.x = -theta/2
          camG.add(lobe);
        }
      }
      // spark plug + coil
      const plug = new THREE.Group();
      const cer = cyl(0.55, 0.55, 4, 16); cer.translate(0, deck + 3.8, 0);
      const hex = cyl(0.9, 0.9, 1.1, 6); hex.translate(0, deck + 1.2, 0);
      const tip = cyl(0.25, 0.25, 0.8, 8); tip.translate(0, deck + 0.1, 0);
      plug.add(new THREE.Mesh(cer, M.ceramic), new THREE.Mesh(hex, M.steel), new THREE.Mesh(tip, M.steel));
      const coil = new RoundedBoxGeometry(2.6, 3.2, 2.6, 2, 0.4); coil.translate(0, deck + 7 + 6.4, 0);
      const coilM = new THREE.Mesh(coil, M.black); coilM.castShadow = true; plug.add(coilM);
      plug.position.x = xc; g.add(plug); C.plug = plug;
      // spark sprite
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      spark.position.set(xc, deck - 0.4, 0); spark.visible = false; g.add(spark); C.spark = spark;
      // port positions (bank local)
      C.intakePort = new THREE.Vector3(xc, deck + 3.6, sgn * 7.6);
      C.exhaustPort = new THREE.Vector3(xc, deck + 2.4, -sgn * 7.6);
      bank.cyl.push(C); cylinders.push(C);
    }
  }

  // ---- intake plenum + runners ----
  const xs = cylinders.map(c => c.x); const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const plenumY = 40.5;
  const pl = new RoundedBoxGeometry(xmax - xmin + 12, 6.5, 15, 6, 3); pl.translate((xmin + xmax) / 2, plenumY + 3, 0);
  shell(pl, M.carbon, X.carbon);
  // twin throttle bodies at front
  const tbs = [];
  for (const z of [-3.6, 3.6]) { const t = alongX(cyl(3.1, 3.1, 7, 40)); t.translate(xmin - 9.5, plenumY + 3.2, z); tbs.push(t); const lip = alongX(cyl(3.6, 3.6, 0.8, 40)); lip.translate(xmin - 13, plenumY + 3.2, z); tbs.push(lip); }
  const tbMesh = shell(mergeGeometries(tbs), M.darkSteel, X.carbon);
  void tbMesh;
  const runners = []; const runnerCurves = [];
  for (const C of cylinders) {
    const b = C.bank, beta = C.beta;
    const p0 = bankToWorld(beta, C.x, C.intakePort.y, C.intakePort.z);
    const p1 = bankToWorld(beta, C.x, C.intakePort.y + 2.0, C.intakePort.z + C.sgn * 2.5);
    const p2 = new THREE.Vector3(C.x, plenumY - 3, (b === 0 ? -1 : 1) * 4.2);
    const p3 = new THREE.Vector3(C.x, plenumY + 0.8, (b === 0 ? -1 : 1) * 2.2);
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]); runnerCurves.push(curve); C.runnerCurve = curve;
    runners.push(new THREE.TubeGeometry(curve, 24, 1.55, 16, false));
  }
  shell(mergeGeometries(runners), M.carbon, X.carbon);

  // ---- exhaust headers ----
  const headers = []; const tips = [];
  for (let b = 0; b < 2; b++) {
    const zs = b === 0 ? -1 : 1;
    const coll = new THREE.Vector3(48, -1.5, zs * 19.5);
    for (const C of banks[b].cyl) {
      const p0 = bankToWorld(C.beta, C.x, C.exhaustPort.y, C.exhaustPort.z);
      const p1 = bankToWorld(C.beta, C.x, C.exhaustPort.y - 0.5, C.exhaustPort.z - C.sgn * 3.0);
      const p2 = new THREE.Vector3(C.x + 2, 7 - C.idx * 0.6, zs * (25.5 - C.idx * 0.25));
      const p3 = new THREE.Vector3(Math.min(C.x + 16, 40), 1.5 - C.idx * 0.35, zs * (23.5 - C.idx * 0.3));
      const p4 = coll.clone().add(new THREE.Vector3(-4, (C.idx % 3 - 1) * 1.1, ((C.idx >> 1) % 2 ? 1 : -1) * 0.9));
      const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4]); C.headerCurve = curve;
      const tg = new THREE.TubeGeometry(curve, 60, 1.35, 14, false);
      headers.push(tg);
    }
    const collCurve = new THREE.CatmullRomCurve3([coll.clone().add(new THREE.Vector3(-5, 0, 0)), coll, new THREE.Vector3(62, -3.5, zs * 17.5), new THREE.Vector3(74, -4.5, zs * 16.5)]);
    const cg = new THREE.TubeGeometry(collCurve, 40, 2.7, 24, false); headers.push(cg);
    const tipG = alongX(cyl(3.3, 3.0, 4.5, 32, true)); tipG.translate(75.5, -4.6, zs * 16.4); headers.push(tipG);
    tips.push(new THREE.Vector3(78, -4.6, zs * 16.4));
    banks[b].collector = collCurve;
  }
  const exMesh = new THREE.Mesh(mergeGeometries(headers.map(g => g.index ? g.toNonIndexed() : g)), M.exhaust); exMesh.castShadow = true; root.add(exMesh);
  // flames
  const flames = tips.map((p, k) => {
    const fg = new THREE.Group(); fg.position.copy(p); root.add(fg);
    const meshes = [];
    for (let j = 0; j < 3; j++) {
      const geo = new THREE.ConeGeometry(2.6 - j * 0.5, 14 - j * 3, 24, 1, true); geo.rotateZ(-Math.PI / 2); geo.translate((14 - j * 3) / 2, 0, 0);
      // uv.y along length: cone uv v runs 0..1 base..tip already (after rotation it's along +x)
      const m = new THREE.Mesh(geo, flameMaterial()); m.rotation.x = j * 1.1; fg.add(m); meshes.push(m);
    }
    fg.visible = false; return { group: fg, meshes, z: k };
  });

  // ---- mounts ----
  const mountG = []; for (const x of [-25, 25]) for (const z of [-12, 12]) { const m = cyl(1.6, 2.2, 3, 16); m.translate(x, -15.5, z); mountG.push(m); }
  const mounts = new THREE.Mesh(mergeGeometries(mountG), M.darkSteel); root.add(mounts);

  // ---- combustion lights ----
  const fireLights = [0, 1].map(() => { const l = new THREE.PointLight(0xff7a2a, 0, 70, 1.0); root.add(l); return l; });

  // ---- focus particles ----
  const PN = 1400;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 2000 }, uAlpha: { value: 0 } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale;
      void main(){ vC=color; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*uScale/(-mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; uniform float uAlpha; void main(){ vec2 d=gl_PointCoord-.5; float r=dot(d,d); if(r>.25) discard; float a = smoothstep(.25,0.,r); gl_FragColor=vec4(vC*a*uAlpha, a*uAlpha); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 8; root.add(points);
  const pSeed = []; for (let i = 0; i < PN; i++) pSeed.push({ q: rand(), rho: Math.sqrt(rand()), ang: rand() * Math.PI * 2, h: rand(), j: rand(), fuel: rand() < 0.22, s: 0.6 + rand() * 0.9 });

  return {
    root, crank, banks, cylinders, M, X, shellPairs, flames, fireLights, points, pMat, pSeed, pPos, pCol, pSize, PN, tips,
    BETA, pinX, cylX, plenumY,
  };
}

// ======================================================================
// kinematics
export function cylPhase(C, thetaDeg) { return mod(thetaDeg - C.thF, 720); }
export function pistonS(C, thetaDeg) {
  const { r, L } = SPEC;
  const a = thetaDeg * D2R + C.phase - C.beta; // pin angle relative to cylinder axis
  const pu = r * Math.cos(a), pw = r * Math.sin(a);
  return pu + Math.sqrt(L * L - pw * pw);
}
function bump(psi, open, dur) {
  const x = mod(psi - open, 720); if (x > dur) return 0; const s = Math.sin(Math.PI * x / dur); return s * s;
}
export function valveLift(psi) {
  return { i: bump(psi, 345, 250) * SPEC.lift, e: bump(psi, 125, 250) * SPEC.lift };
}

// gas state colour/intensity per cylinder phase
const cIn = new THREE.Color(0x2fc8ff), cComp = new THREE.Color(0xffb02e), cFire = new THREE.Color(0xff6a1a), cEx = new THREE.Color(0x9a3a1a);
export function gasState(psi, out) {
  // returns {color, I, hot}
  if (psi < 150) { const k = psi / 150; out.color.copy(cFire).lerp(cEx, k); out.I = 1.25 - k * 0.6; out.hot = Math.max(0, 1 - psi / 55); }
  else if (psi < 360) { const k = (psi - 150) / 210; out.color.copy(cEx); out.I = 0.65 * (1 - k * 0.85); out.hot = 0; }
  else if (psi < 540) { const k = (psi - 360) / 180; out.color.copy(cIn); out.I = 0.25 + k * 0.5; out.hot = 0; }
  else { const k = (psi - 540) / 180; out.color.copy(cIn).lerp(cComp, k * k); out.I = 0.75 + k * 0.35; out.hot = 0; }
  return out;
}

const _gs = { color: new THREE.Color(), I: 0, hot: 0 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// update all moving parts. opts: {theta, time, xray, dim, gasAll, heat, flame, focus}
export function updateEngine(E, o) {
  const th = o.theta; const D = D2R;
  E.crank.rotation.x = th * D;
  for (const B of E.banks) { B.camI.rotation.x = -th / 2 * D; B.camE.rotation.x = -th / 2 * D; }
  const fire = [null, null];
  for (const C of E.cylinders) {
    const s = pistonS(C, th);
    C.piston.position.y = s;
    // rod: pin pos in root frame
    const a = th * D + C.phase;
    const py = SPEC.r * Math.cos(a), pz = SPEC.r * Math.sin(a);
    const sy = s * Math.cos(C.beta), sz = s * Math.sin(C.beta);
    C.rod.position.set(C.x, py, pz);
    C.rod.rotation.x = Math.atan2(sz - pz, sy - py);
    const psi = cylPhase(C, th);
    const lv = valveLift(psi);
    for (const [vs, l] of [[C.vI, lv.i], [C.vE, lv.e]]) for (const v of vs) {
      v.position.copy(v.userData.base).addScaledVector(v.userData.dir, -l);
      const sp = v.userData.spring; sp.position.y = 1.6 + l; sp.scale.y = (3.8 - l) / 4.2;
    }
    // gas column
    const crown = s + SPEC.pinToCrown;
    const isFocus = o.focus === C.name;
    const show = (o.gasAll > 0.001) || (isFocus && o.gasFocus > 0.001);
    C.gas.visible = show;
    if (show) {
      gasState(psi, _gs);
      const amt = isFocus ? Math.max(o.gasAll, o.gasFocus) : o.gasAll * (1 - o.dim * 0.85);
      C.gas.position.y = crown; C.gas.scale.y = Math.max(0.05, SPEC.deck - crown);
      C.gasMat.uniforms.uColor.value.copy(_gs.color);
      C.gasMat.uniforms.uI.value = _gs.I * amt * (isFocus ? 0.75 : 0.55);
      C.gasMat.uniforms.uHot.value = _gs.hot;
      C.gasMat.uniforms.uTime.value = o.time;
    }
    // spark
    const sp = (psi > 705 || psi < 6) ? 1 : 0;
    C.spark.visible = sp > 0 && (o.xray > 0.3 || isFocus);
    if (C.spark.visible) C.spark.scale.setScalar(0.7 + 0.6 * Math.abs(Math.sin(o.time * 90 + C.idx)));
    // fire tracking for lights
    if (psi < 120) { const k = 1 - psi / 120; const bb = C.bank; if (!fire[bb] || fire[bb].k < k) fire[bb] = { C, k }; }
    C.psi = psi; C.s = s;
    // liners
    C.liner.visible = o.xray > 0.01;
    // dim others
  }
  for (let b = 0; b < 2; b++) {
    const L = E.fireLights[b]; const f = fire[b];
    if (f && (o.xray > 0.2 || o.focus)) {
      const isF = o.focus === f.C.name;
      bankToWorld(f.C.beta, f.C.x, SPEC.deck - 3, 0, L.position);
      const base = o.focus ? (isF ? 1 : 0.15 * (1 - o.dim)) : o.xray;
      L.intensity = f.k * f.k * 260 * base * o.fireLight;
    } else L.intensity = 0;
  }
  // shell crossfade
  const xr = o.xray;
  for (const [s, x] of E.shellPairs) {
    s.visible = xr < 0.999; x.visible = xr > 0.001;
    x.material.uniforms.uOpacity.value = xr * (1 - 0.55 * o.dim); x.material.uniforms.uTime.value = o.time;
  }
  for (const m of [E.M.block, E.M.head, E.M.red, E.M.carbon, E.M.black]) { m.opacity = 1 - xr; m.depthWrite = xr < 0.5; }
  E.X.liner.uniforms.uOpacity.value = xr * 0.8; E.X.liner.uniforms.uTime.value = o.time;
  // dim non-focus moving parts
  for (const C of E.cylinders) {
    const keep = !o.focus || o.dim < 0.01 || C.name === o.focus || (o.focusPair && C.idx === 0);
    const vis = keep || o.dim < 0.95;
    C.piston.visible = vis; C.rod.visible = vis;
    for (const v of C.vI) v.visible = vis; for (const v of C.vE) v.visible = vis;
    C.plug.visible = vis || o.xray < 0.5;
  }
  // exhaust heat
  E.M.exhaust.emissiveIntensity = o.heat * o.heat * 1.05;
  // flames
  for (const f of E.flames) {
    const I = o.flame * (f.z === 0 ? o.flameA : o.flameB);
    f.group.visible = I > 0.01;
    for (const m of f.meshes) { m.material.uniforms.uI.value = I; m.material.uniforms.uTime.value = o.time + f.z * 3.1; }
    f.group.scale.set(0.6 + I * 0.8, 0.8 + I * 0.4, 0.8 + I * 0.4);
  }
}

// particles for the focus cylinder; o: {theta,time,alpha}
export function updateParticles(E, C, o) {
  const N = E.PN, P = E.pPos, Cc = E.pCol, S = E.pSize;
  E.pMat.uniforms.uAlpha.value = o.alpha;
  E.points.visible = o.alpha > 0.001;
  if (!E.points.visible) return;
  const psi = cylPhase(C, o.theta);
  const s = pistonS(C, o.theta); const crown = s + SPEC.pinToCrown; const deck = SPEC.deck;
  const Rr = SPEC.bore / 2 - 0.5;
  const sgn = C.sgn; const beta = C.beta;
  const inV = new THREE.Vector3(C.x, deck - 0.2, sgn * 2.3);
  const exV = new THREE.Vector3(C.x, deck - 0.2, -sgn * 2.3);
  const runner = C.runnerCurve, header = C.headerCurve;
  const cIntake = [0.18, 0.75, 1.0], cFuel = [0.55, 1.0, 0.85];
  const t = o.time;
  for (let i = 0; i < N; i++) {
    const sd = E.pSeed[i];
    // chamber position (bank local)
    const swirl = sd.ang + t * (0.9 + sd.j) + psi * 0.006;
    const hh = sd.h;
    const cx = C.x + Math.cos(swirl) * sd.rho * Rr;
    const cz = Math.sin(swirl) * sd.rho * Rr;
    const cy = crown + 0.15 + hh * Math.max(0.1, deck - crown - 0.3);
    let px, py, pz, col, size = sd.s * 0.32, inWorld = false;
    let r0 = 0, g0 = 0, b0 = 0;
    if (psi >= 345 && psi < 560) {
      // intake: particles arrive through runner -> valve
      const f = Math.min(1, (psi - 345) / 190);
      const arrive = sd.q * 0.8;
      size *= Math.min(1, f * 6);
      if (f < arrive) {
        const u = 1 - (arrive - f) * 3.2;
        if (u < 0) { size = 0; px = py = pz = 0; inWorld = true; }
        else { runner.getPoint(1 - Math.min(1, u * 0.999), _w); _w.x += (sd.j - 0.5) * 2.2; _w.y += (sd.h - 0.5) * 2.2; px = _w.x; py = _w.y; pz = _w.z; inWorld = true; }
      } else {
        const k = Math.min(1, (f - arrive) / 0.12);
        px = THREE.MathUtils.lerp(inV.x, cx, k); py = THREE.MathUtils.lerp(inV.y, cy, k); pz = THREE.MathUtils.lerp(inV.z, cz, k);
      }
      const c = sd.fuel ? cFuel : cIntake; r0 = c[0]; g0 = c[1]; b0 = c[2];
    } else if (psi >= 560 || psi < 2) {
      px = cx; py = cy; pz = cz;
      const k = psi >= 560 ? (psi - 560) / 160 : 1;
      const c = sd.fuel ? cFuel : cIntake;
      r0 = THREE.MathUtils.lerp(c[0], 1.0, k * k); g0 = THREE.MathUtils.lerp(c[1], 0.7, k * k); b0 = THREE.MathUtils.lerp(c[2], 0.25, k * k);
      size *= 1 + k * 0.4;
    } else if (psi < 150) {
      // combustion — flame front from plug
      const front = Math.min(1, psi / 22);
      const d = Math.hypot(cx - C.x, cz, (deck - cy) * 1.3) / (Rr * 1.4);
      px = cx; py = cy; pz = cz;
      if (d < front) { const k = Math.max(0, 1 - psi / 140); r0 = 1.0; g0 = 0.55 + k * 0.4; b0 = 0.15 + k * 0.6 * k; size *= 1.4 + k; r0 *= 1 + k * 1.5; g0 *= 1 + k * 1.2; b0 *= 1 + k; }
      else { r0 = 1.0; g0 = 0.7; b0 = 0.25; }
      const fade = Math.max(0.35, 1 - psi / 200); r0 *= fade; g0 *= fade; b0 *= fade;
    } else {
      // exhaust out via exhaust valve -> header
      const f = (psi - 150) / 195;
      const leave = sd.q * 0.6;
      if (f < leave) { px = cx; py = cy; pz = cz; }
      else {
        const k = (f - leave) * 3.5;
        if (k < 0.25) { const kk = k / 0.25; px = THREE.MathUtils.lerp(cx, exV.x, kk); py = THREE.MathUtils.lerp(cy, exV.y, kk); pz = THREE.MathUtils.lerp(cz, exV.z, kk); }
        else { const u = Math.min(1, (k - 0.25) * 0.9); if (u >= 1) size = 0; header.getPoint(u, _w); _w.x += (sd.j - 0.5) * 2.0; _w.y += (sd.h - 0.5) * 2.0; px = _w.x; py = _w.y; pz = _w.z; inWorld = true; }
      }
      r0 = 1.0; g0 = 0.38; b0 = 0.12; const fade = 0.8 - f * 0.3; r0 *= fade; g0 *= fade; b0 *= fade;
    }
    if (!inWorld) { bankToWorld(beta, px, py, pz, _v); px = _v.x; py = _v.y; pz = _v.z; }
    P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz;
    Cc[i * 3] = r0; Cc[i * 3 + 1] = g0; Cc[i * 3 + 2] = b0; S[i] = size;
  }
  E.points.geometry.attributes.position.needsUpdate = true;
  E.points.geometry.attributes.color.needsUpdate = true;
  E.points.geometry.attributes.size.needsUpdate = true;
}
