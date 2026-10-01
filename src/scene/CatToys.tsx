import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { RoomLayout } from '../world/layout';
import { frame } from '../sim/frame';
import { stepToy, toyState } from '../sim/toys';
import { G, M } from './kit';
import { Ms, RB } from './furniture';
import { StaticBake } from './StaticBake';
import { blobGeometry, FX, initFx } from './fx';

type V3 = [number, number, number];

/** A cardboard box lying on its side flap-open: the cats curl up in it. */
function CardboardBox() {
  const card = '#c8975a';
  const dark = '#a87a42';
  return (
    <group>
      <RB size={[0.8, 0.03, 0.7]} pos={[0, 0.015, 0]} color={dark} r={0.01} cast={false} />
      <RB size={[0.8, 0.3, 0.035]} pos={[0, 0.15, -0.3325]} color={card} r={0.01} cast={false} />
      <RB size={[0.8, 0.3, 0.035]} pos={[0, 0.15, 0.3325]} color={card} r={0.01} cast={false} />
      <RB size={[0.035, 0.3, 0.7]} pos={[-0.3825, 0.15, 0]} color={card} r={0.01} cast={false} />
      <RB size={[0.035, 0.3, 0.7]} pos={[0.3825, 0.15, 0]} color={card} r={0.01} cast={false} />
      {/* flaps folded outwards */}
      <RB size={[0.8, 0.02, 0.2]} pos={[0, 0.27, -0.43]} rot={[0.5, 0, 0]} color={dark} r={0.008} cast={false} />
      <RB size={[0.8, 0.02, 0.2]} pos={[0, 0.27, 0.43]} rot={[-0.5, 0, 0]} color={dark} r={0.008} cast={false} />
      {/* packing tape */}
      <RB size={[0.14, 0.002, 0.04]} pos={[0.2, 0.311, 0.3325]} color="#e9dcc0" r={0.001} cast={false} />
    </group>
  );
}

function ScratchingPost({ accent }: { accent: string }) {
  return (
    <group>
      <RB size={[0.55, 0.05, 0.55]} pos={[0, 0.025, 0]} color="#d9c7a3" r={0.015} cast={false} />
      <Ms geo={G.cyl(0.075, 0.075, 0.78, 16)} mat={M('#c9a66b', { rough: 0.95 })} pos={[0, 0.44, 0]} cast={false} />
      {[0.2, 0.34, 0.48, 0.62].map((y) => (
        <Ms key={y} geo={G.torus(0.077, 0.006, Math.PI * 2, 5, 16)} mat={M('#a98550', { rough: 0.95 })} pos={[0, y, 0]} rot={[Math.PI / 2, 0, 0]} cast={false} />
      ))}
      <RB size={[0.34, 0.05, 0.34]} pos={[0, 0.865, 0]} color={accent} r={0.02} cast={false} />
      {/* a ball on a string dangling from the platform */}
      <Ms geo={G.cyl(0.004, 0.004, 0.2, 4)} mat={M('#f4efe6')} pos={[0.12, 0.74, 0.12]} cast={false} />
      <Ms geo={G.sphere(0.04, 12, 8)} mat={M('#ffd166')} pos={[0.12, 0.62, 0.12]} cast={false} />
    </group>
  );
}

function Yarn({ color }: { color: string }) {
  return (
    <group>
      <Ms geo={G.sphere(0.1, 20, 14)} mat={M(color, { rough: 0.95 })} cast={false} />
      <Ms geo={G.torus(0.1, 0.012, Math.PI * 2, 5, 20)} mat={M('#ffffff', { rough: 0.95, opacity: 0.35 })} rot={[0.4, 0.2, 0]} cast={false} />
      <Ms geo={G.torus(0.1, 0.012, Math.PI * 2, 5, 20)} mat={M('#ffffff', { rough: 0.95, opacity: 0.35 })} rot={[1.3, 0.9, 0]} cast={false} />
      <Ms geo={G.torus(0.1, 0.012, Math.PI * 2, 5, 20)} mat={M('#000000', { rough: 0.95, opacity: 0.18 })} rot={[2.3, 0.3, 0.8]} cast={false} />
    </group>
  );
}

function Mouse() {
  return (
    <group>
      <Ms geo={G.sphere(0.065, 14, 10)} mat={M('#9aa0aa', { rough: 0.9 })} pos={[0, 0.055, 0]} scale={[0.8, 0.75, 1.5]} cast={false} />
      <Ms geo={G.sphere(0.022, 8, 6)} mat={M('#ff9db4')} pos={[0, 0.06, 0.1]} cast={false} />
      {[-1, 1].map((sx) => (
        <Ms key={sx} geo={G.sphere(0.03, 8, 6)} mat={M('#f4b6c2', { rough: 0.9 })} pos={[sx * 0.04, 0.1, 0.045]} scale={[1, 1, 0.35]} cast={false} />
      ))}
      <Ms geo={G.cyl(0.006, 0.004, 0.17, 5)} mat={M('#f4b6c2')} pos={[0, 0.03, -0.17]} rot={[Math.PI / 2 - 0.25, 0, 0]} cast={false} />
    </group>
  );
}

const YARN_COLORS = ['#ef476f', '#4cc9f0', '#ffb703', '#8ac926'];

/** The cats' toys of a room: a box, a scratching post (both fixed) and a ball of yarn and a toy mouse the cats bat around. */
export function CatToys({ roomId, layout }: { roomId: string; layout: RoomLayout }) {
  initFx();
  const refs = useRef<(THREE.Group | null)[]>([]);
  const blobs = useRef<(THREE.Mesh | null)[]>([]);
  const geo = useMemo(() => blobGeometry(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  const toys = layout.toys;

  useFrame((_, rawDt) => {
    if (!frame.visibleRooms.has(roomId)) return;
    const dt = Math.min(rawDt, 0.05);
    toys.forEach((t, i) => {
      if (t.kind !== 'yarn' && t.kind !== 'mouse') return;
      const g = refs.current[i];
      if (!g) return;
      const st = toyState(roomId, layout, i);
      stepToy(st, t.kind === 'mouse', dt);
      if (t.kind === 'yarn') {
        g.position.set(st.x, 0.1, st.z);
        // roll about the axis across the direction of travel
        const sp = Math.hypot(st.vx, st.vz);
        if (sp > 0.01) {
          axis.set(st.vz / sp, 0, -st.vx / sp);
          g.rotateOnWorldAxis(axis, (sp * dt) / 0.1);
        }
      } else {
        g.position.set(st.x, st.hop, st.z);
        g.rotation.y = st.rot;
        g.rotation.x = -Math.min(0.5, st.hop * 1.2);
      }
      const b = blobs.current[i];
      if (b) {
        b.position.set(st.x, 0.032, st.z);
        const k = t.kind === 'yarn' ? 0.32 : 0.34 * Math.max(0.5, 1 - st.hop * 2);
        b.scale.set(k, 1, k * (t.kind === 'yarn' ? 1 : 1.5));
        b.rotation.y = st.rot;
      }
    });
  });

  return (
    <group>
      {toys.map((t, i) => {
        const accent = layout.theme.accent;
        if (t.kind === 'box') {
          return (
            <group key={i} position={[t.x, 0, t.z]}>
              <StaticBake>
                <CardboardBox />
              </StaticBake>
            </group>
          );
        }
        if (t.kind === 'post') {
          return (
            <group key={i} position={[t.x, 0, t.z]} rotation={[0, t.rot, 0]}>
              <StaticBake>
                <ScratchingPost accent={accent} />
              </StaticBake>
            </group>
          );
        }
        const pos: V3 = [t.x, t.kind === 'yarn' ? 0.1 : 0, t.z];
        return (
          <group key={i}>
            <mesh ref={(el) => { blobs.current[i] = el; }} geometry={geo} material={FX.blob} position={[t.x, 0.032, t.z]} renderOrder={1} raycast={() => null} />
            <group ref={(el) => { refs.current[i] = el; }} position={pos} rotation={[0, t.rot, 0]}>
              <StaticBake>{t.kind === 'yarn' ? <Yarn color={YARN_COLORS[(layout.seed >>> 0) % YARN_COLORS.length]} /> : <Mouse />}</StaticBake>
            </group>
          </group>
        );
      })}
    </group>
  );
}
