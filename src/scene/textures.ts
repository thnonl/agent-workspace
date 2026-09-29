import * as THREE from 'three';
import type { FloorKind } from '../world/palettes';
import { Rng } from '../util/rng';

const cache = new Map<string, THREE.CanvasTexture>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function finish(c: HTMLCanvasElement, repeatX: number, repeatY: number, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
  }
  return t;
}

const jitter = (hex: string, r: Rng, amt: number) => {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + (r.next() - 0.5) * amt)));
  return `#${c.getHexString()}`;
};

export function floorTexture(kind: FloorKind, c1: string, c2: string, repX: number, repY: number): THREE.CanvasTexture {
  const key = `floor|${kind}|${c1}|${c2}|${repX}|${repY}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = new Rng(kind.length * 977 + c1.length);
  if (kind === 'wood') {
    const rows = 8;
    const h = S / rows;
    g.fillStyle = c1;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < rows; i++) {
      let x = -r.range(0, 200);
      while (x < S) {
        const len = r.range(170, 300);
        g.fillStyle = jitter(i % 2 ? c1 : c2, r, 0.06);
        g.fillRect(x, i * h, len, h);
        // grain
        g.strokeStyle = 'rgba(120,70,30,0.10)';
        g.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) {
          const yy = i * h + r.range(6, h - 6);
          g.beginPath();
          g.moveTo(x + 4, yy);
          g.bezierCurveTo(x + len * 0.3, yy + r.range(-3, 3), x + len * 0.6, yy + r.range(-3, 3), x + len - 4, yy);
          g.stroke();
        }
        g.fillStyle = 'rgba(90,50,20,0.28)';
        g.fillRect(x, i * h, 3, h);
        x += len;
      }
      g.fillStyle = 'rgba(90,50,20,0.22)';
      g.fillRect(0, i * h, S, 3);
    }
  } else if (kind === 'checker') {
    const n = 4;
    const s = S / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? c2 : c1;
        g.fillRect(x * s, y * s, s, s);
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, S);
      g.moveTo(0, i * s);
      g.lineTo(S, i * s);
      g.stroke();
    }
  } else if (kind === 'carpetTile') {
    const n = 8;
    const t = S / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = jitter((x + y) % 2 ? c1 : c2, r, 0.05);
        g.fillRect(x * t, y * t, t, t);
        for (let k = 0; k < 90; k++) {
          g.fillStyle = r.chance(0.5) ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.06)';
          g.fillRect(x * t + r.range(0, t), y * t + r.range(0, t), 2, 2);
        }
      }
    }
    g.strokeStyle = 'rgba(60,70,90,0.18)';
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * t, 0);
      g.lineTo(i * t, S);
      g.moveTo(0, i * t);
      g.lineTo(S, i * t);
      g.stroke();
    }
  } else if (kind === 'carpet') {
    g.fillStyle = c1;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = r.chance(0.5) ? c2 : 'rgba(255,255,255,0.18)';
      g.fillRect(r.range(0, S), r.range(0, S), 2, 2);
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 6;
    g.setLineDash([2, 14]);
    for (const off of [0, S / 2]) {
      g.beginPath();
      g.moveTo(off, 0);
      g.lineTo(off, S);
      g.moveTo(0, off);
      g.lineTo(S, off);
      g.stroke();
    }
    g.setLineDash([]);
  } else {
    // tiles
    const n = 4;
    const s = S / n;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? c2 : c1;
        const p = 6;
        const rad = 22;
        const X = x * s + p;
        const Y = y * s + p;
        const w = s - p * 2;
        g.beginPath();
        g.moveTo(X + rad, Y);
        g.arcTo(X + w, Y, X + w, Y + w, rad);
        g.arcTo(X + w, Y + w, X, Y + w, rad);
        g.arcTo(X, Y + w, X, Y, rad);
        g.arcTo(X, Y, X + w, Y, rad);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(X + 14, Y + 10, w * 0.35, 6);
      }
    }
  }
  const t = finish(c, repX, repY);
  cache.set(key, t);
  return t;
}

export function textTexture(text: string, w: number, h: number, bg: string, fg: string, opts: { font?: string; icon?: string; border?: string } = {}): THREE.CanvasTexture {
  const key = `text|${text}|${w}|${h}|${bg}|${fg}|${opts.icon ?? ''}|${opts.border ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const px = 2;
  const { c, g } = canvas(w * px, h * px);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = bg;
    g.beginPath();
    const rad = 26 * px;
    g.roundRect(0, 0, c.width, c.height, rad);
    g.fill();
    if (opts.border) {
      g.strokeStyle = opts.border;
      g.lineWidth = 8 * px;
      g.beginPath();
      g.roundRect(6 * px, 6 * px, c.width - 12 * px, c.height - 12 * px, rad - 6 * px);
      g.stroke();
    }
    g.fillStyle = fg;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    const label = opts.icon ? `${opts.icon}  ${text}` : text;
    let size = Math.floor(h * 0.5) * px;
    g.font = `800 ${size}px ${opts.font ?? 'Nunito, system-ui, sans-serif'}`;
    while (g.measureText(label).width > c.width - 60 * px && size > 12) {
      size -= 2 * px;
      g.font = `800 ${size}px ${opts.font ?? 'Nunito, system-ui, sans-serif'}`;
    }
    g.fillText(label, c.width / 2, c.height / 2 + 2 * px);
    t.needsUpdate = true;
  };
  draw();
  // redraw once webfonts are ready so the sign uses Nunito
  document.fonts?.ready.then(draw).catch(() => undefined);
  cache.set(key, t);
  return t;
}

export function calendarTexture(month: string, accent: string, seed: number): THREE.CanvasTexture {
  const key = `cal|${month}|${accent}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(256, 340);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 340);
  g.fillStyle = accent;
  g.fillRect(0, 0, 256, 74);
  g.fillStyle = '#ffffff';
  g.font = '800 40px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(month, 128, 40);
  g.fillStyle = '#5b5670';
  g.font = '700 22px Nunito, system-ui, sans-serif';
  const r = new Rng(seed);
  const marked = new Set([r.int(3, 28), r.int(3, 28), r.int(3, 28)]);
  for (let i = 0; i < 31; i++) {
    const col = (i + 3) % 7;
    const row = Math.floor((i + 3) / 7);
    const x = 24 + col * 35;
    const y = 104 + row * 42;
    if (marked.has(i + 1)) {
      g.fillStyle = accent;
      g.beginPath();
      g.arc(x, y, 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
    } else g.fillStyle = col === 0 || col === 6 ? '#e06a7a' : '#5b5670';
    g.fillText(String(i + 1), x, y + 1);
  }
  const t = finish(c, 1, 1, false);
  cache.set(key, t);
  return t;
}
