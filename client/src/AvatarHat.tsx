import type { Appearance } from './appearance'

// Head-local geometry follows the existing rig and first-person/mirror layers.
export default function AvatarHat({ style, color }: { style: Appearance['hat']; color: string }) {
  if (style === 'none') return null
  if (style === 'feather') return <group name="hat-feather">
    <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.96, 1]} castShadow>
      <torusGeometry args={[0.246, 0.026, 4, 16]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
    {[0, 1].map(i => <group key={i} position={[0.22, 0.18, 0.06]} rotation={[0.15, 0, -0.25 - i * 0.35]}>
      <mesh position={[0, 0.11, 0]} scale={[0.045, 0.18, 0.018]} castShadow>
        <sphereGeometry args={[1, 6, 6]} />
        <meshStandardMaterial color={i ? '#ff7c9a' : '#fff0d3'} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 0.07, -0.019]}>
        <boxGeometry args={[0.008, 0.26, 0.008]} />
        <meshStandardMaterial color="#b58453" roughness={1} />
      </mesh>
    </group>)}
  </group>

  if (style === 'cowboy') return <group name="hat-cowboy">
    <mesh position={[0, 0.13, 0]} scale={[1, 1, 0.9]} castShadow>
      <cylinderGeometry args={[0.19, 0.25, 0.035, 16]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
    <mesh position={[0, 0.27, 0]} scale={[1, 1, 0.85]} castShadow>
      <cylinderGeometry args={[0.19, 0.24, 0.27, 8]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
    <mesh position={[0, 0.17, 0]} scale={[1, 1, 0.85]} castShadow>
      <cylinderGeometry args={[0.231, 0.245, 0.055, 8]} />
      <meshStandardMaterial color="#51382c" roughness={1} />
    </mesh>
    <mesh position={[0, 0.13, -0.035]} scale={[1, 0.07, 1.1]} castShadow>
      <sphereGeometry args={[0.38, 16, 8]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * 0.31, 0.17, 0]}
      rotation={[0, 0, side * 0.35]} scale={[0.14, 0.018, 0.32]} castShadow>
      <sphereGeometry args={[1, 10, 6]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>)}
  </group>

  return <group name={`hat-${style}`}>
    <mesh position={[0, 0.08, 0]} scale={[1.04, 1, 1]} castShadow>
      <sphereGeometry args={[0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color={color} roughness={style === 'engineer' ? 0.4 : 1} flatShading />
    </mesh>
    {style === 'engineer' ? <group>
      <mesh position={[0, 0.085, -0.025]} scale={[1, 1, 1.08]} castShadow>
        <cylinderGeometry args={[0.31, 0.31, 0.035, 20]} />
        <meshStandardMaterial color={color} roughness={0.4} flatShading />
      </mesh>
      {[-1, 0, 1].map(side => <mesh key={side} position={[side * 0.105, 0.085, 0]}
        rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[Math.sqrt(0.26 ** 2 - (side * 0.105) ** 2), side === 0 ? 0.018 : 0.012, 4, 16, Math.PI]} />
        <meshStandardMaterial color={color} roughness={0.4} flatShading />
      </mesh>)}
      <mesh position={[0, 0.16, -0.25]} castShadow>
        <boxGeometry args={[0.075, 0.055, 0.018]} />
        <meshStandardMaterial color="#fff0d3" roughness={0.6} />
      </mesh>
    </group> : style === 'beanie' ? <group>
      <mesh position={[0, 0.105, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.245, 0.025, 5, 12]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh position={[0, 0.35, 0]} castShadow>
        <sphereGeometry args={[0.055, 8, 6]} />
        <meshStandardMaterial color={color} roughness={1} flatShading />
      </mesh>
    </group> : <mesh position={[0, 0.09, -0.23]} scale={[1, 0.15, 1]} castShadow>
      <sphereGeometry args={[0.18, 10, 6]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>}
  </group>
}
