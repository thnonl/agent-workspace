import * as THREE from 'three';
import { G, group, mesh, M, shade } from './kit';
import type { HairStyle } from '../world/appearance';

/**
 * Hair as a smooth shell that follows the scalp (instead of a pile of spheres): the hair line is a curve around the head,
 * so every cut – fringe, side part, bob, long hair – is just another line. Head space: the skull is an ellipsoid with these
 * half axes (the 0.44 sphere of the head squashed by [1, 0.9, 0.95]).
 */
const AX = 0.44;
const AY = 0.396;
const AZ = 0.418;
const PI = Math.PI;
/** below this angle from the crown the hair leaves the skull and falls straight down */
const THETA_MAX = 2.35;
const DROP_ROWS = 6;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const sm = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** angle from the front, 0..π, whatever the sign / turn of `phi` */
const ang = (phi: number) => Math.abs(((((phi + PI) % (2 * PI)) + 2 * PI) % (2 * PI)) - PI);

/** a curve through knots [x, y] that eases between neighbours */
function curve(knots: readonly (readonly [number, number])[]): (x: number) => number {
  return (x) => {
    if (x <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i++) {
      if (x <= knots[i][0]) {
        const [x0, y0] = knots[i - 1];
        const [x1, y1] = knots[i];
        return mix(y0, y1, sm(x0, x1, x));
      }
    }
    return knots[knots.length - 1][1];
  };
}
/** hair line by the angle from the front: forehead height, height above the ears, height at the nape */
const line = (front: number, ear: number, back: number, aFront = 0.95, aEar = 1.45, aBack = 2.3) =>
  curve([[0, front], [aFront, front], [aEar, ear], [aBack, back], [PI, back]]);

interface Shell {
  key: string;
  /** hair line: height (head space) by the angle around the head (0 = straight ahead, ±π/2 = ears, π = back) */
  edge: (phi: number) => number;
  /** angle from the crown where the shell starts (default 0: the whole top) */
  start?: (phi: number) => number;
  /** limits of the angle around the head (default all round); the shell thins out towards both ends */
  phi0?: number;
  phi1?: number;
  /** thickness of the hair at the crown and at the hair line */
  top: number;
  rim: number;
  /** extra volume by (angle from the crown, angle around) */
  bulge?: (theta: number, phi: number) => number;
}

const cache = new Map<string, THREE.BufferGeometry>();

function shellGeometry(s: Shell): THREE.BufferGeometry {
  const hit = cache.get(s.key);
  if (hit) return hit;
  const cols = 64;
  const rows = 16;
  const phi0 = s.phi0 ?? -PI;
  const phi1 = s.phi1 ?? PI;
  const partial = s.phi0 !== undefined || s.phi1 !== undefined;
  const R = rows + DROP_ROWS;
  const pos: number[] = [];
  const point = (theta: number, phi: number, t: number, y?: number, squeeze = 1) => {
    const st = Math.sin(theta);
    const bx = AX * st * Math.sin(phi);
    const by = AY * Math.cos(theta);
    const bz = AZ * st * Math.cos(phi);
    const nx = bx / (AX * AX);
    const ny = by / (AY * AY);
    const nz = bz / (AZ * AZ);
    const nl = Math.hypot(nx, ny, nz) || 1;
    const x = (bx + (nx / nl) * t) * squeeze;
    const z = (bz + (nz / nl) * t) * squeeze;
    pos.push(x, y ?? by + (ny / nl) * t, z);
  };
  for (let j = 0; j <= cols; j++) {
    const phi = phi0 + ((phi1 - phi0) * j) / cols;
    const env = partial ? Math.pow(Math.sin((PI * j) / cols), 0.6) : 1;
    const yEdge = s.edge(phi);
    let thE = Math.acos(clamp(yEdge / AY, -1, 1));
    let drop = 0;
    if (thE > THETA_MAX) {
      drop = AY * Math.cos(THETA_MAX) - yEdge;
      thE = THETA_MAX;
    }
    const th0 = Math.min(s.start ? s.start(phi) : 0, thE - 0.02);
    const edgeT = drop > 0 ? Math.max(s.rim, 0.05) : s.rim;
    for (let i = 0; i <= rows; i++) {
      const u = i / rows;
      const theta = mix(th0, thE, u);
      let t = edgeT + (s.top - edgeT) * (1 - Math.pow(u, 2.2));
      if (th0 > 0) t *= sm(0, 0.18, u);
      if (s.bulge) t += s.bulge(theta, phi) * (1 - Math.pow(u, 3));
      point(theta, phi, Math.max(0.004, t * env));
    }
    for (let k = 1; k <= DROP_ROWS; k++) {
      const f = k / DROP_ROWS;
      point(thE, phi, Math.max(0.004, edgeT * env), drop > 0 ? AY * Math.cos(THETA_MAX) - drop * f : undefined, drop > 0 ? 1 - 0.16 * f : 1);
    }
  }
  const idx: number[] = [];
  const at = (j: number, i: number) => j * (R + 1) + i;
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < R; i++) {
      idx.push(at(j, i), at(j, i + 1), at(j + 1, i), at(j, i + 1), at(j + 1, i + 1), at(j + 1, i));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  // (a uv set, so the baked character can merge these with other meshes of the same colour)
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.computeVertexNormals();
  cache.set(s.key, geo);
  return geo;
}

export interface HairKit {
  hairMat: THREE.Material;
  hairDark: THREE.Material;
  /** hair cut so short that the scalp shows through: between the hair and the skin colour */
  hairFade: THREE.Material;
  accMat: THREE.Material;
  /** a hat sits on the head: keep the top flat */
  hatOn: boolean;
}

export interface HairResult {
  /** meshes and groups to add to the head */
  parts: THREE.Object3D[];
  /** the ponytail / pigtails that sway while walking */
  tail: THREE.Group | null;
}

/** a hair tie: a small ring round a bunch of hair */
const tie = (m: THREE.Material, x: number, y: number, z: number, r = 0.05, rx = 0, rz = 0) =>
  mesh(G.torus(r, 0.017, Math.PI * 2, 6, 14), m, x, y, z, { r: [Math.PI / 2 + rx, 0, rz], cast: false });

/** a lock of hair that hangs down and thins towards its end */
const lock = (m: THREE.Material, len: number, r0 = 0.085, r1 = 0.04) => mesh(G.limb(r0, r1, len, 12), m, 0, 0, 0);

const wobble = (amp: number, fp: number, ft: number) => (theta: number, phi: number) => amp * Math.sin(phi * fp) * Math.sin(theta * ft + 0.4) + amp;

export function buildHair(style: HairStyle, k: HairKit): HairResult {
  const parts: THREE.Object3D[] = [];
  let tail: THREE.Group | null = null;
  const main = (s: Shell) => parts.push(mesh(shellGeometry(s), k.hairMat, 0, 0, 0));
  const dark = (s: Shell) => parts.push(mesh(shellGeometry(s), k.hairDark, 0, 0, 0, { cast: false }));
  // with a hat on, the hair under it stays flat
  const cap = (top: number) => (k.hatOn ? Math.min(top, 0.045) : top);
  const vol = (b: Shell['bulge']) => (k.hatOn ? undefined : b);
  const scallop = (a: number, amp = 0.03, freq = 10) => amp * Math.cos(a * freq) * (1 - sm(0.6, 1.25, a));

  switch (style) {
    case 'short': {
      const base = line(0.17, 0.05, -0.12);
      main({ key: `short${k.hatOn}`, edge: (p) => base(ang(p)) + scallop(ang(p)), top: cap(0.065), rim: 0.012, bulge: vol((t, p) => 0.03 * Math.exp(-(((t - 0.6) / 0.4) ** 2)) * Math.exp(-((ang(p) / 1.0) ** 2))) });
      break;
    }
    case 'sidepart': {
      const sides = line(0.2, 0.05, -0.1);
      // the fringe sweeps from the parting on the left over the right brow
      const front = (p: number) => 0.27 - 0.17 * sm(-0.25, 0.6, p);
      const edge = (p: number) => mix(front(clamp(p, -1.2, 1.2)), sides(ang(p)), sm(0.85, 1.45, ang(p)));
      main({ key: `side${k.hatOn}`, edge, top: cap(0.06), rim: 0.012, bulge: vol((t, p) => 0.05 * Math.exp(-(((t - 0.75) / 0.42) ** 2)) * sm(-0.6, 0.4, clamp(p, -1.4, 1.4)) * (1 - sm(1.0, 1.6, ang(p)))) });
      dark({ key: 'sidepartline', edge: () => 0.27, start: () => 0.16, phi0: -0.36, phi1: -0.2, top: 0.066, rim: 0.066 });
      break;
    }
    case 'undercut': {
      const topLine = line(0.21, 0.16, 0.13, 1.1, 1.5, 2.3);
      main({ key: `under${k.hatOn}`, edge: (p) => topLine(ang(p)), top: cap(0.075), rim: 0.028, bulge: vol((t, p) => 0.085 * Math.exp(-(((t - 0.6) / 0.38) ** 2)) * Math.exp(-((ang(p) / 0.9) ** 2))) });
      // the shaved sides and back
      parts.push(mesh(shellGeometry({ key: 'fade', edge: (p) => (ang(p) > 2.2 ? -0.06 : mix(-0.03, -0.06, sm(1.05, 2.2, ang(p)))), start: () => 1.13, phi0: 1.05, phi1: 2 * PI - 1.05, top: 0.014, rim: 0.008 }), k.hairFade, 0, 0, 0, { cast: false }));
      break;
    }
    case 'twoblock': {
      const sides = line(0, -0.03, -0.08, 0.9, 1.5, 2.3);
      // curtains that part in the middle
      const front = (a: number) => 0.13 + 0.15 * Math.exp(-((a / 0.2) ** 2));
      main({ key: `two${k.hatOn}`, edge: (p) => mix(front(ang(p)), sides(ang(p)), sm(0.8, 1.35, ang(p))) + 0.012 * Math.cos(ang(p) * 12) * (1 - sm(0.5, 1, ang(p))), top: cap(0.075), rim: 0.02, bulge: vol((t) => 0.02 * Math.exp(-(((t - 0.7) / 0.5) ** 2))) });
      break;
    }
    case 'buzz': {
      const l = line(0.23, 0.09, -0.05);
      main({ key: 'buzz', edge: (p) => l(ang(p)), top: 0.016, rim: 0.008 });
      break;
    }
    case 'manbun': {
      const l = line(0.26, 0.06, -0.06, 1.0);
      main({ key: `manbun${k.hatOn}`, edge: (p) => l(ang(p)), top: cap(0.05), rim: 0.012 });
      const bun = group(0, 0.34, -0.2);
      bun.add(mesh(G.sphere(0.13, 16, 12), k.hairMat, 0, 0.05, 0, { s: [1, 0.95, 1] }));
      bun.add(tie(k.accMat, 0, -0.03, 0, 0.1));
      parts.push(bun);
      break;
    }
    case 'curly': {
      const l = line(0.15, 0.02, -0.1);
      main({ key: `curly${k.hatOn}`, edge: (p) => l(ang(p)) + scallop(ang(p), 0.02, 12), top: cap(0.075), rim: 0.025, bulge: vol(wobble(0.02, 9, 10)) });
      break;
    }
    case 'afro': {
      const l = line(0.2, -0.1, -0.2, 1.0, 1.5, 2.4);
      main({ key: `afro${k.hatOn}`, edge: (p) => l(ang(p)), top: cap(0.17), rim: 0.05, bulge: vol(wobble(0.022, 7, 8)) });
      break;
    }
    case 'bob': {
      const l = curve([[0, 0.14], [0.85, 0.14], [1.25, -0.2], [PI, -0.2]]);
      main({ key: `bob${k.hatOn}`, edge: (p) => l(ang(p)) + 0.012 * Math.sin(p * 8), top: cap(0.055), rim: 0.02, bulge: vol((t) => 0.03 * Math.exp(-(((t - 1.65) / 0.45) ** 2))) });
      break;
    }
    case 'lob': {
      const l = curve([[0, 0.14], [0.85, 0.14], [1.3, -0.5], [PI, -0.5]]);
      main({ key: `lob${k.hatOn}`, edge: (p) => l(ang(p)) + 0.03 * Math.sin(p * 7), top: cap(0.055), rim: 0.035, bulge: vol((t) => 0.03 * Math.exp(-(((t - 1.7) / 0.45) ** 2))) });
      break;
    }
    case 'long': {
      const front = (a: number) => 0.1 + 0.14 * Math.exp(-((a / 0.22) ** 2));
      const l = curve([[0, 0], [0.9, 0.06], [1.3, -0.62], [PI, -0.66]]);
      main({ key: `long${k.hatOn}`, edge: (p) => (ang(p) < 0.9 ? mix(front(ang(p)), l(ang(p)), sm(0.5, 0.9, ang(p))) : l(ang(p))) + 0.035 * Math.sin(p * 6), top: cap(0.055), rim: 0.04, bulge: vol((t) => 0.03 * Math.exp(-(((t - 1.7) / 0.5) ** 2))) });
      break;
    }
    case 'ponytail':
    case 'bun': {
      const l = curve([[0, 0.2], [0.9, 0.2], [1.5, 0.03], [2.3, 0.1], [PI, 0.1]]);
      main({ key: `pony${k.hatOn}`, edge: (p) => l(ang(p)) + scallop(ang(p), 0.02, 9), top: cap(0.055), rim: 0.012 });
      if (style === 'bun') {
        const bun = group(0, 0.4, -0.12);
        bun.add(mesh(G.sphere(0.15, 16, 12), k.hairMat, 0, 0.06, 0, { s: [1, 0.92, 1] }));
        bun.add(tie(k.accMat, 0, -0.03, 0, 0.11));
        parts.push(bun);
      } else {
        tail = group(0, 0.27, -0.4);
        tail.add(tie(k.accMat, 0, 0, 0, 0.055, 0.5));
        const t = lock(k.hairMat, 0.3, 0.085, 0.045);
        t.position.set(0, -0.02, -0.04);
        t.rotation.x = 0.28;
        tail.add(t);
        parts.push(tail);
      }
      break;
    }
    case 'lowtails': {
      const front = (a: number) => 0.13 + 0.13 * Math.exp(-((a / 0.2) ** 2));
      const sides = line(0, 0, 0.0, 0.9, 1.5, 2.3);
      main({ key: `lowtails${k.hatOn}`, edge: (p) => mix(front(ang(p)), sides(ang(p)), sm(0.8, 1.35, ang(p))), top: cap(0.06), rim: 0.02 });
      tail = group();
      for (const side of [-1, 1]) {
        const t = group(side * 0.4, -0.06, -0.1);
        t.add(tie(k.accMat, 0, 0.0, 0, 0.055, 0, side * 0.5));
        const l = lock(k.hairMat, 0.34, 0.08, 0.04);
        l.position.set(side * 0.03, -0.02, 0);
        l.rotation.z = side * 0.14;
        t.add(l);
        tail.add(t);
      }
      parts.push(tail);
      break;
    }
    case 'bald':
    default:
  }
  return { parts, tail };
}

/** a slightly lighter or darker copy of the hair colour for locks and highlights */
export const hairTone = (hex: string, amount: number) => M(shade(hex, amount), { rough: 0.55 });
