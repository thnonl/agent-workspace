/**
 * How many people are in each room, kept by the server in SQLite (`/api/room-people`). A reloaded page seats that many people
 * again (director + staff) the moment the room has work, instead of starting with the director alone.
 */
const ENDPOINT = '/api/room-people';
const FLUSH_MS = 1000;

/** head counts from the last page, not used yet (room id → people) */
const restore = new Map<string, number>();
/** what the server holds for rooms of this page */
const sent = new Map<string, number>();
const pending = new Map<string, number | null>();
let timer = 0;
let available = false;

/** Loads the saved head counts. Never rejects; without a server API nothing is restored or saved. */
export async function initRoomPeople(): Promise<void> {
  try {
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(ENDPOINT, { signal: ctl.signal, cache: 'no-store' });
    window.clearTimeout(t);
    if (!r.ok) return;
    const data = (await r.json()) as Record<string, number>;
    for (const [id, n] of Object.entries(data)) if (Number.isInteger(n) && n > 0) restore.set(id, n);
    available = true;
  } catch {
    /* no server API */
  }
}

/** The head count saved for the room by the previous page (once: the room is seated only the first time it gets work). */
export function takeRestoredPeople(roomId: string): number {
  const n = restore.get(roomId) ?? 0;
  restore.delete(roomId);
  return n;
}

async function flush(keepalive = false) {
  window.clearTimeout(timer);
  timer = 0;
  if (!pending.size) return;
  const batch = Object.fromEntries(pending);
  pending.clear();
  try {
    const r = await fetch(ENDPOINT, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch), keepalive });
    if (r.ok) return;
  } catch {
    /* try again below */
  }
  for (const [k, v] of Object.entries(batch)) if (!pending.has(k)) pending.set(k, v);
  timer = window.setTimeout(() => void flush(), 5000);
}

interface Source {
  getState: () => { rooms: Record<string, { demo: boolean }>; people: Record<string, { sessionId: string; present: boolean; inside?: boolean }>; activeRoomId: string | null };
  subscribe: (listener: (state: ReturnType<Source['getState']>, prev: ReturnType<Source['getState']>) => void) => () => void;
}

/** Writes the number of people present in every real room to the server whenever it changes. */
export function trackRoomPeople(store: Source) {
  if (!available) return;
  const update = () => {
    const { rooms, people, activeRoomId } = store.getState();
    const now = new Map<string, number>();
    for (const p of Object.values(people)) if (p.present && (p.inside !== false || p.sessionId !== activeRoomId) && rooms[p.sessionId] && !rooms[p.sessionId].demo) now.set(p.sessionId, (now.get(p.sessionId) ?? 0) + 1);
    const queue = (id: string, n: number | null) => {
      if (n === null ? !sent.has(id) : sent.get(id) === n) return;
      if (n === null) sent.delete(id);
      else sent.set(id, n);
      pending.set(id, n);
    };
    for (const [id, room] of Object.entries(rooms)) {
      // the saved count of a room that has not been seated yet stays on the server until it is
      if (room.demo || restore.has(id)) continue;
      queue(id, now.get(id) ?? null);
    }
    for (const id of [...sent.keys()]) if (!rooms[id]) queue(id, null); // the session ended
    if (pending.size && !timer) timer = window.setTimeout(() => void flush(), FLUSH_MS);
  };
  store.subscribe((s, prev) => {
    if (s.people !== prev.people || s.rooms !== prev.rooms) update();
  });
  window.addEventListener('pagehide', () => void flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush(true);
  });
}
