import { sfx } from '../audio';
import { runtimeFor } from './registry';

/**
 * Little celebrations and effects of the office. The store raises them (a run is finished, the agent committed or pushed),
 * the room's `CelebrationFx` (confetti, sparkles, cake, steam...) picks them up on its next frame, and the people in the
 * room cheer for a moment. `burst` is the same for small effects at a place (poking the coffee machine).
 */
export type Celebration = 'run' | 'commit' | 'push' | 'cake';
/** effects at a place: steam, bubbles, fish food sparkles, music notes */
export type Burst = 'steam' | 'bubbles' | 'feed' | 'notes';

export interface Show {
  kind: Celebration | Burst;
  /** room space */
  at?: [number, number, number];
}

const queues = new Map<string, Show[]>();

const CHEER_S: Record<Celebration, number> = { run: 3.6, push: 2.6, commit: 1.6, cake: 0 };

function enqueue(roomId: string, show: Show) {
  const q = queues.get(roomId) ?? [];
  q.push(show);
  queues.set(roomId, q);
}

export function celebrate(roomId: string, kind: Celebration) {
  enqueue(roomId, { kind });
  const rt = runtimeFor(roomId);
  const now = performance.now() / 1000;
  if (CHEER_S[kind]) rt.cheerUntil = Math.max(rt.cheerUntil, now + CHEER_S[kind]);
  // (only the room on screen is heard)
  if (kind === 'run') {
    sfx('fanfare', roomId);
    window.setTimeout(() => sfx('clap', roomId), 700);
  } else if (kind === 'push') {
    sfx('confetti', roomId);
    window.setTimeout(() => sfx('sparkle', roomId), 250);
  } else if (kind === 'commit') sfx('sparkle', roomId);
}

export function burst(roomId: string, kind: Burst, at: [number, number, number]) {
  enqueue(roomId, { kind, at });
}

/** Effects waiting to be shown in a room (the list is emptied). */
export function takeCelebrations(roomId: string): Show[] {
  const q = queues.get(roomId);
  if (!q?.length) return [];
  queues.delete(roomId);
  return q;
}

export function dropCelebrations(roomId: string) {
  queues.delete(roomId);
}
