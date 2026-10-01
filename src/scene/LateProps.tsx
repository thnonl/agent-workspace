import { useRef } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { FOOT, type RoomLayout } from '../world/layout';
import { deliveredAt } from '../sim/registry';
import { PropView } from './props';
import { StaticBake } from './StaticBake';
import { blobGeometry, FX, initFx } from './fx';
import { useDeliveryVersion } from './useDelivery';

/** how long a thing that has just been unpacked takes to pop into place (seconds) */
const POP_S = 0.5;
/** overshoot ease: grows past its size a little and settles */
function pop(t: number): number {
  const c = 1.9;
  const x = Math.min(1, Math.max(0, t / POP_S)) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

/**
 * The things the room has been sent (`layout.late`): each one is drawn on its own as soon as its parcel is open, so it appears at its
 * place with a little pop – the rest of the room is baked once and has none of them. A thing that arrived while the room was out of the
 * scene is simply there.
 */
export function LateProps({ roomId, layout }: { roomId: string; layout: RoomLayout }) {
  initFx();
  useDeliveryVersion(roomId, layout);
  return (
    <>
      {layout.late.map((pi, k) => (layout.lateDone[k] ? <LateProp key={pi} roomId={roomId} layout={layout} rank={k} /> : null))}
    </>
  );
}

function LateProp({ roomId, layout, rank }: { roomId: string; layout: RoomLayout; rank: number }) {
  const p = layout.props[layout.late[rank]];
  const [w, d] = FOOT[p.kind];
  const born = deliveredAt(roomId, layout, rank);
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const o = g.current;
    if (!o) return;
    const age = born ? (performance.now() - born) / 1000 : POP_S;
    const k = age >= POP_S ? 1 : Math.max(0.01, pop(age));
    if (o.scale.x !== k) o.scale.setScalar(k);
  });
  return (
    <group position={[p.x, 0, p.z]}>
      <group ref={g}>
        {/* (the floor shadow of a baked room leaves these out: this one goes with the thing) */}
        <mesh geometry={blobGeometry()} material={FX.blob} position={[0, 0.03, 0]} rotation={[0, p.rot, 0]} scale={[w * 1.05, 1, d * 1.05]} renderOrder={1} raycast={() => null} />
        <StaticBake>
          <PropView p={{ ...p, x: 0, z: 0 }} theme={layout.theme} roomId={roomId} />
        </StaticBake>
      </group>
    </group>
  );
}
