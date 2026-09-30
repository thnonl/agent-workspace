import * as THREE from 'three';
import { Rng } from '../util/rng';
import { G, M, MB, group, mesh } from './kit';
import { addTube, buffersToGeometry, buildHeadGeometry, newBuffers } from './catMesh';

export type CoatPattern = 'solid' | 'tabby' | 'tuxedo' | 'calico' | 'siamese';

export interface CatLook {
  base: string;
  dark: string;
  pattern: CoatPattern;
  eye: string;
  scale: number;
}

const COATS: { base: string; dark: string; pattern: CoatPattern }[] = [
  { base: '#f0a458', dark: '#c8702c', pattern: 'tabby' },
  { base: '#a3a9bb', dark: '#5f6579', pattern: 'tabby' },
  { base: '#3c3a48', dark: '#2a2833', pattern: 'solid' },
  { base: '#ffffff', dark: '#33313f', pattern: 'tuxedo' },
  { base: '#f7f0e6', dark: '#e0902f', pattern: 'calico' },
  { base: '#f1e6d2', dark: '#6b5445', pattern: 'siamese' },
  { base: '#ffcf9e', dark: '#f0a860', pattern: 'solid' },
];

export function makeCatLook(seed: number): CatLook {
  const r = new Rng(seed ^ 0x2c1b3);
  const c = r.pick(COATS);
  return { ...c, eye: r.pick(['#7bd88f', '#ffd166', '#6ec6ff', '#b7e07a']), scale: r.range(1.3, 1.5) };
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
  const tailPts = [v(0, 0.212, -0.2), v(0, 0.212, -0.255), v(0, 0.212, -0.315), v(0, 0.212, -0.375), v(0, 0.212, -0.435), v(0, 0.212, -0.49), v(0, 0.212, -0.54)];
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
  const buf = newBuffers();
  addTube(
    {
      pts: [v(0, 0.2, -0.235), v(0, 0.212, -0.19), pHips, v(0, 0.222, -0.06), pSpine1, v(0, 0.222, 0.07), pSpine2, v(0, 0.222, 0.17), pNeck, v(0, 0.272, 0.255), pHead],
      rx: fat([0.06, 0.07, 0.074, 0.066, 0.06, 0.065, 0.071, 0.066, 0.056, 0.052, 0.05], 1.12),
      ry: fat([0.064, 0.074, 0.078, 0.07, 0.066, 0.071, 0.079, 0.074, 0.062, 0.056, 0.05], 1.1),
      samples: 34,
      radial: 22,
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
      rx: fat([0.036, 0.034, 0.031, 0.029, 0.027, 0.026, 0.024], 1.2),
      ry: fat([0.036, 0.034, 0.031, 0.029, 0.027, 0.026, 0.024], 1.2),
      samples: 28,
      radial: 12,
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
        rx: fat(front ? [0.034, 0.029, 0.02, 0.021, 0.022] : [0.05, 0.032, 0.021, 0.02, 0.022], 1.18),
        ry: fat(front ? [0.036, 0.03, 0.021, 0.02, 0.017] : [0.058, 0.036, 0.022, 0.02, 0.017], 1.18),
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
  face.scale.setScalar(1.16);
  head.add(face);
  const headMesh = new THREE.Mesh(buildHeadGeometry(look), fur);
  headMesh.geometry.userData.owned = true;
  headMesh.castShadow = true;
  face.add(headMesh);

  const baseCol = look.pattern === 'tuxedo' || look.pattern === 'siamese' || look.pattern === 'calico' ? look.dark : look.base;
  const earMat = M(baseCol, { rough: 0.9 });
  const pink = M('#ffa6b8', { rough: 0.7 });
  const ears: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const ear = group(s * 0.05, 0.07, -0.008);
    ear.rotation.z = -s * 0.32;
    ear.rotation.x = -0.12;
    const outer = mesh(G.cone(0.04, 0.072, 6), earMat, 0, 0.033, 0, { s: [1.05, 1, 0.55], r: [0, Math.PI, 0] });
    const inner = mesh(G.cone(0.028, 0.052, 6), pink, 0, 0.027, 0.01, { s: [1.05, 1, 0.35], r: [0, Math.PI, 0], cast: false });
    ear.add(outer, inner);
    face.add(ear);
    ears.push(ear);
  }
  const eyes: THREE.Group[] = [];
  const closedEyes: THREE.Mesh[] = [];
  const lineMat = M('#3a3040', { rough: 0.6 });
  for (const s of [-1, 1]) {
    const eye = group(s * 0.04, 0.008, 0.073);
    eye.add(mesh(G.sphere(0.0175, 16, 12), M(look.eye, { rough: 0.15 }), 0, 0, 0, { s: [1, 1.18, 0.55], cast: false }));
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

  root.scale.setScalar(look.scale);
  return { root, hips, spine1, spine2, neck, head, tail, legs, ears, eyes, closedEyes, hipsRestY: hips.position.y };
}

function buildBodyGeometry(buf: ReturnType<typeof newBuffers>) {
  return buffersToGeometry(buf);
}
