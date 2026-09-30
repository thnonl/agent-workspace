import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Prop } from '../world/layout';
import type { RoomTheme } from '../world/palettes';
import { Rng } from '../util/rng';
import { frame } from '../sim/frame';
import { G, M, MB, shade } from './kit';
import { DeskItem, Ms, RB } from './furniture';
import { useBaked } from './bake';

const LED_ON = [new THREE.Color('#5ee08a'), new THREE.Color('#5aa8ff'), new THREE.Color('#ffb347')];
const LED_OFF = new THREE.Color('#2a3140');

interface PP {
  p: Prop;
  theme: RoomTheme;
  roomId?: string;
}

export function FileCabinet({ p, theme }: PP) {
  const body = ['#9aa6bd', '#b7c3d8', shade(theme.accent2, -0.05), '#c9b79c'][p.variant % 4];
  return (
    <group>
      <RB size={[0.6, 1.05, 0.66]} pos={[0, 0.525, 0]} color={body} r={0.03} rough={0.45} metal={0.15} />
      {[0.2, 0.55, 0.9].map((y) => (
        <group key={y}>
          <RB size={[0.52, 0.3, 0.03]} pos={[0, y, 0.34]} color={shade(body, 0.07)} r={0.012} rough={0.4} />
          <RB size={[0.2, 0.03, 0.04]} pos={[0, y + 0.06, 0.375]} color="#dfe4ef" r={0.01} metal={0.5} rough={0.3} />
          <RB size={[0.16, 0.06, 0.012]} pos={[0, y - 0.05, 0.36]} color="#ffffff" r={0.004} cast={false} />
        </group>
      ))}
      <group position={[0, 1.05, 0]}>
        {p.variant % 4 === 0 ? (
          <>
            <Ms geo={G.cyl(0.09, 0.07, 0.12, 14)} mat={M(theme.accent)} pos={[0, 0.06, 0]} />
            {[0, 1, 2, 3].map((i) => (
              <Ms key={i} geo={G.sphere(0.09, 10, 8)} mat={M(i % 2 ? '#6fcf8b' : '#4fb86f')} pos={[Math.sin(i * 1.7) * 0.06, 0.2 + (i % 2) * 0.05, Math.cos(i * 1.7) * 0.06]} />
            ))}
          </>
        ) : p.variant % 4 === 1 ? (
          <group position={[0, 0.02, 0]}>
            <DeskItem kind="papers" theme={theme} seed={1} />
          </group>
        ) : p.variant % 4 === 2 ? (
          <group>
            <group position={[-0.12, 0, 0]}><DeskItem kind="mug" theme={theme} seed={2} /></group>
            <group position={[0.1, 0, 0.05]}><DeskItem kind="books" theme={theme} seed={0} /></group>
          </group>
        ) : (
          <group position={[0, 0, 0]}><DeskItem kind="lamp" theme={theme} seed={p.variant} /></group>
        )}
      </group>
    </group>
  );
}

export function Copier({ theme }: PP) {
  return (
    <group>
      <RB size={[1.2, 0.78, 0.78]} pos={[0, 0.39, 0]} color="#e6eaf2" r={0.04} rough={0.45} />
      <RB size={[1.22, 0.16, 0.8]} pos={[0, 0.08, 0]} color="#8a93a8" r={0.03} />
      {[0.3, 0.5].map((y, i) => (
        <group key={i}>
          <RB size={[1.0, 0.16, 0.02]} pos={[0, y, 0.4]} color={i ? theme.accent2 : theme.accent3} r={0.01} />
          <RB size={[0.22, 0.03, 0.03]} pos={[0, y + 0.02, 0.42]} color="#c9cfdd" r={0.01} />
        </group>
      ))}
      <RB size={[1.24, 0.1, 0.82]} pos={[0, 0.83, 0]} color="#cfd6e4" r={0.03} />
      <RB size={[0.5, 0.05, 0.22]} pos={[-0.3, 0.9, 0.28]} rot={[-0.3, 0, 0]} color="#2f3244" r={0.015} />
      <Ms geo={G.plane(0.24, 0.1)} mat={MB('#9fe8c1')} pos={[-0.36, 0.925, 0.285]} rot={[-1.27, 0, 0]} cast={false} />
      {[0, 1, 2].map((i) => (
        <Ms key={i} geo={G.sphere(0.02, 8, 6)} mat={M([theme.accent, '#5ed3b0', '#ffd166'][i])} pos={[-0.1 + i * 0.055, 0.91, 0.3]} cast={false} />
      ))}
      <RB size={[0.44, 0.02, 0.3]} pos={[0.3, 0.9, 0.05]} rot={[0.05, 0.1, 0]} color="#ffffff" r={0.004} cast={false} />
      {[0, 1, 2].map((i) => (
        <RB key={i} size={[0.3, 0.08, 0.2]} pos={[0.42, 0.92 + i * 0.085, -0.15]} rot={[0, i * 0.12, 0]} color={['#4a90e2', '#ffffff', '#4a90e2'][i]} r={0.01} />
      ))}
    </group>
  );
}

export function MeetingSet({ p, theme }: PP) {
  const chairs = useMemo(() => [0, 1, 2, 3].map((i) => ({ a: (i / 4) * Math.PI * 2 + 0.25, c: [theme.chair, theme.accent, theme.accent2, theme.accent3][i] })), [theme]);
  return (
    <group>
      <Ms geo={G.cyl(0.82, 0.82, 0.05, 36)} mat={M(theme.deskTop, { rough: 0.5 })} pos={[0, 0.72, 0]} receive />
      <Ms geo={G.cyl(0.84, 0.84, 0.02, 36)} mat={M(p.color, { rough: 0.5 })} pos={[0, 0.69, 0]} />
      <Ms geo={G.cyl(0.09, 0.11, 0.68, 12)} mat={M('#4b4f63', { metal: 0.3 })} pos={[0, 0.34, 0]} />
      <Ms geo={G.cyl(0.4, 0.42, 0.04, 20)} mat={M('#4b4f63', { metal: 0.3 })} pos={[0, 0.02, 0]} />
      {chairs.map((c, i) => (
        <group key={i} position={[Math.sin(c.a) * 1.18, 0, Math.cos(c.a) * 1.18]} rotation={[0, c.a + Math.PI + (i % 2 ? 0.2 : -0.15), 0]}>
          <RB size={[0.5, 0.08, 0.46]} pos={[0, 0.4, 0]} color={c.c} r={0.03} />
          <RB size={[0.48, 0.46, 0.07]} pos={[0, 0.68, -0.22]} rot={[-0.08, 0, 0]} color={c.c} r={0.04} />
          <Ms geo={G.cyl(0.03, 0.03, 0.36, 8)} mat={M('#4b4f63')} pos={[0, 0.18, 0]} />
          <Ms geo={G.cyl(0.2, 0.2, 0.03, 12)} mat={M('#4b4f63')} pos={[0, 0.03, 0]} />
        </group>
      ))}
      <group position={[-0.3, 0.745, 0.1]} rotation={[0, 0.4, 0]}><DeskItem kind="papers" theme={theme} seed={1} /></group>
      <group position={[0.35, 0.745, -0.25]}><DeskItem kind="mug" theme={theme} seed={0} /></group>
      <group position={[0.1, 0.745, 0.45]} rotation={[0, -0.5, 0]}><DeskItem kind="notepad" theme={theme} seed={2} /></group>
      <group position={[0.42, 0.745, 0.3]}><DeskItem kind="plant" theme={theme} seed={1} /></group>
    </group>
  );
}

export function WhiteboardStand({ p, theme }: PP) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Ms geo={G.cyl(0.025, 0.025, 1.1, 8)} mat={M('#b8c0d0', { metal: 0.4 })} pos={[s * 0.72, 0.55, 0.05]} rot={[0.12, 0, 0]} />
          <Ms geo={G.cyl(0.025, 0.025, 0.55, 8)} mat={M('#b8c0d0', { metal: 0.4 })} pos={[s * 0.72, 0.28, -0.22]} rot={[-0.5, 0, 0]} />
          {[0.22, -0.3].map((z) => <Ms key={z} geo={G.sphere(0.045, 8, 6)} mat={M('#3a3d50')} pos={[s * 0.72, 0.045, z]} />)}
        </group>
      ))}
      <RB size={[1.74, 1.12, 0.06]} pos={[0, 1.32, 0.05]} color="#c9cfdd" r={0.02} metal={0.2} />
      <RB size={[1.64, 1.02, 0.03]} pos={[0, 1.32, 0.09]} color="#ffffff" r={0.01} rough={0.25} />
      {/* diagram: three boxes and arrows */}
      {[-0.5, 0, 0.5].map((x, i) => (
        <group key={i}>
          <Ms geo={G.plane(0.34, 0.24)} mat={MB([p.color, theme.accent3, theme.accent2][i], 0.9)} pos={[x, 1.55 - (i === 1 ? 0.2 : 0), 0.108]} cast={false} />
        </group>
      ))}
      <Ms geo={G.plane(0.2, 0.02)} mat={MB('#3a3d50')} pos={[-0.25, 1.5, 0.11]} rot={[0, 0, -0.5]} cast={false} />
      <Ms geo={G.plane(0.2, 0.02)} mat={MB('#3a3d50')} pos={[0.25, 1.5, 0.11]} rot={[0, 0, 0.5]} cast={false} />
      {[0, 1, 2, 3].map((i) => (
        <Ms key={i} geo={G.plane(0.9 - i * 0.15, 0.028)} mat={MB(['#5a6cff', '#ff5d73', '#3a3d50', '#5ed3b0'][i])} pos={[-0.3 + i * 0.03, 1.1 - i * 0.11, 0.108]} cast={false} />
      ))}
      <Ms geo={G.circle(0.12, 20)} mat={MB(theme.accent)} pos={[0.55, 1.0, 0.108]} cast={false} />
      <RB size={[1.4, 0.04, 0.1]} pos={[0, 0.72, 0.1]} color="#c9cfdd" r={0.012} />
      {[0, 1, 2].map((i) => (
        <Ms key={i} geo={G.cyl(0.013, 0.013, 0.11, 6)} mat={M(['#ff5d73', '#3a6cff', '#3a3d50'][i])} pos={[-0.2 + i * 0.13, 0.755, 0.1]} rot={[0, 0, Math.PI / 2]} cast={false} />
      ))}
    </group>
  );
}

export function Boxes({ p }: PP) {
  const tan = ['#d9b382', '#cfa36d', '#e3c194'];
  const flip = p.variant % 2 ? -1 : 1;
  return (
    <group rotation={[0, flip < 0 ? Math.PI : 0, 0]}>
      <RB size={[0.8, 0.46, 0.6]} pos={[-0.1, 0.23, 0.05]} color={tan[0]} r={0.015} rough={0.9} />
      <RB size={[0.13, 0.004, 0.6]} pos={[-0.1, 0.462, 0.05]} color="#f3e3c4" r={0.002} cast={false} />
      <RB size={[0.22, 0.13, 0.006]} pos={[0.05, 0.28, 0.355]} color="#ffffff" r={0.003} cast={false} />
      <RB size={[0.58, 0.4, 0.5]} pos={[-0.16, 0.66, 0.02]} rot={[0, 0.25, 0]} color={tan[1]} r={0.015} rough={0.9} />
      <RB size={[0.1, 0.004, 0.5]} pos={[-0.16, 0.862, 0.02]} rot={[0, 0.25, 0]} color="#f3e3c4" r={0.002} cast={false} />
      <RB size={[0.5, 0.36, 0.45]} pos={[0.5, 0.18, -0.05]} rot={[0, -0.2, 0]} color={tan[2]} r={0.015} rough={0.9} />
      <RB size={[0.42, 0.02, 0.3]} pos={[0.5, 0.38, -0.05]} rot={[0.1, -0.2, 0.15]} color="#ffffff" r={0.004} cast={false} />
      <RB size={[0.2, 0.09, 0.006]} pos={[0.45, 0.2, 0.185]} rot={[0, -0.2, 0]} color="#ff8fa3" r={0.003} cast={false} />
    </group>
  );
}

export function ServerRack({ p, roomId }: PP) {
  const rackRef = useRef<THREE.Group>(null);
  useBaked(rackRef);
  const leds = useMemo(() => Array.from({ length: 14 }, (_, i) => new THREE.MeshBasicMaterial({ color: LED_ON[i % 3] })), []);
  const lit = useRef<boolean[]>([]);
  useFrame((s) => {
    if (roomId !== undefined && !frame.animRooms.has(roomId)) return;
    const t = s.clock.elapsedTime;
    leds.forEach((m, i) => {
      const on = Math.sin(t * (1.5 + (i % 5) * 0.7) + i * 1.9) > -0.2;
      // only touch the colour when the LED actually flips
      if (lit.current[i] === on) return;
      lit.current[i] = on;
      m.color.copy(on ? LED_ON[i % 3] : LED_OFF);
    });
  });
  return (
    <group ref={rackRef} userData={{ dynamic: true }}>
      <RB size={[0.7, 1.7, 0.78]} pos={[0, 0.85, 0]} color="#2a2d3d" r={0.03} rough={0.5} />
      {Array.from({ length: 8 }).map((_, i) => (
        <group key={i}>
          <RB size={[0.6, 0.14, 0.02]} pos={[0, 0.25 + i * 0.19, 0.4]} color={i % 3 === 0 ? '#414863' : '#363b52'} r={0.008} />
          <mesh geometry={G.circle(0.012, 8)} material={leds[(i * 2) % leds.length]} position={[0.22, 0.25 + i * 0.19 + 0.02, 0.412]} />
          <mesh geometry={G.circle(0.012, 8)} material={leds[(i * 2 + 1) % leds.length]} position={[0.26, 0.25 + i * 0.19 + 0.02, 0.412]} />
          <Ms geo={G.box(0.3, 0.01, 0.005)} mat={M('#1c1f2b')} pos={[-0.08, 0.25 + i * 0.19 - 0.025, 0.412]} cast={false} />
        </group>
      ))}
      <Ms geo={G.torus(0.14, 0.02, Math.PI * 1.5, 6, 16)} mat={M(p.color)} pos={[0.25, 1.75, 0.1]} rot={[0.3, 0.6, 0]} />
      <Ms geo={G.torus(0.12, 0.018, Math.PI * 1.5, 6, 16)} mat={M('#5ed3b0')} pos={[-0.2, 1.74, 0.0]} rot={[0.2, -0.5, 0.4]} />
    </group>
  );
}

export function Fridge({ p, theme }: PP) {
  const c = p.variant % 2 ? '#d9f5e8' : '#f2f4fa';
  return (
    <group>
      <RB size={[0.7, 1.45, 0.7]} pos={[0, 0.725, 0]} color={c} r={0.05} rough={0.35} />
      <RB size={[0.68, 0.02, 0.02]} pos={[0, 1.06, 0.355]} color={shade(c, -0.12)} r={0.005} cast={false} />
      <RB size={[0.04, 0.3, 0.05]} pos={[0.26, 1.25, 0.38]} color="#b8c0d0" r={0.015} metal={0.5} />
      <RB size={[0.04, 0.5, 0.05]} pos={[0.26, 0.7, 0.38]} color="#b8c0d0" r={0.015} metal={0.5} />
      {[[-0.15, 1.3, theme.accent, 0.2], [0.02, 1.2, theme.accent3, -0.1], [-0.1, 0.9, '#ffffff', 0.1], [0.12, 0.75, theme.accent2, -0.2]].map(([x, y, col, r], i) => (
        <RB key={i} size={[0.12, 0.12, 0.006]} pos={[x as number, y as number, 0.358]} rot={[0, 0, r as number]} color={col as string} r={0.003} cast={false} />
      ))}
      <Ms geo={G.sphere(0.018, 6, 4)} mat={M('#ff5d73')} pos={[-0.15, 1.36, 0.365]} cast={false} />
      {/* microwave on top */}
      <RB size={[0.52, 0.3, 0.42]} pos={[0, 1.6, 0]} color="#dfe4ef" r={0.03} rough={0.4} />
      <RB size={[0.32, 0.2, 0.02]} pos={[-0.06, 1.6, 0.215]} color="#2f3244" r={0.01} cast={false} />
      <Ms geo={G.plane(0.08, 0.04)} mat={MB('#9fe8c1')} pos={[0.19, 1.64, 0.222]} cast={false} />
    </group>
  );
}

export function Vending({ p, theme }: PP) {
  const items = useMemo(() => {
    const r = new Rng(p.variant * 97 + 3);
    return Array.from({ length: 5 }, (_, row) => Array.from({ length: 4 }, (_, col) => ({ row, col, c: r.pick([theme.accent, theme.accent2, theme.accent3, '#ffffff', '#ff8fa3', '#5ed3b0']), h: r.range(0.1, 0.16) })));
  }, [p.variant, theme]);
  const body = p.variant % 2 ? theme.accent : theme.accent2;
  return (
    <group>
      <RB size={[0.95, 1.8, 0.8]} pos={[0, 0.9, 0]} color={body} r={0.04} rough={0.4} />
      <RB size={[0.66, 1.3, 0.03]} pos={[-0.08, 1.0, 0.4]} color="#20243a" r={0.01} />
      {items.flat().map((it, i) => (
        <RB key={i} size={[0.1, it.h, 0.08]} pos={[-0.24 + it.col * 0.15, 1.52 - it.row * 0.24 + it.h / 2 - 0.09, 0.405]} color={it.c} r={0.015} cast={false} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => <RB key={i} size={[0.62, 0.012, 0.1]} pos={[-0.08, 1.4 - i * 0.24, 0.405]} color="#8a93a8" r={0.004} cast={false} />)}
      <RB size={[0.85, 0.2, 0.04]} pos={[0, 1.7, 0.4]} color="#fff6d0" r={0.02} emissive="#ffe28a" cast={false} />
      <RB size={[0.62, 0.16, 0.02]} pos={[-0.08, 0.2, 0.41]} color="#20243a" r={0.01} />
      {[0, 1, 2, 3].map((i) => <RB key={i} size={[0.05, 0.05, 0.02]} pos={[0.32, 1.3 - i * 0.09, 0.41]} color="#ffffff" r={0.006} cast={false} />)}
      <RB size={[0.1, 0.02, 0.02]} pos={[0.32, 0.85, 0.41]} color="#20243a" r={0.005} cast={false} />
    </group>
  );
}

export function Trolley({ p, theme }: PP) {
  return (
    <group>
      {[0.32, 0.78].map((y) => <RB key={y} size={[0.78, 0.04, 0.5]} pos={[0, y, 0]} color="#b8c0d0" r={0.012} metal={0.3} />)}
      {[[-0.36, -0.22], [0.36, -0.22], [-0.36, 0.22], [0.36, 0.22]].map(([x, z], i) => (
        <group key={i}>
          <Ms geo={G.cyl(0.015, 0.015, 0.8, 6)} mat={M('#8a93a8', { metal: 0.4 })} pos={[x, 0.42, z]} />
          <Ms geo={G.sphere(0.04, 8, 6)} mat={M('#2f3244')} pos={[x, 0.04, z]} />
        </group>
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <RB key={i} size={[0.06, 0.26, 0.2]} pos={[-0.25 + i * 0.065, 0.47, -0.05]} rot={[0, 0, (i - 2) * 0.03]} color={[p.color, theme.accent3, theme.accent2, '#ffffff', theme.accent][i]} r={0.01} cast={false} />
      ))}
      <group position={[0.15, 0.8, 0.02]}><DeskItem kind="papers" theme={theme} seed={p.variant} /></group>
      <RB size={[0.26, 0.2, 0.22]} pos={[-0.22, 0.9, 0.0]} rot={[0, 0.3, 0]} color="#d9b382" r={0.01} rough={0.9} />
    </group>
  );
}

export function Recycle({ p }: PP) {
  return (
    <group>
      {['#4a90e2', '#5cb85c', '#f0ad4e'].map((c, i) => (
        <group key={i} position={[-0.44 + i * 0.44, 0, 0]}>
          <RB size={[0.38, 0.68, 0.34]} pos={[0, 0.34, 0]} color={c} r={0.04} />
          <RB size={[0.4, 0.06, 0.36]} pos={[0, 0.7, 0]} color={shade(c, -0.1)} r={0.02} />
          <RB size={[0.22, 0.02, 0.02]} pos={[0, 0.7, 0.19]} color="#20243a" r={0.005} cast={false} />
          <Ms geo={G.circle(0.075, 3)} mat={MB('#ffffff')} pos={[0, 0.4, 0.176]} cast={false} />
        </group>
      ))}
      <Ms geo={G.sphere(0.05, 6, 5)} mat={M('#ffffff', { rough: 1 })} pos={[0.5, 0.05, 0.3]} cast={false} scale={[1, 0.9, 1]} />
      <Ms geo={G.cyl(0.04, 0.04, 0.02, 8)} mat={M(p.color)} pos={[-0.35, 0.02, 0.32]} cast={false} />
    </group>
  );
}

export function Credenza({ p, theme }: PP) {
  const wood = shade(theme.desk, -0.08);
  const top = 0.82;
  return (
    <group>
      <RB size={[1.85, 0.78, 0.5]} pos={[0, 0.45, 0]} color={wood} r={0.03} />
      {[-1, 0, 1].map((i) => (
        <group key={i}>
          <RB size={[0.58, 0.6, 0.02]} pos={[i * 0.6, 0.47, 0.26]} color={shade(wood, 0.08)} r={0.012} />
          <Ms geo={G.sphere(0.022, 8, 6)} mat={M('#fff4d8', { metal: 0.4 })} pos={[i * 0.6 + 0.2, 0.47, 0.285]} cast={false} />
        </group>
      ))}
      {[-0.8, 0.8].map((x) => <RB key={x} size={[0.06, 0.1, 0.4]} pos={[x, 0.05, 0]} color={shade(wood, -0.1)} r={0.015} />)}
      <RB size={[1.9, 0.05, 0.54]} pos={[0, top + 0.02, 0]} color={theme.deskTop} r={0.02} />
      <group position={[-0.7, top + 0.045, 0]}><DeskItem kind="lamp" theme={theme} seed={p.variant} /></group>
      <group position={[-0.25, top + 0.045, 0.05]} rotation={[0, 0.2, 0]}><DeskItem kind="photo" theme={theme} seed={p.variant + 1} /></group>
      <group position={[0.3, top + 0.045, 0]}><DeskItem kind="books" theme={theme} seed={p.variant + 2} /></group>
      <group position={[0.75, top + 0.045, 0]}><DeskItem kind="plant" theme={theme} seed={p.variant + 3} /></group>
    </group>
  );
}
