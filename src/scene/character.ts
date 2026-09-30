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
  blazer: 'long', vest: 'long', cardigan: 'long', polo: 'short', coat: 'long', stripe: 'long',
};

/** The torso is a capsule (radius 0.235, straight between y 0.195 and 0.365), squashed to 0.86 in depth: these give the surface to hang details on. */
const TORSO_R = 0.235;
function torsoR(y: number): number {
  const dy = y < 0.195 ? y - 0.195 : y > 0.365 ? y - 0.365 : 0;
  return Math.sqrt(Math.max(0, TORSO_R * TORSO_R - dy * dy));
}
/** z of the front of the torso at (x, y) in torso space */
function frontZ(x: number, y: number): number {
  const r = torsoR(y);
  return 0.86 * Math.sqrt(Math.max(0, r * r - x * x));
}

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
  const shirtMat = M(a.shirt, { rough: 0.6 });
  const neckMat = M(a.neckColor, { rough: 0.55 });
  const gold = M('#ffd166', { metal: 0.55, rough: 0.3 });
  const leather = M('#3a3345', { rough: 0.45 });
  const eyeMat = M(a.eye, { rough: 0.25 });
  const white = M('#ffffff', { rough: 0.4 });

  const root = group();
  const pelvis = group();
  root.add(pelvis);

  // ------------------------------------------------------------------ legs
  const shortsLeg = a.bottom === 'shorts';
  const bareLeg = a.bottom === 'skirt' || a.bottom === 'none' || a.bottom === 'midi';
  const legs = (side: -1 | 1) => {
    const thigh = group(side * 0.125, HIP_Y, 0);
    thigh.add(mesh(G.capsule(0.098, 0.03), bareLeg ? skin : bottomMat, 0, -0.11, 0));
    const knee = group(0, -0.22, 0);
    thigh.add(knee);
    knee.add(mesh(G.capsule(0.088, 0.03), shortsLeg || bareLeg ? skin : bottomMat, 0, -0.1, 0));
    if (a.bottom === 'slacks') {
      // a pressed crease down the front of each leg
      const crease = M(shade(a.bottomColor, -0.08), { rough: 0.8 });
      thigh.add(mesh(G.box(0.012, 0.2, 0.012), crease, 0, -0.11, 0.097, { cast: false }));
      knee.add(mesh(G.box(0.012, 0.2, 0.012), crease, 0, -0.1, 0.087, { cast: false }));
    }
    if (a.bottom === 'joggers') knee.add(mesh(G.torus(0.088, 0.02, Math.PI * 2, 6, 16), accentMat, 0, -0.165, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
    // ---- shoes
    const sole = M(shade(a.shoes, -0.25), { rough: 0.7 });
    switch (a.shoeStyle) {
      case 'loafer':
        if (shortsLeg || bareLeg) knee.add(mesh(G.cyl(0.092, 0.092, 0.05, 14), white, 0, -0.145, 0)); // sock cuff
        knee.add(mesh(G.sphere(0.12, 18, 12), shoeMat, 0, -0.2, 0.05, { s: [0.84, 0.5, 1.5] }));
        knee.add(mesh(G.sphere(0.12, 14, 8), sole, 0, -0.243, 0.05, { s: [0.86, 0.14, 1.52], cast: false }));
        knee.add(mesh(G.sphere(0.05, 10, 8), M(shade(a.shoes, 0.08), { rough: 0.45 }), 0, -0.172, 0.115, { s: [1.5, 0.45, 0.9], cast: false }));
        knee.add(mesh(G.sphere(0.013, 8, 6), gold, 0, -0.166, 0.14, { cast: false }));
        break;
      case 'boot':
        knee.add(mesh(G.cyl(0.098, 0.106, 0.17, 16), shoeMat, 0, -0.085, 0));
        knee.add(mesh(G.torus(0.1, 0.014, Math.PI * 2, 6, 18), M(shade(a.shoes, 0.12), { rough: 0.5 }), 0, -0.005, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
        knee.add(mesh(G.sphere(0.12, 18, 12), shoeMat, 0, -0.19, 0.05, { s: [0.94, 0.66, 1.4] }));
        knee.add(mesh(G.sphere(0.12, 14, 8), sole, 0, -0.245, 0.05, { s: [0.96, 0.14, 1.42], cast: false }));
        break;
      case 'mary-jane':
        knee.add(mesh(G.cyl(0.092, 0.092, 0.055, 14), white, 0, -0.14, 0)); // sock
        knee.add(mesh(G.sphere(0.12, 18, 12), shoeMat, 0, -0.2, 0.048, { s: [0.9, 0.5, 1.38] }));
        knee.add(mesh(G.box(0.17, 0.022, 0.03), shoeMat, 0, -0.165, 0.06, { cast: false }));
        knee.add(mesh(G.sphere(0.014, 8, 6), gold, side * 0.085, -0.165, 0.06, { cast: false }));
        break;
      default:
        if (shortsLeg || bareLeg) knee.add(mesh(G.cyl(0.092, 0.092, 0.05, 14), white, 0, -0.145, 0)); // sock cuff
        knee.add(mesh(G.sphere(0.12, 18, 12), shoeMat, 0, -0.19, 0.045, { s: [0.92, 0.66, 1.42] }));
        knee.add(mesh(G.sphere(0.06, 10, 8), white, 0, -0.215, 0.13, { s: [1.5, 0.4, 0.9], cast: false }));
    }
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
  if (a.bottom === 'midi' && a.top !== 'coat') {
    // a long skirt down to the calves
    pelvis.add(mesh(G.cyl(0.2, 0.4, 0.42, 24), bottomMat, 0, HIP_Y - 0.14, 0));
    pelvis.add(mesh(G.torus(0.4, 0.014, Math.PI * 2, 6, 32), accentMat, 0, HIP_Y - 0.35, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
    pelvis.add(mesh(G.torus(0.21, 0.02, Math.PI * 2, 6, 24), accentMat, 0, HIP_Y + 0.03, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
  }
  if (a.top === 'coat') {
    // the coat flares below the waist all the way to the knees
    const coatDark = M(shade(a.topColor, -0.08), { rough: 0.75 });
    pelvis.add(mesh(G.cyl(0.21, 0.42, 0.42, 24), topMat, 0, HIP_Y - 0.15, 0));
    pelvis.add(mesh(G.torus(0.42, 0.014, Math.PI * 2, 6, 32), coatDark, 0, HIP_Y - 0.36, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
    // front closure along the slant of the skirt, with buttons
    pelvis.add(mesh(G.box(0.05, 0.47, 0.012), coatDark, 0, HIP_Y - 0.15, 0.318, { r: [-0.4636, 0, 0], cast: false }));
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      { const y = HIP_Y - 0.03 - t * 0.28; pelvis.add(mesh(G.sphere(0.016, 8, 6), coatDark, 0, y, 0.21 + 0.21 * ((HIP_Y + 0.06 - y) / 0.42) + 0.008, { cast: false })); }
    }
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
    case 'suit':
    case 'blazer': {
      const lapel = M(shade(a.topColor, -0.05));
      torso.add(mesh(G.box(0.16, 0.42, 0.03), shirtMat, 0, 0.36, 0.2, { r: [0.05, 0, 0], cast: false }));
      torso.add(mesh(G.box(0.07, 0.4, 0.05), lapel, -0.1, 0.36, 0.2, { r: [0.05, 0, 0.16] }));
      torso.add(mesh(G.box(0.07, 0.4, 0.05), lapel, 0.1, 0.36, 0.2, { r: [0.05, 0, -0.16] }));
      // the front closes below the lapels: seam, two buttons, pocket flaps
      torso.add(mesh(G.box(0.012, 0.18, 0.012), lapel, 0, 0.13, frontZ(0, 0.13) + 0.006, { cast: false }));
      for (const y of [0.2, 0.1]) torso.add(mesh(G.sphere(0.017, 8, 6), a.top === 'blazer' ? gold : lapel, 0.03, y, frontZ(0.03, y) + 0.012, { cast: false }));
      for (const side of [-1, 1]) torso.add(mesh(G.rbox(0.09, 0.022, 0.02, 0.008), lapel, side * 0.15, 0.09, frontZ(side * 0.15, 0.09) + 0.006, { r: [0, side * -0.3, side * 0.12], cast: false }));
      if (a.pocketSquare) {
        // folded square in the breast pocket
        const sq = M(a.neckColor, { rough: 0.6 });
        torso.add(mesh(G.box(0.05, 0.03, 0.014), M('#ffffff', { rough: 0.6 }), 0.15, 0.475, frontZ(0.15, 0.475) + 0.01, { r: [0, 0, 0.12], cast: false }));
        torso.add(mesh(G.cone(0.03, 0.04, 3), sq, 0.15, 0.5, frontZ(0.15, 0.475) + 0.012, { r: [0, 0, 0.1], s: [1, 1, 0.3], cast: false }));
      }
      // golden name badge (the director's)
      if (a.isDirector) torso.add(mesh(G.rbox(0.09, 0.05, 0.02, 0.01), M('#ffd166', { metal: 0.5, rough: 0.35 }), 0.14, 0.42, 0.21, { cast: false }));
      break;
    }
    case 'vest': {
      // waistcoat: the shirt shows as a V above the buttons
      torso.add(mesh(G.cone(0.11, 0.3, 4), shirtMat, 0, 0.46, frontZ(0, 0.46) + 0.006, { r: [Math.PI, Math.PI / 4, 0], s: [1, 1, 0.2], cast: false }));
      torso.add(mesh(G.box(0.1, 0.06, 0.05), shirtMat, -0.07, 0.57, 0.16, { r: [0.3, 0, 0.5], cast: false }));
      torso.add(mesh(G.box(0.1, 0.06, 0.05), shirtMat, 0.07, 0.57, 0.16, { r: [0.3, 0, -0.5], cast: false }));
      for (const y of [0.25, 0.18, 0.11]) torso.add(mesh(G.sphere(0.016, 8, 6), gold, 0, y, frontZ(0, y) + 0.012, { cast: false }));
      const welt = M(shade(a.topColor, -0.1));
      for (const side of [-1, 1]) torso.add(mesh(G.box(0.07, 0.012, 0.012), welt, side * 0.11, 0.14, frontZ(side * 0.11, 0.14) + 0.006, { r: [0, 0, side * 0.15], cast: false }));
      break;
    }
    case 'cardigan': {
      // an open knit over a tee, with buttons on one panel and two patch pockets
      const knit = M(shade(a.topColor, -0.1), { rough: 0.85 });
      torso.add(mesh(G.box(0.11, 0.46, 0.02), accentMat, 0, 0.34, frontZ(0, 0.34) + 0.005, { cast: false }));
      torso.add(mesh(G.torus(0.13, 0.036, Math.PI * 2, 8, 20), accentMat, 0, 0.6, 0, { r: [Math.PI / 2, 0, 0] }));
      for (const y of [0.44, 0.33, 0.22]) torso.add(mesh(G.sphere(0.018, 8, 6), knit, 0.085, y, frontZ(0.085, y) + 0.012, { cast: false }));
      for (const side of [-1, 1]) torso.add(mesh(G.rbox(0.07, 0.012, 0.014, 0.005), knit, side * 0.14, 0.2, frontZ(side * 0.14, 0.2) + 0.006, { r: [0, side * -0.55, side * 0.2], cast: false }));
      torso.add(mesh(G.rbox(0.03, 0.44, 0.03, 0.012), knit, -0.068, 0.34, frontZ(-0.068, 0.34) + 0.006, { cast: false }));
      torso.add(mesh(G.rbox(0.03, 0.44, 0.03, 0.012), knit, 0.068, 0.34, frontZ(0.068, 0.34) + 0.006, { cast: false }));
      break;
    }
    case 'polo': {
      const collar = M(shade(a.topColor, -0.07), { rough: 0.7 });
      torso.add(mesh(G.box(0.1, 0.06, 0.05), collar, -0.07, 0.57, 0.16, { r: [0.3, 0, 0.5] }));
      torso.add(mesh(G.box(0.1, 0.06, 0.05), collar, 0.07, 0.57, 0.16, { r: [0.3, 0, -0.5] }));
      torso.add(mesh(G.box(0.032, 0.15, 0.012), white, 0, 0.47, frontZ(0, 0.47) + 0.006, { cast: false }));
      for (const y of [0.5, 0.44]) torso.add(mesh(G.sphere(0.012, 8, 6), collar, 0, y, frontZ(0, y) + 0.012, { cast: false }));
      break;
    }
    case 'coat': {
      // trench coat: big collar, wide lapels, double-breasted buttons and a belt
      const dk = M(shade(a.topColor, -0.08), { rough: 0.75 });
      torso.add(mesh(G.box(0.11, 0.09, 0.05), dk, -0.09, 0.57, 0.15, { r: [0.35, 0, 0.6] }));
      torso.add(mesh(G.box(0.11, 0.09, 0.05), dk, 0.09, 0.57, 0.15, { r: [0.35, 0, -0.6] }));
      torso.add(mesh(G.box(0.07, 0.36, 0.045), dk, -0.075, 0.4, 0.195, { r: [0.05, 0, 0.18] }));
      torso.add(mesh(G.box(0.07, 0.36, 0.045), dk, 0.075, 0.4, 0.195, { r: [0.05, 0, -0.18] }));
      for (const y of [0.45, 0.34, 0.24]) for (const side of [-1, 1]) torso.add(mesh(G.sphere(0.017, 8, 6), leather, side * 0.075, y, frontZ(side * 0.075, y) + 0.02, { cast: false }));
      torso.add(mesh(G.torus(0.2, 0.022, Math.PI * 2, 6, 28), dk, 0, 0.11, 0, { r: [Math.PI / 2, 0, 0], s: [1.05, 0.9, 1] }));
      torso.add(mesh(G.rbox(0.05, 0.04, 0.02, 0.008), gold, 0, 0.11, frontZ(0, 0.11) + 0.02, { cast: false }));
      // shoulder straps
      for (const side of [-1, 1]) torso.add(mesh(G.rbox(0.09, 0.02, 0.05, 0.008), dk, side * 0.2, 0.59, 0.02, { r: [0, 0, side * -0.25] }));
      break;
    }
    case 'stripe': {
      // breton stripes: a ring every hand's breadth, following the body
      for (let y = 0.07; y < 0.56; y += 0.1) torso.add(mesh(G.cyl(torsoR(y) + 0.004, torsoR(y) + 0.004, 0.045, 32), accentMat, 0, y, 0, { s: [1, 1, 0.86], cast: false }));
      break;
    }
    case 'jacket':
      torso.add(mesh(G.box(0.02, 0.5, 0.03), white, 0, 0.32, 0.2, { cast: false }));
      torso.add(mesh(G.box(0.16, 0.36, 0.02), accentMat, 0, 0.3, 0.195, { cast: false }));
      torso.add(mesh(G.torus(0.14, 0.035, Math.PI * 2, 6, 20), topMat, 0, 0.58, 0, { r: [Math.PI / 2, 0, 0] }));
      break;
    default:
  }

  if (a.bottom === 'slacks' && a.top !== 'coat' && a.top !== 'dress') {
    // belt with a buckle at the waist
    torso.add(mesh(G.torus(0.19, 0.02, Math.PI * 2, 6, 28), leather, 0, 0.045, 0, { r: [Math.PI / 2, 0, 0], s: [1.08, 0.88, 1], cast: false }));
    torso.add(mesh(G.rbox(0.045, 0.034, 0.02, 0.008), gold, 0, 0.045, 0.172, { cast: false }));
  }

  // ------------------------------------------------------------------ neckwear
  switch (a.neckwear) {
    case 'tie':
      torso.add(mesh(G.box(0.06, 0.06, 0.03), neckMat, 0, 0.52, 0.215));
      torso.add(mesh(G.cone(0.055, 0.3, 4), neckMat, 0, 0.3, 0.215, { r: [Math.PI, Math.PI / 4, 0], s: [0.6, 1, 0.3] }));
      break;
    case 'bowtie':
      for (const side of [-1, 1]) torso.add(mesh(G.cone(0.07, 0.12, 4), neckMat, side * 0.06, 0.55, 0.225, { r: [0, Math.PI / 4, -side * Math.PI / 2], s: [1, 1, 0.55] }));
      torso.add(mesh(G.sphere(0.03, 8, 6), M(shade(a.neckColor, -0.1)), 0, 0.55, 0.23));
      break;
    case 'ascot':
      torso.add(mesh(G.sphere(0.055, 10, 8), neckMat, 0, 0.54, 0.205, { s: [1.3, 0.9, 0.7] }));
      torso.add(mesh(G.cone(0.075, 0.2, 4), neckMat, 0, 0.44, 0.21, { r: [Math.PI, Math.PI / 4, 0.12], s: [1, 1, 0.3] }));
      torso.add(mesh(G.sphere(0.014, 8, 6), gold, 0, 0.53, 0.245, { cast: false }));
      break;
    case 'pearls': {
      const pearl = M('#fff4f4', { rough: 0.25, metal: 0.1 });
      for (let i = 0; i < 11; i++) {
        const t = (i / 10 - 0.5) * 2.6;
        torso.add(mesh(G.sphere(0.02, 8, 6), pearl, Math.sin(t) * 0.18, 0.5 - 0.075 * Math.cos(t), Math.max(0.05, frontZ(Math.sin(t) * 0.18, 0.5 - 0.075 * Math.cos(t)) + 0.014), { cast: false }));
      }
      torso.add(mesh(G.sphere(0.028, 8, 6), M(a.neckColor, { rough: 0.3, metal: 0.3 }), 0, 0.41, frontZ(0, 0.41) + 0.02, { cast: false }));
      break;
    }
    case 'kerchief':
      torso.add(mesh(G.torus(0.125, 0.03, Math.PI * 2, 8, 22), neckMat, 0, 0.585, 0, { r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1] }));
      torso.add(mesh(G.cone(0.13, 0.17, 3), neckMat, 0, 0.5, 0.185, { r: [Math.PI, 0, 0], s: [1, 1, 0.25] }));
      break;
    case 'lanyard': {
      for (const side of [-1, 1]) torso.add(mesh(G.box(0.018, 0.4, 0.008), neckMat, side * 0.055, 0.41, frontZ(side * 0.055, 0.41) + 0.01, { r: [0, 0, -side * 0.28], cast: false }));
      torso.add(mesh(G.rbox(0.1, 0.14, 0.012, 0.006), white, 0, 0.2, frontZ(0, 0.2) + 0.012, { cast: false }));
      torso.add(mesh(G.box(0.1, 0.03, 0.014), neckMat, 0, 0.253, frontZ(0, 0.2) + 0.013, { cast: false }));
      torso.add(mesh(G.sphere(0.02, 8, 6), skin, 0, 0.2, frontZ(0, 0.2) + 0.02, { s: [1, 1, 0.3], cast: false }));
      break;
    }
    case 'scarf':
      torso.add(mesh(G.torus(0.19, 0.06, Math.PI * 2, 8, 24), neckMat, 0, 0.59, 0.0, { r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1] }));
      torso.add(mesh(G.rbox(0.1, 0.3, 0.05, 0.02), neckMat, 0.1, 0.44, 0.19, { r: [0.05, 0, -0.1] }));
      break;
    default:
  }

  // ------------------------------------------------------------------ arms
  const sleeve = SLEEVE[a.top];
  const sleeveMat = a.top === 'vest' ? shirtMat : topMat;
  const cuffMat = a.top === 'vest' || a.top === 'blazer' || a.top === 'suit' ? shirtMat : a.top === 'cardigan' || a.top === 'coat' ? M(shade(a.topColor, -0.1), { rough: 0.8 }) : accentMat;
  const arm = (side: -1 | 1) => {
    const shoulder = group(side * 0.285, 0.5, 0);
    shoulder.add(mesh(G.sphere(0.085, 12, 10), sleeve === 'none' ? skin : topMat, 0, 0, 0));
    shoulder.add(mesh(G.capsule(0.07, 0.09), sleeve === 'none' ? skin : sleeve === 'long' ? sleeveMat : topMat, 0, -0.11, 0));
    if (a.top === 'polo') shoulder.add(mesh(G.torus(0.074, 0.016, Math.PI * 2, 6, 16), accentMat, 0, -0.2, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
    const fore = group(0, -0.22, 0);
    shoulder.add(fore);
    fore.add(mesh(G.capsule(0.064, 0.07), sleeve === 'long' ? sleeveMat : skin, 0, -0.09, 0));
    if (sleeve === 'long') fore.add(mesh(G.torus(0.062, 0.018, Math.PI * 2, 6, 14), cuffMat, 0, -0.16, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
    // ---- watch, bracelets or a sweat band on the left wrist (the right hand holds things)
    if (side === -1 && a.wrist !== 'none') {
      if (a.wrist === 'watch') {
        fore.add(mesh(G.torus(0.07, 0.013, Math.PI * 2, 6, 18), leather, 0, -0.14, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
        fore.add(mesh(G.rbox(0.02, 0.058, 0.058, 0.008), gold, -0.074, -0.14, 0, { cast: false }));
        fore.add(mesh(G.plane(0.046, 0.046), MB('#1d2134'), -0.0855, -0.14, 0, { r: [0, -Math.PI / 2, 0], cast: false }));
      } else if (a.wrist === 'bracelet') {
        for (let i = 0; i < 3; i++) fore.add(mesh(G.torus(0.069, 0.008, Math.PI * 2, 6, 18), i === 1 ? accMat : gold, 0, -0.125 - i * 0.022, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
      } else {
        fore.add(mesh(G.torus(0.07, 0.026, Math.PI * 2, 6, 18), accMat, 0, -0.14, 0, { r: [Math.PI / 2, 0, 0], s: [1, 1, 1] }));
      }
    }
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

  // earrings
  if (a.earrings !== 'none') {
    for (const side of [-1, 1]) {
      if (a.earrings === 'studs') head.add(mesh(G.sphere(0.024, 8, 6), gold, side * 0.44, -0.1, 0.03, { cast: false }));
      else if (a.earrings === 'hoops') head.add(mesh(G.torus(0.05, 0.009, Math.PI * 2, 6, 18), gold, side * 0.445, -0.14, 0.03, { r: [0, Math.PI / 2, 0], cast: false }));
      else {
        head.add(mesh(G.cyl(0.006, 0.006, 0.07, 6), gold, side * 0.445, -0.13, 0.03, { cast: false }));
        head.add(mesh(G.sphere(0.028, 8, 6), M(a.neckColor, { rough: 0.25, metal: 0.2 }), side * 0.445, -0.185, 0.03, { cast: false }));
      }
    }
  }

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

  // -------------------------------------------------------------- eyewear
  const dark = M('#3a3345', { rough: 0.4 });
  switch (a.eyewear) {
    case 'glasses':
    case 'round-glasses': {
      const r = a.eyewear === 'glasses' ? 0.1 : 0.115;
      for (const side of [-1, 1]) head.add(mesh(G.torus(r, 0.013, Math.PI * 2, 6, 22), a.eyewear === 'glasses' ? dark : accMat, side * 0.16, -0.03, 0.4, { cast: false, s: [a.eyewear === 'glasses' ? 1.15 : 1, 1, 1] }));
      head.add(mesh(G.box(0.07, 0.014, 0.014), dark, 0, -0.01, 0.41, { cast: false }));
      for (const side of [-1, 1]) head.add(mesh(G.box(0.014, 0.014, 0.3), dark, side * 0.285, -0.02, 0.26, { cast: false, r: [0, side * -0.25, 0] }));
      break;
    }
    case 'sunglasses': {
      const lens = M('#1e1a2a', { rough: 0.12, metal: 0.25 });
      for (const side of [-1, 1]) {
        head.add(mesh(G.cyl(0.108, 0.108, 0.016, 22), lens, side * 0.16, -0.03, 0.402, { cast: false, s: [1.18, 1, 0.9], r: [Math.PI / 2, 0, 0] }));
        head.add(mesh(G.torus(0.108, 0.012, Math.PI * 2, 6, 22), dark, side * 0.16, -0.03, 0.408, { cast: false, s: [1.18, 0.9, 1] }));
        head.add(mesh(G.sphere(0.014, 6, 4), MB('#ffffff', 0.6), side * 0.16 - 0.045, 0.0, 0.42, { cast: false }));
      }
      head.add(mesh(G.box(0.07, 0.016, 0.016), dark, 0, -0.005, 0.412, { cast: false }));
      for (const side of [-1, 1]) head.add(mesh(G.box(0.016, 0.016, 0.3), dark, side * 0.29, -0.012, 0.26, { cast: false, r: [0, side * -0.25, 0] }));
      break;
    }
    case 'cateye': {
      for (const side of [-1, 1]) {
        head.add(mesh(G.torus(0.095, 0.014, Math.PI * 2, 6, 22), accMat, side * 0.16, -0.03, 0.4, { cast: false, s: [1.25, 0.82, 1], r: [0, 0, side * 0.22] }));
        head.add(mesh(G.box(0.05, 0.022, 0.014), accMat, side * 0.265, 0.005, 0.4, { cast: false, r: [0, 0, side * 0.55] }));
      }
      head.add(mesh(G.box(0.06, 0.014, 0.014), accMat, 0, 0.0, 0.41, { cast: false }));
      for (const side of [-1, 1]) head.add(mesh(G.box(0.014, 0.014, 0.3), accMat, side * 0.29, 0.005, 0.26, { cast: false, r: [0, side * -0.25, 0] }));
      break;
    }
    case 'monocle': {
      head.add(mesh(G.torus(0.108, 0.012, Math.PI * 2, 6, 22), gold, 0.16, -0.03, 0.404, { cast: false }));
      head.add(mesh(G.circle(0.098, 20), MB('#ffffff', 0.18), 0.16, -0.03, 0.4, { cast: false }));
      // the chain hangs from the rim down past the cheek
      head.add(mesh(G.cyl(0.004, 0.004, 0.36, 5), gold, 0.29, -0.2, 0.36, { cast: false, r: [0, 0, 0.12] }));
      break;
    }
    default:
  }

  // ------------------------------------------------------------------ hats
  const hatG = group();
  hair.add(hatG);
  const hatMat = M(a.hatColor, { rough: 0.62 });
  const hatDark = M(shade(a.hatColor, -0.14), { rough: 0.65 });
  const hatLum = new THREE.Color(a.hatColor).getHSL({ h: 0, s: 0, l: 0 }).l;
  const band = M(shade(a.hatColor, hatLum > 0.55 ? -0.3 : 0.32), { rough: 0.55 });
  const ribbon = M(a.accessoryColor, { rough: 0.5 });
  const brimRim = (r: number, y: number, z: number, m: THREE.Material, tube = 0.016) =>
    hatG.add(mesh(G.torus(r, tube, Math.PI * 2, 6, 40), m, 0, y, z, { r: [Math.PI / 2, 0, 0], cast: false }));
  switch (a.hat) {
    case 'beanie':
      hatG.add(mesh(G.cap(0.5, 24, 14, Math.PI * 0.52), hatMat, 0, 0.055, -0.02, { s: [1, 0.95, 1.02], r: [-0.28, 0, 0] }));
      hatG.add(mesh(G.torus(0.46, 0.05, Math.PI * 2, 8, 28), hatDark, 0, 0.14, 0.0, { r: [Math.PI / 2 - 0.28, 0, 0], s: [1, 1, 1] }));
      hatG.add(mesh(G.sphere(0.09, 10, 8), white, 0, 0.5, -0.12));
      break;
    case 'cap':
      hatG.add(mesh(G.cap(0.49, 24, 14, Math.PI * 0.5), hatMat, 0, 0.06, -0.02, { s: [1, 0.95, 1.02], r: [-0.3, 0, 0] }));
      hatG.add(mesh(G.cyl(0.3, 0.3, 0.03, 20), hatDark, 0, 0.16, 0.36, { s: [1.05, 1, 0.9], r: [0.28, 0, 0] }));
      hatG.add(mesh(G.sphere(0.04, 8, 6), white, 0, 0.5, -0.08, { cast: false }));
      break;
    case 'beret':
      hatG.add(mesh(G.sphere(0.4, 22, 14), hatMat, 0.05, 0.36, -0.01, { s: [1.02, 0.34, 1.0], r: [0.08, 0, -0.16] }));
      hatG.add(mesh(G.torus(0.335, 0.02, Math.PI * 2, 6, 30), hatDark, 0, 0.245, -0.005, { r: [Math.PI / 2 - 0.02, 0, 0], s: [1, 0.95, 1], cast: false }));
      hatG.add(mesh(G.cyl(0.014, 0.02, 0.05, 8), hatDark, 0.06, 0.505, -0.01, { cast: false }));
      break;
    case 'fedora':
      hatG.rotation.x = 0.05;
      hatG.add(mesh(G.cyl(0.24, 0.3, 0.24, 24), hatMat, 0, 0.42, -0.01));
      hatG.add(mesh(G.cyl(0.302, 0.302, 0.055, 24), band, 0, 0.335, -0.01, { cast: false }));
      hatG.add(mesh(G.cyl(0.58, 0.58, 0.03, 36), hatMat, 0, 0.3, 0.03, { s: [1, 1, 1.05] }));
      brimRim(0.58, 0.31, 0.03, hatDark);
      // the pinch in the crown
      hatG.add(mesh(G.box(0.05, 0.03, 0.26), hatDark, 0, 0.545, -0.01, { cast: false }));
      break;
    case 'tophat':
      hatG.add(mesh(G.cyl(0.26, 0.27, 0.4, 24), hatMat, 0, 0.5, -0.01));
      hatG.add(mesh(G.torus(0.262, 0.014, Math.PI * 2, 6, 28), hatDark, 0, 0.7, -0.01, { r: [Math.PI / 2, 0, 0], cast: false }));
      hatG.add(mesh(G.cyl(0.274, 0.274, 0.075, 24), band, 0, 0.36, -0.01, { cast: false }));
      hatG.add(mesh(G.cyl(0.42, 0.42, 0.03, 32), hatMat, 0, 0.3, 0.02));
      brimRim(0.42, 0.31, 0.02, hatDark);
      break;
    case 'bowler':
      hatG.add(mesh(G.cap(0.33, 24, 14, Math.PI * 0.55), hatMat, 0, 0.29, -0.01, { s: [1, 1.2, 1.08] }));
      hatG.add(mesh(G.cyl(0.336, 0.336, 0.045, 24), band, 0, 0.3, -0.01, { cast: false }));
      hatG.add(mesh(G.cyl(0.42, 0.42, 0.025, 32), hatMat, 0, 0.25, 0.02));
      brimRim(0.42, 0.262, 0.02, hatDark, 0.014);
      break;
    case 'bucket':
      hatG.add(mesh(G.cyl(0.31, 0.34, 0.2, 24), hatMat, 0, 0.38, 0));
      hatG.add(mesh(G.cyl(0.34, 0.52, 0.07, 32), hatMat, 0, 0.265, 0.02));
      hatG.add(mesh(G.cyl(0.345, 0.345, 0.03, 24), band, 0, 0.33, 0, { cast: false }));
      break;
    case 'newsboy':
      hatG.add(mesh(G.sphere(0.44, 22, 16), hatMat, 0, 0.27, 0, { s: [1.03, 0.42, 1.08], r: [0.12, 0, 0] }));
      hatG.add(mesh(G.cyl(0.22, 0.22, 0.02, 20), hatDark, 0, 0.22, 0.4, { s: [1.25, 1, 0.75], r: [0.22, 0, 0] }));
      hatG.add(mesh(G.sphere(0.03, 8, 6), hatDark, 0, 0.455, -0.02, { cast: false }));
      break;
    case 'sunhat':
      hatG.add(mesh(G.cap(0.31, 24, 14, Math.PI * 0.5), hatMat, 0, 0.29, -0.01, { s: [1, 0.85, 1] }));
      hatG.add(mesh(G.cyl(0.36, 0.72, 0.05, 40), hatMat, 0, 0.27, 0.03));
      hatG.add(mesh(G.torus(0.31, 0.03, Math.PI * 2, 6, 30), ribbon, 0, 0.32, -0.01, { r: [Math.PI / 2, 0, 0], cast: false }));
      for (const side of [-1, 1]) hatG.add(mesh(G.cone(0.06, 0.12, 8), ribbon, 0.3 + side * 0.06, 0.34, 0.14, { r: [0, 0, side * -Math.PI / 2 - 0.4], cast: false }));
      break;
    default:
  }

  // ------------------------------------------------- head accessories (hair and ears)
  switch (a.accessory) {
    case 'headphones':
      head.add(mesh(G.torus(0.47, 0.03, Math.PI, 8, 24), dark, 0, 0.0, 0, { r: [0, 0, 0], s: [1, 0.98, 1] }));
      for (const side of [-1, 1]) {
        head.add(mesh(G.cyl(0.12, 0.12, 0.09, 18), accMat, side * 0.46, -0.02, 0, { r: [0, 0, Math.PI / 2] }));
        head.add(mesh(G.cyl(0.085, 0.085, 0.1, 16), dark, side * 0.48, -0.02, 0, { r: [0, 0, Math.PI / 2], cast: false }));
      }
      break;
    case 'earmuffs':
      head.add(mesh(G.torus(0.47, 0.024, Math.PI, 8, 24), dark, 0, 0.0, 0, { s: [1, 0.98, 1] }));
      for (const side of [-1, 1]) head.add(mesh(G.sphere(0.13, 14, 10), accMat, side * 0.47, -0.03, 0, { s: [0.7, 1, 1] }));
      break;
    case 'bow':
      for (const side of [-1, 1]) hair.add(mesh(G.cone(0.1, 0.2, 10), accMat, 0.3 + side * 0.12, 0.38, 0.14, { r: [0, 0, side * -Math.PI / 2 - 0.5] }));
      hair.add(mesh(G.sphere(0.05, 8, 6), M(shade(a.accessoryColor, -0.1)), 0.3, 0.38, 0.14));
      break;
    case 'headband':
      hair.add(mesh(G.torus(0.47, 0.025, Math.PI, 8, 24), accMat, 0, 0.02, 0.02, { r: [0, 0, 0], s: [1, 0.98, 1] }));
      break;
    case 'hairclip':
      for (const [x, y, z, rz] of [[0.25, 0.24, 0.31, -0.6], [0.31, 0.16, 0.27, -0.75]] as const) {
        hair.add(mesh(G.rbox(0.1, 0.03, 0.022, 0.01), accMat, x, y, z, { r: [0.3, 0.55, rz], cast: false }));
      }
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
      hair.add(mesh(G.cyl(0.2, 0.22, 0.09, 20), gold, 0, 0.47, -0.02, { r: [-0.15, 0, 0] }));
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        hair.add(mesh(G.cone(0.05, 0.13, 6), gold, Math.sin(ang) * 0.2, 0.56, Math.cos(ang) * 0.2 - 0.03));
        hair.add(mesh(G.sphere(0.022, 6, 4), M('#ff5d73'), Math.sin(ang) * 0.2, 0.63, Math.cos(ang) * 0.2 - 0.03, { cast: false }));
      }
      break;
    }
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
