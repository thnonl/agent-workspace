import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Prop } from '../world/layout';
import { CactusProp, DeskPlant, FloorPlant, TallPlant } from './plants';

/** Dev-only plant gallery: open /?plantlab – floor plants, tall plants, cacti and desk plants, one species per column. */
const prop = (kind: Prop['kind'], variant: number, i: number): Prop => ({ kind, x: i * 3.1, z: 0, rot: 0, variant, color: ['#ef8a6d', '#5ba8d9', '#e9c46a', '#9b7ed9'][(variant + i) % 4], color2: '#ffffff' });

export function PlantLab() {
  return (
    <Canvas shadows flat camera={{ fov: 32, position: [0, 3.2, 7.5], near: 0.05, far: 60 }} style={{ position: 'fixed', inset: 0, background: '#dfe6f5' }}>
      <hemisphereLight args={['#ffffff', '#e8d6c4', 1.1]} />
      <directionalLight position={[3, 5, 4]} intensity={1.7} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 24]} />
        <meshStandardMaterial color="#f2dfc9" />
      </mesh>
      {[0, 1, 2, 3].map((v) => (
        <group key={`f${v}`} position={[(v - 1.5) * 1.3, 0, 1.6]}>
          <FloorPlant p={prop('plant', v, 0)} />
        </group>
      ))}
      {[0, 1, 2, 3].map((v) => (
        <group key={`t${v}`} position={[(v - 1.5) * 1.3, 0, -0.4]}>
          <TallPlant p={prop('tallPlant', v, 0)} />
        </group>
      ))}
      {[0, 1, 2, 3].map((v) => (
        <group key={`c${v}`} position={[(v - 1.5) * 1.3, 0, -2.4]}>
          <CactusProp p={prop('cactus', v, 0)} />
        </group>
      ))}
      {[0, 1, 2, 3].map((v) => (
        <group key={`d${v}`} position={[(v - 1.5) * 0.5, 0, 3.2]} scale={1.8}>
          <DeskPlant seed={v} color="#ef8a6d" />
        </group>
      ))}
      <OrbitControls target={[0, 0.7, 0.4]} />
    </Canvas>
  );
}
