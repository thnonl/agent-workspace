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
/** A light that a screen (laptop, phone) throws on the person in front of it: `pos` in view space, `color` already scaled by its strength. */
export interface ScreenLight {
  pos: { value: THREE.Vector3 };
  color: { value: THREE.Color };
}

/**
 * The skinned lit material of one person, with the glow of the screen they look at after dark: the parts that face the screen and are
 * near it take on its colour (a soft lambert term with a quick fall-off, added as emission, so no real light and no new shader per light).
 * Every person has their own instance for the uniforms; they all share one shader program.
 */
export function screenLitMaterial(): { mat: THREE.MeshStandardMaterial; light: ScreenLight } {
  const light: ScreenLight = { pos: { value: new THREE.Vector3() }, color: { value: new THREE.Color(0, 0, 0) } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
  mat.customProgramCacheKey = () => 'rig-surf-skin-screen';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uScreenPos = light.pos;
    shader.uniforms.uScreenCol = light.color;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSurf;\nvarying vec2 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSurf;\nuniform vec3 uScreenPos;\nuniform vec3 uScreenCol;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.y;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 toScreen = uScreenPos + vViewPosition;
          float dist = length(toScreen);
          float facing = max(dot(normal, toScreen / max(dist, 1e-4)), 0.0);
          // (capped close up: the hands on the keys must not burn out)
          totalEmissiveRadiance += uScreenCol * diffuseColor.rgb * (0.15 + facing) * min(0.5, 1.0 / (1.0 + dist * dist * 6.0));
        }`,
      );
  };
  return { mat, light };
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
