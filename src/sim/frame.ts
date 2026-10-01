/**
 * Per-frame facts computed once by `FrameSync` (scene/Scene.tsx) before any other `useFrame` runs,
 * so every component reads the same answer instead of recomputing it (or allocating for it).
 * Like the registry it lives outside React on purpose.
 */
export const frame = {
  /** frame counter; caches keyed on it (see registry.ts) are valid for exactly one frame */
  n: 1,
  /** a room is active (its centre lives in scene/Scene.tsx) */
  hasActive: false,
  fit: 20,
  /** rooms that intersect the camera frustum – everything else is simulated at a reduced rate and not animated */
  visibleRooms: new Set<string>(),
  /** the store's active room (full rate); visible rooms other than this one are "background" */
  activeId: null as string | null,
  /** rooms whose decor animates this frame: the active one, plus background rooms that ticked (see roomStep) */
  animRooms: new Set<string>(),
  /** rooms that are in the 3D scene (being built or built, with or without their people); every other room only exists in the store */
  mountedRooms: new Set<string>(),
  /** rooms that finished loading (static bake done and two frames drawn), see RoomView / the staging in Scene */
  readyRooms: new Set<string>(),
  /** somebody (a person or an awake cat) moves in a visible room */
  dynamic: false,
  /** the camera is travelling / zooming on its own */
  cameraBusy: false,
  /** rooms that are still being built stage by stage (their frames are slow and say nothing about the speed of the machine) */
  building: 0,
  /** the scene needs full frame rate (otherwise it idles at a low rate, see IdleGovernor) */
  busy: true,
  /** static geometry appeared or changed: the shadow map must be redrawn */
  shadowDirty: true,
};

/** Rooms that are visible but not the active one (the neighbours at the screen edge) advance at most this often (seconds). */
export const BACKGROUND_STEP = 0.4;
/** Rooms that are off screen advance their simulation at most this often (seconds). */
export const HIDDEN_STEP = 1;
/** Largest time slice one update may take: the active room's frames are short, a slow room takes one long step (still real time). */
export const ACTIVE_MAX_DT = 0.1;
export const SLOW_MAX_DT = 1.5;

/** Somebody who sits still (resting, asleep, waiting) is updated at most this often (seconds): the ones who move get the time. */
export const CALM_STEP = 0.1;

/** Minimum time between two updates of the sim / animation of a room (0: every frame). Reads `frame`, allocates nothing. */
export function roomStep(roomId: string): number {
  if (roomId === frame.activeId) return 0;
  return frame.visibleRooms.has(roomId) ? BACKGROUND_STEP : HIDDEN_STEP;
}
/** Time slice for an update that waited `pending` seconds under `step` (see roomStep). */
export function stepDt(pending: number, step: number): number {
  return Math.min(pending, step === 0 ? ACTIVE_MAX_DT : SLOW_MAX_DT);
}

/** Run after the 3D scene has drawn a frame (Scene calls them; keeps three out of the UI chunks). */
export const afterRender = new Set<() => void>();
