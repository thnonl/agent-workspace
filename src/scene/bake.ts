import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge every mesh below `root` (in root's local space) into one mesh per material / shadow flag.
 * Nodes in `skip` – and everything below them – are left alone (joints that animate on their own
 * bake themselves separately). The original meshes are removed from the graph.
 */
export function bakeGroup(root: THREE.Object3D, skip: ReadonlySet<THREE.Object3D> = new Set()) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const tmp = new THREE.Matrix4();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
  const removed: THREE.Object3D[] = [];

  const visit = (o: THREE.Object3D) => {
    if (skip.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material)) {
      let geo = m.geometry.clone();
      if (geo.index) geo = geo.toNonIndexed();
      for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
      tmp.multiplyMatrices(inv, m.matrixWorld);
      geo.applyMatrix4(tmp);
      const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, geos: [] }));
      b.geos.push(geo);
      removed.push(o);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of [...root.children]) visit(c);
  for (const o of removed) o.parent?.remove(o);
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    root.add(mesh);
  }
}
