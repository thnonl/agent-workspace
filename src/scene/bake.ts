import { useLayoutEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge every mesh below `root` (in root's local space) into one mesh per material.
 * Nodes in `skip` – and everything below them – are left alone (joints that animate on their own
 * bake themselves separately). The original meshes are removed from the graph.
 */
export function bakeGroup(root: THREE.Object3D, skip: ReadonlySet<THREE.Object3D> = new Set(), hide = false) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const tmp = new THREE.Matrix4();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
  const removed: THREE.Object3D[] = [];

  const visit = (o: THREE.Object3D) => {
    if (skip.has(o) || (hide && !o.visible)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material)) {
      let geo = m.geometry.clone();
      if (geo.index) geo = geo.toNonIndexed();
      for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
      tmp.multiplyMatrices(inv, m.matrixWorld);
      geo.applyMatrix4(tmp);
      if (tmp.determinant() < 0) flipWinding(geo);
      let b = buckets.get(m.material.uuid);
      if (!b) buckets.set(m.material.uuid, (b = { mat: m.material, cast: false, recv: false, geos: [] }));
      b.cast ||= m.castShadow;
      b.recv ||= m.receiveShadow;
      b.geos.push(geo);
      removed.push(o);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of [...root.children]) visit(c);
  if (hide) removed.forEach((o) => (o.visible = false));
  else for (const o of removed) o.parent?.remove(o);
  const merged: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    geo.userData.owned = true;
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    root.add(mesh);
    merged.push(mesh);
  }
  return { merged, removed };
}

/** Frees the GPU buffers of everything a rig owns (merged geometry flagged `userData.owned`, skeleton bone textures). Shared G.* geometry is left alone. */
export function disposeOwned(...roots: THREE.Object3D[]) {
  for (const r of roots) {
    r.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) m.skeleton.dispose();
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.userData.owned) (o as THREE.Mesh).geometry.dispose();
    });
  }
}

/** Bakes a joint's static children once after mount; undone (and the merged geometry disposed) on unmount. */
export function useBaked(ref: RefObject<THREE.Object3D | null | (THREE.Object3D | null)[]>, skip?: ReadonlySet<THREE.Object3D>) {
  useLayoutEffect(() => {
    const cur = ref.current;
    const roots = (Array.isArray(cur) ? cur : [cur]).filter((r): r is THREE.Object3D => !!r);
    const done = roots.map((root) => ({ root, ...bakeGroup(root, skip, true) }));
    return () => {
      for (const { root, merged, removed } of done) {
        merged.forEach((m) => {
          root.remove(m);
          m.geometry.dispose();
        });
        removed.forEach((o) => (o.visible = true));
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Mirrored transforms flip triangle winding; put it back so faces are not inside-out. */
function flipWinding(geo: THREE.BufferGeometry) {
  for (const attr of Object.values(geo.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const n = a.itemSize;
    const arr = a.array as Float32Array;
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k];
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
        arr[(i + 2) * n + k] = t;
      }
    }
    a.needsUpdate = true;
  }
}
