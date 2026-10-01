import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { frame } from '../sim/frame';
import { walkMatrices } from './matrixWalk';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** called when the GPU has a copy of an attribute: the CPU copy of a baked room is never read again (see below) */
function dropCpuCopy(this: THREE.BufferAttribute) {
  (this as unknown as { array: null }).array = null;
}

/**
 * Materials that only differ in colour share one baked mesh: the colour moves into a vertex colour attribute and the merged mesh
 * uses one vertex-coloured twin of the material. (A room used to end up with ~300 draw calls, one per colour.)
 * Only the fixed kit materials qualify (see `M` / `MB` in kit.ts): the lamp / glass materials of glow.ts change over the day.
 */
const twins = new Map<string, THREE.Material>();
function twinOf(mat: THREE.Material): { key: string; mat: THREE.Material } | null {
  if (!mat.userData.fixed || mat.transparent) return null;
  let key: string;
  let make: () => THREE.Material;
  if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const m = mat as THREE.MeshStandardMaterial;
    if (m.map || m.normalMap || m.alphaMap || m.roughnessMap || m.metalnessMap || m.emissiveMap || m.aoMap) return null;
    key = `s|${m.roughness}|${m.metalness}|${m.emissive.getHex()}|${m.emissiveIntensity}|${m.side}`;
    make = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: m.roughness, metalness: m.metalness, emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity, side: m.side });
  } else if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const m = mat as THREE.MeshBasicMaterial;
    if (m.map || m.alphaMap) return null;
    key = `b|${m.side}`;
    make = () => new THREE.MeshBasicMaterial({ vertexColors: true, side: m.side });
  } else return null;
  let t = twins.get(key);
  if (!t) twins.set(key, (t = make()));
  return { key, mat: t };
}

/**
 * Bakes all static meshes below it into a few merged meshes (one per material).
 * A room has thousands of tiny primitives; merging turns thousands of draw calls into a few dozen.
 * Anything that moves must be flagged with `userData={{ dynamic: true }}` and is left untouched.
 */
export function StaticBake({ children, ready = true }: { children: ReactNode; /** false while parts are still being mounted: the merge waits for the last one */ ready?: boolean }) {
  const ref = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !ready) return;
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
          // (meshes of different shape share a bucket now: they all need the same set of attributes)
          if (!geo.attributes.normal) geo.computeVertexNormals();
          if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
          // shadows are off, so the flags stay out of the key: one merged mesh per material (per kind of material when only the colour differs)
          const twin = twinOf(mat);
          if (twin) {
            const n = geo.attributes.position.count;
            const col = new Float32Array(n * 3);
            const c = (mat as THREE.MeshStandardMaterial).color;
            for (let i = 0; i < n; i++) {
              col[i * 3] = c.r;
              col[i * 3 + 1] = c.g;
              col[i * 3 + 2] = c.b;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          }
          const key = twin ? twin.key : mat.uuid;
          let b = buckets.get(key);
          if (!b) buckets.set(key, (b = { mat: twin ? twin.mat : mat, cast: false, recv: false, geos: [] }));
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
      // Nothing reads the vertices of a baked mesh again (it is never picked with the pointer), so once they are on the GPU the
      // CPU copy goes: a room's baked geometry is ~15 MB of typed arrays. The bounds are needed for culling and are made now.
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      for (const attr of Object.values(geo.attributes)) (attr as THREE.BufferAttribute).onUpload(dropCpuCopy);
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
  }, [ready]);

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
