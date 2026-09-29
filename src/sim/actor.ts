import type { PersonRec, SpeechKind, TaskRec } from '../types';
import { rot2, type RoomLayout, type Station, type StationKind } from '../world/layout';
import type { V2 } from '../world/nav';
import { debugFlags, spotOwners, type CatSim, type Phase, type RoomRuntime, type SimState } from './registry';

export interface Pose {
  bob: number;
  lean: number;
  roll: number;
  twist: number;
  headX: number;
  headY: number;
  headZ: number;
  armLx: number;
  armLz: number;
  armRx: number;
  armRz: number;
  foreLx: number;
  foreRx: number;
  thighLx: number;
  thighRx: number;
  kneeLx: number;
  kneeRx: number;
  happy: number;
  lookUp: number;
  mouth: 'smile' | 'o' | 'sad';
}

export function neutralPose(): Pose {
  return {
    bob: 0, lean: 0, roll: 0, twist: 0, headX: 0, headY: 0, headZ: 0,
    armLx: 0, armLz: 0.1, armRx: 0, armRz: 0.1, foreLx: -0.15, foreRx: -0.15,
    thighLx: 0, thighRx: 0, kneeLx: 0, kneeRx: 0, happy: 0, lookUp: 0, mouth: 'smile',
  };
}

export interface ActorCtx {
  layout: RoomLayout;
  rt: RoomRuntime;
  person: PersonRec;
  /** the task this person works on (staff) */
  task: TaskRec | null;
  now: number;
  lastSayAge: number;
  lastKind: SpeechKind | null;
  queueLen: number;
  /** other characters in this room (for gentle collision avoidance while walking) */
  others: readonly SimState[];
  /** the office cats (people like to pet them) */
  cats: readonly CatSim[];
  /** colleagues currently typing at their desks (worth watching over their shoulder) */
  workers: readonly SimState[];
  onReport: () => void;
  /** the task is handed over for good: free for the next one */
  onRelease: () => void;
  onDoneSpeech: (text: string, failed: boolean) => void;
  /** a "what I am doing" bubble (icon names: read, drink, coffee, fish, wash, water, sofa, pet, window, walk, watch, wait, home) */
  say: (text: string, icon: string) => void;
  /** name of the character with this sim key */
  nameOf: (simKey: string) => string;
}

type ActivityKind = 'wander' | 'sofa' | 'watch' | 'window' | 'pet' | 'stay' | StationKind;

const pickOne = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

const BOOKS = [
  'Clean Code', 'The Pragmatic Programmer', 'Refactoring', 'Code Complete', 'The Mythical Man-Month', 'Designing Data-Intensive Applications',
  'A Philosophy of Software Design', 'Don’t Make Me Think', 'The Phoenix Project', 'Domain-Driven Design', 'Working Effectively with Legacy Code',
  'Structure and Interpretation of Computer Programs', 'The Little Prince', 'The Hitchhiker’s Guide to the Galaxy', 'Where the Wild Things Are',
  'Sherlock Holmes', 'The Cat Who Walked by Herself', 'Alice in Wonderland', 'Kitchen', 'The Alchemist',
];
const WAITING = ['Waiting for the next task', 'Anything new for me?', 'Ready for the next task', 'Tidying up my desk while I wait'];

/**
 * What a character thinks the moment it decides on a break – shown at once, while it is still at its
 * desk, and complete (which book, which plant…), so nothing has to wait until they arrive.
 */
function thoughtOf(a: Activity, name: string): [string, string] | null {
  switch (a.kind) {
    case 'wander': return [pickOne(['Time to stretch my legs', 'Let me walk around a bit']), 'walk'];
    case 'sofa': return [pickOne(['Going to rest on the sofa for a bit', 'Just five minutes on the sofa…']), 'sofa'];
    case 'watch': return [`Let me see how ${name} is doing`, 'watch'];
    case 'window': return [pickOne(['Some fresh air by the window', 'I’ll enjoy the view for a moment']), 'window'];
    case 'pet': return [pickOne(['Aww, a kitty! Time for a cuddle', 'Who’s a good cat? I’m coming!']), 'pet'];
    case 'drink': return a.station?.prop === 'coffee' ? ['Time for a fresh coffee', 'coffee'] : ['Getting a cold glass of water', 'drink'];
    case 'read': return [`Time to read “${a.detail ?? pickOne(BOOKS)}”`, 'read'];
    case 'fish': return [pickOne(['Let’s watch the fish swim', 'I wonder what the fish are up to']), 'fish'];
    case 'wash': return ['Off to wash my face', 'wash'];
    case 'water': return ['The plants look thirsty – time to water them', 'water'];
    default: return null;
  }
}

/** what a character holds in the right hand */
export type HeldKind = 'none' | 'cup' | 'book' | 'can';

/** arm/body key pose of a station activity (missing values fall back to the relaxed pose) */
interface Key {
  t: number;
  rx?: number;
  rz?: number;
  fr?: number;
  lx?: number;
  lz?: number;
  fl?: number;
  lean?: number;
  hx?: number;
}
const RELAXED = { rx: 0, rz: 0.1, fr: -0.15, lx: 0, lz: 0.1, fl: -0.15, lean: 0, hx: 0 };

/** What somebody does while there is nothing to work on: the director waiting for the team, staff waiting for the next task. */
interface Activity {
  kind: ActivityKind;
  target: V2;
  yaw: number;
  dur: number;
  points?: V2[];
  spot?: number;
  catKey?: string;
  watchKey?: string;
  /** get a drink / read / watch the fish / wash / water the plants */
  station?: Station;
  stationKey?: string;
  /** book title, name of the colleague being watched… (for the speech bubble) */
  detail?: string;
  /** petting a cat that sleeps on the desk – the director stays in the chair */
  atDesk?: boolean;
}

/** height of the hip above the floor for an appearance scale of 1 (model hip * rig scale) */
const HIP = 0.47 * 0.85;
const WALK_SPEED = 2.15;
const MIN_WORK = 3.2;
/** a tool call keeps the person at the laptop at least this long */
const MIN_CALL = 2.2;
const smooth = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
const angleDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class Actor {
  readonly sim: SimState;
  readonly pose: Pose = neutralPose();
  readonly isDirector: boolean;

  /** progress of the laptop: 0 in bag → 1 in hands → 2 on desk */
  lapP = 0;
  lid = 0;
  /** 0 bag on back → 1 bag on the floor next to the chair */
  bagT = 0;
  /** 0 hidden → 1 in hands → 2 flying to the pile → 3 delivered */
  folderP = 0;
  folderT = 0;
  typing = 0;

  private path: V2[] = [];
  private pi = 0;
  private walkPhase = 0;
  private t = 0;
  private workTime = 0;
  private drain = 0;
  private waveT = 0;
  private waveDone = new Set<number>();
  private from: V2 = { x: 0, z: 0 };
  private blinkT = 2;
  private blinkOpen = 1;
  private clock = Math.random() * 10;
  private failed = false;
  // --- director breaks
  private restT = 0;
  private nextIdleAt = 4 + Math.random() * 3;
  private act: Activity | null = null;
  private actStage = 0;
  /** away from the desk with the laptop left open (break or report) */
  private strolling = false;
  private resume = false;
  private deskPetT = -1;
  /** what the right hand holds (drawn by the character component) */
  held: HeldKind = 'none';
  /** 0..1: the watering can is tilted and pouring */
  pour = 0;
  /** tilt of the held item about the character's x axis (radians, positive = leaning forward) */
  heldTilt = 0;
  /** 0..1: the book is open */
  bookOpen = 0;
  /** running water at a sink tap: room position and strength 0..1 */
  tap: V2 | null = null;
  tapFlow = 0;
  /** key of the task the current work timers belong to */
  private curTask = '';
  /** the last "what I am doing" bubble, so the same words are not said twice in a row */
  private lastSaid = '';
  /** on the way to the director with a report */
  private reporting = false;
  /** height of this character's hip (sitting on a sofa) */
  private readonly hip: number;

  constructor(key: string, roomId: string, isDirector: boolean, layout: RoomLayout, desk: number, scale: number) {
    this.isDirector = isDirector;
    this.hip = HIP * scale;
    this.sim = { key, roomId, x: layout.door.outside.x, z: layout.door.outside.z, yaw: 0, phase: 'waiting', sitT: 0, y: 0, onStage: false, desk, busy: false, slot: -1, walking: false };
  }

  get phase(): Phase {
    return this.sim.phase;
  }

  eyeOpen(): number {
    return this.blinkOpen;
  }

  // ------------------------------------------------------------------ helpers
  private seatOf(ctx: ActorCtx): V2 {
    return this.isDirector ? ctx.layout.director.seat : ctx.layout.desks[this.sim.desk].seat;
  }
  private approachOf(ctx: ActorCtx): V2 {
    return this.isDirector ? ctx.layout.director.approach : ctx.layout.desks[this.sim.desk].approach;
  }

  /** the seated worker looks at the director (desks are placed to face the director's desk) */
  seatYaw(ctx: ActorCtx): number {
    return this.isDirector ? 0 : ctx.layout.desks[this.sim.desk].rot;
  }

  private setPhase(p: Phase) {
    this.sim.phase = p;
    this.t = 0;
  }

  private startPath(points: V2[]) {
    this.path = points;
    this.pi = 0;
  }

  private routeIn(ctx: ActorCtx, target: V2): V2[] {
    const { door, nav } = ctx.layout;
    const inner = nav.findPath(door.inside, target) ?? [target];
    return [door.threshold, door.inside, ...inner];
  }

  private routeOut(ctx: ActorCtx): V2[] {
    const { door, nav } = ctx.layout;
    const s = this.sim;
    const inner = nav.findPath({ x: s.x, z: s.z }, door.inside) ?? [door.inside];
    return [...inner, door.threshold, door.outside];
  }

  /** Move along the current path. Returns true once the end is reached. */
  private walk(dt: number, ctx: ActorCtx, speedMul = 1): boolean {
    const s = this.sim;
    if (this.pi >= this.path.length) {
      s.walking = false;
      return true;
    }
    const target = this.path[this.pi];
    const dx = target.x - s.x;
    const dz = target.z - s.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * speedMul * dt;
    s.walking = true;
    if (dist <= step) {
      s.x = target.x;
      s.z = target.z;
      this.pi++;
    } else {
      s.x += (dx / dist) * step;
      s.z += (dz / dist) * step;
    }
    this.avoid(dt, ctx);
    const heading = Math.atan2(dx, dz);
    s.yaw += angleDiff(s.yaw, heading) * Math.min(1, dt * 11);
    this.walkPhase += dt * WALK_SPEED * speedMul * 4.6;
    if (this.pi >= this.path.length) {
      s.walking = false;
      return true;
    }
    return false;
  }

  /** Nudge sideways when another walking character is in the way. */
  private avoid(dt: number, ctx: ActorCtx) {
    const s = this.sim;
    for (const c of ctx.cats) {
      if (!c.onStage || c.y > 0.3) continue;
      const dx = s.x - c.x;
      const dz = s.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.001 || d > 0.7) continue;
      const push = (0.7 - d) * 3.4 * dt;
      const nx = s.x + (dx / d) * push;
      const nz = s.z + (dz / d) * push;
      if (!ctx.layout.nav.isBlocked(nx, nz)) {
        s.x = nx;
        s.z = nz;
      }
    }
    for (const o of ctx.others) {
      if (o === s || !o.onStage || o.sitT > 0.3) continue;
      const dx = s.x - o.x;
      const dz = s.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.001 || d > 0.62) continue;
      const push = (0.62 - d) * 3.2 * dt;
      const nx = s.x + (dx / d) * push;
      const nz = s.z + (dz / d) * push;
      if (!ctx.layout.nav.isBlocked(nx, nz)) {
        s.x = nx;
        s.z = nz;
      }
    }
  }

  private faceYaw(yaw: number, dt: number, rate = 9) {
    this.sim.yaw += angleDiff(this.sim.yaw, yaw) * Math.min(1, dt * rate);
  }

  // -------------------------------------------------------------- state machine
  update(dt: number, ctx: ActorCtx) {
    dt = Math.min(dt, 0.1);
    this.clock += dt;
    this.t += dt;
    const s = this.sim;
    const { person, layout, rt } = ctx;
    const pose = this.targetPose();
    this.typing = 0;
    s.busy = false;

    switch (s.phase) {
      case 'waiting': {
        s.onStage = false;
        s.walking = false;
        s.x = layout.door.outside.x;
        s.z = layout.door.outside.z;
        s.sitT = 0;
        this.lapP = 0;
        this.lid = 0;
        this.bagT = 0;
        this.folderP = 0;
        if (!person.present) break;
        if (!this.isDirector && s.desk < 0) break;
        if (ctx.now < rt.doorFreeAt) break;
        rt.doorFreeAt = ctx.now + (this.isDirector ? 0.6 : 1.5);
        this.startPath(this.routeIn(ctx, this.approachOf(ctx)));
        this.waveDone.clear();
        this.resume = false;
        this.strolling = false;
        this.reporting = false;
        this.act = null;
        this.curTask = '';
        this.lastSaid = '';
        this.restT = 0;
        this.deskPetT = -1;
        this.nextIdleAt = debugFlags.activity ? 1.5 : 7 + Math.random() * 6;
        s.onStage = true;
        s.yaw = Math.atan2(layout.door.dir.x, layout.door.dir.z);
        this.setPhase('entering');
        break;
      }

      case 'entering': {
        this.stepWave(dt, 1, true);
        if (this.waveT <= 0 && this.walk(dt, ctx)) {
          this.from = { x: s.x, z: s.z };
          this.setPhase('sitting');
        }
        this.walkPose(pose, 1);
        if (this.waveT > 0) this.wavePose(pose);
        break;
      }

      case 'sitting': {
        const seat = this.seatOf(ctx);
        const u = smooth(this.t / 0.85);
        s.x = lerp(this.from.x, seat.x, u);
        s.z = lerp(this.from.z, seat.z, u);
        this.faceYaw(this.seatYaw(ctx), dt, 10);
        s.sitT = u;
        if (!this.resume) this.bagT = seg(this.t, 0.15, 0.75);
        this.seatedPose(pose, s.sitT);
        pose.lean = 0.1 * Math.sin(u * Math.PI);
        if (this.t >= 0.85) {
          if (this.resume) {
            // back from a break: the laptop is still open on the desk
            this.resume = false;
            this.restT = 0;
            this.nextIdleAt = debugFlags.activity ? 1.5 : 8 + Math.random() * 8;
            this.setPhase('working');
            if (!this.isDirector && !ctx.task) this.announce(ctx, [pickOne(WAITING), 'wait']);
          } else this.setPhase('unpacking');
        }
        break;
      }

      case 'unpacking': {
        const t = this.t;
        s.sitT = 1;
        this.bagT = 1;
        this.faceYaw(this.seatYaw(ctx), dt);
        this.lapP = t < 0.25 ? 0 : t < 1.0 ? seg(t, 0.25, 1.0) : 1 + seg(t, 1.0, 1.75);
        this.lid = seg(t, 1.75, 2.3);
        this.seatedPose(pose, 1);
        if (t < 1.0) {
          pose.lean = 0.28;
          pose.armRx = 0.1;
          pose.armRz = 0.7;
          pose.headX = 0.25;
        } else if (t < 1.75) {
          pose.armLx = pose.armRx = -1.15;
          pose.armLz = pose.armRz = -0.2;
          pose.foreLx = pose.foreRx = -0.35;
          pose.headX = 0.15;
        } else {
          this.typePose(pose, 16, 0.6);
        }
        if (t >= 2.4) {
          this.curTask = '';
          this.setPhase('working');
        }
        break;
      }

      case 'working': {
        s.sitT = 1;
        this.bagT = 1;
        this.lapP = 2;
        this.lid = 1;
        this.faceYaw(this.seatYaw(ctx), dt);
        this.seatedPose(pose, 1);
        const task = ctx.task;
        if (!person.present) {
          // the office is closing: pack the laptop and go home
          this.workPose(pose, ctx);
          this.announce(ctx, [this.isDirector ? pickOne(['Locking up the office. Good night!', 'That’s all for today. See you!']) : pickOne(['Time to go home. Bye!', 'Done for today. See you!']), 'home']);
          this.setPhase('packing');
        } else if (this.isDirector) {
          this.workPose(pose, ctx);
          this.idleBehaviour(dt, ctx);
        } else if (task) {
          if (task.key !== this.curTask) {
            // a new task: start the clock, the previous one is forgotten
            this.curTask = task.key;
            this.workTime = 0;
            this.drain = 0;
            this.restT = 0;
            this.deskPetT = -1;
          }
          s.busy = true;
          this.workTime += dt;
          this.workPose(pose, ctx);
          if (task.done && this.workTime >= (task.source === 'sub' ? MIN_WORK : MIN_CALL)) {
            if (ctx.queueLen > 0 && this.drain < 4) this.drain += dt; // let the last bubbles finish first
            else if (task.source === 'sub') {
              // hand the report to the director
              this.failed = task.failed;
              this.reporting = true;
              this.strolling = true;
              this.setPhase('standing');
            } else ctx.onRelease();
          }
        } else {
          // nothing to do until the next task comes round: sit tight, or take a little break
          if (this.curTask) this.announce(ctx, [pickOne(WAITING), 'wait']);
          this.curTask = '';
          this.workPose(pose, ctx);
          this.idleBehaviour(dt, ctx);
        }
        break;
      }

      case 'packing': {
        const t = this.t;
        s.sitT = 1;
        this.faceYaw(this.seatYaw(ctx), dt);
        this.lid = 1 - seg(t, 0, 0.5);
        this.lapP = t < 0.5 ? 2 : t < 1.1 ? 2 - seg(t, 0.5, 1.1) : 1 - seg(t, 1.1, 1.7);
        this.seatedPose(pose, 1);
        if (t < 0.5) this.typePose(pose, 10, 0.5);
        else if (t < 1.1) {
          pose.armLx = pose.armRx = -1.15;
          pose.armLz = pose.armRz = -0.2;
          pose.foreLx = pose.foreRx = -0.35;
        } else {
          pose.lean = 0.28;
          pose.armRx = 0.1;
          pose.armRz = 0.7;
          pose.headX = 0.25;
        }
        if (t >= 1.8) {
          this.lapP = 0;
          this.lid = 0;
          this.setPhase('standing');
        }
        break;
      }

      case 'standing': {
        const seat = this.seatOf(ctx);
        const app = this.approachOf(ctx);
        const u = smooth(this.t / 0.9);
        s.x = lerp(seat.x, app.x, u);
        s.z = lerp(seat.z, app.z, u);
        s.sitT = 1 - u;
        if (!this.strolling) this.bagT = 1 - seg(this.t, 0.0, 0.6);
        this.faceYaw(this.isDirector ? 0 : Math.atan2(app.x - seat.x, app.z - seat.z), dt, 8);
        this.seatedPose(pose, s.sitT);
        pose.lean = 0.12 * Math.sin(u * Math.PI);
        if (this.t >= 0.9 && this.strolling && this.act) {
          s.sitT = 0;
          this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, this.act.target) ?? [this.act.target]);
          this.setPhase('stroll');
        } else if (this.t >= 0.9 && this.reporting) {
          s.sitT = 0;
          this.setPhase('toBoss');
        } else if (this.t >= 0.9) {
          this.bagT = 0;
          s.sitT = 0;
          this.startPath(this.routeOut(ctx));
          this.waveDone.clear();
          this.setPhase('leaving');
        }
        break;
      }

      case 'stroll': {
        this.walkPose(pose, 1);
        s.y = 0;
        if (this.shouldReturn(ctx)) this.goHome(ctx);
        else if (this.walk(dt, ctx)) {
          this.actStage = 0;
          this.from = { x: s.x, z: s.z };
          this.setPhase('activity');
        }
        break;
      }

      case 'activity': {
        this.activity(dt, ctx, pose);
        break;
      }

      case 'returning': {
        this.walkPose(pose, 1);
        s.y = 0;
        if (this.walk(dt, ctx)) {
          this.from = { x: s.x, z: s.z };
          this.resume = true;
          this.strolling = false;
          this.setPhase('sitting');
        }
        break;
      }

      case 'toBoss': {
        const dir = layout.director;
        if (s.slot < 0) {
          const free = rt.visitors.findIndex((v) => v === null);
          if (free >= 0) {
            s.slot = free;
            rt.visitors[free] = s.key;
            const target = dir.visitors[free];
            this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, target) ?? [target]);
          } else {
            // everybody is queueing – idle politely
            this.faceYaw(Math.PI, dt);
            this.idlePose(pose);
            break;
          }
        }
        if (this.walk(dt, ctx)) this.setPhase('handover');
        this.walkPose(pose, 1);
        break;
      }

      case 'handover': {
        const t = this.t;
        this.faceYaw(Math.PI, dt, 12);
        this.idlePose(pose);
        this.folderT = t;
        if (t < 1.0) {
          this.folderP = 1;
          pose.armLx = pose.armRx = -1.25;
          pose.armLz = pose.armRz = -0.15;
          pose.foreLx = pose.foreRx = -0.25;
          pose.lean = 0.2 * seg(t, 0.3, 0.9);
          pose.headX = 0.1;
        } else {
          if (this.folderP === 1) {
            this.folderP = 2;
            ctx.onDoneSpeech(ctx.task?.summary || (this.failed ? 'Sorry, I could not finish this one.' : 'All done! Here is my report.'), this.failed);
          }
          const h = t - 1.0;
          if (h > 0.55 && this.folderP === 2) {
            this.folderP = 3;
            ctx.onReport();
            rt.receivedAt = ctx.now;
          }
          pose.happy = this.failed ? 0 : 1;
          pose.mouth = this.failed ? 'sad' : 'smile';
          pose.armLx = pose.armRx = lerp(-1.25, this.failed ? 0.1 : -0.1, seg(h, 0, 0.35));
          if (!this.failed) {
            pose.armRx = -2.6 + Math.sin(h * 11) * 0.3;
            pose.armRz = 0.45;
            pose.foreRx = -0.5;
            pose.bob = Math.abs(Math.sin(h * 7)) * 0.07;
          } else {
            pose.headX = 0.25;
          }
        }
        if (t >= 2.7) {
          if (s.slot >= 0) rt.visitors[s.slot] = null;
          s.slot = -1;
          this.folderP = 0;
          this.reporting = false;
          // the task is done for good; back to the desk to wait for the next one
          ctx.onRelease();
          this.curTask = '';
          const app = this.approachOf(ctx);
          this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, app) ?? [app]);
          this.setPhase('returning');
        }
        break;
      }

      case 'leaving': {
        this.stepWave(dt, 2, false);
        if (this.waveT <= 0 && this.walk(dt, ctx)) {
          s.onStage = false;
          s.walking = false;
          this.setPhase('waiting');
        }
        this.walkPose(pose, 1);
        if (this.waveT > 0) this.wavePose(pose);
        break;
      }
    }

    this.blink(dt);
    this.copyPose(pose);
  }

  // ------------------------------------------------------------ breaks
  /** The director has nothing to say (the staff carry out the work) and staff have no task: sit tight, walk around, sit on the sofa, watch a colleague, look out of the window, pet a cat. */
  private idleBehaviour(dt: number, ctx: ActorCtx) {
    if (!this.isResting(ctx)) {
      this.restT = 0;
      this.deskPetT = -1;
      return;
    }
    if (this.deskPetT >= 0) {
      this.deskPetT += dt;
      const cat = this.act?.catKey ? ctx.cats.find((c) => c.key === this.act!.catKey) : undefined;
      if (cat) cat.petUntil = ctx.now + 0.6;
      if (this.deskPetT > (this.act?.dur ?? 6) || !cat || !cat.onStage) {
        this.deskPetT = -1;
        this.restT = 0;
        this.nextIdleAt = 9 + Math.random() * 8;
        this.act = null;
      }
      return;
    }
    this.restT += dt;
    if (this.restT < this.nextIdleAt) return;
    const a = this.pickActivity(ctx);
    if (!a) {
      this.nextIdleAt = this.restT + 3 + Math.random() * 3;
      return;
    }
    if (a.kind === 'stay') {
      // stay in the chair a while longer
      this.restT = 0;
      this.nextIdleAt = 9 + Math.random() * 10;
      return;
    }
    this.act = a;
    // the thought appears right away – the character is still in the chair
    this.announce(ctx, thoughtOf(a, a.detail ?? ''));
    if (a.atDesk) {
      this.deskPetT = 0;
    } else {
      this.strolling = true;
      this.setPhase('standing');
    }
  }

  /** the director rests while nobody needs him; the staff rest while they have no task */
  private isResting(ctx: ActorCtx): boolean {
    return this.isDirector ? ctx.lastSayAge > 8 : !ctx.task;
  }

  /** Something needs attention (a task, a report to receive, closing time): cut the break short. */
  private shouldReturn(ctx: ActorCtx): boolean {
    if (!ctx.person.present) return true;
    if (this.isDirector) return ctx.rt.visitors.some((v) => v !== null);
    return !!ctx.task;
  }

  private announce(ctx: ActorCtx, line: [string, string] | null) {
    if (!line || line[0] === this.lastSaid) return;
    this.lastSaid = line[0];
    ctx.say(line[0], line[1]);
  }

  private releaseSpot() {
    if (this.act?.spot !== undefined) {
      const k = `${this.sim.roomId}#${this.act.spot}`;
      if (spotOwners.get(k) === this.sim.key) spotOwners.delete(k);
    }
    if (this.act?.stationKey && spotOwners.get(this.act.stationKey) === this.sim.key) spotOwners.delete(this.act.stationKey);
    this.held = 'none';
    this.pour = 0;
    this.heldTilt = 0;
    this.bookOpen = 0;
    this.tap = null;
    this.tapFlow = 0;
  }

  private goHome(ctx: ActorCtx) {
    this.releaseSpot();
    const s = this.sim;
    s.y = 0;
    s.sitT = 0;
    const app = this.approachOf(ctx);
    this.startPath(ctx.layout.nav.findPath({ x: s.x, z: s.z }, app) ?? [app]);
    this.act = null;
    this.setPhase('returning');
  }

  private randomFloorPoint(ctx: ActorCtx, ref: V2): V2 | null {
    const { width: W, depth: D, nav } = ctx.layout;
    for (let i = 0; i < 40; i++) {
      const p = { x: (Math.random() - 0.5) * (W - 2.4), z: (Math.random() - 0.5) * (D - 2.4) };
      const d = Math.hypot(p.x - ref.x, p.z - ref.z);
      if (d > 2 && d < 9 && !nav.isBlocked(p.x, p.z) && nav.findPath(ref, p)) return p;
    }
    return null;
  }

  private pickActivity(ctx: ActorCtx): Activity | null {
    const { layout, cats, workers } = ctx;
    const s = this.sim;
    const from = { x: s.x, z: s.z };
    const free = (p: V2) => !layout.nav.isBlocked(p.x, p.z);
    const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
    const seats = layout.spots.map((sp, i) => ({ sp, i })).filter(({ sp, i }) => (sp.kind === 'sofa' || sp.kind === 'armchair') && !spotOwners.has(`${s.roomId}#${i}`));
    // a cat asleep on the director's desk can only be reached from the director's chair
    const petCats = cats.filter((c) => c.onStage && c.still && c.petUntil < ctx.now && (this.isDirector || layout.spots[c.spot]?.kind !== 'desk'));
    const watchable = workers.filter((w) => w.desk >= 0 && w.busy && w.key !== s.key);
    const staff = !this.isDirector;
    const stationsOf = (k: StationKind) => layout.stations.map((st, i) => ({ st, i })).filter(({ st, i }) => st.kind === k && !spotOwners.has(`${s.roomId}@${i}`));
    const options: [ActivityKind, number][] = [
      ['wander', staff ? 1.5 : 3], ['sofa', seats.length ? (staff ? 4 : 3) : 0], ['watch', watchable.length ? (staff ? 1.5 : 4) : 0],
      ['window', layout.catWindows.length ? (staff ? 1.5 : 2.5) : 0], ['pet', petCats.length ? (staff ? 4.5 : 5) : 0], ['stay', staff ? 5 : 0],
      ['drink', stationsOf('drink').length ? 4 : 0], ['read', stationsOf('read').length ? 3.5 : 0], ['fish', stationsOf('fish').length ? 3.5 : 0],
      ['wash', stationsOf('wash').length ? 2.5 : 0], ['water', stationsOf('water').length ? 3.5 : 0],
    ];
    let roll = Math.random() * options.reduce((a, [, w]) => a + w, 0);
    let kind: ActivityKind = 'wander';
    const forced = debugFlags.activity as ActivityKind | undefined;
    if (forced && options.some(([k, w]) => k === forced && w > 0)) roll = -1;
    for (const [k, w] of options) {
      if (forced && roll === -1) {
        kind = forced;
        break;
      }
      roll -= w;
      if (roll <= 0 && w > 0) {
        kind = k;
        break;
      }
    }
    switch (kind) {
      case 'stay':
        return { kind, target: from, yaw: 0, dur: 0 };
      case 'drink':
      case 'read':
      case 'fish':
      case 'wash':
      case 'water': {
        const { st, i } = pick(stationsOf(kind));
        const stationKey = `${s.roomId}@${i}`;
        spotOwners.set(stationKey, s.key);
        const dur = kind === 'drink' ? 9.2 : kind === 'read' ? 14 + Math.random() * 6 : kind === 'fish' ? 11 + Math.random() * 6 : kind === 'wash' ? 9 : 11 + Math.random() * 3;
        return { kind, target: st.stand, yaw: st.yaw, dur, station: st, stationKey, detail: kind === 'read' ? pickOne(BOOKS) : undefined };
      }
      case 'sofa': {
        const { sp, i } = pick(seats);
        spotOwners.set(`${s.roomId}#${i}`, s.key);
        return { kind, target: sp.approach, yaw: sp.yaw, dur: 12 + Math.random() * 14, spot: i };
      }
      case 'watch': {
        const w = pick(watchable);
        const d = layout.desks[w.desk];
        const f = rot2(0, 1, d.rot);
        const lat = rot2(1, 0, d.rot);
        for (const off of [0.45, -0.45, 0]) {
          const target = { x: d.seat.x - f.x * 0.95 + lat.x * off, z: d.seat.z - f.z * 0.95 + lat.z * off };
          if (free(target)) return { kind, target, yaw: d.rot, dur: 7 + Math.random() * 7, watchKey: w.key, detail: ctx.nameOf(w.key) };
        }
        return null;
      }
      case 'window': {
        const cw = pick(layout.catWindows);
        return { kind, target: cw.land, yaw: cw.yaw + Math.PI, dur: 8 + Math.random() * 8 };
      }
      case 'pet': {
        const c = pick(petCats);
        const spot = c.spot >= 0 ? layout.spots[c.spot] : null;
        if (spot?.kind === 'desk') return { kind, target: from, yaw: 0, dur: 6 + Math.random() * 3, catKey: c.key, atDesk: true };
        let target: V2 | null = null;
        if (spot && (spot.kind === 'sofa' || spot.kind === 'armchair' || spot.kind === 'beanbag')) target = spot.approach;
        else {
          let best = Infinity;
          for (let a = 0; a < 12; a++) {
            const q = { x: c.x + Math.cos((a / 12) * Math.PI * 2) * 0.75, z: c.z + Math.sin((a / 12) * Math.PI * 2) * 0.75 };
            const d = Math.hypot(q.x - from.x, q.z - from.z);
            if (free(q) && d < best) {
              best = d;
              target = q;
            }
          }
        }
        if (!target) return null;
        return { kind, target, yaw: Math.atan2(c.x - target.x, c.z - target.z), dur: 6 + Math.random() * 4, catKey: c.key };
      }
      default: {
        const pts: V2[] = [];
        for (let n = 0; n < 3; n++) {
          const q = this.randomFloorPoint(ctx, pts[pts.length - 1] ?? from);
          if (q) pts.push(q);
        }
        if (!pts.length) return null;
        return { kind: 'wander', target: pts[0], yaw: 0, dur: 0, points: pts.slice(1) };
      }
    }
  }

  private activity(dt: number, ctx: ActorCtx, pose: Pose) {
    const a = this.act;
    const s = this.sim;
    if (!a) {
      this.goHome(ctx);
      return;
    }
    const t = this.t;
    const back = this.shouldReturn(ctx);
    switch (a.kind) {
      case 'wander': {
        this.idlePose(pose);
        if (back || t > 0.9) {
          const next = a.points?.shift();
          if (!back && next) {
            this.startPath(ctx.layout.nav.findPath({ x: s.x, z: s.z }, next) ?? [next]);
            this.setPhase('stroll');
          } else this.goHome(ctx);
        }
        break;
      }
      case 'sofa': {
        const spot = ctx.layout.spots[a.spot!];
        const yOn = spot.y - this.hip + 0.02;
        if (this.actStage === 0) {
          const u = smooth(t / 0.9);
          s.x = lerp(this.from.x, spot.x, u);
          s.z = lerp(this.from.z, spot.z, u);
          s.y = lerp(0, yOn, u);
          s.sitT = u;
          this.faceYaw(spot.yaw, dt, 10);
          this.seatedPose(pose, u);
          if (t >= 0.9) {
            this.actStage = 1;
            this.t = 0;
          }
        } else if (this.actStage === 1) {
          s.sitT = 1;
          this.faceYaw(spot.yaw, dt);
          this.seatedPose(pose, 1);
          this.sofaPose(pose);
          if (back || t >= a.dur) {
            this.actStage = 2;
            this.t = 0;
          }
        } else {
          const u = smooth(t / 0.9);
          s.x = lerp(spot.x, spot.approach.x, u);
          s.z = lerp(spot.z, spot.approach.z, u);
          s.y = lerp(yOn, 0, u);
          s.sitT = 1 - u;
          this.seatedPose(pose, s.sitT);
          if (t >= 0.9) this.goHome(ctx);
        }
        break;
      }
      case 'watch': {
        const w = ctx.workers.find((x) => x.key === a.watchKey);
        this.faceYaw(a.yaw, dt, 6);
        this.watchPose(pose);
        if (back || t > a.dur || !w || !w.busy) this.goHome(ctx);
        break;
      }
      case 'window': {
        this.faceYaw(a.yaw, dt, 5);
        this.lookOutPose(pose);
        if (back || t > a.dur) this.goHome(ctx);
        break;
      }
      case 'pet': {
        const cat = ctx.cats.find((c) => c.key === a.catKey);
        if (cat) {
          cat.petUntil = ctx.now + 0.6;
          this.faceYaw(Math.atan2(cat.x - s.x, cat.z - s.z), dt, 8);
        }
        this.petPose(pose);
        if (back || t > a.dur || !cat || !cat.onStage || !cat.still) this.goHome(ctx);
        break;
      }
      case 'drink':
      case 'read':
      case 'fish':
      case 'wash':
      case 'water': {
        this.faceYaw(a.yaw, dt, 7);
        this.idlePose(pose);
        this.stationPose(a, pose);
        if (back || t > a.dur) this.goHome(ctx);
        break;
      }
    }
  }

  /** piecewise smooth interpolation between key poses */
  private keyed(pose: Pose, keys: Key[], t: number) {
    const full = keys.map((k) => ({ ...RELAXED, ...k }));
    let i = 0;
    while (i < full.length - 2 && t > full[i + 1].t) i++;
    const a = full[i];
    const b = full[Math.min(i + 1, full.length - 1)];
    const u = b.t > a.t ? seg(t, a.t, b.t) : 1;
    const v = (k: keyof typeof RELAXED) => lerp(a[k], b[k], u);
    pose.armRx = v('rx');
    pose.armRz = v('rz');
    pose.foreRx = v('fr');
    pose.armLx = v('lx');
    pose.armLz = v('lz');
    pose.foreLx = v('fl');
    pose.lean = v('lean');
    pose.headX = v('hx');
  }

  /** the little scenes: getting a drink, reading, watching the fish, washing up, watering a plant */
  private stationPose(a: Activity, pose: Pose) {
    const t = this.t;
    const d = a.dur;
    const c = this.clock;
    this.held = 'none';
    this.pour = 0;
    this.tapFlow = 0;
    this.heldTilt = 0;
    this.bookOpen = 0;
    switch (a.kind) {
      case 'drink': {
        this.keyed(pose, [
          { t: 0 }, { t: 0.7 },
          { t: 1.5, rx: -1.25, rz: -0.05, fr: -0.45, lean: 0.05 },
          { t: 3.4, rx: -1.25, rz: -0.05, fr: -0.45, lean: 0.08, hx: 0.12 },
          { t: 4.4, rx: -0.85, rz: -0.55, fr: -2.05, hx: -0.08 },
          { t: 7.3, rx: -0.85, rz: -0.55, fr: -2.05, hx: -0.08 },
          { t: 8.3, rx: -0.1, rz: 0.1, fr: -0.15 },
          { t: 9.2 },
        ], t);
        if (t > 1.0 && t < 8.2) this.held = 'cup';
        const sip = t > 4.4 && t < 7.3 ? Math.max(0, Math.sin(c * 2.3)) : 0;
        pose.headX -= 0.14 * sip;
        this.heldTilt = -0.55 * sip;
        if (t > 8.2) pose.happy = 1;
        break;
      }
      case 'read': {
        this.keyed(pose, [
          { t: 0 }, { t: 0.6 },
          { t: 1.6, rx: -1.35, rz: -0.1, fr: -0.25, lean: 0.05 },
          { t: 3.6, rx: -1.0, rz: -0.4, fr: -1.55, lx: -0.95, lz: -0.4, fl: -1.55, lean: 0.06, hx: 0.34 },
          { t: d - 2.6, rx: -1.0, rz: -0.4, fr: -1.55, lx: -0.95, lz: -0.4, fl: -1.55, lean: 0.06, hx: 0.34 },
          { t: d - 1.2, rx: -1.35, rz: -0.1, fr: -0.25, lean: 0.04 },
          { t: d },
        ], t);
        if (t > 2.0 && t < d - 0.7) this.held = 'book';
        this.heldTilt = -0.95 * seg(t, 2.2, 3.6) * (1 - seg(t, d - 2.6, d - 1.6));
        this.bookOpen = seg(t, 3.2, 3.8) * (1 - seg(t, d - 2.4, d - 1.8));
        if (t > 3.6 && t < d - 2.6) {
          pose.headY = Math.sin(c * 0.5) * 0.12;
          // now and then a page is turned
          pose.armLx += Math.max(0, Math.sin(c * 0.7)) ** 8 * -0.25;
        }
        break;
      }
      case 'fish': {
        const point = seg(t, d * 0.45, d * 0.45 + 0.6) * (1 - seg(t, d * 0.45 + 1.6, d * 0.45 + 2.2));
        this.keyed(pose, [
          { t: 0 }, { t: 0.9, rx: 0.35, rz: -0.3, fr: 0, lx: 0.35, lz: -0.3, fl: 0, lean: 0.1, hx: 0.16 },
          { t: d - 0.9, rx: 0.35, rz: -0.3, fr: 0, lx: 0.35, lz: -0.3, fl: 0, lean: 0.1, hx: 0.16 }, { t: d },
        ], t);
        // pointing at a fish
        pose.armRx = lerp(pose.armRx, -1.2, point);
        pose.armRz = lerp(pose.armRz, 0.15, point);
        pose.foreRx = lerp(pose.foreRx, -0.25, point);
        pose.headY = Math.sin(c * 0.8) * 0.4;
        pose.happy = 0.6;
        break;
      }
      case 'wash': {
        const rub = Math.sin(c * 13) * 0.12;
        this.keyed(pose, [
          { t: 0 }, { t: 0.8, rx: -0.9, rz: -0.25, fr: -0.7, lx: -0.9, lz: -0.25, fl: -0.7, lean: 0.3, hx: 0.25 },
          { t: 4.4, rx: -0.9, rz: -0.25, fr: -0.7, lx: -0.9, lz: -0.25, fl: -0.7, lean: 0.3, hx: 0.25 },
          { t: 5.2, rx: -1.05, rz: -0.3, fr: -2.2, lx: -1.05, lz: -0.3, fl: -2.2, lean: 0.25, hx: 0.2 },
          { t: 6.6, rx: -1.05, rz: -0.3, fr: -2.2, lx: -1.05, lz: -0.3, fl: -2.2, lean: 0.25, hx: 0.2 },
          { t: 7.5, rx: -0.85, rz: -0.55, fr: -2.05, lean: 0.05, hx: -0.05 },
          { t: 8.6 }, { t: 9 },
        ], t);
        if (t > 0.8 && t < 4.4) {
          pose.foreRx += rub;
          pose.foreLx -= rub;
        } else if (t > 5.2 && t < 6.6) {
          pose.foreRx += rub * 0.8;
          pose.foreLx -= rub * 0.8;
        }
        this.tap = a.station?.tap ?? null;
        this.tapFlow = seg(t, 0.8, 1.1) * (1 - seg(t, 5.4, 5.7));
        if (t > 7.4) pose.happy = 1;
        break;
      }
      case 'water': {
        this.keyed(pose, [
          { t: 0 }, { t: 0.2, lean: 0.05 },
          { t: 0.7, rx: -0.3, rz: 0.05, fr: -0.1, lz: 0.5, lean: 0.55 },
          { t: 1.5, rx: -1.2, rz: -0.1, fr: -0.55, lz: 0.5, lean: 0.12, hx: 0.15 },
          { t: d - 2.2, rx: -1.2, rz: -0.1, fr: -0.55, lz: 0.5, lean: 0.12, hx: 0.28 },
          { t: d - 1.0, rx: -0.3, rz: 0.05, fr: -0.1, lz: 0.4, lean: 0.55 },
          { t: d - 0.2, lean: 0.2 }, { t: d },
        ], t);
        if (t > 0.45 && t < d - 0.5) this.held = 'can';
        this.pour = seg(t, 2.0, 2.8) * (1 - seg(t, d - 3.0, d - 2.2));
        this.heldTilt = 0.9 * this.pour;
        pose.happy = 0.5;
        break;
      }
      default:
    }
  }

  private sofaPose(p: Pose) {
    const c = this.clock;
    p.lean = -0.14;
    p.armLx = p.armRx = -0.55;
    p.armLz = p.armRz = 0.55;
    p.foreLx = p.foreRx = -0.9;
    p.headY = Math.sin(c * 0.45) * 0.55;
    p.headX = -0.05 + Math.sin(c * 0.7) * 0.05;
  }

  private watchPose(p: Pose) {
    const c = this.clock;
    this.idlePose(p);
    p.armRx = -0.85;
    p.armRz = -0.55;
    p.foreRx = -2.05;
    p.armLx = -0.95;
    p.armLz = -0.55;
    p.foreLx = -1.35;
    p.headX = 0.22;
    p.headZ = 0.1 + Math.sin(c * 0.8) * 0.04;
    p.headY = Math.sin(c * 0.4) * 0.12;
    p.lean = 0.06;
  }

  private lookOutPose(p: Pose) {
    const c = this.clock;
    p.armLx = p.armRx = 0.28;
    p.armLz = p.armRz = 0.1;
    p.foreLx = p.foreRx = -0.25;
    p.headX = -0.1;
    p.lookUp = 0.6;
    p.headY = Math.sin(c * 0.5) * 0.18;
    p.lean = Math.sin(c * 0.9) * 0.02 - 0.02;
  }

  private petPose(p: Pose) {
    const c = this.clock;
    p.lean = 0.55;
    p.bob = -0.04;
    p.thighLx = p.thighRx = -0.35;
    p.kneeLx = p.kneeRx = 0.6;
    p.headX = 0.3;
    p.armRx = -0.75 + Math.sin(c * 4) * 0.08;
    p.armRz = -0.1 + Math.sin(c * 4) * 0.25;
    p.foreRx = -0.45;
    p.armLx = -0.35;
    p.armLz = 0.2;
    p.foreLx = -0.4;
    p.happy = 0.8;
  }

  private target: Pose = neutralPose();

  private targetPose(): Pose {
    const p = this.target;
    Object.assign(p, neutralPose());
    return p;
  }

  private copyPose(p: Pose) {
    Object.assign(this.pose, p);
  }

  private walkPose(p: Pose, amp: number) {
    const w = this.walkPhase;
    const sn = Math.sin(w);
    p.thighLx = -sn * 0.8 * amp;
    p.thighRx = sn * 0.8 * amp;
    p.kneeLx = 0.12 + Math.max(0, Math.cos(w)) * 0.85 * amp;
    p.kneeRx = 0.12 + Math.max(0, -Math.cos(w)) * 0.85 * amp;
    p.armLx = sn * 0.7 * amp;
    p.armRx = -sn * 0.7 * amp;
    p.armLz = p.armRz = 0.12;
    p.foreLx = -0.35 - Math.max(0, -sn) * 0.3;
    p.foreRx = -0.35 - Math.max(0, sn) * 0.3;
    p.bob = Math.abs(sn) * 0.06 * amp;
    p.roll = Math.sin(w) * 0.05;
    p.twist = -Math.sin(w) * 0.12;
    p.headY = Math.sin(w) * 0.04;
    p.lean = 0.06;
  }

  private stepWave(dt: number, index: number, greet: boolean) {
    // wave once when reaching the door line (hello when entering, bye when leaving)
    if (this.waveT > 0) {
      this.waveT -= dt;
      this.sim.walking = false;
      return;
    }
    const trigger = greet ? 1 : this.path.length - 1; // just past the threshold (enter) / at the threshold (leave)
    if (this.pi === trigger && !this.waveDone.has(index)) {
      this.waveDone.add(index);
      this.waveT = 0.85;
    }
  }

  private wavePose(p: Pose) {
    const w = this.clock * 14;
    p.thighLx = p.thighRx = p.kneeLx = p.kneeRx = 0;
    p.bob = 0;
    p.armRx = -2.7;
    p.armRz = 0.35 + Math.sin(w) * 0.35;
    p.foreRx = -0.3;
    p.armLx = 0;
    p.happy = 1;
    p.headZ = Math.sin(this.clock * 3) * 0.08;
    p.lean = 0;
    p.roll = 0;
    p.twist = 0;
  }

  private idlePose(p: Pose) {
    const c = this.clock;
    p.lean = Math.sin(c * 1.6) * 0.015;
    p.headY = Math.sin(c * 0.7) * 0.12;
    p.armLz = p.armRz = 0.1 + Math.sin(c * 1.6) * 0.02;
  }

  private seatedPose(p: Pose, sit: number) {
    const l = -Math.PI / 2 * sit;
    const k = Math.PI / 2 * sit;
    p.thighLx = l;
    p.thighRx = l;
    p.kneeLx = k;
    p.kneeRx = k;
    if (sit > 0.98) {
      const c = this.clock;
      p.thighLx += Math.sin(c * 1.7) * 0.03;
      p.kneeRx += Math.max(0, Math.sin(c * 2.3)) * 0.12;
    }
  }

  private typePose(p: Pose, freq: number, amp: number) {
    const c = this.clock;
    this.typing = amp;
    p.armLx = p.armRx = -1.2;
    p.armLz = p.armRz = -0.12;
    p.foreLx = -0.42 + Math.sin(c * freq) * 0.09 * amp;
    p.foreRx = -0.42 + Math.sin(c * freq + 2.1) * 0.09 * amp;
    p.armLx += Math.sin(c * freq * 0.5 + 1) * 0.03 * amp;
    p.armRx += Math.sin(c * freq * 0.5) * 0.03 * amp;
    p.headX = 0.14 + Math.sin(c * 1.3) * 0.03;
    p.lean = 0.06 + Math.sin(c * 2) * 0.01;
  }

  private workPose(p: Pose, ctx: ActorCtx) {
    const c = this.clock;
    const age = ctx.lastSayAge;
    const resting = this.isResting(ctx);
    if (this.deskPetT >= 0) {
      // stroking the cat that naps on the desk, without getting up
      p.lean = 0.16;
      p.armRx = -1.0 + Math.sin(c * 4) * 0.08;
      p.armRz = -0.15 + Math.sin(c * 4) * 0.2;
      p.foreRx = -0.55;
      p.armLx = -1.2;
      p.armLz = -0.12;
      p.foreLx = -0.42;
      p.headX = 0.3;
      p.headY = 0.55;
      p.happy = 0.7;
      this.typing = 0;
      return;
    }
    const recv = this.isDirector ? ctx.now - ctx.rt.receivedAt : 99;
    if (recv < 1.8) {
      // just received a report: happy nod + thumbs up
      p.happy = 1;
      p.headX = 0.12 + Math.sin(recv * 10) * 0.14;
      p.armLx = p.armRx = -1.2;
      p.armLz = p.armRz = -0.12;
      p.foreLx = -0.42;
      p.foreRx = -0.42;
      p.armRx = -1.9 + Math.sin(recv * 9) * 0.1;
      p.foreRx = -1.1;
      p.lean = 0.02;
      this.typing = 0;
      return;
    }
    if (resting) {
      // nothing to do right now: leans back and watches the room
      p.lean = -0.1;
      p.armLx = p.armRx = -0.55;
      p.armLz = p.armRz = 0.35;
      p.foreLx = p.foreRx = -0.8;
      p.headX = -0.05;
      p.headY = Math.sin(c * 0.6) * 0.35;
      this.typing = this.isDirector ? 0.15 : 0;
      return;
    }
    if (ctx.lastKind === 'thinking' && age < 5) {
      // hand on chin
      p.armRx = -0.85;
      p.armRz = -0.55;
      p.foreRx = -2.05;
      p.armLx = -1.2;
      p.armLz = -0.12;
      p.foreLx = -0.42;
      p.headZ = 0.14;
      p.headX = -0.08;
      p.headY = Math.sin(c * 1.1) * 0.12;
      p.lookUp = 1;
      p.mouth = 'o';
      p.lean = -0.03;
      this.typing = 0;
      return;
    }
    if (age > 10) {
      // nothing to say for a while: slow typing + look around
      this.typePose(p, 7, 0.4);
      p.headX = 0.02;
      p.headY = Math.sin(c * 0.5) * 0.35;
      return;
    }
    this.typePose(p, ctx.lastKind === 'tool' ? 24 : 17, 1);
    if (ctx.lastKind === 'text') p.mouth = 'o';
  }

  private blink(dt: number) {
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkT = 2 + Math.random() * 3.5;
      this.blinkOpen = 0;
    }
    this.blinkOpen = Math.min(1, this.blinkOpen + dt * 9);
  }
}
