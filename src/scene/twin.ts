import * as THREE from 'three';

/**
 * Materials that only differ in colour share one baked mesh: the colour moves into a vertex colour attribute and the merged mesh
 * uses one vertex-coloured twin of the material. (A room used to end up with ~300 draw calls, one per colour.)
 * Only the fixed kit materials qualify (see `M` / `MB` in kit.ts): the lamp / glass materials of glow.ts change over the day.
 */
const twins = new Map<string, THREE.Material>();

const lits: [THREE.MeshStandardMaterial | null, THREE.MeshStandardMaterial | null] = [null, null];
/**
 * The one lit material of every plain-coloured part that does not glow: colour in the vertex colours, roughness and metalness in the
 * `aSurf` attribute (it reads them instead of its own uniforms). So parts that differ in colour, roughness or metalness still share a mesh.
 * Skinned meshes get an instance of their own: three picks the shader program per object, and one material shared by skinned and
 * rigid meshes would switch programs on every draw.
 */
export function litMaterial(skinned = false) {
  const at = skinned ? 1 : 0;
  const have = lits[at];
  if (have) return have;
  const lit = new THREE.MeshStandardMaterial({ vertexColors: true });
  lits[at] = lit;
  lit.customProgramCacheKey = () => (skinned ? 'rig-surf-skin' : 'rig-surf');
  lit.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSurf;\nvarying vec2 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSurf;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.y;');
  };
  return lit;
}
export function twinOf(mat: THREE.Material): { key: string; mat: THREE.Material } | null {
  if (!mat.userData.fixed || mat.transparent) return null;
  let key: string;
  let make: () => THREE.Material;
  if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const m = mat as THREE.MeshStandardMaterial;
    if (m.map || m.normalMap || m.alphaMap || m.roughnessMap || m.metalnessMap || m.emissiveMap || m.aoMap) return null;
    if ((m.emissiveIntensity === 0 || m.emissive.getHex() === 0) && m.side === THREE.FrontSide) return { key: 'lit', mat: litMaterial() };
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

/** Makes a geometry ready to be merged with others that use the twin of `mat`: all attributes present, the colour of `mat` in every vertex. */
export function paintGeometry(geo: THREE.BufferGeometry, mat: THREE.Material) {
  // (meshes of different shape share a bucket now: they all need the same set of attributes)
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = (mat as THREE.MeshStandardMaterial).color;
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const s = mat as THREE.MeshStandardMaterial;
  if (s.isMeshStandardMaterial) {
    const surf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      surf[i * 2] = s.roughness;
      surf[i * 2 + 1] = s.metalness;
    }
    geo.setAttribute('aSurf', new THREE.BufferAttribute(surf, 2));
  }
}
