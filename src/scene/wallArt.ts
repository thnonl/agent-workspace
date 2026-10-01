import * as THREE from 'three';

/**
 * Pictures for the walls: a world map, typographic slogan posters and little illustrated posters. All drawn on a canvas
 * (nothing is loaded), cached by what they show like the other textures (see textures.ts).
 */

const FONT = '"Baloo 2 Variable", system-ui, sans-serif';
/** (a house of 6 rooms keeps about 4 pictures per room, the maps are shared) */
const CACHE_MAX = 40;
const cache = new Map<string, THREE.CanvasTexture>();

function recall(key: string) {
  const t = cache.get(key);
  if (t) {
    cache.delete(key);
    cache.set(key, t);
  }
  return t;
}
function remember(key: string, t: THREE.CanvasTexture) {
  cache.set(key, t);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string;
    cache.get(oldest)?.dispose();
    cache.delete(oldest);
  }
}
/** A texture that draws itself, and once more when the webfonts are ready. */
function made(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const hit = recall(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const go = () => {
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
    t.needsUpdate = true;
  };
  go();
  document.fonts?.ready.then(go).catch(() => undefined);
  remember(key, t);
  return t;
}

/** Pixel size of the canvas of a picture w x h (metres): the long side is 512 px. */
function canvasSize(w: number, h: number): [number, number] {
  const k = 512 / Math.max(w, h);
  return [Math.round(w * k), Math.round(h * k)];
}

// ------------------------------------------------------------------------------------------------ world map

type LL = [number, number];
/** Rough outlines of the land (longitude, latitude); the seas that cut into Eurasia are painted over afterwards. */
const LAND: LL[][] = [
  // North America
  [[-168, 66], [-162, 70], [-141, 70], [-125, 70], [-95, 72], [-82, 68], [-62, 60], [-56, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 30], [-80, 25], [-83, 29], [-90, 29], [-97, 26], [-97, 20], [-91, 18], [-87, 21], [-88, 16], [-83, 10], [-79, 9], [-83, 8], [-86, 12], [-92, 15], [-105, 20], [-112, 29], [-117, 33], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-152, 59], [-165, 55], [-158, 58], [-165, 62]],
  [[-80, 64], [-62, 67], [-68, 72], [-80, 73]],
  [[-118, 70], [-100, 73], [-105, 69]],
  [[-85, 22], [-74, 20], [-78, 22.5]],
  // Greenland, Iceland
  [[-73, 78], [-60, 82], [-30, 83], [-20, 76], [-22, 70], [-40, 65], [-50, 62], [-55, 68], [-68, 76]],
  [[-24, 65], [-14, 66], [-14, 64], [-22, 63.5]],
  // South America
  [[-79, 9], [-72, 12], [-62, 10], [-52, 5], [-50, 0], [-35, -5], [-39, -15], [-48, -26], [-58, -35], [-65, -41], [-68, -52], [-72, -54], [-75, -48], [-73, -37], [-71, -20], [-76, -14], [-81, -5], [-80, 0], [-77, 7]],
  // Eurasia
  [[-9, 37], [-9, 43], [-2, 43.5], [-1, 46], [-4, 48], [2, 51], [8, 54], [9, 57], [11, 55], [14, 54], [21, 55], [24, 60], [30, 60], [22, 65], [17, 62], [18, 59], [12, 56], [5, 58], [5, 62], [14, 68], [25, 71], [40, 68], [44, 66], [60, 69], [70, 73], [80, 73], [100, 77], [112, 74], [130, 72], [142, 72], [160, 70], [170, 70], [180, 68], [178, 64], [165, 60], [160, 54], [156, 51], [155, 58], [142, 59], [135, 54], [140, 48], [135, 43], [129, 41], [127, 38], [129, 35], [126, 35], [125, 39], [121, 40], [122, 37], [119, 35], [122, 30], [120, 25], [110, 21], [108, 17], [109, 12], [105, 9], [101, 13], [100, 8], [103, 1], [98, 8], [98, 16], [94, 17], [91, 22], [87, 21], [80, 15], [78, 8], [73, 16], [72, 21], [67, 25], [58, 25], [57, 27], [50, 30], [48, 29], [51, 25], [56, 26], [59, 22], [52, 16], [43, 13], [38, 20], [35, 28], [34, 31], [36, 36], [30, 36.5], [27, 37], [26, 40], [23, 40], [24, 38], [22, 36.5], [21, 39], [19, 42], [13.5, 45.5], [12.5, 44], [16, 41.5], [18, 40], [16, 38], [15.5, 40], [12, 42], [10, 44], [7, 43.5], [3, 43], [0, 39], [-2, 37], [-5, 36]],
  // British Isles
  [[-5, 50], [1, 51], [2, 53], [-2, 56], [-3, 58.5], [-6, 58], [-5, 55], [-3, 54], [-4, 52]],
  [[-10, 52], [-6, 52], [-6, 55], [-9, 54]],
  // Africa, Madagascar
  [[-17, 21], [-13, 28], [-6, 36], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [38, 19], [43, 12], [51, 12], [44, 2], [40, -3], [39, -10], [40, -16], [35, -24], [32, -29], [27, -34], [19, -35], [17, -29], [12, -17], [13, -8], [9, -1], [9, 4], [4, 6], [-8, 4], [-13, 8], [-17, 14]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  // Japan, Philippines, Indonesia, New Guinea
  [[130, 32], [135, 34], [140, 36], [141, 41], [142, 45], [140, 40], [137, 37], [132, 35]],
  [[120, 18], [122, 14], [125, 7], [122, 10]],
  [[95, 5], [98, 4], [104, -2], [106, -6], [102, -4], [96, 2]],
  [[109, 1], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[106, -6], [114, -8], [106, -7.5]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [134, -4]],
  // Australia, New Zealand
  [[114, -22], [122, -18], [129, -15], [136, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [135, -34], [131, -31], [115, -34], [113, -26]],
  [[172, -35], [178, -38], [175, -41], [172, -41]],
  [[167, -46], [174, -41], [172, -44], [170, -46]],
];
/** Seas inside the land (centre, radii in degrees). */
const SEAS: [number, number, number, number][] = [[34, 43.5, 6.5, 2.2], [51, 42, 1.8, 4.5], [-90, 50, 7, 5]];
/** Cities with a pin (longitude, latitude). */
const CITIES: LL[] = [[-122, 37.8], [-74, 40.7], [-0.1, 51.5], [139.7, 35.7], [151, -33.9], [18.4, -33.9], [-43, -22.9], [103.8, 1.3], [105.8, 21], [55.3, 25.2], [13.4, 52.5], [77.2, 28.6], [-99, 19.4], [37.6, 55.7], [31.2, 30], [126.9, 37.5]];

const LON0 = -180;
const LON1 = 180;
const LAT0 = 84;
const LAT1 = -60;

/**
 * The world map is two textures: the map itself, the same for every room (so the whole house keeps just a few of them in memory), and a
 * small transparent layer on top of it with the pins and the routes of the room (see worldMapPins). Style 0 is a paper map (pale sea,
 * warm land, a graticule), style 1 a dark screen of dots. A round map shows a square cut of it (crop 0..2).
 */
export function worldMapTexture(style: number, round = false, crop = 0): THREE.CanvasTexture {
  const s = style % 2;
  if (!round) return made(`map|${s}`, 1200, 600, (g, W, H) => paintMap(g, W, H, s));
  const c = crop % 3;
  return made(`mapr|${s}|${c}`, 512, 512, (g, w, h) => {
    const off = document.createElement('canvas');
    off.width = 1200;
    off.height = 600;
    paintMap(off.getContext('2d')!, 1200, 600, s);
    g.drawImage(off, c * 300, 0, 600, 600, 0, 0, w, h);
  });
}

/** Where the pins of a room are (a few cities, spread by the seed). */
function pinsOf(seed: number): LL[] {
  return CITIES.map((c, i) => ({ c, k: (i * 7 + seed * 5) % 11 })).filter((p) => p.k < 7).map((p) => p.c);
}

/** The pins and routes of one room, on a transparent layer the size of the map (landscape) or of its cut (round) – at a quarter of the map's pixels. */
export function worldMapPins(style: number, accent: string, accent2: string, seed: number, round = false, crop = 0): THREE.CanvasTexture {
  const s = style % 2;
  const c = crop % 3;
  const [W, H] = round ? [256, 256] : [600, 300];
  return made(`pins|${s}|${accent}|${accent2}|${seed}|${round ? c : 'w'}`, W, H, (g) => {
    // map pixels (1200 x 600) to this layer
    const sx = round ? W / 600 : W / 1200;
    const sy = H / 600;
    const x0 = round ? c * 300 : 0;
    const X = (lon: number) => (((lon - LON0) / (LON1 - LON0)) * 1200 - x0) * sx;
    const Y = (lat: number) => (((LAT0 - lat) / (LAT0 - LAT1)) * 600) * sy;
    const pins = pinsOf(seed);
    g.strokeStyle = s === 0 ? accent2 : accent;
    g.globalAlpha = s === 0 ? 0.65 : 0.8;
    g.lineWidth = (s === 0 ? 4 : 3) * sx;
    if (s === 0) g.setLineDash([10 * sx, 8 * sx]);
    for (let i = 0; i + 1 < pins.length; i += 2) {
      const [pa, pb] = [pins[i], pins[i + 1]];
      const xa = X(pa[0]);
      const ya = Y(pa[1]);
      const xb = X(pb[0]);
      const yb = Y(pb[1]);
      g.beginPath();
      g.moveTo(xa, ya);
      g.quadraticCurveTo((xa + xb) / 2, Math.min(ya, yb) - Math.abs(xb - xa) * 0.22, xb, yb);
      g.stroke();
    }
    g.setLineDash([]);
    g.globalAlpha = 1;
    for (const [lo, la] of pins) {
      const x = X(lo);
      const y = Y(la);
      if (x < -20 || x > W + 20) continue;
      if (s === 0) {
        g.fillStyle = accent;
        g.beginPath();
        g.arc(x, y, 11 * sx, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(x, y, 4 * sx, 0, Math.PI * 2);
        g.fill();
      } else {
        const grad = g.createRadialGradient(x, y, 0, x, y, 26 * sx);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, 26 * sx, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(x, y, 5 * sx, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

function paintMap(g: CanvasRenderingContext2D, W: number, H: number, s: number) {
  const X = (lon: number) => ((lon - LON0) / (LON1 - LON0)) * W;
  const Y = (lat: number) => ((LAT0 - lat) / (LAT0 - LAT1)) * H;
  const land = (ctx: CanvasRenderingContext2D) => {
    for (const poly of LAND) {
      ctx.beginPath();
      poly.forEach(([lo, la], i) => (i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la))));
      ctx.closePath();
      ctx.fill();
    }
  };
  const seas = (ctx: CanvasRenderingContext2D) => {
    for (const [lo, la, rx, ry] of SEAS) {
      ctx.beginPath();
      ctx.ellipse(X(lo), Y(la), (rx / 360) * W, (ry / 144) * H, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  if (s === 0) {
    g.fillStyle = '#cdeaf6';
    g.fillRect(0, 0, W, H);
    // graticule
    g.strokeStyle = 'rgba(80,140,175,0.28)';
    g.lineWidth = 2;
    for (let lo = -180; lo <= 180; lo += 30) {
      g.beginPath();
      g.moveTo(X(lo), 0);
      g.lineTo(X(lo), H);
      g.stroke();
    }
    for (let la = -60; la <= 80; la += 20) {
      g.beginPath();
      g.moveTo(0, Y(la));
      g.lineTo(W, Y(la));
      g.stroke();
    }
    g.fillStyle = '#e9d9ae';
    g.strokeStyle = '#b79b62';
    g.lineWidth = 3;
    land(g);
    for (const poly of LAND) {
      g.beginPath();
      poly.forEach(([lo, la], i) => (i ? g.lineTo(X(lo), Y(la)) : g.moveTo(X(lo), Y(la))));
      g.closePath();
      g.stroke();
    }
    g.fillStyle = '#cdeaf6';
    seas(g);
  } else {
    g.fillStyle = '#10162b';
    g.fillRect(0, 0, W, H);
    // land into dots: paint the land on a small canvas and read it back
    const gw = 120;
    const gh = 60;
    const m = document.createElement('canvas');
    m.width = gw;
    m.height = gh;
    const mg = m.getContext('2d', { willReadFrequently: true })!;
    mg.fillStyle = '#fff';
    mg.scale(gw / W, gh / H);
    land(mg);
    mg.globalCompositeOperation = 'destination-out';
    seas(mg);
    const px = mg.getImageData(0, 0, gw, gh).data;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const on = px[(j * gw + i) * 4 + 3] > 110;
        g.fillStyle = on ? '#7be0c3' : 'rgba(120,140,200,0.14)';
        g.beginPath();
        g.arc((i + 0.5) * (W / gw), (j + 0.5) * (H / gh), on ? 3.6 : 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ slogans

export const SLOGANS: { lines: string[]; icon: string }[] = [
  { lines: ['KEEP CALM', 'AND', 'SHIP IT'], icon: '🚀' },
  { lines: ['IT WORKS', 'ON MY', 'MACHINE'], icon: '💻' },
  { lines: ['NOT A BUG', 'A FEATURE'], icon: '🐛' },
  { lines: ['WORK HARD', 'NAP HARDER'], icon: '😴' },
  { lines: ['TALK IS CHEAP', 'SHOW ME', 'THE CODE'], icon: '⌨️' },
  { lines: ['DONE IS', 'BETTER THAN', 'PERFECT'], icon: '✅' },
  { lines: ['COFFEE', 'CODE', 'REPEAT'], icon: '☕' },
  { lines: ['GIT PUSH', 'AND PRAY'], icon: '🙏' },
  { lines: ['SUDO MAKE', 'ME A', 'SANDWICH'], icon: '🥪' },
  { lines: ['FEED THE', 'CATS FIRST'], icon: '🐈' },
  { lines: ['STAY', 'CURIOUS'], icon: '🔭' },
  { lines: ['DREAM BIG', 'COMMIT', 'OFTEN'], icon: '🌈' },
  { lines: ['TODAY’S MOOD:', 'COMPILING'], icon: '⏳' },
  { lines: ['DELETE', 'MORE CODE'], icon: '✂️' },
];

/** A typographic poster: the slogan in big letters, in one of three looks, for a picture of w x h metres (round or not). */
export function sloganTexture(index: number, look: number, accent: string, accent2: string, w = 1, h = 1.4, round = false): THREE.CanvasTexture {
  const slogan = SLOGANS[index % SLOGANS.length];
  const l = look % 3;
  const [cw, ch] = canvasSize(w, h);
  return made(`slogan|${index}|${l}|${accent}|${accent2}|${cw}x${ch}|${round ? 1 : 0}`, cw, ch, (g, W, H) => {
    const u = Math.min(W, H) / 360;
    const dark = l === 1;
    const bg = l === 0 ? accent : dark ? '#1d2138' : '#fff8ea';
    const fg = l === 0 ? '#ffffff' : dark ? '#ffffff' : '#3b3550';
    const hi = l === 0 ? '#ffe9a6' : dark ? accent2 : accent;
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // a border and two stripes to make it look printed
    g.strokeStyle = hi;
    g.lineWidth = 6 * u;
    if (round) {
      g.beginPath();
      g.arc(W / 2, H / 2, W / 2 - 14 * u, 0, Math.PI * 2);
      g.stroke();
    } else g.strokeRect(16 * u, 16 * u, W - 32 * u, H - 32 * u);
    const top = round ? H * 0.22 : 62 * u;
    const bottom = round ? H * 0.78 : H - 90 * u;
    const bar = round ? W * 0.3 : W - 80 * u;
    g.fillStyle = hi;
    g.fillRect((W - bar) / 2, top, bar, 8 * u);
    g.fillRect((W - bar) / 2, bottom, bar, 8 * u);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // each line as big as it fits (the last one in the accent); all of them together must fit between the stripes
    const maxW = round ? W * 0.64 : W - 90 * u;
    const fit = (t: string) => {
      let size = 120 * u;
      g.font = `800 ${size}px ${FONT}`;
      while (g.measureText(t).width > maxW && size > 14) {
        size -= 4 * u;
        g.font = `800 ${size}px ${FONT}`;
      }
      return size;
    };
    let sizes = slogan.lines.map(fit);
    const room = bottom - top - 30 * u;
    const total = sizes.reduce((a, b) => a + b * 1.02, 0);
    if (total > room) sizes = sizes.map((z) => (z * room) / total);
    let y = (top + bottom) / 2 + 4 * u - Math.min(total, room) / 2;
    slogan.lines.forEach((t, i) => {
      g.font = `800 ${sizes[i]}px ${FONT}`;
      g.fillStyle = i === slogan.lines.length - 1 ? hi : fg;
      g.fillText(t, W / 2, y + sizes[i] / 2);
      y += sizes[i] * 1.02;
    });
    g.font = `800 ${44 * u}px ${FONT}`;
    g.fillStyle = fg;
    g.fillText(slogan.icon, W / 2, round ? H * 0.88 : H - 52 * u);
  });
}

// ------------------------------------------------------------------------------------------------ little illustrated posters

export const POSTER_COUNT = 6;

/** Stars over the box and a good way beyond it (the picture may be wider than the box). */
function stars(g: CanvasRenderingContext2D, W: number, H: number, n: number, seed: number) {
  g.fillStyle = '#ffffff';
  for (let i = 0; i < n * 4; i++) {
    const x = -250 + (((i * 97 + seed * 31) % 1000) / 1000) * (W + 500);
    const y = -200 + (((i * 61 + seed * 17) % 1000) / 1000) * (H + 400);
    g.globalAlpha = 0.35 + ((i * 13) % 7) / 10;
    g.beginPath();
    g.arc(x, y, 1.2 + (i % 3) * 0.7, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}
function caption(g: CanvasRenderingContext2D, W: number, H: number, text: string, color: string, size = 40) {
  g.fillStyle = color;
  g.font = `800 ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, H - 46);
}

/** An illustrated poster for a picture of w x h metres (round or not): the art is drawn in a 360 x 470 box in the middle. */
export function posterTexture(index: number, accent: string, accent2: string, w = 1, h = 1.3, round = false): THREE.CanvasTexture {
  const n = index % POSTER_COUNT;
  const [cw, ch] = canvasSize(w, h);
  return made(`poster|${n}|${accent}|${accent2}|${cw}x${ch}|${round ? 1 : 0}`, cw, ch, (g, W, H) => {
    const u = Math.min(W / 360, H / 470) * (round ? 0.78 : 1);
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(u, u);
    g.translate(-180, -235);
    drawPoster(g, n, accent, accent2);
    g.restore();
  });
}

function drawPoster(g: CanvasRenderingContext2D, n: number, accent: string, accent2: string) {
  const W = 360;
  const H = 470;
  {
    if (n === 0) {
      // rocket launch
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#14163a');
      sky.addColorStop(1, '#5b3f8f');
      g.fillStyle = sky;
      g.fillRect(-800, -800, 1960, 2070);
      stars(g, W, H, 60, 3);
      g.fillStyle = '#fff3c4';
      g.beginPath();
      g.arc(285, 90, 36, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.beginPath();
      g.arc(272, 82, 8, 0, Math.PI * 2);
      g.arc(295, 104, 6, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(150, 230);
      g.rotate(0.35);
      g.fillStyle = '#ff9d3c';
      g.beginPath();
      g.moveTo(-18, 100);
      g.quadraticCurveTo(0, 190, 18, 100);
      g.fill();
      g.fillStyle = '#ffe27a';
      g.beginPath();
      g.moveTo(-9, 100);
      g.quadraticCurveTo(0, 150, 9, 100);
      g.fill();
      g.fillStyle = accent2;
      g.beginPath();
      g.moveTo(-34, 70);
      g.lineTo(-62, 118);
      g.lineTo(-24, 100);
      g.closePath();
      g.moveTo(34, 70);
      g.lineTo(62, 118);
      g.lineTo(24, 100);
      g.closePath();
      g.fill();
      g.fillStyle = '#f4f6ff';
      g.beginPath();
      g.moveTo(0, -110);
      g.quadraticCurveTo(48, -40, 34, 100);
      g.lineTo(-34, 100);
      g.quadraticCurveTo(-48, -40, 0, -110);
      g.fill();
      g.fillStyle = accent;
      g.beginPath();
      g.moveTo(0, -110);
      g.quadraticCurveTo(26, -80, 30, -48);
      g.lineTo(-30, -48);
      g.quadraticCurveTo(-26, -80, 0, -110);
      g.fill();
      g.fillStyle = '#6bd0ff';
      g.beginPath();
      g.arc(0, 4, 17, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#b8c2e8';
      g.lineWidth = 5;
      g.stroke();
      g.restore();
      caption(g, W, H, 'LAUNCH DAY', '#ffffff');
    } else if (n === 1) {
      // the planets in a row, the sun at the edge
      g.fillStyle = '#0f1430';
      g.fillRect(-800, -800, 1960, 2070);
      stars(g, W, H, 80, 5);
      const cy = H / 2 - 20;
      const sun = g.createRadialGradient(0, cy, 10, 0, cy, 150);
      sun.addColorStop(0, '#fff3a0');
      sun.addColorStop(0.5, '#ffb347');
      sun.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = sun;
      g.beginPath();
      g.arc(0, cy, 150, 0, Math.PI * 2);
      g.fill();
      const planets: [number, number, string, boolean][] = [[100, 12, '#b9b2a8', false], [140, 18, '#e8c07a', false], [188, 20, '#4aa3ff', false], [236, 16, '#e0613f', false], [296, 34, '#e9c98c', true]];
      planets.forEach(([x, r, c, ring], i) => {
        g.strokeStyle = 'rgba(255,255,255,0.10)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, cy, x, -1.2, 1.2);
        g.stroke();
        const a = -0.8 + i * 0.28;
        const xx = Math.cos(a) * x;
        const yy = cy + Math.sin(a) * x;
        g.fillStyle = c;
        g.beginPath();
        g.arc(xx, yy, r, 0, Math.PI * 2);
        g.fill();
        if (ring) {
          g.strokeStyle = accent2;
          g.lineWidth = 6;
          g.beginPath();
          g.ellipse(xx, yy, r * 1.7, r * 0.5, -0.3, 0, Math.PI * 2);
          g.stroke();
        }
      });
      caption(g, W, H, 'SOLAR SYSTEM', '#cfd8ff');
    } else if (n === 2) {
      // a cheat sheet of keyboard shortcuts
      g.fillStyle = '#fff8ea';
      g.fillRect(-800, -800, 1960, 2070);
      g.fillStyle = accent;
      g.fillRect(-800, 0, 1960, 90);
      g.fillStyle = '#ffffff';
      g.font = `800 46px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SHORTCUTS', W / 2, 48);
      const rows: [string, string][] = [['Ctrl S', 'save'], ['Ctrl Z', 'undo'], ['Ctrl C', 'copy'], ['Ctrl F', 'find'], ['Ctrl /', 'comment'], ['Esc', 'panic']];
      rows.forEach(([k, v], i) => {
        const y = 140 + i * 52;
        g.fillStyle = '#e9e4d6';
        g.beginPath();
        g.roundRect(34, y - 20, 130, 40, 9);
        g.fill();
        g.fillStyle = '#3b3550';
        g.font = `800 24px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(k, 99, y + 1);
        g.textAlign = 'left';
        g.fillStyle = i === rows.length - 1 ? accent : '#5b5670';
        g.fillText(v, 186, y + 1);
      });
      g.textAlign = 'center';
    } else if (n === 3) {
      // a skyline at dusk
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#2a2a6a');
      sky.addColorStop(0.7, '#ff8fa3');
      sky.addColorStop(1, '#ffd29a');
      g.fillStyle = sky;
      g.fillRect(-800, -800, 1960, 2070);
      stars(g, W, 200, 30, 8);
      g.fillStyle = '#fff3c4';
      g.beginPath();
      g.arc(90, 110, 30, 0, Math.PI * 2);
      g.fill();
      const blds = [[0, 150], [48, 220], [100, 130], [150, 260], [212, 170], [262, 230], [314, 140]];
      [-360, 0, 360].forEach((shift) => blds.forEach(([bx, h], i) => {
        const x = bx + shift;
        const w = i === 3 ? 64 : 52;
        g.fillStyle = i % 2 ? '#2b2f5a' : '#23264d';
        g.fillRect(x, H - 100 - h, w, h + 100);
        g.fillStyle = '#ffd966';
        for (let wy = H - 90 - h; wy < H - 120; wy += 24) {
          for (let wx = x + 8; wx < x + w - 10; wx += 16) {
            if ((wx * 7 + wy * 3 + i) % 5 < 3) g.fillRect(wx, wy, 8, 12);
          }
        }
      }));
      g.fillStyle = '#1b1d3c';
      g.fillRect(-800, H - 100, 1960, 700);
      caption(g, W, H, 'CITY NIGHTS', '#ffe9a6');
    } else if (n === 4) {
      // a git graph
      g.fillStyle = '#16192b';
      g.fillRect(-800, -800, 1960, 2070);
      const lanes = [accent, accent2, '#5ed3b0'];
      const x = (lane: number) => 80 + lane * 70;
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.strokeStyle = lanes[0];
      g.beginPath();
      g.moveTo(x(0), 40);
      g.lineTo(x(0), 360);
      g.stroke();
      g.strokeStyle = lanes[1];
      g.beginPath();
      g.moveTo(x(0), 100);
      g.bezierCurveTo(x(0), 130, x(1), 120, x(1), 160);
      g.lineTo(x(1), 250);
      g.bezierCurveTo(x(1), 285, x(0), 275, x(0), 310);
      g.stroke();
      g.strokeStyle = lanes[2];
      g.beginPath();
      g.moveTo(x(1), 180);
      g.bezierCurveTo(x(1), 200, x(2), 200, x(2), 225);
      g.lineTo(x(2), 245);
      g.bezierCurveTo(x(2), 265, x(1), 260, x(1), 275);
      g.stroke();
      const commits: [number, number][] = [[0, 50], [0, 100], [1, 165], [2, 222], [1, 262], [0, 310], [0, 360]];
      const msgs = ['init', 'add agents', 'wip', 'fix typo', 'review', 'merge', 'v1.0'];
      commits.forEach(([lane, y], i) => {
        g.fillStyle = '#16192b';
        g.strokeStyle = lanes[lane];
        g.lineWidth = 6;
        g.beginPath();
        g.arc(x(lane), y, 12, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#8f98c4';
        g.font = `700 20px ${FONT}`;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(msgs[i], 235, y + 1);
      });
      caption(g, W, H, 'git log --graph', '#cfd8ff', 34);
    } else {
      // a paw and a welcome
      g.fillStyle = '#ffe9ef';
      g.fillRect(-800, -800, 1960, 2070);
      g.fillStyle = 'rgba(255,255,255,0.65)';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(40 + i * 56, 36, 7, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = accent;
      g.beginPath();
      g.ellipse(180, 240, 78, 64, 0, 0, Math.PI * 2);
      g.fill();
      for (const [px, py, rot] of [[84, 160, -0.5], [136, 112, -0.15], [224, 112, 0.15], [276, 160, 0.5]] as const) {
        g.beginPath();
        g.ellipse(px, py, 28, 38, rot, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.35;
      g.beginPath();
      g.ellipse(160, 225, 30, 22, -0.4, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#6b4a5e';
      g.font = `800 48px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('CATS', W / 2, 350);
      g.fillText('WELCOME', W / 2, 400);
    }
  }
}
