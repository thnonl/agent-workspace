import { FOOT, type RoomLayout } from '../world/layout';
import type { V2 } from '../world/nav';
import { movedOf, notifyMoved, type MovedProp } from './registry';

/** clear floor kept all round a prop that is set down (the nav grid pad used for props) */
const PAD = 0.2;
/** a prop with more free floor than this between its edge and the nearest wall is "in the middle of the room" */
const OPEN_GAP = 0.7;
/** how long a prop that was carried stays where it is */
const REST_S = 120;

export interface Place {
  x: number;
  z: number;
  rot: number;
}

/** free floor between the edge of a prop standing at (x, z) and the nearest wall */
function wallGap(layout: RoomLayout, x: number, z: number, kind: keyof typeof FOOT): number {
  const [w, d] = FOOT[kind];
  return Math.min(layout.width / 2 - Math.abs(x), layout.depth / 2 - Math.abs(z)) - Math.min(w, d) / 2;
}

/** the plants and cartons that stand out in the room (and are free to be carried): the ones worth tidying away */
export function untidyProps(roomId: string, layout: RoomLayout, now: number): number[] {
  const items = movedOf(roomId, layout);
  const out: number[] = [];
  items.forEach((it, i) => {
    if (it.state !== 'placed' || it.by) return;
    if (it.movedAt && now - it.movedAt < REST_S) return;
    if (wallGap(layout, it.x, it.z, layout.props[it.prop].kind) > OPEN_GAP) out.push(i);
  });
  return out;
}

/** Everything people have to be able to reach (desks, the director, the stations, the cats' places): a tidy place must not cut any of it off. */
function mustReach(layout: RoomLayout): V2[] {
  return [
    ...layout.desks.map((d) => d.approach), layout.director.approach, ...layout.director.visitors, ...layout.director.waiting,
    ...layout.stations.map((s) => s.stand), ...layout.spots.map((s) => s.approach),
    ...layout.toys.flatMap((t) => (t.approach ? [t.approach] : [])), ...layout.catWindows.map((c) => c.land),
  ];
}

/**
 * A tidier place for the prop: against a wall, facing the room, on clear floor that leaves every walkway open. Nearest first,
 * so the prop is not carried half across the building. Null when there is nowhere.
 */
export function findTidySpot(roomId: string, layout: RoomLayout, idx: number): Place | null {
  const items = movedOf(roomId, layout);
  const it = items[idx];
  const prop = layout.props[it.prop];
  const [w, d] = FOOT[prop.kind];
  const { width: W, depth: D, nav, door } = layout;
  const edge = 0.5; // from the wall to the prop
  const along = Math.max(w, d) / 2 + 0.5;
  const cands: Place[] = [];
  for (let x = -W / 2 + along; x <= W / 2 - along; x += 0.4) {
    cands.push({ x, z: -D / 2 + edge + d / 2, rot: 0 }, { x, z: D / 2 - edge - d / 2, rot: Math.PI });
  }
  for (let z = -D / 2 + along; z <= D / 2 - along; z += 0.4) {
    cands.push({ x: -W / 2 + edge + d / 2, z, rot: Math.PI / 2 }, { x: W / 2 - edge - d / 2, z, rot: -Math.PI / 2 });
  }
  const far = (x: number, z: number, list: readonly V2[], r: number) => list.every((q) => Math.hypot(q.x - x, q.z - z) > r);
  const keepClear: V2[] = [
    door.inside, ...layout.stations.flatMap((s) => [s.stand, s.target]), ...layout.spots.map((s) => s.approach),
    ...layout.catWindows.flatMap((c) => [c.land, c.sill]), ...layout.toys.map((t) => ({ x: t.x, z: t.z })),
    ...items.flatMap((o, k) => (k === idx ? [] : [o, ...(o.to ? [o.to] : [])])),
  ];
  const r = Math.max(w, d) / 2;
  const ok = cands
    .filter((c) => Math.hypot(c.x - it.x, c.z - it.z) > 1.5 && far(c.x, c.z, keepClear, r + 0.7) && nav.orientedFree(c.x, c.z, w, d, c.rot, PAD))
    .sort((a, b) => Math.hypot(a.x - it.x, a.z - it.z) - Math.hypot(b.x - it.x, b.z - it.z));
  const targets = mustReach(layout);
  for (const c of ok.slice(0, 8)) {
    // try it: the prop leaves its old place and takes the new one – can everybody still get everywhere?
    nav.unblockOriented(it.x, it.z, w, d, it.rot, PAD);
    nav.blockOriented(c.x, c.z, w, d, c.rot, PAD);
    const fine = targets.every((t) => nav.reachable(door.inside, t));
    nav.unblockOriented(c.x, c.z, w, d, c.rot, PAD);
    nav.blockOriented(it.x, it.z, w, d, it.rot, PAD);
    if (fine) return c;
  }
  return null;
}

/** where to stand beside a prop at (x, z) to pick it up / set it down: on the side of `from`, or any free side */
export function standBeside(layout: RoomLayout, kind: keyof typeof FOOT, x: number, z: number, from: V2): V2 | null {
  const [w, d] = FOOT[kind];
  const rad = Math.max(w, d) / 2 + PAD + 0.4;
  const base = Math.atan2(from.z - z, from.x - x);
  let best: V2 | null = null;
  for (let k = 0; k < 12; k++) {
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
    const p = { x: x + Math.cos(a) * rad, z: z + Math.sin(a) * rad };
    if (layout.nav.isBlocked(p.x, p.z) || !layout.nav.reachable(from, p)) continue;
    best = p;
    break;
  }
  return best;
}

/** The prop stands at its new place: the nav grid follows, the room draws it there. */
export function commitMove(roomId: string, layout: RoomLayout, idx: number, to: Place, now: number) {
  const it: MovedProp = movedOf(roomId, layout)[idx];
  const [w, d] = FOOT[layout.props[it.prop].kind];
  layout.nav.unblockOriented(it.x, it.z, w, d, it.rot, PAD);
  layout.nav.blockOriented(to.x, to.z, w, d, to.rot, PAD);
  it.x = to.x;
  it.z = to.z;
  it.rot = to.rot;
  it.state = 'placed';
  it.by = null;
  it.to = null;
  it.movedAt = now;
  notifyMoved(roomId);
}
