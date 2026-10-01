import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Shared geometry / material caches + tiny builders. Everything in the scene is assembled from these. */
const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

/** Lathe profile of a limb: rounded top (radius rTop, centre at y 0), straight taper, rounded bottom (radius rBot, centre at y -len). Listed bottom to top. */
function limbProfile(rTop: number, rBot: number, len: number, open = false): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const steps = 6;
  if (open) pts.push(new THREE.Vector2(rBot, -len));
  else for (let i = 0; i <= steps; i++) {
    const t = ((steps - i) / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rBot * Math.cos(t), -len - rBot * Math.sin(t)));
  }
  for (let i = 0; i <= steps; i++) {
    const t = ((steps - i) / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rTop * Math.sin(t), rTop * Math.cos(t)));
  }
  return pts;
}

/** Flat slab w x d (x, z) with rounded corners, h thick, centred on the origin (a rounded desk top). */
function slabGeometry(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  r = Math.min(r, w / 2 - 0.001, d / 2 - 0.001);
  const hw = w / 2;
  const hd = d / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hd - r);
  s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hd);
  s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hd + r);
  s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 8 });
  // (the shape lies in x / y, the extrusion runs along z: lay it down so the thickness is y)
  g.rotateX(Math.PI / 2);
  g.translate(0, h / 2, 0);
  return g;
}

export const G = {
  /** rounded-corner slab (a desk top with rounded ends) */
  slab: (w: number, h: number, d: number, r: number) => cached(`z${w}|${h}|${d}|${r}`, () => slabGeometry(w, h, d, r)),
  /** one smooth tapered limb: a capsule whose two ends may have different radii (top end at y 0, bottom end at y -len) */
  limb: (rTop: number, rBot: number, len: number, seg = 16) => cached(`m${rTop}|${rBot}|${len}|${seg}`, () => new THREE.LatheGeometry(limbProfile(rTop, rBot, len), seg)),
  /** the same shape open at the bottom: a sleeve that is pulled over a limb */
  sleeve: (rTop: number, rBot: number, len: number, seg = 16) => cached(`v${rTop}|${rBot}|${len}|${seg}`, () => new THREE.LatheGeometry(limbProfile(rTop, rBot, len, true), seg)),
  sphere: (r: number, ws = 24, hs = 16) => cached(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  cap: (r: number, ws = 24, hs = 14, theta = Math.PI * 0.5) =>
    cached(`c${r}|${ws}|${hs}|${theta}`, () => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, theta)),
  capsule: (r: number, len: number, cs = 6, rs = 12) => cached(`p${r}|${len}|${cs}|${rs}`, () => new THREE.CapsuleGeometry(r, len, cs, rs)),
  cyl: (rt: number, rb: number, h: number, seg = 20) => cached(`y${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  cone: (r: number, h: number, seg = 16) => cached(`n${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  torus: (r: number, tube: number, arc = Math.PI * 2, rs = 8, ts = 24) =>
    cached(`t${r}|${tube}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc)),
  box: (w: number, h: number, d: number) => cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)),
  // seg 2 = 300 triangles, seg 4 = 972; below r 0.02 the bevel is invisible, so a plain box (12 triangles) does the job
  rbox: (w: number, h: number, d: number, r = 0.04, seg = 2) =>
    cached(`r${w}|${h}|${d}|${r}|${seg}`, () =>
      r < 0.02 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)),
    ),
  plane: (w: number, h: number) => cached(`l${w}|${h}`, () => new THREE.PlaneGeometry(w, h)),
  ico: (r: number, detail = 0) => cached(`i${r}|${detail}`, () => new THREE.IcosahedronGeometry(r, detail)),
  circle: (r: number, seg = 32) => cached(`o${r}|${seg}`, () => new THREE.CircleGeometry(r, seg)),
};

export interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  side?: THREE.Side;
}

export function M(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? 0.7}|${o.metal ?? 0}|${o.emissive ?? ''}|${o.emissiveIntensity ?? 1}|${o.opacity ?? 1}|${o.side ?? 0}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.7,
      metalness: o.metal ?? 0,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: (o.opacity ?? 1) < 1,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
    });
    if (o.emissive) m.emissive = new THREE.Color(o.emissive);
    // (nothing changes these after creation: a baked room may fold their colour into vertex colours, see StaticBake)
    m.userData.fixed = true;
    matCache.set(key, m);
  }
  return m;
}

/** Unlit material – used for glowing screens, blush etc. */
export function MB(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = `basic|${color}|${opacity}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
    m.userData.fixed = true;
    matCache.set(key, m);
  }
  return m;
}

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  o: { s?: [number, number, number]; r?: [number, number, number]; cast?: boolean; receive?: boolean } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.s) m.scale.set(...o.s);
  if (o.r) m.rotation.set(...o.r);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? false;
  return m;
}

export function group(x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

export function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return `#${c.getHexString()}`;
}
