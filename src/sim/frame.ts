/**
 * Per-frame facts computed once by `FrameSync` (scene/Scene.tsx) before any other `useFrame` runs,
 * so every component reads the same answer instead of recomputing it (or allocating for it).
 * Like the registry it lives outside React on purpose.
 */
/**
 * After a switch the camera waits this long (ms) before it starts to move; everything of the old room has stopped by then, and the new
 * room starts to move at once (the camera glides while it does).
 */
export const PRE_ROLL_MS = 160;

/** a glide never lasts longer than this (ms) as far as drawing goes */
export const GLIDE_MAX_MS = 4000;

/** how many rooms after the one on screen are loaded ahead (see Preload in scene/Scene.tsx) */
export const PRELOAD_ROOMS = 5;

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
  /** somebody in the active room is on the move: walking, sitting down or getting up (cats do not count) */
  moving: false,
  /** rooms other than the active one are being built (loaded ahead) */
  aheadBuilding: 0,
  /** performance.now() of the last frame the scene drew (a stale value means nobody is looking: nothing is loaded then) */
  at: 0,
  /**
   * A room was just switched to: everything stands still from that moment until PRE_ROLL_MS have passed (the old room stays still after
   * that, the new one moves), and nothing is loaded ahead. See FrameSync.
   */
  settling: false,
  /**
   * The camera is gliding from one room to another: only those two are drawn (the rooms in between flash by too fast to be missed, and
   * each of them would be hundreds of draw calls per frame). `fromId` is the room that was left.
   */
  glide: false,
  fromId: null as string | null,
  /** the active room the settling is about, and when it was switched to */
  settleFor: null as string | null,
  switchAt: 0,
  /** another room is being loaded ahead, or is still waiting to be (the rest of the room list after the active room, see PRELOAD_ROOMS) */
  loading: false,
  /** when `loading` was last seen true (performance.now ms): the flag flickers between two rooms, so "nothing to load" is only trusted after a pause (see Actor, door gap) */
  loadingAt: 0,
  /** loading ahead may go on: nobody in the active room is on the move (see FrameSync, and the walking gap in Actor) */
  loadOk: true,
  /** the camera is travelling / zooming on its own */
  cameraBusy: false,
  /** rooms that are still being built stage by stage (their frames are slow and say nothing about the speed of the machine) */
  building: 0,
  /** somebody in the active room sits still with something to see (music, a video, a game…): the idle frame rate goes up a little */
  lively: false,
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
export const CALM_STEP = 0.055;

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
