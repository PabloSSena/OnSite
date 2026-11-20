import { Html } from '@react-three/drei'
import { useEffect, useState } from 'react'
import type { GIFReaction } from './network'

export default function GIFBubble({ reaction, name }: { reaction: GIFReaction; name: string }) {
  const [visible, setVisible] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), Math.max(0, reaction.receivedAt + 8000 - Date.now()))
    return () => clearTimeout(timer)
  }, [reaction.receivedAt])
  if (!visible) return null
  return (
    <Html position={[0, 3, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
      <div className="gif-bubble" aria-label={`${name}'s GIF reaction`}>
        {failed ? <span>GIF unavailable</span> :
          <img src={reaction.url} alt={`${name}'s GIF`} referrerPolicy="no-referrer"
            onError={() => setFailed(true)} />}
      </div>
    </Html>
  )
}
