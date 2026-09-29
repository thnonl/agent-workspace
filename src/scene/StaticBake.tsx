import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bakes all static meshes below it into a few merged meshes (one per material / shadow flag).
 * A room has thousands of tiny primitives; merging turns thousands of draw calls into a few dozen.
 * Anything that moves must be flagged with `userData={{ dynamic: true }}` and is left untouched.
 */
export function StaticBake({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const tmp = new THREE.Matrix4();
    const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
    const sources: THREE.Mesh[] = [];

    const visit = (o: THREE.Object3D) => {
      if (o.userData.dynamic || !o.visible || o.userData.baked) return;
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
          const key = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`;
          let b = buckets.get(key);
          if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, recv: m.receiveShadow, geos: [] }));
          b.geos.push(geo);
          sources.push(m);
        }
      }
      for (const c of o.children) visit(c);
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

    return () => {
      merged.forEach((m) => {
        root.remove(m);
        m.geometry.dispose();
      });
      sources.forEach((s) => (s.visible = true));
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
