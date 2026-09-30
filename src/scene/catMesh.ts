import * as THREE from 'three';
import type { CatLook } from './catModel';

/** Small helpers to loft smooth, skinned tubes (body, legs, tail) and colour them like a real coat. */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ value noise
function hash3(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1440670441);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), sx), l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), sx), sy),
    l(l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), sx), l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), sx), sy),
    sz,
  );
}

// ------------------------------------------------------------------ coat
export type Region = 'body' | 'tail' | 'front' | 'hind';

const WHITE = new THREE.Color('#ffffff');

/** Colour of the fur at a point of the body. `dorsal`: +1 spine … -1 belly, `u`: 0-1 along the tube. */
export function coatAt(look: CatLook, region: Region, p: THREE.Vector3, dorsal: number, u: number): THREE.Color {
  const base = new THREE.Color(look.base);
  const dark = new THREE.Color(look.dark);
  const c = base.clone();
  const bellyMask = smooth(0.1, -0.7, dorsal);
  const n = noise3(p.x * 9, p.y * 9, p.z * 9);
  const limb = region === 'front' || region === 'hind';
  switch (look.pattern) {
    case 'tabby': {
      c.lerp(new THREE.Color(look.base).lerp(WHITE, 0.4), bellyMask * 0.45);
      let stripe: number;
      let mask: number;
      if (region === 'body') {
        stripe = Math.sin(p.z * 60 + n * 3.2);
        mask = smooth(0.3, 0.75, stripe) * smooth(-0.6, 0.1, dorsal);
        c.lerp(dark, smooth(0.78, 1, dorsal) * 0.4);
      } else if (region === 'tail') {
        stripe = Math.sin(u * 44);
        mask = smooth(0.25, 0.7, stripe);
      } else {
        stripe = Math.sin(p.y * 75 + n * 2);
        mask = smooth(0.35, 0.8, stripe) * 0.85;
      }
      c.lerp(dark, mask * 0.9);
      if (region === 'tail' && u > 0.9) c.lerp(dark, 0.9);
      break;
    }
    case 'tuxedo': {
      c.copy(dark);
      let w = 0;
      if (limb) w = smooth(0.09, 0.035, p.y);
      if (region === 'body') w = Math.max(smooth(0.05, 0.17, p.z) * smooth(0.5, -0.35, dorsal), smooth(-0.15, -0.7, dorsal) * 0.9);
      if (region === 'tail') w = smooth(0.86, 0.95, u);
      c.lerp(WHITE, w);
      break;
    }
    case 'calico': {
      c.copy(WHITE);
      const orange = dark;
      const black = new THREE.Color('#2f2c38');
      const n1 = noise3(p.x * 4.2 + 1.3, p.y * 4.2, p.z * 3.6);
      const n2 = noise3(p.x * 3.6 + 9, p.y * 3.6, p.z * 3.1 + 4);
      c.lerp(orange, smooth(0.46, 0.6, n1) * (1 - bellyMask * 0.8));
      c.lerp(black, smooth(0.6, 0.74, n2) * (1 - bellyMask * 0.85));
      if (region === 'tail') c.lerp(orange, smooth(0.15, 0.4, u) * 0.85);
      break;
    }
    case 'siamese': {
      c.lerp(new THREE.Color(look.base).lerp(dark, 0.14), smooth(0.1, 0.9, dorsal) * 0.7);
      let pts = 0;
      if (limb) pts = smooth(0.13, 0.05, p.y);
      if (region === 'tail') pts = smooth(0.1, 0.55, u);
      c.lerp(dark, pts);
      break;
    }
    case 'bicolor': {
      // white cat with a coloured saddle over the back and a coloured tail (white tip and paws)
      c.copy(WHITE);
      let m = 0;
      if (region === 'body') m = smooth(-0.05, 0.5, dorsal) * (0.4 + 0.75 * smooth(0.3, 0.6, noise3(p.x * 3.2 + 2, p.y * 3.2, p.z * 4.2)));
      else if (region === 'tail') m = 1 - smooth(0.86, 0.95, u);
      else if (region === 'hind') m = smooth(0.09, 0.16, p.y) * 0.85;
      c.lerp(dark, clamp01(m));
      break;
    }
    case 'cow': {
      // large black patches on white
      c.copy(WHITE);
      const n1 = noise3(p.x * 4.4 + 5, p.y * 4.4, p.z * 3.8 + 1);
      let m = smooth(0.5, 0.58, n1) * (1 - bellyMask * 0.9);
      if (limb) m *= smooth(0.06, 0.13, p.y);
      if (region === 'tail') m = u > 0.5 ? 1 - smooth(0.9, 0.98, u) : smooth(0.48, 0.58, n1);
      c.lerp(dark, clamp01(m));
      break;
    }
    case 'spotted': {
      c.lerp(new THREE.Color(look.base).lerp(WHITE, 0.45), bellyMask * 0.6);
      const sp = noise3(p.x * 27 + 3, p.y * 27, p.z * 27 + 7);
      const ring = smooth(0.62, 0.7, sp) * (1 - smooth(0.78, 0.86, sp) * 0.45);
      let m = ring * (1 - bellyMask * 0.35);
      if (region === 'tail') m = Math.max(m * 0.7, smooth(0.25, 0.7, Math.sin(u * 40)) * 0.75) * (u > 0.92 ? 1.2 : 1);
      if (limb) m = Math.max(m, smooth(0.4, 0.8, Math.sin(p.y * 80)) * 0.55);
      c.lerp(dark, clamp01(m) * 0.92);
      break;
    }
    case 'tortie': {
      // near-black cat with fine patches of orange
      const n1 = noise3(p.x * 8 + 1, p.y * 8, p.z * 7 + 3);
      const n2 = noise3(p.x * 3 + 6, p.y * 3, p.z * 3);
      c.lerp(dark, smooth(0.42, 0.56, n1 * 0.6 + n2 * 0.4) * 0.95);
      c.lerp(new THREE.Color(look.dark).lerp(WHITE, 0.35), bellyMask * 0.15 * smooth(0.4, 0.6, n1));
      break;
    }
    default: {
      c.lerp(new THREE.Color(look.base).lerp(WHITE, 0.4), bellyMask * 0.5);
      c.multiplyScalar(0.95 + n * 0.1);
    }
  }
  return c;
}

/** Fur colour of the head from a direction on the unit sphere (x right, y up, z front). */
export function headCoat(look: CatLook, d: THREE.Vector3): THREE.Color {
  const base = new THREE.Color(look.base);
  const dark = new THREE.Color(look.dark);
  const c = base.clone();
  const n = noise3(d.x * 6, d.y * 6, d.z * 6);
  const muzzle = smooth(0.35, 0.75, d.z) * smooth(0.25, -0.35, d.y);
  switch (look.pattern) {
    case 'tabby': {
      // forehead "M" and cheek stripes
      // three clean stripes on the forehead and two on each cheek
      let fore = 0;
      for (const cx of [-0.3, 0, 0.3]) fore = Math.max(fore, smooth(0.07, 0.03, Math.abs(d.x - cx)) * smooth(0.28, 0.5, d.y) * smooth(0.05, 0.4, d.z));
      let cheek = 0;
      for (const cy of [-0.08, -0.28]) cheek = Math.max(cheek, smooth(0.09, 0.04, Math.abs(d.y - cy)) * smooth(0.72, 0.9, Math.abs(d.x)));
      c.lerp(dark, Math.max(fore, cheek) * 0.8);
      c.lerp(new THREE.Color(look.base).lerp(WHITE, 0.6), muzzle * 0.7);
      break;
    }
    case 'tuxedo': {
      c.copy(dark);
      const blaze = smooth(0.2, 0.05, Math.abs(d.x)) * smooth(0.1, 0.5, d.z) * smooth(0.5, -0.1, d.y);
      c.lerp(WHITE, Math.max(muzzle, blaze * 0.9));
      break;
    }
    case 'calico': {
      c.copy(WHITE);
      c.lerp(dark, smooth(0.46, 0.62, noise3(d.x * 2.2 + 3, d.y * 2.2, d.z * 2.2)) * (1 - muzzle));
      c.lerp(new THREE.Color('#2f2c38'), smooth(0.62, 0.76, noise3(d.x * 2.6 + 11, d.y * 2.6, d.z * 2.6 + 2)) * (1 - muzzle));
      break;
    }
    case 'siamese': {
      const mask = smooth(0.2, 0.6, d.z) * smooth(0.75, 0.3, Math.abs(d.x)) * smooth(0.6, 0.05, d.y);
      c.lerp(dark, mask * 0.95);
      break;
    }
    case 'bicolor': {
      // a coloured cap over the top and back of the head, the face stays white with a blaze
      c.copy(WHITE);
      const cap = smooth(0.2, 0.55, d.y) * smooth(0.55, -0.1, d.z) + smooth(0.55, 0.85, Math.abs(d.x)) * smooth(0.2, 0.5, d.y) * 0.9;
      const blaze = smooth(0.13, 0.05, Math.abs(d.x)) * smooth(0.1, 0.5, d.z);
      c.lerp(dark, clamp01(cap) * (1 - blaze * 0.9));
      break;
    }
    case 'cow': {
      c.copy(WHITE);
      // one dark patch around an eye, another over an ear and the back of the head
      const eyePatch = smooth(0.42, 0.22, Math.hypot(d.x + 0.4, d.y - 0.1, d.z - 0.85));
      const back = smooth(0.15, 0.55, d.y) * smooth(0.3, -0.3, d.z) * smooth(-0.1, 0.6, d.x + 0.2);
      c.lerp(dark, clamp01(Math.max(eyePatch, back)));
      break;
    }
    case 'spotted': {
      const sp = noise3(d.x * 11 + 4, d.y * 11, d.z * 11 + 8);
      let fore = 0;
      for (const cx of [-0.22, 0, 0.22]) fore = Math.max(fore, smooth(0.06, 0.03, Math.abs(d.x - cx)) * smooth(0.3, 0.55, d.y) * smooth(0.05, 0.4, d.z));
      let cheek = 0;
      for (const cy of [-0.1, -0.3]) cheek = Math.max(cheek, smooth(0.07, 0.03, Math.abs(d.y - cy)) * smooth(0.72, 0.9, Math.abs(d.x)));
      c.lerp(dark, Math.max(fore * 0.85, cheek * 0.8, smooth(0.66, 0.74, sp) * smooth(0.1, 0.5, d.y) * 0.75));
      c.lerp(new THREE.Color(look.base).lerp(WHITE, 0.6), muzzle * 0.75);
      break;
    }
    case 'tortie': {
      const n1 = noise3(d.x * 5 + 2, d.y * 5, d.z * 5 + 9);
      // a split blaze of orange down the forehead is typical of the breed
      const blaze = smooth(0.18, 0.06, Math.abs(d.x)) * smooth(0.25, 0.6, d.y) * smooth(0.0, 0.4, d.z);
      c.lerp(dark, Math.max(smooth(0.5, 0.6, n1) * 0.9, blaze * 0.85) * (1 - muzzle * 0.6));
      break;
    }
    default:
      c.lerp(new THREE.Color(look.base).lerp(WHITE, 0.55), muzzle * 0.8);
      c.multiplyScalar(0.96 + n * 0.08);
  }
  return c;
}

// ------------------------------------------------------------------ tube builder
export interface TubeSpec {
  /** control points of the centre line (cat space, x = 0 plane, side axis = +x) */
  pts: THREE.Vector3[];
  /** half-widths (x) and half-thicknesses (perpendicular to the path in the yz plane) per control point */
  rx: number[];
  ry: number[];
  samples: number;
  radial: number;
  region: Region;
  /** bones driving the tube, in order along the path; `p` is the rest position of the joint */
  joints: { bone: number; p: THREE.Vector3 }[];
  /** half width of the blend zone around a joint (path units) */
  blend: number;
}

export interface TubeBuffers {
  pos: number[];
  col: number[];
  skinIdx: number[];
  skinW: number[];
  idx: number[];
}

export function newBuffers(): TubeBuffers {
  return { pos: [], col: [], skinIdx: [], skinW: [], idx: [] };
}

const SIDE = new THREE.Vector3(1, 0, 0);

function interp(arr: number[], f: number): number {
  const x = clamp01(f) * (arr.length - 1);
  const i = Math.min(arr.length - 2, Math.floor(x));
  const t = x - i;
  const s = t * t * (3 - 2 * t);
  return arr[i] + (arr[i + 1] - arr[i]) * s;
}

export function addTube(spec: TubeSpec, look: CatLook, out: TubeBuffers) {
  const curve = new THREE.CatmullRomCurve3(spec.pts, false, 'centripetal');
  interface Ring {
    c: THREE.Vector3;
    t: THREE.Vector3;
    rx: number;
    ry: number;
    s: number;
    u: number;
  }
  const rings: Ring[] = [];
  const n = spec.samples;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    rings.push({ c: curve.getPointAt(u), t: curve.getTangentAt(u).normalize(), rx: interp(spec.rx, u), ry: interp(spec.ry, u), s: 0, u });
  }
  let len = 0;
  for (let i = 0; i < rings.length; i++) {
    if (i > 0) len += rings[i].c.distanceTo(rings[i - 1].c);
    rings[i].s = len;
  }
  // rounded caps: a few shrinking rings beyond both ends
  const K = 4;
  const cap = (end: Ring, dir: 1 | -1): Ring[] => {
    const r = Math.max(end.rx, end.ry);
    const out2: Ring[] = [];
    for (let k = 1; k <= K; k++) {
      const a = (k / K) * (Math.PI / 2);
      const f = Math.cos(a);
      out2.push({
        c: end.c.clone().addScaledVector(end.t, dir * r * Math.sin(a) * 0.95),
        t: end.t,
        rx: Math.max(0.0006, end.rx * f),
        ry: Math.max(0.0006, end.ry * f),
        s: end.s,
        u: end.u,
      });
    }
    return out2;
  };
  const all: Ring[] = [...cap(rings[0], -1).reverse(), ...rings, ...cap(rings[rings.length - 1], 1)];

  // joint positions along the path
  const js = spec.joints.map((j) => {
    let best = 0;
    let bd = Infinity;
    rings.forEach((r, i) => {
      const d = r.c.distanceToSquared(j.p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return rings[best].s;
  });

  const base = out.pos.length / 3;
  const up = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const ring of all) {
    up.crossVectors(ring.t, SIDE).normalize();
    // bone weights: bone k takes over smoothly around its joint
    const w: number[] = [];
    for (let k = 0; k < js.length; k++) w.push(k === 0 ? 1 : smooth(js[k] - spec.blend, js[k] + spec.blend, ring.s));
    const ids: number[] = [];
    const wts: number[] = [];
    for (let k = 0; k < js.length; k++) {
      const wk = w[k] - (k + 1 < js.length ? w[k + 1] : 0);
      if (wk > 1e-4) {
        ids.push(spec.joints[k].bone);
        wts.push(wk);
      }
    }
    while (ids.length < 4) {
      ids.push(0);
      wts.push(0);
    }
    for (let k = 0; k < spec.radial; k++) {
      const th = (k / spec.radial) * Math.PI * 2;
      const cx = Math.cos(th);
      const sy = Math.sin(th);
      p.copy(ring.c).addScaledVector(SIDE, ring.rx * cx).addScaledVector(up, ring.ry * sy);
      out.pos.push(p.x, p.y, p.z);
      const col = coatAt(look, spec.region, p, sy, ring.u);
      out.col.push(col.r, col.g, col.b);
      out.skinIdx.push(ids[0], ids[1], ids[2], ids[3]);
      out.skinW.push(wts[0], wts[1], wts[2], wts[3]);
    }
  }
  const R = spec.radial;
  for (let r = 0; r < all.length - 1; r++) {
    for (let k = 0; k < R; k++) {
      const a = base + r * R + k;
      const b = base + r * R + ((k + 1) % R);
      const c = base + (r + 1) * R + k;
      const d = base + (r + 1) * R + ((k + 1) % R);
      out.idx.push(a, b, c, b, d, c);
    }
  }
}

export function buffersToGeometry(b: TubeBuffers): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(b.skinIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(b.skinW, 4));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ head
export function buildHeadGeometry(look: CatLook): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 40, 30);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    let x = d.x * 0.097;
    let y = d.y * 0.092;
    let z = d.z * 0.088;
    // wide cheeks that taper to a small chin, flatter forehead
    if (d.y < 0) x *= 1 + 0.14 * smooth(0, -0.6, d.y) * (1 - 0.5 * smooth(0.5, 1, d.z));
    if (d.y < -0.6) {
      const t = smooth(-0.6, -1, d.y);
      x *= 1 - 0.22 * t;
      z *= 1 - 0.06 * t;
    }
    // little muzzle bump
    z += 0.016 * smooth(0.4, 0.95, d.z) * smooth(0.2, -0.5, d.y);
    y += -0.004 * smooth(0.6, 1, d.z);
    pos.setXYZ(i, x, y, z);
    const c = headCoat(look, d);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
