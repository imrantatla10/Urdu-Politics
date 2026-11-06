import * as THREE from 'three';
import { buildWorld, roadP, roadY, roadTh, frame, groundH, roadCoords, terrainSD, rnd, TEX, ROADW, ROAD } from './world.js';
import { makeCar, makeTruck, makeTractor, makeBike, wheel } from './vehicles.js';

const W = 1080, H = 1920;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, W / H, 0.2, 9000);
const WORLD = buildWorld(scene, renderer);

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sm = k => { k = clamp(k); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
function keys(K, t, smooth = true) { if (t <= K[0][0]) return K[0][1]; for (let i = 0; i < K.length - 1; i++) { const [t0, a] = K[i], [t1, b] = K[i + 1]; if (t <= t1) return lerp(a, b, smooth ? sm((t - t0) / (t1 - t0)) : (t - t0) / (t1 - t0)); } return K[K.length - 1][1]; }

// ---------------------------------------------------------------- actors
const FACT = { bike: makeBike, tractor: makeTractor, truckRed: () => makeTruck(0x8f1d1d, 0xb8b8bc), truckBlue: () => makeTruck(0x1d3f9a, 0xe8e8ea),
  lambo: () => makeCar('lambo'), porsche: () => makeCar('porsche'), bmw: () => makeCar('bmw'), civic: () => makeCar('civic'), police: () => makeCar('police'), traffic: () => makeCar('traffic') };
const DT = 1 / 240;
class Actor {
  constructor(def) {
    Object.assign(this, { dir: 1, d: [[0, 2.1]], v: [[0, 0]], yaw: null, sOff: null, roll: null, hop: null, skid: [], static: false }, def);
    this.obj = FACT[this.type](); this.obj.rotation.order = 'YXZ'; this.obj.visible = false; scene.add(this.obj);
    this.ud = this.obj.userData; this.H = this.ud.size[1]; this.Wd = this.ud.size[0];
    // integrate speed -> distance table
    this.sTab = [0]; let s = 0; for (let i = 1; i <= 16 * 120; i++) { const t = i / 120; s += keys(this.v, t - 1 / 240, false) / 120; this.sTab.push(s); }
  }
  sAt(t) { const x = clamp(t, 0, 16) * 120, i = Math.floor(x), f = x - i; const a = this.sTab[i], b = this.sTab[Math.min(i + 1, this.sTab.length - 1)]; return this.s0 + this.dir * (a + (b - a) * f) + (this.sOff ? keys(this.sOff, t) : 0); }
  kin(t) {
    const s = this.sAt(t), d = keys(this.d, t); const e = 0.02; const dd = (keys(this.d, t + e) - keys(this.d, t - e)) / (2 * e);
    const v = Math.max(0.5, keys(this.v, t, false)); const th = roadTh(s);
    const [x, z] = roadP(s, d); let y = Math.abs(d) < ROADW + 0.3 ? roadY(s) : groundH(x, z);
    if (this.hop) y += keys(this.hop, t);
    let yaw = (this.yawFixed ?? (th + (this.dir < 0 ? Math.PI : 0) - this.dir * Math.atan2(dd, v))) + (this.yaw ? keys(this.yaw, t) : 0);
    const slope = (roadY(s + 1) - roadY(s - 1)) / 2; const pitch = -Math.atan(slope * this.dir);
    let roll = this.roll ? keys(this.roll, t) : 0;
    if (this.type === 'bike') { // lean into turns
      const y1 = this.kinYaw(t - 0.05), y2 = this.kinYaw(t + 0.05); let r = y2 - y1; r = Math.atan2(Math.sin(r), Math.cos(r)) / 0.1; roll += clamp(Math.atan(v * r / 9.8), -0.7, 0.7);
    }
    return { p: new THREE.Vector3(x, y, z), yaw, pitch, roll, s, d, v };
  }
  kinYaw(t) { const s = this.sAt(t), e = 0.02; const dd = (keys(this.d, t + e) - keys(this.d, t - e)) / (2 * e); return roadTh(s) - this.dir * Math.atan2(dd, Math.max(0.5, keys(this.v, t, false))); }
  // ------- crash physics (cached trajectory)
  buildCrash() {
    const c = this.crash; const t0 = c.t; const a = this.kin(t0 - 0.02), b = this.kin(t0);
    const v = b.p.clone().sub(a.p).multiplyScalar(1 / 0.02); const fr = frame(b.s);
    const F = new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw)), R = new THREE.Vector3(-Math.cos(b.yaw), 0, Math.sin(b.yaw));
    if (c.useRoadFrame) { F.copy(fr.F).multiplyScalar(this.dir); R.copy(fr.R).multiplyScalar(this.dir); }
    v.addScaledVector(F, c.imp[0]).addScaledVector(R, c.imp[1]); v.y += c.imp[2];
    const st = { p: b.p.clone(), v, yaw: b.yaw, pitch: b.pitch, roll: b.roll, w: [...c.w] };
    const tr = []; const bounces = []; let air = false; const N = Math.round((16 - t0) / DT);
    for (let i = 0; i <= N; i++) {
      if (i % 4 === 0) tr.push({ p: st.p.clone(), yaw: st.yaw, pitch: st.pitch, roll: st.roll, sp: Math.hypot(st.v.x, st.v.z) });
      st.v.y -= 9.8 * DT;
      const np = st.p.clone().addScaledVector(st.v, DT);
      const cr = Math.cos(st.roll) * Math.cos(st.pitch); const lift = Math.max(0, (this.H / 2) * (1 - cr) + Math.max(0, this.Wd / 2 - this.H / 2) * Math.abs(Math.sin(st.roll)) * 0.8);
      let gh = groundH(np.x, np.z) + lift;
      if (gh - st.p.y > 1.4) { // wall
        const gx = (groundH(np.x + 1, np.z) - groundH(np.x - 1, np.z)) / 2, gz = (groundH(np.x, np.z + 1) - groundH(np.x, np.z - 1)) / 2;
        const u = new THREE.Vector3(gx, 0, gz).normalize(); const vn = st.v.dot(u);
        if (vn > 0) { st.v.addScaledVector(u, -1.5 * vn); st.w[0] += 2 * (rnd(i) - 0.5); bounces.push({ t: t0 + i * DT, p: st.p.clone(), k: Math.min(1, vn / 15) }); }
        np.copy(st.p).addScaledVector(st.v, DT); gh = groundH(np.x, np.z) + lift;
      }
      if (np.y <= gh) {
        np.y = gh;
        if (st.v.y < -2.5) { if (air || st.v.y < -5) bounces.push({ t: t0 + i * DT, p: np.clone(), k: Math.min(1, -st.v.y / 14) });
          st.v.y = -st.v.y * (c.bounce ?? 0.3); st.w[2] += (rnd(i + 7) - 0.5) * st.v.y * 0.5; st.w[1] += (rnd(i + 3) - 0.5) * st.v.y * 0.3; air = true; }
        else { st.v.y = Math.max(0, st.v.y); air = false; }
        const mu = c.mu ?? 1.1; const k = Math.exp(-mu * DT); st.v.x *= k; st.v.z *= k;
        const ka = Math.exp(-2.6 * DT); st.w = st.w.map(x => x * ka);
        const spd = st.v.length();
        if (spd < 4) { const tr2 = Math.round(st.roll / Math.PI) * Math.PI; st.roll += (tr2 - st.roll) * DT * 4; st.pitch += (0 - st.pitch) * DT * 4; }
      } else air = air || (np.y - gh > 0.5);
      st.p.copy(np); st.yaw += st.w[0] * DT; st.pitch += st.w[1] * DT; st.roll += st.w[2] * DT;
    }
    this.trj = tr; this.bounces = bounces;
  }
  phys(t) { if (!this.trj) this.buildCrash(); const x = (t - this.crash.t) * 60, i = Math.floor(x), f = x - i; const a = this.trj[Math.min(i, this.trj.length - 1)], b = this.trj[Math.min(i + 1, this.trj.length - 1)];
    return { p: a.p.clone().lerp(b.p, f), yaw: lerp(a.yaw, b.yaw, f), pitch: lerp(a.pitch, b.pitch, f), roll: lerp(a.roll, b.roll, f), v: lerp(a.sp, b.sp, f), crashed: true }; }
  state(t) { if (this.static) return this.staticState; if (this.crash && t >= this.crash.t) return this.phys(t); return this.kin(t); }
  apply(t) {
    const st = this.state(t); const o = this.obj; o.visible = true;
    o.position.copy(st.p); o.rotation.set(st.pitch, st.yaw, this.ud.lean ? 0 : st.roll);
    if (this.ud.lean) this.ud.lean.rotation.z = st.roll;
    const dist = this.crash && t >= this.crash.t ? this.crash.wheelDist + st.v * 0.2 : Math.abs(this.sAt(t) - this.s0);
    for (const w of this.ud.wheels) if (w.userData.spin) w.userData.spin.rotation.x = dist / w.userData.R;
    if (this.crash && t >= this.crash.t) { this.ud.root.scale.z = this.crash.crumple ?? 0.92; if (this.crash.lose) for (const i of this.crash.lose) this.ud.wheels[i].visible = false; }
    else { this.ud.root.scale.z = 1; for (const w of this.ud.wheels) w.visible = true; }
    if (this.ud.lights) { const ph = Math.floor(t * 7) % 2; const L = this.ud.lights; L.red.emissiveIntensity = ph ? 3 : 0.2; L.blue.emissiveIntensity = ph ? 0.2 : 3; L.gr.material.opacity = ph ? 1 : 0.1; L.gb.material.opacity = ph ? 0.1 : 1; }
    return st;
  }
}

// ---------------------------------------------------------------- debris
const glassM = new THREE.MeshPhysicalMaterial({ color: 0xbfd8e8, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.7 });
class Debris {
  constructor(actor, at, n, opt = {}) {
    this.t0 = at; this.pieces = []; this.actor = actor; this.opt = opt; this.n = n; this.built = false; this.group = new THREE.Group(); scene.add(this.group); this.group.visible = false;
  }
  build() {
    const a = this.actor, st = a.state(this.t0 + 0.001), base = a.state(this.t0 - 0.03); const v0 = st.p.clone().sub(base.p).multiplyScalar(1 / 0.03).multiplyScalar(this.opt.carry ?? 0.5);
    const seed = Math.floor(this.t0 * 1000) + (this.opt.seed || 0);
    for (let i = 0; i < this.n; i++) {
      const r = k => rnd(seed + i * 13 + k); const glass = r(1) < (this.opt.glass ?? 0.4);
      let m;
      if (this.opt.wheels && i < this.opt.wheels) { m = wheel(this.opt.wheelR || 0.34, 0.25); }
      else { const sz = glass ? 0.05 + r(2) * 0.12 : 0.15 + r(2) * 0.55; m = new THREE.Mesh(new THREE.BoxGeometry(sz * (0.5 + r(3)), sz * 0.25 + 0.02, sz * (0.5 + r(4))), glass ? glassM : (r(5) < 0.3 ? new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }) : a.ud.mat || new THREE.MeshStandardMaterial({ color: 0x777777 }))); m.castShadow = true; }
      this.group.add(m);
      const v = v0.clone().add(new THREE.Vector3((r(6) - 0.5) * 14, 2 + r(7) * (this.opt.up ?? 9), (r(8) - 0.5) * 14));
      const p = st.p.clone().add(new THREE.Vector3((r(9) - 0.5) * 1.5, 0.6 + r(10) * 0.6, (r(11) - 0.5) * 1.5)); const w = [(r(12) - 0.5) * 20, (r(13) - 0.5) * 20, (r(14) - 0.5) * 20];
      const tr = []; const rot = [0, 0, 0];
      for (let k = 0; k <= 8 * 240; k++) { if (k % 4 === 0) tr.push([p.x, p.y, p.z, rot[0], rot[1], rot[2]]); v.y -= 9.8 * DT; p.addScaledVector(v, DT); const g = groundH(p.x, p.z) + 0.05;
        if (p.y < g) { p.y = g; if (v.y < -1.5) v.y *= -0.35; else v.y = 0; v.x *= 0.985; v.z *= 0.985; w[0] *= 0.97; w[1] *= 0.97; w[2] *= 0.97; } rot[0] += w[0] * DT; rot[1] += w[1] * DT; rot[2] += w[2] * DT; }
      this.pieces.push({ m, tr });
    }
    this.built = true;
  }
  apply(t) { if (t < this.t0) { this.group.visible = false; return; } if (!this.built) this.build(); this.group.visible = true; const i = Math.min(Math.floor((t - this.t0) * 60), 8 * 60);
    for (const pc of this.pieces) { const q = pc.tr[i]; pc.m.position.set(q[0], q[1], q[2]); pc.m.rotation.set(q[3], q[4], q[5]); } }
  hide() { this.group.visible = false; }
}

// ---------------------------------------------------------------- particles (pure functions of time)
const POOL = []; const NP = 500;
for (let i = 0; i < NP; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.blob, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); POOL.push(s); }
const SKID_N = 900; const skidM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SKID_N); skidM.frustumCulled = false; scene.add(skidM);
const flashLight = new THREE.PointLight(0xff8a30, 0, 60, 1.5); scene.add(flashLight);
function particles(seg, t) {
  const L = []; const push = (p, size, color, op, add = false) => { const dc = p.distanceTo(camera.position); op *= clamp((dc - 2.5) / 7); size = Math.min(size, dc * 0.9); if (op > 0.01 && L.length < NP) L.push({ p, size, color, op, add }); };
  const skids = [];
  for (const a of seg.actors) {
    if (!a.obj.visible) continue;
    // dust when off the tarmac / tyre smoke during skids / dust from crash slides
    for (let k = 0; k < 45; k++) {
      const ts = Math.floor(t / 0.045) * 0.045 - k * 0.045; const age = t - ts; if (ts < 0 || age < 0) continue;
      const st = a.state(ts); const [s, d] = st.crashed ? roadCoords(st.p.x, st.p.z) : [st.s, st.d];
      const crashed = st.crashed; const onGround = !crashed || st.p.y - groundH(st.p.x, st.p.z) < 0.6;
      const skid = a.skid.some(([u, v]) => ts >= u && ts <= v);
      const r = rnd(Math.floor(ts * 1000) + a.id * 7);
      if ((Math.abs(d) > ROADW + 0.2 || crashed) && st.v > 3 && onGround) {
        push(st.p.clone().add(new THREE.Vector3((r - 0.5) * 2, 0.4 + age * 1.6, (rnd(r * 99) - 0.5) * 2)), 1.6 + age * 4.5, 0xc8ab84, 0.6 * (1 - age / 2.0));
      }
      if (skid && age < 1.8) push(st.p.clone().add(new THREE.Vector3((r - 0.5) * 1.6, 0.35 + age * 1.0, (rnd(r * 77) - 0.5) * 1.6)), 1.2 + age * 3.5, 0xe8e8e8, 0.55 * (1 - age / 1.8));
    }
    if (a.skid.length) for (const [u, v] of a.skid) { for (let ts = u; ts <= Math.min(v, t); ts += 0.03) { const s1 = a.state(ts), s2 = a.state(Math.min(ts + 0.03, t)); if (s1.crashed) break;
      for (const sd of [-1, 1]) { const off = new THREE.Vector3(-Math.cos(s1.yaw) * sd * 0.8, 0, Math.sin(s1.yaw) * sd * 0.8); const back = new THREE.Vector3(Math.sin(s1.yaw), 0, Math.cos(s1.yaw)).multiplyScalar(-1.3);
        const p1 = s1.p.clone().add(off).add(back), p2 = s2.p.clone().add(off).add(back); skids.push([p1, p2]); } } }
    // crash bursts
    if (a.crash && t >= a.crash.t) {
      const age = t - a.crash.t; const c = a.crash; const st0 = a.state(c.t + 0.001); const big = c.big ?? 0.6;
      for (let i = 0; i < 70 * big; i++) { const r = k => rnd(i * 11 + k + a.id * 101); const life = 0.35 + r(1) * 0.9; if (age > life) continue;
        const v = new THREE.Vector3((r(2) - 0.5) * 22, 3 + r(3) * 9, (r(4) - 0.5) * 22); const p = st0.p.clone().add(new THREE.Vector3(0, 0.8, 0)).addScaledVector(v, age); p.y -= 4.9 * age * age;
        push(p, 0.25 + r(5) * 0.25, 0xffd27a, 1 - age / life, true); }
      for (let i = 0; i < 26 * big; i++) { const r = k => rnd(i * 17 + k + a.id * 57); const life = 2.5 + r(1) * 2; if (age > life) continue;
        const v = new THREE.Vector3((r(2) - 0.5) * 8, 1 + r(3) * 3, (r(4) - 0.5) * 8); const p = st0.p.clone().add(new THREE.Vector3(0, 0.8, 0)).addScaledVector(v, Math.min(age, 1.2));
        push(p, 1.5 + age * 2.2, c.fire ? 0x5a5550 : 0xb9a689, 0.7 * (1 - age / life)); }
      if (c.fire) { if (age < 0.6) { push(st0.p.clone().add(new THREE.Vector3(0, 1.5, 0)), 4 + age * 18, 0xffa040, 1 - age / 0.6, true); push(st0.p.clone().add(new THREE.Vector3(0, 1.2, 0)), 2 + age * 10, 0xfff0c0, 1 - age / 0.4, true); }
        const st = a.state(t); for (let k = 0; k < 40; k++) { const ts = Math.floor(t / 0.08) * 0.08 - k * 0.08; const ag = t - ts; if (ts < c.t + 0.4 || ag < 0) continue; const r = rnd(Math.floor(ts * 100) + 3);
          push(st.p.clone().add(new THREE.Vector3((r - 0.5) * 1.5 + ag * 0.8, 1 + ag * 2.6, (rnd(r * 9) - 0.5) * 1.5)), 1.5 + ag * 2.2, 0x3a3836, 0.7 * (1 - ag / 3.2));
          if (ag < 0.5) push(st.p.clone().add(new THREE.Vector3((r - 0.5) * 1.2, 0.8 + ag * 2, (rnd(r * 5) - 0.5))), 1.4 - ag, 0xff7a20, 0.9 * (1 - ag / 0.5), true); } }
      // bounce dust
      if (a.bounces) for (const b of a.bounces) { const ag = t - b.t; if (ag < 0 || ag > 2.5) continue; for (let i = 0; i < 10; i++) { const r = k => rnd(i * 7 + k + Math.floor(b.t * 100));
        push(b.p.clone().add(new THREE.Vector3((r(1) - 0.5) * 3 * (1 + ag), 0.5 + ag * 1.5 * r(2), (r(3) - 0.5) * 3 * (1 + ag))), 2 + ag * 3, 0xbfa47c, 0.7 * b.k * (1 - ag / 2.5)); }
        if (ag < 0.25) for (let i = 0; i < 15; i++) { const r = k => rnd(i * 5 + k + Math.floor(b.t * 300)); const v = new THREE.Vector3((r(1) - 0.5) * 16, 2 + r(2) * 6, (r(3) - 0.5) * 16); push(b.p.clone().addScaledVector(v, ag), 0.25, 0xffd080, 1 - ag / 0.25, true); } }
    }
  }
  // flash light for fiery crashes
  flashLight.intensity = 0; for (const a of seg.actors) if (a.crash?.fire && t >= a.crash.t) { const ag = t - a.crash.t; flashLight.position.copy(a.state(t).p).add(new THREE.Vector3(0, 2, 0)); flashLight.intensity = Math.max(0, 2500 * (1 - ag / 0.7)) + 300 * (0.6 + 0.4 * Math.sin(t * 40)) * (ag < 6 ? 1 : 0); }
  let i = 0; for (; i < L.length; i++) { const q = L[i], s = POOL[i]; s.visible = true; s.position.copy(q.p); s.scale.set(q.size, q.size, 1); s.material.color.setHex(q.color); s.material.opacity = q.op; s.material.blending = q.add ? THREE.AdditiveBlending : THREE.NormalBlending; }
  for (; i < NP; i++) POOL[i].visible = false;
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(); let n = 0;
  for (const [p1, p2] of skids) { if (n >= SKID_N) break; const len = p1.distanceTo(p2); if (len < 0.01) continue; P.copy(p1).add(p2).multiplyScalar(0.5); P.y = groundH(P.x, P.z) + 0.035; Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p2.x - p1.x, p2.z - p1.z)); S.set(0.26, 1, len + 0.35); Mx.compose(P, Q, S); skidM.setMatrixAt(n++, Mx); }
  skidM.count = n; skidM.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- segments
let AID = 0;
function A(def) { const a = new Actor(def); a.id = ++AID; if (def.static) { a.staticState = { p: new THREE.Vector3(...def.static.p), yaw: def.static.yaw, pitch: 0, roll: 0, v: 0 }; } return a; }
function rb(s, d, yawRel, crash) { // roadblock police car
  const [x, z] = roadP(s, d); const th = roadTh(s);
  const a = A({ type: 'police', s0: s, d: [[0, d]], v: [[0, 0.0]], yawFixed: th + yawRel, crash });
  return a;
}
const SEGS = [];
function seg(def) { def.actors = def.actors.filter(Boolean); def.debris = def.debris || []; SEGS.push(def); return def; }

// S1 — Honda CBR1000RR-R : overtake, oncoming truck near-miss, chasing police car hits the truck
{
  const bike = A({ type: 'bike', s0: 40, v: [[0, 36]], d: [[0, 2.1], [2.3, 2.1], [2.9, -2.0], [3.85, -2.0], [4.35, 2.1]] });
  const car = A({ type: 'traffic', s0: 105, v: [[0, 18], [5.4, 18], [6.4, 8]], d: [[0, 2.1]] });
  const truck = A({ type: 'truckBlue', s0: 306.4, dir: -1, v: [[0, 20], [5.39, 20], [5.5, 9], [7.2, 0], [9, 0]], d: [[0, 2.1], [5.4, 2.1], [6.6, 2.9]], yaw: [[5.3, 0], [5.6, 0.12], [7, 0.2]] });
  const p1 = A({ type: 'police', s0: 12, v: [[0, 34]], d: [[0, 2.1], [4.55, 2.1], [5.1, -2.0]], crash: { t: 5.39, imp: [-46, 5, 4], w: [6, -1.5, 3.5], crumple: 0.75, big: 1, lose: [0], wheelDist: 180 } });
  const p2 = A({ type: 'police', s0: -6, v: [[0, 34], [5.5, 34], [7.6, 0], [9, 0]], d: [[0, 2.1], [5.6, 2.1], [6.6, 4.4]], skid: [[5.5, 7.5]] });
  const p3 = A({ type: 'police', s0: -24, v: [[0, 34], [5.75, 34], [7.9, 0], [9, 0]], d: [[0, 2.1], [6.0, 2.1], [7.0, 0.6]], skid: [[5.75, 7.8]] });
  // truck is oncoming: lane d for dir=-1 uses road d; oncoming lane = road d -2.1  -> set explicitly
  truck.d = [[0, -2.1], [5.4, -2.1], [6.6, -3.0]];
  seg({ name: 'HONDA CBR1000RR-R', dur: 10.5, actors: [bike, car, truck, p1, p2, p3], subject: bike,
    slow: [[5.25, 6.1, 0.4]],
    shots: [[0, { type: 'chase', a: bike, back: 4.6, up: 1.75, look: 7 }], [4.7, { type: 'fixed', s: 213, d: 5.4, h: 2.3, lookS: 198, lookD: -1.8, lookH: 1.2 }], [6.6, { type: 'chase', a: bike, back: 4.6, up: 1.75, look: 7 }]],
    chance: [[0, 100], [2.7, 90], [3.95, 64], [4.75, 100]], outcome: [6.9, 'SURVIVED'],
    debris: [new Debris(p1, 5.39, 44, { glass: 0.45, up: 8 })], shakes: [[5.39, 1]], whoosh: [4.6],
  });
}
// S2 — Lamborghini Aventador SVJ : police chase, too fast into the bend, off the cliff
{
  const lambo = A({ type: 'lambo', s0: 508, v: [[0, 54], [2.4, 56], [2.5, 56], [3.7, 33]], d: [[0, 2.0], [2.0, 1.2], [3.0, -1.4], [3.75, -4.6]], yaw: [[2.4, 0], [3.1, 0.12], [3.7, 0.2]], skid: [[2.5, 3.75]],
    crash: { t: 3.75, imp: [-12, -5, 3.2], w: [0.7, 0.6, -2.6], crumple: 0.88, big: 0.5, wheelDist: 260, mu: 0.6, bounce: 0.36, lose: [1] } });
  const q1 = A({ type: 'police', s0: 480, v: [[0, 52], [3.2, 52], [5.8, 0], [9, 0]], d: [[0, 2.1], [3.3, 2.1], [5.0, 1.0]], skid: [[3.2, 5.7]] });
  const q2 = A({ type: 'police', s0: 463, v: [[0, 52], [3.4, 52], [6.1, 0], [9, 0]], d: [[0, -1.8], [3.5, -1.8], [5.3, -2.6]], skid: [[3.4, 6.0]] });
  seg({ name: 'LAMBORGHINI AVENTADOR SVJ', dur: 10.5, actors: [lambo, q1, q2], subject: lambo,
    slow: [[3.7, 4.5, 0.4]],
    shots: [[0, { type: 'chase', a: lambo, back: 7.5, up: 2.3, look: 8 }], [3.95, { type: 'hold', a: lambo, rise: 5, push: 0 }]],
    chance: [[0, 100], [2.45, 71], [3.2, 44], [3.8, 19], [6.9, 9], [7.6, 7]], outcome: [7.1, 'CRASHED'],
    debrisBounce: [lambo, 30], shakes: [[3.8, 0.4]],
  });
}
// S3 — BMW M4 Competition : overtakes a truck, oncoming police car, escapes on the cliff edge
{
  const bmw = A({ type: 'bmw', s0: 830, v: [[0, 42], [3, 44]], d: [[0, 2.1], [1.4, 2.1], [2.0, -2.1], [3.45, -2.1], [3.95, -6.1], [4.6, -6.1], [5.1, -2.1], [5.6, -2.1], [6.2, 2.1]], yaw: [[3.4, 0], [3.95, -0.05], [4.6, 0.04], [5.0, 0]] });
  const truck = A({ type: 'truckRed', s0: 900, v: [[0, 20]], d: [[0, 2.1]] });
  const onc = A({ type: 'police', s0: 1118, dir: -1, v: [[0, 25], [4.3, 25], [5.5, 10], [7, 0]], d: [[0, -2.1], [3.7, -2.1], [4.2, -0.9]], skid: [[4.3, 6.8]] });
  seg({ name: 'BMW M4 COMPETITION', dur: 10.5, actors: [bmw, truck, onc], subject: bmw,
    slow: [[3.85, 4.65, 0.35]],
    shots: [[0, { type: 'chase', a: bmw, back: 7.2, up: 2.2, look: 9 }], [3.75, { type: 'chase', a: bmw, back: 6.0, up: 1.5, side: -2.6, look: 10 }], [4.9, { type: 'chase', a: bmw, back: 7.2, up: 2.2, look: 9 }]],
    chance: [[0, 100], [1.9, 83], [3.3, 55], [3.95, 31], [4.9, 74], [6.2, 92]], outcome: [6.7, 'SURVIVED'], whoosh: [4.22], shakes: [[4.0, 0.25]],
  });
}
// S4 — Massey Ferguson 385 : police convoy, last car clips the tractor and flips
{
  const tr = A({ type: 'tractor', s0: 1250, v: [[0, 8.5], [6.15, 8.5], [6.3, 6], [7.6, 0], [9, 0]], d: [[0, 2.0], [1.8, 2.0], [3.0, 5.0]], sOff: [[6.15, 0], [6.45, 2.0]], yaw: [[6.1, 0], [6.4, 0.5], [7.6, 0.38]], roll: [[6.15, 0], [6.3, 0.16], [6.7, 0]], hop: [[6.15, 0], [6.3, 0.35], [6.55, 0]] });
  const ps = []; for (let i = 0; i < 3; i++) ps.push(A({ type: 'police', s0: 1100 - 14 * i, v: [[0, 39]], d: [[0, -1.9]] }));
  const p4 = A({ type: 'police', s0: 1058, v: [[0, 39]], d: [[0, 2.0], [5.1, 2.0], [5.8, 3.9]], crash: { t: 6.15, imp: [-21, -6, 7], w: [1.2, 1.4, 6.5], crumple: 0.85, big: 1, wheelDist: 240, lose: [2] } });
  seg({ name: 'MASSEY FERGUSON 385', dur: 10.5, actors: [tr, ...ps, p4], subject: tr,
    slow: [[6.1, 6.8, 0.35]],
    shots: [[0, { type: 'front', a: tr, ahead: 21, side: 1.2, up: 3.6, lookBack: 9, until: 6.2 }]],
    chance: [[0, 100], [3.6, 88], [5.5, 63], [6.2, 41], [6.9, 88], [7.3, 96]], outcome: [7.2, 'SURVIVED'],
    debris: [new Debris(p4, 6.15, 36, { glass: 0.45, up: 9 })], shakes: [[6.15, 0.8]],
  });
}
// S5 — Honda Civic Type R : blind overtake, head-on with a truck
{
  const civic = A({ type: 'civic', s0: 1420, v: [[0, 37]], d: [[0, 2.1], [1.6, 2.1], [2.2, -2.0]], skid: [[4.35, 4.8]],
    crash: { t: 4.8, imp: [-44, 1.5, 5.5], w: [2.6, -2.8, 1.4], crumple: 0.68, big: 1.4, fire: true, wheelDist: 190, lose: [0, 1], bounce: 0.25 } });
  const tA = A({ type: 'truckRed', s0: 1460, v: [[0, 26], [4.9, 26], [7.6, 0], [9, 0]], d: [[0, 2.1]], skid: [[4.9, 7.4]] });
  const tB = A({ type: 'truckBlue', s0: 1714, dir: -1, v: [[0, 22], [4.8, 22], [5.0, 6], [6.6, 0], [9, 0]], d: [[0, -2.1], [4.8, -2.1], [6.2, -1.2]], yaw: [[4.8, 0], [5.4, -0.14], [6.6, -0.22]] });
  seg({ name: 'HONDA CIVIC TYPE R', dur: 10.5, actors: [civic, tA, tB], subject: civic,
    slow: [[4.6, 5.6, 0.35]],
    shots: [[0, { type: 'chase', a: civic, back: 7.0, up: 2.3, look: 9 }], [4.78, { type: 'fixed', s: 1580, d: -9.5, h: 4.6, lookS: 1600, lookD: -1.5, lookH: 1.0, lookA: civic }]],
    chance: [[0, 100], [2.0, 78], [3.4, 52], [4.2, 23], [4.85, 6], [5.5, 3]], outcome: [5.8, 'CRASHED'],
    debris: [new Debris(civic, 4.8, 60, { glass: 0.5, up: 10, wheels: 2, wheelR: 0.34, carry: 0.15 })], shakes: [[4.8, 1.3]],
  });
}
// S6 — Porsche 911 GT3 RS : chased into a 4-car police roadblock
{
  const por = A({ type: 'porsche', s0: 1720, v: [[0, 50], [4.3, 50], [6.38, 23]], d: [[0, 2.1], [4.6, 1.6], [6.2, 0.3]], yaw: [[4.55, 0], [5.2, 0.35], [6.0, 1.0], [6.4, 1.15]], skid: [[4.3, 6.4]],
    crash: { t: 6.4, imp: [-15, 0, 1.2], w: [2.8, 0, 0.4], crumple: 0.9, big: 0.8, wheelDist: 300, useRoadFrame: true, mu: 1.6 } });
  const c1 = A({ type: 'police', s0: 1690, v: [[0, 49], [4.6, 49], [8.1, 0], [10, 0]], d: [[0, 2.1], [4.6, 2.1], [7.5, 3.4]], skid: [[4.6, 8.0]] });
  const c2 = A({ type: 'police', s0: 1672, v: [[0, 49], [4.8, 49], [8.3, 0], [10, 0]], d: [[0, -1.6], [4.8, -1.6], [7.8, -2.8]], skid: [[4.8, 8.2]] });
  const r0 = rb(2016, -3.0, 0.55), r1 = rb(2014.2, 0.3, Math.PI / 2, { t: 6.4, imp: [0, 0, 2.2], w: [3.2, 0.3, 1.2], crumple: 0.9, big: 0.9, wheelDist: 10, mu: 1.4, extraV: 14 }), r2 = rb(2018, 3.3, -0.6), r3 = rb(2027, -0.5, 0.25);
  seg({ name: 'PORSCHE 911 GT3 RS', dur: 11.5, actors: [por, c1, c2, r0, r1, r2, r3], subject: por,
    slow: [[6.2, 7.0, 0.35]],
    shots: [[0, { type: 'chase', a: por, back: 8.0, up: 2.6, look: 10 }], [5.5, { type: 'fixed', s: 1996, d: 7.2, h: 3.4, lookA: por, lookS: 2011, lookD: 0, lookH: 0.8 }]],
    chance: [[0, 100], [3.6, 81], [4.4, 60], [5.6, 42], [6.45, 35], [7.2, 53]], outcome: [7.6, 'SURVIVED'],
    debris: [new Debris(r1, 6.4, 34, { glass: 0.5, up: 6, carry: 0.2 })], shakes: [[6.4, 0.9]],
  });
}
// police roadblock car: give it the push as an impulse along the road
for (const s of SEGS) for (const a of s.actors) if (a.crash?.extraV) { a.crash.useRoadFrame = true; a.crash.imp[0] += a.crash.extraV; }

// time mapping wall -> sim per segment
let acc = 0;
for (const s of SEGS) {
  s.t0 = acc; acc += s.dur; s.map = [0]; let tau = 0;
  for (let i = 1; i <= Math.ceil(s.dur * 240); i++) { let r = 1; for (const [a, b, k] of s.slow) if (tau >= a && tau < b) r = k; tau += r / 240; s.map.push(tau); }
}
export const TOTAL = acc;
function simTime(s, lt) { const x = clamp(lt, 0, s.dur) * 240, i = Math.floor(x), f = x - i; return lerp(s.map[i], s.map[Math.min(i + 1, s.map.length - 1)], f); }
function rateAt(s, tau) { for (const [a, b, k] of s.slow) if (tau >= a && tau < b) return k; return 1; }
// debris from first big bounce
for (const s of SEGS) if (s.debrisBounce) { const [a, n] = s.debrisBounce; a.buildCrash(); const b = a.bounces.find(b => b.k > 0.35) || a.bounces[0]; if (b) { s.debris.push(new Debris(a, b.t, n, { glass: 0.3, up: 7, carry: 0.3 })); s.shakes.push([b.t, 0.5]); } }

// ---------------------------------------------------------------- camera
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function shotAt(seg, tau) { let sh = seg.shots[0][1], st = 0; for (const [t, s] of seg.shots) if (tau >= t) { sh = s; st = t; } return [sh, st]; }
function chasePose(sh, tau) {
  const st = sh.a.state(tau); let s, d; if (st.crashed) [s, d] = roadCoords(st.p.x, st.p.z); else { s = st.s; d = st.d; }
  const dir = sh.a.dir; const fr = frame(s); const F = fr.F.clone().multiplyScalar(dir), R = fr.R.clone().multiplyScalar(dir);
  const pos = st.p.clone().addScaledVector(F, -sh.back).addScaledVector(R, (sh.side || 0) - (d - 2.1 * dir) * 0.25); pos.y = Math.max(pos.y, roadY(s - sh.back * dir)) + sh.up;
  const look = st.p.clone().addScaledVector(F, sh.look).add(V(0, 0.9, 0)); return { pos, look };
}
function cameraFor(seg, tau) {
  const [sh, st] = shotAt(seg, tau); let pos, look;
  if (sh.type === 'chase') ({ pos, look } = chasePose(sh, tau));
  else if (sh.type === 'hold') { const base = chasePose({ a: sh.a, back: 7, up: 2.3, look: 8 }, st); const k = sm((tau - st) / 3); const tgt = sh.a.state(tau).p;
    pos = base.pos.clone().add(V(0, sh.rise * k, 0)).lerp(tgt, 0.08 * (sh.push || 0) * k); look = base.look.clone().lerp(tgt.clone().add(V(0, 0.6, 0)), sm((tau - st) / 0.5)); }
  else if (sh.type === 'edge') { const [x, z] = roadP(sh.s, sh.d); pos = V(x, roadY(sh.s) + sh.h, z); look = sh.a.state(tau).p.clone().add(V(0, 0.5, 0)); }
  else if (sh.type === 'fixed') { const [x, z] = roadP(sh.s, sh.d); pos = V(x, roadY(sh.s) + sh.h, z); const [lx, lz] = roadP(sh.lookS, sh.lookD); look = V(lx, roadY(sh.lookS) + sh.lookH, lz);
    if (sh.lookA) look.lerp(sh.lookA.state(tau).p.clone().add(V(0, 0.8, 0)), 0.55); }
  else if (sh.type === 'front') { const tt = Math.min(tau, sh.until ?? 99); const s0 = sh.a.sAt(tt); const fr = frame(s0); const [x, z] = roadP(s0 + sh.ahead, sh.side); pos = V(x, roadY(s0 + sh.ahead) + sh.up, z);
    const [lx, lz] = roadP(s0 - sh.lookBack * 0.3, 1.5); look = V(lx, roadY(s0) + 1.2, lz); }
  // shake
  let sk = 0; for (const [t0, k] of seg.shakes || []) { const a = tau - t0; if (a > 0 && a < 1.2) sk = Math.max(sk, k * (1 - a / 1.2)); }
  if (sk > 0) pos.add(V(Math.sin(tau * 61) * 0.35 * sk, Math.sin(tau * 47 + 1) * 0.3 * sk, Math.cos(tau * 53) * 0.35 * sk));
  pos.y = Math.max(pos.y, groundH(pos.x, pos.z) + 1.4);
  // gentle handheld drift
  pos.add(V(Math.sin(tau * 1.3) * 0.05, Math.sin(tau * 1.7) * 0.05, 0));
  camera.position.copy(pos); camera.lookAt(look); camera.fov = sh.fov || 62; camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- HUD
const hud = { chance: document.getElementById('pct'), name: document.getElementById('name'), out: document.getElementById('out'), flash: document.getElementById('flash'), wrap: document.getElementById('pctwrap') };
function chanceAt(seg, tau) { let v = seg.chance[0][1], prev = v, tc = -9; for (const [t, x] of seg.chance) if (tau >= t) { prev = v; v = x; tc = t; } const k = clamp((tau - tc) / 0.35); return { val: Math.round(lerp(prev, v, k)), pop: tc > 0 ? Math.max(0, 1 - (tau - tc) / 0.35) : 0, down: v < prev }; }
function colorFor(v) { return v >= 70 ? '#3dff6e' : v >= 40 ? '#ffd23d' : '#ff3d3d'; }
function drawHud(seg, tau, lt) {
  const c = chanceAt(seg, tau); hud.chance.textContent = c.val + '%'; hud.chance.style.color = colorFor(c.val);
  hud.wrap.style.transform = `scale(${1 + 0.22 * c.pop})`;
  hud.name.textContent = seg.name; hud.name.style.opacity = clamp(lt / 0.3);
  const [ot, txt] = seg.outcome; const k = tau - ot;
  if (k > 0) { hud.out.textContent = txt === 'SURVIVED' ? 'SURVIVED!' : 'CRASHED!'; hud.out.className = txt === 'SURVIVED' ? 'win' : 'lose'; hud.out.style.opacity = 1; const s = k < 0.35 ? 0.3 + 0.9 * Math.sin(k / 0.35 * Math.PI / 2) * 1.1 : 1; hud.out.style.transform = `translateX(-50%) scale(${Math.min(1.12, s)}) rotate(-3deg)`; }
  else hud.out.style.opacity = 0;
  // transition flash at segment starts + final fade
  let f = Math.max(0, 1 - lt / 0.18) * (seg.t0 > 0 ? 0.9 : 0); hud.flash.style.background = '#fff'; hud.flash.style.opacity = f;
  const tEnd = seg.t0 + lt; if (tEnd > TOTAL - 0.7) { hud.flash.style.background = '#000'; hud.flash.style.opacity = clamp((tEnd - (TOTAL - 0.7)) / 0.7); }
}

// ---------------------------------------------------------------- render
let current = null;
export function render(t) {
  let seg = SEGS[SEGS.length - 1]; for (const s of SEGS) if (t >= s.t0 && t < s.t0 + s.dur) { seg = s; break; }
  const lt = t - seg.t0; const tau = simTime(seg, lt);
  if (current !== seg) { for (const s of SEGS) { for (const a of s.actors) a.obj.visible = false; for (const d of s.debris) d.hide(); } current = seg; }
  for (const a of seg.actors) a.apply(tau);
  for (const d of seg.debris) d.apply(tau);
  cameraFor(seg, tau);
  particles(seg, tau);
  const tp = seg.subject.state(tau).p; WORLD.sun.position.copy(tp).addScaledVector(WORLD.sunDir, 150); WORLD.sun.target.position.copy(tp);
  drawHud(seg, tau, lt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- audio export
export function audioData() {
  const out = { total: TOTAL, frames: [], events: [] }; const FR = 120;
  for (const s of SEGS) {
    const evs = [];
    for (const [t, x] of s.chance) if (t > 0) evs.push({ tau: t, type: 'beep', down: true });
    evs.push({ tau: s.outcome[0], type: s.outcome[1] === 'SURVIVED' ? 'win' : 'lose' });
    for (const a of s.actors) { if (a.crash) { evs.push({ tau: a.crash.t, type: a.crash.fire ? 'boom' : 'impact', k: a.crash.big ?? 0.6 }); evs.push({ tau: a.crash.t + 0.02, type: 'glass' }); a.buildCrash(); for (const b of a.bounces) if (b.k > 0.05) evs.push({ tau: b.t, type: 'thud', k: b.k }); }
      for (const [u, v] of a.skid) evs.push({ tau: u, type: 'screech', len: v - u, k: a === s.subject ? 1 : 0.6 }); }
    for (const w of s.whoosh || []) evs.push({ tau: w - 0.3, type: 'whoosh' });
    if (s.t0 > 0) out.events.push({ t: s.t0 - 0.25, type: 'trans' });
    // map sim -> wall
    for (const e of evs) { let i = s.map.findIndex(x => x >= e.tau); if (i < 0) continue; const wt = s.t0 + i / 240; if (wt < s.t0 + s.dur) { const o = { ...e, t: wt, rate: rateAt(s, e.tau) }; if (e.len) { let j = s.map.findIndex(x => x >= e.tau + e.len); o.wlen = ((j < 0 ? s.map.length : j) - i) / 240; } out.events.push(o); } }
    for (let k = 0; k < s.dur * FR; k++) {
      const lt = k / FR, tau = simTime(s, lt); const sub = s.subject.state(tau); cameraFor(s, tau);
      let pol = 999; for (const a of s.actors) if (a.type === 'police') { const st = a.state(tau); pol = Math.min(pol, st.p.distanceTo(camera.position)); }
      out.frames.push({ t: s.t0 + lt, kind: s.subject.type, v: sub.crashed ? 0 : sub.v, crashed: !!sub.crashed, rate: rateAt(s, tau), police: pol, dcam: sub.p.distanceTo(camera.position) });
    }
  }
  return out;
}
window.render = render; window.audioData = audioData; window.TOTAL = TOTAL; window.READY = true;
window.DBG = () => SEGS.map(s => s.actors.filter(a => a.crash).map(a => { a.buildCrash(); const t = a.trj; return { type: a.type, n: a.bounces.length, ks: a.bounces.slice(0, 6).map(b => [b.t.toFixed(2), b.k.toFixed(2)]), p0: t[0].p.toArray().map(x => x.toFixed(1)), p60: t[Math.min(60, t.length - 1)].p.toArray().map(x => x.toFixed(1)), p180: t[Math.min(180, t.length - 1)].p.toArray().map(x => x.toFixed(1)) }; }));
window.DBG2 = () => { const a = SEGS[1].actors[0]; a.trj = null; a.buildCrash(); const o = []; for (let i = 0; i < a.trj.length && i < 300; i += 15) { const q = a.trj[i]; const [s, d] = roadCoords(q.p.x, q.p.z); o.push([(a.crash.t + i / 60).toFixed(2), q.p.y.toFixed(1), groundH(q.p.x, q.p.z).toFixed(1), s.toFixed(0), d.toFixed(1), q.sp.toFixed(1)].join(' ')); } return o; };
