// Mountain road + terrain + sky. All deterministic.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// ---------- noise
function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16); return (h >>> 0) / 4294967295; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function fbm(x, y, o = 4) { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
export function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- road centreline (1 m samples)
const CURVES = [[150, 0], [160, -1 / 160], [100, 0], [170, 1 / 170], [100, 0], [140, -1 / 115], [120, 0], [180, 1 / 150], [150, 0], [150, -1 / 140], [120, 0], [160, 1 / 160], [700, 0]];
export const ROAD = { X: [], Z: [], TH: [], Y: [], L: 0 };
{
  let x = 0, z = 0, th = 0.5; const k = [];
  for (const [len, kap] of CURVES) for (let i = 0; i < len; i++) k.push(kap);
  for (let i = 0; i <= k.length; i++) {
    const y = 0.05 * i + 5 * Math.sin(i / 180);
    ROAD.X.push(x); ROAD.Z.push(z); ROAD.TH.push(th); ROAD.Y.push(y);
    if (i < k.length) { // smooth curvature a bit at transitions
      let kk = 0, n = 0; for (let j = -25; j <= 25; j++) { const q = k[Math.min(k.length - 1, Math.max(0, i + j))]; kk += q; n++; }
      th += kk / n; // negative kappa = right turn (th decreases)
      x += Math.sin(th); z += Math.cos(th);
    }
  }
  ROAD.L = k.length;
}
// NOTE: right vector R = (-cos th, 0, sin th). Positive d = right side = mountain (uphill). Negative d = cliff drop.
export const LANE = 2.1, ROADW = 4.6, SHOULDER = 7.5;
function samp(arr, s) { s = Math.max(0, Math.min(ROAD.L - 0.001, s)); const i = Math.floor(s), f = s - i; return arr[i] + (arr[i + 1] - arr[i]) * f; }
export function roadTh(s) { return samp(ROAD.TH, s); }
export function roadY(s) { return samp(ROAD.Y, s); }
export function roadP(s, d) { const th = roadTh(s); return [samp(ROAD.X, s) - Math.cos(th) * d, samp(ROAD.Z, s) + Math.sin(th) * d]; }
export function frame(s) { const th = roadTh(s); return { th, F: new THREE.Vector3(Math.sin(th), 0, Math.cos(th)), R: new THREE.Vector3(-Math.cos(th), 0, Math.sin(th)) }; }

// world (x,z) -> road coords (s,d). Z is monotonic along s.
export function roadCoords(x, z) {
  const Z = ROAD.Z, X = ROAD.X; let lo = 0, hi = ROAD.L;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Z[m] < z) lo = m; else hi = m; }
  let best = 1e18, bi = lo;
  for (let i = Math.max(0, lo - 300); i <= Math.min(ROAD.L, lo + 300); i += 4) { const dx = x - X[i], dz = z - Z[i]; const q = dx * dx + dz * dz; if (q < best) { best = q; bi = i; } }
  for (let i = Math.max(0, bi - 4); i <= Math.min(ROAD.L, bi + 4); i++) { const dx = x - X[i], dz = z - Z[i]; const q = dx * dx + dz * dz; if (q < best) { best = q; bi = i; } }
  // project onto tangent for sub-metre s
  const th = ROAD.TH[bi]; const dx = x - X[bi], dz = z - Z[bi];
  const ds = dx * Math.sin(th) + dz * Math.cos(th);
  const s = Math.max(0, Math.min(ROAD.L, bi + ds));
  const d = -dx * Math.cos(th) + dz * Math.sin(th);
  return [s, d];
}
// terrain height given road coords
export function terrainSD(s, d, x, z) {
  const base = roadY(s); const ad = Math.abs(d); let prof;
  if (d > 0) { // mountain side
    prof = ad < SHOULDER ? -0.25 : -0.25 + 1.05 * (ad - SHOULDER) * sstep(SHOULDER, SHOULDER + 4, ad) + 0.25 * Math.max(0, ad - 70);
    prof = Math.min(prof, 320);
  } else { // drop side
    prof = ad < SHOULDER ? -0.25 : -0.25 - 1.35 * (ad - SHOULDER) * sstep(SHOULDER, SHOULDER + 3, ad);
    if (ad > 40) prof = -0.25 - 1.35 * (40 - SHOULDER) - 0.55 * (ad - 40);
    prof = Math.max(prof, -260);
  }
  const w = sstep(SHOULDER + 1, SHOULDER + 18, ad);
  const n = fbm(x * 0.018, z * 0.018) * 16 + fbm(x * 0.09, z * 0.09, 3) * 3.5;
  return base + prof + n * w;
}
export function terrainH(x, z) { const [s, d] = roadCoords(x, z); return terrainSD(s, d, x, z); }
// drivable ground (road surface on road)
export function groundH(x, z) { const [s, d] = roadCoords(x, z); if (Math.abs(d) < ROADW + 0.2) return roadY(s); return terrainSD(s, d, x, z); }

// ---------- textures
function roadTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#3b3c3f'; g.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 60000; i++) { const v = 40 + rnd(i) * 40 | 0; g.fillStyle = `rgba(${v},${v},${v + 3},0.5)`; g.fillRect(rnd(i + 1) * 512, rnd(i + 2) * 1024, 2, 2); }
  for (let i = 0; i < 25; i++) { g.fillStyle = 'rgba(20,20,22,0.18)'; g.beginPath(); g.ellipse(rnd(i + 7) * 512, rnd(i + 8) * 1024, 20 + rnd(i) * 60, 40 + rnd(i + 3) * 120, 0, 0, 7); g.fill(); }
  // tyre wear lanes
  g.fillStyle = 'rgba(25,25,28,0.18)'; for (const x of [80, 170, 342, 432]) g.fillRect(x - 18, 0, 36, 1024);
  // edge lines white
  g.fillStyle = '#e9e9e4'; g.fillRect(14, 0, 14, 1024); g.fillRect(512 - 28, 0, 14, 1024);
  // double yellow
  g.fillStyle = '#f2b81c'; g.fillRect(240, 0, 11, 1024); g.fillRect(261, 0, 11, 1024);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function blobTexture(soft = true) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(soft ? 0.45 : 0.2, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}
function cloudTexture(seed) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 40; i++) { const x = 80 + rnd(seed + i) * 350, y = 120 + (rnd(seed + i + 50) - 0.5) * 80 - Math.sin((x - 80) / 350 * Math.PI) * 40, r = 30 + rnd(seed + i + 9) * 60;
    const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const TEX = {};
function fixUp(g) { const n = g.attributes.normal.array; let sy = 0; for (let i = 1; i < n.length; i += 3) sy += n[i]; if (sy < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); } }

export function buildWorld(scene, renderer) {
  TEX.blob = blobTexture(); TEX.spark = blobTexture(false);
  // sky
  const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
  const U = sky.material.uniforms; U.turbidity.value = 2.2; U.rayleigh.value = 2.2; U.mieCoefficient.value = 0.004; U.mieDirectionalG.value = 0.8;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(42), THREE.MathUtils.degToRad(200)); U.sunPosition.value.copy(sun);
  const pm = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); sky2.material.uniforms.sunPosition.value.copy(sun);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = U[k].value;
  envScene.add(sky2); const gnd = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: 0x6b5a45 })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -5; envScene.add(gnd);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  scene.fog = new THREE.Fog(0xb4c8dc, 600, 9500);

  // lights
  const hemi = new THREE.HemisphereLight(0xbcd4f5, 0x5a4630, 0.45); scene.add(hemi);
  const dl = new THREE.DirectionalLight(0xfff0d8, 3.0); dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048);
  const sc = dl.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400; dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.03;
  scene.add(dl); scene.add(dl.target);
  const sunDir = sun.clone().normalize();

  // ---- terrain heightfield
  let minX = 1e9, maxX = -1e9; for (const x of ROAD.X) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const STEP = 5, x0 = minX - 900, x1 = maxX + 900, z0 = -400, z1 = ROAD.Z[ROAD.L] + 600;
  const nx = Math.ceil((x1 - x0) / STEP) + 1, nz = Math.ceil((z1 - z0) / STEP) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), DD = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * STEP, z = z0 + j * STEP; const [s, d] = roadCoords(x, z); const h = terrainSD(s, d, x, z); const k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; DD[k] = d;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = e; }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setIndex(new THREE.BufferAttribute(idx, 1)); tg.computeVertexNormals();
  const nrm = tg.attributes.normal.array; const C = new THREE.Color();
  const rock = new THREE.Color(0x7a5e46), rock2 = new THREE.Color(0x544238), dry = new THREE.Color(0xa88a55), grass = new THREE.Color(0x667a34), forest = new THREE.Color(0x2c4322), gravel = new THREE.Color(0x8d7a60);
  for (let k = 0; k < nx * nz; k++) {
    const ny = nrm[k * 3 + 1], x = pos[k * 3], z = pos[k * 3 + 2], ad = Math.abs(DD[k]);
    const n = fbm(x * 0.05, z * 0.05, 3) * 0.5 + 0.5;
    if (ny < 0.72) C.copy(rock).lerp(rock2, n); else C.copy(dry).lerp(grass, sstep(0.3, 0.8, n));
    if (DD[k] < -45) C.lerp(forest, 0.55 * sstep(0.2, 0.7, fbm(x * 0.01, z * 0.01) * 0.5 + 0.5));
    if (ad < SHOULDER + 0.5) C.copy(gravel).lerp(rock2, n * 0.3);
    const v = 0.9 + 0.2 * fbm(x * 0.3, z * 0.3, 2); col[k * 3] = C.r * v; col[k * 3 + 1] = C.g * v; col[k * 3 + 2] = C.b * v;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.35 }));
  terrain.receiveShadow = true; scene.add(terrain);

  // ---- road ribbon
  const rp = [], ru = [], ri = []; const n = ROAD.L;
  for (let i = 0; i <= n; i += 1) {
    for (const [d, u] of [[-ROADW, 0], [ROADW, 1]]) { const [x, z] = roadP(i, d); rp.push(x, roadY(i) + 0.02, z); ru.push(u, i / 16); }
    if (i < n) { const a = (i) * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2)); rg.setIndex(ri); rg.computeVertexNormals(); fixUp(rg);
  const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.85, metalness: 0.0, envMapIntensity: 0.4 })); road.receiveShadow = true; scene.add(road);
  // road edge lip (dark band) both sides
  for (const sd of [-1, 1]) {
    const p = [], ix = []; for (let i = 0; i <= n; i++) { for (const [d, dy] of [[ROADW, 0.02], [ROADW + 0.5, -0.2]]) { const [x, z] = roadP(i, sd * d); p.push(x, roadY(i) + dy, z); } if (i < n) { const a = i * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals(); fixUp(g);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x5e5446, roughness: 1, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m);
  }

  // ---- rocks + trees (instanced)
  const rockG = new THREE.DodecahedronGeometry(1, 0); const rockM = new THREE.MeshStandardMaterial({ color: 0x8a7663, roughness: 1, flatShading: true });
  const NR = 1400; const rocks = new THREE.InstancedMesh(rockG, rockM, NR); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  let c = 0; for (let i = 0; c < NR && i < 20000; i++) {
    const s = rnd(i * 3 + 1) * ROAD.L; const side = rnd(i * 3 + 2) < 0.6 ? 1 : -1; const d = side * (SHOULDER + 1.5 + Math.pow(rnd(i * 3 + 3), 2) * 90);
    const [x, z] = roadP(s, d); const h = terrainSD(s, d, x, z); const sz = 0.4 + Math.pow(rnd(i + 99), 3) * (Math.abs(d) < 15 ? 1.5 : 4.5);
    P.set(x, h + sz * 0.2, z); E.set(rnd(i + 5) * 6, rnd(i + 6) * 6, rnd(i + 7) * 6); Q.setFromEuler(E); S.set(sz * (0.8 + rnd(i + 8) * 0.8), sz * (0.5 + rnd(i + 9) * 0.5), sz);
    M.compose(P, Q, S); rocks.setMatrixAt(c++, M);
  }
  rocks.count = c; rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
  const trunkG = new THREE.CylinderGeometry(0.15, 0.25, 3, 5); trunkG.translate(0, 1.5, 0);
  const crownG = new THREE.ConeGeometry(1.6, 6.5, 7); crownG.translate(0, 5.5, 0);
  const NT = 3500; const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }), NT);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: 0x2f4a26, roughness: 0.9, flatShading: true }), NT);
  c = 0; for (let i = 0; c < NT && i < 40000; i++) {
    const s = rnd(i * 5 + 11) * ROAD.L; const side = rnd(i * 5 + 12) < 0.75 ? -1 : 1; const d = side * (SHOULDER + 12 + rnd(i * 5 + 13) * 380);
    const [x, z] = roadP(s, d); const h = terrainSD(s, d, x, z); const sl = Math.abs(terrainSD(s, d + 2, x, z) - h) / 2; if (sl > 1.1) continue;
    if (side > 0 && fbm(x * 0.02, z * 0.02) < 0.1) continue;
    const sz = 0.7 + rnd(i + 3) * 0.9; P.set(x, h - 0.3, z); Q.setFromEuler(E.set(0, rnd(i) * 6, 0)); S.set(sz, sz * (0.8 + rnd(i + 4) * 0.5), sz); M.compose(P, Q, S);
    trunks.setMatrixAt(c, M); crowns.setMatrixAt(c, M); C.setHSL(0.27 + rnd(i + 2) * 0.06, 0.35, 0.18 + rnd(i + 1) * 0.1); crowns.setColorAt(c, C); c++;
  }
  trunks.count = crowns.count = c; crowns.castShadow = true; scene.add(trunks, crowns);

  // ---- distant mountain ranges (noise ring)
  const cx = (minX + maxX) / 2, cz = ROAD.Z[ROAD.L] / 2;
  { const NA = 480, rings = [[3300, 0], [3700, 0.45], [4200, 1], [4900, 0.85], [5600, 0.3], [6200, 0]]; const pp = [], cc = [], ii = []; const c1 = new THREE.Color(0x56606e), c2 = new THREE.Color(0xeef3f8);
    for (let r = 0; r < rings.length; r++) for (let k = 0; k <= NA; k++) { const a = k / NA * Math.PI * 2; const [R0, hk] = rings[r];
      const h = -260 + hk * (300 + Math.max(0, fbm(Math.cos(a) * 4 + r * 0.3, Math.sin(a) * 4, 5) + 0.4) * 1300);
      pp.push(cx + Math.cos(a) * R0, h, cz + Math.sin(a) * R0); cc.push(...(h > 950 ? c2 : c1).toArray());
      if (r < rings.length - 1 && k < NA) { const q = r * (NA + 1) + k, q2 = q + NA + 1; ii.push(q, q2, q + 1, q + 1, q2, q2 + 1); } }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); mg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); mg.setIndex(ii); mg.computeVertexNormals(); fixUp(mg);
    const mt = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })); scene.add(mt); }
  // valley floor
  { const vf = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshStandardMaterial({ color: 0x2c3d24, roughness: 1 })); vf.rotation.x = -Math.PI / 2; vf.position.set(cx, -265, cz); scene.add(vf); }
  // ---- clouds
  for (let i = 0; i < 40; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(i * 77), transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    const a = rnd(i + 500) * Math.PI * 2, r = 1500 + rnd(i + 501) * 2500; sp.position.set(cx + Math.cos(a) * r, 380 + rnd(i + 502) * 400, cz + Math.sin(a) * r);
    const w = 700 + rnd(i + 503) * 900; sp.scale.set(w, w * 0.45, 1); scene.add(sp);
  }
  return { sun: dl, sunDir };
}
