import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getLayout } from '../world/layout';
import type { RoomLayout } from '../world/layout';
import { G, M } from './kit';
import { Chair, Desk, DirectorDesk, RB, Ms } from './furniture';
import { PropView } from './props';
import { DoorView, FloorDecals, layoutOpenings, Sign, Sunbeam, Wall, WallDecorView, WALL_T, WindowView } from './RoomParts';
import { floorTexture } from './textures';
import { PersonActor } from './PersonActor';
import { StaticBake } from './StaticBake';
import { CatView } from './CatView';
import { shade } from './kit';

export const ROOM_SPACING_X = 48;
export const ROOM_SPACING_Z = 42;

export function roomOrigin(index: number): [number, number, number] {
  return [(index % 3) * ROOM_SPACING_X, 0, Math.floor(index / 3) * ROOM_SPACING_Z];
}

/**
 * Everything in a room that never moves. It is baked into a few merged meshes once, so it must not
 * re-render when the room record changes (new report, new title, new timestamp...): the props
 * (layout identity, room id, sign text) decide.
 */
const RoomStatic = memo(function RoomStatic({ roomId, layout, signTitle }: { roomId: string; layout: RoomLayout; signTitle: string }) {
  const { width: W, depth: D, theme, wallHeight: H } = layout;
  const t = WALL_T;
  const floorTex = useMemo(() => floorTexture(theme.floorKind, theme.floor, theme.floor2, theme.floorKind === 'wood' || theme.floorKind === 'carpetTile' ? W / 4 : W / 3, theme.floorKind === 'wood' || theme.floorKind === 'carpetTile' ? D / 4 : D / 3), [theme, W, D]);
  const { back, left } = useMemo(() => layoutOpenings(layout), [layout]);
  const doorLocalBack = layout.door.wall === 'back' ? layout.door.pos + t / 2 : null;
  const doorLocalLeft = layout.door.wall === 'left' ? -layout.door.pos : null;

  return (
    <>
      <StaticBake>
      {/* diorama base */}
      <RB size={[W + t + 0.3, 0.6, D + t + 0.3]} pos={[(-t + 0.3) / 2 - 0.15, -0.3, (-t + 0.3) / 2 - 0.15]} color={theme.base} r={0.16} receive />
      <RB size={[W + t + 0.3, 0.09, D + t + 0.3]} pos={[(-t + 0.3) / 2 - 0.15, -0.045, (-t + 0.3) / 2 - 0.15]} color={shade(theme.base, 0.1)} r={0.04} receive />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={floorTex} roughness={0.85} />
      </mesh>

      {/* rug */}
      {layout.rug ? (
        layout.rug.shape === 'rect' ? (
          <group position={[layout.rug.x, 0.012, layout.rug.z]}>
            <RB size={[layout.rug.w + 0.2, 0.02, layout.rug.d + 0.2]} color={layout.rug.color2} r={0.01} rough={1} />
            <RB size={[layout.rug.w, 0.024, layout.rug.d]} pos={[0, 0.002, 0]} color={layout.rug.color} r={0.01} rough={1} />
            <RB size={[layout.rug.w - 0.5, 0.026, layout.rug.d - 0.5]} pos={[0, 0.003, 0]} color={shade(layout.rug.color, 0.05)} r={0.01} rough={1} cast={false} />
          </group>
        ) : (
          <group position={[layout.rug.x, 0.012, layout.rug.z]}>
            <Ms geo={G.cyl(layout.rug.w / 2 + 0.1, layout.rug.w / 2 + 0.1, 0.02, 48)} mat={M(layout.rug.color2, { rough: 1 })} receive cast={false} />
            <Ms geo={G.cyl(layout.rug.w / 2, layout.rug.w / 2, 0.024, 48)} mat={M(layout.rug.color, { rough: 1 })} pos={[0, 0.002, 0]} receive cast={false} />
            <Ms geo={G.cyl(layout.rug.w / 3.2, layout.rug.w / 3.2, 0.026, 48)} mat={M(shade(layout.rug.color, 0.05), { rough: 1 })} pos={[0, 0.003, 0]} receive cast={false} />
          </group>
        )
      ) : null}

      <FloorDecals decals={layout.decals} />
      </StaticBake>

      {/* walls */}
      <group position={[-t / 2, 0, -D / 2]}>
        <StaticBake>
        <Wall length={W + t} height={H} openings={back} theme={theme} doorCenter={doorLocalBack} doorWidth={layout.door.width} />
        {layout.windows.filter((w) => w.wall === 'back').map((w, i) => (
          <group key={i}>
            <WindowView spec={w} theme={theme} localX={w.pos + t / 2} wallHeight={H} />
            <Sunbeam w={w.w} localX={w.pos + t / 2} dir={1} />
          </group>
        ))}
        {layout.door.wall === 'back' ? <DoorView door={layout.door} theme={theme} roomId={roomId} localX={layout.door.pos + t / 2} /> : null}
        {layout.wallDecor.filter((d) => d.wall === 'back').map((d, i) => (
          <WallDecorView key={i} d={d} theme={theme} localX={d.pos + t / 2} />
        ))}
        {layout.signPos?.wall === 'back' ? <Sign title={signTitle} localX={layout.signPos.pos + t / 2} y={layout.signPos.y} theme={theme} /> : null}
        </StaticBake>
      </group>
      <group position={[-W / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <StaticBake>
        <Wall length={D} height={H} openings={left} theme={theme} doorCenter={doorLocalLeft} doorWidth={layout.door.width} />
        {layout.windows.filter((w) => w.wall === 'left').map((w, i) => (
          <group key={i}>
            <WindowView spec={w} theme={theme} localX={-w.pos} wallHeight={H} />
            <Sunbeam w={w.w} localX={-w.pos} dir={-1} />
          </group>
        ))}
        {layout.door.wall === 'left' ? <DoorView door={layout.door} theme={theme} roomId={roomId} localX={-layout.door.pos} /> : null}
        {layout.wallDecor.filter((d) => d.wall === 'left').map((d, i) => (
          <WallDecorView key={i} d={d} theme={theme} localX={-d.pos} />
        ))}
        </StaticBake>
      </group>

      {/* furniture */}
      <StaticBake>
        {layout.desks.map((d) => (
          <Desk key={d.index} slot={d} theme={theme} />
        ))}
      </StaticBake>
      <StaticBake>
        {layout.props.map((p, i) => (
          <PropView key={i} p={p} theme={theme} />
        ))}
      </StaticBake>
    </>
  );
});

export const RoomView = memo(function RoomView({ roomId }: { roomId: string }) {
  // narrow selectors: the room record changes on every event (timestamps, counters) but only these matter here
  const exists = useStore((s) => !!s.rooms[roomId]);
  const index = useStore((s) => s.rooms[roomId]?.index ?? 0);
  const seed = useStore((s) => s.rooms[roomId]?.seed ?? 0);
  const themeIndex = useStore((s) => s.rooms[roomId]?.themeIndex ?? 0);
  const reports = useStore((s) => s.rooms[roomId]?.reports ?? 0);
  const signTitle = useStore((s) => {
    const r = s.rooms[roomId];
    return r ? r.project || r.title : '';
  });
  const personKeys = useStore(
    useShallow((s) =>
      Object.values(s.people)
        .filter((p) => p.sessionId === roomId)
        .map((p) => p.key),
    ),
  );
  const layout = useMemo(() => getLayout(seed, themeIndex), [seed, themeIndex]);
  const { theme } = layout;

  if (!exists) return null;
  const origin = roomOrigin(index);

  return (
    <group position={origin}>
      <RoomStatic roomId={roomId} layout={layout} signTitle={signTitle} />

      {/* movable furniture */}
      {layout.desks.map((d) => (
        <Chair key={d.index} x={d.seat.x} z={d.seat.z} rot={d.rot} turn={d.chairTurn} color={d.chairColor} roomId={roomId} deskIndex={d.index} approachSide={d.approachSide} seed={d.index} />
      ))}
      <DirectorDesk layout={layout} reports={reports} />
      <Chair x={layout.director.seat.x} z={layout.director.seat.z} rot={0} turn={0} color={shade(theme.accent2, -0.05)} roomId={roomId} deskIndex={-1} big approachSide={layout.director.approachSide} seed={99} />

      {/* the office cats */}
      {Array.from({ length: layout.catCount }, (_, i) => (
        <CatView key={i} catKey={`${roomId}::cat${i}`} roomId={roomId} layout={layout} seed={seed + i * 977} />
      ))}

      {/* people */}
      {personKeys.map((k) => (
        <PersonActor key={k} personKey={k} roomId={roomId} layout={layout} />
      ))}
    </group>
  );
});
