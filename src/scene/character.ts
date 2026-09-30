import * as THREE from 'three';
import type { Appearance } from '../world/appearance';
import { G, M, MB, group, mesh, shade } from './kit';
import { bakeGroup } from './bake';

/**
 * Builds a cute chibi character out of primitives. The returned rig exposes the joints
 * the animation system drives every frame.
 *
 * Model space: feet at y=0, facing +z, ~1.85 tall (the root is later scaled by ~0.85).
 */
export interface Rig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  thighL: THREE.Group;
  thighR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  eyeL: THREE.Group;
  eyeR: THREE.Group;
  eyes: THREE.Group;
  browL: THREE.Mesh;
  browR: THREE.Mesh;
  mouthSmile: THREE.Mesh;
  mouthO: THREE.Mesh;
  tail: THREE.Group | null;
  ears: THREE.Group[];
  handHold: THREE.Group;
  /** same spot on the left hand (dumbbells) */
  handHoldL: THREE.Group;
  bag: THREE.Group;
  folder: THREE.Group;
}

export const HIP_Y = 0.47;
export const RIG_SCALE = 0.85;

const SLEEVE: Record<Appearance['top'], 'long' | 'short' | 'none'> = {
  tee: 'short', hoodie: 'long', shirt: 'long', sweater: 'long', dress: 'short', overalls: 'short', suit: 'long', jacket: 'long', tank: 'none',
};

export function buildCharacter(a: Appearance): Rig {
  const skin = M(a.skin, { rough: 0.55 });
  const skinDark = M(shade(a.skin, -0.08), { rough: 0.6 });
  const topMat = M(a.topColor, { rough: 0.75 });
  const accentMat = M(a.topAccent, { rough: 0.7 });
  const bottomMat = M(a.bottomColor, { rough: 0.8 });
  const shoeMat = M(a.shoes, { rough: 0.5 });
  const hairMat = M(a.hair, { rough: 0.5 });
  const hairDark = M(shade(a.hair, -0.1), { rough: 0.55 });
  const accMat = M(a.accessoryColor, { rough: 0.5 });
  const eyeMat = M(a.eye, { rough: 0.25 });
  const white = M('#ffffff', { rough: 0.4 });

  const root = group();
  const pelvis = group();
  root.add(pelvis);

  // ------------------------------------------------------------------ legs
  const legs = (side: -1 | 1) => {
    const thigh = group(side * 0.125, HIP_Y, 0);
    const shortsLeg = a.bottom === 'shorts';
    const bareLeg = a.bottom === 'skirt' || a.bottom === 'none';
    thigh.add(mesh(G.capsule(0.098, 0.03), bareLeg ? skin : bottomMat, 0, -0.11, 0));
    const knee = group(0, -0.22, 0);
    thigh.add(knee);
    knee.add(mesh(G.capsule(0.088, 0.03), shortsLeg || bareLeg ? skin : bottomMat, 0, -0.1, 0));
    if (shortsLeg || bareLeg) knee.add(mesh(G.cyl(0.092, 0.092, 0.05, 14), white, 0, -0.145, 0)); // sock cuff
    knee.add(mesh(G.sphere(0.12, 18, 12), shoeMat, 0, -0.19, 0.045, { s: [0.92, 0.66, 1.42] }));
    knee.add(mesh(G.sphere(0.06, 10, 8), white, 0, -0.215, 0.13, { s: [1.5, 0.4, 0.9], cast: false }));
    pelvis.add(thigh);
    return { thigh, knee };
  };
  const { thigh: thighL, knee: kneeL } = legs(-1);
  const { thigh: thighR, knee: kneeR } = legs(1);

  // hip block (hides the gap between legs and torso)
  pelvis.add(mesh(G.sphere(0.2, 18, 12), a.bottom === 'skirt' || a.top === 'dress' ? (a.top === 'dress' ? topMat : bottomMat) : bottomMat, 0, HIP_Y + 0.02, 0, { s: [1.05, 0.7, 0.85] }));
  if (a.bottom === 'skirt') {
    pelvis.add(mesh(G.cyl(0.2, 0.36, 0.26, 24), bottomMat, 0, HIP_Y - 0.06, 0));
    pelvis.add(mesh(G.torus(0.36, 0.014, Math.PI * 2, 6, 32), accentMat, 0, HIP_Y - 0.185, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
  }
  if (a.top === 'dress') {
    pelvis.add(mesh(G.cyl(0.2, 0.4, 0.32, 24), topMat, 0, HIP_Y - 0.08, 0));
    pelvis.add(mesh(G.torus(0.4, 0.016, Math.PI * 2, 6, 32), accentMat, 0, HIP_Y - 0.235, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
  }

  // ----------------------------------------------------------------- torso
  const torso = group(0, HIP_Y, 0);
  pelvis.add(torso);
  const torsoColor = a.top === 'overalls' ? accentMat : topMat;
  torso.add(mesh(G.capsule(0.235, 0.17, 8, 16), torsoColor, 0, 0.28, 0, { s: [1, 1, 0.86] }));

  switch (a.top) {
    case 'shirt':
      torso.add(mesh(G.box(0.1, 0.06, 0.05), white, -0.07, 0.56, 0.17, { r: [0.3, 0, 0.5] }));
      torso.add(mesh(G.box(0.1, 0.06, 0.05), white, 0.07, 0.56, 0.17, { r: [0.3, 0, -0.5] }));
      for (let i = 0; i < 3; i++) torso.add(mesh(G.sphere(0.02, 8, 6), white, 0, 0.42 - i * 0.11, 0.2, { cast: false }));
      break;
    case 'hoodie':
      torso.add(mesh(G.torus(0.17, 0.06, Math.PI * 1.3, 8, 20), M(shade(a.topColor, -0.06)), 0, 0.6, -0.02, { r: [Math.PI / 2 - 0.35, 0, Math.PI * 0.85], s: [1.15, 1, 1] }));
      torso.add(mesh(G.rbox(0.3, 0.12, 0.05, 0.03), M(shade(a.topColor, -0.06)), 0, 0.14, 0.2, { r: [0.15, 0, 0] }));
      torso.add(mesh(G.cyl(0.012, 0.012, 0.14, 6), white, -0.06, 0.5, 0.2, { cast: false }));
      torso.add(mesh(G.cyl(0.012, 0.012, 0.14, 6), white, 0.06, 0.5, 0.2, { cast: false }));
      break;
    case 'sweater':
      for (const y of [0.22, 0.36]) torso.add(mesh(G.torus(0.235, 0.022, Math.PI * 2, 6, 28), accentMat, 0, y, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.86, 1], cast: false }));
      torso.add(mesh(G.torus(0.13, 0.04, Math.PI * 2, 8, 20), topMat, 0, 0.6, 0, { r: [Math.PI / 2, 0, 0] }));
      break;
    case 'overalls': {
      const denim = bottomMat;
      torso.add(mesh(G.rbox(0.34, 0.3, 0.06, 0.03), denim, 0, 0.17, 0.185));
      torso.add(mesh(G.rbox(0.05, 0.4, 0.05, 0.02), denim, -0.13, 0.44, 0.18, { r: [0.1, 0, 0.1] }));
      torso.add(mesh(G.rbox(0.05, 0.4, 0.05, 0.02), denim, 0.13, 0.44, 0.18, { r: [0.1, 0, -0.1] }));
      torso.add(mesh(G.sphere(0.03, 8, 6), M('#ffd166', { metal: 0.6 }), -0.13, 0.36, 0.215, { cast: false }));
      torso.add(mesh(G.sphere(0.03, 8, 6), M('#ffd166', { metal: 0.6 }), 0.13, 0.36, 0.215, { cast: false }));
      break;
    }
    case 'suit': {
      const lapel = M(shade(a.topColor, -0.05));
      torso.add(mesh(G.box(0.16, 0.42, 0.03), white, 0, 0.36, 0.2, { r: [0.05, 0, 0], cast: false }));
      torso.add(mesh(G.box(0.07, 0.4, 0.05), lapel, -0.1, 0.36, 0.2, { r: [0.05, 0, 0.16] }));
      torso.add(mesh(G.box(0.07, 0.4, 0.05), lapel, 0.1, 0.36, 0.2, { r: [0.05, 0, -0.16] }));
      // tie
      const tie = M('#ff5d73');
      torso.add(mesh(G.box(0.06, 0.06, 0.03), tie, 0, 0.52, 0.215));
      torso.add(mesh(G.cone(0.055, 0.3, 4), tie, 0, 0.3, 0.215, { r: [Math.PI, Math.PI / 4, 0], s: [0.6, 1, 0.3] }));
      // golden name badge
      torso.add(mesh(G.rbox(0.09, 0.05, 0.02, 0.01), M('#ffd166', { metal: 0.5, rough: 0.35 }), 0.14, 0.42, 0.21, { cast: false }));
      break;
    }
    case 'jacket':
      torso.add(mesh(G.box(0.02, 0.5, 0.03), white, 0, 0.32, 0.2, { cast: false }));
      torso.add(mesh(G.box(0.16, 0.36, 0.02), accentMat, 0, 0.3, 0.195, { cast: false }));
      torso.add(mesh(G.torus(0.14, 0.035, Math.PI * 2, 6, 20), topMat, 0, 0.58, 0, { r: [Math.PI / 2, 0, 0] }));
      break;
    default:
  }

  // ------------------------------------------------------------------ arms
  const sleeve = SLEEVE[a.top];
  const arm = (side: -1 | 1) => {
    const shoulder = group(side * 0.285, 0.5, 0);
    shoulder.add(mesh(G.sphere(0.085, 12, 10), sleeve === 'none' ? skin : topMat, 0, 0, 0));
    shoulder.add(mesh(G.capsule(0.07, 0.09), sleeve === 'none' ? skin : topMat, 0, -0.11, 0));
    const fore = group(0, -0.22, 0);
    shoulder.add(fore);
    fore.add(mesh(G.capsule(0.064, 0.07), sleeve === 'long' ? topMat : skin, 0, -0.09, 0));
    if (sleeve === 'long') fore.add(mesh(G.torus(0.062, 0.018, Math.PI * 2, 6, 14), accentMat, 0, -0.16, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
    const hand = group(0, -0.215, 0.005);
    hand.add(mesh(G.sphere(0.078, 14, 10), skin, 0, 0, 0));
    fore.add(hand);
    torso.add(shoulder);
    return { shoulder, fore, hand };
  };
  const { shoulder: armL, fore: foreL, hand: handL } = arm(-1);
  const { shoulder: armR, fore: foreR, hand: handR } = arm(1);
  const handHold = group(0, -0.02, 0.07);
  handR.add(handHold);
  const handHoldL = group(0, -0.02, 0.07);
  handL.add(handHoldL);

  // ------------------------------------------------------------------ head
  const head = group(0, 0.94, 0);
  torso.add(head);
  head.add(mesh(G.sphere(0.44, 32, 24), skin, 0, 0, 0, { s: [1, 0.9, 0.95] }));
  // ears
  head.add(mesh(G.sphere(0.06, 10, 8), skinDark, -0.43, -0.03, 0, { s: [0.5, 1, 0.9], cast: false }));
  head.add(mesh(G.sphere(0.06, 10, 8), skinDark, 0.43, -0.03, 0, { s: [0.5, 1, 0.9], cast: false }));

  const eyes = group(0, 0, 0);
  head.add(eyes);
  const eye = (side: -1 | 1) => {
    const g = group(side * 0.16, -0.03, 0.385);
    g.add(mesh(G.sphere(0.078, 16, 12), eyeMat, 0, 0, 0, { s: [1, 1.38, 0.5], cast: false }));
    g.add(mesh(G.sphere(0.026, 8, 6), MB('#ffffff'), 0.028, 0.045, 0.03, { cast: false }));
    g.add(mesh(G.sphere(0.013, 8, 6), MB('#ffffff'), -0.028, -0.03, 0.03, { cast: false }));
    eyes.add(g);
    return g;
  };
  const eyeL = eye(-1);
  const eyeR = eye(1);
  const browMat = M(shade(a.hair, -0.15), { rough: 0.6 });
  const brow = (side: -1 | 1) => {
    const b = mesh(G.capsule(0.012, 0.07, 3, 6), browMat, side * 0.16, 0.115, 0.4, { r: [0, 0, Math.PI / 2 + side * 0.08], cast: false });
    head.add(b);
    return b;
  };
  const browL = brow(-1);
  const browR = brow(1);
  // cheeks
  for (const side of [-1, 1]) head.add(mesh(G.sphere(0.06, 12, 8), MB(a.blush, 0.7), side * 0.27, -0.1, 0.3, { s: [1.2, 0.7, 0.4], cast: false, r: [0, side * 0.6, 0] }));
  if (a.freckles) {
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) head.add(mesh(G.sphere(0.011, 6, 4), skinDark, side * (0.2 + i * 0.03), -0.075 - (i % 2) * 0.02, 0.37, { cast: false }));
  }
  const mouthSmile = mesh(G.torus(0.05, 0.011, Math.PI, 6, 14), M('#7a3b4a', { rough: 0.4 }), 0, -0.135, 0.385, { r: [0, 0, Math.PI], cast: false });
  const mouthO = mesh(G.sphere(0.028, 10, 8), M('#8a3d4d', { rough: 0.4 }), 0, -0.155, 0.385, { s: [1, 1.2, 0.5], cast: false });
  mouthO.visible = false;
  head.add(mouthSmile, mouthO);

  // ------------------------------------------------------------------ hair
  const hair = group();
  head.add(hair);
  const cap = (theta = 0.52, tilt = -0.38, rad = 0.472, mat: THREE.Material = hairMat) => {
    const m = mesh(G.cap(rad, 28, 16, Math.PI * theta), mat, 0, 0.01, -0.005, { s: [1, 0.93, 1.0], r: [tilt, 0, 0] });
    hair.add(m);
    return m;
  };
  const bangs = (n = 5, y = 0.17, size = 0.095) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      hair.add(mesh(G.sphere(size, 12, 8), hairMat, t * 0.42, y - Math.abs(t) * 0.09, 0.385 - Math.abs(t) * 0.11, { s: [1, 1.25, 0.6], r: [0, t * -0.6, t * 0.4] }));
    }
  };
  let tail: THREE.Group | null = null;
  const ears: THREE.Group[] = [];
  switch (a.hairStyle) {
    case 'short':
      cap();
      bangs(5);
      break;
    case 'sidepart':
      cap();
      hair.add(mesh(G.sphere(0.2, 14, 10), hairMat, 0.12, 0.22, 0.32, { s: [1.5, 0.8, 0.7], r: [0.3, 0, -0.35] }));
      bangs(3, 0.15, 0.08);
      break;
    case 'spiky':
      cap(0.5, -0.3);
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2;
        const rr = i === 0 ? 0 : 0.27;
        hair.add(mesh(G.cone(0.1, 0.28, 8), hairMat, Math.sin(ang) * rr, 0.43 - (i === 0 ? 0 : 0.03), Math.cos(ang) * rr * 0.9 - 0.02, { r: [Math.cos(ang) * 0.55, 0, -Math.sin(ang) * 0.55] }));
      }
      bangs(3, 0.2, 0.08);
      break;
    case 'mohawk':
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const ang = -0.3 + t * 2.3;
        hair.add(mesh(G.sphere(0.11 - Math.abs(t - 0.5) * 0.05, 10, 8), hairMat, 0, Math.sin(ang) * 0.5, Math.cos(ang) * 0.4, { s: [0.7, 1.15, 1] }));
      }
      break;
    case 'bob':
      cap(0.55, -0.34, 0.478);
      bangs(5, 0.16);
      for (const side of [-1, 1]) {
        hair.add(mesh(G.capsule(0.12, 0.18, 6, 10), hairMat, side * 0.38, -0.1, -0.02, { s: [0.85, 1, 1.1] }));
      }
      hair.add(mesh(G.sphere(0.4, 20, 14), hairMat, 0, -0.02, -0.12, { s: [1.02, 0.95, 0.85] }));
      break;
    case 'long':
      cap(0.55, -0.34, 0.478);
      bangs(5, 0.16);
      hair.add(mesh(G.sphere(0.42, 20, 14), hairMat, 0, -0.06, -0.12, { s: [1.02, 1, 0.85] }));
      hair.add(mesh(G.capsule(0.3, 0.42, 6, 14), hairMat, 0, -0.42, -0.2, { s: [1.05, 1, 0.55] }));
      for (const side of [-1, 1]) hair.add(mesh(G.capsule(0.085, 0.3, 6, 10), hairMat, side * 0.4, -0.22, 0.02));
      break;
    case 'ponytail': {
      cap(0.53, -0.36);
      bangs(5, 0.17);
      hair.add(mesh(G.sphere(0.06, 8, 6), accMat, 0, 0.26, -0.42));
      tail = group(0, 0.26, -0.44);
      tail.add(mesh(G.capsule(0.11, 0.22, 6, 12), hairMat, 0, -0.16, -0.06, { r: [0.25, 0, 0] }));
      tail.add(mesh(G.sphere(0.1, 10, 8), hairMat, 0, -0.34, -0.1, { s: [0.9, 1.2, 0.9] }));
      hair.add(tail);
      break;
    }
    case 'twintails': {
      cap(0.53, -0.36);
      bangs(5, 0.17);
      tail = group();
      for (const side of [-1, 1]) {
        hair.add(mesh(G.sphere(0.06, 8, 6), accMat, side * 0.38, 0.2, -0.08));
        const t = group(side * 0.38, 0.2, -0.08);
        t.add(mesh(G.capsule(0.1, 0.3, 6, 12), hairMat, side * 0.08, -0.22, 0, { r: [0, 0, side * 0.2] }));
        t.add(mesh(G.sphere(0.09, 10, 8), hairMat, side * 0.14, -0.42, 0, { s: [0.9, 1.3, 0.9] }));
        tail.add(t);
      }
      hair.add(tail);
      break;
    }
    case 'buns':
      cap(0.52, -0.34);
      bangs(5, 0.17);
      for (const side of [-1, 1]) {
        hair.add(mesh(G.sphere(0.17, 14, 10), hairMat, side * 0.28, 0.43, -0.06));
        hair.add(mesh(G.torus(0.11, 0.02, Math.PI * 2, 6, 16), accMat, side * 0.28, 0.35, -0.06, { r: [Math.PI / 2 - 0.5, side * 0.4, 0], cast: false }));
      }
      break;
    case 'afro':
      hair.add(mesh(G.sphere(0.58, 24, 18), hairMat, 0, 0.2, -0.2, { s: [1.02, 0.92, 1] }));
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        hair.add(mesh(G.sphere(0.16, 10, 8), hairDark, Math.sin(ang) * 0.42, 0.42 + (i % 2) * 0.12, Math.cos(ang) * 0.28 - 0.18));
      }
      break;
    case 'curly':
      cap(0.5, -0.36);
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const rr = 0.33 + (i % 2) * 0.06;
        hair.add(mesh(G.sphere(0.13, 10, 8), i % 3 === 0 ? hairDark : hairMat, Math.sin(ang) * rr, 0.24 + (i % 3) * 0.06, Math.cos(ang) * rr * 0.9 - 0.06));
      }
      hair.add(mesh(G.sphere(0.14, 10, 8), hairMat, 0, 0.44, 0));
      break;
    case 'bald':
      hair.add(mesh(G.sphere(0.03, 6, 4), hairMat, 0, 0.4, 0.05, { s: [1, 3, 1], cast: false }));
      break;
  }

  // ----------------------------------------------------------- accessories
  const dark = M('#3a3345', { rough: 0.4 });
  switch (a.accessory) {
    case 'glasses':
    case 'round-glasses': {
      const r = a.accessory === 'glasses' ? 0.1 : 0.115;
      for (const side of [-1, 1]) head.add(mesh(G.torus(r, 0.013, Math.PI * 2, 6, 22), a.accessory === 'glasses' ? dark : accMat, side * 0.16, -0.03, 0.4, { cast: false, s: [a.accessory === 'glasses' ? 1.15 : 1, 1, 1] }));
      head.add(mesh(G.box(0.07, 0.014, 0.014), dark, 0, -0.01, 0.41, { cast: false }));
      for (const side of [-1, 1]) head.add(mesh(G.box(0.014, 0.014, 0.3), dark, side * 0.285, -0.02, 0.26, { cast: false, r: [0, side * -0.25, 0] }));
      break;
    }
    case 'headphones':
      head.add(mesh(G.torus(0.47, 0.03, Math.PI, 8, 24), dark, 0, 0.0, 0, { r: [0, 0, 0], s: [1, 0.98, 1] }));
      for (const side of [-1, 1]) {
        head.add(mesh(G.cyl(0.12, 0.12, 0.09, 18), accMat, side * 0.46, -0.02, 0, { r: [0, 0, Math.PI / 2] }));
        head.add(mesh(G.cyl(0.085, 0.085, 0.1, 16), dark, side * 0.48, -0.02, 0, { r: [0, 0, Math.PI / 2], cast: false }));
      }
      break;
    case 'beanie':
      hair.add(mesh(G.cap(0.5, 24, 14, Math.PI * 0.52), accMat, 0, 0.055, -0.02, { s: [1, 0.95, 1.02], r: [-0.28, 0, 0] }));
      hair.add(mesh(G.torus(0.46, 0.05, Math.PI * 2, 8, 28), M(shade(a.accessoryColor, -0.08)), 0, 0.14, 0.0, { r: [Math.PI / 2 - 0.28, 0, 0], s: [1, 1, 1] }));
      hair.add(mesh(G.sphere(0.09, 10, 8), white, 0, 0.5, -0.12));
      break;
    case 'cap':
      hair.add(mesh(G.cap(0.49, 24, 14, Math.PI * 0.5), accMat, 0, 0.06, -0.02, { s: [1, 0.95, 1.02], r: [-0.3, 0, 0] }));
      hair.add(mesh(G.cyl(0.3, 0.3, 0.03, 20, ), accMat, 0, 0.16, 0.36, { s: [1.05, 1, 0.9], r: [0.28, 0, 0] }));
      hair.add(mesh(G.sphere(0.04, 8, 6), white, 0, 0.5, -0.08, { cast: false }));
      break;
    case 'bow':
      for (const side of [-1, 1]) hair.add(mesh(G.cone(0.1, 0.2, 10), accMat, 0.3 + side * 0.12, 0.38, 0.14, { r: [0, 0, side * -Math.PI / 2 - 0.5] }));
      hair.add(mesh(G.sphere(0.05, 8, 6), M(shade(a.accessoryColor, -0.1)), 0.3, 0.38, 0.14));
      break;
    case 'headband':
      hair.add(mesh(G.torus(0.47, 0.025, Math.PI, 8, 24), accMat, 0, 0.02, 0.02, { r: [0, 0, 0], s: [1, 0.98, 1] }));
      break;
    case 'bunny-ears':
      ears.push(group(), group());
      [-1, 1].forEach((side, i) => {
        const e = ears[i];
        e.position.set(side * 0.17, 0.4, -0.04);
        e.rotation.z = -side * 0.18;
        e.add(mesh(G.capsule(0.075, 0.3, 6, 10), white, 0, 0.2, 0, { s: [0.85, 1, 0.55] }));
        e.add(mesh(G.capsule(0.04, 0.24, 6, 8), MB('#ffb3c6'), 0, 0.2, 0.03, { s: [0.8, 1, 0.5], cast: false }));
        hair.add(e);
      });
      break;
    case 'cat-ears':
      [-1, 1].forEach((side) => {
        const e = group(side * 0.29, 0.34, 0.02);
        e.rotation.z = -side * 0.42;
        e.add(mesh(G.cone(0.13, 0.24, 4), hairMat, 0, 0.1, 0, { r: [0, Math.PI / 4, 0], s: [1, 1, 0.55] }));
        e.add(mesh(G.cone(0.075, 0.15, 4), MB('#ffb3c6'), 0, 0.09, 0.03, { r: [0, Math.PI / 4, 0], s: [1, 1, 0.4], cast: false }));
        hair.add(e);
      });
      break;
    case 'flower': {
      const f = group(0.31, 0.36, 0.22);
      f.rotation.set(0.3, 0.4, 0.3);
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        f.add(mesh(G.sphere(0.055, 8, 6), accMat, Math.cos(ang) * 0.075, Math.sin(ang) * 0.075, 0, { s: [1, 1, 0.5] }));
      }
      f.add(mesh(G.sphere(0.045, 8, 6), M('#ffd166'), 0, 0, 0.02));
      hair.add(f);
      break;
    }
    case 'crown': {
      const gold = M('#ffd166', { metal: 0.55, rough: 0.3 });
      hair.add(mesh(G.cyl(0.2, 0.22, 0.09, 20), gold, 0, 0.47, -0.02, { r: [-0.15, 0, 0] }));
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        hair.add(mesh(G.cone(0.05, 0.13, 6), gold, Math.sin(ang) * 0.2, 0.56, Math.cos(ang) * 0.2 - 0.03));
        hair.add(mesh(G.sphere(0.022, 6, 4), M('#ff5d73'), Math.sin(ang) * 0.2, 0.63, Math.cos(ang) * 0.2 - 0.03, { cast: false }));
      }
      break;
    }
    case 'scarf':
      torso.add(mesh(G.torus(0.19, 0.06, Math.PI * 2, 8, 24), accMat, 0, 0.59, 0.0, { r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1] }));
      torso.add(mesh(G.rbox(0.1, 0.3, 0.05, 0.02), accMat, 0.1, 0.44, 0.19, { r: [0.05, 0, -0.1] }));
      break;
    default:
  }

  // -------------------------------------------------------- props (in rig space)
  const bag = group();
  const bagBody = M(a.backpack, { rough: 0.65 });
  const bagDark = M(shade(a.backpack, -0.12), { rough: 0.7 });
  bag.add(mesh(G.rbox(0.36, 0.44, 0.2, 0.07), bagBody, 0, 0, 0));
  bag.add(mesh(G.rbox(0.3, 0.14, 0.212, 0.05), bagDark, 0, 0.16, 0));
  bag.add(mesh(G.rbox(0.24, 0.16, 0.06, 0.03), bagDark, 0, -0.08, 0.12));
  bag.add(mesh(G.torus(0.05, 0.014, Math.PI, 6, 12), bagDark, 0, 0.26, 0, { r: [0, 0, 0] }));
  for (const side of [-1, 1]) bag.add(mesh(G.rbox(0.05, 0.36, 0.05, 0.02), bagDark, side * 0.12, 0.02, -0.11));
  bag.add(mesh(G.sphere(0.03, 8, 6), M('#ffd166', { metal: 0.5 }), 0.1, 0.16, 0.11, { cast: false }));

  const folder = group();
  folder.add(mesh(G.rbox(0.34, 0.04, 0.44, 0.015), M(a.isDirector ? '#ffd166' : a.accessoryColor, { rough: 0.6 }), 0, 0, 0));
  folder.add(mesh(G.box(0.3, 0.02, 0.4), white, 0, 0.026, 0.01, { cast: false }));
  folder.add(mesh(G.box(0.12, 0.014, 0.02), M('#9aa3b8'), 0, 0.04, 0.05, { cast: false }));
  folder.add(mesh(G.box(0.2, 0.014, 0.02), M('#9aa3b8'), 0, 0.04, 0.0, { cast: false }));
  folder.visible = false;

  // Merge the static parts of every joint: ~90 primitives become ~35 meshes per character.
  const joints: THREE.Object3D[] = [pelvis, torso, head, armL, armR, foreL, foreR, thighL, thighR, kneeL, kneeR, eyes, eyeL, eyeR, ...(tail ? [tail] : []), ...ears];
  const skip = new Set<THREE.Object3D>([...joints, browL, browR, mouthSmile, mouthO, handHold, handHoldL]);
  root.updateMatrixWorld(true);
  for (const j of joints) bakeGroup(j, skip);
  bakeGroup(bag);
  bakeGroup(folder);

  return { root, pelvis, torso, head, armL, armR, foreL, foreR, thighL, thighR, kneeL, kneeR, eyeL, eyeR, eyes, browL, browR, mouthSmile, mouthO, tail, ears, handHold, handHoldL, bag, folder };
}
