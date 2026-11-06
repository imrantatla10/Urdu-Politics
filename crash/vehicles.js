// Procedural vehicle models. Forward = +Z, origin on the ground at the vehicle centre.
import * as THREE from 'three';
import { TEX } from './world.js';

const paint = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.55, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2, ...o });
const M = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1218, metalness: 0.3, roughness: 0.04, envMapIntensity: 1.8, clearcoat: 1 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: 1, roughness: 0.25 }),
  darkRim: new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.9, roughness: 0.35 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.6 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.2 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.4 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.7 }),
};
function box(w, h, l, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat); m.position.set(x, y, z); m.castShadow = true; return m; }
function extrude(profile, W, mat, bevel = 0.07, taper = 0.12) {
  const sh = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: W - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(W - 2 * bevel) / 2); g.rotateY(-Math.PI / 2);
  if (taper) { let y0 = 1e9, y1 = -1e9, z1 = -1e9, z0 = 1e9; const P = g.attributes.position; for (let i = 0; i < P.count; i++) { y0 = Math.min(y0, P.getY(i)); y1 = Math.max(y1, P.getY(i)); z1 = Math.max(z1, P.getZ(i)); z0 = Math.min(z0, P.getZ(i)); }
    const ym = y0 + (y1 - y0) * 0.45; for (let i = 0; i < P.count; i++) { const y = P.getY(i), z = P.getZ(i); let k = Math.max(0, Math.min(1, (y - ym) / (y1 - ym)));
      const nose = Math.max(0, Math.min(1, (z - (z1 - 0.7)) / 0.7)), tail = Math.max(0, Math.min(1, ((z0 + 0.4) - z) / 0.4)); P.setX(i, P.getX(i) * (1 - taper * k * k) * (1 - 0.1 * nose * nose) * (1 - 0.05 * tail)); } }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
export function wheel(R, w, rimMat = M.rim, spokes = 5) {
  const g = new THREE.Group(); const spin = new THREE.Group(); g.add(spin);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(R, R, w, 22), M.tire); t.rotation.z = Math.PI / 2; t.castShadow = true; spin.add(t);
  for (const sd of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.66, R * 0.66, 0.02, 20), rimMat); r.rotation.z = Math.PI / 2; r.position.x = sd * (w / 2 + 0.005); spin.add(r);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.03, 12), M.black); hub.rotation.z = Math.PI / 2; hub.position.x = sd * (w / 2 + 0.012); spin.add(hub);
    for (let i = 0; i < spokes; i++) { const s = box(0.025, R * 0.62, R * 0.12, rimMat); s.position.set(sd * (w / 2 + 0.02), 0, 0); s.geometry = s.geometry.clone(); s.geometry.translate(0, R * 0.3, 0); s.rotation.x = i / spokes * Math.PI * 2; spin.add(s); }
  }
  g.userData.spin = spin; g.userData.R = R; return g;
}
function lightGlow(color, size) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.blob, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.set(size, size, 1); return s; }

const CARS = {
  lambo: { body: [[-2.45, 0.3], [2.35, 0.28], [2.5, 0.42], [2.32, 0.6], [1.0, 0.84], [-1.9, 0.98], [-2.45, 0.86]], cab: [[1.05, 0.82], [0.0, 1.17], [-0.9, 1.15], [-1.95, 0.95]], W: 2.0, cW: 1.36, R: 0.36, ax: [1.48, -1.42], color: 0xff6a00, wing: [-2.2, 1.12, 1.9], rim: 'dark' },
  porsche: { body: [[-2.25, 0.33], [2.2, 0.32], [2.3, 0.52], [1.2, 0.77], [-1.4, 0.9], [-2.25, 0.8]], cab: [[0.95, 0.76], [-0.1, 1.27], [-0.9, 1.24], [-2.05, 0.86]], W: 1.9, cW: 1.3, R: 0.35, ax: [1.25, -1.2], color: 0xf2c200, wing: [-2.05, 1.32, 1.75], rim: 'dark' },
  bmw: { body: [[-2.35, 0.32], [2.28, 0.32], [2.38, 0.62], [1.35, 0.84], [-2.25, 0.92], [-2.38, 0.62]], cab: [[1.0, 0.83], [0.05, 1.33], [-1.2, 1.31], [-2.05, 0.92]], W: 1.9, cW: 1.42, R: 0.35, ax: [1.42, -1.4], color: 0x1d5fd8 },
  civic: { body: [[-2.25, 0.33], [2.22, 0.32], [2.32, 0.6], [1.3, 0.85], [-2.18, 0.98], [-2.3, 0.6]], cab: [[0.95, 0.85], [0.0, 1.4], [-1.55, 1.37], [-2.15, 1.02]], W: 1.85, cW: 1.4, R: 0.34, ax: [1.38, -1.35], color: 0xd0101c, wing: [-2.1, 1.45, 1.6] },
  police: { body: [[-2.4, 0.33], [2.38, 0.33], [2.45, 0.68], [1.4, 0.88], [-2.3, 0.96], [-2.45, 0.68]], cab: [[1.0, 0.88], [0.05, 1.42], [-1.2, 1.42], [-2.0, 0.98]], W: 1.92, cW: 1.45, R: 0.36, ax: [1.45, -1.45], color: 0xf4f6f8, police: true },
  traffic: { body: [[-2.1, 0.33], [2.1, 0.33], [2.2, 0.62], [1.25, 0.84], [-2.05, 0.96], [-2.15, 0.6]], cab: [[0.9, 0.84], [0.0, 1.42], [-1.45, 1.4], [-2.0, 1.0]], W: 1.8, cW: 1.4, R: 0.33, ax: [1.3, -1.3], color: 0x9aa1a8 },
};

export function makeCar(kind, colorOverride) {
  const S = CARS[kind]; const g = new THREE.Group(); const root = new THREE.Group(); g.add(root);
  const mat = paint(colorOverride ?? S.color);
  const body = extrude(S.body, S.W, mat); root.add(body);
  const cab = extrude(S.cab, S.cW, M.glass, 0.05, 0.22); root.add(cab);
  // roof panel (paint) over the glass for sedans
  const roofPts = S.cab.slice(1, 3); const rl = Math.abs(roofPts[0][0] - roofPts[1][0]);
  const roof = box(S.cW - 0.06, 0.05, rl * 0.8, mat, 0, (roofPts[0][1] + roofPts[1][1]) / 2 + 0.03, (roofPts[0][0] + roofPts[1][0]) / 2); root.add(roof);
  // lower black sill + bumpers
  root.add(box(S.W + 0.02, 0.12, 4.0, M.plastic, 0, 0.3, 0));
  const zf = S.body[1][0], zr = S.body[0][0];
  for (const sd of [-1, 1]) {
    const h = box(0.38, 0.09, 0.08, M.head, sd * (S.W / 2 - 0.3), 0.6, zf + 0.06); root.add(h);
    const t = box(0.42, 0.1, 0.06, M.tail, sd * (S.W / 2 - 0.3), 0.72, zr - 0.02); root.add(t);
  }
  root.add(box(S.W - 0.5, 0.035, 0.05, M.tail, 0, 0.74, zr - 0.02)); root.add(box(S.W - 0.2, 0.16, 0.12, M.black, 0, 0.36, zr + 0.02)); root.add(box(0.5, 0.12, 0.03, new THREE.MeshStandardMaterial({ color: 0xf5f5f5 }), 0, 0.52, zr - 0.04));
  for (const sd of [-1, 1]) root.add(box(0.09, 0.07, 0.25, M.black, sd * (S.W / 2 + 0.06), 0.88, 1.1));
  root.add(box(0.7, 0.18, 0.06, M.black, 0, 0.42, zf + 0.12)); // grille
  if (S.wing) { const [z, y, w] = S.wing; root.add(box(w, 0.04, 0.32, M.black, 0, y, z)); for (const sd of [-0.6, 0.6]) root.add(box(0.05, y - 0.85, 0.12, M.black, sd, (y + 0.85) / 2, z)); }
  if (kind === 'lambo') for (const sd of [-1, 1]) root.add(box(0.05, 0.25, 0.7, M.black, sd * (S.W / 2 + 0.01), 0.62, -0.5));
  const ud = { wheels: [], body, mat, root, kind };
  if (S.police) {
    root.add(box(S.W + 0.03, 0.34, 2.4, M.black, 0, 0.5, 0.15)); // black doors band
    root.add(box(S.W + 0.04, 0.1, 0.9, M.black, 0, 0.62, 1.85)); // push bar look on hood front
    root.add(box(1.25, 0.1, 0.32, M.black, 0, 1.47, -0.55));
    const red = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 2 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x1040ff, emissiveIntensity: 2 });
    const lr = box(0.55, 0.12, 0.28, red, -0.3, 1.57, -0.55), lb = box(0.55, 0.12, 0.28, blue, 0.3, 1.57, -0.55); root.add(lr, lb);
    const gr = lightGlow(0xff2020, 2.2), gb = lightGlow(0x2060ff, 2.2); gr.position.set(-0.35, 1.62, -0.55); gb.position.set(0.35, 1.62, -0.55); root.add(gr, gb);
    ud.lights = { red, blue, gr, gb };
  }
  const rimMat = S.rim === 'dark' ? M.darkRim : M.rim;
  for (const z of S.ax) for (const sd of [-1, 1]) { const w = wheel(S.R, 0.26, rimMat); w.position.set(sd * (S.W / 2 - 0.12), S.R, z); g.add(w); ud.wheels.push(w); }
  g.userData = ud; ud.size = [S.W, 1.4, zf - zr]; return g;
}

export function makeTruck(trailerColor, cabColor) {
  const g = new THREE.Group(); const root = new THREE.Group(); g.add(root);
  const cab = paint(cabColor); const tr = new THREE.MeshStandardMaterial({ color: trailerColor, roughness: 0.45, metalness: 0.2 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
  root.add(box(2.6, 3.0, 13.2, tr, 0, 2.75, -2.4));
  root.add(box(2.62, 0.5, 13.22, white, 0, 2.2, -2.4)); root.add(box(2.62, 0.18, 13.22, white, 0, 3.55, -2.4));
  root.add(box(2.6, 0.25, 13.2, M.plastic, 0, 1.15, -2.4));
  root.add(box(2.5, 3.0, 2.3, cab, 0, 2.35, 5.6)); root.add(box(2.3, 1.0, 1.9, cab, 0, 1.55, 7.6));
  root.add(box(2.3, 0.9, 0.08, M.glass, 0, 3.1, 6.77)); root.add(box(1.2, 0.85, 0.08, M.chrome, 0, 1.6, 8.57));
  root.add(box(2.6, 0.3, 0.3, M.chrome, 0, 0.75, 8.6));
  for (const sd of [-1, 1]) { const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), M.chrome); ex.position.set(sd * 1.3, 3.3, 4.55); root.add(ex);
    root.add(box(0.2, 0.15, 0.06, M.head, sd * 0.95, 1.3, 8.6)); root.add(box(0.25, 0.15, 0.05, M.tail, sd * 1.1, 1.1, -9.02)); root.add(box(0.35, 0.6, 0.9, M.chrome, sd * 1.3, 1.0, 4.3)); }
  const ud = { wheels: [], root, kind: 'truck' };
  for (const z of [-8.0, -6.7, 3.4, 4.7, 7.6]) for (const sd of [-1, 1]) { const w = wheel(0.52, 0.5, M.rim, 8); w.position.set(sd * 1.0, 0.52, z); g.add(w); ud.wheels.push(w); }
  g.userData = ud; ud.size = [2.6, 4, 17.6]; return g;
}

export function makeTractor() {
  const g = new THREE.Group(); const root = new THREE.Group(); g.add(root);
  const red = paint(0xc4161c, { metalness: 0.3, roughness: 0.35 }); const grey = new THREE.MeshStandardMaterial({ color: 0x4b4f55, roughness: 0.6, metalness: 0.4 });
  root.add(box(0.9, 0.85, 2.0, red, 0, 1.25, 1.05)); root.add(box(0.92, 0.12, 2.02, M.black, 0, 1.72, 1.05));
  root.add(box(0.8, 0.7, 0.08, M.chrome, 0, 1.2, 2.07)); root.add(box(0.7, 0.5, 2.6, grey, 0, 0.75, 0.2));
  root.add(box(1.1, 0.7, 1.0, grey, 0, 1.05, -0.9));
  for (const sd of [-1, 1]) { const f = box(0.55, 0.08, 1.5, red, sd * 0.88, 1.75, -0.9); root.add(f); root.add(box(0.55, 0.7, 0.08, red, sd * 0.88, 1.42, -0.17));
    root.add(box(0.08, 1.7, 0.08, M.black, sd * 0.7, 2.6, -0.3)); root.add(box(0.08, 1.7, 0.08, M.black, sd * 0.7, 2.6, -1.55)); root.add(box(0.12, 0.1, 0.06, M.head, sd * 0.3, 1.45, 2.1)); }
  root.add(box(1.6, 0.08, 1.5, red, 0, 3.45, -0.92));
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), M.black); ex.position.set(0.3, 2.2, 1.5); root.add(ex);
  root.add(box(0.5, 0.12, 0.5, M.black, 0, 1.55, -1.2)); root.add(box(0.5, 0.6, 0.1, M.black, 0, 1.85, -1.45));
  // driver
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3e5f8a })); torso.position.set(0, 2.0, -1.15); root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), M.skin); head.position.set(0, 2.55, -1.1); root.add(head);
  const hat = box(0.34, 0.1, 0.34, new THREE.MeshStandardMaterial({ color: 0xeeeeee }), 0, 2.69, -1.1); root.add(hat);
  const wh = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 16), M.black); wh.position.set(0, 2.05, -0.5); wh.rotation.x = -0.9; root.add(wh);
  const ud = { wheels: [], root, kind: 'tractor' };
  for (const sd of [-1, 1]) { const r = wheel(0.85, 0.48, new THREE.MeshStandardMaterial({ color: 0xc4161c, roughness: 0.5 }), 6); r.position.set(sd * 0.9, 0.85, -0.9); g.add(r); ud.wheels.push(r);
    const f = wheel(0.45, 0.25, new THREE.MeshStandardMaterial({ color: 0xc4161c, roughness: 0.5 }), 5); f.position.set(sd * 0.68, 0.45, 1.75); g.add(f); ud.wheels.push(f); }
  g.userData = ud; ud.size = [2.2, 3.5, 4.2]; return g;
}

export function makeBike() {
  const g = new THREE.Group(); const lean = new THREE.Group(); g.add(lean); const root = new THREE.Group(); lean.add(root);
  const white = paint(0xf4f4f4), red = paint(0xd2101c), blue = paint(0x1a2f8a);
  const fair = extrude([[-0.95, 0.62], [-0.2, 0.5], [0.55, 0.42], [0.98, 0.62], [0.9, 0.9], [0.55, 1.12], [0.15, 1.02], [-0.45, 0.98], [-0.95, 0.88]], 0.42, white, 0.05); root.add(fair);
  root.add(box(0.44, 0.1, 0.9, red, 0, 0.7, 0.25)); root.add(box(0.44, 0.06, 0.6, blue, 0, 0.8, 0.3));
  root.add(box(0.3, 0.12, 0.55, M.black, 0, 1.0, -0.55)); root.add(box(0.36, 0.22, 0.03, M.glass, 0, 1.12, 0.62));
  root.add(box(0.2, 0.08, 0.06, M.head, 0, 0.88, 0.99)); root.add(box(0.14, 0.05, 0.04, M.tail, 0, 0.92, -0.97));
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 10), M.chrome); ex.rotation.x = 1.3; ex.position.set(0.18, 0.62, -0.65); root.add(ex);
  // rider (tucked)
  const suit = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55 }); const suit2 = new THREE.MeshStandardMaterial({ color: 0xd2101c, roughness: 0.5 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.45, 4, 10), suit); torso.position.set(0, 1.28, -0.12); torso.rotation.x = 1.05; root.add(torso);
  const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.195, 0.2, 4, 10), suit2); stripe.position.set(0, 1.3, -0.1); stripe.rotation.x = 1.05; root.add(stripe);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), paint(0xf4f4f4)); helmet.position.set(0, 1.5, 0.27); root.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.162, 16, 12, -0.9, 1.8, 1.0, 0.9), M.glass); visor.position.copy(helmet.position); root.add(visor);
  for (const sd of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.42, 4, 6), suit); arm.position.set(sd * 0.2, 1.2, 0.35); arm.rotation.x = 1.15; root.add(arm);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.4, 4, 6), suit); thigh.position.set(sd * 0.2, 0.98, -0.35); thigh.rotation.x = 1.4; root.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.38, 4, 6), suit); shin.position.set(sd * 0.22, 0.72, -0.42); shin.rotation.x = -0.6; root.add(shin);
  }
  const ud = { wheels: [], root, lean, kind: 'bike' };
  for (const z of [0.72, -0.72]) { const w = wheel(0.31, 0.19, M.darkRim, 5); w.position.set(0, 0.31, z); lean.add(w); ud.wheels.push(w); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = ud; ud.size = [0.8, 1.7, 2.1]; return g;
}
