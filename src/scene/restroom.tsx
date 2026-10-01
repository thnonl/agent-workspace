import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Prop, Restroom, RoomLayout } from '../world/layout';
import type { RoomTheme } from '../world/palettes';
import { frame } from '../sim/frame';
import { simsInRoom } from '../sim/registry';
import { G, M, MB, shade } from './kit';
import { RB, Ms, damp } from './furniture';
import { floorTexture } from './textures';

/** the door leaf; over the doorway the wall continues */
const DOOR_H = 2.05;
const PART_T = 0.06;
/** opacity of the walls while somebody uses the cubicle */
const SEE_THROUGH = 0.14;

/** the sign texture: a big white "WC" on green (drawn by hand so the letters fill the board) */
function wcTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d')!;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#1f7a5a';
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, 48);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 18;
    g.beginPath();
    g.roundRect(22, 22, c.width - 44, c.height - 44, 34);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 230px "Baloo 2 Variable", system-ui, sans-serif';
    g.fillText('WC', c.width / 2, c.height / 2 + 14);
    t.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw).catch(() => undefined);
  return t;
}

/** The toilet (local +z is the front; the tank stands against the wall at z = -0.31, the seat ring is centred at z = +0.12 at 0.42 m). */
export function Toilet({ p }: { p: Prop; theme: RoomTheme }) {
  const porcelain = M('#f6f8fb', { rough: 0.25 });
  const seatCol = M(shade(p.color2, 0.12), { rough: 0.45 });
  return (
    <group>
      {/* tank, lid and flush button */}
      <RB size={[0.5, 0.42, 0.18]} pos={[0, 0.62, -0.31]} color="#f6f8fb" r={0.04} rough={0.25} />
      <RB size={[0.53, 0.04, 0.21]} pos={[0, 0.85, -0.31]} color="#eaf0f6" r={0.015} rough={0.25} />
      <Ms geo={G.cyl(0.035, 0.035, 0.03, 12)} mat={M('#c9d3df', { metal: 0.6, rough: 0.3 })} pos={[0.12, 0.885, -0.31]} cast={false} />
      {/* pedestal and bowl */}
      <Ms geo={G.cyl(0.13, 0.17, 0.3, 16)} mat={porcelain} pos={[0, 0.15, 0.0]} />
      <Ms geo={G.sphere(0.24, 20, 14)} mat={porcelain} pos={[0, 0.34, 0.1]} scale={[0.82, 0.52, 1.22]} />
      {/* seat ring and the water in the bowl */}
      <Ms geo={G.torus(0.2, 0.04, Math.PI * 2, 8, 24)} mat={seatCol} pos={[0, 0.42, 0.12]} rot={[Math.PI / 2, 0, 0]} scale={[0.86, 1.2, 1]} />
      <Ms geo={G.cyl(0.15, 0.15, 0.012, 20)} mat={M('#9fd8f0', { rough: 0.1 })} pos={[0, 0.39, 0.12]} scale={[0.86, 1, 1.18]} cast={false} />
      {/* the lid stands up against the tank */}
      <RB size={[0.36, 0.035, 0.4]} pos={[0, 0.66, -0.17]} rot={[-1.45, 0, 0]} color={shade(p.color2, 0.12)} r={0.015} rough={0.45} />
      {/* a spare roll on the floor */}
      <Ms geo={G.cyl(0.055, 0.055, 0.1, 12)} mat={M('#ffffff', { rough: 0.9 })} pos={[-0.4, 0.05, -0.18]} />
      <Ms geo={G.cyl(0.02, 0.02, 0.102, 8)} mat={M('#d9b382')} pos={[-0.4, 0.05, -0.18]} cast={false} />
    </group>
  );
}

interface Piece {
  /** centre and size (x, z) of a wall piece */
  x: number;
  z: number;
  w: number;
  d: number;
}

/** The wall pieces of the cubicle (room coordinates): the front ones either side of the doorway, the side wall. */
export function restroomPieces(layout: RoomLayout, rr: Restroom): Piece[] {
  const W = layout.width;
  const D = layout.depth;
  const sign = rr.corner === 'backRight' ? 1 : -1;
  const lo = Math.min(rr.sideX, sign * W / 2);
  const hi = Math.max(rr.sideX, sign * W / 2);
  const a = rr.doorX - rr.doorW / 2;
  const b = rr.doorX + rr.doorW / 2;
  const out: Piece[] = [];
  if (a - lo > 0.05) out.push({ x: (lo + a) / 2, z: rr.frontZ, w: a - lo, d: PART_T });
  if (hi - b > 0.05) out.push({ x: (b + hi) / 2, z: rr.frontZ, w: hi - b, d: PART_T });
  out.push({ x: rr.sideX, z: (-D / 2 + rr.frontZ) / 2, w: PART_T, d: rr.frontZ + D / 2 });
  return out;
}

/** The part of the cubicle that never changes: the tiled floor. */
export function RestroomShell({ rr }: { rr: Restroom }) {
  const tiles = useMemo(() => floorTexture('checker', '#f4f8fb', '#cfdde7', 3, 3), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rr.x, 0.02, rr.z]} receiveShadow>
        <planeGeometry args={[rr.w, rr.d]} />
        <meshStandardMaterial map={tiles} roughness={0.35} />
      </mesh>
    </group>
  );
}

const OPEN_ANGLE = 1.75;
const DOT_FREE = MB('#5ee08a');
const DOT_BUSY = MB('#ff5d73');

/**
 * The walls and the swinging door of the cubicle. The walls are full height; while somebody walks in, sits inside or walks out
 * they fade to nearly clear (the camera looks into the room from the front). The door opens outwards while somebody walks
 * through it and stays shut while somebody sits inside.
 */
export function RestroomWalls({ roomId, layout, rr }: { roomId: string; layout: RoomLayout; rr: Restroom }) {
  const leaf = useRef<THREE.Group>(null);
  const free = useRef<THREE.Mesh>(null);
  const busy = useRef<THREE.Mesh>(null);
  const state = useRef({ open: 0, see: 1 });
  const sign = rr.corner === 'backRight' ? 1 : -1;
  // the cubicle is closed: its walls are as high as the walls of the room (they fade to glass while somebody is inside, so one still sees what goes on)
  const STALL_H = layout.wallHeight;
  const pieces = useMemo(() => restroomPieces(layout, rr), [layout, rr]);
  // the big WC sign hangs on the front wall above the door (it never fades)
  const plate = useMemo(() => wcTexture(), []);
  // (own materials: their opacity changes)
  const mats = useMemo(() => {
    const wall = new THREE.MeshStandardMaterial({ color: shade(layout.theme.accent2, 0.14), roughness: 0.4 });
    const trim = new THREE.MeshStandardMaterial({ color: '#e8edf5', roughness: 0.5 });
    const door = new THREE.MeshStandardMaterial({ color: shade(layout.theme.accent2, 0.04), roughness: 0.4 });
    return { wall, trim, door };
  }, [layout.theme, plate]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useFrame((_, dt) => {
    const g = leaf.current;
    if (!g || !frame.animRooms.has(roomId)) return;
    let wantOpen = 0;
    let inUse = false;
    let someone = false;
    for (const s of simsInRoom(roomId)) {
      if (!s.onStage || !s.wc) continue;
      someone = true;
      if (s.wc === 1 || s.wc === 3) wantOpen = 1;
      if (s.wc >= 2) inUse = true;
    }
    const st = state.current;
    const d = Math.min(dt, 0.1);
    st.open = damp(st.open, wantOpen, 12, d);
    st.see = damp(st.see, someone ? SEE_THROUGH : 1, 7, d);
    g.rotation.y = sign * OPEN_ANGLE * st.open;
    const solid = st.see > 0.985;
    for (const m of [mats.wall, mats.trim, mats.door]) {
      const t = !solid;
      if (m.transparent !== t) {
        m.transparent = t;
        m.needsUpdate = true;
      }
      m.opacity = solid ? 1 : st.see;
      m.depthWrite = solid;
    }
    if (free.current) free.current.visible = !inUse;
    if (busy.current) busy.current.visible = inUse;
  });
  const len = rr.doorW - 0.03;
  return (
    <group>
      {pieces.map((pc, i) => (
        <group key={i} position={[pc.x, 0, pc.z]}>
          <mesh geometry={G.rbox(pc.w, STALL_H, pc.d, 0.012)} material={mats.wall} position={[0, STALL_H / 2, 0]} />
          <mesh geometry={G.rbox(pc.w + (pc.w > pc.d ? 0.02 : 0.05), 0.05, pc.d + (pc.w > pc.d ? 0.05 : 0.02), 0.015)} material={mats.trim} position={[0, STALL_H + 0.025, 0]} />
          <mesh geometry={G.rbox(pc.w + (pc.w > pc.d ? 0.02 : 0.03), 0.08, pc.d + (pc.w > pc.d ? 0.03 : 0.02), 0.015)} material={mats.trim} position={[0, 0.04, 0]} />
        </group>
      ))}
      {/* the wall over the doorway, and the frame of the door */}
      <group position={[rr.doorX, 0, rr.frontZ]}>
        <mesh geometry={G.rbox(rr.doorW, STALL_H - DOOR_H, PART_T, 0.012)} material={mats.wall} position={[0, (STALL_H + DOOR_H) / 2, 0]} />
        <mesh geometry={G.rbox(rr.doorW + 0.02, 0.05, PART_T + 0.05, 0.015)} material={mats.trim} position={[0, STALL_H + 0.025, 0]} />
      </group>
      {/* the WC sign: a framed board on the wall over the door, facing the room */}
      <group position={[rr.doorX, (DOOR_H + STALL_H) / 2, rr.frontZ + PART_T / 2 + 0.03]}>
        <RB size={[1.4, 0.92, 0.05]} color="#e8edf5" r={0.035} />
        <mesh position={[0, 0, 0.0265]}>
          <planeGeometry args={[1.32, 0.84]} />
          <meshBasicMaterial map={plate} toneMapped={false} />
        </mesh>
      </group>
      <group ref={leaf} position={[rr.hingeX, 0, rr.frontZ]}>
        <mesh geometry={G.rbox(len, DOOR_H - 0.04, 0.04, 0.012)} material={mats.door} position={[-sign * (len / 2 + 0.01), 0.04 + (DOOR_H - 0.04) / 2, 0]} />
        <mesh geometry={G.rbox(len, 0.04, 0.05, 0.012)} material={mats.trim} position={[-sign * (len / 2 + 0.01), DOOR_H, 0]} />
        <Ms geo={G.sphere(0.025, 8, 6)} mat={M('#c9d3df', { metal: 0.6, rough: 0.3 })} pos={[-sign * (len - 0.07), 1.0, 0.035]} cast={false} />
        {/* free / occupied dot */}
        <mesh ref={free} geometry={G.circle(0.035, 12)} material={DOT_FREE} position={[-sign * (len - 0.07), 1.12, 0.023]} />
        <mesh ref={busy} geometry={G.circle(0.035, 12)} material={DOT_BUSY} position={[-sign * (len - 0.07), 1.12, 0.023]} visible={false} />
      </group>
    </group>
  );
}
