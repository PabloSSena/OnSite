import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { localPlayer, send, useNetwork, type Player } from './network'
import { blocked } from './world'
import { OfficeWorld } from './OfficeWorld'

function Avatar({ player, local = false }: { player: Player; local?: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Mesh>(null!)
  const target = useRef(new THREE.Quaternion())
  const euler = useRef(new THREE.Euler())
  useFrame(({ clock }, dt) => {
    const p = local ? localPlayer : (useNetwork.getState().players[player.id] ?? player)
    const alpha = 1 - Math.exp(-14 * dt)
    group.current.position.x = local ? p.x : THREE.MathUtils.lerp(group.current.position.x, p.x, alpha)
    group.current.position.z = local ? p.z : THREE.MathUtils.lerp(group.current.position.z, p.z, alpha)
    target.current.setFromEuler(euler.current.set(0, p.rotation, 0))
    group.current.quaternion.slerp(target.current, alpha)
    body.current.position.y = 0.65 + (p.animation === 'walk' ? Math.sin(clock.elapsedTime * 14) * 0.045 : 0)
  })
  return (
    <group ref={group} position={[player.x, 0, player.z]}>
      <mesh ref={body} position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[0.6, 0.9, 0.45]} />
        <meshStandardMaterial color={player.color} />
      </mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.48, 0.42, 0.45]} />
        <meshStandardMaterial color="#f4dcc5" />
      </mesh>
      <mesh position={[0, 1.32, -0.24]}>
        <boxGeometry args={[0.3, 0.08, 0.03]} />
        <meshStandardMaterial color="#243343" />
      </mesh>
      <Html position={[0, 1.95, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <span className={`nametag ${local ? 'me' : ''}`}>{player.name}{local ? ' (you)' : ''}</span>
      </Html>
    </group>
  )
}

function Controller({ obstacles }: { obstacles: React.RefObject<THREE.Group | null> }) {
  const keys = useRef(new Set<string>())
  const elapsed = useRef(0)
  const { camera } = useThree()
  const math = useRef({
    focus: new THREE.Vector3(), desired: new THREE.Vector3(), direction: new THREE.Vector3(),
    ray: new THREE.Raycaster(), offset: new THREE.Vector3(0, 8, 10),
  })
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, button, [contenteditable="true"]')) return
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault()
        keys.current.add(e.code)
      }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    const clear = () => keys.current.clear()
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
    const moving = Math.hypot(dx, dz)
    const online = useNetwork.getState().status === 'online'
    if (moving && online) {
      dx /= moving
      dz /= moving
      const x = localPlayer.x + dx * 4 * dt
      const z = localPlayer.z + dz * 4 * dt
      if (!blocked(x, localPlayer.z)) localPlayer.x = x
      if (!blocked(localPlayer.x, z)) localPlayer.z = z
      localPlayer.rotation = Math.atan2(-dx, -dz)
    }
    localPlayer.animation = moving && online ? 'walk' : 'idle'
    elapsed.current += delta
    if (elapsed.current >= 0.05 && online) {
      elapsed.current = 0
      send({ type: 'move', ...localPlayer })
    }

    const { focus, desired, direction, ray, offset } = math.current
    focus.set(localPlayer.x, 1.1, localPlayer.z)
    desired.copy(focus).add(offset)
    direction.copy(desired).sub(focus).normalize()
    ray.set(focus, direction)
    ray.far = offset.length()
    const hit = obstacles.current && ray.intersectObjects(obstacles.current.children, false)[0]
    if (hit) desired.copy(focus).addScaledVector(direction, Math.max(0.25, hit.distance - 0.35))
    // Snap inward to avoid smoothing the camera through a wall; ease outward.
    if (hit) camera.position.copy(desired)
    else camera.position.lerp(desired, 1 - Math.exp(-10 * dt))
    camera.lookAt(focus)
  })
  return null
}

function Scene() {
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
      <Controller obstacles={obstacles} />
      {Object.values(players).map(p => <Avatar key={p.id} player={p} local={p.id === id} />)}
    </>
  )
}

export default function Office() {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 7, 13], fov: 55, near: 0.1, far: 100 }}>
      <Scene />
    </Canvas>
  )
}
