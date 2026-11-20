import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { advanceMotion, createMotion, footTarget, legPose, punchExtension } from './avatarMotion'
import { localPlayer, useNetwork, type Player } from './network'
import { supported } from './world'
import GIFBubble from './GIFBubble'

const skin = '#efc9a9'
const ink = '#25333e'

export default function Avatar({ player, local = false, firstPerson = false }: {
  player: Player; local?: boolean; firstPerson?: boolean
}) {
  const reaction = useNetwork(s => s.gifs[player.id])
  const root = useRef<THREE.Group>(null!)
  const hips = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const eyes = useRef<THREE.Group>(null!)
  const thighs = useRef<(THREE.Group | null)[]>([])
  const knees = useRef<(THREE.Group | null)[]>([])
  const ankles = useRef<(THREE.Group | null)[]>([])
  const shoulders = useRef<(THREE.Group | null)[]>([])
  const elbows = useRef<(THREE.Group | null)[]>([])
  const target = useRef(new THREE.Quaternion())
  const euler = useRef(new THREE.Euler())
  const previous = useRef(new THREE.Vector3(player.x, player.y ?? 0, player.z))
  const motion = useRef(createMotion())
  const seed = [...player.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 23

  useLayoutEffect(() => {
    root.current.traverse(object => object.layers.set(firstPerson ? 1 : 0))
    // Hide the upper body from our camera, not from the mirror. Otherwise the
    // chest occludes the legs when looking down from inside the head.
    if (firstPerson) {
      for (const part of thighs.current) {
        part?.traverse(object => object.layers.set(0))
      }
    }
  }, [firstPerson])

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1)
    const p = local ? localPlayer : (useNetwork.getState().players[player.id] ?? player)
    const alpha = 1 - Math.exp(-14 * dt)
    if (local) root.current.position.set(p.x, p.y, p.z)
    else {
      root.current.position.x = THREE.MathUtils.lerp(root.current.position.x, p.x, alpha)
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, p.y ?? 0, alpha)
      root.current.position.z = THREE.MathUtils.lerp(root.current.position.z, p.z, alpha)
    }
    target.current.setFromEuler(euler.current.set(0, p.rotation, 0))
    root.current.quaternion.slerp(target.current, alpha)
    const distance = Math.hypot(root.current.position.x - previous.current.x, root.current.position.z - previous.current.z)
    const state = advanceMotion(motion.current, distance, supported(p), p.animation === 'walk', dt)
    previous.current.copy(root.current.position)
    const stride = state.stride * (1 - state.air)
    const breathing = Math.sin(clock.elapsedTime * 1.7 + seed) * 0.006 * (1 - stride)
    const hipY = 0.58 + Math.abs(Math.sin(state.phase)) * 0.018 * stride + breathing - state.landing * 0.05
    hips.current.position.y = hipY
    const punch = punchExtension(p.punch ?? 0)
    torso.current.rotation.set(-stride * 0.08 + state.air * 0.06 - punch * 0.05, -punch * 0.12,
      Math.cos(state.phase) * stride * 0.025)
    head.current.rotation.set(Math.sin(clock.elapsedTime * 1.7 + seed) * 0.015, punch * 0.08,
      -Math.cos(state.phase) * stride * 0.025)
    const blink = (clock.elapsedTime + seed) % 4.6
    eyes.current.scale.y = blink > 4.42 ? 0.12 : 1
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      const foot = footTarget(state, side)
      const leg = legPose(hipY, foot.y, foot.z)
      thighs.current[i]!.rotation.x = leg.hip
      knees.current[i]!.rotation.x = leg.knee
      ankles.current[i]!.rotation.x = leg.ankle
      const swing = Math.cos(state.phase + i * Math.PI) * stride * 0.5 + state.air * 0.4
      const hit = i === 1 ? punch : 0
      shoulders.current[i]!.rotation.set(swing * (1 - hit) + hit * 1.55, 0, side * (0.1 + state.air * 0.2))
      elbows.current[i]!.rotation.x = -(0.25 + state.air * 0.35) * (1 - hit)
    }
  })

  return (
    <group ref={root} name={`avatar-${player.id}`} position={[player.x, player.y ?? 0, player.z]}>
      <group ref={hips} position={[0, 0.58, 0]}>
        <mesh scale={[1, 0.65, 0.8]} castShadow>
          <sphereGeometry args={[0.22, 10, 8]} />
          <meshStandardMaterial color={ink} roughness={0.95} flatShading />
        </mesh>
        {([-1, 1] as const).map((side, i) => (
          <group key={side} name={side === -1 ? 'left-leg' : 'right-leg'}
            ref={node => { thighs.current[i] = node }} position={[side * 0.125, 0, 0]}>
            <mesh position={[0, -0.13, 0]} castShadow>
              <capsuleGeometry args={[0.09, 0.1, 3, 8]} />
              <meshStandardMaterial color={ink} roughness={0.95} flatShading />
            </mesh>
            <group ref={node => { knees.current[i] = node }} position={[0, -0.26, 0]}>
              <mesh position={[0, -0.13, 0]} castShadow>
                <capsuleGeometry args={[0.075, 0.11, 3, 8]} />
                <meshStandardMaterial color={player.color} roughness={0.9} flatShading />
              </mesh>
              <group ref={node => { ankles.current[i] = node }} position={[0, -0.26, 0]}>
                <mesh position={[0, -0.055, -0.04]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.64]} castShadow>
                  <capsuleGeometry args={[0.085, 0.1, 3, 8]} />
                  <meshStandardMaterial color="#b58453" roughness={1} flatShading />
                </mesh>
                <mesh position={[0, -0.095, -0.04]} castShadow>
                  <boxGeometry args={[0.17, 0.035, 0.27]} />
                  <meshStandardMaterial color={ink} roughness={1} />
                </mesh>
              </group>
            </group>
          </group>
        ))}
        <group ref={torso} position={[0, 0.16, 0]}>
          <mesh position={[0, 0.1, 0]} scale={[1, 1, 0.8]} castShadow>
            <capsuleGeometry args={[0.23, 0.12, 4, 10]} />
            <meshStandardMaterial color={player.color} roughness={0.85} flatShading />
          </mesh>
          <mesh position={[0, 0.18, -0.19]}>
            <boxGeometry args={[0.035, 0.31, 0.025]} />
            <meshStandardMaterial color="#fff0d3" roughness={0.9} />
          </mesh>
          <mesh position={[0.11, 0.22, -0.185]} rotation={[0, 0, -0.12]}>
            <boxGeometry args={[0.09, 0.065, 0.025]} />
            <meshStandardMaterial color="#fff0d3" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.14, 0.2]} castShadow>
            <boxGeometry args={[0.31, 0.34, 0.18]} />
            <meshStandardMaterial color="#c48d50" roughness={0.95} flatShading />
          </mesh>
          <group ref={head} position={[0, 0.55, -0.015]}>
            <mesh scale={[1.05, 1.05, 0.95]} castShadow>
              <sphereGeometry args={[0.235, 12, 10]} />
              <meshStandardMaterial color={skin} roughness={0.9} flatShading />
            </mesh>
            <mesh position={[0, 0.025, 0]} scale={[1.05, 1, 0.98]} castShadow>
              <sphereGeometry args={[0.24, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#a65d45" roughness={1} flatShading />
            </mesh>
            <group ref={eyes} position={[0, 0.025, -0.207]}>
              {[-1, 1].map(side => (
                <group key={side} position={[side * 0.085, 0, 0]}>
                  <mesh scale={[0.8, 1.05, 0.25]}>
                    <sphereGeometry args={[0.057, 8, 8]} />
                    <meshStandardMaterial color="#fff9e9" roughness={0.85} />
                  </mesh>
                  <mesh position={[0, 0, -0.014]} scale={[0.85, 1, 0.35]}>
                    <sphereGeometry args={[0.025, 8, 6]} />
                    <meshStandardMaterial color={ink} roughness={0.9} />
                  </mesh>
                </group>
              ))}
            </group>
            <mesh position={[0, -0.06, -0.218]} rotation={[0, 0, Math.PI]}>
              <torusGeometry args={[0.05, 0.009, 4, 12, Math.PI]} />
              <meshStandardMaterial color={ink} roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.02, -0.234]} castShadow>
              <sphereGeometry args={[0.028, 6, 6]} />
              <meshStandardMaterial color={skin} roughness={0.9} flatShading />
            </mesh>
          </group>
          {([-1, 1] as const).map((side, i) => (
            <group key={side} ref={node => { shoulders.current[i] = node }} position={[side * 0.29, 0.27, 0]}>
              <mesh position={[0, -0.105, 0]} castShadow>
                <capsuleGeometry args={[0.075, 0.085, 3, 8]} />
                <meshStandardMaterial color={player.color} roughness={0.9} flatShading />
              </mesh>
              <group ref={node => { elbows.current[i] = node }} position={[0, -0.21, 0]}>
                <mesh position={[0, -0.1, 0]} castShadow>
                  <capsuleGeometry args={[0.06, 0.075, 3, 8]} />
                  <meshStandardMaterial color={player.color} roughness={0.9} flatShading />
                </mesh>
                <mesh position={[0, -0.16, 0]}>
                  <cylinderGeometry args={[0.068, 0.068, 0.045, 8]} />
                  <meshStandardMaterial color={ink} roughness={0.95} flatShading />
                </mesh>
                <mesh position={[0, -0.235, 0]} scale={[1, 1.1, 0.9]} castShadow>
                  <sphereGeometry args={[0.085, 8, 6]} />
                  <meshStandardMaterial color={skin} roughness={0.9} flatShading />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      </group>
      {!firstPerson && <Html position={[0, 1.85, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <span className={`nametag ${local ? 'me' : ''}`}>{player.name}{local ? ' (you)' : ''}</span>
      </Html>}
      {reaction && <GIFBubble key={reaction.receivedAt} reaction={reaction} name={player.name} />}
    </group>
  )
}

export function FirstPersonFists() {
  const root = useRef<THREE.Group>(null!)
  const hands = useRef<(THREE.Group | null)[]>([])
  const previous = useRef(new THREE.Vector3(localPlayer.x, localPlayer.y, localPlayer.z))
  const motion = useRef(createMotion())
  const color = useNetwork(s => s.id ? s.players[s.id]?.color ?? '#52d6b1' : '#52d6b1')
  const { camera } = useThree()
  useLayoutEffect(() => {
    camera.layers.enable(2)
    root.current.traverse(object => object.layers.set(2))
    return () => { camera.layers.disable(2) }
  }, [camera])
  useFrame(({ clock }, delta) => {
    root.current.position.copy(camera.position)
    root.current.quaternion.copy(camera.quaternion)
    const distance = Math.hypot(localPlayer.x - previous.current.x, localPlayer.z - previous.current.z)
    const state = advanceMotion(motion.current, distance, supported(localPlayer), localPlayer.animation === 'walk', delta)
    previous.current.set(localPlayer.x, localPlayer.y, localPlayer.z)
    const extension = punchExtension(localPlayer.punch)
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      const punch = i === 1 ? extension : 0
      const sway = Math.sin(state.phase + i * Math.PI) * state.stride * 0.012 * (1 - state.air)
      hands.current[i]!.position.set(side * 0.18 - punch * 0.08,
        -0.18 + sway + punch * 0.06 - state.landing * 0.025 + Math.sin(clock.elapsedTime * 1.7) * 0.003,
        -0.65 - punch * 0.3)
      hands.current[i]!.rotation.x = punch * -0.2
    }
  })
  return (
    <group ref={root}>
      {([-1, 1] as const).map((side, i) => (
        <group key={side} ref={node => { hands.current[i] = node }}>
          <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
            <capsuleGeometry args={[0.075, 0.06, 3, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} flatShading depthTest={false} depthWrite={false} />
          </mesh>
          <mesh position={[-side * 0.065, -0.015, 0.015]} renderOrder={10}>
            <sphereGeometry args={[0.035, 6, 6]} />
            <meshStandardMaterial color={skin} roughness={0.9} flatShading depthTest={false} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.105]} rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
            <cylinderGeometry args={[0.067, 0.073, 0.07, 8]} />
            <meshStandardMaterial color={ink} roughness={0.95} flatShading depthTest={false} depthWrite={false} />
          </mesh>
          <mesh position={[0, -0.005, 0.22]} rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
            <capsuleGeometry args={[0.06, 0.14, 3, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} flatShading depthTest={false} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
