import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { RoomLayout } from '../world/layout';
import { DESK_TOP } from './furniture';
import { frame } from '../sim/frame';
import { propHere } from '../sim/registry';
import { useDeliveryVersion } from './useDelivery';
import { env } from '../env';
import { DUST, FX, HALO, initFx } from './fx';
import { litOf } from './glow';

/** Point of a prop / desk item in room space: room-local offset (x, z) turned by `rot`, then moved to (cx, cz). */
const at = (cx: number, cz: number, rot: number, x: number, z: number): [number, number] => [cx + x * Math.cos(rot) + z * Math.sin(rot), cz - x * Math.sin(rot) + z * Math.cos(rot)];

export interface LampSpot {
  x: number;
  y: number;
  z: number;
  /** radius of the light pool on the floor / desk beneath it */
  pool: number;
  /** height of the surface the pool lies on */
  floor: number;
}

/** Every lamp of a room: floor lamps, desk lamps, the director's lamp and the wall sconces (room space). */
export function lampsOf(layout: RoomLayout): LampSpot[] {
  const out: LampSpot[] = [];
  const { width: W, depth: D } = layout;
  layout.props.forEach((p, i) => {
    if (p.kind === 'floorLamp' && propHere(layout, i)) out.push({ x: p.x, y: 1.58, z: p.z, pool: 1.7, floor: 0.036 });
  });
  for (const d of layout.desks) {
    for (const it of d.items) {
      if (it.kind !== 'lamp') continue;
      const [ix, iz] = at(0, 0, it.rot, 0.028, 0);
      const [x, z] = at(d.x, d.z, d.rot, it.x + ix, it.z + iz);
      out.push({ x, y: DESK_TOP + 0.27, z, pool: 0.62, floor: DESK_TOP + 0.006 });
    }
  }
  {
    const [x, z] = [layout.director.desk.x - 1.14, layout.director.desk.z - 0.25];
    out.push({ x, y: DESK_TOP + 0.4, z, pool: 0.75, floor: DESK_TOP + 0.03 });
  }
  for (const w of layout.wallDecor) {
    if (w.kind !== 'sconce') continue;
    if (w.wall === 'back') out.push({ x: w.pos, y: w.y, z: -D / 2 + 0.16, pool: 0, floor: 0 });
    else out.push({ x: -W / 2 + 0.16, y: w.y, z: w.pos, pool: 0, floor: 0 });
  }
  return out;
}

function quad(pos: number[], uv: number[], idx: number[], x: number, y: number, z: number, r: number) {
  const b = pos.length / 3;
  pos.push(x - r, y, z - r, x + r, y, z - r, x + r, y, z + r, x - r, y, z + r);
  uv.push(0, 0, 1, 0, 1, 1, 0, 1);
  idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
}

function buildPools(lamps: LampSpot[]): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const l of lamps) if (l.pool > 0) quad(pos, uv, idx, l.x, l.floor, l.z, l.pool);
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const MOTES_PER_WINDOW = 9;

/** Light effects of a room: pools of lamp light on the floor / desks, a glow around every bulb at night and dust drifting through the window light by day. */
export function RoomLightFx({ layout, roomId, halos, dust }: { layout: RoomLayout; roomId: string; halos: boolean; dust: boolean }) {
  initFx();
  // (a floor lamp that has just been delivered gets its light pool)
  const delivered = useDeliveryVersion(roomId, layout);
  const lamps = useMemo(() => lampsOf(layout), [layout, delivered]); // eslint-disable-line react-hooks/exhaustive-deps
  const pools = useMemo(() => buildPools(lamps), [lamps]);
  useEffect(() => () => pools?.dispose(), [pools]);
  const haloGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lamps.flatMap((l) => [l.x, l.y, l.z]), 3));
    return g;
  }, [lamps]);
  useEffect(() => () => haloGeo.dispose(), [haloGeo]);
  // (own copies of the shared pool / halo materials: they go dark with this room's lights, see roomLit)
  const poolMat = useMemo(() => FX.pool.clone(), []);
  const haloMat = useMemo(() => HALO.clone(), []);
  useEffect(() => () => {
    poolMat.dispose();
    haloMat.dispose();
  }, [poolMat, haloMat]);

  // dust: each window's light patch spans from the wall into the room along `dir`
  const windows = useMemo(() => {
    const { width: W, depth: D } = layout;
    return layout.windows.map((w) => (w.wall === 'back'
      ? { cx: w.pos, cz: -D / 2, w: w.w, along: 'x' as const }
      : { cx: -W / 2, cz: w.pos, w: w.w, along: 'z' as const }));
  }, [layout]);
  const seeds = useMemo(() => windows.flatMap((_, wi) => Array.from({ length: MOTES_PER_WINDOW }, (_, i) => ({ wi, p: (i + Math.random() * 0.6) / MOTES_PER_WINDOW, u: Math.random() - 0.5, s: 0.6 + Math.random() * 0.8, ph: Math.random() * 6.28 }))), [windows]);
  const dustGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(seeds.length * 3), 3));
    return g;
  }, [seeds]);
  useEffect(() => () => dustGeo.dispose(), [dustGeo]);
  const pts = useRef<THREE.Points>(null);
  const clock = useRef(0);
  useFrame((_, dt) => {
    const lit = litOf(roomId);
    poolMat.opacity = FX.pool.opacity * lit;
    haloMat.opacity = HALO.opacity * lit;
    const o = pts.current;
    if (!o || !dust || !frame.animRooms.has(roomId)) return;
    const vis = env.day * (1 - env.overcast);
    o.visible = vis > 0.04;
    if (!o.visible) return;
    clock.current += dt;
    const t = clock.current;
    const a = dustGeo.attributes.position as THREE.BufferAttribute;
    seeds.forEach((s, i) => {
      const w = windows[s.wi];
      const v = (s.p + t * 0.012 * s.s) % 1;
      const across = s.u * w.w * 0.8;
      // the patch of light leans 1.5 sideways over its 3.4 length (see Sunbeam)
      const px = w.along === 'x' ? w.cx + across + 1.5 * v : w.cx + 0.05 + 3.35 * v;
      const pz = w.along === 'x' ? w.cz + 0.05 + 3.35 * v : w.cz + across + 1.5 * v;
      a.setXYZ(i, px + Math.sin(t * 0.4 * s.s + s.ph) * 0.12, 0.45 + 1.7 * ((s.p * 7 + t * 0.03 * s.s + s.ph) % 1) + Math.sin(t * 0.7 + s.ph) * 0.08, pz + Math.cos(t * 0.35 * s.s + s.ph) * 0.12);
    });
    a.needsUpdate = true;
  });

  return (
    <>
      {pools ? <mesh geometry={pools} material={poolMat} renderOrder={3} raycast={() => null} /> : null}
      {halos ? <points geometry={haloGeo} material={haloMat} renderOrder={4} raycast={() => null} frustumCulled={false} /> : null}
      {dust ? <points ref={pts} geometry={dustGeo} material={DUST} renderOrder={4} raycast={() => null} frustumCulled={false} /> : null}
    </>
  );
}
