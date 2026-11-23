import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { advanceMotion, createMotion, easeSit, footTarget, legPose, punchExtension, SEATED_HIP_LIFT, sipLift, sitPose, STANDING_HIP } from './avatarMotion'
import { localPlayer, useNetwork, type Player } from './network'
import { seatAt, SIP_DURATION, supported } from './world'
import { BeerBottle } from './Fridge'
import GIFBubble from './GIFBubble'
import { defaultAppearance } from './appearance'
import { advanceMouth } from './speechMotion'

const ink = '#25333e'

export default function Avatar({ player, local = false, firstPerson = false, preview = false }: {
  player: Player; local?: boolean; firstPerson?: boolean; preview?: boolean
}) {
  const appearance = player.appearance ?? defaultAppearance(player.color)
  const appearanceKey = JSON.stringify(appearance)
  const skin = appearance.skin
  const reaction = useNetwork(s => preview ? undefined : s.gifs[player.id])
  const root = useRef<THREE.Group>(null!)
  const hips = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const eyes = useRef<THREE.Group>(null!)
  const restingMouth = useRef<THREE.Mesh>(null!)
  const talkingMouth = useRef<THREE.Mesh>(null!)
  const mouthLevel = useRef(0)
  const thighs = useRef<(THREE.Group | null)[]>([])
  const knees = useRef<(THREE.Group | null)[]>([])
  const ankles = useRef<(THREE.Group | null)[]>([])
  const shoulders = useRef<(THREE.Group | null)[]>([])
  const elbows = useRef<(THREE.Group | null)[]>([])
  const bottle = useRef<THREE.Group>(null!)
  const target = useRef(new THREE.Quaternion())
  const euler = useRef(new THREE.Euler())
  const previous = useRef(new THREE.Vector3(player.x, player.y ?? 0, player.z))
  const motion = useRef(createMotion())
  const sitBlend = useRef(0)
  const seatHip = useRef(STANDING_HIP)
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
  }, [firstPerson, appearanceKey])

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1)
    const p = preview ? { ...player, animation: 'idle' as const, punch: 0, punchLeft: 0 }
      : local ? localPlayer : (useNetwork.getState().players[player.id] ?? player)
    const voiceEnabled = local ? useNetwork.getState().players[player.id]?.voice : player.voice
    mouthLevel.current = advanceMouth(mouthLevel.current,
      !preview && voiceEnabled ? p.speaking ?? 0 : 0, delta)
    const opening = mouthLevel.current
    restingMouth.current.visible = opening < 0.025
    talkingMouth.current.visible = opening >= 0.025
    talkingMouth.current.scale.set(0.042 + opening * 0.012, 0.009 + opening * 0.052, 0.012)
    const alpha = 1 - Math.exp(-14 * dt)
    if (local || preview) root.current.position.set(p.x, p.y, p.z)
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
    const standingHip = STANDING_HIP + Math.abs(Math.sin(state.phase)) * 0.018 * stride + breathing - state.landing * 0.05
    // Seats come from shared world data, so remote players need only `animation: 'sit'`.
    const seat = p.animation === 'sit' ? seatAt(p.x, p.z) : null
    if (seat) seatHip.current = seat.height + SEATED_HIP_LIFT
    const sit = sitBlend.current = easeSit(sitBlend.current, seat !== null, dt)
    const hipY = standingHip + (seatHip.current + breathing - standingHip) * sit
    hips.current.position.y = hipY
    const holding = !preview && p.holding === 'beer'
    const sip = holding ? sipLift(p.drink ?? 0, SIP_DURATION) : 0
    const punch = holding ? 0 : punchExtension(p.punch ?? 0)
    const punchLeft = punchExtension(p.punchLeft ?? 0)
    const twist = punch - punchLeft
    torso.current.rotation.set(-stride * 0.08 + state.air * 0.06 - Math.max(punch, punchLeft) * 0.05, -twist * 0.12,
      Math.cos(state.phase) * stride * 0.025)
    head.current.rotation.set(Math.sin(clock.elapsedTime * 1.7 + seed) * 0.015, twist * 0.08,
      -Math.cos(state.phase) * stride * 0.025)
    const blink = (clock.elapsedTime + seed) % 4.6
    eyes.current.scale.y = blink > 4.42 ? 0.12 : 1
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      const foot = footTarget(state, side)
      const leg = sitPose(legPose(standingHip, foot.y, foot.z), sit)
      thighs.current[i]!.rotation.x = leg.hip
      knees.current[i]!.rotation.x = leg.knee
      ankles.current[i]!.rotation.x = leg.ankle
      const swing = Math.cos(state.phase + i * Math.PI) * stride * 0.5 + state.air * 0.4
      const hit = i === 1 ? punch : punchLeft
      if (i === 1 && holding) {
        // Carry the bottle in front, then fold the arm up to the mouth for a sip.
        const shoulder = 0.35 + sip * 0.75 + swing * 0.2 * (1 - sip)
        const elbow = 1 + sip * 0.95
        shoulders.current[i]!.rotation.set(shoulder, 0, side * (0.1 - sip * 0.12))
        elbows.current[i]!.rotation.x = elbow
        bottle.current.rotation.x = -(shoulder + elbow) + sip * 1.6
        continue
      }
      shoulders.current[i]!.rotation.set(swing * (1 - hit) + hit * 1.55, 0, side * (0.1 + state.air * 0.2))
      elbows.current[i]!.rotation.x = -(0.25 + state.air * 0.35) * (1 - hit)
    }
    bottle.current.visible = holding
  })

  return (
    <group ref={root} name={`avatar-${player.id}`} position={[player.x, player.y ?? 0, player.z]}>
      <group ref={hips} position={[0, 0.58, 0]}>
        <mesh scale={[1, 0.65, 0.8]} castShadow>
          <sphereGeometry args={[0.22, 10, 8]} />
          <meshStandardMaterial color={appearance.bottomColor} roughness={0.95} flatShading />
        </mesh>
        {([-1, 1] as const).map((side, i) => (
          <group key={side} name={side === -1 ? 'left-leg' : 'right-leg'}
            ref={node => { thighs.current[i] = node }} position={[side * 0.125, 0, 0]}>
            <mesh position={[0, -0.13, 0]} castShadow>
              <capsuleGeometry args={[0.09, 0.1, 3, 8]} />
              <meshStandardMaterial color={appearance.bottomColor} roughness={0.95} flatShading />
            </mesh>
            <group ref={node => { knees.current[i] = node }} position={[0, -0.26, 0]}>
              <mesh position={[0, -0.13, 0]} castShadow>
                <capsuleGeometry args={[0.075, 0.11, 3, 8]} />
                <meshStandardMaterial color={appearance.bottom === 'shorts' ? skin : appearance.bottomColor} roughness={0.9} flatShading />
              </mesh>
              <group ref={node => { ankles.current[i] = node }} position={[0, -0.26, 0]}>
                {appearance.shoes === 'boots' && <mesh position={[0, 0.01, 0]} castShadow>
                  <cylinderGeometry args={[0.09, 0.095, 0.14, 8]} />
                  <meshStandardMaterial color={appearance.shoeColor} roughness={0.9} flatShading />
                </mesh>}
                <mesh position={[0, -0.055, -0.04]} rotation={[Math.PI / 2, 0, 0]}
                  scale={[1, 1, appearance.shoes === 'boots' ? 0.8 : 0.55]} castShadow>
                  <capsuleGeometry args={[0.085, 0.1, 3, 8]} />
                  <meshStandardMaterial color={appearance.shoeColor} roughness={1} flatShading />
                </mesh>
                <mesh position={[0, -0.095, -0.04]} castShadow>
                  <boxGeometry args={[0.17, 0.035, 0.27]} />
                  <meshStandardMaterial color={appearance.shoes === 'sneakers' ? '#fff0d3' : ink} roughness={1} />
                </mesh>
                {appearance.shoes === 'sneakers' && <mesh position={[0, -0.007, -0.09]}>
                  <boxGeometry args={[0.085, 0.012, 0.065]} />
                  <meshStandardMaterial color="#fff0d3" roughness={1} />
                </mesh>}
              </group>
            </group>
          </group>
        ))}
        <group ref={torso} position={[0, 0.16, 0]}>
          <mesh position={[0, 0.1, 0]} scale={[1, 1, 0.8]} castShadow>
            <capsuleGeometry args={[appearance.top === 'hoodie' ? 0.25 : 0.23, 0.12, 4, 10]} />
            <meshStandardMaterial color={appearance.topColor} roughness={0.85} flatShading />
          </mesh>
          {appearance.top === 'jacket' && <group>
          <mesh position={[0, 0.1, -0.195]}>
            <boxGeometry args={[0.035, 0.31, 0.025]} />
            <meshStandardMaterial color="#fff0d3" roughness={0.9} />
          </mesh>
          <mesh position={[0.11, 0.22, -0.185]} rotation={[0, 0, -0.12]}>
            <boxGeometry args={[0.09, 0.065, 0.025]} />
            <meshStandardMaterial color="#fff0d3" roughness={0.9} />
          </mesh>
          {[-1, 1].map(side => <mesh key={side} position={[side * 0.065, 0.27, -0.185]}
            rotation={[0, 0, side * 0.4]}>
            <boxGeometry args={[0.065, 0.15, 0.035]} />
            <meshStandardMaterial color={appearance.topColor} roughness={0.9} flatShading />
          </mesh>)}
          </group>}
          {appearance.top === 'hoodie' && <group>
            <mesh position={[0, 0.35, 0.105]} scale={[1, 1, 0.7]} castShadow>
              <torusGeometry args={[0.15, 0.065, 5, 12]} />
              <meshStandardMaterial color={appearance.topColor} roughness={1} flatShading />
            </mesh>
            {[-1, 1].map(side => <mesh key={side} position={[side * 0.065, 0.22, -0.21]}
              rotation={[0, 0, side * 0.08]}>
              <cylinderGeometry args={[0.009, 0.009, 0.18, 5]} />
              <meshStandardMaterial color="#fff0d3" roughness={1} />
            </mesh>)}
            <mesh position={[0, -0.005, -0.19]}>
              <boxGeometry args={[0.24, 0.09, 0.025]} />
              <meshStandardMaterial color={appearance.topColor} roughness={1} />
            </mesh>
          </group>}
          {appearance.backpack && <mesh position={[0, 0.14, 0.2]} castShadow>
            <boxGeometry args={[0.31, 0.34, 0.18]} />
            <meshStandardMaterial color={appearance.backpackColor} roughness={0.95} flatShading />
          </mesh>}
          <group ref={head} position={[0, 0.55, -0.015]}>
            <mesh scale={[1.05, 1.05, 0.95]} castShadow>
              <sphereGeometry args={[0.235, 12, 10]} />
              <meshStandardMaterial color={skin} roughness={0.9} flatShading />
            </mesh>
            {appearance.hair !== 'none' && <group>
            <mesh position={[0, 0.025, 0]} scale={[1.05, 1, 0.98]} castShadow>
              <sphereGeometry args={[0.24, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={appearance.hairColor} roughness={1} flatShading />
            </mesh>
            {appearance.hair === 'short' ? [-1, 0, 1].map(side => <mesh key={side}
              position={[side * 0.085, 0.19, -0.12]} rotation={[0.15, 0, side * -0.2]} castShadow>
              <boxGeometry args={[0.075, 0.09, 0.1]} />
              <meshStandardMaterial color={appearance.hairColor} roughness={1} flatShading />
            </mesh>) : <group>
              {[-1, 1].map(side => <mesh key={side} position={[side * 0.205, -0.025, 0.015]} castShadow>
                <capsuleGeometry args={[0.07, 0.18, 3, 8]} />
                <meshStandardMaterial color={appearance.hairColor} roughness={1} flatShading />
              </mesh>)}
              <mesh position={[0, -0.025, 0.17]} castShadow>
                <boxGeometry args={[0.34, 0.28, 0.1]} />
                <meshStandardMaterial color={appearance.hairColor} roughness={1} flatShading />
              </mesh>
            </group>}
            </group>}
            {appearance.hat !== 'none' && <group>
              <mesh position={[0, 0.08, 0]} castShadow>
                <sphereGeometry args={[0.255, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color={appearance.hatColor} roughness={1} flatShading />
              </mesh>
              {appearance.hat === 'beanie' ? <group>
                <mesh position={[0, 0.105, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.245, 0.025, 5, 12]} />
                  <meshStandardMaterial color={appearance.hatColor} roughness={1} />
                </mesh>
                <mesh position={[0, 0.35, 0]} castShadow>
                  <sphereGeometry args={[0.055, 8, 6]} />
                  <meshStandardMaterial color={appearance.hatColor} roughness={1} flatShading />
                </mesh>
              </group> : <mesh position={[0, 0.09, -0.23]} scale={[1, 0.15, 1]} castShadow>
                <sphereGeometry args={[0.18, 10, 6]} />
                <meshStandardMaterial color={appearance.hatColor} roughness={1} flatShading />
              </mesh>}
            </group>}
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
            <mesh ref={restingMouth} name="resting-mouth" position={[0, -0.07, -0.218]} rotation={[0, 0, Math.PI]}>
              {appearance.face === 'neutral'
                ? <boxGeometry args={[0.085, 0.012, 0.012]} />
                : <torusGeometry args={[appearance.face === 'surprised' ? 0.031 : 0.05, 0.009, 4, 12,
                  appearance.face === 'surprised' ? Math.PI * 2 : Math.PI]} />}
              <meshStandardMaterial color={ink} roughness={0.9} />
            </mesh>
            <mesh ref={talkingMouth} name="talking-mouth" position={[0, -0.08, -0.226]}
              scale={[0.042, 0.009, 0.012]} visible={false}>
              <sphereGeometry args={[1, 12, 8]} />
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
                <meshStandardMaterial color={appearance.topColor} roughness={0.9} flatShading />
              </mesh>
              <group ref={node => { elbows.current[i] = node }} position={[0, -0.21, 0]}>
                <mesh position={[0, -0.1, 0]} castShadow>
                  <capsuleGeometry args={[0.06, 0.075, 3, 8]} />
                  <meshStandardMaterial color={appearance.top === 'tee' ? skin : appearance.topColor} roughness={0.9} flatShading />
                </mesh>
                <mesh position={[0, -0.16, 0]}>
                  <cylinderGeometry args={[0.068, 0.068, 0.045, 8]} />
                  <meshStandardMaterial color={appearance.top === 'tee' ? skin : appearance.topColor} roughness={0.95} flatShading />
                </mesh>
                <mesh position={[0, -0.235, 0]} scale={[1, 1.1, 0.9]} castShadow>
                  <sphereGeometry args={[0.085, 8, 6]} />
                  <meshStandardMaterial color={skin} roughness={0.9} flatShading />
                </mesh>
                {/* Always mounted so layer assignment covers it; visibility follows `holding`. */}
                {side === 1 && <group ref={bottle} position={[0, -0.26, -0.03]} visible={false}>
                  <BeerBottle />
                </group>}
              </group>
            </group>
          ))}
        </group>
      </group>
      {!preview && !firstPerson && <Html position={[0, 1.85, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <span className={`nametag ${local ? 'me' : ''}`}>{player.name}{local ? ' (you)' : ''}</span>
      </Html>}
      {!preview && reaction && <GIFBubble key={reaction.receivedAt} reaction={reaction} name={player.name} />}
    </group>
  )
}

export function FirstPersonFists() {
  const root = useRef<THREE.Group>(null!)
  const hands = useRef<(THREE.Group | null)[]>([])
  const bottle = useRef<THREE.Group>(null!)
  const previous = useRef(new THREE.Vector3(localPlayer.x, localPlayer.y, localPlayer.z))
  const motion = useRef(createMotion())
  const player = useNetwork(s => s.id ? s.players[s.id] : undefined)
  const appearance = player?.appearance ?? defaultAppearance(player?.color ?? '#52d6b1')
  const skin = appearance.skin
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
    const holding = localPlayer.holding === 'beer'
    const sip = holding ? sipLift(localPlayer.drink, SIP_DURATION) : 0
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      const punch = i === 1 && holding ? 0 : punchExtension(i === 1 ? localPlayer.punch : localPlayer.punchLeft)
      const sway = Math.sin(state.phase + i * Math.PI) * state.stride * 0.012 * (1 - state.air)
      const raise = i === 1 ? sip : 0
      // A sip brings the bottle up toward the centre of the view and tips it back.
      hands.current[i]!.position.set(side * (0.18 - punch * 0.08 - raise * 0.13),
        -0.18 + sway + punch * 0.06 + raise * 0.1 - state.landing * 0.025 + Math.sin(clock.elapsedTime * 1.7) * 0.003,
        -0.65 - punch * 0.3 + raise * 0.22)
      hands.current[i]!.rotation.x = punch * -0.2 + raise * 1.1
    }
    bottle.current.visible = holding
  })
  return (
    <group ref={root}>
      {([-1, 1] as const).map((side, i) => (
        <group key={side} ref={node => { hands.current[i] = node }}>
          {side === 1 && <group ref={bottle} position={[0, 0.06, -0.01]} visible={false}>
            <BeerBottle overlay />
          </group>}
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
            <meshStandardMaterial color={appearance.top === 'tee' ? skin : appearance.topColor}
              roughness={0.95} flatShading depthTest={false} depthWrite={false} />
          </mesh>
          <mesh position={[0, -0.005, 0.22]} rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
            <capsuleGeometry args={[0.06, 0.14, 3, 8]} />
            <meshStandardMaterial color={appearance.top === 'tee' ? skin : appearance.topColor}
              roughness={0.9} flatShading depthTest={false} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
