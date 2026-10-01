import * as THREE from 'three';
import { Rng } from '../util/rng';
import { G, M, MB, group, mesh } from './kit';
import { bakeGroup } from './bake';

export interface LaptopRig {
  root: THREE.Group;
  lid: THREE.Group;
  logo: THREE.Mesh;
  lines: THREE.Mesh[];
  sparks: THREE.Mesh[];
  /** what is on the screen when the person does something on the computer other than work (one at a time; none shown: the code lines) */
  screens: Record<ScreenMode, THREE.Group>;
  /** the progress bar of the video, the moving blocks of the game, the rings round the faces of the video call */
  videoBar: THREE.Mesh;
  gameBlocks: THREE.Mesh[];
  callRings: THREE.Mesh[];
}

export type ScreenMode = 'video' | 'game' | 'call' | 'shop';

/** One laptop model: the shell, the deck around the keys, the keys, the screen, its size and a few extras. */
interface Model {
  body: string;
  deck: string;
  key: string;
  screen: string;
  /** width, thickness (the depth is the same for all: the hinge and the desk layout expect it) */
  w: number;
  t: number;
  /** corner radius of the shell */
  r: number;
  metal?: number;
  rough?: number;
  /** lid logo: the accent colour glows unless a fixed colour is given */
  logo?: string;
  /** RGB keyboard: the keys glow in the accent colours */
  rgb?: boolean;
  /** vent slots on the lid and a light strip along the front edge */
  vents?: boolean;
  /** how many round stickers sit on the lid */
  stickers?: number;
  /** a coloured band across the palm rest / lid */
  band?: string;
  /** keys are round (typewriter look) */
  roundKeys?: boolean;
}

const MODELS: Model[] = [
  { body: '#eef1f8', deck: '#2b3042', key: '#464d66', screen: '#1d2134', w: 0.4, t: 0.026, r: 0.012, metal: 0.15, rough: 0.45 }, // silver ultrabook
  { body: '#5d6270', deck: '#20232f', key: '#343949', screen: '#141726', w: 0.42, t: 0.028, r: 0.012, metal: 0.5, rough: 0.35, logo: '#e9ecf5' }, // space grey pro
  { body: '#ffc2d6', deck: '#fff1f6', key: '#ff9fc0', screen: '#2a2138', w: 0.38, t: 0.024, r: 0.016, stickers: 3 }, // pink
  { body: '#b8ecd9', deck: '#effaf5', key: '#7fd3b6', screen: '#1b2b2b', w: 0.39, t: 0.024, r: 0.016, stickers: 2 }, // mint
  { body: '#cdbdff', deck: '#f4efff', key: '#a58bff', screen: '#221d3a', w: 0.39, t: 0.024, r: 0.016, stickers: 3 }, // lavender
  { body: '#ffe08a', deck: '#fff8dd', key: '#f2c14e', screen: '#2b2618', w: 0.38, t: 0.024, r: 0.016, stickers: 2 }, // sunny
  { body: '#a9d8ff', deck: '#eef7ff', key: '#6fb4f2', screen: '#16243a', w: 0.4, t: 0.025, r: 0.014, band: '#ffffff' }, // sky
  { body: '#22242e', deck: '#14151c', key: '#2e3140', screen: '#0f1119', w: 0.44, t: 0.036, r: 0.008, metal: 0.3, rough: 0.4, rgb: true, vents: true, logo: '#ff5d73' }, // gaming
  { body: '#e6dcc6', deck: '#cfc5ad', key: '#b9ae94', screen: '#12261c', w: 0.42, t: 0.042, r: 0.004, rough: 0.7, roundKeys: true, logo: '#8fa08a' }, // retro beige
  { body: '#ffffff', deck: '#c9a37a', key: '#e6e6ea', screen: '#1d2134', w: 0.4, t: 0.022, r: 0.012, rough: 0.4 }, // white with a wooden palm rest
  { body: '#ff8fab', deck: '#3a2f45', key: '#5a4a70', screen: '#1d1a2c', w: 0.4, t: 0.026, r: 0.014, stickers: 4 }, // coral, sticker-covered
  { body: '#3a4a7a', deck: '#171c2e', key: '#2a3350', screen: '#0e1322', w: 0.41, t: 0.027, r: 0.012, metal: 0.35, rough: 0.4, band: '#ffd166' }, // navy
  { body: '#2f3a34', deck: '#141a17', key: '#243029', screen: '#0d1611', w: 0.42, t: 0.03, r: 0.01, metal: 0.25, rough: 0.5, logo: '#8fd694' }, // forest green
  { body: '#fff3e0', deck: '#5a3d2b', key: '#7a5a44', screen: '#241c17', w: 0.38, t: 0.026, r: 0.016, rough: 0.6, stickers: 1 }, // cream with brown deck
];

export const LAPTOP_MODELS = MODELS.length;
const STICKERS = ['#ff5d73', '#ffd166', '#6ec6ff', '#b79bff', '#5ed3b0', '#ffffff', '#ff9ec4'];

/**
 * A closed laptop lies flat, hinge at +z. `lid.rotation.x` = opening angle (0 closed → ~1.85 open).
 * `seed` picks the model (see MODELS); the depth (0.28) is the same for all of them.
 */
export function buildLaptop(accent: string, accent2: string, seed = 0, modelIndex?: number): LaptopRig {
  const rng = new Rng(seed ^ 0x1a97c0de);
  const md = MODELS[modelIndex ?? Math.floor(rng.next() * MODELS.length) % MODELS.length];
  const { w, t } = md;
  const d = 0.28;
  const root = group();
  const body = M(md.body, { rough: md.rough ?? 0.5, metal: md.metal ?? 0 });
  const keyMat = M(md.key, { rough: 0.5 });
  root.add(mesh(G.rbox(w, t, d, md.r), body, 0, t / 2, 0));
  // keyboard well
  const kw = w - 0.06;
  root.add(mesh(G.rbox(kw, 0.006, 0.12, 0.003), M(md.deck, { rough: 0.6 }), 0, t + 0.002, -0.03, { cast: false }));
  const step = kw / 8.4;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      const x = -kw / 2 + step * (c + 0.7);
      const z = -0.065 + r * 0.035;
      const km = md.rgb ? MB([accent, accent2, '#ffffff'][(c + r) % 3], 0.95) : keyMat;
      root.add(md.roundKeys ? mesh(G.cyl(0.013, 0.013, 0.008, 10), km, x, t + 0.007, z, { cast: false }) : mesh(G.box(step * 0.86, 0.006, 0.026), km, x, t + 0.007, z, { cast: false }));
    }
  }
  // touchpad
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(md.deck).getHSL(hsl);
  root.add(mesh(G.rbox(0.11, 0.004, 0.06, 0.002), M(hsl.l > 0.6 ? '#dcd3de' : '#d6dbe8', { rough: 0.5 }), 0, t + 0.002, 0.075, { cast: false }));
  if (md.band) root.add(mesh(G.box(w - 0.02, 0.003, 0.012), M(md.band, { rough: 0.5 }), 0, t + 0.002, 0.125, { cast: false }));
  if (md.vents) {
    // a light strip along the front edge
    root.add(mesh(G.box(w * 0.7, 0.004, 0.006), MB(accent, 0.95), 0, t * 0.55, d / 2 + 0.001, { cast: false }));
  }

  const lid = group(0, t + 0.004, d / 2);
  lid.add(mesh(G.rbox(w, 0.02, d, 0.01), body, 0, 0.0, -d / 2));
  // outer face (visible from the front while typing): the logo glows in the accent colour unless the model has its own
  const logo = mesh(G.circle(0.045, 24), MB(md.logo ?? accent), 0, 0.0105, -d / 2, { r: [-Math.PI / 2, 0, 0], cast: false });
  lid.add(logo);
  lid.add(mesh(G.circle(0.06, 24), MB('#ffffff', 0.35), 0, 0.0103, -d / 2, { r: [-Math.PI / 2, 0, 0], cast: false }));
  if (md.vents) {
    for (let i = 0; i < 4; i++) lid.add(mesh(G.box(0.16, 0.002, 0.008), MB(i % 2 ? accent : accent2, 0.9), 0, 0.0104, -d / 2 - 0.09 - i * 0.02 + 0.03, { cast: false }));
  }
  if (md.band) lid.add(mesh(G.box(w - 0.02, 0.002, 0.014), M(md.band, { rough: 0.5 }), 0, 0.0104, -d + 0.05, { cast: false }));
  for (let i = 0; i < (md.stickers ?? 0); i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(0.07, 0.12);
    const s = mesh(G.circle(rng.range(0.012, 0.022), 12), M(rng.pick(STICKERS), { rough: 0.5 }), Math.cos(a) * rr * (w / 0.4), 0.0104, -d / 2 + Math.sin(a) * rr * 0.6, { r: [-Math.PI / 2, 0, 0], cast: false });
    lid.add(s);
  }
  // inner face: screen with code lines
  lid.add(mesh(G.plane(w - 0.04, 0.24), MB(md.screen), 0, -0.0105, -d / 2, { r: [Math.PI / 2, 0, 0], cast: false }));
  const lines: THREE.Mesh[] = [];
  const cols = [accent, accent2, '#ffffff', accent2, accent];
  for (let i = 0; i < 5; i++) {
    const l = mesh(G.plane(0.2, 0.014), MB(cols[i], 0.9), -0.12, -0.0112, -d / 2 + 0.085 - i * 0.036, { r: [Math.PI / 2, 0, 0], cast: false });
    l.geometry = G.plane(1, 0.014);
    lines.push(l);
    lid.add(l);
  }
  // what can be on the screen besides the code lines (each in front of them; hidden unless somebody does that): a video, a game, a video
  // call, an online shop
  const FLAT: [number, number, number] = [Math.PI / 2, 0, 0];
  const cz = -d / 2;
  const sw = w - 0.05;
  const screen = (bg: string): THREE.Group => {
    const g = group();
    g.visible = false;
    g.add(mesh(G.plane(sw, 0.22), MB(bg), 0, -0.0117, cz, { r: FLAT, cast: false }));
    lid.add(g);
    return g;
  };
  const video = screen('#0f1016');
  video.add(mesh(G.rbox(0.075, 0.002, 0.048, 0.012), MB('#ff2b2b'), 0, -0.012, cz + 0.01, { cast: false }));
  video.add(mesh(G.cone(0.014, 0.003, 3), MB('#ffffff'), 0.003, -0.0126, cz + 0.01, { r: [0, Math.PI / 2, 0], cast: false }));
  video.add(mesh(G.plane(sw - 0.03, 0.006), MB('#4a4d5c'), 0, -0.012, cz - 0.09, { r: FLAT, cast: false }));
  const videoBar = mesh(G.plane(1, 0.006), MB('#ff2b2b'), -0.1, -0.0123, cz - 0.09, { r: FLAT, cast: false });
  video.add(videoBar);

  const game = screen('#14102a');
  game.add(mesh(G.plane(sw, 0.05), MB('#2c2552'), 0, -0.012, cz + 0.085, { r: FLAT, cast: false }));
  const gameBlocks: THREE.Mesh[] = [];
  for (const [i, col] of [accent, '#ffd166', '#5ed3b0'].entries()) {
    const bl = mesh(G.box(0.032, 0.002, 0.032), MB(col), -0.1 + i * 0.1, -0.0124, cz, { cast: false });
    gameBlocks.push(bl);
    game.add(bl);
  }
  game.add(mesh(G.plane(0.14, 0.008), MB('#ffffff', 0.8), -0.04, -0.012, cz - 0.1, { r: FLAT, cast: false }));

  const call = screen('#171b2b');
  const callRings: THREE.Mesh[] = [];
  for (const [i, col] of ['#ffcba4', '#b79bff'].entries()) {
    const x = (i ? 1 : -1) * 0.075;
    call.add(mesh(G.circle(0.04, 20), MB(col), x, -0.012, cz, { r: FLAT, cast: false }));
    const ring = mesh(G.torus(0.05, 0.004, Math.PI * 2, 6, 24), MB('#5ed39a'), x, -0.0124, cz, { r: FLAT, cast: false });
    callRings.push(ring);
    call.add(ring);
  }
  call.add(mesh(G.circle(0.014, 14), MB('#ff4d5e'), 0, -0.012, cz + 0.095, { r: FLAT, cast: false }));

  const shop = screen('#f4f1ea');
  shop.add(mesh(G.plane(sw, 0.026), MB('#ff9f1c'), 0, -0.012, cz - 0.1, { r: FLAT, cast: false }));
  const tiles = [accent, accent2, '#6ec6ff', '#b79bff', '#5ed3b0', '#ff9ec4'];
  tiles.forEach((col, i) => {
    const tx = ((i % 3) - 1) * 0.1;
    const tz = cz - 0.03 + Math.floor(i / 3) * 0.095;
    shop.add(mesh(G.plane(0.08, 0.056), MB(col), tx, -0.012, tz, { r: FLAT, cast: false }));
    shop.add(mesh(G.plane(0.04, 0.007), MB('#3a3d50'), tx, -0.0123, tz + 0.036, { r: FLAT, cast: false }));
  });
  const screens: Record<ScreenMode, THREE.Group> = { video, game, call, shop };
  root.add(lid);

  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const s = mesh(G.box(0.03, 0.03, 0.006), MB(i % 2 ? accent : accent2), 0, 0.3, 0.1, { cast: false });
    s.visible = false;
    sparks.push(s);
    root.add(s);
  }
  bakeGroup(lid, new Set<THREE.Object3D>([logo, ...lines, ...Object.values(screens)]));
  bakeGroup(root, new Set<THREE.Object3D>([lid, ...sparks]));
  return { root, lid, logo, lines, sparks, screens, videoBar, gameBlocks, callRings };
}
