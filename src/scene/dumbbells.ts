import * as THREE from 'three';
import { G, M, group, mesh } from './kit';

/**
 * A pair of small dumbbells for the lifting break, built once per character: one in each hand. The bar runs
 * across the body (hand-local x), so it stays correct while the forearm curls – no per-frame matrix work.
 */
export interface Dumbbells {
  right: THREE.Group;
  left: THREE.Group;
}

export function buildDumbbells(accent: string): Dumbbells {
  const steel = M('#9aa3b8', { metal: 0.6, rough: 0.3 });
  const iron = M(accent, { rough: 0.45, metal: 0.2 });
  const make = () => {
    const d = group();
    d.add(mesh(G.cyl(0.018, 0.018, 0.26, 8), steel, 0, 0, 0, { r: [0, 0, Math.PI / 2] }));
    for (const x of [-0.12, 0.12]) d.add(mesh(G.cyl(0.07, 0.07, 0.06, 6), iron, x, 0, 0, { r: [0, 0, Math.PI / 2], cast: false }));
    d.visible = false;
    return d;
  };
  return { right: make(), left: make() };
}
