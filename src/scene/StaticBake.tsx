import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { frame } from '../sim/frame';
import { walkMatrices } from './matrixWalk';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bakes all static meshes below it into a few merged meshes (one per material).
 * A room has thousands of tiny primitives; merging turns thousands of draw calls into a few dozen.
 * Anything that moves must be flagged with `userData={{ dynamic: true }}` and is left untouched.
 */
export function StaticBake({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    // (the parents too: frozen nodes keep the world matrix they have now)
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const tmp = new THREE.Matrix4();
    const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
    const sources: THREE.Mesh[] = [];

    /** static subtrees whose matrices are never recomputed again (the merged meshes carry them now) */
    const frozen: THREE.Object3D[] = [];

    /** Returns true when the node or anything below it is left alone (dynamic, hidden, already baked). */
    const visit = (o: THREE.Object3D): boolean => {
      if (o.userData.dynamic || !o.visible || o.userData.baked) return true;
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && m.geometry) {
        const mat = m.material as THREE.Material;
        if (!mat.transparent) {
          let geo = m.geometry.clone();
          if (geo.index) geo = geo.toNonIndexed();
          for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
          tmp.multiplyMatrices(inv, m.matrixWorld);
          geo.applyMatrix4(tmp);
          if (tmp.determinant() < 0) flipWinding(geo);
          // shadows are off, so the flags stay out of the key: one merged mesh per material
          let b = buckets.get(mat.uuid);
          if (!b) buckets.set(mat.uuid, (b = { mat, cast: false, recv: false, geos: [] }));
          b.cast ||= m.castShadow;
          b.recv ||= m.receiveShadow;
          b.geos.push(geo);
          sources.push(m);
        }
      }
      let untouched = false;
      for (const c of o.children) untouched = visit(c) || untouched;
      // a subtree that was baked away (and holds nothing that moves) is not walked again
      if (!untouched) {
        frozen.push(o);
        walkMatrices(o, false);
      }
      return untouched;
    };
    for (const c of [...root.children]) visit(c);

    const merged: THREE.Mesh[] = [];
    for (const b of buckets.values()) {
      const geo = mergeGeometries(b.geos, false);
      b.geos.forEach((g) => g.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.recv;
      mesh.userData.baked = true;
      root.add(mesh);
      merged.push(mesh);
    }
    sources.forEach((s) => (s.visible = false));
    frame.shadowDirty = true;

    return () => {
      merged.forEach((m) => {
        root.remove(m);
        m.geometry.dispose();
      });
      sources.forEach((s) => (s.visible = true));
      frozen.forEach((o) => walkMatrices(o, true));
    };
  }, []);

  return <group ref={ref}>{children}</group>;
}

/** Mirrored transforms flip triangle winding; put it back so faces are not inside-out. */
function flipWinding(geo: THREE.BufferGeometry) {
  for (const attr of Object.values(geo.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const n = a.itemSize;
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = a.array[(i + 1) * n + k];
        (a.array as Float32Array)[(i + 1) * n + k] = a.array[(i + 2) * n + k];
        (a.array as Float32Array)[(i + 2) * n + k] = t;
      }
    }
    a.needsUpdate = true;
  }
}
