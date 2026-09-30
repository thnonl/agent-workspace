import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { neutralCatPose, poseByName, type CatPose } from '../sim/cat';
import { buildCat, makeCatLook } from './catModel';
import { applyCat, smoothPose } from './CatView';

/**
 * Dev-only cat turntable: open /?catlab&seed=3&pose=sit and orbit around a single cat.
 * `window.__labPose = 'walk'` switches pose, `window.__labCam(x, y, z)` moves the camera.
 */
function Cat({ seed, x, z }: { seed: number; x: number; z: number }) {
  const look = useMemo(() => makeCatLook(seed), [seed]);
  const rig = useMemo(() => buildCat(look), [look]);
  const pose = useRef<CatPose>(neutralCatPose());
  const clock = useRef(0);
  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1);
    const name = (window as unknown as { __labPose?: string }).__labPose ?? new URLSearchParams(location.search).get('pose') ?? 'idle';
    smoothPose(pose.current, poseByName(name, clock.current), Math.min(dt, 0.1));
    applyCat(rig, pose.current, clock.current);
  });
  return (
    <group position={[x, 0, z]}>
      <primitive object={rig.root} />
    </group>
  );
}

function CamHook() {
  const { camera } = useThree();
  useEffect(() => {
    (window as unknown as { __labCam?: (x: number, y: number, z: number) => void }).__labCam = (x, y, z) => camera.position.set(x, y, z);
  }, [camera]);
  return null;
}

export function CatLab() {
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get('seed') ?? 1);
  const count = Math.max(1, Math.min(32, Number(q.get('count') ?? 1)));
  const cols = Math.min(count, 8);
  const rows = Math.ceil(count / cols);
  return (
    <Canvas shadows flat camera={{ fov: 32, position: [1.1, 0.75, 1.3], near: 0.05, far: 50 }} style={{ position: 'fixed', inset: 0, background: '#dfe6f5' }}>
      <hemisphereLight args={['#ffffff', '#e8d6c4', 1.1]} />
      <directionalLight position={[3, 5, 4]} intensity={1.7} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#f2dfc9" />
      </mesh>
      {Array.from({ length: count }, (_, i) => (
        <Cat key={i} seed={seed + i} x={((i % cols) - (cols - 1) / 2) * 0.9} z={Math.floor(i / cols) * 0.9 - ((rows - 1) * 0.9) / 2} />
      ))}
      <CamHook />
      <OrbitControls target={[0, 0.22, 0]} />
    </Canvas>
  );
}
