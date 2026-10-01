import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import { frame } from '../sim/frame';
import { host } from '../pipHost';
import { walkMatrices } from './matrixWalk';
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
import { RoomAO } from './RoomAO';
import { RoomLightFx } from './RoomLightFx';
import { SeasonDecor } from './SeasonDecor';
import { CelebrationFx } from './CelebrationFx';
import { PropHits, Radio } from './Interactive';
import type { Season } from '../season';
import { CatView } from './CatView';
import { CatToys } from './CatToys';
import { MovableProps } from './MovableProps';
import { LateProps } from './LateProps';
import { shade } from './kit';
import { RestroomShell, RestroomWalls } from './restroom';

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
const DeskItem = memo(Desk);
const PropItem = memo(PropView);

const RoomStatic = memo(function RoomStatic({ roomId, layout, signTitle, season, stage }: { roomId: string; layout: RoomLayout; signTitle: string; season: Season; stage: number }) {
  const { width: W, depth: D, theme, wallHeight: H } = layout;
  const t = WALL_T;
  const floorTex = useMemo(() => floorTexture(theme.floorKind, theme.floor, theme.floor2, theme.floorKind === 'wood' || theme.floorKind === 'carpetTile' ? W / 4 : W / 3, theme.floorKind === 'wood' || theme.floorKind === 'carpetTile' ? D / 4 : D / 3), [theme, W, D]);
  const { back, left } = useMemo(() => layoutOpenings(layout), [layout]);
  const doorLocalBack = layout.door.wall === 'back' ? layout.door.pos + t / 2 : null;
  const doorLocalLeft = layout.door.wall === 'left' ? -layout.door.pos : null;

  // (every section is built once as an element and handed back unchanged, so React skips what is already mounted when a later stage arrives)
  const floorPart = useMemo(() => (
    <>
      <StaticBake>
      {/* diorama base */}
      <RB size={[W + t + 0.3, 0.6, D + t + 0.3]} pos={[(-t + 0.3) / 2 - 0.15, -0.3, (-t + 0.3) / 2 - 0.15]} color={theme.base} r={0.16} receive />
      {/* (its top sits 4 mm under the base top: equal heights z-fight in the doorway, where no floor plane covers them) */}
      <RB size={[W + t + 0.3, 0.09, D + t + 0.3]} pos={[(-t + 0.3) / 2 - 0.15, -0.049, (-t + 0.3) / 2 - 0.15]} color={shade(theme.base, 0.1)} r={0.04} receive />
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
      <RoomAO layout={layout} />
    </>
  ), [layout, floorTex]);

  const backPart = useMemo(() => (
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
        {layout.wallDecor.filter((d) => d.wall === 'back' && d).map((d, i) => (
          <WallDecorView key={i} d={d} theme={theme} roomId={roomId} localX={d.pos + t / 2} />
        ))}
        {layout.signPos?.wall === 'back' ? <Sign title={signTitle} localX={layout.signPos.pos + t / 2} y={layout.signPos.y} theme={theme} /> : null}
        </StaticBake>
      </group>
  ), [layout, back, signTitle, roomId]);

  const leftPart = useMemo(() => (
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
        {layout.wallDecor.filter((d) => d.wall === 'left' && d).map((d, i) => (
          <WallDecorView key={i} d={d} theme={theme} roomId={roomId} localX={-d.pos} />
        ))}
        </StaticBake>
      </group>
  ), [layout, left, roomId]);

  // desks and props arrive in several parts (stages); the merge into a few meshes happens when the last part is in
  const deskCount = Math.min(layout.desks.length, Math.ceil((layout.desks.length * (stage - STAGE.desks + 1)) / DESK_STEPS));
  const propCount = Math.min(layout.props.length, Math.ceil((layout.props.length * (stage - STAGE.props + 1)) / PROP_STEPS));

  return (
    <>
      {stage >= STAGE.floor ? floorPart : null}
      {stage >= STAGE.back ? backPart : null}
      {stage >= STAGE.left ? leftPart : null}
      {/* furniture */}
      {stage >= STAGE.desks ? (
        <StaticBake ready={stage >= STAGE.desks + DESK_STEPS - 1}>
          {layout.desks.map((d, i) => (i < deskCount ? <DeskItem key={d.index} slot={d} theme={theme} /> : null))}
        </StaticBake>
      ) : null}
      {stage >= STAGE.props ? (
        <StaticBake ready={stage >= STAGE.props + PROP_STEPS - 1}>
          {layout.props.map((p, i) => (i < propCount && !layout.movable.includes(i) && layout.lateRank[i] < 0 ? <PropItem key={i} p={p} theme={theme} roomId={roomId} /> : null))}
          {layout.restroom && stage >= STAGE.props + PROP_STEPS - 1 ? <RestroomShell rr={layout.restroom} /> : null}
        </StaticBake>
      ) : null}
      {/* festive decorations (Halloween, Christmas, Tết): baked again when the season changes */}
      {stage < STAGE.toys || season === 'none' ? null : (
        <StaticBake key={season}>
          <SeasonDecor layout={layout} season={season} />
        </StaticBake>
      )}
    </>
  );
});

/**
 * A room is not built in one go (that froze the page for a few hundred milliseconds when a session appeared): its parts come one
 * build stage at a time, each in a frame of its own, so no single frame has much to do. Stage 0 is the empty room.
 */
// (the room comes first – walls, furniture, props – and the people follow one after the other, the cats last)
const STAGE = { floor: 1, back: 2, left: 3, desks: 4, chairs: 6, director: 7, props: 8, toys: 12, movables: 13, board: 14, light: 15, people: 16, cats: 24, party: 28 } as const;
const BUILD_STAGES = STAGE.party;
/** the most cats a room has */
const MAX_CATS = 2;
const BUILD_GAP_MS = 6;
/** pause before each person / cat is built: they walk into the finished room one by one */
const CHARACTER_GAP_MS = 140;
/** stages per baked group that is mounted a part at a time (the group is merged once its last part is in) */
const DESK_STEPS = 2;
const PROP_STEPS = 4;
/** the build of a room starts this long after it was put into the scene (the camera starts to glide to it meanwhile) and waits for the camera to arrive */
const BUILD_START_MS = 120;
/** ...but not for longer than this in all (a screensaver camera never stops) */
const CAMERA_WAIT_MS = 3500;
function useBuildStage(people: number, cats: number, active: boolean) {
  const [stage, setStage] = useState(0);
  const waited = useRef(0);
  const count = useRef({ people, cats });
  const activeRef = useRef(active);
  activeRef.current = active;
  count.current = { people, cats };
  // every room is built completely, the people and cats too (the next ones are loaded ahead, see Preload in Scene.tsx);
  // a room that is not the one on screen stands still (see `active` below)
  const cap = BUILD_STAGES;
  useEffect(() => {
    if (active) waited.current = 0;
  }, [active]);
  useEffect(() => {
    if (stage >= cap) return;
    const w = host();
    let t = 0;
    const next = () => {
      // switching rooms: the camera glides first, the room is built once it has arrived (a build during the glide made it stutter)
      if (frame.cameraBusy && waited.current < CAMERA_WAIT_MS) {
        waited.current += 50;
        t = w.setTimeout(next, 50);
        return;
      }
      // a room that is loaded ahead is built further while the walkers of the room on screen stand still (see updateLoadGate)
      if (!activeRef.current && !frame.loadOk) {
        t = w.setTimeout(next, 100);
        return;
      }
      setStage((n) => n + 1);
    };
    // (a stage that builds a person or a cat is preceded by a pause; stages with nobody to build go by quickly)
    const n = stage + 1;
    const character = (n >= STAGE.people && n - STAGE.people < Math.min(count.current.people, 8)) || (n >= STAGE.cats && n - STAGE.cats < Math.min(count.current.cats, 4));
    t = w.setTimeout(next, stage === 0 ? BUILD_START_MS : character ? CHARACTER_GAP_MS : BUILD_GAP_MS);
    return () => w.clearTimeout(t);
  }, [stage, cap]);
  return { stage, cap };
}

export const RoomView = memo(function RoomView({ roomId, active }: { roomId: string; active: boolean }) {
  // narrow selectors: the room record changes on every event (timestamps, counters) but only these matter here
  const exists = useStore((s) => !!s.rooms[roomId]);
  const index = useStore((s) => s.rooms[roomId]?.index ?? 0);
  const seed = useStore((s) => s.rooms[roomId]?.seed ?? 0);
  const themeIndex = useStore((s) => s.rooms[roomId]?.themeIndex ?? 0);
  const reports = useStore((s) => s.rooms[roomId]?.reports ?? 0);
  const season = useStore((s) => s.season);
  const quality = useStore((s) => s.quality);
  const signTitle = useStore((s) => {
    const r = s.rooms[roomId];
    return r ? r.project || r.title : '';
  });
  const directorKey = useStore((s) => {
    for (const p of Object.values(s.people)) if (p.sessionId === roomId && p.role === 'director') return p.key;
    return null;
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
  // (a room has two cats at the most, and almost never more than one, see catCount in world/layout.ts)
  const catTotal = Math.min(MAX_CATS, layout.catCount);
  const { stage, cap } = useBuildStage(personKeys.length, catTotal, active);
  const built = useRef(false);
  built.current = stage >= BUILD_STAGES;
  const done = stage >= cap;
  useEffect(() => {
    if (done) return;
    frame.building++;
    if (!active) frame.aheadBuilding++;
    return () => {
      frame.building--;
      if (!active) frame.aheadBuilding--;
    };
  }, [done, active]);

  // A room the camera does not see is neither drawn nor walked by three (FrameSync has already decided which
  // rooms are on screen). It is brought up to date in the frame it comes back, before that frame is drawn.
  const group = useRef<THREE.Group>(null);
  // "ready": the static bake ran in the mount commit; two drawn frames later the room counts as loaded (staged loading waits for it)
  const framesSeen = useRef(0);
  useEffect(() => {
    frame.mountedRooms.add(roomId);
    return () => {
      frame.mountedRooms.delete(roomId);
      frame.readyRooms.delete(roomId);
    };
  }, [roomId]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (built.current && framesSeen.current < 2 && ++framesSeen.current === 2) {
      frame.readyRooms.add(roomId);
    }
    const on = frame.visibleRooms.has(roomId);
    if (g.visible === on) return;
    g.visible = on;
    walkMatrices(g, on);
    frame.shadowDirty = true;
  });

  if (!exists) return null;
  const origin = roomOrigin(index);

  return (
    <group ref={group} position={origin}>
      <RoomStatic roomId={roomId} layout={layout} signTitle={signTitle} season={season} stage={stage} />

      {/* movable furniture */}
      {stage >= STAGE.chairs && layout.desks.map((d) => (
        <Chair key={d.index} x={d.seat.x} z={d.seat.z} rot={d.rot} turn={d.chairTurn} color={d.chairColor} roomId={roomId} deskIndex={d.index} seed={d.index} />
      ))}
      {stage >= STAGE.director ? (
        <StaticBake key={Math.min(reports, 12)}>
          <DirectorDesk layout={layout} reports={reports} roomId={roomId} />
        </StaticBake>
      ) : null}
      {stage >= STAGE.director ? <Chair x={layout.director.seat.x} z={layout.director.seat.z} rot={0} turn={0} color={shade(theme.accent2, -0.05)} roomId={roomId} deskIndex={-1} big seed={99} /> : null}

      {stage >= STAGE.chairs && layout.restroom ? <RestroomWalls roomId={roomId} layout={layout} rr={layout.restroom} /> : null}
      {stage >= STAGE.toys ? <CatToys roomId={roomId} layout={layout} /> : null}
      {stage >= STAGE.movables ? <MovableProps roomId={roomId} layout={layout} /> : null}
      {stage >= STAGE.movables ? <LateProps roomId={roomId} layout={layout} /> : null}

      {/* the office cats */}
      {Array.from({ length: catTotal }, (_, i) => (
        stage >= STAGE.cats + Math.min(i, 3) ? <CatView key={i} catKey={`${roomId}::cat${i}`} roomId={roomId} layout={layout} seed={seed + i * 977} /> : null
      ))}

      {stage >= STAGE.board ? <PropHits roomId={roomId} layout={layout} /> : null}
      {stage >= STAGE.board ? <Radio roomId={roomId} layout={layout} /> : null}
      {active && stage >= STAGE.party ? <CelebrationFx roomId={roomId} layout={layout} /> : null}
      {stage >= STAGE.light ? <RoomLightFx layout={layout} roomId={roomId} halos={quality !== 'low'} dust={quality !== 'low'} /> : null}

      {/* people */}
      {/* (everybody is there, also in a room that is only loaded ahead: standing still until the room is the one on screen) */}
      {personKeys.map((k, i) => {
        const boss = k === directorKey;
        const here = boss ? stage >= STAGE.people - 1 : stage >= STAGE.people + Math.min(i, 7);
        return here ? <PersonActor key={k} personKey={k} roomId={roomId} layout={layout} frozen={!active} /> : null;
      })}
    </group>
  );
});
