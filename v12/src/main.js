import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildEngine, updateEngine, updateParticles, bankToWorld, SPEC, rng } from './engine.js';
import * as TL from './timeline.js';
import { drawUI, W, H } from './ui.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040507);
scene.fog = new THREE.FogExp2(0x040507, 0.0032);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(34, W / H, 1, 2000);

// ---------------- lights ----------------
const key = new THREE.DirectionalLight(0xfff1e6, 2.6); key.position.set(-60, 120, 60); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 400 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.3;
scene.add(key);
const rimR = new THREE.DirectionalLight(0xff3a24, 1.8); rimR.position.set(120, 40, -110); scene.add(rimR);
const rimC = new THREE.DirectionalLight(0x3ab8ff, 1.8); rimC.position.set(110, 50, 120); scene.add(rimC);
const fill = new THREE.HemisphereLight(0x8090a8, 0x100806, 0.35); scene.add(fill);
const under = new THREE.PointLight(0xff3a1a, 600, 160, 1.5); under.position.set(0, -12, 0); scene.add(under);

// ---------------- stage ----------------
const FLOOR_Y = -17.6;
{
  // backdrop gradient sphere
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; void main(){ float h=vP.y; vec3 c=mix(vec3(0.012,0.014,0.02), vec3(0.0,0.0,0.0), clamp(h*2.0,0.,1.));
      float band = exp(-pow(h*9.0,2.0)); c += band*mix(vec3(0.20,0.02,0.01), vec3(0.0,0.06,0.10), smoothstep(-0.6,0.6,vP.z))*0.6; gl_FragColor=vec4(c,1.); }`,
  }));
  scene.add(sky);
  // floor with grid
  const gc = document.createElement('canvas'); gc.width = gc.height = 512; const gg = gc.getContext('2d');
  gg.fillStyle = '#000'; gg.fillRect(0, 0, 512, 512); gg.strokeStyle = 'rgba(80,190,255,0.55)'; gg.lineWidth = 2; gg.strokeRect(0, 0, 512, 512);
  gg.strokeStyle = 'rgba(80,190,255,0.18)'; gg.lineWidth = 1; for (let i = 64; i < 512; i += 64) { gg.beginPath(); gg.moveTo(i, 0); gg.lineTo(i, 512); gg.moveTo(0, i); gg.lineTo(512, i); gg.stroke(); }
  const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(24, 24); gt.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(700, 96), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.32, metalness: 0.7, emissive: 0xffffff, emissiveMap: gt, emissiveIntensity: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.receiveShadow = true; scene.add(floor);
  // turntable
  const tt = new THREE.Mesh(new THREE.CylinderGeometry(68, 70, 1.2, 128), new THREE.MeshPhysicalMaterial({ color: 0x101114, metalness: 0.9, roughness: 0.25, clearcoat: 1 }));
  tt.position.y = FLOOR_Y + 0.6; tt.receiveShadow = true; scene.add(tt);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(70.2, 0.35, 8, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a14).multiplyScalar(4) }));
  ring.rotation.x = Math.PI / 2; ring.position.y = FLOOR_Y + 1.0; scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(76, 0.15, 6, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30c0ff).multiplyScalar(2.5) }));
  ring2.rotation.x = Math.PI / 2; ring2.position.y = FLOOR_Y + 0.05; scene.add(ring2);
  // neon pillars in the dark
  const neon = (x, z, h, col, k) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, h, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k) })); m.position.set(x, FLOOR_Y + h / 2, z); scene.add(m); };
  for (let i = 0; i < 9; i++) { const a = -0.3 + i * 0.36; neon(Math.cos(a) * 260, -Math.sin(a) * 260 - 40, 160, i % 2 ? 0xff2a14 : 0x30c0ff, 3.0); }
  for (let i = 0; i < 7; i++) { const a = Math.PI + 0.4 + i * 0.32; neon(Math.cos(a) * 280, -Math.sin(a) * 280 + 40, 160, i % 3 ? 0x30c0ff : 0xff2a14, 2.4); }
}
// dust
const dust = (() => {
  const N = 900, r = rng(3), pos = new Float32Array(N * 3), seed = [];
  for (let i = 0; i < N; i++) { seed.push([r() * 400 - 200, r() * 140 - 15, r() * 400 - 200, r()]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffd8c0, size: 0.55, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
  return { update(t) { for (let i = 0; i < N; i++) { const s = seed[i]; pos[i * 3] = s[0] + Math.sin(t * 0.13 + s[3] * 20) * 6; pos[i * 3 + 1] = s[1] + ((t * 1.2 * (0.3 + s[3])) % 30); pos[i * 3 + 2] = s[2] + Math.cos(t * 0.11 + s[3] * 9) * 6; } g.attributes.position.needsUpdate = true; } };
})();

// ---------------- engine ----------------
const E = buildEngine(scene);
const byName = Object.fromEntries(E.cylinders.map(c => [c.name, c]));

// ---------------- post ----------------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c=texture2D(tDiffuse,vUv);
    c.r = (c.r < 1e4) ? c.r : 0.0; c.g = (c.g < 1e4) ? c.g : 0.0; c.b = (c.b < 1e4) ? c.b : 0.0;
    gl_FragColor = vec4(min(max(c.rgb, 0.0), vec3(40.0)), 1.0); }` }));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.8, 0.55, 0.82); composer.addPass(bloom);
const after = new AfterimagePass(0); composer.addPass(after);
composer.addPass(new OutputPass());
const uiCanvas = document.createElement('canvas'); uiCanvas.width = W; uiCanvas.height = H;
const ui = uiCanvas.getContext('2d');
const uiTex = new THREE.CanvasTexture(uiCanvas); uiTex.minFilter = THREE.LinearFilter; uiTex.generateMipmaps = false; uiTex.colorSpace = THREE.NoColorSpace;
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, tUI: { value: uiTex }, uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uGlitch: { value: 0 }, uCA: { value: 0.002 }, uVig: { value: 1 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tUI; uniform float uTime,uFlash,uFade,uGlitch,uCA,uVig; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv=vUv;
      float band=floor(uv.y*28.0); float gk=h(vec2(band, floor(uTime*30.0)));
      if(gk < uGlitch*0.55) uv.x += (h(vec2(band,7.0))-0.5)*0.09*uGlitch;
      vec2 d=uv-0.5; float r2=dot(d,d);
      float ca=uCA*(0.3+r2*3.0)+uGlitch*0.012;
      vec3 col=vec3(texture2D(tDiffuse,uv+d*ca*4.0).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv-d*ca*4.0).b);
      col *= 1.0 - uVig*smoothstep(0.08,0.62,r2)*0.75;
      col += (h(uv*uRes+fract(uTime*7.13)*100.0)-0.5)*0.035;
      col = mix(col, vec3(1.0,0.93,0.86), clamp(uFlash,0.,1.)*0.85);
      vec2 uu = vUv; if(gk < uGlitch*0.55) uu.x += (h(vec2(band,3.0))-0.5)*0.03*uGlitch;
      vec4 u = texture2D(tUI, uu);
      float ur = texture2D(tUI, uu+vec2(uGlitch*0.006,0.)).r;
      u.r = mix(u.r, ur, uGlitch);
      col = mix(col, u.rgb, u.a);
      col *= 1.0-uFade;
      gl_FragColor=vec4(col,1.0);
    }`,
});
composer.addPass(finalPass);
finalPass.uniforms.tUI.value = uiTex;

// ---------------- labels ----------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pistonTop = (n) => () => { const C = byName[n]; return bankToWorld(C.beta, C.x, C.s + SPEC.pinToCrown, 0); };
const LABELS = [
  { t0: 4.6, t1: 9.4, title: '赛车红凸轮轴盖', sub: 'CAM COVERS', anchor: () => bankToWorld(E.BETA[0], -20, 35.2, 4), off: [-120, -110], color: '#ff5a4a' },
  { t0: 5.4, t1: 9.4, title: '碳纤维进气总管', sub: 'CARBON PLENUM', anchor: () => V(5, 47, 0), off: [110, -110] },
  { t0: 6.2, t1: 9.4, title: '钛合金排气头段', sub: 'EXHAUST HEADERS', anchor: () => byName.B3.headerCurve.getPoint(0.45), off: [140, 90], color: '#ffb52e' },
  { t0: 13.8, t1: 19.6, title: '活塞 ×12', sub: 'FORGED PISTONS', anchor: pistonTop('A1'), off: [-150, -60] },
  { t0: 14.4, t1: 19.6, title: '连杆', sub: 'TITANIUM CON-RODS', anchor: () => { const C = byName.A3; return bankToWorld(C.beta, C.x, C.s * 0.55, 0); }, off: [-130, 110] },
  { t0: 15.0, t1: 19.6, title: '曲轴', sub: 'CRANKSHAFT', anchor: () => V(10, 0, 0), off: [150, 150], color: '#ffb52e' },
  { t0: 15.6, t1: 19.6, title: '凸轮轴', sub: 'DOHC CAMSHAFTS', anchor: () => { const B = E.banks[1]; return bankToWorld(B.beta, 8, B.camI.position.y, B.camI.position.z); }, off: [120, -120] },
  { t0: 16.2, t1: 19.6, title: '火花塞', sub: 'SPARK PLUGS', anchor: () => bankToWorld(E.BETA[1], byName.B5.x, SPEC.deck + 4, 0), off: [160, -40] },
  { t0: 20.6, t1: 25.8, title: '进气门 · 打开', sub: 'INTAKE VALVE', anchor: () => { const C = byName.B1; return bankToWorld(C.beta, C.x, SPEC.deck - 0.6, C.sgn * 2.3); }, off: [-190, -150] },
  { t0: 21.2, t1: 25.8, title: '活塞下行 ↓', sub: 'PISTON DOWN', anchor: pistonTop('B1'), off: [200, 40], color: '#ffb52e' },
  { t0: 26.6, t1: 31.8, title: '火花塞', sub: 'SPARK PLUG · 准备点火', anchor: () => bankToWorld(byName.B1.beta, byName.B1.x, SPEC.deck + 0.4, 0), off: [190, -150], color: '#ffb52e' },
  { t0: 32.4, t1: 37.8, title: '活塞被狠狠砸下', sub: 'POWER STROKE', anchor: pistonTop('B1'), off: [-220, 60], color: '#ff5a2a' },
  { t0: 38.6, t1: 43.8, title: '排气门 · 打开', sub: 'EXHAUST VALVE', anchor: () => { const C = byName.B1; return bankToWorld(C.beta, C.x, SPEC.deck - 0.6, -C.sgn * 2.3); }, off: [200, -170], color: '#ff7a2a' },
  { t0: 59.6, t1: 61.9, title: '排气温度 900°C+', sub: 'RED-HOT HEADERS', anchor: () => byName.B4.headerCurve.getPoint(0.35), off: [-190, -120], color: '#ff5a2a' },
];

// ---------------- frame ----------------
const camState = new THREE.Vector3(); const tgtState = new THREE.Vector3(); const proj = new THREE.Vector3();
function project(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * W, y: (1 - (proj.y * 0.5 + 0.5)) * H, vis: proj.z < 1 && proj.z > -1 };
}
function noise1(t, s) { return Math.sin(t * 13.1 + s) * 0.5 + Math.sin(t * 29.7 + s * 2.3) * 0.3 + Math.sin(t * 51.3 + s * 4.1) * 0.2; }

let lastT = -1;
export function renderFrame(t) {
  const P = TL.paramsAt(t);
  const theta = TL.thetaAt(t);
  // camera
  const c = TL.cameraAt(t);
  const sh = TL.shakeAt(t);
  camState.set(...c.pos); tgtState.set(...c.tgt);
  camState.x += noise1(t, 1) * sh * 0.9; camState.y += noise1(t, 2) * sh * 0.9; camState.z += noise1(t, 3) * sh * 0.6;
  camera.position.copy(camState); camera.fov = c.fov; camera.updateProjectionMatrix();
  tgtState.x += noise1(t, 4) * sh * 0.3; tgtState.y += noise1(t, 5) * sh * 0.3;
  camera.lookAt(tgtState);
  // engine vibration
  E.root.position.set(0, Math.sin(theta * Math.PI / 180 * 3) * 0.05 * P.vib * 2, Math.sin(t * 61) * 0.06 * P.vib);
  E.root.rotation.x = Math.sin(t * 47) * 0.004 * P.vib;
  updateEngine(E, {
    theta, time: t, xray: P.xray, dim: P.dim, gasAll: P.gasAll, gasFocus: P.gasFocus, focus: P.focus, particles: P.particles,
    heat: P.heat + TL.flameAt(t, 0) * 0.3, flame: 1, flameA: TL.flameAt(t, 0), flameB: TL.flameAt(t, 1), fireLight: 1,
  });
  updateParticles(E, byName.B1, { theta, time: t, alpha: P.particles });
  dust.update(t);
  under.intensity = 40 + 700 * P.heat * P.heat;
  renderer.toneMappingExposure = P.exposure;
  bloom.strength = P.bloom; bloom.radius = 0.55; bloom.threshold = 0.82;
  after.uniforms.damp.value = P.after;
  if (Math.abs(t - lastT) > 0.1) after.uniforms.damp.value = 0; // no trails across seeks
  lastT = t;
  const fl = TL.flashAt(t);
  finalPass.uniforms.uTime.value = t; finalPass.uniforms.uFlash.value = fl; finalPass.uniforms.uFade.value = P.fade;
  finalPass.uniforms.uGlitch.value = TL.glitchAt(t); finalPass.uniforms.uCA.value = 0.0012 + sh * 0.0012;
  // UI state
  camera.updateMatrixWorld();
  const S = {
    rpm: TL.rpmAt(t), slowmo: TL.slowmoLabel(t), focusPsi: byName.B1.psi,
    cyl: E.cylinders.map(C => ({ name: C.name, bank: C.bank, idx: C.idx, psi: C.psi })),
    labels: LABELS.filter(L => t > L.t0 - 0.01 && t < L.t1 + 0.3).map(L => ({ ...L, p: project(L.anchor()) })),
  };
  if (t > 9.5 && t < 12.6) {
    const ca = V(-36, 0, 0);
    S.vAngle = { c: project(ca), pa: project(bankToWorld(E.BETA[0], -36, 34, 0)), pb: project(bankToWorld(E.BETA[1], -36, 34, 0)) };
  }
  if (t > 44 && t < 54.5) {
    S.badges = E.cylinders.map(C => ({ name: C.name, p: project(bankToWorld(C.beta, C.x, SPEC.deck + 16, 0)), glow: C.psi < 50 ? 1 - C.psi / 50 : 0 }));
  }
  drawUI(ui, t, S);
  uiTex.needsUpdate = true;
  composer.render();
}

// ---------------- harness ----------------
window.renderFrame = renderFrame;
window.__ = { renderer, composer, rt, bloom, after, key, scene, E, finalPass, ui, uiTex, camera };
window.TL = TL;
const gl = renderer.getContext();
const buf = new Uint8Array(W * H * 4);
window.renderAndSend = async (t, idx) => {
  renderFrame(t);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  await fetch('/frame?i=' + idx, { method: 'POST', body: buf });
};
window.still = (t) => { renderFrame(t); return canvas.toDataURL('image/jpeg', 0.92); };
window.exportAudioTimeline = () => {
  const out = { rate: 1000, rpm: [], thr: [], flames: TL.FLAMES, flashes: TL.FLASHES, cuts: TL.CUTS, glitch: TL.GLITCH, dur: TL.DURATION };
  for (let i = 0; i <= TL.DURATION * 1000; i++) { const t = i / 1000; out.rpm.push(Math.round(TL.rpmAt(t))); out.thr.push(+TL.throttleAt(t).toFixed(3)); }
  return out;
};
const q = new URLSearchParams(location.search);
if (q.has('play')) {
  const t0 = performance.now() - (parseFloat(q.get('play')) || 0) * 1000;
  const loop = () => { renderFrame(((performance.now() - t0) / 1000) % TL.DURATION); requestAnimationFrame(loop); };
  loop();
} else if (q.has('t')) renderFrame(parseFloat(q.get('t')));
window.ready = true;
