import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { FOOT, type PropKind, type RoomLayout } from '../world/layout';
import { useStore } from '../store';
import { burst } from '../sim/celebrate';
import { frame } from '../sim/frame';
import { propHere } from '../sim/registry';
import { useDeliveryVersion } from './useDelivery';
import { sfx } from '../audio';
import { G, M, MB } from './kit';
import { DESK_TOP, Ms, RB } from './furniture';
import { usePointerCursor } from './hover';

const hitMat = new THREE.MeshBasicMaterial({ visible: false });

/** what poking each kind of prop does */
const POKE: Partial<Record<PropKind, (roomId: string, x: number, y: number, z: number) => void>> = {
  coffee: (room, x, y, z) => {
    sfx('pour', room);
    burst(room, 'steam', [x, y * 0.72, z]);
  },
  cooler: (room, x, y, z) => {
    sfx('water', room);
    burst(room, 'bubbles', [x, y * 0.8, z]);
  },
  fishtank: (room, x, y, z) => {
    sfx('clink', room);
    burst(room, 'feed', [x, y * 0.95, z]);
  },
  printer: (room, x, y, z) => {
    sfx('paper', room);
    burst(room, 'steam', [x, y, z]);
  },
  vending: (room, x, y, z) => {
    sfx('clank', room);
    burst(room, 'feed', [x, y * 0.4, z + 0.3]);
  },
};

function Hit({ roomId, kind, x, z, rot }: { roomId: string; kind: PropKind; x: number; z: number; rot: number }) {
  const pointer = usePointerCursor();
  const [w, h, d] = FOOT[kind];
  return (
    <mesh
      geometry={G.box(w, h, d)}
      material={hitMat}
      position={[x, h / 2, z]}
      rotation={[0, rot, 0]}
      {...pointer}
      onClick={(e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        POKE[kind]?.(roomId, x, h, z);
      }}
    />
  );
}

/** Invisible click boxes over the things in the office that react when they are poked (coffee machine, cooler, fish tank...). */
export function PropHits({ roomId, layout }: { roomId: string; layout: RoomLayout }) {
  useDeliveryVersion(roomId, layout); // (a thing that has just been delivered can be poked)
  return (
    <>
      {layout.props.map((p, i) => (POKE[p.kind] && propHere(layout, i) ? <Hit key={i} roomId={roomId} kind={p.kind} x={p.x} z={p.z} rot={p.rot} /> : null))}
    </>
  );
}

/** A little radio on the director's desk: click it to play lo-fi music (it bounces with the beat and lets notes float up). */
export function Radio({ roomId, layout }: { roomId: string; layout: RoomLayout }) {
  const desk = layout.director.desk;
  const body = useRef<THREE.Group>(null);
  const dial = useRef<THREE.Mesh>(null);
  const pointer = usePointerCursor();
  const clock = useRef(0);
  const noteAt = useRef(0);
  const dialOn = useRef(MB('#ff6f91')).current;
  useFrame((_, dt) => {
    const g = body.current;
    if (!g || !frame.animRooms.has(roomId)) return;
    const on = useStore.getState().musicOn;
    clock.current += dt;
    const beat = on ? Math.abs(Math.sin(clock.current * 4.2)) : 0;
    g.scale.set(1 + beat * 0.025, 1 + beat * 0.06, 1 + beat * 0.025);
    if (dial.current) dial.current.visible = on;
    if (on && clock.current - noteAt.current > 1.5) {
      noteAt.current = clock.current;
      burst(roomId, 'notes', [desk.x - 0.88, DESK_TOP + 0.3, desk.z - 0.28]);
    }
  });
  return (
    <group position={[desk.x - 0.88, DESK_TOP + 0.02, desk.z - 0.28]} rotation={[0, 0.25, 0]}>
      <group
        ref={body}
        {...pointer}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          const st = useStore.getState();
          st.setMusicOn(!st.musicOn);
          sfx('radio');
        }}
      >
        <RB size={[0.34, 0.19, 0.12]} pos={[0, 0.095, 0]} color="#e9c46a" r={0.035} rough={0.5} cast={false} />
        <RB size={[0.36, 0.02, 0.13]} pos={[0, 0.19, 0]} color="#c9963a" r={0.008} cast={false} />
        <Ms geo={G.circle(0.06, 20)} mat={MB('#3c3248')} pos={[-0.08, 0.09, 0.061]} cast={false} />
        {[-0.03, 0, 0.03].map((y) => (
          <Ms key={y} geo={G.plane(0.09, 0.006)} mat={MB('#6d5f82')} pos={[-0.08, 0.09 + y, 0.063]} cast={false} />
        ))}
        <Ms geo={G.cyl(0.022, 0.022, 0.014, 14)} mat={M('#fff6e0')} pos={[0.09, 0.1, 0.066]} rot={[Math.PI / 2, 0, 0]} cast={false} />
        <Ms geo={G.cyl(0.012, 0.012, 0.014, 10)} mat={M('#b56a3a')} pos={[0.09, 0.145, 0.066]} rot={[Math.PI / 2, 0, 0]} cast={false} />
        <mesh ref={dial} geometry={G.circle(0.011, 10)} material={dialOn} position={[0.038, 0.155, 0.0615]} visible={false} />
        <Ms geo={G.cyl(0.004, 0.004, 0.26, 5)} mat={M('#cfcfd8', { metal: 0.5 })} pos={[0.13, 0.3, -0.03]} rot={[0, 0, -0.35]} cast={false} />
        {/* (a box around it all: the click target) */}
        <mesh geometry={G.box(0.4, 0.26, 0.18)} material={hitMat} position={[0, 0.13, 0]} />
      </group>
    </group>
  );
}
