import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FOOT, type PropKind, type RoomLayout } from '../world/layout';
import { WALL_T } from './RoomParts';
import { FX, initFx } from './fx';

/** props that are too low to cast a visible shadow */
const NO_AO = new Set<PropKind>(['dumbbells']);
/** big sets stand on legs: only the middle of their footprint is dark */
const SHRINK: Partial<Record<PropKind, number>> = { meetingSet: 0.62, loungeSet: 0.7, sofa: 0.96, credenza: 0.98 };
const US = [0, 0.4, 0.6, 1];

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  /** how far the shadow spreads beyond the footprint */
  m: number;
}

/**
 * One merged mesh of soft floor shadows ("ambient occlusion"): every desk and prop gets a feathered patch under its
 * footprint, and the walls get a band along their foot. The real shadow map is off (too costly for a page that
 * idles on a second screen); this gives the furniture its contact shadows at the price of one draw call.
 */
function buildAO(layout: RoomLayout): THREE.BufferGeometry {
  const { width: W, depth: D } = layout;
  const t = WALL_T;
  const rects: Rect[] = [];
  // walls (their inner half is hidden inside the wall itself)
  rects.push({ x: -t / 2, z: -D / 2 - t / 2, w: W + t, d: t, rot: 0, m: 0.62 });
  rects.push({ x: -W / 2 - t / 2, z: 0, w: t, d: D, rot: 0, m: 0.62 });
  for (const d of layout.desks) rects.push({ x: d.x, z: d.z, w: d.w, d: 1.0, rot: d.rot, m: 0.34 });
  rects.push({ x: layout.director.desk.x, z: layout.director.desk.z, w: 3.0, d: 1.2, rot: 0, m: 0.4 });
  for (const p of layout.props) {
    if (NO_AO.has(p.kind)) continue;
    const [fw, fd] = FOOT[p.kind];
    const k = SHRINK[p.kind] ?? 1;
    const small = Math.min(fw, fd);
    rects.push({ x: p.x, z: p.z, w: fw * k, d: fd * k, rot: p.rot, m: Math.min(0.42, 0.14 + small * 0.2) });
  }

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const r of rects) {
    const hw = r.w / 2;
    const hd = r.d / 2;
    const xs = [-(hw + r.m), -hw, hw, hw + r.m];
    const zs = [-(hd + r.m), -hd, hd, hd + r.m];
    const c = Math.cos(r.rot);
    const s = Math.sin(r.rot);
    const base = pos.length / 3;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        pos.push(r.x + xs[i] * c + zs[j] * s, 0, r.z - xs[i] * s + zs[j] * c);
        uv.push(US[i], US[j]);
      }
    }
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const a = base + j * 4 + i;
        // (counter-clockwise seen from above)
        idx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Floor shadows of a room; rendered just above the floor / rugs, below the light effects. */
export function RoomAO({ layout }: { layout: RoomLayout }) {
  initFx();
  const geo = useMemo(() => buildAO(layout), [layout]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={FX.ao} position={[0, 0.031, 0]} renderOrder={1} raycast={() => null} />;
}
