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
  /** somebody (a person or an awake cat) moves in a visible room */
  dynamic: false,
  /** the camera is travelling / zooming on its own */
  cameraBusy: false,
  /** the scene needs full frame rate (otherwise it idles at a low rate, see IdleGovernor) */
  busy: true,
  /** static geometry appeared or changed: the shadow map must be redrawn */
  shadowDirty: true,
};

/** Rooms that are off screen advance their simulation at most this often (seconds). */
export const OFFSCREEN_STEP = 1 / 15;

/** Run after the 3D scene has drawn a frame (Scene calls them; keeps three out of the UI chunks). */
export const afterRender = new Set<() => void>();
