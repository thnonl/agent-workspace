import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from './twin';

/**
 * Turns the static parts of a character (every mesh below a joint, down to the next joint) into three skinned meshes that share one
 * skeleton made of the joints themselves: one for everything that is lit, one for the flat unlit parts, one for the see-through ones.
 * Every vertex follows exactly one joint, so the picture is the same as with a mesh per joint and material – but a person is
 * three draw calls instead of about fifty. The joints keep being animated by moving the Object3Ds, as before.
 *
 * Colour and surface are per vertex: `color` carries the material colour (and the opacity of see-through parts), `aSurf`
 * the roughness and metalness (the lit material reads them instead of its own uniforms).
 */

let flat: THREE.MeshBasicMaterial | null = null;
let glass: THREE.MeshBasicMaterial | null = null;

type Kind = 'lit' | 'flat' | 'glass';

/** Which of the three meshes a material goes into (null: it needs more than a colour, the part stays an ordinary mesh). */
function kindOf(mat: THREE.Material): Kind | null {
  if (mat.side !== THREE.FrontSide || !mat.userData.fixed) return null;
  const s = mat as THREE.MeshStandardMaterial;
  if (s.isMeshStandardMaterial) {
    if (mat.transparent || s.map || s.normalMap || s.alphaMap || s.roughnessMap || s.metalnessMap || s.emissiveMap || s.aoMap) return null;
    if (s.emissiveIntensity > 0 && s.emissive.getHex() !== 0) return null;
    return 'lit';
  }
  const b = mat as THREE.MeshBasicMaterial;
  if (b.isMeshBasicMaterial) {
    if (b.map || b.alphaMap) return null;
    return b.transparent ? 'glass' : 'flat';
  }
  return null;
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
  }
}

/**
 * `root` must stand untouched at the origin (the bind pose is the pose it has now). `joints` become the bones; `skip` holds the
 * nodes that are left alone together with everything below them (the joints themselves, parts that animate on their own).
 * Parts the skinned meshes cannot take stay where they are.
 */
export function skinRig(root: THREE.Object3D, joints: THREE.Object3D[], skip: ReadonlySet<THREE.Object3D>) {
  root.updateMatrixWorld(true);
  const index = new Map(joints.map((j, i) => [j, i] as const));
  const buckets: Record<Kind, THREE.BufferGeometry[]> = { lit: [], flat: [], glass: [] };
  const removed: THREE.Object3D[] = [];

  const visit = (o: THREE.Object3D, bone: number) => {
    if (skip.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material)) {
      const kind = kindOf(m.material);
      if (kind) {
        let geo = m.geometry.clone();
        if (geo.index) geo = geo.toNonIndexed();
        for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
        geo.applyMatrix4(m.matrixWorld);
        if (m.matrixWorld.determinant() < 0) flipWinding(geo);
        const n = geo.attributes.position.count;
        const c = (m.material as THREE.MeshStandardMaterial).color;
        const alpha = kind === 'glass';
        const col = new Float32Array(n * (alpha ? 4 : 3));
        const op = m.material.opacity;
        for (let i = 0; i < n; i++) {
          if (alpha) {
            col[i * 4] = c.r;
            col[i * 4 + 1] = c.g;
            col[i * 4 + 2] = c.b;
            col[i * 4 + 3] = op;
          } else {
            col[i * 3] = c.r;
            col[i * 3 + 1] = c.g;
            col[i * 3 + 2] = c.b;
          }
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, alpha ? 4 : 3));
        if (kind === 'lit') {
          const s = m.material as THREE.MeshStandardMaterial;
          const surf = new Float32Array(n * 2);
          for (let i = 0; i < n; i++) {
            surf[i * 2] = s.roughness;
            surf[i * 2 + 1] = s.metalness;
          }
          geo.setAttribute('aSurf', new THREE.BufferAttribute(surf, 2));
        }
        const si = new Uint16Array(n * 4);
        const sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          si[i * 4] = bone;
          sw[i * 4] = 1;
        }
        geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
        geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
        buckets[kind].push(geo);
        removed.push(o);
      }
    }
    for (const c of o.children) visit(c, bone);
  };
  for (const j of joints) for (const c of [...j.children]) visit(c, index.get(j)!);
  for (const o of removed) o.parent?.remove(o);

  const skeleton = new THREE.Skeleton(joints as unknown as THREE.Bone[], joints.map((j) => new THREE.Matrix4().copy(j.matrixWorld).invert()));
  const meshes: THREE.SkinnedMesh[] = [];
  const bind = new THREE.Matrix4();
  const box = new THREE.Box3();
  (Object.keys(buckets) as Kind[]).forEach((kind) => {
    const geos = buckets[kind];
    if (!geos.length) return;
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) return;
    geo.userData.owned = true;
    const mat = kind === 'lit' ? litMaterial(true) : kind === 'flat' ? (flat ??= new THREE.MeshBasicMaterial({ vertexColors: true })) : (glass ??= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }));
    const mesh = new THREE.SkinnedMesh(geo, mat);
    // (the box of the bind pose is of no use for culling once the person has moved on: a person is small enough to always draw)
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    root.add(mesh);
    mesh.bind(skeleton, bind);
    meshes.push(mesh);
    if (kind === 'lit') box.setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
  });

  // Picking: a ray is tested against the box of the bind pose (testing the skinned triangles would skin every vertex of the person on the CPU for each pointer move)
  const hit = new THREE.Vector3();
  const local = new THREE.Ray();
  const inv = new THREE.Matrix4();
  meshes.forEach((m, i) => {
    m.raycast = i > 0 || box.isEmpty()
      ? () => undefined
      : (raycaster, intersects) => {
          inv.copy(m.matrixWorld).invert();
          local.copy(raycaster.ray).applyMatrix4(inv);
          if (!local.intersectBox(box, hit)) return;
          hit.applyMatrix4(m.matrixWorld);
          intersects.push({ distance: raycaster.ray.origin.distanceTo(hit), point: hit.clone(), object: m });
        };
  });
  return meshes;
}
