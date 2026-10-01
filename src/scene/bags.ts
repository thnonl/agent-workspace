import * as THREE from 'three';
import { G, M, group, mesh, shade } from './kit';
import type { BagKind } from '../world/appearance';

/**
 * The bags people bring to the office: backpacks on the back, slings and messenger bags across the body, a bag on the chest,
 * and cases carried by the handle. The bag itself is a prop that follows the person (see PersonActor); the straps that cross
 * the body are part of the torso. Everything here is in rig units, the bag faces +z with its centre at the origin.
 */
export interface BagCarry {
  /** where the bag is while it is carried (rig units; x = the person's right, z = to the front) */
  x: number;
  y: number;
  z: number;
  /** turn of the bag while it is carried (a bag at the side faces outwards) */
  yaw: number;
  /** size of the bag next to the person */
  scale: number;
  /** height of its centre when it stands on the floor */
  floorY: number;
  /** carried by the right hand (at the handle) rather than on the body */
  byHand?: boolean;
  /** ...and rolling on its wheels on the floor, pulled by the handle (it follows the hand sideways only) */
  pulled?: boolean;
}

export interface BagBuild {
  model: THREE.Group;
  carry: BagCarry;
}

const GOLD = () => M('#ffd166', { metal: 0.5, rough: 0.35 });

export function buildBag(kind: BagKind, color: string): BagBuild {
  const body = M(color, { rough: kind === 'briefcase' || kind === 'suitcase' ? 0.45 : 0.65 });
  const dark = M(shade(color, -0.14), { rough: 0.7 });
  const light = M(shade(color, 0.1), { rough: 0.6 });
  const metal = M('#c9cdd8', { metal: 0.6, rough: 0.3 });
  const black = M('#2b2838', { rough: 0.6 });
  const m = group();
  const add = (o: THREE.Object3D) => m.add(o);

  switch (kind) {
    case 'backpack': {
      add(mesh(G.rbox(0.36, 0.44, 0.2, 0.07), body, 0, 0, 0));
      add(mesh(G.rbox(0.3, 0.14, 0.212, 0.05), dark, 0, 0.16, 0));
      add(mesh(G.rbox(0.24, 0.16, 0.06, 0.03), dark, 0, -0.08, 0.12));
      add(mesh(G.torus(0.05, 0.014, Math.PI, 6, 12), dark, 0, 0.26, 0));
      add(mesh(G.sphere(0.03, 8, 6), GOLD(), 0.1, 0.16, 0.11, { cast: false }));
      return { model: m, carry: { x: 0, y: 0.86, z: -0.3, yaw: 0, scale: 1.08, floorY: 0.23 } };
    }
    case 'rolltop': {
      // a tall waterproof pack: the top is rolled up and clipped down
      add(mesh(G.rbox(0.32, 0.5, 0.2, 0.06), body, 0, -0.02, 0));
      const roll = mesh(G.cyl(0.095, 0.095, 0.32, 18), dark, 0, 0.27, 0, { r: [0, 0, Math.PI / 2] });
      add(roll);
      add(mesh(G.torus(0.096, 0.012, Math.PI * 2, 6, 18), light, 0.13, 0.27, 0, { r: [0, Math.PI / 2, 0], cast: false }));
      add(mesh(G.torus(0.096, 0.012, Math.PI * 2, 6, 18), light, -0.13, 0.27, 0, { r: [0, Math.PI / 2, 0], cast: false }));
      add(mesh(G.rbox(0.05, 0.3, 0.02, 0.008), light, 0, 0.1, 0.108, { cast: false }));
      add(mesh(G.rbox(0.05, 0.034, 0.03, 0.01), metal, 0, 0.19, 0.115, { cast: false }));
      add(mesh(G.rbox(0.22, 0.12, 0.05, 0.02), dark, 0, -0.16, 0.125));
      return { model: m, carry: { x: 0, y: 0.88, z: -0.3, yaw: 0, scale: 1.05, floorY: 0.25 } };
    }
    case 'minipack': {
      add(mesh(G.rbox(0.27, 0.3, 0.15, 0.06), body, 0, 0, 0));
      add(mesh(G.rbox(0.23, 0.1, 0.16, 0.04), dark, 0, 0.11, 0));
      add(mesh(G.rbox(0.18, 0.11, 0.05, 0.025), light, 0, -0.07, 0.09));
      add(mesh(G.torus(0.04, 0.012, Math.PI, 6, 12), dark, 0, 0.18, 0));
      add(mesh(G.sphere(0.02, 8, 6), GOLD(), 0.07, 0.1, 0.085, { cast: false }));
      return { model: m, carry: { x: 0, y: 0.8, z: -0.27, yaw: 0, scale: 1.05, floorY: 0.17 } };
    }
    case 'sling': {
      // a small pouch on a strap, worn on the back and slid round to the hip
      add(mesh(G.rbox(0.3, 0.19, 0.09, 0.05), body, 0, 0, 0));
      add(mesh(G.rbox(0.3, 0.08, 0.1, 0.035), dark, 0, 0.055, 0));
      add(mesh(G.box(0.2, 0.012, 0.012), metal, 0, 0.0, 0.055, { cast: false }));
      add(mesh(G.rbox(0.06, 0.03, 0.02, 0.01), light, -0.09, -0.05, 0.05, { cast: false }));
      return { model: m, carry: { x: -0.25, y: 0.52, z: -0.13, yaw: -Math.PI / 2 - 0.5, scale: 1.05, floorY: 0.1 } };
    }
    case 'messenger': {
      add(mesh(G.rbox(0.36, 0.27, 0.1, 0.045), body, 0, 0, 0));
      add(mesh(G.rbox(0.37, 0.15, 0.112, 0.04), dark, 0, 0.065, 0.004));
      add(mesh(G.rbox(0.05, 0.05, 0.02, 0.01), GOLD(), 0, 0.0, 0.06, { cast: false }));
      add(mesh(G.rbox(0.2, 0.09, 0.03, 0.015), light, 0, -0.07, 0.06, { cast: false }));
      return { model: m, carry: { x: -0.34, y: 0.48, z: -0.03, yaw: -Math.PI / 2, scale: 1.05, floorY: 0.14 } };
    }
    case 'chest': {
      // a compact pack worn on the front
      add(mesh(G.rbox(0.32, 0.23, 0.13, 0.06), body, 0, 0, 0));
      add(mesh(G.rbox(0.26, 0.09, 0.14, 0.04), dark, 0, 0.07, 0));
      add(mesh(G.box(0.22, 0.012, 0.012), metal, 0, -0.02, 0.07, { cast: false }));
      add(mesh(G.rbox(0.05, 0.03, 0.02, 0.01), light, 0.09, -0.06, 0.07, { cast: false }));
      add(mesh(G.rbox(0.03, 0.05, 0.03, 0.012), black, -0.14, 0.07, 0.05, { cast: false }));
      add(mesh(G.rbox(0.03, 0.05, 0.03, 0.012), black, 0.14, 0.07, 0.05, { cast: false }));
      return { model: m, carry: { x: 0, y: 0.8, z: 0.27, yaw: 0, scale: 1.0, floorY: 0.14 } };
    }
    case 'tote': {
      // an open tote with a stripe, carried by its handles
      add(mesh(G.rbox(0.3, 0.27, 0.1, 0.03), body, 0, -0.02, 0));
      add(mesh(G.rbox(0.302, 0.05, 0.102, 0.015), light, 0, 0.09, 0, { cast: false }));
      add(mesh(G.rbox(0.302, 0.03, 0.102, 0.012), dark, 0, -0.06, 0, { cast: false }));
      for (const z of [-0.03, 0.03]) add(mesh(G.torus(0.085, 0.013, Math.PI, 6, 16), dark, 0, 0.115, z));
      add(mesh(G.rbox(0.13, 0.11, 0.02, 0.012), light, 0, -0.03, 0.055, { cast: false }));
      return { model: m, carry: { x: 0.31, y: 0.26, z: 0.0, yaw: Math.PI / 2, scale: 1.0, floorY: 0.16, byHand: true } };
    }
    case 'suitcase': {
      // a small cabin case on wheels, pulled beside the person by its extended handle
      add(mesh(G.rbox(0.34, 0.44, 0.19, 0.045), body, 0, 0, 0));
      for (const x of [-0.09, 0, 0.09]) add(mesh(G.rbox(0.022, 0.4, 0.2, 0.008), dark, x, 0, 0, { cast: false }));
      for (const [x, y] of [[-0.15, -0.2], [0.15, -0.2], [-0.15, 0.2], [0.15, 0.2]] as const) add(mesh(G.rbox(0.05, 0.05, 0.21, 0.015), black, x, y, 0, { cast: false }));
      for (const x of [-0.13, 0.13]) add(mesh(G.cyl(0.032, 0.032, 0.03, 12), black, x, -0.235, -0.05, { r: [0, 0, Math.PI / 2] }));
      // the telescopic handle: two rods and a grip
      for (const x of [-0.08, 0.08]) add(mesh(G.cyl(0.008, 0.008, 0.3, 6), metal, x, 0.3, -0.06, { cast: false }));
      add(mesh(G.rbox(0.2, 0.026, 0.03, 0.012), black, 0, 0.455, -0.06));
      add(mesh(G.rbox(0.06, 0.02, 0.02, 0.008), light, 0, 0.0, 0.1, { cast: false }));
      return { model: m, carry: { x: 0.37, y: 0.27, z: -0.04, yaw: Math.PI / 2, scale: 1.0, floorY: 0.27, byHand: true, pulled: true } };
    }
    case 'briefcase':
    default: {
      add(mesh(G.rbox(0.38, 0.27, 0.1, 0.03), body, 0, 0, 0));
      add(mesh(G.torus(0.05, 0.012, Math.PI, 6, 14), black, 0, 0.135, 0, { s: [1.4, 1, 1] }));
      for (const x of [-0.19, 0.19]) for (const y of [-0.135, 0.135]) add(mesh(G.sphere(0.02, 8, 6), GOLD(), x, y, 0.0, { cast: false }));
      for (const x of [-0.1, 0.1]) add(mesh(G.rbox(0.045, 0.03, 0.02, 0.008), GOLD(), x, 0.1, 0.055, { cast: false }));
      add(mesh(G.rbox(0.36, 0.008, 0.102, 0.003), dark, 0, 0.0, 0, { cast: false }));
      return { model: m, carry: { x: 0.31, y: 0.3, z: 0.0, yaw: Math.PI / 2, scale: 1.0, floorY: 0.17, byHand: true } };
    }
  }
}

type Pt = readonly [number, number];

/** the bag straps over the torso: a chain of short bars that follow the body (torso space) */
export function buildStraps(kind: BagKind, color: string, frontZ: (x: number, y: number) => number): THREE.Group {
  const g = group();
  const mat = M(shade(color, -0.1), { rough: 0.75 });
  const bar = (a: Pt, b: Pt, w: number, sign: 1 | -1) => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rot = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const z = sign * (frontZ(mx, my) + 0.008);
    g.add(mesh(G.rbox(len + 0.03, w, 0.014, 0.005), mat, mx, my, z, { r: [0, 0, rot], cast: false }));
  };
  const chain = (pts: readonly Pt[], w: number, sign: 1 | -1) => {
    for (let i = 0; i + 1 < pts.length; i++) bar(pts[i], pts[i + 1], w, sign);
  };
  const mirror = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [-x, y] as const);
  switch (kind) {
    case 'backpack':
    case 'rolltop':
    case 'minipack': {
      // two shoulder straps that run down the chest to the sides of the pack
      const s: Pt[] = [[0.13, 0.56], [0.17, 0.42], [0.2, 0.24]];
      chain(s, 0.045, 1);
      chain(mirror(s), 0.045, 1);
      break;
    }
    case 'chest': {
      // straps over the shoulders to the pack in front, and crossing on the back
      const front: Pt[] = [[0.12, 0.52], [0.13, 0.44]];
      chain(front, 0.04, 1);
      chain(mirror(front), 0.04, 1);
      const back: Pt[] = [[0.13, 0.55], [0.09, 0.4], [0.02, 0.26]];
      chain(back, 0.04, -1);
      chain(mirror(back), 0.04, -1);
      break;
    }
    case 'sling':
    case 'messenger': {
      // from the right shoulder across the chest to the hip on the left (and the same on the back)
      const s: Pt[] = [[0.14, 0.57], [0.06, 0.43], [-0.05, 0.3], [-0.15, 0.18], [-0.22, 0.1]];
      chain(s, 0.04, 1);
      chain(s, 0.04, -1);
      break;
    }
    default:
  }
  return g;
}
