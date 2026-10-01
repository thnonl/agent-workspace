import * as THREE from 'three';
import { Rng } from '../util/rng';
import { G, M, MB, group, mesh } from './kit';
import { bakeGroup } from './bake';
import { addTube, buffersToGeometry, buildHeadGeometry, newBuffers } from './catMesh';

export type CoatPattern = 'solid' | 'tabby' | 'tuxedo' | 'calico' | 'siamese' | 'bicolor' | 'cow' | 'spotted' | 'tortie';
export type EarStyle = 'pointy' | 'fold' | 'tall' | 'round';
export type TailStyle = 'long' | 'short' | 'up' | 'fluffy';

export interface CatLook {
  base: string;
  dark: string;
  pattern: CoatPattern;
  eye: string;
  /** a different colour for the right eye (odd-eyed white cats) */
  eye2: string | null;
  scale: number;
  /** body thickness: 1 = normal, below slim, above chubby */
  build: number;
  /** long-haired: a bit thicker all round, cheek tufts */
  fluffy: boolean;
  ears: EarStyle;
  tail: TailStyle;
  /** colour of a collar with a bell, or null */
  collar: string | null;
}

const COATS: { base: string; dark: string; pattern: CoatPattern }[] = [
  { base: '#f0a458', dark: '#c8702c', pattern: 'tabby' },
  { base: '#a3a9bb', dark: '#5f6579', pattern: 'tabby' },
  { base: '#3c3a48', dark: '#2a2833', pattern: 'solid' },
  { base: '#ffffff', dark: '#33313f', pattern: 'tuxedo' },
  { base: '#f7f0e6', dark: '#e0902f', pattern: 'calico' },
  { base: '#f1e6d2', dark: '#6b5445', pattern: 'siamese' },
  { base: '#ffcf9e', dark: '#f0a860', pattern: 'solid' },
  { base: '#ffe9c7', dark: '#f0cfa0', pattern: 'solid' }, // cream
  { base: '#8a6350', dark: '#5e3f31', pattern: 'solid' }, // chocolate
  { base: '#9aa3b8', dark: '#6b7389', pattern: 'solid' }, // blue grey
  { base: '#fbfaf7', dark: '#e8e2d8', pattern: 'solid' }, // white
  { base: '#c9ced9', dark: '#4a4f60', pattern: 'tabby' }, // silver tabby
  { base: '#a9805a', dark: '#4b3324', pattern: 'tabby' }, // brown tabby
  { base: '#ffdcae', dark: '#e0a86a', pattern: 'tabby' }, // cream tabby
  { base: '#ffffff', dark: '#f0a458', pattern: 'bicolor' }, // orange and white
  { base: '#ffffff', dark: '#8f98ad', pattern: 'bicolor' }, // grey and white
  { base: '#ffffff', dark: '#2f2c38', pattern: 'cow' }, // black and white patches
  { base: '#e6b676', dark: '#5a3a26', pattern: 'spotted' }, // bengal
  { base: '#dfe3ea', dark: '#454a5a', pattern: 'spotted' }, // silver spotted
  { base: '#3a3440', dark: '#e08a3c', pattern: 'tortie' }, // tortoiseshell
  { base: '#f3f0ea', dark: '#7d8398', pattern: 'siamese' }, // blue point
  { base: '#f6ecdd', dark: '#7a5544', pattern: 'siamese' }, // chocolate point
  { base: '#fff1de', dark: '#e0902f', pattern: 'siamese' }, // flame point
];
const EYES = ['#7bd88f', '#ffd166', '#6ec6ff', '#b7e07a', '#ffb347', '#d98b3a', '#7fb6ff'];
const COLLARS = ['#ff5d73', '#6ec6ff', '#ffd166', '#b79bff', '#5ed3b0', '#ffffff', '#ff9ec4'];

export function makeCatLook(seed: number): CatLook {
  const r = new Rng(seed ^ 0x2c1b3);
  // (what a cat had before – coat, eyes, size – comes from this stream; the shape and the extras from the second one)
  const w = new Rng(seed ^ 0x7f4a7c15);
  const c = r.pick(COATS);
  const eye = r.pick(EYES);
  const scale = r.range(1.3, 1.5);
  const white = c.pattern === 'bicolor' || c.pattern === 'cow' || c.pattern === 'tuxedo' || c.base === '#fbfaf7';
  const fluffy = w.chance(0.28);
  return {
    ...c,
    eye,
    eye2: white && w.chance(0.3) ? (eye === '#6ec6ff' ? '#ffd166' : '#6ec6ff') : null,
    scale,
    build: w.pick([0.9, 1, 1, 1.08, 1.2]),
    fluffy,
    ears: w.weighted<EarStyle>([['pointy', 6], ['fold', 1.6], ['tall', 1.1], ['round', 1.3]]),
    tail: w.weighted<TailStyle>([['long', 5], ['short', 1.2], ['up', 1.2], ['fluffy', fluffy ? 5 : 0.4]]),
    collar: w.chance(0.3) ? w.pick(COLLARS) : null,
  };
}

export interface LegBones {
  a: THREE.Bone;
  b: THREE.Bone;
  c: THREE.Bone;
}

/** Indices in the shared skeleton – must match the order bones are created in `buildCat`. */
export interface CatRig {
  root: THREE.Group;
  hips: THREE.Bone;
  spine1: THREE.Bone;
  spine2: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  tail: THREE.Bone[];
  /** FL FR BL BR (−x, +x, −x, +x) */
  legs: LegBones[];
  ears: THREE.Group[];
  eyes: THREE.Group[];
  closedEyes: THREE.Mesh[];
  hipsRestY: number;
}

/** chibi proportions: everything a bit lower and shorter than a realistic cat */
const SY = 0.86;
const SZ = 0.9;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y * SY, z * SZ);
const fat = (a: number[], k = 1.1) => a.map((r) => r * k);

/**
 * A cartoon cat with a real skeleton: one smooth skinned mesh for body, legs and tail (so the spine can
 * arch and curl, the tail can whip and the legs bend at the elbows / knees), plus rigid head details.
 */
export function buildCat(look: CatLook): CatRig {
  const root = group();
  const bones: THREE.Bone[] = [];
  const mk = (abs: THREE.Vector3, parent: THREE.Object3D, parentAbs: THREE.Vector3, name: string) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(abs).sub(parentAbs);
    parent.add(b);
    bones.push(b);
    return b;
  };
  const O = new THREE.Vector3();

  // ---- spine
  const pHips = v(0, 0.216, -0.13);
  const pSpine1 = v(0, 0.225, 0.0);
  const pSpine2 = v(0, 0.216, 0.12);
  const pNeck = v(0, 0.245, 0.215);
  const pHead = v(0, 0.29, 0.29);
  const hips = mk(pHips, root, O, 'hips'); // 0
  const spine1 = mk(pSpine1, hips, pHips, 'spine1'); // 1
  const spine2 = mk(pSpine2, spine1, pSpine1, 'spine2'); // 2
  const neck = mk(pNeck, spine2, pSpine2, 'neck'); // 3
  const head = mk(pHead, neck, pNeck, 'head'); // 4

  // ---- tail (6 bones along a relaxed, upward curving centre line)
  const tailZ = [-0.2, -0.255, -0.315, -0.375, -0.435, -0.49, -0.54];
  const tailK = look.tail === 'short' ? 0.42 : look.tail === 'up' ? 0.85 : look.tail === 'fluffy' ? 0.92 : 1;
  const tailPts = tailZ.map((z, i) => v(0, 0.212 + (look.tail === 'up' ? 0.3 * (i / 6) ** 2 : 0), -0.2 + (z + 0.2) * tailK));
  const tail: THREE.Bone[] = [];
  let par: THREE.Object3D = hips;
  let parAbs = pHips;
  for (let i = 1; i <= 6; i++) {
    const b = mk(tailPts[i], par, parAbs, `tail${i}`); // 5..10
    tail.push(b);
    par = b;
    parAbs = tailPts[i];
  }

  // ---- legs
  const legDefs = [
    { sx: -1, front: true },
    { sx: 1, front: true },
    { sx: -1, front: false },
    { sx: 1, front: false },
  ];
  const legPts = (sx: number, front: boolean) =>
    front
      ? [v(sx * 0.05, 0.195, 0.125), v(sx * 0.05, 0.105, 0.135), v(sx * 0.05, 0.045, 0.135), v(sx * 0.05, 0.017, 0.15), v(sx * 0.05, 0.012, 0.172)]
      : [v(sx * 0.055, 0.205, -0.14), v(sx * 0.055, 0.118, -0.075), v(sx * 0.055, 0.062, -0.155), v(sx * 0.055, 0.02, -0.135), v(sx * 0.055, 0.012, -0.105)];
  const legs: LegBones[] = legDefs.map(({ sx, front }, i) => {
    const pts = legPts(sx, front);
    const parent = front ? spine2 : hips;
    const parentAbs = front ? pSpine2 : pHips;
    const a = mk(pts[0], parent, parentAbs, `leg${i}a`);
    const b = mk(pts[1], a, pts[0], `leg${i}b`);
    const c = mk(pts[2], b, pts[1], `leg${i}c`);
    return { a, b, c };
  });
  const legBone = (leg: number, k: 'a' | 'b' | 'c') => bones.indexOf(legs[leg][k]);

  // ---- skinned geometry
  const girth = look.build * (look.fluffy ? 1.08 : 1);
  const limbK = 0.85 + 0.15 * girth;
  const tailThick = look.tail === 'fluffy' ? 1.6 : look.tail === 'short' ? 1.15 : look.fluffy ? 1.2 : 1;
  const buf = newBuffers();
  addTube(
    {
      pts: [v(0, 0.2, -0.235), v(0, 0.212, -0.19), pHips, v(0, 0.222, -0.06), pSpine1, v(0, 0.222, 0.07), pSpine2, v(0, 0.222, 0.17), pNeck, v(0, 0.272, 0.255), pHead],
      rx: fat([0.06, 0.07, 0.074, 0.066, 0.06, 0.065, 0.071, 0.066, 0.056, 0.052, 0.05].map((x, i) => (i < 9 ? x * girth : x)), 1.12),
      ry: fat([0.064, 0.074, 0.078, 0.07, 0.066, 0.071, 0.079, 0.074, 0.062, 0.056, 0.05].map((x, i) => (i < 9 ? x * girth : x)), 1.1),
      samples: 56,
      radial: 30,
      region: 'body',
      joints: [
        { bone: 0, p: pHips },
        { bone: 1, p: pSpine1 },
        { bone: 2, p: pSpine2 },
        { bone: 3, p: pNeck },
        { bone: 4, p: pHead },
      ],
      blend: 0.05,
    },
    look,
    buf,
  );
  addTube(
    {
      pts: tailPts,
      rx: fat([0.036, 0.034, 0.031, 0.029, 0.027, 0.026, 0.024], 1.2 * tailThick),
      ry: fat([0.036, 0.034, 0.031, 0.029, 0.027, 0.026, 0.024], 1.2 * tailThick),
      samples: 40,
      radial: 14,
      region: 'tail',
      joints: [
        { bone: 0, p: pHips },
        ...tail.map((_, i) => ({ bone: 5 + i, p: tailPts[i + 1] })),
      ],
      blend: 0.035,
    },
    look,
    buf,
  );
  legDefs.forEach(({ sx, front }, i) => {
    const pts = legPts(sx, front);
    addTube(
      {
        pts,
        rx: fat(front ? [0.034, 0.029, 0.02, 0.021, 0.022] : [0.05, 0.032, 0.021, 0.02, 0.022], 1.18 * limbK),
        ry: fat(front ? [0.036, 0.03, 0.021, 0.02, 0.017] : [0.058, 0.036, 0.022, 0.02, 0.017], 1.18 * limbK),
        samples: 18,
        radial: front ? 12 : 16,
        region: front ? 'front' : 'hind',
        joints: [
          { bone: legBone(i, 'a'), p: pts[0] },
          { bone: legBone(i, 'b'), p: pts[1] },
          { bone: legBone(i, 'c'), p: pts[2] },
        ],
        blend: 0.03,
      },
      look,
      buf,
    );
  });
  const fur = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    sheen: 0.9,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#fff4e6'),
  });
  const skinned = new THREE.SkinnedMesh(buildBodyGeometry(buf), fur);
  skinned.geometry.userData.owned = true;
  skinned.castShadow = true;
  skinned.receiveShadow = false;
  skinned.frustumCulled = false;
  root.add(skinned);
  root.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton(bones));

  // ---- head details (rigid, children of the head bone)
  const face = group();
  face.scale.setScalar(look.fluffy ? 1.22 : 1.16);
  head.add(face);
  const headMesh = new THREE.Mesh(buildHeadGeometry(look), fur);
  headMesh.geometry.userData.owned = true;
  headMesh.castShadow = true;
  face.add(headMesh);

  const patched = look.pattern === 'tuxedo' || look.pattern === 'calico' || look.pattern === 'bicolor' || look.pattern === 'cow';
  const darkEars = patched || look.pattern === 'siamese';
  const earMat = M(darkEars ? look.dark : look.base, { rough: 0.9 });
  const pink = M('#ffa6b8', { rough: 0.7 });
  const ears: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const ear = group(s * 0.05, 0.07, -0.008);
    ear.rotation.z = -s * 0.32;
    ear.rotation.x = -0.12;
    // (the animation drives the ear group itself; the style lives in what hangs below it)
    const shape = group();
    switch (look.ears) {
      case 'tall':
        shape.add(mesh(G.cone(0.04, 0.072, 6), earMat, 0, 0.047, 0, { s: [1.0, 1.45, 0.55], r: [0, Math.PI, 0] }));
        shape.add(mesh(G.cone(0.028, 0.052, 6), pink, 0, 0.039, 0.01, { s: [1.0, 1.45, 0.35], r: [0, Math.PI, 0], cast: false }));
        break;
      case 'round':
        shape.add(mesh(G.sphere(0.036, 14, 10), earMat, 0, 0.028, 0, { s: [1, 0.95, 0.5] }));
        shape.add(mesh(G.sphere(0.023, 12, 8), pink, 0, 0.026, 0.008, { s: [1, 0.95, 0.4], cast: false }));
        break;
      case 'fold':
        shape.rotation.x = 1.0; // the tip folds forward over the head
        shape.add(mesh(G.cone(0.04, 0.072, 6), earMat, 0, 0.026, 0, { s: [1.12, 0.72, 0.6], r: [0, Math.PI, 0] }));
        break;
      default:
        shape.add(mesh(G.cone(0.04, 0.072, 6), earMat, 0, 0.033, 0, { s: [1.05, 1, 0.55], r: [0, Math.PI, 0] }));
        shape.add(mesh(G.cone(0.028, 0.052, 6), pink, 0, 0.027, 0.01, { s: [1.05, 1, 0.35], r: [0, Math.PI, 0], cast: false }));
    }
    ear.add(shape);
    face.add(ear);
    ears.push(ear);
  }
  if (look.fluffy) {
    // cheek tufts
    const tuft = M(patched ? '#ffffff' : look.base, { rough: 0.95 });
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) face.add(mesh(G.cone(0.02, 0.05, 6), tuft, s * (0.092 + k * 0.004), -0.03 - k * 0.018, 0.03, { r: [0.2, 0, s * (Math.PI / 2 + 0.5 + k * 0.35)], s: [1, 1, 0.6], cast: false }));
  }
  const eyes: THREE.Group[] = [];
  const closedEyes: THREE.Mesh[] = [];
  const lineMat = M('#3a3040', { rough: 0.6 });
  for (const s of [-1, 1]) {
    const eye = group(s * 0.04, 0.008, 0.073);
    eye.add(mesh(G.sphere(0.0175, 16, 12), M(s === 1 && look.eye2 ? look.eye2 : look.eye, { rough: 0.15 }), 0, 0, 0, { s: [1, 1.18, 0.55], cast: false }));
    eye.add(mesh(G.sphere(0.0105, 12, 10), M('#1d1a24', { rough: 0.2 }), 0, -0.001, 0.0045, { s: [0.32, 1.45, 0.6], cast: false }));
    eye.add(mesh(G.sphere(0.0048, 8, 6), MB('#ffffff'), s * -0.004, 0.0075, 0.0095, { cast: false }));
    eye.add(mesh(G.sphere(0.0026, 6, 5), MB('#ffffff'), s * 0.005, -0.006, 0.0095, { cast: false }));
    face.add(eye);
    eyes.push(eye);
    const closed = mesh(G.torus(0.0135, 0.0022, Math.PI, 4, 12), lineMat, s * 0.04, 0.005, 0.078, { r: [0, 0, Math.PI], cast: false });
    closed.visible = false;
    face.add(closed);
    closedEyes.push(closed);
  }
  face.add(mesh(G.sphere(0.0115, 12, 10), M('#ff9bb0', { rough: 0.5 }), 0, -0.016, 0.094, { s: [1.25, 0.85, 0.8], cast: false }));
  for (const s of [-1, 1]) {
    face.add(mesh(G.torus(0.0085, 0.0016, Math.PI, 4, 10), lineMat, s * 0.0085, -0.031, 0.088, { r: [0.2, 0, Math.PI], cast: false }));
    for (let k = 0; k < 3; k++) {
      face.add(mesh(G.cyl(0.0007, 0.0007, 0.08, 4), M('#fffaf0', { rough: 0.5 }), s * 0.09, -0.026 + (k - 1) * 0.011, 0.066, { r: [0, s * -0.3, -s * (Math.PI / 2) + (k - 1) * 0.2 * s], cast: false }));
    }
  }

  if (look.collar) {
    // a thin collar with a bell: it hangs on the neck bone, so it follows every head movement
    neck.add(mesh(G.torus(0.064 * girth, 0.0085, Math.PI * 2, 6, 24), M(look.collar, { rough: 0.5 }), 0, 0, 0.004, { s: [1, 1.06, 1], cast: false }));
    neck.add(mesh(G.sphere(0.0125, 10, 8), M('#ffd166', { metal: 0.6, rough: 0.3 }), 0, -0.066 * girth, 0.012, { cast: false }));
  }

  // the many small static pieces of the head (nose, whiskers, ear shapes, the parts of an eye) are merged: the face is a handful of draw calls, not thirty
  root.updateMatrixWorld(true);
  bakeGroup(face, new Set<THREE.Object3D>([headMesh, ...ears, ...eyes, ...closedEyes]));
  for (const j of [...ears, ...eyes]) bakeGroup(j);

  root.scale.setScalar(look.scale);
  return { root, hips, spine1, spine2, neck, head, tail, legs, ears, eyes, closedEyes, hipsRestY: hips.position.y };
}

function buildBodyGeometry(buf: ReturnType<typeof newBuffers>) {
  return buffersToGeometry(buf);
}
