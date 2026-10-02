import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { RoomLayout } from '../world/layout';
import { WALL_T } from './RoomParts';
import { DESK_TOP } from './furniture';
import { shade } from './kit';

/** the walls and desks of the sketch breathe a little (opacity), so it reads as "on its way", not as a finished, empty room */
const PULSE_HZ = 0.9;
const WALL_ALPHA = 0.28;
const DESK_ALPHA = 0.42;
const noRay = () => null;

/** the base and floor materials are shared by every sketch with the same colours (opaque, never changed: no reason for one per room) */
const solid = new Map<string, THREE.MeshStandardMaterial>();
function solidMat(color: string, roughness: number) {
  const k = `${color}|${roughness}`;
  let m = solid.get(k);
  if (!m) solid.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness })));
  return m;
}

/**
 * The base and the plain floor of a room: one block, or two for an L-shaped room (the same blocks RoomStatic lays, without the rounded
 * edges). Rooms that are not built (not loaded ahead) show this much in the overview, and a room that is being built starts from it.
 */
export function GhostFloor({ layout }: { layout: RoomLayout }) {
  const { width: W, depth: D, theme, notch } = layout;
  const t = WALL_T;
  const blocks = useMemo(() => {
    const x0 = -W / 2 - t - 0.15;
    const z0 = -D / 2 - t - 0.15;
    const box = (xa: number, xb: number, za: number, zb: number) => ({ x: (xa + xb) / 2, z: (za + zb) / 2, w: xb - xa, d: zb - za });
    if (!notch) return { base: [box(x0, W / 2 + 0.15, z0, D / 2 + 0.15)], floor: [box(-W / 2, W / 2, -D / 2, D / 2)] };
    return {
      base: [box(x0, W / 2 + 0.15, z0, D / 2 - notch.d + 0.15), box(x0, W / 2 - notch.w + 0.15, D / 2 - notch.d - 0.5, D / 2 + 0.15)],
      floor: [box(-W / 2, W / 2, -D / 2, D / 2 - notch.d), box(-W / 2, W / 2 - notch.w, D / 2 - notch.d, D / 2)],
    };
  }, [W, D, t, notch]);
  const base = solidMat(theme.base, 0.9);
  const floor = solidMat(shade(theme.floor, 0.04), 0.95);
  return (
    <>
      {blocks.base.map((b, i) => (
        <mesh key={`b${i}`} material={base} position={[b.x, -0.3, b.z]} receiveShadow raycast={noRay}>
          <boxGeometry args={[b.w, 0.6, b.d]} />
        </mesh>
      ))}
      {blocks.floor.map((b, i) => (
        <mesh key={`f${i}`} material={floor} position={[b.x, 0.004, b.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRay}>
          <planeGeometry args={[b.w, b.d]} />
        </mesh>
      ))}
    </>
  );
}

/**
 * A rough sketch of a room that is being built: its base and plain floor (see GhostFloor), see-through walls and the desk footprints.
 * It is a handful of meshes, so it is there in the very frame the room is put into the scene – the camera glides to the shape of the
 * room instead of to an empty spot – and each part goes away when the real one arrives (see RoomView).
 */
export function RoomGhost({ layout, floor, back, left, desks }: { layout: RoomLayout; floor: boolean; back: boolean; left: boolean; desks: boolean }) {
  const { width: W, depth: D, wallHeight: H, theme } = layout;
  const t = WALL_T;
  const mats = useMemo(
    () => ({
      wall: new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.9, transparent: true, opacity: WALL_ALPHA, depthWrite: false }),
      desk: new THREE.MeshStandardMaterial({ color: theme.deskTop, roughness: 0.8, transparent: true, opacity: DESK_ALPHA, depthWrite: false }),
    }),
    [theme],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame((state) => {
    const k = 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * Math.PI * 2 * PULSE_HZ);
    mats.wall.opacity = WALL_ALPHA * k;
    mats.desk.opacity = DESK_ALPHA * k;
  });

  return (
    <group>
      {floor ? <GhostFloor layout={layout} /> : null}
      {back ? (
        <mesh material={mats.wall} position={[-t / 2, H / 2, -D / 2 - t / 2]} raycast={noRay}>
          <boxGeometry args={[W + t, H, t]} />
        </mesh>
      ) : null}
      {left ? (
        <mesh material={mats.wall} position={[-W / 2 - t / 2, H / 2, 0]} raycast={noRay}>
          <boxGeometry args={[t, H, D]} />
        </mesh>
      ) : null}
      {desks ? (
        <>
          {layout.desks.map((d) => (
            <mesh key={d.index} material={mats.desk} position={[d.x, DESK_TOP / 2, d.z]} rotation={[0, d.rot, 0]} raycast={noRay}>
              <boxGeometry args={[d.w, DESK_TOP, 1.0]} />
            </mesh>
          ))}
          <mesh material={mats.desk} position={[layout.director.desk.x, DESK_TOP / 2, layout.director.desk.z]} rotation={[0, layout.director.rot, 0]} raycast={noRay}>
            <boxGeometry args={[3.0, DESK_TOP, 1.2]} />
          </mesh>
        </>
      ) : null}
    </group>
  );
}
