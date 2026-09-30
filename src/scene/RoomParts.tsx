import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { DoorSpec, FloorDecal, RoomLayout, WallDecor, WindowSpec } from '../world/layout';
import type { RoomTheme } from '../world/palettes';
import { runtimeFor, simsInRoom } from '../sim/registry';
import { buildParcelBox } from './heldItems';
import { frame } from '../sim/frame';
import { GLOW, glowMat } from './glow';
import { G, M, MB, shade } from './kit';
import { Ms, RB } from './furniture';
import { useBaked } from './bake';
import { calendarTexture, textTexture } from './textures';
import { Rng } from '../util/rng';

export const WALL_T = 0.28;

interface Opening {
  center: number;
  width: number;
  bottom: number;
  top: number;
}

function Slab({ x, y, z, w, h, d, color }: { x: number; y: number; z: number; w: number; h: number; d: number; color: string }) {
  if (w <= 0.001 || h <= 0.001) return null;
  return (
    <mesh geometry={G.box(w, h, d)} material={M(color, { rough: 0.85 })} position={[x, y, z]} castShadow receiveShadow />
  );
}

/** A wall in its own frame: x along the wall, y up, +z into the room (inner face at z=0). */
export function Wall({ length, height, openings, theme, doorCenter, doorWidth }: {
  length: number; height: number; openings: Opening[]; theme: RoomTheme; doorCenter: number | null; doorWidth: number;
}) {
  const t = WALL_T;
  const pieces = useMemo(() => {
    const list: { x: number; y: number; w: number; h: number }[] = [];
    const sorted = [...openings].sort((a, b) => a.center - b.center);
    let cursor = -length / 2;
    for (const o of sorted) {
      const x0 = o.center - o.width / 2;
      const x1 = o.center + o.width / 2;
      if (x0 > cursor) list.push({ x: (cursor + x0) / 2, y: 0, w: x0 - cursor, h: height });
      if (o.bottom > 0) list.push({ x: o.center, y: 0, w: o.width, h: o.bottom });
      if (o.top < height) list.push({ x: o.center, y: o.top, w: o.width, h: height - o.top });
      cursor = x1;
    }
    if (cursor < length / 2) list.push({ x: (cursor + length / 2) / 2, y: 0, w: length / 2 - cursor, h: height });
    return list;
  }, [openings, length, height]);

  // trim runs (skip the doorway)
  const runs = useMemo(() => {
    if (doorCenter === null) return [{ x: 0, w: length }];
    const a = doorCenter - doorWidth / 2 - 0.08;
    const b = doorCenter + doorWidth / 2 + 0.08;
    return [
      { x: (-length / 2 + a) / 2, w: a + length / 2 },
      { x: (b + length / 2) / 2, w: length / 2 - b },
    ];
  }, [doorCenter, doorWidth, length]);

  return (
    <group>
      {pieces.map((p, i) => (
        <Slab key={i} x={p.x} y={p.y + p.h / 2} z={-t / 2} w={p.w} h={p.h} d={t} color={theme.wall} />
      ))}
      {/* wainscot + rail + baseboard */}
      {runs.map((r, i) => (
        <group key={i}>
          <Slab x={r.x} y={0.5} z={0.012} w={r.w} h={1.0} d={0.024} color={theme.stripe} />
          <Slab x={r.x} y={1.03} z={0.03} w={r.w} h={0.06} d={0.06} color={theme.trim} />
          <Slab x={r.x} y={0.09} z={0.03} w={r.w} h={0.18} d={0.06} color={theme.trim} />
        </group>
      ))}
      {/* crown + cap */}
      <Slab x={0} y={height - 0.07} z={0.03} w={length} h={0.14} d={0.06} color={theme.trim} />
      <Slab x={0} y={height + 0.04} z={-t / 2} w={length + 0.02} h={0.1} d={t + 0.06} color={theme.trim} />
    </group>
  );
}

/** angle the open sash is swung out of the room (about 70°) */
const SASH_SWING = 1.2;

/**
 * A two-sash casement window. One sash stays closed, the other one always stands open, swung outwards
 * (the office cats hop in through the open half).
 */
export function WindowView({ spec, theme, localX, wallHeight }: { spec: WindowSpec; theme: RoomTheme; localX: number; wallHeight: number }) {
  const { w, h, sill } = spec;
  const t = WALL_T;
  const frame = theme.trim;
  const cy = sill + h / 2;
  const open = spec.openSide;
  const closed = -open;
  const hw = w / 2;
  const mullion = 0.07;
  const sw = hw - mullion / 2; // width of one sash
  const bar = 0.05;
  const glassW = sw - bar * 2;
  const glassH = h - bar * 2;

  /** one sash centred on x = cx: border, glass on both faces and a muntin */
  const sash = (cx: number) => (
    <>
      <mesh position={[cx, cy, 0]} geometry={G.plane(glassW, glassH)} material={GLOW.glass} />
      <mesh position={[cx, cy, 0]} rotation={[0, Math.PI, 0]} geometry={G.plane(glassW, glassH)} material={GLOW.glass} />
      <RB size={[sw, bar, 0.07]} pos={[cx, sill + bar / 2, 0]} color={frame} r={0.012} />
      <RB size={[sw, bar, 0.07]} pos={[cx, sill + h - bar / 2, 0]} color={frame} r={0.012} />
      <RB size={[bar, h, 0.07]} pos={[cx - sw / 2 + bar / 2, cy, 0]} color={frame} r={0.012} />
      <RB size={[bar, h, 0.07]} pos={[cx + sw / 2 - bar / 2, cy, 0]} color={frame} r={0.012} />
      {spec.panes === 4 ? <RB size={[sw, 0.035, 0.05]} pos={[cx, cy, 0]} color={frame} r={0.008} /> : null}
    </>
  );

  return (
    <group position={[localX, 0, 0]}>
      {/* the closed sash sits in the wall opening; a little knob on the middle bar */}
      <group position={[0, 0, -t / 2]}>
        {sash(closed * (mullion / 2 + sw / 2))}
        <Ms geo={G.sphere(0.03, 8, 6)} mat={M(theme.accent3, { metal: 0.4, rough: 0.4 })} pos={[closed * (mullion / 2 + 0.12), cy - 0.1, 0.06]} cast={false} />
      </group>
      <RB size={[mullion, h, t * 0.6]} pos={[0, cy, -t / 2]} color={frame} r={0.01} />
      {/* the open sash: hinged on the outer jamb, swung outwards */}
      <group position={[open * hw, 0, -t / 2 - 0.03]} rotation={[0, -open * SASH_SWING, 0]}>
        {sash(-open * (sw / 2))}
        <Ms geo={G.sphere(0.03, 8, 6)} mat={M(theme.accent3, { metal: 0.4, rough: 0.4 })} pos={[-open * (sw - 0.1), cy - 0.1, 0.06]} cast={false} />
      </group>
      <RB size={[w + 0.5, 0.06, 0.3]} pos={[0, sill - 0.13, -t - 0.16]} color={theme.stripe} r={0.02} />
      {/* frame */}
      <RB size={[w + 0.24, 0.1, t + 0.06]} pos={[0, sill + h + 0.05, -t / 2]} color={frame} r={0.02} />
      <RB size={[w + 0.24, 0.1, t + 0.06]} pos={[0, sill - 0.05, -t / 2]} color={frame} r={0.02} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[0.1, h + 0.2, t + 0.06]} pos={[s * (w / 2 + 0.07), cy, -t / 2]} color={frame} r={0.02} />
      ))}
      {/* sill */}
      <RB size={[w + 0.5, 0.06, 0.3]} pos={[0, sill - 0.13, 0.1]} color={theme.stripe} r={0.02} />
      <Ms geo={G.cyl(0.07, 0.055, 0.1, 12)} mat={M(theme.accent, { rough: 0.6 })} pos={[closed * (w / 2 - 0.2), sill - 0.05, 0.12]} />
      <Ms geo={G.sphere(0.075, 10, 8)} mat={M('#59c27d')} pos={[closed * (w / 2 - 0.2), sill + 0.05, 0.12]} />
      {/* curtains */}
      {spec.curtain ? (
        <>
          <Ms geo={G.cyl(0.02, 0.02, w + 0.9, 8)} mat={M(theme.trim, { metal: 0.2 })} pos={[0, sill + h + 0.32, 0.32]} rot={[0, 0, Math.PI / 2]} />
          {[-1, 1].map((s) => (
            <group key={s} position={[s * (w / 2 + 0.05), 0, 0.32]}>
              {[0, 1, 2].map((i) => (
                <RB key={i} size={[0.17, Math.min(wallHeight - 0.6, h + 0.75), 0.07]} pos={[-s * i * 0.16 + s * 0.02, sill + h / 2 + 0.05 - i * 0.02, i % 2 ? 0.02 : 0]} color={shade(theme.curtain, i % 2 ? -0.04 : 0.02)} r={0.03} rough={0.9} />
              ))}
              <Ms geo={G.sphere(0.06, 8, 6)} mat={M(theme.accent3)} pos={[-s * 0.45, sill + h / 2 - 0.1, 0.05]} cast={false} />
            </group>
          ))}
        </>
      ) : null}
    </group>
  );
}

export function DoorView({ door, theme, roomId, localX }: { door: DoorSpec; theme: RoomTheme; roomId: string; localX: number }) {
  const leaf = useRef<THREE.Group>(null);
  useBaked(leaf);
  const t = WALL_T;
  const w = door.width;
  const h = door.height;
  // the delivery on the porch: built once, shown while `rt.parcel` says it waits there
  const parcel = useMemo(() => buildParcelBox(), []);
  const parcelSlot = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!leaf.current || !frame.animRooms.has(roomId)) return;
    if (parcelSlot.current) parcelSlot.current.visible = runtimeFor(roomId).parcel === 'waiting';
    let near = false;
    for (const s of simsInRoom(roomId)) {
      if (!s.onStage) continue;
      if (Math.hypot(s.x - door.threshold.x, s.z - door.threshold.z) < 1.9) near = true;
    }
    const target = near ? 1.75 : 0;
    leaf.current.rotation.y += (target - leaf.current.rotation.y) * (1 - Math.exp(-6 * dt));
  });
  return (
    <group position={[localX, 0, 0]}>
      {/* frame */}
      <RB size={[w + 0.3, 0.12, t + 0.08]} pos={[0, h + 0.06, -t / 2]} color={theme.trim} r={0.02} />
      {[-1, 1].map((s) => (
        <RB key={s} size={[0.11, h + 0.1, t + 0.08]} pos={[s * (w / 2 + 0.075), (h + 0.1) / 2, -t / 2]} color={theme.trim} r={0.02} />
      ))}
      {/* door leaf hinged on -x, opens outwards (towards -z) */}
      <group ref={leaf} userData={{ dynamic: true }} position={[-w / 2, 0, -t / 2]}>
        <RB size={[w - 0.04, h - 0.04, 0.07]} pos={[w / 2, h / 2, 0]} color={theme.accent} r={0.03} rough={0.5} />
        <RB size={[w - 0.4, h - 0.7, 0.02]} pos={[w / 2, h / 2 + 0.1, 0.045]} color={shade(theme.accent, 0.08)} r={0.02} />
        <Ms geo={G.cyl(0.24, 0.24, 0.03, 24)} mat={M('#fff6d8', { rough: 0.3 })} pos={[w / 2, h - 0.6, 0.05]} rot={[Math.PI / 2, 0, 0]} />
        <Ms geo={G.cyl(0.17, 0.17, 0.032, 24)} mat={M('#cdefff', { opacity: 0.7, rough: 0.1 })} pos={[w / 2, h - 0.6, 0.055]} rot={[Math.PI / 2, 0, 0]} cast={false} />
        <Ms geo={G.sphere(0.055, 10, 8)} mat={M('#ffd166', { metal: 0.6, rough: 0.3 })} pos={[w - 0.2, h * 0.47, 0.09]} />
        <Ms geo={G.sphere(0.055, 10, 8)} mat={M('#ffd166', { metal: 0.6, rough: 0.3 })} pos={[w - 0.2, h * 0.47, -0.09]} />
      </group>
      {/* mat inside, porch outside */}
      <RB size={[w + 0.2, 0.03, 0.8]} pos={[0, 0.015, 0.6]} color={theme.accent3} r={0.012} rough={0.95} receive />
      <RB size={[w - 0.1, 0.034, 0.62]} pos={[0, 0.017, 0.6]} color={theme.trim} r={0.012} rough={0.95} receive />
      <group position={[0, 0, -t]}>
        <group ref={parcelSlot} userData={{ dynamic: true }} visible={false} position={[0, 0.135, -1.22]} rotation={[0, 0.25, 0]}>
          <primitive object={parcel} />
        </group>
        <RB size={[w + 2.4, 0.5, 3.4]} pos={[0, -0.25, -1.7]} color={theme.base} r={0.12} receive />
        <RB size={[w + 2.0, 0.03, 3.0]} pos={[0, 0.0, -1.7]} color={shade(theme.floor, 0.03)} r={0.01} receive rough={0.95} />
        <RB size={[w + 0.2, 0.03, 0.8]} pos={[0, 0.03, -0.55]} color={theme.accent2} r={0.012} rough={0.95} receive />
        {/* porch lamp */}
        <group position={[w / 2 + 0.75, 0, -0.4]}>
          <Ms geo={G.cyl(0.03, 0.04, 1.7, 8)} mat={M('#4b4f63')} pos={[0, 0.85, 0]} />
          <Ms geo={G.sphere(0.13, 12, 10)} mat={M('#fff3b0', { emissive: '#ffe28a', emissiveIntensity: 0.9 })} pos={[0, 1.78, 0]} cast={false} />
          <Ms geo={G.cone(0.17, 0.12, 12)} mat={M('#4b4f63')} pos={[0, 1.95, 0]} />
        </group>
        <group position={[-w / 2 - 0.7, 0, -0.7]}>
          <Ms geo={G.cyl(0.2, 0.15, 0.3, 14)} mat={M(theme.accent, { rough: 0.6 })} pos={[0, 0.15, 0]} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Ms key={i} geo={G.sphere(0.14, 10, 8)} mat={M(i % 2 ? '#6fcf8b' : '#4fb86f')} pos={[Math.sin(i * 1.3) * 0.12, 0.45 + (i % 3) * 0.1, Math.cos(i * 1.3) * 0.12]} />
          ))}
        </group>
      </group>
    </group>
  );
}

// -------------------------------------------------------------------- sunbeams
export function Sunbeam({ w, localX, dir }: { w: number; localX: number; dir: 1 | -1 }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    const z0 = 0.05;
    const z1 = 3.4;
    const shift = 1.5 * dir;
    s.moveTo(-w / 2, -z0);
    s.lineTo(w / 2, -z0);
    s.lineTo(w / 2 + shift, -z1);
    s.lineTo(-w / 2 + shift, -z1);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, [w, dir]);
  return (
    <mesh geometry={geo} material={GLOW.sunbeam} position={[localX, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} />
  );
}

// ---------------------------------------------------------------- wall decor
let flagGeo: THREE.ShapeGeometry | null = null;
function pennantGeometry() {
  if (!flagGeo) {
    const s = new THREE.Shape();
    s.moveTo(-0.4, 0.5);
    s.lineTo(0.4, 0.5);
    s.lineTo(0, -0.5);
    s.closePath();
    flagGeo = new THREE.ShapeGeometry(s);
  }
  return flagGeo;
}

function Clock({ w, roomId }: { w: number; roomId?: string }) {
  const hour = useRef<THREE.Mesh>(null);
  const min = useRef<THREE.Mesh>(null);
  const last = useRef(0);
  useFrame(() => {
    if (roomId !== undefined && !frame.animRooms.has(roomId)) return;
    const now = Date.now();
    // the hands only need a refresh once a second (also runs on the first frame after the room reappears)
    if (now - last.current < 1000 && now >= last.current) return;
    last.current = now;
    const d = new Date(now);
    const m = d.getMinutes() + d.getSeconds() / 60;
    if (min.current) min.current.rotation.z = -(m / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(((d.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
  });
  return (
    <group>
      <Ms geo={G.cyl(w / 2, w / 2, 0.06, 32)} mat={M('#ffffff', { rough: 0.4 })} rot={[Math.PI / 2, 0, 0]} />
      <Ms geo={G.torus(w / 2, 0.035, Math.PI * 2, 8, 32)} mat={M('#ff8fa3', { rough: 0.4 })} pos={[0, 0, 0.03]} />
      {[0, 1, 2, 3].map((i) => (
        <Ms key={i} geo={G.box(0.03, 0.08, 0.02)} mat={M('#4b4f63')} pos={[Math.sin((i * Math.PI) / 2) * (w / 2 - 0.09), Math.cos((i * Math.PI) / 2) * (w / 2 - 0.09), 0.04]} rot={[0, 0, (i * Math.PI) / 2]} cast={false} />
      ))}
      <mesh ref={hour} userData={{ dynamic: true }} position={[0, 0, 0.05]} geometry={G.box(0.035, w * 0.28, 0.015)} material={M('#4b4f63')}>
        <mesh position={[0, w * 0.14, 0]} geometry={G.box(0.035, w * 0.28, 0.015)} material={M('#4b4f63')} />
      </mesh>
      <mesh ref={min} userData={{ dynamic: true }} position={[0, 0, 0.065]} geometry={G.box(0.025, 0.01, 0.012)} material={M('#ff5d73')}>
        <mesh position={[0, w * 0.19, 0]} geometry={G.box(0.025, w * 0.38, 0.012)} material={M('#ff5d73')} />
      </mesh>
      <Ms geo={G.sphere(0.04, 8, 6)} mat={M('#4b4f63')} pos={[0, 0, 0.075]} cast={false} />
    </group>
  );
}

export function WallDecorView({ d, localX, theme, roomId }: { d: WallDecor; localX: number; theme: RoomTheme; roomId?: string }) {
  const inner = (() => {
    switch (d.kind) {
      case 'poster':
        return (
          <group>
            <RB size={[d.w, d.h, 0.04]} color={theme.trim} r={0.02} />
            <RB size={[d.w - 0.12, d.h - 0.12, 0.02]} pos={[0, 0, 0.02]} color={shade(d.color, 0.28)} r={0.01} />
            {d.variant % 2 === 0 ? (
              <>
                <Ms geo={G.circle(0.24, 24)} mat={MB(d.color)} pos={[0, 0.16, 0.035]} cast={false} />
                <Ms geo={G.plane(0.6, 0.18)} mat={MB(d.color2)} pos={[0, -0.22, 0.035]} cast={false} />
              </>
            ) : (
              <>
                <Ms geo={G.plane(0.25, 0.7)} mat={MB(d.color)} pos={[-0.17, 0, 0.035]} cast={false} />
                <Ms geo={G.circle(0.16, 20)} mat={MB(d.color2)} pos={[0.16, 0.2, 0.035]} cast={false} />
                <Ms geo={G.plane(0.24, 0.24)} mat={MB('#ffffff')} pos={[0.16, -0.2, 0.035]} cast={false} />
              </>
            )}
          </group>
        );
      case 'frame':
        return (
          <group>
            <RB size={[d.w + 0.1, d.h, 0.06]} color={shade(theme.desk, -0.15)} r={0.02} />
            <Ms geo={G.plane(d.w - 0.1, d.h - 0.1)} mat={MB('#bfe8ff')} pos={[0, 0, 0.032]} cast={false} />
            <Ms geo={G.circle(0.11, 20)} mat={MB('#ffe27a')} pos={[0.2, 0.25, 0.034]} cast={false} />
            <Ms geo={G.circle(0.5, 28)} mat={MB(d.color)} pos={[-0.1, -0.6, 0.034]} scale={[1, 0.7, 1]} cast={false} />
            <Ms geo={G.circle(0.4, 28)} mat={MB(d.color2)} pos={[0.32, -0.6, 0.036]} scale={[1, 0.7, 1]} cast={false} />
          </group>
        );
      case 'clock':
        return <Clock w={d.w} roomId={roomId} />;
      case 'whiteboard':
        return (
          <group>
            <RB size={[d.w + 0.12, d.h + 0.12, 0.05]} color="#c9cfdd" r={0.02} metal={0.2} />
            <RB size={[d.w, d.h, 0.03]} pos={[0, 0, 0.02]} color="#ffffff" r={0.01} rough={0.3} />
            {[0, 1, 2, 3].map((i) => (
              <Ms key={i} geo={G.plane(0.5 + ((i * 37 + d.variant * 13) % 10) / 12, 0.045)} mat={MB([d.color, d.color2, '#8a93a8', theme.accent3][i])} pos={[-d.w / 2 + 0.7 + i * 0.05, d.h / 2 - 0.25 - i * 0.22, 0.037]} cast={false} />
            ))}
            <Ms geo={G.circle(0.16, 20)} mat={MB(d.color2)} pos={[d.w / 2 - 0.42, -0.12, 0.037]} cast={false} />
            <RB size={[d.w * 0.8, 0.05, 0.1]} pos={[0, -d.h / 2 - 0.08, 0.05]} color="#c9cfdd" r={0.01} />
            {[0, 1, 2].map((i) => (
              <Ms key={i} geo={G.cyl(0.013, 0.013, 0.12, 6)} mat={M([d.color, d.color2, '#4b4f63'][i])} pos={[-0.2 + i * 0.12, -d.h / 2 - 0.045, 0.06]} rot={[0, 0, Math.PI / 2]} cast={false} />
            ))}
          </group>
        );
      case 'pennant':
        return (
          <group rotation={[0, 0, 0.06]}>
            <mesh geometry={pennantGeometry()} material={new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.9, side: THREE.DoubleSide })} position={[0, 0, 0.02]} castShadow />
            <Ms geo={G.circle(0.09, 5)} mat={MB('#ffffff')} pos={[0, 0.15, 0.03]} cast={false} />
            <Ms geo={G.cyl(0.012, 0.012, 0.9, 6)} mat={M('#8a6a4a')} pos={[0, 0.52, 0.02]} rot={[0, 0, Math.PI / 2]} />
          </group>
        );
      case 'shelf':
        return (
          <group>
            <RB size={[d.w, 0.05, 0.22]} pos={[0, 0, 0.11]} color={shade(theme.desk, -0.1)} r={0.015} />
            <Ms geo={G.cyl(0.06, 0.05, 0.1, 12)} mat={M(d.color)} pos={[-d.w / 2 + 0.22, 0.075, 0.11]} />
            <Ms geo={G.sphere(0.07, 10, 8)} mat={M('#59c27d')} pos={[-d.w / 2 + 0.22, 0.17, 0.11]} />
            <RB size={[0.05, 0.2, 0.14]} pos={[0.1, 0.12, 0.11]} color={d.color2} r={0.008} />
            <RB size={[0.05, 0.24, 0.14]} pos={[0.16, 0.14, 0.11]} color={theme.accent3} r={0.008} />
            <Ms geo={G.sphere(0.08, 10, 8)} mat={M('#ffd166', { metal: 0.4, rough: 0.35 })} pos={[d.w / 2 - 0.25, 0.1, 0.11]} />
          </group>
        );
      case 'sconce':
        return <Sconce />;
      case 'tv':
        return <WallTV d={d} roomId={roomId} />;
      case 'cork':
        return <CorkBoard d={d} theme={theme} />;
      case 'kanban':
        return <Kanban d={d} theme={theme} />;
      case 'calendar':
        return <Calendar d={d} />;
      case 'motto':
        return <Motto d={d} theme={theme} />;
      default:
        return null;
    }
  })();
  return (
    <group position={[localX, d.y, 0.03]}>{inner}</group>
  );
}

function Sconce() {
  return (
    <group>
      <RB size={[0.14, 0.3, 0.05]} color="#8a93a8" r={0.02} metal={0.3} />
      <Ms geo={G.cyl(0.11, 0.07, 0.22, 16)} mat={glowMat('#fff2c8')} pos={[0, 0, 0.1]} />
      <Ms geo={G.cone(0.34, 0.9, 16)} mat={GLOW.cone} pos={[0, -0.57, 0.1]} cast={false} />
      <Ms geo={G.cone(0.22, 0.5, 16)} mat={GLOW.cone} pos={[0, 0.4, 0.1]} rot={[Math.PI, 0, 0]} cast={false} />
    </group>
  );
}

function WallTV({ d, roomId }: { d: WallDecor; roomId?: string }) {
  const bars = useRef<(THREE.Mesh | null)[]>([]);
  const dot = useRef<THREE.Mesh>(null);
  const cols = [d.color, d.color2, '#5ed3b0', '#ffd166', d.color, d.color2];
  useFrame((s) => {
    if (roomId !== undefined && !frame.animRooms.has(roomId)) return;
    const t = s.clock.elapsedTime;
    bars.current.forEach((m, i) => {
      if (!m) return;
      const h = 0.12 + (0.5 + 0.5 * Math.sin(t * (0.7 + i * 0.13) + i * 1.9)) * 0.5;
      m.scale.set(0.15, h, 1);
      m.position.y = -d.h / 2 + 0.2 + h / 2;
    });
    if (dot.current) dot.current.visible = Math.sin(t * 3) > 0;
  });
  return (
    <group>
      <RB size={[d.w + 0.1, d.h + 0.1, 0.07]} color="#1f2233" r={0.03} rough={0.4} />
      <Ms geo={G.plane(d.w, d.h)} mat={MB('#232a45')} pos={[0, 0, 0.037]} cast={false} />
      <Ms geo={G.plane(d.w - 0.1, 0.12)} mat={MB('#2f3a63')} pos={[0, d.h / 2 - 0.1, 0.038]} cast={false} />
      <mesh ref={dot} userData={{ dynamic: true }} geometry={G.circle(0.03, 12)} material={MB('#ff5d73')} position={[-d.w / 2 + 0.14, d.h / 2 - 0.1, 0.04]} />
      {[0, 1, 2].map((i) => (
        <Ms key={i} geo={G.plane(0.28 - i * 0.05, 0.03)} mat={MB('#8a93c0')} pos={[-0.15 + i * 0.05, d.h / 2 - 0.1, 0.04]} cast={false} />
      ))}
      {cols.map((c, i) => (
        <mesh key={i} ref={(el) => { bars.current[i] = el; }} userData={{ dynamic: true }} geometry={G.plane(1, 1)} material={MB(c)} position={[-0.6 + i * 0.24, -d.h / 2 + 0.3, 0.04]} />
      ))}
      <Ms geo={G.plane(d.w - 0.3, 0.008)} mat={MB('#8a93c0')} pos={[0, -d.h / 2 + 0.19, 0.04]} cast={false} />
    </group>
  );
}

function CorkBoard({ d, theme }: { d: WallDecor; theme: RoomTheme }) {
  const notes = useMemo(() => {
    const r = new Rng(d.variant * 131 + Math.floor(d.pos * 10));
    return Array.from({ length: 7 }, (_, i) => ({
      x: r.range(-d.w / 2 + 0.2, d.w / 2 - 0.2),
      y: r.range(-d.h / 2 + 0.18, d.h / 2 - 0.18),
      rot: r.range(-0.25, 0.25),
      c: r.pick(['#fff176', '#ff9ec4', '#8fd3ff', '#b7f0a8', theme.accent3, '#ffffff']),
      photo: i > 4,
      s: r.range(0.16, 0.24),
    }));
  }, [d, theme]);
  return (
    <group>
      <RB size={[d.w + 0.12, d.h + 0.12, 0.06]} color={shade(theme.desk, -0.22)} r={0.02} />
      <Ms geo={G.plane(d.w, d.h)} mat={M('#d9a86c', { rough: 1 })} pos={[0, 0, 0.032]} cast={false} />
      {notes.map((n, i) => (
        <group key={i} position={[n.x, n.y, 0.04]} rotation={[0, 0, n.rot]}>
          {n.photo ? (
            <>
              <RB size={[n.s + 0.04, n.s + 0.1, 0.008]} color="#ffffff" r={0.003} cast={false} />
              <Ms geo={G.plane(n.s, n.s)} mat={MB(shade(n.c, -0.05))} pos={[0, 0.02, 0.006]} cast={false} />
            </>
          ) : (
            <Ms geo={G.plane(n.s, n.s)} mat={MB(n.c)} cast={false} />
          )}
          <Ms geo={G.sphere(0.02, 6, 5)} mat={M('#ff5d73')} pos={[0, n.s / 2 - 0.01, 0.012]} cast={false} />
        </group>
      ))}
    </group>
  );
}

function Kanban({ d, theme }: { d: WallDecor; theme: RoomTheme }) {
  const cols = [theme.accent, theme.accent3, '#5ed3b0'];
  const notes = useMemo(() => {
    const r = new Rng(d.variant * 71 + Math.floor(d.pos * 10));
    return [0, 1, 2].map((c) => Array.from({ length: r.int(1, c === 2 ? 4 : 3) }, () => ({ c: r.pick(['#fff176', '#ff9ec4', '#8fd3ff', '#b7f0a8', '#ffcf9e']), rot: r.range(-0.08, 0.08) })));
  }, [d]);
  const colW = (d.w - 0.2) / 3;
  return (
    <group>
      <RB size={[d.w + 0.1, d.h + 0.1, 0.05]} color="#c9cfdd" r={0.02} metal={0.2} />
      <RB size={[d.w, d.h, 0.03]} pos={[0, 0, 0.02]} color="#ffffff" r={0.01} rough={0.3} />
      {cols.map((c, i) => {
        const cx = -d.w / 2 + 0.1 + colW * (i + 0.5);
        return (
          <group key={i}>
            <Ms geo={G.plane(colW - 0.08, 0.14)} mat={MB(c)} pos={[cx, d.h / 2 - 0.13, 0.037]} cast={false} />
            <Ms geo={G.plane(0.008, d.h - 0.35)} mat={MB('#d7dbe8')} pos={[cx + colW / 2, -0.05, 0.037]} cast={false} />
            {notes[i].map((n, j) => (
              <Ms key={j} geo={G.plane(colW - 0.2, 0.22)} mat={MB(n.c)} pos={[cx, d.h / 2 - 0.42 - j * 0.3, 0.038]} rot={[0, 0, n.rot]} cast={false} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

const MONTHS = ['MAR', 'MAY', 'JUN', 'SEP', 'OCT', 'DEC'];
function Calendar({ d }: { d: WallDecor }) {
  const tex = useMemo(() => calendarTexture(MONTHS[d.variant % MONTHS.length], d.color, d.variant + 3), [d]);
  return (
    <group>
      <RB size={[d.w + 0.04, d.h + 0.04, 0.03]} color="#ffffff" r={0.01} />
      <mesh geometry={G.plane(d.w, d.h)} position={[0, 0, 0.018]}>
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <Ms geo={G.sphere(0.02, 6, 5)} mat={M('#ff5d73')} pos={[0, d.h / 2 + 0.02, 0.02]} cast={false} />
    </group>
  );
}

const MOTTOS = ['SHIP IT!', 'COFFEE FIRST', 'TEAMWORK', 'NO BUGS TODAY', 'DONE > PERFECT', 'STAY CURIOUS'];
function Motto({ d, theme }: { d: WallDecor; theme: RoomTheme }) {
  const text = MOTTOS[d.variant % MOTTOS.length];
  const tex = useMemo(() => textTexture(text, 448, 160, d.color, '#ffffff', { border: shade(d.color, -0.12) }), [text, d.color]);
  return (
    <group>
      <RB size={[d.w, d.h, 0.05]} color={shade(theme.desk, -0.15)} r={0.02} />
      <mesh geometry={G.plane(d.w - 0.1, d.h - 0.1)} position={[0, 0, 0.028]}>
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

export function FloorDecals({ decals }: { decals: FloorDecal[] }) {
  return (
    <group>
      {decals.map((c, i) => {
        const s = c.size;
        switch (c.kind) {
          case 'paper':
            return <RB key={i} size={[0.25 * s, 0.004, 0.33 * s]} pos={[c.x, 0.018 + (i % 3) * 0.002, c.z]} rot={[0, c.rot, 0]} color="#fffaf0" r={0.001} cast={false} rough={1} />;
          case 'ball':
            return <Ms key={i} geo={G.ico(0.065 * s, 0)} mat={M('#ffffff', { rough: 1 })} pos={[c.x, 0.06 * s, c.z]} rot={[c.rot, c.rot * 2, 0]} />;
          case 'sticky':
            return <RB key={i} size={[0.1 * s, 0.003, 0.1 * s]} pos={[c.x, 0.018, c.z]} rot={[0, c.rot, 0]} color={c.color} r={0.001} cast={false} rough={1} />;
          case 'cable':
            return <Ms key={i} geo={G.torus(0.3 * s, 0.015, Math.PI * 1.3, 5, 20)} mat={M(c.color, { rough: 0.8 })} pos={[c.x, 0.014, c.z]} rot={[-Math.PI / 2, 0, c.rot]} cast={false} />;
          case 'stain':
            return <Ms key={i} geo={G.circle(0.22 * s, 18)} mat={MB(c.color, 0.16)} pos={[c.x, 0.016, c.z]} rot={[-Math.PI / 2, 0, 0]} cast={false} />;
          default:
            return <Ms key={i} geo={G.cyl(0.008, 0.008, 0.15, 6)} mat={M('#3a6cff')} pos={[c.x, 0.02, c.z]} rot={[0, c.rot, Math.PI / 2]} cast={false} />;
        }
      })}
    </group>
  );
}

export function Sign({ title, localX, y, theme }: { title: string; localX: number; y: number; theme: RoomTheme }) {
  const tex = useMemo(() => textTexture(title, 640, 128, theme.trim, shade(theme.base, -0.22), { icon: '📁', border: theme.accent }), [title, theme]);
  return (
    <group position={[localX, y, 0.04]}>
      <RB size={[3.2, 0.66, 0.06]} color={theme.trim} r={0.04} />
      <mesh position={[0, 0, 0.034]} geometry={G.plane(3.1, 0.62)}>
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
      {[-1, 1].map((s) => (
        <Ms key={s} geo={G.cyl(0.008, 0.008, 0.3, 6)} mat={M('#8a6a4a')} pos={[s * 1.3, 0.45, -0.01]} />
      ))}
    </group>
  );
}

export function layoutOpenings(layout: RoomLayout) {
  const back: (Opening & { win?: WindowSpec })[] = [];
  const left: (Opening & { win?: WindowSpec })[] = [];
  for (const w of layout.windows) {
    const o = { center: 0, width: w.w + 0.24, bottom: w.sill - 0.1, top: w.sill + w.h + 0.1, win: w };
    if (w.wall === 'back') back.push({ ...o, center: w.pos + WALL_T / 2 });
    else left.push({ ...o, center: -w.pos });
  }
  const d = layout.door;
  const door = { center: 0, width: d.width + 0.16, bottom: 0, top: d.height + 0.02 };
  if (d.wall === 'back') back.push({ ...door, center: d.pos + WALL_T / 2 });
  else left.push({ ...door, center: -d.pos });
  return { back, left };
}
