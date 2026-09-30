import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Prop } from '../world/layout';
import type { RoomTheme } from '../world/palettes';
import { frame } from '../sim/frame';
import { dummyKicks, dumbbellsTaken } from '../sim/gym';
import { G, M, shade } from './kit';
import { RB, Ms } from './furniture';
import { useBaked } from './bake';

// spring of the punching dummy: stiffness / damping (per second)
const SPRING_K = 130;
const SPRING_C = 5.5;
const PI2 = Math.PI / 2;

/** Free-standing boxing dummy on a weighted base. Only the swinging body moves (one group, one baked mesh per material). */
export function PunchDummy({ p, theme, roomId }: { p: Prop; theme: RoomTheme; roomId?: string }) {
  const body = useRef<THREE.Group>(null);
  const st = useRef({ a: 0, v: 0, rest: true });
  useBaked(body);
  useFrame((_, dt) => {
    const g = body.current;
    if (!g) return;
    const S = st.current;
    if (roomId !== undefined && !frame.animRooms.has(roomId)) {
      // off screen: rest upright
      if (!S.rest) {
        S.a = S.v = 0;
        S.rest = true;
        g.rotation.x = 0;
      }
      return;
    }
    const kick = roomId !== undefined ? dummyKicks.get(roomId) : undefined;
    if (kick) {
      S.v -= kick;
      S.rest = false;
      dummyKicks.set(roomId!, 0);
    }
    if (S.rest) return;
    const h = Math.min(dt, 1 / 30);
    S.v += (-SPRING_K * S.a - SPRING_C * S.v) * h;
    S.a += S.v * h;
    if (Math.abs(S.a) < 0.002 && Math.abs(S.v) < 0.02) {
      S.a = S.v = 0;
      S.rest = true;
    }
    g.rotation.x = S.a;
  });
  const pad = p.color;
  const dark = shade(pad, -0.22);
  return (
    <group>
      {/* weighted base (static) */}
      <Ms geo={G.cyl(0.29, 0.32, 0.12, 24)} mat={M('#3a3d50', { rough: 0.6 })} pos={[0, 0.06, 0]} />
      <Ms geo={G.torus(0.3, 0.022, Math.PI * 2, 6, 24)} mat={M(theme.accent2, { rough: 0.5 })} pos={[0, 0.115, 0]} rot={[PI2, 0, 0]} cast={false} />
      {/* the body swings about the top of the base */}
      <group ref={body} position={[0, 0.13, 0]} userData={{ dynamic: true }}>
        <Ms geo={G.cyl(0.05, 0.06, 0.4, 10)} mat={M('#8b92a6', { metal: 0.4, rough: 0.4 })} pos={[0, 0.2, 0]} />
        <Ms geo={G.capsule(0.175, 0.5, 6, 16)} mat={M(pad, { rough: 0.65 })} pos={[0, 0.66, 0]} />
        <Ms geo={G.torus(0.178, 0.03, Math.PI * 2, 8, 24)} mat={M(dark, { rough: 0.6 })} pos={[0, 0.42, 0]} rot={[PI2, 0, 0]} cast={false} />
        <Ms geo={G.torus(0.178, 0.022, Math.PI * 2, 8, 24)} mat={M('#ffffff', { rough: 0.6 })} pos={[0, 0.92, 0]} rot={[PI2, 0, 0]} cast={false} />
        <Ms geo={G.sphere(0.15, 16, 12)} mat={M(shade(pad, 0.12), { rough: 0.65 })} pos={[0, 1.15, 0]} />
        {/* arm stubs */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.2, 0.84, 0]} rotation={[0, 0, -s * 1.15]}>
            <Ms geo={G.capsule(0.05, 0.16, 6, 10)} mat={M(dark, { rough: 0.65 })} pos={[0, 0.1, 0]} />
          </group>
        ))}
        {/* target patch on the belly */}
        <Ms geo={G.cyl(0.07, 0.07, 0.012, 14)} mat={M('#ffffff', { rough: 0.6 })} pos={[0, 0.68, 0.172]} rot={[PI2, 0, 0]} cast={false} />
      </group>
    </group>
  );
}

function Dumbbell({ z, color }: { z: number; color: string }) {
  const steel = M('#9aa3b8', { metal: 0.6, rough: 0.3 });
  const iron = M(color, { rough: 0.45, metal: 0.2 });
  return (
    <group position={[0, 0.08, z]}>
      <Ms geo={G.cyl(0.014, 0.014, 0.2, 8)} mat={steel} rot={[0, 0, PI2]} />
      {[-0.085, 0.085].map((x) => (
        <Ms key={x} geo={G.cyl(0.05, 0.05, 0.05, 6)} mat={iron} pos={[x, 0, 0]} rot={[0, 0, PI2]} />
      ))}
    </group>
  );
}

/** A rubber mat with a pair of small dumbbells (the pair disappears while somebody exercises with it), a towel and a bottle. */
export function Dumbbells({ p, theme, roomId }: { p: Prop; theme: RoomTheme; roomId?: string }) {
  const pair = useRef<THREE.Group>(null);
  const shown = useRef(true);
  useBaked(pair);
  useFrame(() => {
    const g = pair.current;
    if (!g || roomId === undefined || !frame.animRooms.has(roomId)) return;
    const show = (dumbbellsTaken.get(roomId) ?? 0) < performance.now();
    if (show !== shown.current) {
      shown.current = show;
      g.visible = show;
    }
  });
  return (
    <group>
      <RB size={[0.9, 0.03, 0.5]} pos={[0, 0.015, 0]} color="#3a3d50" r={0.012} rough={0.9} />
      <RB size={[0.9, 0.032, 0.04]} pos={[0, 0.016, -0.22]} color={theme.accent} r={0.008} rough={0.9} cast={false} />
      <RB size={[0.22, 0.03, 0.16]} pos={[-0.3, 0.045, -0.12]} color={p.color2} r={0.012} rough={0.95} rot={[0, 0.25, 0]} />
      <Ms geo={G.cyl(0.03, 0.03, 0.16, 10)} mat={M('#8fd8ff', { opacity: 0.8, rough: 0.2 })} pos={[0.36, 0.11, -0.14]} />
      <Ms geo={G.cyl(0.032, 0.032, 0.03, 10)} mat={M(theme.accent3, { rough: 0.5 })} pos={[0.36, 0.205, -0.14]} cast={false} />
      <group ref={pair} userData={{ dynamic: true }}>
        <Dumbbell z={-0.02} color={theme.accent2} />
        <Dumbbell z={0.14} color={theme.accent2} />
      </group>
    </group>
  );
}
