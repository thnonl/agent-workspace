import type { CatWindow, RoomLayout, Spot } from '../world/layout';
import type { V2 } from '../world/nav';
import { Rng } from '../util/rng';
import { sfx } from '../audio';
import { frame, SLOW_MAX_DT } from './frame';
import { kickToy, toyState } from './toys';
import { debugFlags, spotOwners, type CatSim, type SimState } from './registry';

/** Joint angles of one leg: upper (shoulder / hip), lower (elbow / knee), paw. Positive swings backwards. */
export interface LegPose {
  u: number;
  l: number;
  p: number;
}

/**
 * High level description of what the body does. The view turns it into bone rotations and adds the
 * cyclic parts (walk cycle, breathing, tail sway), so poses blend smoothly into each other.
 */
export interface CatPose {
  /** raise / lower the body (negative = crouch) */
  y: number;
  /** whole body pitch, positive = nose down */
  pitch: number;
  roll: number;
  /** +1 arched back … -1 hollow back */
  arch: number;
  /** 0-1 sideways C-curl of spine, neck and head */
  curl: number;
  curlDir: number;
  headX: number;
  headY: number;
  headZ: number;
  /** FL FR BL BR */
  legs: [LegPose, LegPose, LegPose, LegPose];
  /** positive = tail up */
  tailLift: number;
  tailCurl: number;
  tailWrap: number;
  tailSway: number;
  walk: number;
  gait: number;
  gaitAmp: number;
  eyes: number;
  earsBack: number;
  purr: number;
}

const leg = (u = 0, l = 0, p = 0): LegPose => ({ u, l, p });

export function neutralCatPose(): CatPose {
  return {
    y: 0, pitch: 0, roll: 0, arch: 0, curl: 0, curlDir: 1, headX: 0, headY: 0, headZ: 0,
    legs: [leg(), leg(), leg(), leg()],
    tailLift: 0, tailCurl: 0, tailWrap: 0, tailSway: 0.25, walk: 0, gait: 0, gaitAmp: 1, eyes: 1, earsBack: 0, purr: 0,
  };
}

/** restore a pose to `neutralCatPose()` in place (no allocation) */
export function resetCatPose(p: CatPose): CatPose {
  p.y = 0; p.pitch = 0; p.roll = 0; p.arch = 0; p.curl = 0; p.curlDir = 1; p.headX = 0; p.headY = 0; p.headZ = 0;
  for (let i = 0; i < 4; i++) {
    const l = p.legs[i];
    l.u = 0; l.l = 0; l.p = 0;
  }
  p.tailLift = 0; p.tailCurl = 0; p.tailWrap = 0; p.tailSway = 0.25; p.walk = 0; p.gait = 0; p.gaitAmp = 1; p.eyes = 1; p.earsBack = 0; p.purr = 0;
  return p;
}

export interface CatCtx {
  layout: RoomLayout;
  /** seconds (performance.now()/1000) */
  now: number;
  /** people in the room – cats keep out of their way */
  chars: readonly SimState[];
  /** all cats of the room */
  cats: readonly CatSim[];
  /** another room is being loaded: a cat on the move sits down for a moment */
  hold?: boolean;
}

type Phase =
  | 'away' | 'arrive' | 'jump' | 'idle' | 'wander' | 'sit' | 'groom' | 'stretch' | 'toSpot' | 'sleep' | 'toWindow' | 'exit'
  | 'toToy' | 'play' | 'toPost' | 'scratch';

/** what a cat does with a ball or a mouse: watch it, pounce on it, run after it when it rolls away */
type PlayStep = 'stalk' | 'pounce' | 'chase';

interface Jump {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  dur: number;
  h: number;
  next: Phase;
}

const smooth = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const angleDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
/** crouch before a jump */
const WINDUP = 0.24;

/**
 * Behaviour of one cat: hops in through a window, wanders, grooms, naps on the sofa / the director's
 * desk / a patch of sun, and eventually hops out of a window again.
 */
export class CatBrain {
  readonly sim: CatSim;
  readonly pose = neutralCatPose();
  /** scratch pose rebuilt every update */
  private readonly scratch = neutralCatPose();
  private phase: Phase = 'away';
  private t = 0;
  private timer = 0;
  private clock = 0;
  private gait = 0;
  private v = 0;
  private path: V2[] = [];
  private pi = 0;
  private speed = 0.8;
  private jump: Jump | null = null;
  private win: CatWindow | null = null;
  private lastWin = -1;
  private spotIdx = -1;
  private awake = 0;
  private stay = 0;
  private rng: Rng;
  private blink = 3;
  private facing = 0;
  private curlDir = 1;
  /** landing squash, counts down from 1 */
  private land = 0;
  /** index into layout.toys of the toy the cat is going to / playing with */
  private toy = -1;
  private step: PlayStep = 'stalk';
  private stepT = 0;
  private stalkFor = 1;
  private kicked = false;
  /** clock time of the next spontaneous meow, and this cat's voice pitch */
  private nextMeowAt = 0;
  private readonly voice: number;

  constructor(key: string, roomId: string, seed: number, layout: RoomLayout) {
    this.rng = new Rng(seed);
    this.voice = this.rng.range(0.85, 1.2);
    this.nextMeowAt = this.rng.range(20, 90);
    this.clock = this.rng.range(0, 10);
    this.curlDir = this.rng.chance(0.5) ? 1 : -1;
    this.sim = { key, roomId, x: 0, y: 0, z: 0, yaw: 0, phase: 'away', onStage: false, still: false, petUntil: 0, spot: -1 };
    // there is no cat in the room when it is opened: after a while one jumps in through an open window (each cat in its own time)
    void layout;
    this.timer = this.rng.range(25, 120);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.t = 0;
    this.sim.phase = p;
    this.sim.still = p === 'sit' || p === 'groom' || p === 'sleep' || p === 'idle';
  }

  private claim(i: number) {
    this.spotIdx = i;
    this.sim.spot = i;
    spotOwners.set(`${this.sim.roomId}#${i}`, this.sim.key);
  }

  private release() {
    if (this.spotIdx >= 0 && spotOwners.get(`${this.sim.roomId}#${this.spotIdx}`) === this.sim.key) spotOwners.delete(`${this.sim.roomId}#${this.spotIdx}`);
    this.spotIdx = -1;
    this.sim.spot = -1;
  }

  /** Give the spot back to the room but remember it, so `attach` can take it again (StrictMode re-runs effects). */
  dispose() {
    if (this.spotIdx >= 0 && spotOwners.get(`${this.sim.roomId}#${this.spotIdx}`) === this.sim.key) spotOwners.delete(`${this.sim.roomId}#${this.spotIdx}`);
  }

  attach() {
    if (this.spotIdx >= 0) spotOwners.set(`${this.sim.roomId}#${this.spotIdx}`, this.sim.key);
  }

  /**
   * Cats are polite: they shuffle out of the way of people walking by (and leave the spot if somebody
   * comes too close), and keep a little distance from each other. Napping and stroked cats stay put –
   * people walk around them instead.
   */
  private giveWay(dt: number, ctx: CatCtx, petted: boolean) {
    const s = this.sim;
    if (!s.onStage || s.y > 0.3 || petted) return;
    if (this.phase === 'jump' || this.phase === 'sleep' || this.phase === 'away' || this.phase === 'arrive' || this.phase === 'exit') return;
    const nav = ctx.layout.nav;
    const nudge = (dx: number, dz: number, d: number, reach: number, rate: number) => {
      const push = (reach - d) * rate * dt;
      const nx = s.x + (dx / d) * push;
      const nz = s.z + (dz / d) * push;
      if (!nav.isBlocked(nx, nz)) {
        s.x = nx;
        s.z = nz;
      }
    };
    for (const c of ctx.chars) {
      if (!c.onStage || c.sitT > 0.3 || c.y > 0.3) continue;
      const dx = s.x - c.x;
      const dz = s.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.001 || d > 0.6) continue;
      nudge(dx, dz, d, 0.6, 3);
      // still cats get up and trot away from somebody who walks right into them
      if (d < 0.45 && (this.phase === 'idle' || this.phase === 'sit' || this.phase === 'groom' || this.phase === 'stretch')) {
        const base = Math.atan2(dz, dx);
        for (let k = 0; k < 8; k++) {
          const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
          const to = { x: s.x + Math.cos(a) * 1.7, z: s.z + Math.sin(a) * 1.7 };
          if (nav.isBlocked(to.x, to.z)) continue;
          const path = nav.findPath({ x: s.x, z: s.z }, to);
          if (!path) continue;
          this.startPath(path, 1.5);
          this.setPhase('wander');
          break;
        }
      }
    }
    for (const o of ctx.cats) {
      if (o === s || !o.onStage || o.y > 0.3) continue;
      const dx = s.x - o.x;
      const dz = s.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && d < 0.4) nudge(dx, dz, d, 0.4, 1.6);
    }
  }

  private startPath(points: V2[], speed: number) {
    this.path = points;
    this.pi = 0;
    this.speed = speed;
  }

  /** Follow the path with smooth acceleration / braking and a gait that matches the ground speed. */
  private walk(dt: number): boolean {
    const s = this.sim;
    if (this.pi >= this.path.length) {
      this.v += (0 - this.v) * Math.min(1, dt * 8);
      return true;
    }
    const t = this.path[this.pi];
    const dx = t.x - s.x;
    const dz = t.z - s.z;
    const d = Math.hypot(dx, dz);
    let rem = d;
    for (let i = this.pi + 1; i < this.path.length; i++) rem += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].z - this.path[i - 1].z);
    const want = this.speed * (0.3 + 0.7 * smooth(rem / 0.45));
    this.v += (want - this.v) * Math.min(1, dt * 5);
    const step = this.v * dt;
    if (d <= Math.max(step, 0.004)) {
      s.x = t.x;
      s.z = t.z;
      this.pi++;
    } else {
      s.x += (dx / d) * step;
      s.z += (dz / d) * step;
      s.yaw += angleDiff(s.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 7);
    }
    this.gait += dt * this.v * 7.2;
    return this.pi >= this.path.length;
  }

  private startJump(to: { x: number; y: number; z: number }, dur: number, h: number, next: Phase) {
    const s = this.sim;
    this.jump = { x0: s.x, y0: s.y, z0: s.z, x1: to.x, y1: to.y, z1: to.z, dur, h, next };
    this.setPhase('jump');
  }

  /** a spot on the floor a stride away from the toy, on the side the cat comes from */
  private nearToy(st: { x: number; z: number }, layout: RoomLayout): V2 {
    const s = this.sim;
    const base = Math.atan2(s.z - st.z, s.x - st.x);
    for (let k = 0; k < 8; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6;
      const p = { x: st.x + Math.cos(a) * 0.55, z: st.z + Math.sin(a) * 0.55 };
      if (!layout.nav.isBlocked(p.x, p.z)) return p;
    }
    return { x: s.x, z: s.z };
  }

  private randomPoint(ctx: CatCtx): V2 | null {
    const { width: W, depth: D, nav } = ctx.layout;
    for (let i = 0; i < 40; i++) {
      const p = { x: this.rng.range(-W / 2 + 1, W / 2 - 1), z: this.rng.range(-D / 2 + 1, D / 2 - 1) };
      const d = Math.hypot(p.x - this.sim.x, p.z - this.sim.z);
      if (d > 1.5 && d < 8 && !nav.isBlocked(p.x, p.z)) return p;
    }
    return null;
  }

  /** a random usable window – not the one used last time, so the cats keep varying their route */
  private pickWindow(layout: RoomLayout): CatWindow {
    const all = layout.catWindows;
    const pool = all.length > 1 ? all.filter((w) => w.index !== this.lastWin) : all;
    const w = pool[Math.floor(Math.random() * pool.length)];
    this.lastWin = w.index;
    return w;
  }

  private decide(ctx: CatCtx) {
    const { layout } = ctx;
    const s = this.sim;
    if ((this.awake > this.stay || debugFlags.catLeave) && layout.catWindows.length) {
      // time to go out again
      this.release();
      this.win = this.pickWindow(layout);
      const path = layout.nav.findPath({ x: s.x, z: s.z }, this.win.land) ?? [this.win.land];
      this.startPath(path, 0.9);
      this.setPhase('toWindow');
      return;
    }
    const free = layout.spots.map((_, i) => i).filter((i) => layout.spots[i].kind !== 'toilet' && !layout.spots[i].off && !spotOwners.has(`${s.roomId}#${i}`));
    const movers = layout.toys.map((t, i) => (t.kind === 'yarn' || t.kind === 'mouse' ? i : -1)).filter((i) => i >= 0);
    const posts = layout.toys.map((t, i) => (t.kind === 'post' ? i : -1)).filter((i) => i >= 0);
    const pick = this.rng.weighted<'wander' | 'sit' | 'groom' | 'stretch' | 'nap' | 'trot' | 'play' | 'scratch'>([
      ['wander', 34], ['sit', 12], ['groom', 10], ['stretch', 7], ['nap', free.length ? (debugFlags.catSpot ? 500 : 26) : 0], ['trot', 7],
      ['play', movers.length ? (debugFlags.catToy === 'play' ? 500 : 15) : 0], ['scratch', posts.length ? (debugFlags.catToy === 'scratch' ? 500 : 7) : 0],
    ]);
    if (pick === 'play') {
      this.toy = this.rng.pick(movers);
      const st = toyState(s.roomId, layout, this.toy);
      const to = this.nearToy(st, layout);
      this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, to) ?? [to], 1.2);
      this.setPhase('toToy');
    } else if (pick === 'scratch') {
      this.toy = this.rng.pick(posts);
      const ap = layout.toys[this.toy].approach!;
      this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, ap) ?? [ap], 0.9);
      this.setPhase('toPost');
    } else if (pick === 'wander' || pick === 'trot') {
      const p = this.randomPoint(ctx);
      if (!p) return;
      this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, p) ?? [p], pick === 'trot' ? 1.7 : 0.7);
      this.setPhase('wander');
    } else if (pick === 'sit') {
      this.timer = this.rng.range(3, 9);
      this.facing = this.rng.chance(0.4) && layout.catWindows.length ? this.rng.pick(layout.catWindows).yaw + Math.PI : s.yaw + this.rng.range(-1.2, 1.2);
      this.setPhase('sit');
    } else if (pick === 'groom') {
      this.timer = this.rng.range(4, 9);
      this.facing = s.yaw;
      this.setPhase('groom');
    } else if (pick === 'stretch') {
      this.timer = 2.8;
      this.setPhase('stretch');
    } else {
      const wanted = debugFlags.catSpot ? free.filter((k) => layout.spots[k].kind === debugFlags.catSpot) : [];
      const i = wanted.length ? this.rng.pick(wanted) : this.rng.pick(free);
      this.claim(i);
      const spot = layout.spots[i];
      this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, spot.approach) ?? [spot.approach], 0.85);
      this.setPhase('toSpot');
    }
  }

  update(dt: number, ctx: CatCtx) {
    dt = Math.min(dt, SLOW_MAX_DT); // (see Actor.update)
    this.clock += dt;
    this.t += dt;
    this.land = Math.max(0, this.land - dt * 3.2);
    const s = this.sim;
    const p = resetCatPose(this.scratch);
    const petted = s.petUntil > ctx.now;
    if (ctx.hold && dt > 0 && s.onStage && (this.phase === 'wander' || this.phase === 'toSpot' || this.phase === 'toToy' || this.phase === 'toPost')) {
      // sits down on the spot, as if it had thought of something
      this.v = 0;
      this.facing = s.yaw;
      this.timer = this.rng.range(2.2, 3.2);
      this.setPhase('sit');
    }
    if (s.onStage && this.phase !== 'away') this.awake += dt;
    let moving = false;

    if (this.clock >= this.nextMeowAt) {
      this.nextMeowAt = this.clock + this.rng.range(35, 120);
      if (s.onStage && this.phase !== 'sleep' && this.phase !== 'away' && frame.visibleRooms.has(s.roomId)) sfx('meow', s.roomId, this.voice * this.rng.range(0.94, 1.08));
    }

    switch (this.phase) {
      case 'away': {
        s.onStage = false;
        this.timer -= debugFlags.catNow ? 1e3 : dt;
        if (this.timer <= 0 && ctx.layout.catWindows.length) {
          this.win = this.pickWindow(ctx.layout);
          s.x = this.win.out.x;
          s.z = this.win.out.z;
          s.y = this.win.sillY;
          s.yaw = this.win.yaw;
          s.onStage = true;
          this.awake = 0;
          this.stay = this.rng.range(70, 240);
          if (this.rng.chance(0.25)) this.nextMeowAt = this.clock + this.rng.range(2, 6);
          this.v = 0;
          this.startPath([this.win.sill], 0.9);
          this.setPhase('arrive');
        }
        break;
      }
      case 'arrive': {
        const done = this.walk(dt);
        moving = true;
        if (done && this.win) this.startJump({ x: this.win.land.x, y: 0, z: this.win.land.z }, 0.85, 0.32, 'idle');
        break;
      }
      case 'jump': {
        const j = this.jump!;
        this.v += (0 - this.v) * Math.min(1, dt * 8);
        const dx = j.x1 - j.x0;
        const dz = j.z1 - j.z0;
        if (Math.hypot(dx, dz) > 0.05) s.yaw += angleDiff(s.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
        if (this.t < WINDUP) {
          // gather up: crouch, front paws forward, weight back
          const w = smooth(this.t / WINDUP);
          p.y = -0.075 * w;
          p.pitch = 0.18 * w;
          p.legs = [leg(-0.5 * w, 0.9 * w, -0.3 * w), leg(-0.5 * w, 0.9 * w, -0.3 * w), leg(-0.9 * w, 1.5 * w, -0.6 * w), leg(-0.9 * w, 1.5 * w, -0.6 * w)];
          p.tailLift = -0.2;
          p.headX = -0.3 * w;
          p.earsBack = 0.3;
          break;
        }
        const u = Math.min(1, (this.t - WINDUP) / j.dur);
        const e = smooth(u);
        s.x = j.x0 + dx * e;
        s.z = j.z0 + dz * e;
        s.y = j.y0 + (j.y1 - j.y0) * e + Math.sin(Math.PI * u) * j.h;
        // fully stretched in the air: front legs reach, hind legs push, spine extends
        const air = Math.sin(Math.PI * Math.min(1, u * 1.05));
        const rise = j.y1 >= j.y0 ? 1 : 0.4;
        p.pitch = (u < 0.5 ? -0.5 * rise : 0.55) * air;
        p.arch = -0.35 * air;
        p.legs = [leg(-1.15 * air, 0.25 * air, -0.5 * air), leg(-1.15 * air, 0.25 * air, -0.5 * air), leg(0.85 * air, 0.15 * air, 0.8 * air), leg(0.85 * air, 0.15 * air, 0.8 * air)];
        p.tailLift = 0.1 + 0.2 * air;
        p.headX = (u < 0.5 ? -0.25 : 0.2) * air;
        p.earsBack = 0.5 * air;
        if (u >= 1) {
          s.x = j.x1;
          s.y = j.y1;
          s.z = j.z1;
          this.jump = null;
          this.land = 1;
          const next = j.next;
          this.setPhase(next);
          if (next === 'sleep') {
            this.timer = this.rng.range(20, 85);
            s.yaw = ctx.layout.spots[this.spotIdx]?.yaw + this.rng.range(-0.8, 0.8);
          } else if (next === 'idle') this.timer = this.rng.range(0.5, 2);
          else if (next === 'exit' && this.win) {
            this.v = 0;
            this.startPath([this.win.out], 1.0);
          }
        }
        break;
      }
      case 'idle': {
        idlePose(p, this.clock);
        this.timer -= dt;
        if (petted) this.timer = 0.5;
        else if (this.timer <= 0) this.decide(ctx);
        break;
      }
      case 'wander': {
        const done = this.walk(dt);
        moving = true;
        if (petted) this.setPhase('idle');
        else if (done && this.v < 0.12) {
          this.timer = this.rng.range(0.4, 2);
          this.setPhase('idle');
        }
        break;
      }
      case 'sit':
      case 'groom': {
        this.timer -= dt;
        s.yaw += angleDiff(s.yaw, this.facing) * Math.min(1, dt * 3);
        sitPose(p, this.clock, this.phase === 'groom');
        if (this.timer <= 0 && !petted) {
          this.timer = this.rng.range(0.4, 2);
          this.setPhase('idle');
        }
        break;
      }
      case 'stretch': {
        this.timer -= dt;
        stretchPose(p, Math.min(1, this.t / 2.8));
        if (this.timer <= 0) {
          this.timer = this.rng.range(0.4, 1.5);
          this.setPhase('idle');
        }
        break;
      }
      case 'toSpot': {
        const done = this.walk(dt);
        moving = true;
        const spot: Spot | undefined = ctx.layout.spots[this.spotIdx];
        if (done && this.v < 0.15 && spot) {
          s.yaw = Math.atan2(spot.x - s.x, spot.z - s.z);
          this.startJump({ x: spot.x, y: spot.y, z: spot.z }, 0.8, 0.28 + spot.y * 0.25, 'sleep');
        } else if (done && !spot) this.setPhase('idle');
        break;
      }
      case 'sleep': {
        this.timer -= dt;
        sleepPose(p, petted);
        if ((this.timer <= 0 || debugFlags.catLeave) && !petted && ctx.layout.spots[this.spotIdx]) {
          const spot = ctx.layout.spots[this.spotIdx];
          this.release();
          this.startJump({ x: spot.approach.x, y: 0, z: spot.approach.z }, 0.7, 0.25 + spot.y * 0.2, 'idle');
        }
        break;
      }
      case 'toWindow': {
        const done = this.walk(dt);
        moving = true;
        if (petted) this.setPhase('idle');
        else if (done && this.v < 0.15 && this.win) {
          s.yaw = this.win.yaw + Math.PI;
          this.startJump({ x: this.win.sill.x, y: this.win.sillY, z: this.win.sill.z }, 0.95, 0.55, 'exit');
        } else if (done && !this.win) this.setPhase('idle');
        break;
      }
      case 'toToy': {
        const done = this.walk(dt);
        moving = true;
        const st = toyState(s.roomId, ctx.layout, this.toy);
        if (petted) this.setPhase('idle');
        else if (done && this.v < 0.15) {
          // the toy has rolled on while the cat was on its way: go after it again
          if (Math.hypot(st.x - s.x, st.z - s.z) > 1.1) {
            const to = this.nearToy(st, ctx.layout);
            this.startPath(ctx.layout.nav.findPath({ x: s.x, z: s.z }, to) ?? [to], 1.4);
          } else {
            this.timer = this.rng.range(7, 16);
            this.step = 'stalk';
            this.stepT = 0;
            this.stalkFor = this.rng.range(0.7, 1.5);
            this.setPhase('play');
          }
        }
        break;
      }
      case 'play': {
        this.timer -= dt;
        this.stepT += dt;
        const st = toyState(s.roomId, ctx.layout, this.toy);
        const dx = st.x - s.x;
        const dz = st.z - s.z;
        const d = Math.hypot(dx, dz);
        const mouse = ctx.layout.toys[this.toy].kind === 'mouse';
        if (this.step === 'chase') {
          const done = this.walk(dt);
          moving = true;
          if (done || d < 0.55) {
            this.v *= 0.3;
            this.step = 'stalk';
            this.stepT = 0;
            this.stalkFor = this.rng.range(0.4, 1.1);
          }
        } else {
          if (d > 0.01) s.yaw += angleDiff(s.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 9);
          if (this.step === 'stalk') {
            stalkPose(p, this.clock, smooth(this.stepT / 0.3));
            if (d > 1.15) {
              const to = this.nearToy(st, ctx.layout);
              this.startPath(ctx.layout.nav.findPath({ x: s.x, z: s.z }, to) ?? [to], 1.7);
              this.step = 'chase';
            } else if (this.stepT >= this.stalkFor) {
              this.step = 'pounce';
              this.stepT = 0;
              this.kicked = false;
            }
          } else {
            const u = Math.min(1, this.stepT / 0.5);
            pouncePose(p, u);
            // lunge at the toy, hit it at the end of the reach
            if (!this.kicked && d > 0.3) {
              const nx = s.x + (dx / d) * 2.2 * dt;
              const nz = s.z + (dz / d) * 2.2 * dt;
              if (!ctx.layout.nav.isBlocked(nx, nz)) {
                s.x = nx;
                s.z = nz;
              }
            }
            if (!this.kicked && (u > 0.45 || d <= 0.3)) {
              this.kicked = true;
              const a = Math.atan2(dx, dz) + this.rng.range(-0.8, 0.8);
              kickToy(st, Math.sin(a), Math.cos(a), mouse ? this.rng.range(1.5, 2.8) : this.rng.range(1.0, 2.1), mouse);
            }
            if (u >= 1) {
              this.step = 'stalk';
              this.stepT = 0;
              this.stalkFor = this.rng.range(0.5, 1.4);
            }
          }
        }
        if (petted || (this.timer <= 0 && this.step === 'stalk')) {
          this.timer = this.rng.range(0.4, 1.5);
          this.setPhase('idle');
        }
        break;
      }
      case 'toPost': {
        const done = this.walk(dt);
        moving = true;
        const post = ctx.layout.toys[this.toy];
        if (petted) this.setPhase('idle');
        else if (done && this.v < 0.15 && post) {
          this.facing = Math.atan2(post.x - s.x, post.z - s.z);
          this.timer = this.rng.range(4, 8);
          this.setPhase('scratch');
        } else if (done && !post) this.setPhase('idle');
        break;
      }
      case 'scratch': {
        this.timer -= dt;
        s.yaw += angleDiff(s.yaw, this.facing) * Math.min(1, dt * 6);
        scratchPose(p, this.clock, smooth(this.t / 0.5) * smooth(this.timer / 0.5));
        if (this.timer <= 0 || petted) {
          this.timer = this.rng.range(0.5, 2);
          this.setPhase('idle');
        }
        break;
      }
      case 'exit': {
        const done = this.walk(dt);
        moving = true;
        if (done && this.v < 0.2) {
          s.onStage = false;
          this.win = null;
          this.timer = this.rng.range(45, 170);
          this.setPhase('away');
        }
        break;
      }
    }

    this.giveWay(dt, ctx, petted);
    if (!moving && this.phase !== 'jump') this.v += (0 - this.v) * Math.min(1, dt * 7);
    if (moving || this.v > 0.05) {
      const amp = Math.min(1.3, Math.max(0.55, this.v / 0.85));
      p.walk = clamp01(this.v / 0.45);
      p.gait = this.gait;
      p.gaitAmp = amp;
      if (moving) walkPose(p, this.speed);
    }
    // landing squash
    if (this.land > 0) {
      const l = this.land * this.land;
      p.y -= 0.045 * l;
      p.legs.forEach((lg) => (lg.l += 0.45 * l));
    }
    // blinking; ear flicks come from the view
    this.blink -= dt;
    if (this.blink < 0) this.blink = this.rng.range(2.5, 6);
    if (this.blink < 0.13 && this.phase !== 'sleep') p.eyes = Math.min(p.eyes, 0.05);
    if (s.petUntil > ctx.now && s.onStage) p.eyes = Math.min(p.eyes, this.phase === 'sleep' ? 0.05 : 0.22);
    p.curlDir = this.curlDir;
    // debug: hold a pose for inspection
    if (debugFlags.catPose && s.onStage) {
      const f = poseByName(debugFlags.catPose, this.clock, this.curlDir);
      if (debugFlags.catPose === 'walk') f.gait = this.gait;
      Object.assign(p, f);
    }
    Object.assign(this.pose, p);
  }

}

// ------------------------------------------------------------------ pose recipes
export function walkPose(p: CatPose, speed: number) {
  p.tailLift = 0.25 + 0.15 * clamp01(speed - 0.8);
  p.tailCurl = 0.35;
  p.tailSway = 0.14;
  p.headX = -0.05;
  p.pitch = 0.02;
}

export function idlePose(p: CatPose, c: number) {
  p.headY = Math.sin(c * 0.6) * 0.5;
  p.headX = Math.sin(c * 0.4) * 0.1;
  p.tailSway = 0.35;
  p.tailLift = 0.2;
  p.earsBack = Math.max(0, Math.sin(c * 0.23)) * 0.2;
}

export function sitPose(p: CatPose, c: number, groom: boolean) {
  p.y = -0.108;
  p.pitch = -0.62;
  // front legs stay upright although the body is tilted, hind legs fold under the haunches
  p.legs = [leg(0.66, 0.05, 0), leg(0.66, 0.05, 0), leg(-1.4, 2.35, -0.95), leg(-1.4, 2.35, -0.95)];
  p.tailLift = -0.42;
  p.tailWrap = 0.3;
  p.tailSway = 0.18;
  if (groom) {
    p.headX = 1.05 + Math.sin(c * 6.5) * 0.07;
    p.headZ = Math.sin(c * 3.2) * 0.06;
    p.legs[1] = leg(-2.05 + Math.sin(c * 6.5) * 0.12, 2.35, 0.4);
    p.eyes = 0.3;
    p.curl = 0.18;
  } else {
    p.headX = 0.42;
    p.headY = Math.sin(c * 0.5) * 0.6;
    p.earsBack = Math.max(0, Math.sin(c * 0.31)) * 0.3;
  }
}

/** crouched, rump wiggling, tail lashing: about to pounce (`k` 0-1 eases in) */
export function stalkPose(p: CatPose, c: number, k: number) {
  p.y = -0.085 * k;
  p.pitch = 0.2 * k;
  p.legs = [leg(-0.5 * k, 0.9 * k, -0.3 * k), leg(-0.5 * k, 0.9 * k, -0.3 * k), leg(-0.9 * k, 1.5 * k, -0.6 * k), leg(-0.9 * k, 1.5 * k, -0.6 * k)];
  p.roll = Math.sin(c * 19) * 0.07 * k;
  p.headX = -0.3 * k;
  p.tailLift = 0.1 * k;
  p.tailSway = 1.2;
  p.eyes = 1;
}

/** the leap itself: stretched out, front paws reaching (`u` 0-1) */
export function pouncePose(p: CatPose, u: number) {
  const air = Math.sin(Math.PI * Math.min(1, u * 1.05));
  p.y = 0.04 * air;
  p.pitch = -0.35 * air;
  p.arch = -0.3 * air;
  p.legs = [leg(-1.3 * air, 0.2 * air, -0.5 * air), leg(-1.3 * air, 0.2 * air, -0.5 * air), leg(0.8 * air, 0.15 * air, 0.7 * air), leg(0.8 * air, 0.15 * air, 0.7 * air)];
  p.tailLift = 0.3 * air;
  p.headX = -0.2 * air;
  p.earsBack = 0.5 * air;
}

/** up on the hind legs, front paws raking the post (`k` 0-1 eases in and out) */
export function scratchPose(p: CatPose, c: number, k: number) {
  const rake = Math.sin(c * 7.5);
  p.pitch = -0.95 * k;
  p.arch = 0.25 * k;
  p.legs = [
    leg((-2.1 + rake * 0.4) * k, 0.2 * k, -0.2 * k),
    leg((-2.1 - rake * 0.4) * k, 0.2 * k, -0.2 * k),
    leg(0.95 * k, 0.1 * k, 0),
    leg(0.95 * k, 0.1 * k, 0),
  ];
  p.headX = -0.45 * k;
  p.tailLift = -0.25 * k;
  p.tailSway = 0.3;
  p.eyes = 1 - 0.55 * k;
  p.earsBack = 0.15 * k;
}

export function stretchPose(p: CatPose, u: number) {
  const k = Math.sin(Math.PI * u);
  // play-bow: chest down, front legs reach forward, rump and tail up
  p.pitch = 0.32 * k;
  p.arch = -0.55 * k;
  p.legs = [leg(-1.3 * k, 0.15 * k, -0.4 * k), leg(-1.3 * k, 0.15 * k, -0.4 * k), leg(-0.15 * k, 0.05 * k, 0.1 * k), leg(-0.15 * k, 0.05 * k, 0.1 * k)];
  p.headX = -0.55 * k;
  p.tailLift = 0.75 * k;
  p.tailCurl = 0.3 * k;
  p.eyes = 1 - 0.75 * smooth((u - 0.1) * 4) * k;
  p.earsBack = 0.35 * k;
}

export function sleepPose(p: CatPose, petted: boolean) {
  // curled into a ball: belly on the ground, paws tucked, head on the tail
  p.y = -0.136;
  p.pitch = 0.0;
  p.curl = 1;
  p.legs = [leg(-1.1, 1.9, -0.8), leg(-1.1, 1.9, -0.8), leg(-1.45, 2.1, -0.8), leg(-1.45, 2.1, -0.8)];
  p.headX = 0.38;
  p.headY = 0;
  p.tailLift = -0.33;
  p.tailWrap = 1;
  p.tailSway = 0.03;
  p.tailCurl = 0;
  p.eyes = petted ? 0.12 : 0;
  p.earsBack = 0.25;
  p.purr = petted ? 1 : 0.15;
  p.arch = petted ? 0.12 : 0;
}

/** A pose by name, used by the dev cat lab and the debug flag. */
export function poseByName(name: string, clock: number, curlDir = 1): CatPose {
  const p = neutralCatPose();
  p.curlDir = curlDir;
  if (name === 'sit') sitPose(p, clock, false);
  else if (name === 'groom') sitPose(p, clock, true);
  else if (name === 'sleep') sleepPose(p, false);
  else if (name === 'purr') sleepPose(p, true);
  else if (name === 'stretch') stretchPose(p, 0.5);
  else if (name === 'stalk') stalkPose(p, clock, 1);
  else if (name === 'pounce') pouncePose(p, 0.5);
  else if (name === 'scratch') scratchPose(p, clock, 1);
  else if (name === 'walk') {
    p.walk = 1;
    p.gait = clock * 6;
    p.gaitAmp = 1;
    walkPose(p, 0.8);
  } else idlePose(p, clock);
  return p;
}
