import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { useNetwork } from './network'
import type { Box } from './world'

// A small amber bottle, about 24 cm tall, centred on its body.
// `overlay` matches the first-person hands, drawn over the world.
export function BeerBottle({ overlay = false }: { overlay?: boolean }) {
  const material = { depthTest: !overlay, depthWrite: !overlay, flatShading: true }
  const order = overlay ? 9 : 0
  return <group>
    <mesh renderOrder={order}>
      <cylinderGeometry args={[0.034, 0.034, 0.13, 10]} />
      <meshStandardMaterial color="#7a3e0e" roughness={0.25} {...material} />
    </mesh>
    <mesh position={[0, 0.005, 0]} renderOrder={order}>
      <cylinderGeometry args={[0.0355, 0.0355, 0.06, 10]} />
      <meshStandardMaterial color="#f2d27a" roughness={0.8} {...material} />
    </mesh>
    <mesh position={[0, 0.085, 0]} renderOrder={order}>
      <cylinderGeometry args={[0.014, 0.034, 0.04, 10]} />
      <meshStandardMaterial color="#7a3e0e" roughness={0.25} {...material} />
    </mesh>
    <mesh position={[0, 0.125, 0]} renderOrder={order}>
      <cylinderGeometry args={[0.013, 0.014, 0.045, 8]} />
      <meshStandardMaterial color="#7a3e0e" roughness={0.25} {...material} />
    </mesh>
    <mesh position={[0, 0.151, 0]} renderOrder={order}>
      <cylinderGeometry args={[0.016, 0.016, 0.01, 8]} />
      <meshStandardMaterial color="#c9ccc4" roughness={0.4} metalness={0.6} {...material} />
    </mesh>
  </group>
}

const shell = '#e4dfd3'
const inside = '#f6f3ea'

// The body is open at the front (-X) so the interior shows when the door swings.
// Collision still uses the full Box from world.ts; the door is visual only.
export default function Fridge({ data }: { data: Box }) {
  const door = useRef<THREE.Group>(null!)
  const interior = useRef<THREE.Group>(null!)
  // An emissive liner instead of a real light: every scene light costs every lit material.
  const glow = useRef<THREE.MeshStandardMaterial>(null!)
  const opening = useRef(useNetwork.getState().fridgeOpen ? 1 : 0)
  const [x, y, z] = data.position
  const [w, h, d] = data.size
  const t = 0.06
  useFrame((_, delta) => {
    const target = useNetwork.getState().fridgeOpen ? 1 : 0
    opening.current += (target - opening.current) * (1 - Math.exp(-8 * Math.min(delta, 0.1)))
    // Hinged on the side toward the worktop; the free edge swings out toward -X.
    door.current.rotation.y = -opening.current * 1.9
    glow.current.emissiveIntensity = opening.current * 0.8
    interior.current.visible = opening.current > 0.01
  })
  const panel = (key: string, px: number, py: number, pz: number, sx: number, sy: number, sz: number, color = shell) =>
    <mesh key={key} position={[px, py, pz]} castShadow receiveShadow>
      <boxGeometry args={[sx, sy, sz]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  return <group position={[x, y, z]} name="fridge">
    {panel('back', w / 2 - t / 2, 0, 0, t, h, d)}
    {panel('top', 0, h / 2 - t / 2, 0, w, t, d)}
    {panel('bottom', 0, -h / 2 + t / 2, 0, w, t, d)}
    {panel('left', 0, 0, -d / 2 + t / 2, w, h, t)}
    {panel('right', 0, 0, d / 2 - t / 2, w, h, t)}
    <mesh position={[w / 2 - t - 0.005, 0, 0]}>
      <boxGeometry args={[0.01, h - 2 * t, d - 2 * t]} />
      <meshStandardMaterial ref={glow} color={inside} emissive="#fff6dc" emissiveIntensity={0} roughness={0.5} />
    </mesh>
    {/* Skip the interior draw calls while the door is shut (most of the time). */}
    <group ref={interior} visible={opening.current > 0.01}>
      {[-0.45, 0.15].map(sy => panel(`shelf${sy}`, 0, sy, 0, w - 2 * t, 0.025, d - 2 * t, '#dfe9ea'))}
      {[-0.45, 0.15].flatMap(sy => [-0.42, -0.21, 0, 0.21, 0.42].map(sz =>
        <group key={`beer${sy}${sz}`} position={[-0.25, sy + 0.08, sz]}><BeerBottle /></group>))}
    </group>
    <group ref={door} position={[-w / 2, 0, -d / 2]}>
      {panel('door', -0.04, 0, d / 2, 0.08, h - 0.04, d)}
      {panel('handle', -0.11, 0.25, d - 0.12, 0.05, 0.6, 0.05, '#9aa29b')}
      {panel('seal', 0, 0, d / 2, 0.01, h - 0.2, d - 0.12, '#cfd6d2')}
    </group>
  </group>
}
