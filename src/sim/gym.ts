import { frame } from './frame';

/**
 * Tiny channel between the characters (sim/actor.ts) and the exercise props (scene/props.tsx).
 * Like the registry it lives outside React on purpose: nothing is allocated per frame.
 */

/** punch impulses waiting for the punching dummy of a room (consumed by the dummy's useFrame) */
export const dummyKicks = new Map<string, number>();

/** A punch lands: the dummy of this room recoils (ignored while the room is off screen). */
export function kickDummy(roomId: string, strength: number) {
  if (frame.visibleRooms.has(roomId)) dummyKicks.set(roomId, (dummyKicks.get(roomId) ?? 0) + strength);
}

/** room id -> time (performance.now) until which the pair of dumbbells of that room is in somebody's hands; it expires on its own, so it can never get stuck */
export const dumbbellsTaken = new Map<string, number>();

export function takeDumbbells(roomId: string) {
  dumbbellsTaken.set(roomId, performance.now() + 400);
}
