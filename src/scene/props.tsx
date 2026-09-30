import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Prop } from '../world/layout';
import type { RoomTheme } from '../world/palettes';
import { Rng } from '../util/rng';
import { frame } from '../sim/frame';
import { G, M, MB, shade } from './kit';
import { GLOW, glowMat } from './glow';
import { RB, Ms, DeskItem } from './furniture';
import { useBaked } from './bake';
import { PunchDummy, Dumbbells } from './gymProps';
import { FileCabinet, Copier, MeetingSet, WhiteboardStand, Boxes, ServerRack, Fridge, Vending, Trolley, Recycle, Credenza } from './officeProps';

// ------------------------------------------------------------------------ props
const GREENS = ['#4fb86f', '#6fcf8b', '#7bd88f', '#3fa864'];

function Plant({ p, tall }: { p: Prop; tall?: boolean }) {
  const rng = useMemo(() => new Rng(Math.floor(p.x * 100 + p.z * 37) + p.variant), [p.x, p.z, p.variant]);
  const leaves = useMemo(
    () => Array.from({ length: tall ? 9 : 6 }, (_, i) => ({
      a: (i / (tall ? 9 : 6)) * Math.PI * 2 + rng.range(-0.3, 0.3),
      r: rng.range(0.1, 0.24),
      y: (tall ? 1.05 : 0.5) + rng.range(-0.12, 0.35) * (tall ? 2 : 1),
      s: rng.range(0.16, 0.26) * (tall ? 1.25 : 1),
      c: rng.pick(GREENS),
    })),
    [rng, tall],
  );
  const flower = p.variant === 1 && !tall;
  const potH = tall ? 0.42 : 0.3;
  return (
    <group>
      <Ms geo={G.cyl(tall ? 0.3 : 0.27, tall ? 0.21 : 0.19, potH, 20)} mat={M(p.color, { rough: 0.55 })} pos={[0, potH / 2, 0]} />
      <Ms geo={G.torus(tall ? 0.3 : 0.27, 0.025, Math.PI * 2, 8, 24)} mat={M(p.color, { rough: 0.55 })} pos={[0, potH, 0]} rot={[Math.PI / 2, 0, 0]} />
      <Ms geo={G.cyl(0.24, 0.24, 0.02, 16)} mat={MB('#000000')} pos={[0, potH - 0.006, 0]} cast={false} />
      {tall ? <Ms geo={G.cyl(0.035, 0.05, 0.75, 8)} mat={M('#8a6a4a')} pos={[0, 0.75, 0]} /> : null}
      {leaves.map((l, i) => (
        <Ms key={i} geo={G.sphere(l.s, 12, 10)} mat={M(l.c, { rough: 0.6 })} pos={[Math.sin(l.a) * l.r, l.y, Math.cos(l.a) * l.r]} scale={[1, tall ? 1.35 : 1.05, 1]} />
      ))}
      {flower
        ? [0, 1, 2].map((i) => <Ms key={i} geo={G.sphere(0.05, 8, 6)} mat={M(['#ff8fb1', '#ffd166', '#ffffff'][i])} pos={[Math.sin(i * 2.4) * 0.16, 0.66 + (i % 2) * 0.05, Math.cos(i * 2.4) * 0.16]} />)
        : null}
    </group>
  );
}

function Cactus({ p }: { p: Prop }) {
  return (
    <group>
      <Ms geo={G.cyl(0.24, 0.18, 0.28, 18)} mat={M('#ffffff', { rough: 0.6 })} pos={[0, 0.14, 0]} />
      <Ms geo={G.cyl(0.25, 0.25, 0.04, 18)} mat={M(p.color)} pos={[0, 0.28, 0]} />
      <Ms geo={G.capsule(0.13, 0.5, 6, 14)} mat={M('#59c27d')} pos={[0, 0.66, 0]} />
      <Ms geo={G.capsule(0.07, 0.16, 6, 10)} mat={M('#59c27d')} pos={[0.2, 0.72, 0]} rot={[0, 0, -0.9]} />
      <Ms geo={G.capsule(0.07, 0.12, 6, 10)} mat={M('#59c27d')} pos={[-0.19, 0.58, 0]} rot={[0, 0, 0.9]} />
      <Ms geo={G.sphere(0.05, 8, 6)} mat={M('#ff8fb1')} pos={[0, 1.03, 0]} />
    </group>
  );
}

function Bookshelf({ p, theme }: { p: Prop; theme: RoomTheme }) {
  const wood = shade(theme.desk, -0.05);
  const books = useMemo(() => {
    const r = new Rng(Math.floor(p.x * 91 + p.z * 13) + 5);
    const cols = [theme.accent, theme.accent2, theme.accent3, '#ffffff', shade(theme.wall, -0.1), theme.chair];
    const out: { x: number; y: number; w: number; h: number; c: string; t: number }[] = [];
    for (const y of [0.32, 0.78, 1.24, 1.7]) {
      let x = -0.85;
      while (x < 0.8) {
        if (r.chance(0.12)) {
          x += r.range(0.12, 0.3);
          continue;
        }
        const w = r.range(0.06, 0.13);
        const h = r.range(0.24, 0.38);
        out.push({ x: x + w / 2, y, w, h, c: r.pick(cols), t: r.chance(0.12) ? r.range(-0.3, 0.3) : 0 });
        x += w + 0.005;
      }
    }
    return out;
  }, [p.x, p.z, theme]);
  return (
    <group>
      <RB size={[2.0, 2.0, 0.05]} pos={[0, 1.0, -0.27]} color={shade(wood, -0.06)} r={0.015} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[0.06, 2.0, 0.6]} pos={[s * 0.97, 1.0, 0]} color={wood} r={0.02} />
      ))}
      {[0.02, 0.5, 0.96, 1.42, 1.88].map((y) => (
        <RB key={y} size={[1.92, 0.05, 0.58]} pos={[0, y + 0.02, 0]} color={wood} r={0.015} />
      ))}
      {books.map((b, i) => (
        <RB key={i} size={[b.w, b.h, 0.3]} pos={[b.x, b.y - 0.05 + b.h / 2 - 0.14, -0.05]} rot={[0, 0, b.t]} color={b.c} r={0.01} rough={0.85} cast={false} />
      ))}
      <Ms geo={G.sphere(0.12, 12, 10)} mat={M(theme.accent3)} pos={[0.6, 2.1, -0.05]} scale={[1, 0.9, 1]} />
      <RB size={[0.3, 0.2, 0.3]} pos={[-0.4, 2.12, -0.05]} color={theme.accent2} r={0.04} />
    </group>
  );
}

function Cooler({ p }: { p: Prop }) {
  return (
    <group>
      <RB size={[0.52, 0.9, 0.5]} pos={[0, 0.45, 0]} color="#eef3fb" r={0.05} rough={0.4} />
      <RB size={[0.4, 0.08, 0.05]} pos={[0, 0.62, 0.26]} color="#9fc2e8" r={0.02} />
      <Ms geo={G.cyl(0.02, 0.02, 0.05, 8)} mat={M('#5aa0e6')} pos={[-0.08, 0.66, 0.29]} rot={[Math.PI / 2, 0, 0]} />
      <Ms geo={G.cyl(0.02, 0.02, 0.05, 8)} mat={M('#ff7a7a')} pos={[0.08, 0.66, 0.29]} rot={[Math.PI / 2, 0, 0]} />
      <Ms geo={G.cyl(0.21, 0.21, 0.42, 20)} mat={M('#9ed8ff', { opacity: 0.7, rough: 0.15 })} pos={[0, 1.13, 0]} />
      <Ms geo={G.cyl(0.13, 0.13, 0.05, 16)} mat={M('#9ed8ff', { opacity: 0.85, rough: 0.15 })} pos={[0, 1.37, 0]} />
      <Ms geo={G.cyl(0.19, 0.19, 0.2, 20)} mat={M('#6cc0ff', { opacity: 0.6, rough: 0.2 })} pos={[0, 1.06, 0]} cast={false} />
      <Ms geo={G.cyl(0.04, 0.03, 0.08, 10)} mat={M(p.color)} pos={[0.2, 0.94, 0.05]} />
    </group>
  );
}

function Coffee({ p, theme }: { p: Prop; theme: RoomTheme }) {
  return (
    <group>
      <RB size={[1.7, 0.86, 0.6]} pos={[0, 0.43, 0]} color={p.color} r={0.05} />
      <RB size={[1.76, 0.06, 0.66]} pos={[0, 0.89, 0]} color={theme.deskTop} r={0.03} />
      <RB size={[0.5, 0.42, 0.4]} pos={[-0.5, 1.13, -0.05]} color="#4b4f63" r={0.05} rough={0.4} />
      <RB size={[0.32, 0.06, 0.3]} pos={[-0.5, 1.37, -0.05]} color="#3a3d50" r={0.03} />
      <Ms geo={G.sphere(0.03, 8, 6)} mat={MB('#ff7a7a')} pos={[-0.4, 1.2, 0.16]} cast={false} />
      <Ms geo={G.cyl(0.06, 0.05, 0.1, 12)} mat={M('#ffffff')} pos={[-0.5, 0.98, 0.18]} />
      {[0, 1, 2].map((i) => (
        <Ms key={i} geo={G.cyl(0.045, 0.038, 0.09, 12)} mat={M([theme.accent, theme.accent2, theme.accent3][i], { rough: 0.4 })} pos={[0.15 + i * 0.16, 0.97, 0.05]} />
      ))}
      <Ms geo={G.cyl(0.09, 0.09, 0.2, 16)} mat={M('#ffffff', { opacity: 0.55 })} pos={[0.75, 1.02, -0.05]} />
      <Ms geo={G.cyl(0.085, 0.085, 0.12, 16)} mat={M('#8a5a3a', { rough: 0.7 })} pos={[0.75, 0.98, -0.05]} cast={false} />
      <Ms geo={G.cyl(0.09, 0.09, 0.03, 16)} mat={M(theme.accent)} pos={[0.75, 1.13, -0.05]} />
    </group>
  );
}

function Sofa({ p, theme, small }: { p: Prop; theme: RoomTheme; small?: boolean }) {
  const w = small ? 1.0 : 2.2;
  const c = p.color;
  return (
    <group>
      <RB size={[w, 0.24, 0.95]} pos={[0, 0.2, 0]} color={shade(c, -0.08)} r={0.06} rough={0.9} />
      <RB size={[w - 0.4, 0.14, 0.72]} pos={[0, 0.39, 0.06]} color={c} r={0.06} rough={0.9} />
      {!small ? <RB size={[0.02, 0.15, 0.7]} pos={[0, 0.39, 0.06]} color={shade(c, -0.1)} r={0.005} cast={false} /> : null}
      <RB size={[w, 0.6, 0.26]} pos={[0, 0.58, -0.36]} rot={[-0.1, 0, 0]} color={c} r={0.08} rough={0.9} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[0.22, 0.42, 0.95]} pos={[s * (w / 2 - 0.11), 0.42, 0]} color={shade(c, -0.05)} r={0.07} rough={0.9} />
      ))}
      <Ms geo={G.sphere(0.16, 12, 10)} mat={M(theme.accent3, { rough: 0.9 })} pos={[small ? -0.3 : -w / 2 + 0.24, 0.62, small ? -0.12 : 0.0]} scale={[1, 1, 0.5]} rot={[0, 0.4, 0.3]} />
      {!small ? <Ms geo={G.sphere(0.15, 12, 10)} mat={M(theme.accent2, { rough: 0.9 })} pos={[w / 2 - 0.24, 0.6, 0.02]} scale={[1, 1, 0.5]} rot={[0, -0.3, -0.2]} /> : null}
      {[-1, 1].map((s) => (
        <Ms key={s} geo={G.cyl(0.03, 0.03, 0.1, 8)} mat={M('#8a6a4a')} pos={[s * (w / 2 - 0.1), 0.05, 0.38]} />
      ))}
    </group>
  );
}

function Beanbag({ p }: { p: Prop }) {
  return (
    <group>
      <Ms geo={G.sphere(0.5, 24, 16)} mat={M(p.color, { rough: 0.9 })} pos={[0, 0.3, 0]} scale={[1, 0.62, 1]} />
      <Ms geo={G.sphere(0.32, 20, 12)} mat={M(shade(p.color, -0.08), { rough: 0.95 })} pos={[0, 0.5, 0.08]} scale={[1.1, 0.35, 1]} cast={false} />
      <Ms geo={G.sphere(0.2, 12, 10)} mat={M(p.color2, { rough: 0.9 })} pos={[0.05, 0.62, -0.28]} scale={[1, 0.5, 0.6]} rot={[-0.5, 0, 0]} />
    </group>
  );
}

function FloorLamp({ p }: { p: Prop }) {
  return (
    <group>
      <Ms geo={G.cyl(0.16, 0.18, 0.04, 18)} mat={M('#4b4f63')} pos={[0, 0.02, 0]} />
      <Ms geo={G.cyl(0.015, 0.015, 1.5, 8)} mat={M('#4b4f63', { metal: 0.3 })} pos={[0, 0.78, 0]} />
      <Ms geo={G.cyl(0.14, 0.24, 0.3, 20)} mat={glowMat(p.color)} pos={[0, 1.6, 0]} />
      <Ms geo={G.sphere(0.07, 10, 8)} mat={GLOW.bulb} pos={[0, 1.55, 0]} cast={false} />
      <Ms geo={G.cone(0.62, 1.4, 20)} mat={GLOW.cone} pos={[0, 0.82, 0]} cast={false} />
    </group>
  );
}

function Printer({ p }: { p: Prop }) {
  return (
    <group>
      <RB size={[1.0, 0.7, 0.6]} pos={[0, 0.35, 0]} color={p.color} r={0.05} />
      <RB size={[0.7, 0.28, 0.46]} pos={[0, 0.84, 0]} color="#f2f4fa" r={0.05} rough={0.45} />
      <RB size={[0.62, 0.03, 0.2]} pos={[0, 0.96, -0.1]} color="#dfe4f2" r={0.01} rot={[0.3, 0, 0]} />
      <RB size={[0.4, 0.015, 0.26]} pos={[0, 0.78, 0.3]} color="#ffffff" r={0.004} rot={[-0.2, 0, 0]} />
      <Ms geo={G.sphere(0.02, 8, 6)} mat={MB('#5ed3b0')} pos={[0.28, 0.9, 0.235]} cast={false} />
      <RB size={[0.3, 0.2, 0.3]} pos={[0.55, 0.8, 0.05]} color={p.color2} r={0.04} />
    </group>
  );
}

function Bin({ p }: { p: Prop }) {
  return (
    <group>
      <Ms geo={G.cyl(0.21, 0.16, 0.42, 16)} mat={M(p.color, { rough: 0.5 })} pos={[0, 0.21, 0]} />
      <Ms geo={G.torus(0.21, 0.02, Math.PI * 2, 6, 20)} mat={M(shade(p.color, -0.08))} pos={[0, 0.42, 0]} rot={[Math.PI / 2, 0, 0]} />
      {[0, 1, 2].map((i) => (
        <Ms key={i} geo={G.sphere(0.07, 8, 6)} mat={M('#ffffff', { rough: 0.9 })} pos={[Math.sin(i * 2.1) * 0.08, 0.44 + (i % 2) * 0.04, Math.cos(i * 2.1) * 0.08]} />
      ))}
    </group>
  );
}

function Fishtank({ p, theme, roomId }: { p: Prop; theme: RoomTheme; roomId?: string }) {
  const fish = useRef<(THREE.Group | null)[]>([]);
  useBaked(fish);
  useFrame((s) => {
    if (roomId !== undefined && !frame.visibleRooms.has(roomId)) return;
    const t = s.clock.elapsedTime;
    fish.current.forEach((f, i) => {
      if (!f) return;
      const ph = t * (0.5 + i * 0.17) + i * 2;
      f.position.set(Math.sin(ph) * 0.42, 1.0 + Math.sin(ph * 1.7 + i) * 0.12, Math.cos(ph * 0.5) * 0.08);
      f.rotation.y = Math.cos(ph) > 0 ? 0 : Math.PI;
    });
  });
  return (
    <group>
      <RB size={[1.3, 0.62, 0.66]} pos={[0, 0.31, 0]} color={p.color} r={0.05} />
      <RB size={[1.34, 0.04, 0.7]} pos={[0, 0.64, 0]} color={theme.deskTop} r={0.02} />
      <RB size={[1.14, 0.62, 0.5]} pos={[0, 0.98, 0]} color="#8fd8ff" r={0.03} opacity={0.35} rough={0.1} cast={false} receive={false} />
      <RB size={[1.1, 0.08, 0.46]} pos={[0, 0.69, 0]} color="#f3e2b8" r={0.02} cast={false} />
      {[-0.3, 0.25].map((x, i) => (
        <group key={i} position={[x, 0.75, (i - 0.5) * 0.15]}>
          <Ms geo={G.cone(0.035, 0.32, 6)} mat={M('#59c27d')} pos={[0, 0.16, 0]} cast={false} />
          <Ms geo={G.cone(0.03, 0.22, 6)} mat={M('#3fa864')} pos={[0.05, 0.11, 0.02]} cast={false} />
        </group>
      ))}
      {[0, 1, 2].map((i) => (
        <group key={i} userData={{ dynamic: true }} ref={(el) => { fish.current[i] = el; }}>
          <Ms geo={G.sphere(0.06, 10, 8)} mat={M([theme.accent, theme.accent3, theme.accent2][i], { rough: 0.35 })} scale={[1.4, 0.9, 0.6]} cast={false} />
          <Ms geo={G.cone(0.05, 0.09, 4)} mat={M([theme.accent, theme.accent3, theme.accent2][i])} pos={[-0.1, 0, 0]} rot={[0, 0, Math.PI / 2]} scale={[1, 1, 0.3]} cast={false} />
          <Ms geo={G.sphere(0.01, 6, 4)} mat={MB('#222')} pos={[0.06, 0.02, 0.03]} cast={false} />
        </group>
      ))}
      <RB size={[1.18, 0.05, 0.54]} pos={[0, 1.3, 0]} color="#f2f4fa" r={0.02} />
    </group>
  );
}

/** Wash basin on a small vanity with a tap and a mirror (the tap is at local z = -0.06, see `Station.tap`). */
function Sink({ p, theme }: { p: Prop; theme: RoomTheme }) {
  const chrome = M('#c9d3df', { metal: 0.7, rough: 0.25 });
  return (
    <group>
      <RB size={[0.92, 0.78, 0.5]} pos={[0, 0.39, 0.02]} color={shade(theme.desk, -0.04)} r={0.04} />
      <RB size={[0.36, 0.5, 0.02]} pos={[-0.22, 0.4, 0.28]} color={shade(theme.desk, 0.06)} r={0.015} cast={false} />
      <RB size={[0.36, 0.5, 0.02]} pos={[0.22, 0.4, 0.28]} color={shade(theme.desk, 0.06)} r={0.015} cast={false} />
      <Ms geo={G.sphere(0.02, 8, 6)} mat={chrome} pos={[-0.06, 0.4, 0.3]} cast={false} />
      <Ms geo={G.sphere(0.02, 8, 6)} mat={chrome} pos={[0.06, 0.4, 0.3]} cast={false} />
      <RB size={[1.0, 0.05, 0.54]} pos={[0, 0.805, 0.02]} color={theme.deskTop} r={0.02} />
      {/* basin */}
      <Ms geo={G.cyl(0.2, 0.17, 0.05, 24)} mat={M('#eef3f8', { rough: 0.2 })} pos={[0, 0.83, 0.06]} />
      <Ms geo={G.cyl(0.155, 0.155, 0.02, 24)} mat={M('#9db3c6', { rough: 0.15 })} pos={[0, 0.852, 0.06]} cast={false} />
      {/* tap */}
      <Ms geo={G.cyl(0.018, 0.018, 0.16, 8)} mat={chrome} pos={[0, 0.9, -0.14]} />
      <Ms geo={G.cyl(0.016, 0.016, 0.14, 8)} mat={chrome} pos={[0, 0.975, -0.07]} rot={[Math.PI / 2, 0, 0]} />
      {[-1, 1].map((s) => (
        <Ms key={s} geo={G.sphere(0.028, 8, 6)} mat={M(s < 0 ? '#5aa0e6' : '#ff7a7a')} pos={[s * 0.09, 0.86, -0.14]} cast={false} />
      ))}
      {/* soap + towel */}
      <Ms geo={G.cyl(0.035, 0.035, 0.12, 10)} mat={M(theme.accent, { rough: 0.4 })} pos={[-0.34, 0.89, -0.1]} />
      <Ms geo={G.cyl(0.012, 0.012, 0.04, 6)} mat={chrome} pos={[-0.34, 0.97, -0.1]} />
      <RB size={[0.2, 0.36, 0.03]} pos={[0.52, 1.15, -0.3]} color={p.color2} r={0.02} rough={0.9} />
      <Ms geo={G.cyl(0.012, 0.012, 0.26, 6)} mat={chrome} pos={[0.52, 1.36, -0.3]} rot={[0, 0, Math.PI / 2]} cast={false} />
      {/* mirror */}
      <RB size={[0.8, 0.9, 0.04]} pos={[0, 1.55, -0.31]} color={theme.trim} r={0.03} />
      <RB size={[0.7, 0.8, 0.02]} pos={[0, 1.55, -0.285]} color="#d6ebf8" r={0.02} rough={0.05} cast={false} />
    </group>
  );
}

/** Kitchenette hob with a pan of noodles on the left burner (the pan is at local x = -0.2, see `Station.pan`). */
function Stove({ p, theme }: { p: Prop; theme: RoomTheme }) {
  const steel = M('#c9d3df', { metal: 0.7, rough: 0.3 });
  const dark = M('#2f3244', { rough: 0.5 });
  return (
    <group>
      <RB size={[0.96, 0.8, 0.54]} pos={[0, 0.4, 0]} color={shade(theme.desk, -0.04)} r={0.04} />
      {/* oven door */}
      <RB size={[0.7, 0.4, 0.02]} pos={[0, 0.36, 0.28]} color="#3a3d50" r={0.02} cast={false} />
      <RB size={[0.5, 0.2, 0.01]} pos={[0, 0.36, 0.295]} color="#7fa6c8" r={0.01} rough={0.1} cast={false} />
      <Ms geo={G.cyl(0.012, 0.012, 0.6, 6)} mat={steel} pos={[0, 0.62, 0.3]} rot={[0, 0, Math.PI / 2]} cast={false} />
      <RB size={[1.0, 0.05, 0.58]} pos={[0, 0.825, 0]} color={theme.deskTop} r={0.02} />
      {/* hob */}
      <RB size={[0.84, 0.02, 0.46]} pos={[0, 0.86, 0]} color="#3a3d50" r={0.01} cast={false} />
      {[-0.2, 0.22].map((x) => (
        <Ms key={x} geo={G.cyl(0.12, 0.12, 0.012, 20)} mat={dark} pos={[x, 0.876, 0.02]} cast={false} />
      ))}
      {/* knobs */}
      {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
        <Ms key={x} geo={G.cyl(0.028, 0.028, 0.03, 10)} mat={M(i % 2 ? theme.accent : '#e8edf5', { rough: 0.4 })} pos={[x, 0.72, 0.29]} rot={[Math.PI / 2, 0, 0]} cast={false} />
      ))}
      {/* the pan */}
      <group position={[-0.2, 0.882, 0.02]}>
        <Ms geo={G.cyl(0.13, 0.1, 0.06, 20)} mat={M('#454a62', { metal: 0.5, rough: 0.35 })} pos={[0, 0.03, 0]} />
        <Ms geo={G.cyl(0.115, 0.115, 0.012, 20)} mat={M('#f3d27a', { rough: 0.8 })} pos={[0, 0.056, 0]} cast={false} />
        <Ms geo={G.sphere(0.03, 6, 5)} mat={M('#79c56b', { rough: 0.8 })} pos={[0.04, 0.066, 0.02]} scale={[1, 0.5, 1]} cast={false} />
        <Ms geo={G.sphere(0.028, 6, 5)} mat={M('#ff8a65', { rough: 0.8 })} pos={[-0.05, 0.066, -0.03]} scale={[1, 0.5, 1]} cast={false} />
        <Ms geo={G.cyl(0.014, 0.014, 0.22, 8)} mat={dark} pos={[0.2, 0.06, 0]} rot={[0, 0, Math.PI / 2]} />
      </group>
      {/* a pot on the other burner, a jar of spice and a towel */}
      <group position={[0.22, 0.882, 0.02]}>
        <Ms geo={G.cyl(0.1, 0.1, 0.12, 18)} mat={M(theme.accent2, { rough: 0.4, metal: 0.2 })} pos={[0, 0.06, 0]} />
        <Ms geo={G.cyl(0.104, 0.104, 0.014, 18)} mat={M(shade(theme.accent2, -0.12), { rough: 0.4 })} pos={[0, 0.127, 0]} />
        <Ms geo={G.sphere(0.02, 6, 5)} mat={dark} pos={[0, 0.15, 0]} />
      </group>
      <Ms geo={G.cyl(0.028, 0.028, 0.09, 10)} mat={M('#ffffff', { rough: 0.5 })} pos={[0.38, 0.9, -0.16]} />
      <Ms geo={G.cyl(0.03, 0.03, 0.025, 10)} mat={M('#ff7a7a', { rough: 0.5 })} pos={[0.38, 0.96, -0.16]} />
      <RB size={[0.16, 0.3, 0.02]} pos={[-0.52, 0.66, 0.1]} color={p.color2} r={0.01} rough={0.9} cast={false} />
      {/* range hood on the wall */}
      <RB size={[0.9, 0.08, 0.42]} pos={[0, 1.85, -0.05]} color="#dfe6ef" r={0.03} rough={0.3} />
      <RB size={[0.34, 0.5, 0.26]} pos={[0, 2.15, -0.12]} color="#c9d3df" r={0.03} rough={0.35} />
    </group>
  );
}

function CoatRack({ p }: { p: Prop }) {
  return (
    <group>
      <Ms geo={G.cyl(0.2, 0.22, 0.04, 16)} mat={M('#8a6a4a')} pos={[0, 0.02, 0]} />
      <Ms geo={G.cyl(0.025, 0.025, 1.7, 8)} mat={M('#8a6a4a')} pos={[0, 0.87, 0]} />
      {[0, 1, 2].map((i) => (
        <Ms key={i} geo={G.cyl(0.012, 0.012, 0.22, 6)} mat={M('#8a6a4a')} pos={[Math.sin(i * 2.1) * 0.1, 1.68, Math.cos(i * 2.1) * 0.1]} rot={[Math.cos(i * 2.1) * 0.9, 0, -Math.sin(i * 2.1) * 0.9]} cast={false} />
      ))}
      <Ms geo={G.capsule(0.13, 0.36, 6, 12)} mat={M(p.color, { rough: 0.8 })} pos={[0.05, 1.32, 0.16]} scale={[1, 1, 0.55]} />
      <Ms geo={G.cap(0.15, 14, 8)} mat={M(p.color2)} pos={[-0.12, 1.72, -0.08]} rot={[0.2, 0, 0.3]} />
    </group>
  );
}

function LoungeSet({ p, theme }: { p: Prop; theme: RoomTheme }) {
  return (
    <group>
      <RB size={[2.8, 0.02, 2.3]} pos={[0, 0.012, 0.1]} color={p.color2} r={0.01} rough={1} receive cast={false} />
      <RB size={[2.6, 0.024, 2.1]} pos={[0, 0.016, 0.1]} color={shade(theme.rug, 0.02)} r={0.01} rough={1} receive cast={false} />
      <group position={[0, 0, -0.75]}>
        <Sofa p={p} theme={theme} />
      </group>
      <group position={[0, 0, 0.55]}>
        <RB size={[1.1, 0.05, 0.62]} pos={[0, 0.4, 0]} color={theme.deskTop} r={0.02} />
        {[[-0.48, -0.25], [0.48, -0.25], [-0.48, 0.25], [0.48, 0.25]].map(([x, z], i) => (
          <Ms key={i} geo={G.cyl(0.03, 0.025, 0.38, 8)} mat={M(shade(theme.desk, -0.1))} pos={[x, 0.19, z]} />
        ))}
        <group position={[-0.25, 0.425, 0]} rotation={[0, 0.3, 0]}><DeskItem kind="books" theme={theme} seed={1} /></group>
        <group position={[0.3, 0.425, 0.05]}><DeskItem kind="mug" theme={theme} seed={p.variant} /></group>
      </group>
      <group position={[1.35, 0, -1.0]}><FloorLamp p={p} /></group>
    </group>
  );
}

export function PropView({ p, theme, roomId }: { p: Prop; theme: RoomTheme; roomId?: string }) {
  let body: React.ReactNode;
  switch (p.kind) {
    case 'bookshelf': body = <Bookshelf p={p} theme={theme} />; break;
    case 'plant': body = <Plant p={p} />; break;
    case 'tallPlant': body = <Plant p={p} tall />; break;
    case 'cactus': body = <Cactus p={p} />; break;
    case 'cooler': body = <Cooler p={p} />; break;
    case 'coffee': body = <Coffee p={p} theme={theme} />; break;
    case 'sofa': body = <Sofa p={p} theme={theme} />; break;
    case 'armchair': body = <Sofa p={p} theme={theme} small />; break;
    case 'beanbag': body = <Beanbag p={p} />; break;
    case 'floorLamp': body = <FloorLamp p={p} />; break;
    case 'printer': body = <Printer p={p} />; break;
    case 'bin': body = <Bin p={p} />; break;
    case 'fishtank': body = <Fishtank p={p} theme={theme} roomId={roomId} />; break;
    case 'coatRack': body = <CoatRack p={p} />; break;
    case 'fileCabinet': body = <FileCabinet p={p} theme={theme} />; break;
    case 'copier': body = <Copier p={p} theme={theme} />; break;
    case 'meetingSet': body = <MeetingSet p={p} theme={theme} />; break;
    case 'whiteboardStand': body = <WhiteboardStand p={p} theme={theme} />; break;
    case 'boxes': body = <Boxes p={p} theme={theme} />; break;
    case 'serverRack': body = <ServerRack p={p} theme={theme} roomId={roomId} />; break;
    case 'fridge': body = <Fridge p={p} theme={theme} />; break;
    case 'vending': body = <Vending p={p} theme={theme} />; break;
    case 'trolley': body = <Trolley p={p} theme={theme} />; break;
    case 'recycle': body = <Recycle p={p} theme={theme} />; break;
    case 'credenza': body = <Credenza p={p} theme={theme} />; break;
    case 'sink': body = <Sink p={p} theme={theme} />; break;
    case 'stove': body = <Stove p={p} theme={theme} />; break;
    case 'loungeSet': body = <LoungeSet p={p} theme={theme} />; break;
    case 'punchDummy': body = <PunchDummy p={p} theme={theme} roomId={roomId} />; break;
    case 'dumbbells': body = <Dumbbells p={p} theme={theme} roomId={roomId} />; break;
    default: body = null;
  }
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, p.rot, 0]}>
      {body}
    </group>
  );
}
