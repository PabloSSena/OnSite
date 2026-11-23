import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import Avatar from './Avatar'
import type { Appearance } from './appearance'

function Turntable({ appearance }: { appearance: Appearance }) {
  const group = useRef<Group>(null!)
  useFrame((_, dt) => { group.current.rotation.y += Math.min(dt, 0.05) * 0.35 })
  return <group ref={group}>
    <Avatar preview player={{
      id: 'preview', name: 'You', color: appearance.topColor, appearance,
      x: 0, y: 0, z: 0, rotation: 0, animation: 'idle',
      punch: 0, punchLeft: 0, speaking: 0, voice: false, camera: false, holding: 'none', drink: 0,
    }} />
  </group>
}

export default function CharacterPreview({ appearance }: { appearance: Appearance }) {
  return <div className="character-preview" role="img" aria-label="Rotating character preview">
    <Canvas dpr={1} camera={{ position: [0, 1, -3.2], fov: 38 }}
      onCreated={({ camera }) => { camera.lookAt(0, 0.85, 0) }}>
      <hemisphereLight args={['#fff4da', '#708565', 2.5]} />
      <directionalLight position={[-3, 5, -4]} intensity={2} />
      <Turntable appearance={appearance} />
    </Canvas>
  </div>
}
