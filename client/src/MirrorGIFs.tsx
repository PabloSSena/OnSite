import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { Sprite } from 'three'
import { useGIFTexture } from './gifTexture'
import { useNetwork, type GIFReaction } from './network'

// Layer 3 is reflected by the mirror, but not drawn over the existing DOM bubbles.
export const MIRROR_GIF_LAYER = 3

function MirrorGIF({ id, reaction }: { id: string; reaction: GIFReaction }) {
  const sprite = useRef<Sprite>(null)
  const texture = useGIFTexture(reaction.url)
  useFrame(({ scene }) => {
    const card = sprite.current
    if (!card) return
    const avatar = scene.getObjectByName(`avatar-${id}`)
    card.visible = !!avatar
    if (avatar) {
      avatar.getWorldPosition(card.position)
      card.position.y += 3
    }
  })
  if (!texture) return null
  return <sprite ref={node => { sprite.current = node; node?.layers.set(MIRROR_GIF_LAYER) }}
    name={`mirror-gif-${id}`} scale={[0.96, 0.72, 1]}>
    <spriteMaterial map={texture} toneMapped={false} depthTest depthWrite />
  </sprite>
}

export default function MirrorGIFs() {
  const gifs = useNetwork(s => s.gifs)
  return <>{Object.entries(gifs).map(([id, reaction]) =>
    <LiveMirrorGIF key={`${id}-${reaction.receivedAt}`} id={id} reaction={reaction} />)}</>
}

function LiveMirrorGIF({ id, reaction }: { id: string; reaction: GIFReaction }) {
  const [visible, setVisible] = useState(() => reaction.receivedAt + 8000 > Date.now())
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), Math.max(0, reaction.receivedAt + 8000 - Date.now()))
    return () => clearTimeout(timer)
  }, [reaction.receivedAt])
  // Unmount the decoder/texture on expiry, not only on the next GIF.
  return visible ? <MirrorGIF id={id} reaction={reaction} /> : null
}
