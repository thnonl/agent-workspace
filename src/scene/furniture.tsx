import { useMemo, useRef } from 'react';
import { DeskPlant } from './plants';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { DeskDecor, DeskSlot, RoomLayout } from '../world/layout';
import { rot2 } from '../world/layout';
import type { RoomTheme } from '../world/palettes';
import { Rng } from '../util/rng';
import { roomRuntime, sims, simsInRoom, type SimState } from '../sim/registry';
import { frame } from '../sim/frame';
import { G, M, MB, shade } from './kit';
import { textTexture } from './textures';
import { StaticBake } from './StaticBake';
import { GLOW, glowMat } from './glow';
import { useBaked } from './bake';
import { DESK_Y, SEAT_LIFT } from '../sim/actor';

export const DESK_TOP = DESK_Y;

type V3 = [number, number, number];

interface RBProps {
  size: V3;
  pos?: V3;
  rot?: V3;
  color: string;
  r?: number;
  rough?: number;
  metal?: number;
  cast?: boolean;
  receive?: boolean;
  opacity?: number;
  emissive?: string;
}

/** Rounded box – the workhorse of all furniture. */
export function RB({ size, pos = [0, 0, 0], rot, color, r = 0.03, rough = 0.7, metal = 0, cast = true, receive = true, opacity, emissive }: RBProps) {
  return (
    <mesh geometry={G.rbox(size[0], size[1], size[2], r)} material={M(color, { rough, metal, opacity, emissive })} position={pos} rotation={rot} castShadow={cast} receiveShadow={receive} />
  );
}

interface MProps {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  pos?: V3;
  rot?: V3;
  scale?: V3 | number;
  cast?: boolean;
  receive?: boolean;
}
export function Ms({ geo, mat, pos, rot, scale, cast = true, receive = false }: MProps) {
  return <mesh geometry={geo} material={mat} position={pos} rotation={rot} scale={scale} castShadow={cast} receiveShadow={receive} />;
}

export const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// ------------------------------------------------------------------------ desk items
export function DeskItem({ kind, theme, seed }: { kind: DeskDecor; theme: RoomTheme; seed: number }) {
  const col = [theme.accent, theme.accent2, theme.accent3][seed % 3];
  const col2 = [theme.accent3, theme.accent, theme.accent2][seed % 3];
  switch (kind) {
    case 'mug':
      return (
        <group>
          <Ms geo={G.cyl(0.055, 0.05, 0.11, 18)} mat={M(col, { rough: 0.35 })} pos={[0, 0.055, 0]} />
          <Ms geo={G.torus(0.032, 0.011, Math.PI * 2, 6, 14)} mat={M(col, { rough: 0.35 })} pos={[0.062, 0.058, 0]} />
          <Ms geo={G.cyl(0.046, 0.046, 0.004, 18)} mat={M('#7b4a2d', { rough: 0.3 })} pos={[0, 0.105, 0]} cast={false} />
        </group>
      );
    case 'plant':
      return <DeskPlant seed={seed} color={col} />;
    case 'notes':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <Ms key={i} geo={G.box(0.09, 0.006, 0.09)} mat={M([theme.accent3, '#ffffff', theme.accent2][i], { rough: 0.9 })} pos={[i * 0.02, 0.004 + i * 0.007, i * 0.015]} rot={[0, 0.3 * i - 0.2, 0]} cast={false} />
          ))}
        </group>
      );
    case 'lamp':
      return (
        <group>
          <Ms geo={G.cyl(0.06, 0.07, 0.018, 16)} mat={M('#f3f0ea')} pos={[0, 0.009, 0]} />
          <Ms geo={G.cyl(0.008, 0.008, 0.26, 6)} mat={M('#c9c4bc', { metal: 0.4 })} pos={[0, 0.14, 0]} />
          <Ms geo={G.cone(0.075, 0.1, 16)} mat={glowMat(col)} pos={[0.02, 0.29, 0]} rot={[0, 0, 0.2]} />
          <Ms geo={G.sphere(0.03, 8, 6)} mat={GLOW.bulb} pos={[0.028, 0.25, 0]} cast={false} />
        </group>
      );
    case 'pencils':
      return (
        <group>
          <Ms geo={G.cyl(0.045, 0.04, 0.09, 14)} mat={M(col, { rough: 0.5 })} pos={[0, 0.045, 0]} />
          {[0, 1, 2].map((i) => (
            <Ms key={i} geo={G.cyl(0.006, 0.006, 0.12, 6)} mat={M([theme.accent3, '#ff5d73', '#5ed3b0'][i])} pos={[(i - 1) * 0.02, 0.12, (i % 2) * 0.01]} rot={[0.12 * (i - 1), 0, 0.15 * (i - 1)]} cast={false} />
          ))}
        </group>
      );
    case 'donut':
      return (
        <group>
          <Ms geo={G.cyl(0.09, 0.09, 0.008, 20)} mat={M('#ffffff')} pos={[0, 0.004, 0]} cast={false} />
          <Ms geo={G.torus(0.045, 0.024, Math.PI * 2, 10, 20)} mat={M('#e8b06d', { rough: 0.6 })} pos={[0, 0.03, 0]} rot={[Math.PI / 2, 0, 0]} />
          <Ms geo={G.torus(0.045, 0.026, Math.PI * 2, 10, 20)} mat={M(col2, { rough: 0.4 })} pos={[0, 0.038, 0]} rot={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.55]} />
        </group>
      );
    case 'books':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <RB key={i} size={[0.2 - i * 0.02, 0.035, 0.14]} pos={[0, 0.018 + i * 0.036, 0]} rot={[0, (i - 1) * 0.25, 0]} color={[theme.accent, theme.accent3, theme.accent2][i]} r={0.008} />
          ))}
        </group>
      );
    case 'cactus':
      return (
        <group>
          <Ms geo={G.cyl(0.05, 0.04, 0.07, 12)} mat={M('#ffffff', { rough: 0.6 })} pos={[0, 0.035, 0]} />
          <Ms geo={G.capsule(0.034, 0.08, 5, 10)} mat={M('#59c27d')} pos={[0, 0.13, 0]} />
          <Ms geo={G.capsule(0.02, 0.03, 4, 8)} mat={M('#59c27d')} pos={[0.05, 0.13, 0]} rot={[0, 0, -0.5]} />
          <Ms geo={G.sphere(0.014, 6, 5)} mat={M('#ff8fb1')} pos={[0, 0.2, 0]} />
        </group>
      );
    case 'phone':
      return (
        <group>
          <RB size={[0.15, 0.02, 0.26]} pos={[0, 0.01, 0]} color="#3a3d50" r={0.01} />
          <RB size={[0.09, 0.01, 0.05]} pos={[0, 0.024, -0.05]} color="#9fe8c1" r={0.005} cast={false} />
          <RB size={[0.05, 0.03, 0.2]} pos={[-0.09, 0.03, 0]} color="#2f3244" r={0.012} />
        </group>
      );
    case 'photo':
      return (
        <group rotation={[0, 0, 0]}>
          <RB size={[0.17, 0.2, 0.02]} pos={[0, 0.11, 0]} rot={[-0.15, 0, 0]} color={col} r={0.008} />
          <Ms geo={G.plane(0.13, 0.15)} mat={MB(shade(col2, 0.2))} pos={[0, 0.112, 0.012]} rot={[-0.15, 0, 0]} cast={false} />
          <Ms geo={G.circle(0.03, 12)} mat={MB('#ffe27a')} pos={[0.03, 0.14, 0.014]} rot={[-0.15, 0, 0]} cast={false} />
        </group>
      );
    case 'papers':
      return (
        <group>
          {[0, 1, 2, 3, 4].map((i) => (
            <Ms key={i} geo={G.box(0.22, 0.008, 0.3)} mat={M(i % 2 ? '#ffffff' : '#fff6de', { rough: 0.9 })} pos={[(i % 2) * 0.01, 0.006 + i * 0.008, 0]} rot={[0, (i - 2) * 0.09, 0]} cast={i === 4} />
          ))}
          <Ms geo={G.cyl(0.011, 0.011, 0.16, 6)} mat={M('#ff5d73')} pos={[0.05, 0.05, 0.02]} rot={[0, 0.6, Math.PI / 2]} cast={false} />
        </group>
      );
    case 'bottle':
      return (
        <group>
          <Ms geo={G.cyl(0.04, 0.04, 0.18, 14)} mat={M('#9ed8ff', { opacity: 0.75, rough: 0.2 })} pos={[0, 0.09, 0]} />
          <Ms geo={G.cyl(0.02, 0.03, 0.05, 12)} mat={M('#9ed8ff', { opacity: 0.75, rough: 0.2 })} pos={[0, 0.2, 0]} />
          <Ms geo={G.cyl(0.024, 0.024, 0.03, 10)} mat={M(col)} pos={[0, 0.24, 0]} />
        </group>
      );
    case 'notepad':
      return (
        <group>
          <RB size={[0.2, 0.02, 0.27]} pos={[0, 0.01, 0]} rot={[0, 0.2, 0]} color="#fff6de" r={0.006} />
          <Ms geo={G.box(0.2, 0.024, 0.02)} mat={M(col)} pos={[0.0, 0.012, -0.13]} rot={[0, 0.2, 0]} />
          <Ms geo={G.cyl(0.006, 0.006, 0.15, 6)} mat={M('#3a3d50')} pos={[0.13, 0.03, 0.03]} rot={[0, 0.3, Math.PI / 2]} cast={false} />
        </group>
      );
    case 'headphones':
      return (
        <group rotation={[0, 0.5, 0]}>
          <Ms geo={G.torus(0.075, 0.012, Math.PI, 6, 16)} mat={M('#3a3d50')} pos={[0, 0.03, 0]} rot={[Math.PI / 2 - 0.4, 0, 0]} />
          {[-1, 1].map((s) => (
            <Ms key={s} geo={G.cyl(0.04, 0.04, 0.03, 14)} mat={M(col, { rough: 0.5 })} pos={[s * 0.075, 0.02, 0.02]} rot={[0, 0, Math.PI / 2]} />
          ))}
        </group>
      );
    case 'tissue':
      return (
        <group>
          <RB size={[0.22, 0.09, 0.12]} pos={[0, 0.045, 0]} color={col2} r={0.02} />
          <Ms geo={G.sphere(0.05, 8, 6)} mat={M('#ffffff', { rough: 0.95 })} pos={[0, 0.11, 0]} scale={[1.6, 0.8, 0.6]} cast={false} />
        </group>
      );
    case 'stapler':
      return (
        <group rotation={[0, 0.3, 0]}>
          <RB size={[0.15, 0.03, 0.05]} pos={[0, 0.015, 0]} color={col} r={0.012} />
          <RB size={[0.14, 0.03, 0.045]} pos={[0, 0.04, 0]} rot={[0.05, 0, 0]} color={shade(col, -0.1)} r={0.012} />
        </group>
      );
    default:
      return null;
  }
}

// ------------------------------------------------------------------------ desk
export function Desk({ slot, theme }: { slot: DeskSlot; theme: RoomTheme }) {
  const c = slot.color;
  const w = slot.w;
  const ds = slot.drawerSide;
  const frosted = useMemo(() => shade(theme.accent2, 0.15), [theme]);
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rot, 0]}>
      <RB size={[w, 0.06, 1.0]} pos={[0, DESK_TOP - 0.03, 0]} color={theme.deskTop} r={0.028} rough={0.55} />
      <RB size={[w + 0.04, 0.02, 1.04]} pos={[0, DESK_TOP - 0.07, 0]} color={c} r={0.01} />
      {/* leg panel on one side, drawer pedestal on the other (drawers face the seat) */}
      <RB size={[0.06, 0.66, 0.9]} pos={[-ds * (w / 2 - 0.05), 0.33, 0]} color={c} r={0.02} />
      <RB size={[0.52, 0.64, 0.9]} pos={[ds * (w / 2 - 0.31), 0.33, 0]} color={c} r={0.03} />
      <RB size={[w - 0.66, 0.42, 0.03]} pos={[-ds * 0.27, 0.5, 0.42]} color={shade(c, -0.05)} r={0.012} />
      {[0.52, 0.28].map((y, i) => (
        <group key={i}>
          <RB size={[0.44, 0.22, 0.02]} pos={[ds * (w / 2 - 0.31), y, -0.46]} color={shade(c, 0.1)} r={0.012} />
          <Ms geo={G.sphere(0.022, 8, 6)} mat={M('#fff4d8', { metal: 0.3, rough: 0.35 })} pos={[ds * (w / 2 - 0.31), y + 0.02, -0.485]} cast={false} />
        </group>
      ))}
      {slot.partition ? <RB size={[0.04, 0.5, 0.96]} pos={[w / 2 + 0.01, DESK_TOP + 0.25, 0]} color={frosted} r={0.012} opacity={0.5} rough={0.2} cast={false} /> : null}
      {slot.items.map((it, i) => (
        <group key={i} position={[it.x, DESK_TOP, it.z]} rotation={[0, it.rot, 0]}>
          <DeskItem kind={it.kind} theme={theme} seed={slot.index + i} />
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------------ chair
export function Chair({ x, z, rot, turn, color, roomId, deskIndex, big = false, approachSide = -1, seed = 0 }: {
  x: number; z: number; rot: number; turn: number; color: string; roomId: string; deskIndex: number; big?: boolean; approachSide?: number; seed?: number;
}) {
  const pullG = useRef<THREE.Group>(null);
  const sw = useRef<THREE.Group>(null);
  const seatH = (big ? 0.46 : 0.36) + SEAT_LIFT;
  const dark = M('#4b4f63', { rough: 0.5 });
  const lat = useMemo(() => rot2(1, 0, rot), [rot]);
  const state = useRef({ pull: 0, turn });
  useFrame((clock, dt) => {
    if (!pullG.current || !sw.current || !frame.animRooms.has(roomId)) return;
    let occ: SimState | undefined;
    if (deskIndex < 0) {
      const key = roomRuntime.get(roomId)?.directorKey;
      occ = key ? sims.get(key) : undefined;
    } else {
      for (const s of simsInRoom(roomId)) if (s.desk === deskIndex && s.key !== roomRuntime.get(roomId)?.directorKey) occ = s;
    }
    // somebody who is away from the chair (offstage, on a break, at the boss) leaves it at a casual angle
    if (occ && (!occ.onStage || occ.phase === 'stroll' || occ.phase === 'activity' || occ.phase === 'toBoss' || occ.phase === 'handover')) occ = undefined;
    let pull = 0;
    let turnTarget = turn; // an empty chair is left at a casual angle
    if (occ) {
      const p = occ.phase;
      turnTarget = 0;
      if (p === 'sitting' || p === 'standing' || (p === 'entering' && Math.hypot(occ.x - (x + lat.x * approachSide * 0.98), occ.z - (z + lat.z * approachSide * 0.98)) < 1.9)) pull = approachSide * 0.55 * (1 - occ.sitT);
      if (p === 'working' || p === 'unpacking') turnTarget = Math.sin(clock.clock.elapsedTime * 0.9 + seed) * 0.09;
      if (p === 'standing') turnTarget = (1 - occ.sitT) * 0.5 * -approachSide;
    }
    const st = state.current;
    st.pull = damp(st.pull, pull, 10, dt);
    st.turn = damp(st.turn, turnTarget, 8, dt);
    pullG.current.position.set(lat.x * st.pull, 0, lat.z * st.pull);
    sw.current.rotation.y = rot + st.turn;
  });
  const w = big ? 0.72 : 0.54;
  return (
    <group position={[x, 0, z]}>
      <group ref={pullG}>
        <group ref={sw} rotation={[0, rot + turn, 0]}>
          <StaticBake>
          <RB size={[w, big ? 0.13 : 0.09, big ? 0.66 : 0.52]} pos={[0, seatH, 0]} color={color} r={0.04} rough={0.6} />
          <RB size={[w - 0.04, big ? 0.95 : 0.5, 0.1]} pos={[0, (big ? 0.95 : 0.66) + SEAT_LIFT, big ? -0.3 : -0.25]} rot={[-0.1, 0, 0]} color={color} r={0.05} rough={0.6} />
          {big ? (
            <>
              <RB size={[0.4, 0.22, 0.1]} pos={[0, 1.5 + SEAT_LIFT, -0.35]} rot={[-0.1, 0, 0]} color={shade(color, -0.04)} r={0.05} />
              {[-1, 1].map((s) => (
                <RB key={s} size={[0.07, 0.07, 0.5]} pos={[s * (w / 2 + 0.03), 0.68 + SEAT_LIFT, -0.03]} color={shade(color, -0.08)} r={0.03} />
              ))}
              {[-1, 1].map((s) => (
                <RB key={s} size={[0.06, 0.24, 0.06]} pos={[s * (w / 2 + 0.03), 0.55 + SEAT_LIFT, 0.15]} color="#4b4f63" r={0.02} />
              ))}
              <Ms geo={G.sphere(0.028, 8, 6)} mat={M('#ffd166', { metal: 0.5, rough: 0.3 })} pos={[-0.22, 1.3 + SEAT_LIFT, -0.25]} cast={false} />
              <Ms geo={G.sphere(0.028, 8, 6)} mat={M('#ffd166', { metal: 0.5, rough: 0.3 })} pos={[0.22, 1.3 + SEAT_LIFT, -0.25]} cast={false} />
            </>
          ) : null}
          <Ms geo={G.cyl(0.04, 0.04, seatH - 0.1, 10)} mat={dark} pos={[0, (seatH - 0.1) / 2 + 0.06, 0]} />
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <group key={i} rotation={[0, a, 0]}>
                <RB size={[0.28, 0.03, 0.05]} pos={[0.14, 0.07, 0]} color="#4b4f63" r={0.01} />
                <Ms geo={G.sphere(0.035, 8, 6)} mat={M('#2f3244')} pos={[0.27, 0.035, 0]} />
              </group>
            );
          })}
          </StaticBake>
        </group>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------------ director desk
/** The landline on the director's desk: base and cradle are static, the handset lifts off while the director holds it (a call from the user). */
function DirectorPhone({ roomId }: { roomId: string }) {
  const handset = useRef<THREE.Group>(null);
  useBaked(handset);
  useFrame(() => {
    const g = handset.current;
    if (!g || !frame.animRooms.has(roomId)) return;
    const k = roomRuntime.get(roomId)?.directorKey;
    const s = k ? sims.get(k) : undefined;
    const shown = !(s && s.handsetUp && s.onStage);
    if (g.visible !== shown) g.visible = shown;
  });
  return (
    <group>
      <RB size={[0.15, 0.03, 0.26]} pos={[0, 0.015, 0]} color="#3a3d50" r={0.012} />
      <RB size={[0.09, 0.012, 0.05]} pos={[0.01, 0.034, 0.08]} color="#9fe8c1" r={0.005} cast={false} />
      <RB size={[0.07, 0.008, 0.12]} pos={[0.0, 0.034, -0.05]} color="#2a2c3b" r={0.004} cast={false} />
      {/* cradle prongs */}
      <RB size={[0.014, 0.05, 0.03]} pos={[-0.09, 0.045, 0.085]} color="#2a2c3b" r={0.005} cast={false} />
      <RB size={[0.014, 0.05, 0.03]} pos={[-0.09, 0.045, -0.085]} color="#2a2c3b" r={0.005} cast={false} />
      {/* the handset rests on the cradle */}
      <group ref={handset} position={[-0.09, 0.075, 0]} userData={{ dynamic: true }}>
        <RB size={[0.034, 0.03, 0.17]} color="#2f3244" r={0.012} />
        <RB size={[0.05, 0.036, 0.055]} pos={[0, -0.004, 0.09]} color="#2f3244" r={0.014} />
        <RB size={[0.05, 0.036, 0.055]} pos={[0, -0.004, -0.09]} color="#2f3244" r={0.014} />
      </group>
    </group>
  );
}

export function DirectorDesk({ layout, reports, roomId }: { layout: RoomLayout; reports: number; roomId: string }) {
  const { theme, director } = layout;
  const wood = shade(theme.desk, -0.14);
  const gold = '#ffd166';
  const plate = useMemo(() => textTexture('DIRECTOR', 256, 64, '#ffd166', '#5a3d12', { border: '#f2b73a' }), []);
  const sheets = Math.min(reports, 12);
  const rng = useMemo(() => new Rng(layout.seed + 7), [layout.seed]);
  const sheetTilt = useMemo(() => Array.from({ length: 12 }, () => [rng.range(-0.12, 0.12), rng.range(-0.02, 0.02), rng.range(-0.02, 0.02), rng.pick(['#ffffff', '#fff7e0', '#ffe9f0', '#e8f6ff'])] as const), [rng]);
  return (
    <group position={[director.desk.x, 0, director.desk.z]}>
      <RB size={[3.0, 0.08, 1.2]} pos={[0, DESK_TOP - 0.04 + 0.02, 0]} color={wood} r={0.04} rough={0.5} />
      <RB size={[3.06, 0.03, 1.26]} pos={[0, DESK_TOP - 0.1 + 0.02, 0]} color={gold} r={0.015} metal={0.35} rough={0.4} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <RB size={[0.72, 0.68, 1.1]} pos={[s * 1.12, 0.35, 0]} color={wood} r={0.04} />
          {[0.52, 0.3, 0.1].map((y, i) => (
            <group key={i}>
              <RB size={[0.62, 0.17, 0.02]} pos={[s * 1.12, y + 0.02, 0.56]} color={shade(wood, 0.08)} r={0.01} />
              <Ms geo={G.sphere(0.022, 8, 6)} mat={M(gold, { metal: 0.6, rough: 0.3 })} pos={[s * 1.12, y + 0.02, 0.58]} cast={false} />
            </group>
          ))}
        </group>
      ))}
      <RB size={[1.5, 0.5, 0.04]} pos={[0, 0.42, 0.5]} color={shade(wood, -0.04)} r={0.015} />
      {/* nameplate */}
      <group position={[0.15, DESK_TOP + 0.04, 0.38]} rotation={[-0.25, 0, 0]}>
        <RB size={[0.62, 0.11, 0.03]} color={gold} r={0.012} metal={0.4} rough={0.4} />
        <mesh position={[0, 0, 0.0165]}>
          <planeGeometry args={[0.58, 0.075]} />
          <meshBasicMaterial map={plate} transparent />
        </mesh>
      </group>
      {/* desk lamp */}
      <group position={[-1.2, DESK_TOP + 0.02, -0.25]}>
        <Ms geo={G.cyl(0.09, 0.1, 0.03, 20)} mat={M(gold, { metal: 0.5, rough: 0.35 })} pos={[0, 0.015, 0]} />
        <Ms geo={G.cyl(0.011, 0.011, 0.36, 8)} mat={M(gold, { metal: 0.5 })} pos={[0, 0.2, 0]} />
        <Ms geo={G.cone(0.11, 0.14, 20)} mat={glowMat('#2f6f5e', 0.45)} pos={[0.05, 0.4, 0]} rot={[0, 0, 0.25]} />
        <Ms geo={G.sphere(0.04, 10, 8)} mat={GLOW.bulb} pos={[0.06, 0.34, 0]} cast={false} />
      </group>
      {/* globe */}
      <group position={[1.15, DESK_TOP + 0.02, -0.2]}>
        <Ms geo={G.cyl(0.08, 0.1, 0.03, 16)} mat={M(gold, { metal: 0.5 })} pos={[0, 0.015, 0]} />
        <Ms geo={G.torus(0.16, 0.012, Math.PI, 6, 20)} mat={M(gold, { metal: 0.5 })} pos={[0, 0.2, 0]} rot={[0, 0, 0.4]} />
        <Ms geo={G.sphere(0.13, 18, 14)} mat={M(theme.accent3, { rough: 0.45 })} pos={[0, 0.2, 0]} rot={[0, 0.6, 0.4]} />
        <Ms geo={G.sphere(0.05, 8, 6)} mat={M('#6fcf8b')} pos={[0.07, 0.24, 0.07]} scale={[1, 0.7, 0.6]} cast={false} />
        <Ms geo={G.sphere(0.04, 8, 6)} mat={M('#6fcf8b')} pos={[-0.08, 0.16, 0.06]} scale={[0.8, 0.8, 0.5]} cast={false} />
      </group>
      {/* the usual director clutter */}
      <group position={[-0.75, DESK_TOP + 0.02, 0.0]}>
        <DeskItem kind="mug" theme={theme} seed={2} />
      </group>
      <group position={[-0.95, DESK_TOP + 0.04, 0.3]} rotation={[0, 0.3, 0]}>
        <DeskItem kind="photo" theme={theme} seed={5} />
      </group>
      <group position={[0.55, DESK_TOP + 0.04, -0.3]} rotation={[0, -0.4, 0]}>
        <DeskItem kind="papers" theme={theme} seed={1} />
      </group>
      <group position={[-0.45, DESK_TOP + 0.04, 0.32]}>
        <DeskItem kind="pencils" theme={theme} seed={4} />
      </group>
      <group position={[-0.55, DESK_TOP + 0.02, -0.33]} rotation={[0, 0.5, 0]}>
        <DirectorPhone roomId={roomId} />
      </group>
      {/* report tray + pile */}
      <group position={[0.95, DESK_TOP + 0.02, 0.1]}>
        <RB size={[0.44, 0.03, 0.54]} pos={[0, 0.015, 0]} color={gold} r={0.012} metal={0.3} />
        {Array.from({ length: sheets }).map((_, i) => (
          <RB key={i} size={[0.36, 0.014, 0.46]} pos={[sheetTilt[i][1], 0.038 + i * 0.016, sheetTilt[i][2]]} rot={[0, sheetTilt[i][0], 0]} color={sheetTilt[i][3]} r={0.004} cast={i === sheets - 1} />
        ))}
        {sheets > 0 ? <Ms geo={G.sphere(0.03, 8, 6)} mat={M(theme.accent2)} pos={[0.12, 0.045 + sheets * 0.016, -0.1]} cast={false} /> : null}
      </group>
    </group>
  );
}
