import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Prop } from '../world/layout';
import { Rng } from '../util/rng';
import { G, M } from './kit';

type V3 = [number, number, number];

// ---------------------------------------------------------------------------- geometry
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

function finish(pos: number[], uv: number[], idx?: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (idx) g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export type LeafKind = 'round' | 'oval' | 'blade' | 'fiddle' | 'grass';

/** half width (0-1) of a leaf at `u` along its length */
function outline(kind: LeafKind, u: number): number {
  switch (kind) {
    case 'round': return Math.sin(Math.PI * Math.pow(u, 0.7)) * (1 - 0.15 * u);
    case 'oval': return Math.pow(Math.sin(Math.PI * u), 0.75);
    case 'fiddle': return Math.sin(Math.PI * Math.pow(u, 0.85)) * (0.55 + 0.6 * u) * (u < 0.35 ? 0.8 : 1);
    case 'grass': return Math.pow(1 - u, 0.45) * Math.min(1, 0.3 + u * 6);
    default: return Math.pow(1 - u, 0.7) * Math.min(1, 0.45 + u * 4);
  }
}

/**
 * One leaf: it grows up the local +y axis from the origin and arches towards +z (`bend` = total curve in radians). The edges
 * lift a little (`fold`) so it reads as a leaf and not as a flat card.
 */
export function leafGeo(kind: LeafKind, len: number, wid: number, bend = 0.5, fold = 0.18, seg = 8): THREE.BufferGeometry {
  return cached(`leaf|${kind}|${len}|${wid}|${bend}|${fold}|${seg}`, () => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let y = 0;
    let z = 0;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      if (i > 0) {
        const a = bend * (u - 0.5 / seg);
        y += Math.cos(a) * (len / seg);
        z += Math.sin(a) * (len / seg);
      }
      const w = outline(kind, u) * wid * 0.5;
      for (const v of [-1, 0, 1]) {
        pos.push(v * w, y, z + Math.abs(v) * w * fold);
        uv.push(0.5 + v * 0.5, u);
      }
      if (i > 0) {
        const a = (i - 1) * 3;
        const b = i * 3;
        idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
      }
    }
    return finish(pos, uv, idx);
  });
}

/** A fern / palm frond: an arching rib with pairs of leaflets that droop to both sides. */
export function frondGeo(len: number, bend: number, pairs: number, leafLen: number, leafW: number): THREE.BufferGeometry {
  return cached(`frond|${len}|${bend}|${pairs}|${leafLen}|${leafW}`, () => {
    const pos: number[] = [];
    const uv: number[] = [];
    const steps = pairs + 1;
    const pts: { y: number; z: number; ty: number; tz: number }[] = [];
    let y = 0;
    let z = 0;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const a = bend * u;
      if (i > 0) {
        y += Math.cos(bend * (u - 0.5 / steps)) * (len / steps);
        z += Math.sin(bend * (u - 0.5 / steps)) * (len / steps);
      }
      pts.push({ y, z, ty: Math.cos(a), tz: Math.sin(a) });
    }
    const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      uv.push(0, 0, 1, 0, 0.5, 1);
    };
    // the rib
    for (let i = 0; i < steps; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const w = 0.011 * (1 - i / steps * 0.6);
      tri(-w, p.y, p.z, w, p.y, p.z, -w, q.y, q.z);
      tri(w, p.y, p.z, w, q.y, q.z, -w, q.y, q.z);
    }
    // the leaflets
    for (let k = 1; k <= pairs; k++) {
      const u = k / (pairs + 1);
      const p = pts[k];
      const ll = leafLen * Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.12)) * (1 - u * 0.25);
      for (const s of [-1, 1]) {
        // out to the side, forward along the rib, and sagging
        const dx = s * 0.88;
        const dy = 0.42 * p.ty - 0.18;
        const dz = 0.42 * p.tz - 0.12;
        const n = Math.hypot(dx, dy, dz);
        const hw = leafW / 2;
        tri(p.ty * 0 + 0, p.y - p.ty * hw, p.z - p.tz * hw, 0, p.y + p.ty * hw, p.z + p.tz * hw, (dx / n) * ll, p.y + (dy / n) * ll, p.z + (dz / n) * ll);
        // a slightly fuller second layer so a leaflet is not a thin spike
        tri(0, p.y - p.ty * hw, p.z - p.tz * hw, (dx / n) * ll * 0.55, p.y + (dy / n) * ll * 0.55 - hw * 0.7, p.z + (dz / n) * ll * 0.55, (dx / n) * ll, p.y + (dy / n) * ll, p.z + (dz / n) * ll);
      }
    }
    return finish(pos, uv);
  });
}

// ---------------------------------------------------------------------------- shared pieces
const GREENS = ['#3fa864', '#4fb86f', '#6fcf8b', '#2f8f56', '#7bd88f'];
const DEEP = ['#2f8f56', '#2b7d4d', '#38a05f', '#3b9c5a'];
const side = THREE.DoubleSide;
const leafMat = (c: string) => M(c, { rough: 0.65, side });

function Mesh({ geo, mat, pos, rot, scale }: { geo: THREE.BufferGeometry; mat: THREE.Material; pos?: V3; rot?: V3; scale?: V3 | number }) {
  return <mesh geometry={geo} material={mat} position={pos} rotation={rot} scale={scale} castShadow />;
}

/** a leaf (or any thing built along local +y) turned `yaw` about the vertical and leaned `tilt` outwards, at a point of the stem */
function Spoke({ yaw, tilt, pos = [0, 0, 0], scale = 1, children }: { yaw: number; tilt: number; pos?: V3; scale?: number; children: ReactNode }) {
  return (
    <group position={pos} rotation={[0, yaw, 0]} scale={scale}>
      <group rotation={[tilt, 0, 0]}>{children}</group>
    </group>
  );
}

export function Pot({ color, tall, round }: { color: string; tall?: boolean; round?: boolean }) {
  const r = tall ? 0.3 : 0.27;
  const h = tall ? 0.42 : 0.3;
  return (
    <group>
      <Mesh geo={G.cyl(r, r * (round ? 0.55 : 0.7), h, 22)} mat={M(color, { rough: 0.55 })} pos={[0, h / 2, 0]} />
      <Mesh geo={G.torus(r, 0.025, Math.PI * 2, 8, 24)} mat={M(color, { rough: 0.55 })} pos={[0, h, 0]} rot={[Math.PI / 2, 0, 0]} />
      <Mesh geo={G.cyl(r - 0.03, r - 0.03, 0.02, 18)} mat={M('#3a2a22', { rough: 1 })} pos={[0, h - 0.008, 0]} />
    </group>
  );
}

const stem = (len: number, r = 0.012) => G.cyl(r * 0.7, r, len, 6);

// ---------------------------------------------------------------------------- foliage (no pot: scaled down for desks too)
/** broad heart-shaped leaves on long stalks */
function Monstera({ rng }: { rng: Rng }) {
  const leaves = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({
      yaw: (i / 9) * Math.PI * 2 + rng.range(-0.3, 0.3),
      tilt: rng.range(0.2, 0.75),
      stalk: rng.range(0.22, 0.5),
      size: rng.range(1.15, 1.5),
      c: rng.pick(DEEP),
    })),
    [rng],
  );
  return (
    <group>
      {leaves.map((l, i) => (
        <Spoke key={i} yaw={l.yaw} tilt={l.tilt}>
          <Mesh geo={stem(l.stalk)} mat={M('#5a8f48')} pos={[0, l.stalk / 2, 0]} />
          <group position={[0, l.stalk, 0]} rotation={[0.55, 0, 0]}>
            <Mesh geo={leafGeo('round', 0.38 * l.size, 0.34 * l.size, 0.5, 0.22)} mat={leafMat(l.c)} />
          </group>
        </Spoke>
      ))}
    </group>
  );
}

function Fern({ rng, n = 9 }: { rng: Rng; n?: number }) {
  const fronds = useMemo(
    () => Array.from({ length: n }, (_, i) => ({
      yaw: (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25),
      tilt: rng.range(0.25, 0.95),
      len: rng.range(0.5, 0.75),
      c: rng.pick(GREENS),
    })),
    [rng, n],
  );
  return (
    <group>
      {fronds.map((f, i) => (
        <Spoke key={i} yaw={f.yaw} tilt={f.tilt}>
          <Mesh geo={frondGeo(f.len, 1.1, 10, 0.19, 0.055)} mat={leafMat(f.c)} />
        </Spoke>
      ))}
    </group>
  );
}

/** an aloe / agave rosette: thick pointed blades in rings */
function Rosette({ rng, color = '#5fb08c', n = 11, size = 1 }: { rng: Rng; color?: string; n?: number; size?: number }) {
  const blades = useMemo(
    () => Array.from({ length: n }, (_, i) => {
      const ring = i < n * 0.45 ? 0 : 1;
      return { yaw: (i / n) * Math.PI * 2 * (ring ? 1 : 1) + ring * 0.4 + rng.range(-0.15, 0.15), tilt: ring ? rng.range(0.9, 1.15) : rng.range(0.35, 0.6), len: (ring ? 0.46 : 0.58) * size * rng.range(0.9, 1.1) };
    }),
    [rng, n, size],
  );
  return (
    <group>
      {blades.map((b, i) => (
        <Spoke key={i} yaw={b.yaw} tilt={b.tilt}>
          <Mesh geo={leafGeo('blade', b.len, 0.13 * size, 0.35, 0.5, 5)} mat={leafMat(color)} />
        </Spoke>
      ))}
    </group>
  );
}

function Flowers({ rng }: { rng: Rng }) {
  const heads = useMemo(() => {
    const cols = [['#ff8fb1', '#ffd166'], ['#ffffff', '#ffb703'], ['#ffd166', '#a0522d'], ['#c77dff', '#ffe066']];
    return Array.from({ length: 5 }, (_, i) => ({
      yaw: (i / 5) * Math.PI * 2 + rng.range(-0.3, 0.3),
      tilt: rng.range(0.1, 0.4),
      h: rng.range(0.42, 0.7),
      cols: cols[(rng.int(0, 3) + i) % cols.length],
    }));
  }, [rng]);
  return (
    <group>
      <Rosette rng={rng} color="#4fb86f" n={9} size={0.7} />
      {heads.map((f, i) => (
        <Spoke key={i} yaw={f.yaw} tilt={f.tilt}>
          <Mesh geo={stem(f.h, 0.008)} mat={M('#4a9a52')} pos={[0, f.h / 2, 0]} />
          <group position={[0, f.h, 0]} rotation={[-f.tilt + 0.6, 0, 0]}>
            {Array.from({ length: 8 }, (_, k) => (
              <Mesh key={k} geo={G.sphere(0.05, 8, 6)} mat={M(f.cols[0], { rough: 0.6 })} pos={[Math.cos((k / 8) * Math.PI * 2) * 0.062, Math.sin((k / 8) * Math.PI * 2) * 0.062, 0]} scale={[1.1, 0.6, 0.3]} rot={[0, 0, (k / 8) * Math.PI * 2]} />
            ))}
            <Mesh geo={G.sphere(0.04, 8, 6)} mat={M(f.cols[1], { rough: 0.5 })} scale={[1, 1, 0.7]} />
          </group>
        </Spoke>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------- tall species
/** a bent trunk with big violin-shaped leaves in a spiral */
function FiddleFig({ rng }: { rng: Rng }) {
  const leaves = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      yaw: i * 2.4 + rng.range(-0.3, 0.3),
      y: 0.55 + (i / 11) * 0.95,
      tilt: rng.range(0.9, 1.3),
      size: 1.15 - (i / 11) * 0.35 + rng.range(-0.08, 0.08),
      c: rng.pick(DEEP),
    })),
    [rng],
  );
  return (
    <group>
      <Mesh geo={G.cyl(0.03, 0.05, 0.8, 8)} mat={M('#8a6a4a', { rough: 0.9 })} pos={[0, 0.4, 0]} />
      <Mesh geo={G.cyl(0.022, 0.03, 0.8, 8)} mat={M('#8a6a4a', { rough: 0.9 })} pos={[0.015, 1.13, 0]} rot={[0, 0, -0.04]} />
      {leaves.map((l, i) => (
        <Spoke key={i} yaw={l.yaw} tilt={l.tilt} pos={[0, l.y, 0]} scale={l.size}>
          <Mesh geo={leafGeo('fiddle', 0.5, 0.42, 0.6, 0.22)} mat={leafMat(l.c)} />
        </Spoke>
      ))}
      <Spoke yaw={0} tilt={0.1} pos={[0.02, 1.52, 0]}>
        <Mesh geo={leafGeo('fiddle', 0.3, 0.2, 0.3, 0.2)} mat={leafMat('#4fb86f')} />
      </Spoke>
    </group>
  );
}

/** a kentia / areca palm: slim canes topped with arching fronds */
function Palm({ rng }: { rng: Rng }) {
  const canes = useMemo(
    () => Array.from({ length: 3 }, (_, i) => ({ yaw: (i / 3) * Math.PI * 2 + 0.4, lean: 0.12 + i * 0.03, h: 1.0 + rng.range(-0.1, 0.35) })),
    [rng],
  );
  return (
    <group>
      {canes.map((c, ci) => (
        <Spoke key={ci} yaw={c.yaw} tilt={c.lean}>
          <Mesh geo={G.cyl(0.016, 0.026, c.h, 7)} mat={M('#8f7a4f', { rough: 0.9 })} pos={[0, c.h / 2, 0]} />
          {Array.from({ length: 6 }, (_, k) => (
            <Spoke key={k} yaw={(k / 6) * Math.PI * 2 + ci} tilt={0.5 + (k % 2) * 0.35} pos={[0, c.h, 0]}>
              <Mesh geo={frondGeo(0.78 - (k % 2) * 0.12, 1.35, 12, 0.22, 0.05)} mat={leafMat(GREENS[(k + ci) % GREENS.length])} />
            </Spoke>
          ))}
        </Spoke>
      ))}
    </group>
  );
}

function Bamboo({ rng }: { rng: Rng }) {
  const stalks = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ({
      x: Math.cos(i * 2.2) * 0.1,
      z: Math.sin(i * 2.2) * 0.1,
      h: rng.range(1.15, 1.85),
      lean: rng.range(-0.06, 0.06),
    })),
    [rng],
  );
  return (
    <group>
      {stalks.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation={[0, 0, s.lean]}>
          <Mesh geo={G.cyl(0.016, 0.02, s.h, 8)} mat={M('#8bc34a', { rough: 0.5 })} pos={[0, s.h / 2, 0]} />
          {[0.25, 0.5, 0.75].map((f) => (
            <Mesh key={f} geo={G.torus(0.02, 0.005, Math.PI * 2, 5, 10)} mat={M('#6aa02f')} pos={[0, s.h * f, 0]} rot={[Math.PI / 2, 0, 0]} />
          ))}
          {[0.78, 0.92].map((f, k) => (
            <group key={k} position={[0, s.h * f, 0]}>
              {[0, 1, 2].map((j) => (
                <Spoke key={j} yaw={j * 2.1 + i + k} tilt={1.0 + j * 0.15}>
                  <Mesh geo={leafGeo('grass', 0.26, 0.06, 0.4, 0.3, 4)} mat={leafMat('#5fa83c')} />
                </Spoke>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/** a dragon tree: a thick trunk that ends in tufts of long arching blades */
function Dracaena({ rng }: { rng: Rng }) {
  const tuft = (n: number, y: number, x: number, scale: number, seed: number) => (
    <group position={[x, y, 0]} scale={scale}>
      {Array.from({ length: n }, (_, i) => (
        <Spoke key={i} yaw={(i / n) * Math.PI * 2 + seed} tilt={0.35 + (i % 3) * 0.3}>
          <Mesh geo={leafGeo('grass', 0.7 - (i % 3) * 0.06, 0.12, 0.9, 0.35, 6)} mat={leafMat(i % 2 ? '#3b9c5a' : '#2f8f56')} />
        </Spoke>
      ))}
    </group>
  );
  const lean = useMemo(() => rng.range(0.15, 0.3), [rng]);
  return (
    <group>
      <Mesh geo={G.cyl(0.05, 0.065, 0.95, 9)} mat={M('#9a7b57', { rough: 0.95 })} pos={[0, 0.475, 0]} />
      <group position={[0, 0.9, 0]} rotation={[0, 0, -lean]}>
        <Mesh geo={G.cyl(0.04, 0.05, 0.45, 9)} mat={M('#9a7b57', { rough: 0.95 })} pos={[0, 0.22, 0]} />
        {tuft(16, 0.46, 0, 0.85, 0.3)}
      </group>
      {tuft(20, 0.97, 0, 1, 0)}
    </group>
  );
}

// ---------------------------------------------------------------------------- cacti
function BarrelCactus() {
  return (
    <group>
      <Mesh geo={G.sphere(0.2, 18, 14)} mat={M('#5bb97e', { rough: 0.75 })} pos={[0, 0.2, 0]} scale={[1, 0.95, 1]} />
      {Array.from({ length: 10 }, (_, i) => (
        <group key={i} rotation={[0, (i / 10) * Math.PI * 2, 0]}>
          <Mesh geo={G.capsule(0.022, 0.2, 3, 6)} mat={M('#3f9d62', { rough: 0.8 })} pos={[0.17, 0.2, 0]} />
        </group>
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <Mesh key={i} geo={G.sphere(0.035, 8, 6)} mat={M('#ffd23f')} pos={[Math.cos(i * 1.26) * 0.06, 0.4, Math.sin(i * 1.26) * 0.06]} />
      ))}
    </group>
  );
}

function PricklyPear() {
  const pad = (key: string, p: V3, rot: V3, s: number) => (
    <group key={key} position={p} rotation={rot} scale={s}>
      <Mesh geo={G.sphere(0.16, 14, 10)} mat={M('#6dbf70', { rough: 0.7 })} scale={[1, 1.2, 0.2]} />
      {[[-0.05, 0.08], [0.06, 0.1], [0, -0.02], [-0.07, -0.08], [0.07, -0.07]].map(([x, y], k) => (
        <Mesh key={k} geo={G.sphere(0.012, 5, 4)} mat={M('#fff3c4')} pos={[x, y, 0.036]} />
      ))}
    </group>
  );
  return (
    <group>
      {pad('a', [0, 0.28, 0], [0, 0.3, 0], 1)}
      {pad('b', [-0.17, 0.5, 0], [0, 0.3, 0.5], 0.85)}
      {pad('c', [0.17, 0.52, 0], [0, 0.3, -0.45], 0.8)}
      {pad('d', [0.03, 0.62, 0], [0, 0.3, 0.1], 0.7)}
      {[[-0.17, 0.74], [0.17, 0.74], [0.03, 0.8]].map(([x, y], i) => (
        <Mesh key={i} geo={G.sphere(0.035, 8, 6)} mat={M('#ff5d8f')} pos={[x, y, 0.02]} />
      ))}
    </group>
  );
}

function ColumnCactus({ arms }: { arms: boolean }) {
  const green = M('#59c27d', { rough: 0.7 });
  return (
    <group>
      <Mesh geo={G.capsule(0.13, 0.5, 6, 14)} mat={green} pos={[0, 0.66, 0]} />
      {Array.from({ length: 6 }, (_, i) => (
        <Mesh key={i} geo={G.box(0.006, 0.62, 0.006)} mat={M('#3f9d62')} pos={[Math.cos((i / 6) * Math.PI * 2) * 0.13, 0.66, Math.sin((i / 6) * Math.PI * 2) * 0.13]} />
      ))}
      {arms ? (
        <>
          <Mesh geo={G.capsule(0.07, 0.1, 6, 10)} mat={green} pos={[0.2, 0.72, 0]} rot={[0, 0, -1.57]} />
          <Mesh geo={G.capsule(0.07, 0.2, 6, 10)} mat={green} pos={[0.3, 0.84, 0]} />
          <Mesh geo={G.capsule(0.065, 0.1, 6, 10)} mat={green} pos={[-0.19, 0.6, 0]} rot={[0, 0, 1.57]} />
          <Mesh geo={G.capsule(0.065, 0.14, 6, 10)} mat={green} pos={[-0.29, 0.7, 0]} />
        </>
      ) : null}
      <Mesh geo={G.sphere(0.05, 8, 6)} mat={M('#ff8fb1')} pos={[0, 1.05, 0]} />
    </group>
  );
}

function CactusTrio() {
  return (
    <group>
      {[[-0.1, 0.5, 0.05], [0.09, 0.7, -0.03], [0.0, 0.42, 0.14]].map(([x, h, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Mesh geo={G.capsule(0.07, h - 0.2, 6, 10)} mat={M(['#59c27d', '#6dbf70', '#4fb786'][i], { rough: 0.7 })} pos={[0, 0.3 + h / 2 - 0.08, 0]} />
          <Mesh geo={G.sphere(0.028, 6, 5)} mat={M(['#ff8fb1', '#ffd166', '#ffffff'][i])} pos={[0, 0.3 + h + 0.03, 0]} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------- props
const seedOf = (p: Prop) => Math.floor(p.x * 100 + p.z * 37) + p.variant * 101;

/** A floor plant: monstera, fern, aloe or a pot of flowers – picked by the prop's variant. */
export function FloorPlant({ p }: { p: Prop }) {
  const rng = useMemo(() => new Rng(seedOf(p)), [p]);
  const v = Math.abs(p.variant) % 4;
  return (
    <group>
      <Pot color={p.color} />
      <group position={[0, 0.3, 0]}>
        {v === 0 ? <Monstera rng={rng} /> : v === 1 ? <Fern rng={rng} /> : v === 2 ? <Rosette rng={rng} /> : <Flowers rng={rng} />}
      </group>
    </group>
  );
}

/** A tall plant: fiddle-leaf fig, palm, bamboo or dracaena. */
export function TallPlant({ p }: { p: Prop }) {
  const rng = useMemo(() => new Rng(seedOf(p) + 17), [p]);
  const v = Math.abs(p.variant) % 4;
  return (
    <group>
      <Pot color={p.color} tall round={v === 1} />
      <group position={[0, 0.42, 0]}>
        {v === 0 ? <FiddleFig rng={rng} /> : v === 1 ? <Palm rng={rng} /> : v === 2 ? <Bamboo rng={rng} /> : <Dracaena rng={rng} />}
      </group>
    </group>
  );
}

export function CactusProp({ p }: { p: Prop }) {
  const v = Math.abs(p.variant) % 4;
  return (
    <group>
      <Mesh geo={G.cyl(0.24, 0.18, 0.28, 18)} mat={M(v % 2 ? p.color : '#ffffff', { rough: 0.6 })} pos={[0, 0.14, 0]} />
      <Mesh geo={G.cyl(0.25, 0.25, 0.04, 18)} mat={M(p.color)} pos={[0, 0.28, 0]} />
      <group position={[0, 0.28, 0]}>
        {v === 0 ? <ColumnCactus arms /> : v === 1 ? <BarrelCactus /> : v === 2 ? <PricklyPear /> : <CactusTrio />}
      </group>
    </group>
  );
}

/** The small pot plants of desks: a leafy tuft, a succulent, a fern, a few flowers (`seed` picks). */
export function DeskPlant({ seed, color }: { seed: number; color: string }) {
  const rng = useMemo(() => new Rng(seed * 31 + 7), [seed]);
  const v = Math.abs(seed) % 4;
  return (
    <group>
      <Mesh geo={G.cyl(0.06, 0.045, 0.09, 14)} mat={M(color, { rough: 0.6 })} pos={[0, 0.045, 0]} />
      <group position={[0, 0.085, 0]} scale={0.2}>
        {v === 0 ? <Monstera rng={rng} /> : v === 1 ? <Rosette rng={rng} color="#6fcf9b" n={10} size={0.8} /> : v === 2 ? <Fern rng={rng} n={7} /> : <Flowers rng={rng} />}
      </group>
    </group>
  );
}
