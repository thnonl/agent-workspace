import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { rrWorld, type Prop, type Restroom, type RoomLayout } from '../world/layout';
import type { RoomTheme } from '../world/palettes';
import { frame } from '../sim/frame';
import { simsInRoom } from '../sim/registry';
import { G, M, MB, shade } from './kit';
import { RB, Ms, damp } from './furniture';
import { floorTexture } from './textures';
import { WALL_T } from './RoomParts';

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

/** The looks of a cubicle (Restroom.style): walls, door and the two colours of the floor tiles. */
function looksOf(rr: Restroom, theme: RoomTheme): { wall: string; door: string; tiles: [string, string] } {
  switch (rr.style) {
    case 1: return { wall: '#e9eef4', door: '#7fb3d5', tiles: ['#ffffff', '#dde5ee'] };
    case 2: return { wall: shade(theme.accent3, 0.12), door: shade(theme.accent3, -0.06), tiles: ['#f4efe6', '#d9cdb8'] };
    case 3: return { wall: '#dcc6a6', door: '#a57c52', tiles: ['#eef6f1', '#c6ddd0'] };
    default: return { wall: shade(theme.accent2, 0.14), door: shade(theme.accent2, 0.04), tiles: ['#f4f8fb', '#cfdde7'] };
  }
}

/** The wall pieces of the cubicle in its own frame (local +z: the way the doorway faces): the front ones either side of the doorway, the side partitions. */
export function restroomPieces(rr: Restroom): Piece[] {
  const a = -rr.doorW / 2;
  const b = rr.doorW / 2;
  const out: Piece[] = [];
  if (a + rr.w / 2 > 0.05) out.push({ x: (-rr.w / 2 + a) / 2, z: rr.d / 2, w: a + rr.w / 2, d: PART_T });
  if (rr.w / 2 - b > 0.05) out.push({ x: (b + rr.w / 2) / 2, z: rr.d / 2, w: rr.w / 2 - b, d: PART_T });
  rr.sides.forEach((on, i) => {
    if (on) out.push({ x: (i ? 1 : -1) * rr.w / 2, z: 0, w: PART_T, d: rr.d });
  });
  return out;
}

/** The same pieces in room coordinates (centre, size, yaw). */
export function restroomWorldPieces(rr: Restroom): (Piece & { rot: number })[] {
  return restroomPieces(rr).map((pc) => ({ ...pc, ...rrWorld(rr, pc.x, pc.z), rot: rr.rot }));
}

/** The part of the cubicle that never changes: the tiled floor (and for an alcove behind the wall: its walls and the base under it). */
export function RestroomShell({ rr, layout }: { rr: Restroom; layout: RoomLayout }) {
  const { theme, wallHeight: H } = layout;
  const look = looksOf(rr, theme);
  const tiles = useMemo(() => floorTexture('checker', look.tiles[0], look.tiles[1], rr.w / 0.58, rr.d / 0.58), [look.tiles[0], look.tiles[1], rr.w, rr.d]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = WALL_T;
  return (
    <group position={[rr.x, 0, rr.z]} rotation={[0, rr.rot, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[rr.w, rr.d]} />
        <meshStandardMaterial map={tiles} roughness={0.35} />
      </mesh>
      {rr.alcove ? (
        <>
          {/* the diorama base under the alcove */}
          <RB size={[rr.w + 2 * t + 0.3, 0.6, rr.d + t + 0.3]} pos={[0, -0.3, rr.d / 2 - (rr.d + t + 0.3) / 2 + 0.15]} color={theme.base} r={0.12} receive />
          {/* its two side walls and its back wall, with the trim on top like the walls of the room */}
          {[-1, 1].map((s) => (
            <group key={s}>
              <RB size={[t, H, rr.d + t]} pos={[s * (rr.w / 2 + t / 2), H / 2, rr.d / 2 - (rr.d + t) / 2]} color={theme.wall} r={0.02} />
              <RB size={[t + 0.06, 0.1, rr.d + t + 0.04]} pos={[s * (rr.w / 2 + t / 2), H + 0.04, rr.d / 2 - (rr.d + t) / 2]} color={theme.trim} r={0.015} />
            </group>
          ))}
          <RB size={[rr.w + 2 * t, H, t]} pos={[0, H / 2, -rr.d / 2 - t / 2]} color={theme.wall} r={0.02} />
          <RB size={[rr.w + 2 * t + 0.04, 0.1, t + 0.06]} pos={[0, H + 0.04, -rr.d / 2 - t / 2]} color={theme.trim} r={0.015} />
        </>
      ) : null}
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
  const sign = rr.hinge;
  // the cubicle is closed: its walls are as high as the walls of the room (they fade to glass while somebody is inside, so one still sees what goes on)
  const STALL_H = layout.wallHeight;
  const pieces = useMemo(() => restroomPieces(rr), [rr]);
  // the big WC sign hangs on the front wall above the door (it never fades)
  const plate = useMemo(() => wcTexture(), []);
  // (own materials: their opacity changes)
  const mats = useMemo(() => {
    const look = looksOf(rr, layout.theme);
    const wall = new THREE.MeshStandardMaterial({ color: look.wall, roughness: 0.4 });
    const trim = new THREE.MeshStandardMaterial({ color: '#e8edf5', roughness: 0.5 });
    const door = new THREE.MeshStandardMaterial({ color: look.door, roughness: 0.4 });
    return { wall, trim, door };
  }, [layout.theme, rr, plate]);
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
  const front = rr.d / 2;
  return (
    <group position={[rr.x, 0, rr.z]} rotation={[0, rr.rot, 0]}>
      {pieces.map((pc, i) => (
        <group key={i} position={[pc.x, 0, pc.z]}>
          <mesh geometry={G.rbox(pc.w, STALL_H, pc.d, 0.012)} material={mats.wall} position={[0, STALL_H / 2, 0]} />
          <mesh geometry={G.rbox(pc.w + (pc.w > pc.d ? 0.02 : 0.05), 0.05, pc.d + (pc.w > pc.d ? 0.05 : 0.02), 0.015)} material={mats.trim} position={[0, STALL_H + 0.025, 0]} />
          <mesh geometry={G.rbox(pc.w + (pc.w > pc.d ? 0.02 : 0.03), 0.08, pc.d + (pc.w > pc.d ? 0.03 : 0.02), 0.015)} material={mats.trim} position={[0, 0.04, 0]} />
        </group>
      ))}
      {/* the wall over the doorway, and the frame of the door */}
      <group position={[0, 0, front]}>
        <mesh geometry={G.rbox(rr.doorW, STALL_H - DOOR_H, PART_T, 0.012)} material={mats.wall} position={[0, (STALL_H + DOOR_H) / 2, 0]} />
        <mesh geometry={G.rbox(rr.doorW + 0.02, 0.05, PART_T + 0.05, 0.015)} material={mats.trim} position={[0, STALL_H + 0.025, 0]} />
      </group>
      {/* the WC sign: a framed board on the wall over the door, facing the room */}
      <group position={[0, (DOOR_H + STALL_H) / 2, front + PART_T / 2 + 0.03]}>
        <RB size={[1.4, 0.92, 0.05]} color="#e8edf5" r={0.035} />
        <mesh position={[0, 0, 0.0265]}>
          <planeGeometry args={[1.32, 0.84]} />
          <meshBasicMaterial map={plate} toneMapped={false} />
        </mesh>
      </group>
      <group ref={leaf} position={[sign * (rr.doorW / 2), 0, front]}>
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
