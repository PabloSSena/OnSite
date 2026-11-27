import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { advanceMotion, createMotion, easeSit, punchExtension, SEATED_HIP_LIFT, sipLift, STANDING_HIP } from './avatarMotion'
import { localPlayer, useNetwork, type Player } from './network'
import { seatAt, SIP_DURATION, supported } from './world'
import { BeerBottle } from './Fridge'
import GIFBubble from './GIFBubble'
import { defaultAppearance } from './appearance'
import { advanceMouth, speechHeadOffset } from './speechMotion'
import { BEER_GRIP, beerArmPose, firstPersonBeerPose } from './beerMotion'
import AvatarHat from './AvatarHat'
import { BODY_DEPTH, BODY_DROP, HAT_SCALE, HEAD_CENTER, MOUTH, seatedShape, SHOULDER, triangleBodyShape, UPPER_ARM } from './avatarShape'

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
  const body = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const eyes = useRef<THREE.Group>(null!)
  const restingMouth = useRef<THREE.Mesh>(null!)
  const talkingMouth = useRef<THREE.Mesh>(null!)
  const mouthLevel = useRef(0)
  const legs = useRef<(THREE.Group | null)[]>([])
  const shoulders = useRef<(THREE.Group | null)[]>([])
  const elbows = useRef<(THREE.Group | null)[]>([])
  const bottle = useRef<THREE.Group>(null!)
  const target = useRef(new THREE.Quaternion())
  const euler = useRef(new THREE.Euler())
  const mouthTarget = useRef(new THREE.Vector3())
  const previous = useRef(new THREE.Vector3(player.x, player.y ?? 0, player.z))
  const motion = useRef(createMotion())
  const sitBlend = useRef(0)
  const waveBlend = useRef(1)
  const seatHip = useRef(STANDING_HIP)
  const shape = useMemo(triangleBodyShape, [])
  const seed = [...player.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 23

  useLayoutEffect(() => {
    root.current.traverse(object => object.layers.set(firstPerson ? 1 : 0))
    // Keep the head, hat and body in the mirror, but not inside our own camera.
    if (firstPerson) {
      for (const leg of legs.current) leg?.traverse(object => object.layers.set(0))
    }
  }, [firstPerson, appearanceKey])

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1)
    const p = preview ? { ...player, animation: 'idle' as const, punch: 0, punchLeft: 0 }
      : local ? localPlayer : (useNetwork.getState().players[player.id] ?? player)
    const voiceEnabled = preview ? false : useNetwork.getState().players[player.id]?.voice
    mouthLevel.current = advanceMouth(mouthLevel.current,
      !preview && voiceEnabled ? p.speaking ?? 0 : 0, delta)
    const opening = mouthLevel.current
    restingMouth.current.visible = opening < 0.025 && appearance.face !== 'neutral'
    talkingMouth.current.visible = opening >= 0.025
    talkingMouth.current.scale.set(0.022 + opening * 0.01, 0.005 + opening * 0.03, 0.008)
    const alpha = 1 - Math.exp(-14 * dt)
    if (local || preview) root.current.position.set(p.x, p.y ?? 0, p.z)
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
    const standingHip = STANDING_HIP + Math.abs(Math.sin(state.phase)) * 0.018 * stride + breathing - state.landing * 0.03
    const seat = p.animation === 'sit' ? seatAt(p.x, p.z) : null
    if (seat) seatHip.current = seat.height + SEATED_HIP_LIFT
    const sit = sitBlend.current = easeSit(sitBlend.current, seat !== null, dt)
    hips.current.position.y = standingHip + (seatHip.current + breathing - standingHip) * sit
    const seated = seatedShape(sit)
    torso.current.position.y = seated.drop
    body.current.scale.y = seated.height
    const holding = !preview && p.holding === 'beer'
    const sip = holding ? sipLift(p.drink ?? 0, SIP_DURATION) : 0
    head.current.position.y = HEAD_CENTER.y - seated.upperOffset
      + speechHeadOffset(opening, clock.elapsedTime + seed, sip)
    const punch = holding ? 0 : punchExtension(p.punch ?? 0)
    const punchLeft = punchExtension(p.punchLeft ?? 0)
    const twist = punch - punchLeft
    torso.current.rotation.set(-stride * 0.035 - Math.max(punch, punchLeft) * 0.03,
      -twist * 0.08, Math.cos(state.phase) * stride * 0.015)
    head.current.rotation.set(Math.sin(clock.elapsedTime * 1.7 + seed) * 0.015, twist * 0.08,
      0.12 - Math.cos(state.phase) * stride * 0.015)
    const blink = (clock.elapsedTime + seed) % 4.6
    eyes.current.scale.y = blink > 4.42 ? 0.12 : 1
    // A gentle hello is the idle pose, not an override of an action.
    const waveTarget = p.animation === 'idle' && !holding && !punch && !punchLeft && state.grounded ? 1 : 0
    waveBlend.current += (waveTarget - waveBlend.current) * (1 - Math.exp(-10 * dt))
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      const step = Math.sin(state.phase + i * Math.PI) * stride
      legs.current[i]!.position.y = seated.drop + Math.max(0, step) * 0.025 + sit * 0.025
      legs.current[i]!.rotation.x = step * 0.55 + sit * 0.9
      const swing = Math.cos(state.phase + i * Math.PI) * stride * 0.4 + state.air * 0.2
      const hit = i === 1 ? punch : punchLeft
      const shoulder = shoulders.current[i]!
      shoulder.position.y = SHOULDER.y - seated.upperOffset
      if (i === 1 && holding) {
        const mouth = mouthTarget.current.copy(MOUTH)
          .applyQuaternion(head.current.quaternion).add(head.current.position)
        const pose = beerArmPose(sip, swing, mouth, shoulder.position)
        shoulder.rotation.copy(pose.shoulder)
        elbows.current[i]!.rotation.set(pose.elbow, 0, 0)
        bottle.current.quaternion.copy(pose.bottle)
        continue
      }
      const wave = i === 0 ? waveBlend.current : 0
      shoulder.rotation.set(swing * (1 - hit) + hit * 1.55, 0,
        side * (0.32 + state.air * 0.2 + wave * 1.65), 'XYZ')
      elbows.current[i]!.rotation.set(-0.18 * (1 - hit), 0,
        side * wave * (0.55 + Math.sin(clock.elapsedTime * 2.8 + seed) * 0.12))
    }
    bottle.current.visible = holding
  })

  return (
    <group ref={root} name={`avatar-${player.id}`} position={[player.x, player.y ?? 0, player.z]}>
      <group ref={hips} position={[0, STANDING_HIP, 0]}>
        {([-1, 1] as const).map((side, i) => (
          <group key={side} name={side === -1 ? 'left-leg' : 'right-leg'}
            ref={node => { legs.current[i] = node }} position={[side * 0.16, -BODY_DROP, 0]}>
            <mesh position={[0, -0.055, 0]} castShadow>
              <boxGeometry args={[0.115, 0.11, 0.13]} />
              <meshStandardMaterial color={appearance.bottom === 'shorts' ? skin : appearance.bottomColor} roughness={0.95} />
            </mesh>
            <mesh position={[0, -0.115, -0.012]} castShadow>
              <boxGeometry args={[0.12, 0.03, appearance.shoes === 'boots' ? 0.16 : 0.14]} />
              <meshStandardMaterial color={appearance.shoeColor} roughness={1} />
            </mesh>
          </group>
        ))}
        <group ref={torso} position={[0, -BODY_DROP, 0]}>
          <group ref={body} name="rounded-triangle-body">
            <mesh position={[0, 0, -BODY_DEPTH / 2]} castShadow receiveShadow>
              <extrudeGeometry args={[shape, {
                depth: BODY_DEPTH, bevelEnabled: true, bevelSize: 0.018,
                bevelThickness: 0.018, bevelSegments: 3, steps: 1, curveSegments: 20,
              }]} />
              <meshStandardMaterial color={appearance.topColor} roughness={0.9} />
            </mesh>
            {appearance.top === 'jacket' && <mesh position={[0, 0.40, -0.153]}>
              <boxGeometry args={[0.012, 0.70, 0.008]} />
              <meshStandardMaterial color="#fff0d3" roughness={1} />
            </mesh>}
            {appearance.top === 'hoodie' && <group>
              {[-1, 1].map(side => <mesh key={side} position={[side * 0.045, 0.67, -0.153]}>
                <capsuleGeometry args={[0.006, 0.12, 3, 6]} />
                <meshStandardMaterial color="#fff0d3" roughness={1} />
              </mesh>)}
              <mesh position={[0, 0.29, -0.155]} castShadow>
                <boxGeometry args={[0.22, 0.12, 0.018]} />
                <meshStandardMaterial color={appearance.topColor} roughness={1} />
              </mesh>
            </group>}
            {appearance.backpack && <mesh position={[0, 0.47, 0.21]} castShadow>
              <boxGeometry args={[0.25, 0.30, 0.14]} />
              <meshStandardMaterial color={appearance.backpackColor} roughness={0.95} />
            </mesh>}
          </group>
          <group ref={head} name="floating-head" position={HEAD_CENTER}>
            <mesh scale={[1, 1.12, 0.95]} castShadow>
              <sphereGeometry args={[0.205, 32, 24]} />
              <meshStandardMaterial color={skin} roughness={0.9} />
            </mesh>
            {/* All existing hats and hair use one fitted head-local coordinate system. */}
            <group scale={[...HAT_SCALE]} name="head-accessories">
              {appearance.hair !== 'none' && <group>
                <mesh position={[0, 0.025, 0]} scale={[1.05, 1, 0.98]} castShadow>
                  <sphereGeometry args={[0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                  <meshStandardMaterial color={appearance.hairColor} roughness={1} />
                </mesh>
                {appearance.hair === 'short' ? (appearance.hat === 'none' || appearance.hat === 'feather') &&
                  [-1, 0, 1].map(side => <mesh key={side}
                    position={[side * 0.085, 0.19, -0.12]} rotation={[0.15, 0, side * -0.2]} castShadow>
                    <boxGeometry args={[0.075, 0.09, 0.1]} />
                    <meshStandardMaterial color={appearance.hairColor} roughness={1} />
                  </mesh>) : <group>
                    {[-1, 1].map(side => <mesh key={side} position={[side * 0.205, -0.025, 0.015]} castShadow>
                      <capsuleGeometry args={[0.07, 0.18, 4, 12]} />
                      <meshStandardMaterial color={appearance.hairColor} roughness={1} />
                    </mesh>)}
                    <mesh position={[0, -0.025, 0.17]} castShadow>
                      <boxGeometry args={[0.34, 0.28, 0.1]} />
                      <meshStandardMaterial color={appearance.hairColor} roughness={1} />
                    </mesh>
                  </group>}
              </group>}
              <AvatarHat style={appearance.hat} color={appearance.hatColor} />
            </group>
            <group ref={eyes} position={[0, -0.060, -0.181]}>
              {[-1, 1].map(side => <mesh key={side} position={[side * 0.06, 0, 0]} scale={[1, 1.2, 0.45]}>
                <sphereGeometry args={[0.018, 16, 12]} />
                <meshStandardMaterial color={ink} roughness={0.9} />
              </mesh>)}
            </group>
            <mesh ref={restingMouth} name="resting-mouth" position={MOUTH} rotation={[0, 0, Math.PI]}>
              <torusGeometry args={[appearance.face === 'surprised' ? 0.015 : 0.025, 0.004, 6, 16,
                appearance.face === 'surprised' ? Math.PI * 2 : Math.PI]} />
              <meshStandardMaterial color={ink} roughness={0.9} />
            </mesh>
            <mesh ref={talkingMouth} name="talking-mouth" position={MOUTH} scale={[0.022, 0.005, 0.008]} visible={false}>
              <sphereGeometry args={[1, 16, 12]} />
              <meshStandardMaterial color={ink} roughness={0.9} />
            </mesh>
          </group>
          {([-1, 1] as const).map((side, i) => (
            <group key={side} name={side === -1 ? 'left-arm' : 'right-arm'}
              ref={node => { shoulders.current[i] = node }} position={[side * SHOULDER.x, SHOULDER.y, SHOULDER.z]}>
              <mesh position={[0, -UPPER_ARM / 2, 0]} castShadow>
                <capsuleGeometry args={[0.038, UPPER_ARM - 0.076, 5, 12]} />
                <meshStandardMaterial color={appearance.topColor} roughness={0.9} />
              </mesh>
              <group ref={node => { elbows.current[i] = node }} position={[0, -UPPER_ARM, 0]}>
                <mesh position={[0, -0.145, 0]} castShadow>
                  <capsuleGeometry args={[0.035, 0.22, 5, 12]} />
                  <meshStandardMaterial color={appearance.top === 'tee' ? skin : appearance.topColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, -BEER_GRIP, 0]} castShadow>
                  <sphereGeometry args={[0.048, 16, 12]} />
                  <meshStandardMaterial color={skin} roughness={0.9} />
                </mesh>
                {/* Mounted even when hidden so first-person/mirror layers stay correct. */}
                {side === 1 && <group ref={bottle} position={[0, -BEER_GRIP, 0]} visible={false}>
                  <BeerBottle />
                </group>}
              </group>
            </group>
          ))}
        </group>
      </group>
      {!preview && !firstPerson && <Html position={[0, 1.95, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
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
      const bob = sway - state.landing * 0.025 + Math.sin(clock.elapsedTime * 1.7) * 0.003
      if (i === 1 && holding) {
        const pose = firstPersonBeerPose(sip)
        hands.current[i]!.position.copy(pose.position)
        hands.current[i]!.position.y += bob * (1 - sip)
        hands.current[i]!.rotation.copy(pose.rotation)
      } else {
        hands.current[i]!.position.set(side * (0.18 - punch * 0.08),
          -0.18 + bob + punch * 0.06, -0.65 - punch * 0.3)
        hands.current[i]!.rotation.set(punch * -0.2, 0, 0)
      }
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
            <capsuleGeometry args={[0.048, 0.035, 5, 12]} />
            <meshStandardMaterial color={skin} roughness={0.9} depthTest={false} depthWrite={false} />
          </mesh>
          <mesh position={[-side * 0.04, -0.01, 0.01]} renderOrder={10}>
            <sphereGeometry args={[0.024, 12, 8]} />
            <meshStandardMaterial color={skin} roughness={0.9} depthTest={false} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
            <capsuleGeometry args={[0.035, 0.19, 5, 12]} />
            <meshStandardMaterial color={appearance.top === 'tee' ? skin : appearance.topColor}
              roughness={0.9} depthTest={false} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
