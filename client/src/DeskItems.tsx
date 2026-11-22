import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { DeskItem } from './desks'

// Small procedural props built from primitives; positions are relative to the desktop surface.
type V = [number, number, number]
const Cyl = ({ p, r, h, c, top }: { p: V; r: number; h: number; c: string; top?: number }) =>
  <mesh position={p} castShadow><cylinderGeometry args={[top ?? r, r, h, 16]} /><meshStandardMaterial color={c} roughness={0.7} /></mesh>
const Ball = ({ p, r, c, s = [1, 1, 1] }: { p: V; r: number; c: string; s?: V }) =>
  <mesh position={p} scale={s} castShadow><sphereGeometry args={[r, 16, 12]} /><meshStandardMaterial color={c} roughness={0.6} /></mesh>
const Cube = ({ p, s, c, r = [0, 0, 0] }: { p: V; s: V; c: string; r?: V }) =>
  <mesh position={p} rotation={r} castShadow><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={0.8} /></mesh>
const Pot = ({ r = 0.07, h = 0.09 }) => <Cyl p={[0, h / 2, 0]} r={r * 0.8} top={r} h={h} c="#c4704f" />

function LavaLamp() {
  const blobs = useRef<Group>(null)
  useFrame(({ clock }) => {
    blobs.current?.children.forEach((blob, i) => {
      blob.position.y = 0.12 + 0.07 * (1 + Math.sin(clock.elapsedTime * (0.6 + i * 0.25) + i * 2))
    })
  })
  return <>
    <Cyl p={[0, 0.03, 0]} r={0.05} top={0.035} h={0.06} c="#3d4b56" />
    <mesh position={[0, 0.16, 0]}>
      <cylinderGeometry args={[0.025, 0.04, 0.2, 16]} />
      <meshStandardMaterial color="#ff9f6b" emissive="#ff6b6b" emissiveIntensity={0.6} transparent opacity={0.6} />
    </mesh>
    <group ref={blobs}>
      {[0, 1].map(i => <mesh key={i} position={[0, 0.15, 0]}>
        <sphereGeometry args={[0.016, 10, 8]} />
        <meshStandardMaterial color="#ffd26b" emissive="#ffb347" emissiveIntensity={1} />
      </mesh>)}
    </group>
    <Cyl p={[0, 0.28, 0]} r={0.025} top={0.015} h={0.04} c="#3d4b56" />
  </>
}

export function DeskItemModel({ item }: { item: DeskItem }) {
  switch (item) {
    case 'succulent':
      return <><Pot />{[0, 1, 2, 3, 4].map(i => <Ball key={i} r={0.035} c="#7fb88a"
        p={[Math.cos(i * 1.26) * 0.03, 0.11, Math.sin(i * 1.26) * 0.03]} s={[1, 0.6, 1.4]} />)}</>
    case 'cactus':
      return <><Pot /><Cyl p={[0, 0.19, 0]} r={0.04} h={0.2} c="#4f9a5d" />
        <Ball p={[0, 0.29, 0]} r={0.04} c="#4f9a5d" />
        <Cyl p={[0.055, 0.2, 0]} r={0.018} h={0.08} c="#4f9a5d" />
        <Ball p={[0.075, 0.25, 0]} r={0.02} c="#ff7c9a" /></>
    case 'monstera':
      return <><Pot r={0.1} h={0.13} />{[0, 1, 2, 3, 4].map(i => {
        const a = i * 1.3
        return <group key={i} position={[0, 0.13, 0]} rotation={[0, a, 0.5 + (i % 2) * 0.3]}>
          <Cyl p={[0, 0.08, 0]} r={0.006} h={0.16} c="#3f7b48" />
          <Ball p={[0, 0.17, 0]} r={0.09} c={i % 2 ? '#3f8c4e' : '#2f7a43'} s={[1, 0.12, 0.7]} />
        </group>
      })}</>
    case 'mug':
      return <><Cyl p={[0, 0.05, 0]} r={0.045} h={0.1} c="#ff7c9a" />
        <Cyl p={[0, 0.098, 0]} r={0.038} h={0.005} c="#5b3a29" />
        <mesh position={[0.05, 0.05, 0]} castShadow><torusGeometry args={[0.025, 0.008, 8, 16]} /><meshStandardMaterial color="#ff7c9a" /></mesh></>
    case 'books':
      return <>{[['#52d6b1', 0.1], ['#ffb86b', -0.15], ['#72baff', 0.25]].map(([c, r], i) =>
        <Cube key={i} p={[0, 0.02 + i * 0.04, 0]} s={[0.22, 0.038, 0.16]} c={c as string} r={[0, r as number, 0]} />)}</>
    case 'duck':
      return <><Ball p={[0, 0.05, 0]} r={0.055} c="#ffd84a" s={[1.2, 0.9, 1]} />
        <Ball p={[0.045, 0.11, 0]} r={0.035} c="#ffd84a" />
        <Cube p={[0.085, 0.105, 0]} s={[0.035, 0.012, 0.03]} c="#ff8a3d" />
        <Ball p={[0.065, 0.122, 0.022]} r={0.006} c="#25333e" /></>
    case 'figurine':
      return <><Cyl p={[0, 0.01, 0]} r={0.05} h={0.02} c="#25333e" />
        <Cyl p={[0, 0.07, 0]} r={0.028} top={0.02} h={0.1} c="#b69cff" />
        <Ball p={[0, 0.145, 0]} r={0.03} c="#efc9a9" />
        <Cube p={[0, 0.175, 0]} s={[0.05, 0.015, 0.05]} c="#b69cff" /></>
    case 'snowglobe':
      return <><Cyl p={[0, 0.02, 0]} r={0.06} top={0.05} h={0.04} c="#805539" />
        <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.065, 20, 14]} />
          <meshStandardMaterial color="#d8f1ff" transparent opacity={0.3} roughness={0.05} /></mesh>
        <mesh position={[0, 0.1, 0]}><coneGeometry args={[0.025, 0.06, 10]} /><meshStandardMaterial color="#3f7b48" /></mesh>
        <Ball p={[0, 0.05, 0]} r={0.045} c="#ffffff" s={[1, 0.2, 1]} /></>
    case 'headphones':
      return <><Cyl p={[0, 0.01, 0]} r={0.05} h={0.02} c="#3d4b56" />
        <Cyl p={[0, 0.12, 0]} r={0.008} h={0.2} c="#3d4b56" />
        <mesh position={[0, 0.2, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.065, 0.01, 8, 20, Math.PI]} />
          <meshStandardMaterial color="#25333e" /></mesh>
        {[-1, 1].map(s => <mesh key={s} position={[0, 0.19, s * 0.068]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.025, 16]} /><meshStandardMaterial color="#ff7c9a" /></mesh>)}</>
    case 'monitor2':
      return <group rotation={[0, 0.45, 0]}>
        <Cyl p={[0, 0.01, 0]} r={0.07} h={0.02} c="#384f50" />
        <Cube p={[0, 0.11, 0]} s={[0.04, 0.2, 0.04]} c="#384f50" />
        <Cube p={[0, 0.3, 0]} s={[0.55, 0.33, 0.04]} c="#384f50" />
        <mesh position={[0, 0.3, 0.021]}><planeGeometry args={[0.5, 0.28]} />
          <meshStandardMaterial color="#1d2b38" emissive="#3c6f8f" emissiveIntensity={0.5} /></mesh>
      </group>
    case 'lavalamp':
      return <LavaLamp />
    default:
      return null
  }
}
