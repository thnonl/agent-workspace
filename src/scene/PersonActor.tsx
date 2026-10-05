import { useEffect, useMemo, useRef } from 'react';
import { usePointerCursor } from './hover';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import { makeAppearance } from '../world/appearance';
import { onDirectorDesk, rot2 } from '../world/layout';
import type { RoomLayout } from '../world/layout';
import { Actor, laptopDist, SEAT_LIFT, type ActorCtx, type Pose } from '../sim/actor';
import { anchors, catsInRoom, enqueueSpeech, lastSpeech, queueLength, runtimeFor, sims, simsInRoom, view, type SimState } from '../sim/registry';
import { CALM_STEP, frame, roomStep, stepDt } from '../sim/frame';
import { buildCharacter, buildHeadphones, RIG_SCALE, type Rig } from './character';
import { burst } from '../sim/celebrate';
import { walkMatrices } from './matrixWalk';
import { buildLaptop } from './laptop';
import { disposeOwned } from './bake';
import { buildHeldItems, PHONE_GLOWS, PLUSH_MATS } from './heldItems';
import { buildDumbbells } from './dumbbells';
import { G } from './kit';
import { DESK_TOP } from './furniture';
import { sfx } from '../audio';
import { blobGeometry, FX, initFx } from './fx';
import { litMaterial, screenLitMaterial } from './twin';
import { env } from '../env';

/** a person who has been in the office this long is not shown walking in when their room is built */
const WARM_AFTER_MS = 6000;
/** the things that can be on a laptop screen besides the code */
const SCREEN_MODES = ['video', 'game', 'call', 'shop'] as const;

const qHand = new THREE.Quaternion();
const qRoot = new THREE.Quaternion();
const qRel = new THREE.Quaternion();
const qTilt = new THREE.Quaternion();
const tiltAxis = new THREE.Vector3(1, 0, 0);
const vTmp = new THREE.Vector3();
const vDrop = new THREE.Vector3();
// scratch objects for the per-frame prop maths (nothing is allocated inside the frame loop)
const vBagTop = new THREE.Vector3();
const vHands = new THREE.Vector3();
const vDesk = new THREE.Vector3();
const vHeld = new THREE.Vector3();
const vPile = new THREE.Vector3();
const roomXZ = { x: 0, z: 0 };
/** the glow a laptop / phone screen throws on the person using it after dark (colour × strength at full night, see screenLitMaterial) */
const LAPTOP_GLOW = new THREE.Color('#9fc2ff').multiplyScalar(1.7);
const PHONE_GLOW = new THREE.Color('#b8d4ff').multiplyScalar(1.2);
/** the screen of an open laptop, in the frame of its lid (the lid hangs from the hinge towards -z) */
const LID_SCREEN = new THREE.Vector3(0, -0.03, -0.14);

/** Character-local offset (lx, lz) turned into room space. The result is shared: read it right away. */
function toRoom(sim: SimState, lx: number, lz: number) {
  const sn = Math.sin(sim.yaw);
  const cs = Math.cos(sim.yaw);
  roomXZ.x = sim.x + lx * cs + lz * sn;
  roomXZ.z = sim.z - lx * sn + lz * cs;
  return roomXZ;
}

/** Where the HTML speech bubble of this character is anchored (world space, above the head). */
function syncAnchor(key: string, outer: THREE.Group | null, wp: THREE.Vector3, sim: SimState, scale: number) {
  if (!outer) return;
  outer.getWorldPosition(wp);
  let a = anchors.get(key);
  if (!a) anchors.set(key, (a = { x: 0, y: 0, z: 0, live: false }));
  a.x = wp.x + sim.x;
  a.y = 2.12 * scale;
  a.z = wp.z + sim.z;
  a.live = sim.onStage && sim.phase !== 'waiting';
}
/** nobody speaks in a room that is only loaded ahead */
function hideAnchor(key: string) {
  const a = anchors.get(key);
  if (a) a.live = false;
}
const SETTLE_PASSES = 3;
const vBagHand = new THREE.Vector3();
const k = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
/** damping factors of applyPose: the same six rates for every person, so they are computed once per distinct dt */
const dk = { dt: -1, r24: 0, r18: 0, r30: 0, r8: 0, r12: 0 };
function dampFactors(dt: number) {
  if (dk.dt !== dt) {
    dk.dt = dt;
    dk.r24 = k(24, dt);
    dk.r18 = k(18, dt);
    dk.r30 = k(30, dt);
    dk.r8 = k(8, dt);
    dk.r12 = k(12, dt);
  }
  return dk;
}
const ease = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

function applyPose(rig: Rig, p: Pose, dt: number, eyeOpen: number, clock: number, walking: boolean, glance: number) {
  const f = dampFactors(dt);
  rig.pelvis.position.y = rig.pelvis.position.y + (p.bob - rig.pelvis.position.y) * f.r24;
  rig.torso.rotation.x = rig.torso.rotation.x + (p.lean - rig.torso.rotation.x) * f.r18;
  rig.torso.rotation.y = rig.torso.rotation.y + (p.twist - rig.torso.rotation.y) * f.r18;
  rig.torso.rotation.z = rig.torso.rotation.z + (p.roll - rig.torso.rotation.z) * f.r18;
  rig.head.rotation.x = rig.head.rotation.x + (p.headX - rig.head.rotation.x) * f.r18;
  rig.head.rotation.y = rig.head.rotation.y + (p.headY + glance - rig.head.rotation.y) * f.r18;
  rig.head.rotation.z = rig.head.rotation.z + (p.headZ - rig.head.rotation.z) * f.r18;
  rig.armL.rotation.x = rig.armL.rotation.x + (p.armLx - rig.armL.rotation.x) * f.r18;
  rig.armR.rotation.x = rig.armR.rotation.x + (p.armRx - rig.armR.rotation.x) * f.r18;
  rig.armL.rotation.z = rig.armL.rotation.z + (-p.armLz - rig.armL.rotation.z) * f.r18;
  rig.armR.rotation.z = rig.armR.rotation.z + (p.armRz - rig.armR.rotation.z) * f.r18;
  rig.foreL.rotation.x = rig.foreL.rotation.x + (p.foreLx - rig.foreL.rotation.x) * f.r24;
  rig.foreR.rotation.x = rig.foreR.rotation.x + (p.foreRx - rig.foreR.rotation.x) * f.r24;
  rig.thighL.rotation.x = rig.thighL.rotation.x + (p.thighLx - rig.thighL.rotation.x) * f.r18;
  rig.thighR.rotation.x = rig.thighR.rotation.x + (p.thighRx - rig.thighR.rotation.x) * f.r18;
  rig.kneeL.rotation.x = rig.kneeL.rotation.x + (p.kneeLx - rig.kneeL.rotation.x) * f.r18;
  rig.kneeR.rotation.x = rig.kneeR.rotation.x + (p.kneeRx - rig.kneeR.rotation.x) * f.r18;
  // face
  const squint = 1 - 0.68 * p.happy;
  const open = Math.max(0.08, eyeOpen * (1 - p.sleep)) * squint;
  rig.eyeL.scale.y = rig.eyeL.scale.y + (open - rig.eyeL.scale.y) * f.r30;
  rig.eyeR.scale.y = rig.eyeR.scale.y + (open - rig.eyeR.scale.y) * f.r30;
  rig.eyes.position.y = rig.eyes.position.y + (0.035 * p.lookUp - rig.eyes.position.y) * f.r8;
  rig.browL.position.y = rig.browL.position.y + (0.115 + 0.03 * p.happy + 0.02 * p.lookUp - rig.browL.position.y) * f.r12;
  rig.browR.position.y = rig.browL.position.y;
  const showO = p.mouth === 'o';
  rig.mouthO.visible = showO;
  rig.mouthSmile.visible = !showO;
  rig.mouthSmile.rotation.z = p.mouth === 'sad' ? 0 : Math.PI;
  rig.mouthSmile.position.y = p.mouth === 'sad' ? -0.165 : -0.135;
  rig.mouthSmile.scale.setScalar(1 + p.happy * 0.25);
  if (rig.tail) {
    rig.tail.rotation.x = Math.sin(clock * 2.2) * 0.06 + (walking ? Math.sin(clock * 9) * 0.12 : 0);
    rig.tail.rotation.z = Math.sin(clock * 1.7) * 0.05;
  }
  rig.ears.forEach((e, i) => (e.rotation.x = Math.sin(clock * 1.5 + i) * 0.05 + (walking ? -0.12 : 0)));
}

interface Props {
  personKey: string;
  roomId: string;
  layout: RoomLayout;
  /** the room is only loaded ahead (not the one on screen): the person sits at their desk and does not move at all until it is */
  frozen?: boolean;
}

export function PersonActor({ personKey, roomId, layout, frozen: frozenProp = false }: Props) {
  initFx();
  const frozenAtStart = useRef(frozenProp);
  const seed = useStore((s) => s.people[personKey]?.seed ?? 0);
  const role = useStore((s) => s.people[personKey]?.role ?? 'staff');
  const desk = useStore((s) => s.people[personKey]?.desk ?? -1);
  const selected = useStore((s) => s.selectedKey === personKey);
  const isDirector = role === 'director';

  const app = useMemo(() => makeAppearance(seed, { director: isDirector }), [seed, isDirector]);
  const rig = useMemo(() => buildCharacter(app), [app]);
  // (the laptop model follows the person's seed: everybody keeps their own)
  const laptop = useMemo(() => buildLaptop(layout.theme.accent, layout.theme.accent3, seed), [layout.theme, seed]);
  const actor = useMemo(() => {
    const a = new Actor(personKey, roomId, isDirector, layout, desk, app.scale);
    // somebody who walked in a while ago (the room was out of the scene meanwhile) is at their desk already; a new arrival walks in
    const p = useStore.getState().people[personKey];
    a.warm = !!p && p.present && !p.leaveAt && (frozenAtStart.current || Date.now() - p.joinedAt > WARM_AFTER_MS);
    return a;
  }, [personKey, roomId, isDirector, layout, desk, app.scale]);
  const scale = RIG_SCALE * app.scale;
  const items = useMemo(() => {
    const it = buildHeldItems(layout.theme.accent);
    rig.handHold.add(it.cup, it.book, it.can, it.bowl, it.parcel, it.pot, it.cig, it.phone, it.pad, it.paddle, it.plush, it.vrR);
    rig.handHoldL.add(it.vrL);
    rig.head.add(it.vrHead);
    return it;
  }, [rig, layout.theme]);
  const bells = useMemo(() => {
    const b = buildDumbbells(layout.theme.accent2);
    rig.handHold.add(b.right);
    rig.handHoldL.add(b.left);
    return b;
  }, [rig, layout.theme]);

  // headphones for the music at the desk (somebody who wears a pair all day only bobs along)
  const phones = useMemo(() => {
    if (app.accessory === 'headphones') return null;
    const g = buildHeadphones(app.accessoryColor);
    g.visible = false;
    rig.head.add(g);
    return g;
  }, [rig, app]);
  // the person's own copy of the lit material, so the screen in front of them can light them up after dark
  const screenLight = useMemo(() => {
    const { mat, light } = screenLitMaterial();
    /** the screen, in world space (turned into view space right before the person is drawn) */
    const at = new THREE.Vector3();
    const shared = litMaterial(true);
    rig.root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh || m.material !== shared) return;
      m.material = mat;
      m.onBeforeRender = (_r, _s, camera) => {
        light.pos.value.copy(at).applyMatrix4(camera.matrixWorldInverse);
      };
    });
    return { mat, light, at, k: 0, glow: LAPTOP_GLOW };
  }, [rig]);
  useEffect(() => () => screenLight.mat.dispose(), [screenLight]);
  const noteAt = useRef(0);
  const ring = useRef<THREE.Mesh>(null);
  const blob = useRef<THREE.Mesh>(null);
  /** the person sat still at the last update: the next one may wait (CALM_STEP) */
  const calm = useRef(false);
  const outer = useRef<THREE.Group>(null);
  const clockRef = useRef(0);
  const ctx = useRef<ActorCtx | null>(null);
  /** time collected since the last update (rooms that are not the active one only step every BACKGROUND_STEP / HIDDEN_STEP) */
  const pending = useRef(0);
  /** passes made over the person since the room stopped being the active one (a few are needed to set the pose; then nothing moves) */
  const settleN = useRef(0);
  /** the person has been animated live (so the rig shows a pose already: stopping them needs no settling) */
  const liveBefore = useRef(false);
  const enteredOnce = useRef(false);
  /** frames the person has stood stopped, and whether their matrices are no longer worked out (a stopped person has none to change) */
  const stoppedFor = useRef(0);
  const matsOff = useRef(false);
  /** the person has been drawn in their pose since the room stopped being the active one */
  const posed = useRef(false);
  const workersAt = useRef(-1);
  const keyT = useRef(0);
  const wp = useMemo(() => new THREE.Vector3(), []);


  useEffect(() => {
    sims.set(personKey, actor.sim);
    return () => {
      sims.delete(personKey);
      anchors.delete(personKey);
    };
  }, [personKey, actor]);

  // R3F does not dispose <primitive>: free the merged geometry this person owns
  useEffect(() => () => disposeOwned(rig.root, rig.bag, rig.folder, laptop.root), [rig, laptop]);

  useEffect(() => {
    rig.root.scale.setScalar(scale);
    rig.root.traverse((o) => {
      (o as THREE.Mesh).userData.personKey = personKey;
    });
  }, [rig, scale, personKey]);

  useFrame((_, rawDt) => {
    const visible = frame.visibleRooms.has(roomId);
    // (also the room on screen stands still while a room is being switched to, see frame.settling)
    const frozen = frozenProp || frame.settling || roomId !== frame.activeId;
    // a room that is not the one on screen stands still: the person is posed as they are, then nothing changes until the room is active
    if (frozen) {
      pending.current = 0;
      if (liveBefore.current) {
        // stopped in the middle of what they were doing: the rig keeps the pose it has
        settleN.current = SETTLE_PASSES;
        posed.current = true;
      }
      if (settleN.current >= SETTLE_PASSES && (posed.current || !visible)) {
        hideAnchor(personKey);
        // (a few frames after they stopped, the skeleton, the bag and the laptop are left alone until the person moves again)
        if (!matsOff.current && visible && ++stoppedFor.current > 3) {
          matsOff.current = true;
          walkMatrices(rig.root, false);
          walkMatrices(rig.bag, false);
          walkMatrices(laptop.root, false);
          walkMatrices(rig.folder, false);
        }
        return;
      }
      settleN.current++;
    } else {
      settleN.current = 0;
      posed.current = false;
      liveBefore.current = true;
      stoppedFor.current = 0;
      if (matsOff.current) {
        matsOff.current = false;
        walkMatrices(rig.root, true);
        walkMatrices(rig.bag, true);
        walkMatrices(laptop.root, true);
        walkMatrices(rig.folder, true);
      }
    }
    let dt = 0;
    if (!frozen) {
      pending.current += rawDt;
      // somebody who sits still needs far fewer updates than somebody who walks or types (a followed person stays smooth)
      const step0 = roomStep(roomId);
      const step = calm.current && !selected ? Math.max(step0, CALM_STEP) : step0;
      if (pending.current < step) return;
      dt = stepDt(pending.current, step);
      pending.current = 0;
    }
    const st = useStore.getState();
    const person = st.people[personKey];
    if (!person) return;
    const rt = runtimeFor(roomId);
    const now = performance.now() / 1000;
    clockRef.current += dt;
    if (!ctx.current) {
      ctx.current = {
        layout, rt, person, task: null, now, lastSayAge: Infinity, lastKind: null, queueLen: 0, others: [], cats: [], workers: [], idlers: [],
        onReport: () => useStore.getState().reportTask(personKey),
        onRelease: () => useStore.getState().releaseTask(personKey),
        say: (text, icon) => enqueueSpeech(personKey, { kind: 'idle', text, tool: icon }, true),
        nameOf: (simKey) => useStore.getState().people[simKey]?.name ?? 'a colleague',
        onDoneSpeech: (text, isFailed) => enqueueSpeech(personKey, { kind: 'done', text: text.length > 150 ? `${text.slice(0, 149)}…` : text, tool: isFailed ? 'failed' : undefined }, true),
      };
    }
    const c = ctx.current;
    c.person = person;
    c.task = person.taskKey ? st.tasks[person.taskKey] ?? null : null;
    c.rt = rt;
    c.now = now;
    const said = lastSpeech(personKey);
    c.lastSayAge = said ? now - said.at : Infinity;
    c.lastKind = said?.kind ?? null;
    c.queueLen = queueLength(personKey);
    c.others = actor.sim.walking ? simsInRoom(roomId) : c.others;
    // people who have nothing to do look around for colleagues to watch and cats to pet
    const free = isDirector || !c.task;
    if (actor.sim.walking || free) c.cats = catsInRoom(roomId);
    if (free && now - workersAt.current > 0.25) {
      workersAt.current = now;
      const inRoom = simsInRoom(roomId);
      c.workers = inRoom.filter((x) => x.key !== personKey && x.busy && x.desk >= 0);
      c.idlers = inRoom.filter((x) => x.key !== personKey && x.onStage && x.phase === 'working' && !x.busy && x.desk >= 0 && !x.chatBy);
    }

    // (time stands still in a room that is not the active one, the pose is only settled)
    actor.update(dt, c);
    const sim = actor.sim;
    // the first time they stand inside the door they count for "in the office" (a person who has been hired may wait outside for a while)
    if (sim.onStage && !enteredOnce.current) {
      enteredOnce.current = true;
      useStore.getState().markInside(personKey);
    }
    sim.lively = sim.onStage && actor.deskMode !== null;
    sim.actKind = sim.phase === 'activity' || sim.phase === 'stroll' || sim.phase === 'standing' ? actor.actKind : undefined;
    sim.carrying = sim.actKind !== undefined && actor.carrying;
    sim.calm = (sim.phase === 'working' || sim.phase === 'waiting') && !sim.walking && actor.typing < 0.2 && rt.cheerUntil < now;
    calm.current = !!sim.calm;
    // a celebration (run finished, commit, push): arms up, big smile, a little hop
    const cheer = rt.cheerUntil - now;
    if (cheer > 0 && sim.onStage && !sim.walking && sim.phase !== 'waiting') {
      const p = actor.pose;
      const w = Math.min(1, cheer * 2);
      const c2 = clockRef.current * 9;
      p.armLx = -2.75 + Math.sin(c2) * 0.3 * w;
      p.armRx = -2.75 + Math.cos(c2) * 0.3 * w;
      p.armLz = p.armRz = 0.3;
      p.foreLx = p.foreRx = -0.25;
      p.happy = 1;
      p.mouth = 'o';
      p.headX = -0.15;
      p.lookUp = 1;
      if (sim.phase !== 'working' && sim.phase !== 'sitting' && sim.phase !== 'unpacking') p.bob += Math.abs(Math.sin(c2 * 0.8)) * 0.1 * w;
      actor.typing = 0;
    }
    if (isDirector) {
      rt.directorSeated = sim.phase === 'working' || sim.phase === 'unpacking';
      rt.directorKey = personKey;
    }
    if (!visible) {
      // off screen: the story goes on (tasks, hand-overs, bubbles) but nobody needs to be posed
      syncAnchor(personKey, outer.current, wp, actor.sim, scale);
      if (frozen) hideAnchor(personKey);
      return;
    }

    // soft key clicks while somebody types (only the room on screen is heard)
    if (!frozen && actor.typing > 0.5) {
      keyT.current -= dt;
      if (keyT.current <= 0) {
        keyT.current = 0.14 + Math.random() * 0.26;
        sfx('key', roomId);
      }
    }

    // ---- character transform
    const root = rig.root;
    root.visible = sim.onStage;
    const ph = sim.phase;
    const atDesk = ph === 'working' || ph === 'sitting' || ph === 'unpacking' || ph === 'packing' || ph === 'standing';
    const lift = sim.y + (atDesk ? SEAT_LIFT * sim.sitT : 0);
    root.position.set(sim.x, lift, sim.z);
    // soft shadow: stays on the floor while the body is lifted (seat cushion, chair)
    if (blob.current) blob.current.position.y = (0.032 - lift) / scale;
    root.rotation.y = sim.yaw;
    // seated / talking characters glance towards the viewer so their cute faces stay visible
    let glance = 0;
    if (view.camera && !sim.walking && sim.phase !== 'waiting') {
      const cp = view.camera.position;
      outer.current?.getWorldPosition(wp);
      const toCam = Math.atan2(cp.x - (wp.x + sim.x), cp.z - (wp.z + sim.z));
      let d = (toCam - sim.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      // (not while the eyes are on a game)
      glance = Math.max(-0.7, Math.min(0.7, d * 0.55)) * (1 - 0.9 * actor.focus);
    }
    // a bag carried by the hand: that arm hardly swings (the hand holds the handle); the bag follows the hand, see below
    const handBag = !!rig.bagCarry.byHand;
    const holding = handBag ? 1 - ease(actor.bagT) : 0;
    if (holding > 0.01 && sim.onStage) {
      const hp = actor.pose;
      hp.armRx += (0.12 - hp.armRx) * 0.85 * holding;
      hp.armRz += (0.16 - hp.armRz) * holding;
      hp.foreRx += (-0.1 - hp.foreRx) * holding;
    }
    applyPose(rig, actor.pose, frozen ? 10 : dt, actor.eyeOpen(), clockRef.current, sim.walking, glance);

    // ---- props (room space)
    const deskSlot = isDirector ? null : layout.desks[Math.max(0, sim.desk)];
    const seat = isDirector ? layout.director.seat : deskSlot?.seat ?? { x: 0, z: 0 };
    // (the director's desk turns with the side of the room it stands on: the laptop and the bag beside the chair turn with it)
    const seatRot = isDirector ? layout.director.rot : deskSlot?.rot ?? 0;
    const approachSide = isDirector ? layout.director.approachSide : deskSlot?.approachSide ?? -1;
    const laptopSpot = isDirector ? layout.director.laptop : layout.desks[Math.max(0, sim.desk)]?.laptop ?? { x: 0, z: 0 };
    const deskTop = isDirector ? DESK_TOP + 0.02 : DESK_TOP;

    // bag: carried (on the back, across the body, on the chest or in the hand) → floor beside the chair
    const bag = rig.bag;
    const carry = rig.bagCarry;
    // the bag is set down on the side opposite to where the worker came from
    const lat = rot2(1, 0, seatRot);
    const side = -approachSide;
    const floor = { x: seat.x + lat.x * side * 0.62, z: seat.z + lat.z * side * 0.62 };
    const bp = toRoom(sim, carry.x * scale, carry.z * scale);
    const bx = bp.x;
    const bz = bp.z;
    const bt = ease(actor.bagT);
    bag.visible = sim.onStage;
    bag.position.set(
      bx + (floor.x - bx) * bt,
      (carry.y * scale + (carry.floorY - carry.y * scale) * bt) + Math.sin(bt * Math.PI) * 0.35,
      bz + (floor.z - bz) * bt,
    );
    // carried: turns with the body; set down: lies at a fixed angle beside the desk (it must not spin while the owner turns or walks about)
    const carryYaw = sim.yaw + carry.yaw;
    let toFloor = (seatRot + 0.4 * side - carryYaw) % (Math.PI * 2);
    if (toFloor > Math.PI) toFloor -= Math.PI * 2;
    else if (toFloor < -Math.PI) toFloor += Math.PI * 2;
    bag.rotation.set(bt * 0.15, carryYaw + toFloor * bt, 0);
    bag.scale.setScalar(scale * carry.scale);
    rig.bagStraps.visible = sim.onStage && bt < 0.4;
    // a bag in the hand hangs from the hand wherever it goes (a case on wheels only follows it sideways)
    if (handBag && bt < 0.4 && sim.onStage && outer.current) {
      rig.root.updateMatrixWorld(true);
      rig.handHold.getWorldPosition(vBagHand);
      outer.current.worldToLocal(vBagHand);
      const k = 1 - Math.min(1, bt * 2.5);
      if (carry.pulled) {
        // the grip of the handle is a little behind the case (bag space), under the hand
        const gz = -0.06 * scale;
        const cy = Math.cos(carryYaw);
        const sy = Math.sin(carryYaw);
        const gx = gz * sy;
        const gzz = gz * cy;
        bag.position.x += (vBagHand.x - gx - bag.position.x) * k;
        bag.position.z += (vBagHand.z - gzz - bag.position.z) * k;
      } else {
        bag.position.x += (vBagHand.x - bag.position.x) * k;
        bag.position.z += (vBagHand.z - bag.position.z) * k;
        bag.position.y += (vBagHand.y - 0.19 * scale - bag.position.y) * k;
      }
    }

    // laptop
    const lp = actor.lapP;
    laptop.root.visible = lp > 0.001 && sim.onStage;
    if (laptop.root.visible) {
      const bagTop = vBagTop.set(floor.x, 0.5, floor.z);
      const hp = toRoom(sim, 0, 0.42 * scale);
      const hands = vHands.set(hp.x, DESK_TOP + 0.24, hp.z);
      // the laptop sits within reach of the typist (the layout puts it further into the desk than short arms reach)
      const lx = seat.x - laptopSpot.x;
      const lz = seat.z - laptopSpot.z;
      const ld = Math.hypot(lx, lz) || 1;
      const lk = Math.max(0, ld - laptopDist(isDirector)) / ld;
      const desk = vDesk.set(laptopSpot.x + lx * lk, deskTop, laptopSpot.z + lz * lk);
      const pos = laptop.root.position;
      let sc = 1;
      if (lp < 1) {
        pos.lerpVectors(bagTop, hands, ease(lp));
        sc = 0.3 + 0.7 * ease(lp * 1.4);
      } else if (lp < 2) {
        pos.lerpVectors(hands, desk, ease(lp - 1));
        pos.y += Math.sin((lp - 1) * Math.PI) * 0.18;
      } else pos.copy(desk);
      laptop.root.scale.setScalar(sc * 1.08);
      // held in front of the body while it is carried, then turned to face the seated worker
      let ly = seatRot;
      if (lp < 1) ly = sim.yaw;
      else if (lp < 2) {
        let d = (seatRot - sim.yaw) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        ly = sim.yaw + d * ease(lp - 1);
      }
      laptop.root.rotation.set(0, ly, 0);
      laptop.lid.rotation.x = actor.lid * 1.85;
      // screen lines "type" themselves – or a video plays
      const clock = clockRef.current;
      const mode = actor.deskMode;
      let onScreen = false;
      for (const k of SCREEN_MODES) {
        const here = mode === k;
        laptop.screens[k].visible = here;
        onScreen ||= here;
      }
      if (mode === 'video') {
        const bar = 0.02 + ((clock * 0.04) % 1) * 0.3;
        laptop.videoBar.scale.x = bar;
        laptop.videoBar.position.x = -0.1 + bar / 2;
      } else if (mode === 'game') {
        laptop.gameBlocks.forEach((b, i) => {
          b.position.x = Math.sin(clock * (1.6 + i * 0.7) + i * 2) * 0.12;
          b.position.z = -0.14 + (((clock * (0.25 + 0.1 * i) + i * 0.37) % 1) - 0.5) * 0.16;
        });
      } else if (mode === 'call') {
        laptop.callRings.forEach((r, i) => r.scale.setScalar(1 + (Math.sin(clock * (5 + i * 2)) * 0.5 + 0.5) * 0.12));
      }
      laptop.lines.forEach((l, i) => {
        l.visible = !onScreen;
        const len = actor.typing > 0.05 ? 0.06 + (0.5 + 0.5 * Math.sin(clock * (4 + i) + i * 2.3)) * 0.22 : 0.08;
        l.scale.x = len;
        l.position.x = -0.16 + len / 2;
      });
      const pulse = 0.85 + Math.sin(clock * 6) * 0.15 * actor.typing;
      laptop.logo.scale.setScalar(pulse);
      laptop.sparks.forEach((s, i) => {
        s.visible = actor.typing > 0.5 && actor.lid > 0.9;
        if (!s.visible) return;
        const ph = (clock * 0.7 + i / laptop.sparks.length) % 1;
        s.position.set(Math.sin(i * 2.1 + clock) * 0.14, 0.22 + ph * 0.55, 0.14 + ph * 0.05);
        s.scale.setScalar(Math.sin(ph * Math.PI) * 1.1);
        s.rotation.z = ph * 4 + i;
      });
    }

    // music at the desk: the headphones are on, and a note floats up now and then
    if (phones) phones.visible = actor.deskMode === 'music' && sim.onStage;
    if (!frozen && actor.deskMode === 'music' && sim.onStage && now - noteAt.current > 1.6) {
      noteAt.current = now;
      const hp = toRoom(sim, 0, 0.1);
      burst(roomId, 'notes', [hp.x, 1.3, hp.z]);
    }

    // folder handed to the director
    const f = rig.folder;
    f.visible = actor.folderP >= 1 && actor.folderP < 3 && sim.onStage;
    if (f.visible) {
      const fp = toRoom(sim, 0, 0.55 * scale);
      const held = vHeld.set(fp.x, 0.78 * scale + 0.1, fp.z);
      const pileAt = onDirectorDesk(layout, 0.95, 0.1);
      const pile = vPile.set(pileAt.x, DESK_TOP + 0.12, pileAt.z);
      if (actor.folderP === 1) f.position.copy(held);
      else {
        const fe = ease((actor.folderT - 1) / 0.55);
        f.position.lerpVectors(held, pile, fe);
        f.position.y += Math.sin(fe * Math.PI) * 0.25;
      }
      f.rotation.set(0, sim.yaw, 0);
    }

    // things in the hand (cup, book, watering can) stay upright in the hand's frame; water effects
    const held = sim.onStage ? actor.held : 'none';
    items.cup.visible = held === 'cup';
    items.book.visible = held === 'book';
    items.can.visible = held === 'can';
    items.bowl.visible = held === 'bowl';
    items.parcel.visible = held === 'parcel';
    items.pot.visible = held === 'pot';
    if (held === 'parcel') items.parcel.scale.setScalar(actor.heldScale);
    else if (held === 'pot') items.pot.scale.setScalar(actor.heldScale);
    items.cig.visible = held === 'cig';
    items.pad.visible = held === 'pad';
    items.paddle.visible = held === 'paddle';
    items.plush.visible = held === 'plush';
    if (held === 'plush') {
      const pm = PLUSH_MATS[actor.plush % PLUSH_MATS.length];
      for (const m of items.plushBody) m.material = pm;
    }
    items.vrHead.visible = items.vrR.visible = items.vrL.visible = held === 'vr';
    const phoneOn = held === 'phone';
    items.phone.visible = phoneOn;
    if (phoneOn) {
      // the glow flickers a little while scrolling
      items.phoneScreen.material = PHONE_GLOWS[Math.floor(clockRef.current * 2.6) % PHONE_GLOWS.length];
    }
    // dumbbells sit in both hands as they are (no upright correction needed)
    bells.right.visible = bells.left.visible = held === 'dumbbell';
    if (held !== 'none' && held !== 'dumbbell' && held !== 'vr') {
      rig.root.updateMatrixWorld(true);
      rig.handHold.getWorldQuaternion(qHand);
      rig.root.getWorldQuaternion(qRoot);
      qRel.copy(qHand).invert().multiply(qRoot);
      qTilt.setFromAxisAngle(tiltAxis, actor.heldTilt);
      const item = phoneOn ? items.phone : held === 'pad' ? items.pad : held === 'paddle' ? items.paddle : held === 'plush' ? items.plush : held === 'parcel' ? items.parcel : held === 'pot' ? items.pot : held === 'cig' ? items.cig : held === 'cup' ? items.cup : held === 'book' ? items.book : held === 'bowl' ? items.bowl : items.can;
      // (the controller sits between the two hands: to the left of the right one)
      const off = held === 'phone' ? vTmp.set(-0.03, 0.05, 0.05) : held === 'pad' ? vTmp.set(-0.09, 0.03, 0.05) : held === 'paddle' ? vTmp.set(0, 0.03, 0.02) : held === 'plush' ? vTmp.set(-0.1, 0.02, 0.08) : held === 'parcel' ? vTmp.set(-0.2, -0.02, 0.14) : held === 'pot' ? vTmp.set(-0.2, -0.02, 0.14) : held === 'cig' ? vTmp.set(0, 0.03, 0.02) : held === 'cup' ? vTmp.set(0, 0.07, 0.03) : held === 'book' ? vTmp.set(-0.13, 0.03, 0.06) : held === 'bowl' ? vTmp.set(0, 0.05, 0.06) : vTmp.set(0, -0.03, 0.1);
      item.position.copy(off).applyQuaternion(qRel);
      item.quaternion.copy(qRel).multiply(qTilt);
      if (held === 'book') {
        // closed: one block; open: two halves in a shallow V
        items.book.scale.x = 0.5 + 0.5 * actor.bookOpen;
        items.bookLeft.rotation.z = -0.28 * actor.bookOpen;
        items.bookRight.rotation.z = 0.28 * actor.bookOpen;
      }
    }
    // the screen they look at lights them up after dark: the open laptop they sit at, or the phone in the hand
    {
      const atLaptop = laptop.root.visible && actor.lapP >= 2 && actor.lid > 0.5 && Math.hypot(sim.x - seat.x, sim.z - seat.z) < 0.45;
      const sl = screenLight;
      const glow = phoneOn ? PHONE_GLOW : atLaptop ? LAPTOP_GLOW : null;
      if (glow) {
        sl.glow = glow;
        if (phoneOn) items.phoneScreen.getWorldPosition(sl.at);
        else sl.at.copy(LID_SCREEN).applyMatrix4(laptop.lid.matrixWorld);
      }
      // (fades in and out with the screen, and with the dark)
      sl.k += ((glow ? env.lamps : 0) - sl.k) * (1 - Math.exp(-4 * dt));
      if (sl.k < 0.003) sl.k = 0;
      sl.light.color.value.copy(sl.glow).multiplyScalar(sl.k);
    }
    // water from the tap of the sink
    const flow = sim.onStage && actor.tap ? actor.tapFlow : 0;
    items.stream.visible = flow > 0.05;
    if (items.stream.visible && actor.tap) {
      items.stream.position.set(actor.tap.x, 0.9, actor.tap.z);
      items.stream.scale.set(1, 0.85 + Math.sin(clockRef.current * 30) * 0.12, 1);
    }
    // steam over the pan while somebody cooks
    const steamOn = sim.onStage && actor.steamAt && actor.steam > 0.05;
    items.steam.forEach((p, i) => {
      p.visible = !!steamOn;
      if (!steamOn || !actor.steamAt) return;
      const ph = (clockRef.current * 0.55 + i / items.steam.length) % 1;
      p.position.set(actor.steamAt.x + Math.sin(i * 2.3 + clockRef.current * 1.4) * 0.05, 0.98 + ph * 0.6, actor.steamAt.z + Math.cos(i * 1.7 + clockRef.current) * 0.05);
      p.scale.setScalar(0.6 + ph * 1.3);
      (p.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * 0.5 * actor.steam;
    });
    // cigarette smoke: a few pooled puffs rise from the mouth while the exhale lasts
    const smokeOn = sim.onStage && actor.smoke > 0.03 && !!outer.current;
    if (smokeOn) {
      rig.mouthSmile.getWorldPosition(vDrop);
      outer.current!.worldToLocal(vDrop);
    }
    items.smoke.forEach((p, i) => {
      p.visible = smokeOn;
      if (!smokeOn) return;
      const ph = (clockRef.current * 0.45 + i / items.smoke.length) % 1;
      p.position.set(vDrop.x + Math.sin(sim.yaw) * ph * 0.18 + Math.sin(i * 2.3 + clockRef.current) * 0.04 * ph, vDrop.y + ph * 0.4, vDrop.z + Math.cos(sim.yaw) * ph * 0.18 + Math.cos(i * 1.7 + clockRef.current) * 0.04 * ph);
      p.scale.setScalar(0.35 + ph * 1.3);
      (p.material as THREE.MeshBasicMaterial).opacity = Math.sin(ph * Math.PI) * 0.45 * actor.smoke;
    });
    // ...and from the spout of the can
    const pouring = held === 'can' && actor.pour > 0.35;
    items.drops.forEach((d, i) => {
      d.visible = pouring;
      if (!pouring || !outer.current) return;
      const ph = (clockRef.current * 1.6 + i / items.drops.length) % 1;
      items.spout.getWorldPosition(vDrop);
      outer.current.worldToLocal(vDrop);
      d.position.set(vDrop.x + Math.sin(sim.yaw) * ph * 0.3, vDrop.y - ph * ph * Math.max(0.1, vDrop.y - 0.35), vDrop.z + Math.cos(sim.yaw) * ph * 0.3);
      d.scale.setScalar(1 - ph * 0.4);
    });

    // anchor for the HTML speech bubble
    syncAnchor(personKey, outer.current, wp, sim, scale);
    if (frozen) hideAnchor(personKey);

    posed.current = frozen;

    // selection ring
    if (ring.current) {
      ring.current.visible = selected && sim.onStage;
      ring.current.rotation.z = clockRef.current * 1.5;
    }
  });

  const pointer = usePointerCursor();
  const accent = isDirector ? '#ffb020' : layout.theme.accent;

  return (
    <group ref={outer} name={`actor-${personKey}`}>
      <primitive
        object={rig.root}
        {...pointer}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          useStore.getState().select(personKey);
        }}
      >
        <mesh ref={blob} geometry={blobGeometry()} material={FX.blob} position={[0, 0.032, 0]} scale={[1.05, 1, 1.05]} renderOrder={1} raycast={() => null} />
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false} geometry={G.torus(0.62, 0.05, Math.PI * 2, 6, 40)}>
          <meshBasicMaterial color={accent} transparent opacity={0.9} />
        </mesh>
      </primitive>
      <primitive object={rig.bag} />
      <primitive object={laptop.root} />
      <primitive object={rig.folder} />
      <primitive object={items.fx} />
    </group>
  );
}
