import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useCameraVideo } from './cameraVideo'
import { localPlayer, useNetwork, type Player } from './network'
import { useWebcam } from './webcam'

type ViewMode = 'first-person' | 'third-person'

const frameShape = new THREE.Shape()
frameShape.moveTo(-0.495, -0.37)
frameShape.lineTo(0.495, -0.37)
frameShape.lineTo(0.495, 0.37)
frameShape.lineTo(-0.495, 0.37)
frameShape.closePath()
const frameOpening = new THREE.Path()
frameOpening.moveTo(-0.46665, -0.35)
frameOpening.lineTo(-0.46665, 0.35)
frameOpening.lineTo(0.46665, 0.35)
frameOpening.lineTo(0.46665, -0.35)
frameOpening.closePath()
frameShape.holes.push(frameOpening)

function CameraPanel({ player, stream, local, viewMode }: {
  player: Player; stream: MediaStream; local: boolean; viewMode: ViewMode
}) {
  const root = useRef<THREE.Group>(null)
  const cameraPosition = useRef(new THREE.Vector3())
  const position = useRef(new THREE.Vector3(player.x, player.y, player.z))
  const texture = useCameraVideo(stream, local ? 'Local camera source' : player.name)

  useEffect(() => {
    root.current?.traverse(object => object.layers.set(local && viewMode === 'first-person' ? 1 : 0))
  }, [local, viewMode, texture])

  useFrame(({ scene, camera }, delta) => {
    const group = root.current
    if (!group) return
    const avatar = scene.getObjectByName(`avatar-${player.id}`)
    if (avatar) avatar.getWorldPosition(position.current)
    else {
      const next = local ? localPlayer : useNetwork.getState().players[player.id] ?? player
      if (local) position.current.set(next.x, next.y, next.z)
      else {
        const blend = 1 - Math.exp(-12 * Math.min(delta, 0.05))
        position.current.x += (next.x - position.current.x) * blend
        position.current.y += (next.y - position.current.y) * blend
        position.current.z += (next.z - position.current.z) * blend
      }
    }
    group.position.copy(position.current)
    group.position.y += 2.35
    camera.getWorldPosition(cameraPosition.current)
    // One world-space pose per frame: the mirror reflects the same physical card.
    group.rotation.y = Math.atan2(cameraPosition.current.x - group.position.x,
      cameraPosition.current.z - group.position.z)
  })

  if (!texture) return null
  return <group ref={root} name={`world-camera-${player.id}`}
    position={[player.x, player.y + 2.35, player.z]}>
    <mesh>
      <shapeGeometry args={[frameShape]} />
      <meshBasicMaterial color="#17212c" side={THREE.DoubleSide} depthTest depthWrite />
    </mesh>
    <mesh>
      <planeGeometry args={[0.9333, 0.7]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} depthTest depthWrite />
    </mesh>
  </group>
}

export default function WorldCameras({ viewMode }: { viewMode: ViewMode }) {
  const local = useWebcam(s => s.local)
  const remote = useWebcam(s => s.remote)
  const players = useNetwork(s => s.players)
  const id = useNetwork(s => s.id)
  return <>
    {Object.values(players).map(player => {
      const stream = player.id === id ? local : remote[player.id]
      return stream ? <CameraPanel key={player.id} player={player} stream={stream}
        local={player.id === id} viewMode={viewMode} /> : null
    })}
  </>
}
