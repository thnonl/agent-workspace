import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { inRestroomApron, type RoomLayout } from '../world/layout';
import type { Season } from '../season';
import { Rng } from '../util/rng';
import { G, M, MB } from './kit';
import { Ms, RB } from './furniture';
import { glowMat } from './glow';
import { textTexture } from './textures';

type V3 = [number, number, number];
const VIEW_YAW = 0.72;

/** Floor spots (room space) for festive trees and pumpkins: corners the nav grid says are free and that keep clear of the door. */
const spotCache = new WeakMap<RoomLayout, { x: number; z: number }[]>();
function freeSpots(layout: RoomLayout): { x: number; z: number }[] {
  // (chosen once per room: the spots are blocked in the nav grid, so a second look would find different ones)
  const hit = spotCache.get(layout);
  if (hit) return hit;
  const { width: W, depth: D, nav, door } = layout;
  // the corners first, then places along the walls and the open edges
  const cand: number[][] = [[-W / 2 + 0.8, -D / 2 + 0.8], [W / 2 - 0.8, -D / 2 + 0.8], [-W / 2 + 0.8, D / 2 - 0.8], [W / 2 - 0.8, D / 2 - 0.8]];
  for (let x = -W / 2 + 2.4; x < W / 2 - 1.5; x += 1.6) cand.push([x, -D / 2 + 0.8], [x, D / 2 - 0.8]);
  for (let z = -D / 2 + 2.4; z < D / 2 - 1.5; z += 1.6) cand.push([-W / 2 + 0.8, z], [W / 2 - 0.8, z]);
  const out: { x: number; z: number }[] = [];
  for (const [x, z] of cand) {
    if (Math.hypot(x - door.inside.x, z - door.inside.z) < 1.9) continue;
    if (layout.restroom && inRestroomApron(layout.restroom, x, z, 0.5)) continue;
    const free = [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]].every(([dx, dz]) => !nav.isBlocked(x + dx, z + dz));
    if (!free) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
    nav.blockRect({ x, z, w: 0.9, d: 0.9 });
    out.push({ x, z });
  }
  spotCache.set(layout, out);
  return out;
}

const tri = new THREE.CircleGeometry(0.15, 3);
const batGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0.05);
  s.quadraticCurveTo(0.12, 0.2, 0.3, 0.12);
  s.quadraticCurveTo(0.26, 0.04, 0.34, -0.06);
  s.quadraticCurveTo(0.16, -0.02, 0.08, -0.12);
  s.quadraticCurveTo(0.03, -0.04, 0, -0.06);
  s.quadraticCurveTo(-0.03, -0.04, -0.08, -0.12);
  s.quadraticCurveTo(-0.16, -0.02, -0.34, -0.06);
  s.quadraticCurveTo(-0.26, 0.04, -0.3, 0.12);
  s.quadraticCurveTo(-0.12, 0.2, 0, 0.05);
  return new THREE.ShapeGeometry(s, 6);
})();

let webTex: THREE.CanvasTexture | null = null;
function webTexture(): THREE.CanvasTexture {
  if (webTex) return webTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2.5;
  g.lineCap = 'round';
  // radial threads from the top-left corner and sagging arcs between them
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 250, Math.sin(a) * 250);
    g.stroke();
  }
  for (let r = 1; r <= 5; r++) {
    const rad = r * 46;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      const sag = i > 0 && i < n ? 0.88 : 1;
      const x = Math.cos(a) * rad * (i === 0 ? 1 : sag);
      const y = Math.sin(a) * rad * (i === 0 ? 1 : sag);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  webTex = new THREE.CanvasTexture(c);
  webTex.colorSpace = THREE.SRGBColorSpace;
  return webTex;
}

// ------------------------------------------------------------------ shared pieces
/** A sagging row of things hung between two points of a wall (room space); `make(i, t)` draws item i at t 0..1. */
function Hung({ a, b, n, sag, make }: { a: V3; b: V3; n: number; sag: number; make: (i: number, t: number) => ReactNode }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * Math.sin(Math.PI * t), a[2] + (b[2] - a[2]) * t];
        return (
          <group key={i} position={p}>
            {make(i, t)}
          </group>
        );
      })}
    </>
  );
}

function Flag({ color, yaw }: { color: string; yaw: number }) {
  return <mesh geometry={tri} material={M(color, { rough: 0.8, side: THREE.DoubleSide })} rotation={[0, yaw, -Math.PI / 2]} position={[0, -0.12, 0]} />;
}

function Pot({ r, color, rim = '#ffd166' }: { r: number; color: string; rim?: string }) {
  return (
    <group>
      <Ms geo={G.cyl(r, r * 0.75, r * 1.25, 20)} mat={M(color, { rough: 0.6 })} pos={[0, r * 0.62, 0]} />
      <Ms geo={G.torus(r, r * 0.09, Math.PI * 2, 6, 24)} mat={M(rim, { metal: 0.4, rough: 0.4 })} pos={[0, r * 1.25, 0]} rot={[Math.PI / 2, 0, 0]} />
      <Ms geo={G.cyl(r * 0.92, r * 0.92, 0.02, 20)} mat={M('#3a2a22')} pos={[0, r * 1.22, 0]} />
    </group>
  );
}

// ------------------------------------------------------------------ Halloween
function Pumpkin({ s = 1, seed = 0 }: { s?: number; seed?: number }) {
  const eye = G.circle(0.05, 3);
  return (
    <group scale={s} rotation={[0, VIEW_YAW, 0]}>
      <Ms geo={G.sphere(0.34, 20, 14)} mat={M('#ff8a1f', { rough: 0.55 })} pos={[0, 0.27, 0]} scale={[1.12, 0.86, 1.12]} />
      {[0.55, 1.1, 1.65].map((a) => (
        <Ms key={a} geo={G.sphere(0.2, 12, 10)} mat={M('#f07a12', { rough: 0.6 })} pos={[Math.sin(a) * 0.17 - 0.12, 0.27, Math.cos(a) * 0.17 + 0.1]} scale={[0.6, 1.3, 0.6]} cast={false} />
      ))}
      <Ms geo={G.cyl(0.035, 0.05, 0.12, 8)} mat={M('#4f7a2a')} pos={[0, 0.55, 0]} rot={[0.15, 0, 0.2]} />
      <group position={[0, 0.3, 0.375]}>
        <mesh geometry={eye} material={glowMat('#ffb020', 0.6)} position={[-0.11, 0.06, 0]} rotation={[0, 0, Math.PI / 2 + (seed % 2 ? 0.2 : 0)]} />
        <mesh geometry={eye} material={glowMat('#ffb020', 0.6)} position={[0.11, 0.06, 0]} rotation={[0, 0, Math.PI / 2 - (seed % 2 ? 0.2 : 0)]} />
        <mesh material={glowMat('#ffb020', 0.6)} position={[0, -0.09, -0.01]} geometry={G.plane(0.26, 0.06)} />
        <mesh material={glowMat('#ffb020', 0.6)} position={[0, -0.13, -0.015]} geometry={G.plane(0.18, 0.05)} />
      </group>
    </group>
  );
}

function Halloween({ layout, spots }: { layout: RoomLayout; spots: { x: number; z: number }[] }) {
  const { width: W, depth: D, wallHeight: H } = layout;
  const cols = ['#ff8a1f', '#7b4bd6', '#2b2438'];
  const bats = useMemo(() => {
    const r = new Rng(layout.seed + 31);
    const out: { wall: 'back' | 'left'; pos: number; y: number; s: number; rot: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const wall = i % 2 ? 'left' : 'back';
      const len = wall === 'back' ? W : D;
      for (let tries = 0; tries < 12; tries++) {
        const pos = r.range(-len / 2 + 1.5, len / 2 - 1.5);
        const clash = layout.windows.some((w) => w.wall === wall && Math.abs(w.pos - pos) < w.w / 2 + 0.5) || (layout.door.wall === wall && Math.abs(layout.door.pos - pos) < layout.door.width / 2 + 0.6);
        if (clash) continue;
        out.push({ wall, pos, y: r.range(2.3, 2.75), s: r.range(0.7, 1.2), rot: r.range(-0.4, 0.4) });
        break;
      }
    }
    return out;
  }, [layout, W, D]);
  return (
    <>
      <Hung a={[-W / 2 + 0.4, H - 0.12, -D / 2 + 0.06]} b={[W / 2 - 0.4, H - 0.12, -D / 2 + 0.06]} n={22} sag={0.32} make={(i) => <Flag color={cols[i % 3]} yaw={0} />} />
      <Hung a={[-W / 2 + 0.06, H - 0.12, -D / 2 + 0.4]} b={[-W / 2 + 0.06, H - 0.12, D / 2 - 0.4]} n={17} sag={0.3} make={(i) => <Flag color={cols[(i + 1) % 3]} yaw={Math.PI / 2} />} />
      <mesh geometry={G.plane(1.7, 1.7)} position={[-W / 2 + 0.87, H - 0.87, -D / 2 + 0.05]}>
        <meshBasicMaterial map={webTexture()} transparent opacity={0.6} depthWrite={false} />
      </mesh>
      <mesh geometry={G.plane(1.7, 1.7)} position={[-W / 2 + 0.05, H - 0.87, -D / 2 + 0.87]} rotation={[0, Math.PI / 2, 0]} scale={[-1, 1, 1]}>
        <meshBasicMaterial map={webTexture()} transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {bats.map((b, i) => (
        <mesh key={i} geometry={batGeo} material={MB('#1d1730')} scale={b.s} rotation={[0, b.wall === 'back' ? 0 : Math.PI / 2, b.rot]} position={b.wall === 'back' ? [b.pos, b.y, -D / 2 + 0.07] : [-W / 2 + 0.07, b.y, b.pos]} />
      ))}
      {spots.slice(0, 3).map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <Pumpkin s={i === 0 ? 1.25 : 0.9} seed={i} />
          {i === 0 ? (
            <group position={[0.55, 0, 0.32]}>
              <Pumpkin s={0.6} seed={1} />
            </group>
          ) : null}
        </group>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ Christmas
function XmasTree({ s = 1 }: { s?: number }) {
  const bauble = ['#e5383b', '#ffd166', '#4ea8ff', '#ff7aa8', '#ffffff'];
  const lights = ['#ffd166', '#ff6b6b', '#6bd6ff', '#9bff8a'];
  const tiers = [
    { r: 0.78, h: 0.75, y: 0.72 },
    { r: 0.6, h: 0.68, y: 1.18 },
    { r: 0.44, h: 0.6, y: 1.6 },
    { r: 0.27, h: 0.5, y: 1.95 },
  ];
  return (
    <group scale={s}>
      <Pot r={0.2} color="#a4262c" rim="#ffd166" />
      <Ms geo={G.cyl(0.07, 0.09, 0.4, 8)} mat={M('#6b4226')} pos={[0, 0.45, 0]} />
      {tiers.map((t, i) => (
        <Ms key={i} geo={G.cone(t.r, t.h, 22)} mat={M(i % 2 ? '#2f8a4a' : '#3a9d55', { rough: 0.8 })} pos={[0, t.y, 0]} />
      ))}
      {tiers.flatMap((t, i) =>
        Array.from({ length: 5 - i }, (_, j) => {
          const a = j * 2.4 + i * 1.1;
          const k = 0.72 - j * 0.05;
          return (
            <Ms key={`${i}-${j}`} geo={G.sphere(0.06, 10, 8)} mat={M(bauble[(i + j) % 5], { rough: 0.25, metal: 0.4 })} pos={[Math.cos(a) * t.r * k, t.y - t.h * 0.32 + (j % 2) * 0.1, Math.sin(a) * t.r * k]} cast={false} />
          );
        }),
      )}
      {tiers.flatMap((t, i) =>
        Array.from({ length: 6 - i }, (_, j) => {
          const a = j * 1.9 + i * 0.7 + 0.5;
          const k = 0.55 + (j % 3) * 0.12;
          return (
            <Ms key={`l${i}-${j}`} geo={G.sphere(0.04, 8, 6)} mat={glowMat(lights[(i + j) % 4], 0.4)} pos={[Math.cos(a) * t.r * k, t.y - t.h * 0.1 - (j % 2) * 0.12, Math.sin(a) * t.r * k]} cast={false} />
          );
        }),
      )}
      <Ms geo={G.cone(0.13, 0.26, 5)} mat={glowMat('#ffe066', 0.3)} pos={[0, 2.32, 0]} cast={false} />
      {[
        { x: 0.55, z: 0.35, c: '#e5383b', w: 0.3 },
        { x: -0.5, z: 0.45, c: '#4ea8ff', w: 0.24 },
        { x: 0.25, z: 0.65, c: '#ffd166', w: 0.2 },
      ].map((g, i) => (
        <group key={i} position={[g.x, 0, g.z]} rotation={[0, i * 0.7, 0]}>
          <RB size={[g.w, g.w * 0.8, g.w]} pos={[0, g.w * 0.4, 0]} color={g.c} r={0.015} />
          <RB size={[g.w + 0.01, g.w * 0.8 + 0.01, g.w * 0.18]} pos={[0, g.w * 0.4, 0]} color="#ffffff" r={0.005} />
          <RB size={[g.w * 0.18, g.w * 0.8 + 0.01, g.w + 0.01]} pos={[0, g.w * 0.4, 0]} color="#ffffff" r={0.005} />
        </group>
      ))}
    </group>
  );
}

function Christmas({ layout, spots }: { layout: RoomLayout; spots: { x: number; z: number }[] }) {
  const { width: W, depth: D, wallHeight: H } = layout;
  const garland = (i: number) => (
    <>
      <Ms geo={G.sphere(0.09, 8, 6)} mat={M(i % 2 ? '#2f8a4a' : '#3f9b58', { rough: 0.9 })} cast={false} />
      {i % 4 === 0 ? <Ms geo={G.sphere(0.05, 8, 6)} mat={M('#e5383b', { rough: 0.4 })} pos={[0.04, -0.06, 0.06]} cast={false} /> : null}
      {i % 6 === 3 ? <Ms geo={G.sphere(0.035, 8, 6)} mat={glowMat('#ffd166', 0.4)} pos={[-0.04, -0.07, 0.07]} cast={false} /> : null}
    </>
  );
  return (
    <>
      <Hung a={[-W / 2 + 0.4, H - 0.12, -D / 2 + 0.07]} b={[W / 2 - 0.4, H - 0.12, -D / 2 + 0.07]} n={70} sag={0.3} make={garland} />
      <Hung a={[-W / 2 + 0.07, H - 0.12, -D / 2 + 0.4]} b={[-W / 2 + 0.07, H - 0.12, D / 2 - 0.4]} n={55} sag={0.28} make={garland} />
      {spots[0] ? (
        <group position={[spots[0].x, 0, spots[0].z]} rotation={[0, VIEW_YAW, 0]}>
          <XmasTree s={1.1} />
        </group>
      ) : null}
      {spots[1] ? (
        <group position={[spots[1].x, 0, spots[1].z]} rotation={[0, VIEW_YAW, 0]}>
          <XmasTree s={0.7} />
        </group>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ Tết
function Lantern({ s = 1 }: { s?: number }) {
  return (
    <group scale={s}>
      <Ms geo={G.cyl(0.004, 0.004, 0.34, 4)} mat={M('#ffd166')} pos={[0, 0.17, 0]} cast={false} />
      <Ms geo={G.cyl(0.07, 0.085, 0.05, 12)} mat={M('#ffd166', { metal: 0.4, rough: 0.4 })} pos={[0, 0.02, 0]} cast={false} />
      <Ms geo={G.sphere(0.17, 16, 12)} mat={glowMat('#d9262c', 0.55)} pos={[0, -0.14, 0]} scale={[1, 0.82, 1]} cast={false} />
      <Ms geo={G.cyl(0.085, 0.07, 0.05, 12)} mat={M('#ffd166', { metal: 0.4, rough: 0.4 })} pos={[0, -0.29, 0]} cast={false} />
      <Ms geo={G.cyl(0.006, 0.006, 0.2, 4)} mat={M('#ffd166')} pos={[0, -0.41, 0]} cast={false} />
      <Ms geo={G.sphere(0.022, 8, 6)} mat={M('#ffd166')} pos={[0, -0.52, 0]} cast={false} />
    </group>
  );
}

/** Peach blossom (hoa đào): a gnarled branch crowned with pink flowers. */
function Blossom({ seed }: { seed: number }) {
  const parts = useMemo(() => {
    const r = new Rng(seed + 5);
    const branches = [
      { a: 0.15, b: 0.1, len: 1.1 }, { a: -0.5, b: 0.9, len: 0.9 }, { a: 0.6, b: -0.8, len: 0.85 }, { a: -0.25, b: -1.9, len: 0.8 }, { a: 0.42, b: 2.4, len: 0.7 },
    ];
    const flowers: { p: V3; s: number; c: string }[] = [];
    for (const br of branches) {
      const dx = Math.sin(br.a) * Math.cos(br.b);
      const dz = Math.sin(br.a) * Math.sin(br.b);
      const dy = Math.cos(br.a);
      for (let i = 0; i < 16; i++) {
        const t = r.range(0.35, 1.08);
        flowers.push({ p: [dx * br.len * t + r.range(-0.17, 0.17), 0.55 + dy * br.len * t + r.range(-0.12, 0.12), dz * br.len * t + r.range(-0.17, 0.17)], s: r.range(0.045, 0.085), c: r.pick(['#ff8fb1', '#ff6f9f', '#ffb3c9', '#ff9ebb']) });
      }
    }
    return { branches, flowers };
  }, [seed]);
  return (
    <group>
      <Pot r={0.28} color="#c81f25" />
      <Ms geo={G.cyl(0.045, 0.06, 0.6, 7)} mat={M('#5a3a26', { rough: 0.9 })} pos={[0, 0.65, 0]} />
      {parts.branches.map((br, i) => {
        const dx = Math.sin(br.a) * Math.cos(br.b);
        const dz = Math.sin(br.a) * Math.sin(br.b);
        const dy = Math.cos(br.a);
        return (
          <group key={i} position={[0, 0.6, 0]} rotation={[Math.atan2(dz, dy) * -1, 0, Math.atan2(dx, dy) * -1]}>
            <Ms geo={G.cyl(0.012, 0.03, br.len, 5)} mat={M('#5a3a26', { rough: 0.9 })} pos={[0, br.len / 2, 0]} cast={false} />
          </group>
        );
      })}
      {parts.flowers.map((f, i) => (
        <Ms key={i} geo={G.sphere(f.s, 7, 5)} mat={M(f.c, { rough: 0.7 })} pos={f.p} cast={false} />
      ))}
    </group>
  );
}

/** Kumquat tree (cây quất): a round green crown full of small orange fruit. */
function Kumquat({ seed }: { seed: number }) {
  const fruit = useMemo(() => {
    const r = new Rng(seed + 9);
    return Array.from({ length: 34 }, () => {
      const a = r.range(0, 6.28);
      const b = r.range(0.25, 2.7);
      return [Math.sin(b) * Math.cos(a) * 0.36, 0.95 + Math.cos(b) * 0.34, Math.sin(b) * Math.sin(a) * 0.36] as V3;
    });
  }, [seed]);
  return (
    <group>
      <Pot r={0.25} color="#d9262c" />
      <Ms geo={G.cyl(0.035, 0.05, 0.5, 6)} mat={M('#5a3a26')} pos={[0, 0.55, 0]} />
      <Ms geo={G.sphere(0.4, 16, 12)} mat={M('#3f9b4b', { rough: 0.85 })} pos={[0, 0.98, 0]} scale={[1, 0.88, 1]} />
      {fruit.map((p, i) => (
        <Ms key={i} geo={G.sphere(0.052, 8, 6)} mat={M('#ff9a1f', { rough: 0.5 })} pos={p} cast={false} />
      ))}
    </group>
  );
}

function Tet({ layout, spots }: { layout: RoomLayout; spots: { x: number; z: number }[] }) {
  const { width: W, depth: D, wallHeight: H } = layout;
  const banner = useMemo(() => textTexture('CHÚC MỪNG NĂM MỚI', 512, 88, '#c81f25', '#ffd166', { border: '#ffd166' }), []);
  // a clear stretch of the back wall for the banner
  const bannerX = useMemo(() => {
    for (let x = 0; x < 40; x++) {
      const pos = (x % 2 ? 1 : -1) * Math.ceil(x / 2) * 0.5;
      if (!layout.windows.some((w) => w.wall === 'back' && Math.abs(w.pos - pos) < w.w / 2 + 1.6)) return pos;
    }
    return 0;
  }, [layout]);
  return (
    <>
      <mesh geometry={G.plane(3.1, 0.53)} position={[bannerX, H - 0.36, -D / 2 + 0.05]}>
        <meshBasicMaterial map={banner} transparent />
      </mesh>
      <Hung a={[-W / 2 + 0.9, H - 0.04, -D / 2 + 0.1]} b={[W / 2 - 0.9, H - 0.04, -D / 2 + 0.1]} n={Math.max(4, Math.round(W / 3))} sag={0} make={(i) => <Lantern s={0.95 + (i % 2) * 0.15} />} />
      <Hung a={[-W / 2 + 0.1, H - 0.04, -D / 2 + 1.4]} b={[-W / 2 + 0.1, H - 0.04, D / 2 - 1.2]} n={Math.max(3, Math.round(D / 3))} sag={0} make={(i) => <Lantern s={1.05 - (i % 2) * 0.1} />} />
      {spots[0] ? (
        <group position={[spots[0].x, 0, spots[0].z]} rotation={[0, VIEW_YAW, 0]} scale={1.25}>
          <Blossom seed={layout.seed} />
        </group>
      ) : null}
      {spots[1] ? (
        <group position={[spots[1].x, 0, spots[1].z]} rotation={[0, VIEW_YAW, 0]} scale={1.15}>
          <Kumquat seed={layout.seed} />
        </group>
      ) : null}
      {spots[2] ? (
        <group position={[spots[2].x, 0, spots[2].z]} rotation={[0, VIEW_YAW, 0]} scale={0.9}>
          <Kumquat seed={layout.seed + 1} />
        </group>
      ) : null}
    </>
  );
}

/** Festive decorations of a room (baked with the rest of the static furniture). */
export function SeasonDecor({ layout, season }: { layout: RoomLayout; season: Season }) {
  const spots = useMemo(() => (season === 'none' ? [] : freeSpots(layout)), [layout, season]);
  if (season === 'halloween') return <Halloween layout={layout} spots={spots} />;
  if (season === 'xmas') return <Christmas layout={layout} spots={spots} />;
  if (season === 'tet') return <Tet layout={layout} spots={spots} />;
  return null;
}
