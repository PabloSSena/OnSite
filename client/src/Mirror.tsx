import { useEffect, useRef } from 'react'
import { Group, PlaneGeometry } from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { MIRROR_GIF_LAYER } from './MirrorGIFs'

export default function WallMirror() {
  const surface = useRef<Group>(null)

  useEffect(() => {
    const group = surface.current
    if (!group) return

    // PlaneGeometry lies in XY with its normal facing +Z, into the room.
    const geometry = new PlaneGeometry(3.2, 2.6)
    const mirror = new Reflector(geometry, {
      color: 0x808080,
      textureWidth: 1024,
      textureHeight: 512,
      clipBias: 0.003,
      multisample: 0,
    })
    mirror.name = 'wall-mirror'
    // Include the local full-body avatar, but never the layer-2 viewmodel.
    mirror.camera.layers.set(0)
    mirror.camera.layers.enable(1)
    mirror.camera.layers.enable(MIRROR_GIF_LAYER)
    group.add(mirror)

    return () => {
      group.remove(mirror)
      // Reflector disposes its material and render target, not its geometry.
      mirror.dispose()
      geometry.dispose()
    }
  }, [])

  return (
    <group position={[0, 1.6, -15.8]}>
      <group ref={surface} />
      {/* The backing stays behind the mirror and ahead of the wall at -15.85. */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[3.36, 2.76, 0.02]} />
        <meshStandardMaterial color="#202a35" roughness={0.75} />
      </mesh>
    </group>
  )
}
