import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { localPlayer, send, useNetwork } from './network'
import { nearestSeat, stepPhysics, type Seat } from './world'
import { SEATED_HIP_LIFT, STANDING_HIP } from './avatarMotion'
import WallMirror from './Mirror'
import Avatar, { FirstPersonFists } from './Avatar'
import { OfficeWorld } from './OfficeWorld'
import WorldCameras from './WorldCameras'
import { localSpeechLevel } from './voice'

export type ViewMode = 'third-person' | 'first-person'

// HUD prompt. Written only when the value changes, never every frame.
export const useSeatHint = create<{ hint: 'sit' | 'stand' | null }>(() => ({ hint: null }))

// Entering and leaving glide at walking speed, under the server's 6 units/s limit.
const SEAT_GLIDE_SPEED = 4
type Seating = { phase: 'none' | 'entering' | 'seated' | 'leaving'; seat: Seat | null; entry: { x: number; z: number } }
const standing = (): Seating => ({ phase: 'none', seat: null, entry: { x: 0, z: 0 } })

function Controller({ obstacles, viewMode }: { obstacles: React.RefObject<THREE.Group | null>; viewMode: ViewMode }) {
  const keys = useRef(new Set<string>())
  const elapsed = useRef(0)
  const look = useRef({ yaw: 0, pitch: 0 })
  const actions = useRef({ jump: false, left: false, right: false, seat: false, nextLeft: true, velocity: 0, leftCooldown: 0, rightCooldown: 0 })
  const seating = useRef(standing())
  const eyeOffset = useRef(0)
  const id = useNetwork(s => s.id)
  const { camera, gl } = useThree()
  const math = useRef({
    focus: new THREE.Vector3(), desired: new THREE.Vector3(), direction: new THREE.Vector3(),
    ray: new THREE.Raycaster(), offset: new THREE.Vector3(0, 8, 10),
  })
  useEffect(() => {
    actions.current = { jump: false, left: false, right: false, seat: false, nextLeft: true, velocity: 0, leftCooldown: 0, rightCooldown: 0 }
    seating.current = standing()
  }, [id])
  useEffect(() => {
    const punch = (e: PointerEvent) => {
      if (document.querySelector('dialog[open]') || document.activeElement?.closest('input, textarea, select, button, [contenteditable="true"]')) return
      if (viewMode === 'third-person' || document.pointerLockElement === gl.domElement) {
        if (e.button === 0) actions.current.left = true
        if (e.button === 2) actions.current.right = true
      }
    }
    const contextMenu = (e: MouseEvent) => e.preventDefault()
    gl.domElement.addEventListener('pointerdown', punch)
    gl.domElement.addEventListener('contextmenu', contextMenu)
    return () => {
      gl.domElement.removeEventListener('pointerdown', punch)
      gl.domElement.removeEventListener('contextmenu', contextMenu)
    }
  }, [viewMode, gl])
  useEffect(() => {
    keys.current.clear()
    actions.current.jump = actions.current.left = actions.current.right = actions.current.seat = false
    if (viewMode !== 'first-person') return
    const canvas = gl.domElement
    look.current = { yaw: localPlayer.rotation, pitch: 0 }
    const lock = (e: MouseEvent) => {
      if (e.button !== 0 || document.activeElement?.closest('input, textarea, button, [contenteditable="true"]')) return
      if (useNetwork.getState().status !== 'online' || document.pointerLockElement === canvas) return
      // A denied request must not leave an unhandled promise rejection.
      canvas.requestPointerLock()?.catch(() => {})
    }
    const mouse = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      look.current.yaw = THREE.MathUtils.euclideanModulo(look.current.yaw - e.movementX * 0.002 + Math.PI, Math.PI * 2) - Math.PI
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - e.movementY * 0.002, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05)
    }
    const clear = () => {
      keys.current.clear()
      actions.current.jump = actions.current.left = actions.current.right = actions.current.seat = false
    }
    const escape = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && document.pointerLockElement === canvas) {
        clear()
        document.exitPointerLock()
      }
    }
    canvas.addEventListener('click', lock)
    window.addEventListener('keydown', escape)
    document.addEventListener('mousemove', mouse)
    document.addEventListener('pointerlockchange', clear)
    return () => {
      canvas.removeEventListener('click', lock)
      window.removeEventListener('keydown', escape)
      document.removeEventListener('mousemove', mouse)
      document.removeEventListener('pointerlockchange', clear)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }, [viewMode, gl])
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || (e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable="true"]')) return
      if (e.code === 'KeyE') {
        e.preventDefault()
        if (!e.repeat) actions.current.seat = true
      }
      if (e.code === 'Space' || e.code === 'KeyF') {
        e.preventDefault()
        if (!e.repeat) {
          if (e.code === 'Space') actions.current.jump = true
          else {
            const action = actions.current
            if (action.nextLeft) action.left = true
            else action.right = true
            action.nextLeft = !action.nextLeft
          }
        }
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault()
        keys.current.add(e.code)
      }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    const clear = () => {
      keys.current.clear()
      actions.current.jump = actions.current.left = actions.current.right = actions.current.seat = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    window.addEventListener('focusin', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      window.removeEventListener('focusin', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [])
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const k = keys.current
    let dx = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'))
    let dz = Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp'))
    if (viewMode === 'first-person') {
      if (document.pointerLockElement !== gl.domElement) {
        dx = 0
        dz = 0
      }
      const { yaw } = look.current
      const strafe = dx
      dx = strafe * Math.cos(yaw) + dz * Math.sin(yaw)
      dz = -strafe * Math.sin(yaw) + dz * Math.cos(yaw)
    }
    const moving = Math.hypot(dx, dz)
    const online = useNetwork.getState().status === 'online'
    localPlayer.speaking = online ? localSpeechLevel() : 0
    const active = online && (viewMode === 'third-person' || document.pointerLockElement === gl.domElement)
    const action = actions.current
    action.leftCooldown = Math.max(0, action.leftCooldown - dt)
    action.rightCooldown = Math.max(0, action.rightCooldown - dt)
    localPlayer.punchLeft = Math.max(0, localPlayer.punchLeft - dt)
    localPlayer.punch = Math.max(0, localPlayer.punch - dt)
    const jump = active && action.jump
    if (active && action.left && action.leftCooldown === 0) {
      localPlayer.punchLeft = 0.32
      action.leftCooldown = 0.45
    }
    if (active && action.right && action.rightCooldown === 0) {
      localPlayer.punch = 0.32
      action.rightCooldown = 0.45
    }
    const toggleSeat = active && action.seat
    action.jump = action.left = action.right = action.seat = false
    const sitting = seating.current
    if (!online) seating.current = standing()
    else if (sitting.phase === 'none' && toggleSeat && localPlayer.y <= 0.01) {
      const seat = nearestSeat(localPlayer.x, localPlayer.z)
      if (seat) {
        seating.current = { phase: 'entering', seat, entry: { x: localPlayer.x, z: localPlayer.z } }
        look.current.yaw = seat.facing
      }
    } else if (sitting.phase === 'seated' && sitting.seat) {
      // A server correction moved us off the seat: drop back to normal movement.
      if (Math.hypot(localPlayer.x - sitting.seat.x, localPlayer.z - sitting.seat.z) > 0.3) seating.current = standing()
      else if (toggleSeat || jump || (active && moving)) sitting.phase = 'leaving'
    } else if (sitting.phase === 'entering' && toggleSeat) sitting.phase = 'leaving'
    const seated = seating.current
    if (moving && online) {
      dx /= moving
      dz /= moving
      if (viewMode === 'third-person' && seated.phase === 'none') localPlayer.rotation = Math.atan2(-dx, -dz)
    }
    if (online && seated.phase !== 'none' && seated.seat) {
      // Glide into or out of the seat; furniture collision does not apply here.
      const target = seated.phase === 'leaving' ? seated.entry : seated.seat
      const tx = target.x - localPlayer.x
      const tz = target.z - localPlayer.z
      const remaining = Math.hypot(tx, tz)
      const step = SEAT_GLIDE_SPEED * dt
      if (remaining <= step) {
        localPlayer.x = target.x
        localPlayer.z = target.z
        if (seated.phase === 'entering') seated.phase = 'seated'
        else if (seated.phase === 'leaving') seating.current = standing()
      } else {
        localPlayer.x += tx / remaining * step
        localPlayer.z += tz / remaining * step
      }
      localPlayer.y = action.velocity = 0
      if (seated.phase !== 'leaving') localPlayer.rotation = seated.seat.facing
      else if (viewMode === 'third-person' && remaining > 0) localPlayer.rotation = Math.atan2(-tx, -tz)
    } else if (online) {
      const next = stepPhysics(
        { x: localPlayer.x, y: localPlayer.y, z: localPlayer.z, velocity: action.velocity },
        moving ? dx * 4 * dt : 0, moving ? dz * 4 * dt : 0, dt, jump,
      )
      localPlayer.x = next.x
      localPlayer.y = next.y
      localPlayer.z = next.z
      action.velocity = next.velocity
    } else {
      localPlayer.y = localPlayer.punch = localPlayer.punchLeft = action.velocity = 0
    }
    const phase = seating.current.phase
    if (viewMode === 'first-person' && online && (phase === 'none' || phase === 'leaving')) localPlayer.rotation = look.current.yaw
    localPlayer.animation = !online ? 'idle'
      : phase === 'seated' ? 'sit'
        : phase !== 'none' || moving ? 'walk' : 'idle'
    const hint = !online ? null
      : phase === 'seated' ? 'stand'
        : phase === 'none' && localPlayer.y <= 0.01 && nearestSeat(localPlayer.x, localPlayer.z) ? 'sit' : null
    if (useSeatHint.getState().hint !== hint) useSeatHint.setState({ hint })
    const seatNow = seating.current
    const eyeTarget = seatNow.phase === 'seated' && seatNow.seat ? seatNow.seat.height + SEATED_HIP_LIFT - STANDING_HIP : 0
    eyeOffset.current += (eyeTarget - eyeOffset.current) * (1 - Math.exp(-10 * dt))
    elapsed.current += delta
    if (elapsed.current >= 0.05 && online) {
      elapsed.current = 0
      send({ type: 'move', ...localPlayer })
    }

    if (viewMode === 'first-person') {
      // A small eye offset stays inside the collider while clearing the legs.
      camera.position.set(localPlayer.x - Math.sin(look.current.yaw) * 0.12,
        1.4 + localPlayer.y + eyeOffset.current, localPlayer.z - Math.cos(look.current.yaw) * 0.12)
      camera.rotation.set(look.current.pitch, look.current.yaw, 0, 'YXZ')
      return
    }
    const { focus, desired, direction, ray, offset } = math.current
    focus.set(localPlayer.x, 1.1 + localPlayer.y + eyeOffset.current, localPlayer.z)
    desired.copy(focus).add(offset)
    direction.copy(desired).sub(focus).normalize()
    ray.set(focus, direction)
    ray.far = offset.length()
    const hit = obstacles.current && ray.intersectObjects(obstacles.current.children, true)[0]
    if (hit) desired.copy(focus).addScaledVector(direction, Math.max(0.25, hit.distance - 0.35))
    // Snap inward to avoid smoothing the camera through a wall; ease outward.
    if (hit) camera.position.copy(desired)
    else camera.position.lerp(desired, 1 - Math.exp(-10 * dt))
    camera.lookAt(focus)
  })
  return null
}

function Scene({ viewMode }: { viewMode: ViewMode }) {
  // Mount DOM annotations only after Canvas has its final event/portal target.
  const connected = useThree(s => s.events.connected)
  const players = useNetwork(s => s.players)
  const id = useNetwork(s => s.id)
  const obstacles = useRef<THREE.Group>(null)
  return (
    <>
      <color attach="background" args={['#dce5d5']} />
      <fog attach="fog" args={['#dce5d5', 40, 85]} />
      <hemisphereLight args={['#fff4da', '#708565', 2]} />
      <directionalLight position={[-12, 24, 10]} intensity={2.4} color="#fff0d5" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30}
        shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-far={80} shadow-normalBias={0.04} />
      <OfficeWorld obstacles={obstacles} />
      <WallMirror />
      <Controller obstacles={obstacles} viewMode={viewMode} />
      {connected && Object.values(players).map(p => <Avatar key={p.id} player={p} local={p.id === id}
        firstPerson={p.id === id && viewMode === 'first-person'} />)}
      <WorldCameras viewMode={viewMode} />
      {id && viewMode === 'first-person' && <FirstPersonFists />}
    </>
  )
}

export default function Office({ viewMode }: { viewMode: ViewMode }) {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 7, 13], fov: 55, near: 0.1, far: 100 }}>
      <Scene viewMode={viewMode} />
    </Canvas>
  )
}
