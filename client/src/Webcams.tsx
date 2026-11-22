import { useEffect, useRef } from 'react'
import { useNetwork } from './network'
import { startWebcams, useWebcam } from './webcam'
import './webcams.css'

function SelfPreviewVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current!
    video.srcObject = stream
    void video.play().catch(() => {})
    return () => {
      video.pause()
      video.srcObject = null
    }
  }, [stream])
  return <figure className="webcam-self-preview">
    <video ref={ref} autoPlay playsInline muted aria-label="You" />
    <figcaption>You</figcaption>
  </figure>
}

export function WebcamSelfPreview() {
  const local = useWebcam(s => s.local)
  return local ? <SelfPreviewVideo stream={local} /> : null
}

export default function Webcams() {
  const controller = useRef<ReturnType<typeof startWebcams> | null>(null)
  const { local, pending, error } = useWebcam()
  const online = useNetwork(s => s.status === 'online')
  useEffect(() => {
    const cameras = startWebcams()
    controller.current = cameras
    return () => { cameras.dispose(); controller.current = null }
  }, [])
  return <section className="webcams panel" aria-label="Room webcams">
    <div className="webcam-controls">
      <button disabled={!online} aria-pressed={!!local} onClick={() => {
        if (local || pending) controller.current?.stop()
        else void controller.current?.enable()
      }}>{local ? 'Turn camera off' : pending ? 'Cancel camera request' : 'Turn camera on'}</button>
      <small>{local ? 'Visible to everyone in this room · No audio' : 'Camera off · No audio'}</small>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>
}
