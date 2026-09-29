import * as THREE from 'three';
import { G, M, MB, group, mesh } from './kit';

/**
 * Small things a character picks up during a break: a paper cup, a book, a watering can – plus the
 * water effects (tap stream, drops from the can). The three items are children of the right hand;
 * `PersonActor` keeps them upright every frame.
 */
export interface HeldItems {
  cup: THREE.Group;
  book: THREE.Group;
  bookLeft: THREE.Group;
  bookRight: THREE.Group;
  can: THREE.Group;
  /** a bowl of noodles with chopsticks */
  bowl: THREE.Group;
  /** tip of the can's spout */
  spout: THREE.Object3D;
  /** tap water (room space, added to the character's outer group) */
  stream: THREE.Mesh;
  drops: THREE.Mesh[];
  /** puffs of steam over the pan (room space) */
  steam: THREE.Mesh[];
  fx: THREE.Group;
}

const DROPS = 9;

export function buildHeldItems(accent: string): HeldItems {
  const white = M('#ffffff', { rough: 0.5 });

  // paper cup with a coloured band and a bit of water
  const cup = group();
  cup.add(mesh(G.cyl(0.056, 0.04, 0.11, 16), white, 0, 0, 0));
  cup.add(mesh(G.cyl(0.058, 0.047, 0.04, 16), M(accent, { rough: 0.5 }), 0, -0.005, 0, { cast: false }));
  cup.add(mesh(G.cyl(0.05, 0.05, 0.006, 14), MB('#8fd8ff'), 0, 0.048, 0, { cast: false }));
  cup.visible = false;

  // book: a spine and two halves that open like wings
  const book = group();
  const cover = M(accent, { rough: 0.6 });
  const pages = M('#fff4d6', { rough: 0.9 });
  const half = (side: -1 | 1) => {
    const g = group(0, 0, 0);
    g.add(mesh(G.rbox(0.15, 0.04, 0.22, 0.008), cover, side * 0.075, 0, 0));
    g.add(mesh(G.box(0.14, 0.03, 0.2), pages, side * 0.075, 0.012, 0, { cast: false }));
    book.add(g);
    return g;
  };
  const bookLeft = half(-1);
  const bookRight = half(1);
  book.add(mesh(G.box(0.014, 0.04, 0.22), M('#3a3d50', { rough: 0.6 }), 0, 0, 0, { cast: false }));
  book.visible = false;

  // watering can: body, spout with a rose, handle
  const can = group();
  const tin = M('#59a9e6', { rough: 0.35, metal: 0.25 });
  can.add(mesh(G.cyl(0.075, 0.088, 0.13, 18), tin, 0, 0, 0));
  can.add(mesh(G.cyl(0.078, 0.078, 0.014, 18), M('#3d86c8', { rough: 0.4, metal: 0.25 }), 0, 0.068, 0, { cast: false }));
  can.add(mesh(G.cyl(0.016, 0.026, 0.19, 8), tin, 0, 0.04, 0.14, { r: [-0.95, 0, 0] }));
  can.add(mesh(G.cyl(0.04, 0.03, 0.03, 12), M('#3d86c8', { rough: 0.4 }), 0, 0.125, 0.225, { r: [-0.95, 0, 0] }));
  can.add(mesh(G.torus(0.06, 0.012, Math.PI, 6, 14), tin, 0, 0.02, -0.075, { r: [0, 0, Math.PI / 2] , cast: false }));
  const spout = new THREE.Object3D();
  spout.position.set(0, 0.145, 0.25);
  can.add(spout);
  can.visible = false;

  // bowl of noodles with two chopsticks
  const bowl = group();
  bowl.add(mesh(G.cyl(0.075, 0.042, 0.07, 18), M('#ffffff', { rough: 0.35 }), 0, 0, 0));
  bowl.add(mesh(G.cyl(0.077, 0.06, 0.02, 18), M(accent, { rough: 0.4 }), 0, 0.02, 0, { cast: false }));
  bowl.add(mesh(G.sphere(0.066, 12, 8), M('#f3d27a', { rough: 0.8 }), 0, 0.04, 0, { cast: false, s: [1, 0.45, 1] }));
  bowl.add(mesh(G.sphere(0.018, 6, 5), M('#79c56b', { rough: 0.8 }), 0.02, 0.066, 0.02, { cast: false }));
  bowl.add(mesh(G.sphere(0.016, 6, 5), M('#ff8a65', { rough: 0.8 }), -0.025, 0.064, -0.01, { cast: false }));
  const stick = M('#c98f55', { rough: 0.6 });
  bowl.add(mesh(G.cyl(0.006, 0.005, 0.2, 6), stick, 0.012, 0.11, 0.03, { r: [0.5, 0, 0.12], cast: false }));
  bowl.add(mesh(G.cyl(0.006, 0.005, 0.2, 6), stick, -0.012, 0.11, 0.035, { r: [0.5, 0, -0.1], cast: false }));
  bowl.visible = false;

  // water: a thin stream from the tap and drops from the can
  const fx = new THREE.Group();
  const stream = new THREE.Mesh(G.cyl(0.012, 0.012, 0.1, 6), new THREE.MeshBasicMaterial({ color: '#8fd8ff', transparent: true, opacity: 0.75 }));
  stream.visible = false;
  fx.add(stream);
  const dropMat = new THREE.MeshBasicMaterial({ color: '#8fd8ff', transparent: true, opacity: 0.85 });
  const drops: THREE.Mesh[] = [];
  for (let i = 0; i < DROPS; i++) {
    const d = new THREE.Mesh(G.sphere(0.02, 6, 5), dropMat);
    d.visible = false;
    fx.add(d);
    drops.push(d);
  }
  // steam over the pan
  const steamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
  const steam: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(G.sphere(0.06, 8, 6), steamMat.clone());
    s.visible = false;
    fx.add(s);
    steam.push(s);
  }
  return { cup, book, bookLeft, bookRight, can, bowl, spout, stream, drops, steam, fx };
}
