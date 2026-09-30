import type * as THREE from 'three';

const skip = () => {};

/**
 * three recomputes the matrices of every object in the graph on every frame, hidden ones included.
 * Switching the walk off makes the whole subtree below `o` free (its world matrices stay as they are);
 * switching it on again brings the subtree up to date in the next frame.
 */
export function walkMatrices(o: THREE.Object3D, on: boolean) {
  if (on) delete (o as { updateMatrixWorld?: unknown }).updateMatrixWorld;
  else o.updateMatrixWorld = skip;
}
