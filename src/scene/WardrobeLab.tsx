import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { makeAppearance, type Appearance } from '../world/appearance';
import { buildCharacter, RIG_SCALE } from './character';
import { buildLaptop, LAPTOP_MODELS } from './laptop';

/**
 * Dev-only turntable for the look of people and laptops.
 *   /?wardrobe&seed=1&count=12&cols=6      a grid of people (seed, seed+1, …); `director=1` dresses them as directors
 *   /?wardrobe&top=blazer&hat=fedora       any Appearance field can be forced (top, bottom, hat, eyewear, neckwear, shoeStyle, …)
 *   /?wardrobe&back=1                      seen from behind
 *   /?wardrobe&laptops                     every laptop model, lid open
 * `window.__labCam(x, y, z)` moves the camera.
 */
const q = () => new URLSearchParams(location.search);

/** a value with commas (hat=beret,fedora) is handed out in turn: person 0 gets the first, person 1 the second … */
function overrides(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const skip = new Set(['seed', 'count', 'cols', 'director', 'back', 'wardrobe', 'laptops', 'zoom']);
  for (const [k, v] of q()) {
    if (skip.has(k)) continue;
    const one = (x: string) => (x === 'true' ? true : x === 'false' ? false : x);
    out[k] = v.includes(',') ? v.split(',').map(one) : one(v);
  }
  return out;
}

function Person({ seed, index, x, z, back, director, over }: { seed: number; index: number; x: number; z: number; back: boolean; director: boolean; over: Record<string, unknown> }) {
  const rig = useMemo(() => {
    const picked: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(over)) picked[k] = Array.isArray(v) ? v[index % v.length] : v;
    const a = { ...makeAppearance(seed, { director }), ...picked } as Appearance;
    const r = buildCharacter(a);
    r.root.scale.setScalar(RIG_SCALE * a.scale);
    return r;
  }, [seed, index, director, over]);
  return (
    <group position={[x, 0, z]} rotation={[0, back ? Math.PI : 0, 0]}>
      <primitive object={rig.root} />
    </group>
  );
}

function Laptop({ index, x }: { index: number; x: number }) {
  const lap = useMemo(() => {
    const l = buildLaptop('#6ec6ff', '#ff9ec4', index, index);
    l.lid.rotation.x = 1.85;
    // (the person's typing animation sizes these lines; here they get a fixed length)
    l.lines.forEach((ln, i) => {
      ln.scale.x = 0.08 + 0.05 * (i % 3);
      ln.position.x = -0.16 + ln.scale.x / 2;
    });
    return l;
  }, [index]);
  return (
    <group position={[x, 0, 0]} scale={2.4} rotation={[0, 0.35, 0]}>
      <primitive object={lap.root} />
    </group>
  );
}

function CamHook({ target }: { target: [number, number, number] }) {
  const { camera } = useThree();
  useEffect(() => {
    (window as unknown as { __labCam?: (x: number, y: number, z: number) => void }).__labCam = (x, y, z) => camera.position.set(x, y, z);
    void target;
  }, [camera, target]);
  return null;
}

export function WardrobeLab() {
  const p = q();
  const seed = Number(p.get('seed') ?? 1);
  const count = Math.max(1, Math.min(48, Number(p.get('count') ?? 12)));
  const cols = Math.max(1, Math.min(12, Number(p.get('cols') ?? 6)));
  const back = p.get('back') === '1';
  const director = p.get('director') === '1';
  const laptops = p.has('laptops');
  const over = useMemo(overrides, []);
  const rows = Math.ceil(count / cols);
  const width = (Math.min(count, cols) - 1) * 1.25;
  const target: [number, number, number] = laptops ? [(LAPTOP_MODELS - 1) * 0.5, 0.3, 0] : [0, 0.8, (rows - 1) * 0.6];
  const dist = laptops ? LAPTOP_MODELS * 0.55 + 2 : Math.max(6, width * 0.95 + rows * 0.8);
  return (
    <Canvas shadows flat camera={{ fov: 32, position: laptops ? [target[0], 2.6, dist] : [0, 2.2 + rows * 0.25, dist + rows * 1.2], near: 0.05, far: 200 }} style={{ position: 'fixed', inset: 0, background: '#dfe6f5' }}>
      <hemisphereLight args={['#ffffff', '#e8d6c4', 1.1]} />
      <directionalLight position={[3, 8, 6]} intensity={1.7} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#f2dfc9" />
      </mesh>
      {laptops
        ? Array.from({ length: LAPTOP_MODELS }, (_, i) => <Laptop key={i} index={i} x={i * 1.0} />)
        : Array.from({ length: count }, (_, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            return <Person key={i} index={i} seed={seed + i} x={(col - (Math.min(count, cols) - 1) / 2) * 1.25} z={row * 1.6} back={back} director={director} over={over} />;
          })}
      <CamHook target={target} />
      <OrbitControls target={target} />
    </Canvas>
  );
}
