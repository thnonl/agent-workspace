import { useCallback, useSyncExternalStore } from 'react';
import type { RoomLayout } from '../world/layout';
import { FOOT } from '../world/layout';
import { movedOf, movedVersion, subscribeMoved } from '../sim/registry';
import { PropView } from './props';
import { StaticBake } from './StaticBake';
import { blobGeometry, FX, initFx } from './fx';

/**
 * The plants and cartons of a room that people carry to a tidier place (`layout.movable`, see sim/tidy.ts). Each one is baked
 * on its own, so it is drawn again at its new place when it is set down, and is gone while somebody holds it.
 */
export function MovableProps({ roomId, layout }: { roomId: string; layout: RoomLayout }) {
  initFx();
  const items = movedOf(roomId, layout);
  const subscribe = useCallback((fn: () => void) => subscribeMoved(roomId, fn), [roomId, items]);
  useSyncExternalStore(subscribe, () => movedVersion(roomId));
  return (
    <>
      {items.map((it, i) => {
        if (it.state === 'carried' || it.state === 'gone') return null;
        const prop = layout.props[it.prop];
        const [w, d] = FOOT[prop.kind];
        const moved = { ...prop, x: it.x, z: it.z, rot: it.rot };
        return (
          <group key={`${i}:${it.x.toFixed(2)}:${it.z.toFixed(2)}`}>
            {/* (the room's baked floor shadows leave these out: this one goes with the prop) */}
            <mesh geometry={blobGeometry()} material={FX.blob} position={[it.x, 0.03, it.z]} rotation={[0, it.rot, 0]} scale={[w * 1.05, 1, d * 1.05]} renderOrder={1} raycast={() => null} />
            <StaticBake>
              <PropView p={moved} theme={layout.theme} roomId={roomId} />
            </StaticBake>
          </group>
        );
      })}
    </>
  );
}
