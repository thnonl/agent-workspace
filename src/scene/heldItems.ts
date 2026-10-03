import * as THREE from 'three';
import { G, M, MB, group, mesh } from './kit';
import { leafGeo } from './plants';

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
  /** a delivery box carried in both arms */
  parcel: THREE.Group;
  /** a flowerpot with a plant, carried in both arms */
  pot: THREE.Group;
  /** a cigarette with a glowing tip */
  cig: THREE.Group;
  /** puffs of smoke at the mouth (room space, pooled) */
  smoke: THREE.Mesh[];
  /** a phone (scrolling on the sofa / at the ear during a call); `phoneTilt` turns it, `phoneScreen` swaps between shared glow materials */
  phone: THREE.Group;
  phoneTilt: THREE.Group;
  phoneScreen: THREE.Mesh;
  /** a game controller held in both hands (the console in front of the sofa, the TV console) */
  pad: THREE.Group;
  /** a ping-pong paddle (blade up, facing forward) */
  paddle: THREE.Group;
  /** a plush toy won at the claw machine; `plushBody` takes the colour of the toy (PLUSH_MATS) */
  plush: THREE.Group;
  plushBody: THREE.Mesh[];
  /** the VR headset (a child of the head) and the two controllers (one per hand) */
  vrHead: THREE.Group;
  vrR: THREE.Group;
  vrL: THREE.Group;
}

/** the colours of the claw machine's plush toys (the same order as in the model) */
export const PLUSH_COLORS = ['#ff8fb1', '#ffd166', '#7cc9ff', '#9be89b', '#c9a0ff', '#ff9f68'];
export const PLUSH_MATS = PLUSH_COLORS.map((c) => M(c, { rough: 0.9 }));

/** a VR hand controller: a grip with a ring around the top */
function vrController(): THREE.Group {
  const g = group();
  g.add(mesh(G.capsule(0.022, 0.07, 4, 8), M('#20222e', { rough: 0.45 }), 0, 0, 0.02, { r: [Math.PI / 2 - 0.4, 0, 0], cast: false }));
  g.add(mesh(G.torus(0.04, 0.009, Math.PI * 2, 6, 16), M('#f4f6fb', { rough: 0.4 }), 0, 0.04, 0.05, { r: [0.5, 0, 0], cast: false }));
  g.add(mesh(G.sphere(0.008, 6, 5), MB('#46c2ff'), 0, 0.03, 0.06, { cast: false }));
  g.visible = false;
  return g;
}

/** the screen glow flickers between these shared materials (no per-frame allocation) */
export const PHONE_GLOWS = [MB('#9fd6ff'), MB('#bfe4ff'), MB('#8fc4f5'), MB('#d6efff')];
const _m = new THREE.Matrix4();
/** orientation of the phone (screen = local +y, top = local +z): held in front of the chest tilted towards the face / upright at the right ear with the screen towards the head */
export const Q_PHONE_CHEST = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.7071, -0.7071), new THREE.Vector3(0, 0.7071, 0.7071)));

const DROPS = 9;

/** cardboard box with a tape band (the delivery on the porch and the one in the arms) */
export function buildParcelBox(): THREE.Group {
  const box = group();
  box.add(mesh(G.rbox(0.36, 0.24, 0.28, 0.012), M('#c89b64', { rough: 0.85 }), 0, 0, 0));
  box.add(mesh(G.box(0.06, 0.247, 0.287), M('#ecdcae', { rough: 0.6 }), 0, 0, 0, { cast: false }));
  box.add(mesh(G.box(0.09, 0.06, 0.004), M('#ffffff', { rough: 0.7 }), 0.09, -0.02, 0.142, { cast: false }));
  return box;
}

/** a clay pot with a leafy plant (carried while tidying up; origin at the middle of the pot) */
export function buildPotPlant(color = '#e07a5f'): THREE.Group {
  const pot = group();
  pot.add(mesh(G.cyl(0.14, 0.1, 0.2, 18), M(color, { rough: 0.55 }), 0, 0, 0));
  pot.add(mesh(G.torus(0.14, 0.014, Math.PI * 2, 6, 18), M(color, { rough: 0.55 }), 0, 0.1, 0, { r: [Math.PI / 2, 0, 0] }));
  pot.add(mesh(G.cyl(0.125, 0.125, 0.012, 14), M('#3a2a22', { rough: 1 }), 0, 0.098, 0, { cast: false }));
  const green = M('#4fb86f', { rough: 0.65, side: THREE.DoubleSide });
  const green2 = M('#3fa864', { rough: 0.65, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const arm = group(0, 0.1, 0);
    arm.rotation.y = (i / 8) * Math.PI * 2 + 0.3;
    const lean = group();
    lean.rotation.x = 0.2 + (i % 3) * 0.28;
    lean.add(mesh(leafGeo(i % 2 ? 'oval' : 'blade', 0.3 + (i % 3) * 0.04, 0.1, 0.5, 0.25, 5), i % 2 ? green : green2, 0, 0, 0, { cast: false }));
    arm.add(lean);
    pot.add(arm);
  }
  return pot;
}

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
  // delivery box
  const parcel = buildParcelBox();
  parcel.visible = false;
  const pot = buildPotPlant();
  pot.visible = false;

  // cigarette: slanted forward and up, a glowing tip at the far end
  const cig = group();
  const cigInner = group();
  cigInner.rotation.x = 1.05;
  cigInner.add(mesh(G.cyl(0.011, 0.011, 0.15, 6), white, 0, 0, 0, { cast: false }));
  cigInner.add(mesh(G.cyl(0.0115, 0.0115, 0.04, 6), M('#e0903c', { rough: 0.6 }), 0, -0.055, 0, { cast: false }));
  cigInner.add(mesh(G.sphere(0.014, 6, 5), MB('#ff6a2a'), 0, 0.078, 0, { cast: false }));
  cig.add(cigInner);
  cig.visible = false;

  // smoke puffs (pooled, positioned every frame while somebody smokes)
  const smokeMat = new THREE.MeshBasicMaterial({ color: '#e6eaf0', transparent: true, opacity: 0.4, depthWrite: false });
  const smoke: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(G.sphere(0.05, 8, 6), smokeMat.clone());
    s.visible = false;
    fx.add(s);
    smoke.push(s);
  }
  // phone: dark body and a glowing screen on the top face
  const phone = group();
  const phoneTilt = group();
  phoneTilt.add(mesh(G.rbox(0.07, 0.012, 0.14, 0.008), M('#23252f', { rough: 0.4, metal: 0.3 }), 0, 0, 0, { cast: false }));
  const phoneScreen = mesh(G.box(0.06, 0.002, 0.125), PHONE_GLOWS[0], 0, 0.0068, 0, { cast: false });
  phoneTilt.add(phoneScreen);
  phoneTilt.quaternion.copy(Q_PHONE_CHEST);
  phone.add(phoneTilt);
  phone.visible = false;
  // game controller: a white body with two grips, black middle, the thumbsticks and the blue light bar; tilted towards the face like the phone
  const pad = group();
  const padTilt = group();
  const padWhite = M('#f4f6fb', { rough: 0.35 });
  const padBlack = M('#1b1d2a', { rough: 0.4 });
  padTilt.add(mesh(G.rbox(0.16, 0.035, 0.08, 0.016), padWhite, 0, 0, 0, { cast: false }));
  for (const sx of [-1, 1]) padTilt.add(mesh(G.capsule(0.024, 0.06, 4, 8), padWhite, sx * 0.065, -0.005, -0.045, { r: [Math.PI / 2 - 0.35, 0, sx * 0.25], cast: false }));
  padTilt.add(mesh(G.rbox(0.07, 0.038, 0.05, 0.012), padBlack, 0, 0.002, -0.01, { cast: false }));
  for (const sx of [-1, 1]) padTilt.add(mesh(G.cyl(0.012, 0.012, 0.02, 10), padBlack, sx * 0.025, 0.025, -0.015, { cast: false }));
  padTilt.add(mesh(G.box(0.07, 0.003, 0.006), MB('#46c2ff'), 0, 0.019, 0.03, { cast: false }));
  padTilt.quaternion.copy(Q_PHONE_CHEST);
  pad.add(padTilt);
  pad.visible = false;

  // ping-pong paddle: a round red blade standing up in front of the hand, the wooden handle down into the fist
  const paddle = group();
  paddle.add(mesh(G.cyl(0.075, 0.075, 0.012, 18), M('#e63946', { rough: 0.6 }), 0, 0.075, 0, { r: [Math.PI / 2, 0, 0], cast: false }));
  paddle.add(mesh(G.cyl(0.072, 0.072, 0.013, 18), M('#1b1d2a', { rough: 0.6 }), 0, 0.075, -0.001, { r: [Math.PI / 2, 0, 0], cast: false }));
  paddle.add(mesh(G.rbox(0.03, 0.1, 0.022, 0.006), M('#c8a274', { rough: 0.7 }), 0, -0.01, 0, { cast: false }));
  paddle.visible = false;

  // plush toy: a round body with ears, a face, little arms
  const plush = group();
  const plushBody: THREE.Mesh[] = [];
  const pb = mesh(G.sphere(0.085, 14, 10), PLUSH_MATS[0], 0, 0, 0, { s: [1, 0.95, 0.9], cast: false });
  const ph = mesh(G.sphere(0.065, 12, 10), PLUSH_MATS[0], 0, 0.11, 0.01, { cast: false });
  plushBody.push(pb, ph);
  plush.add(pb, ph);
  for (const sx of [-1, 1]) {
    const ear = mesh(G.sphere(0.028, 8, 6), PLUSH_MATS[0], sx * 0.045, 0.165, 0.0, { cast: false });
    const arm = mesh(G.sphere(0.03, 8, 6), PLUSH_MATS[0], sx * 0.08, 0.02, 0.04, { s: [0.8, 1.2, 0.8], cast: false });
    plushBody.push(ear, arm);
    plush.add(ear, arm);
    plush.add(mesh(G.sphere(0.011, 6, 5), MB('#1b1d2a'), sx * 0.024, 0.12, 0.068, { cast: false }));
  }
  plush.add(mesh(G.sphere(0.012, 6, 5), MB('#ff6f91'), 0, 0.1, 0.073, { cast: false }));
  plush.visible = false;

  // VR headset: a white visor over the eyes, a dark face plate, the strap round the head (head frame: centre of the head, face towards +z)
  const vrHead = group();
  vrHead.add(mesh(G.rbox(0.62, 0.27, 0.2, 0.07), M('#f4f6fb', { rough: 0.35 }), 0, -0.02, 0.4, { cast: false }));
  vrHead.add(mesh(G.rbox(0.56, 0.2, 0.02, 0.05), M('#20222e', { rough: 0.3 }), 0, -0.02, 0.505, { cast: false }));
  vrHead.add(mesh(G.plane(0.18, 0.03), MB('#46c2ff'), 0.12, 0.04, 0.517, { cast: false }));
  vrHead.add(mesh(G.torus(0.45, 0.035, Math.PI * 2, 6, 28), M('#20222e', { rough: 0.5 }), 0, 0.0, 0.0, { r: [Math.PI / 2 + 0.12, 0, 0], s: [1, 1.04, 1], cast: false }));
  vrHead.visible = false;
  const vrR = vrController();
  const vrL = vrController();
  return { cup, book, bookLeft, bookRight, can, bowl, spout, stream, drops, steam, fx, parcel, pot, cig, smoke, phone, phoneTilt, phoneScreen, pad, paddle, plush, plushBody, vrHead, vrR, vrL };
}
