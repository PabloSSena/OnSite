import { useEffect, useRef } from 'react'
import { useNetwork } from './network'
import { startWebcams, useWebcam } from './webcam'
import './webcams.css'

function Video({ stream, label, local = false }: { stream: MediaStream; label: string; local?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current!
    video.srcObject = stream
    return () => { video.srcObject = null }
  }, [stream])
  return <figure className="webcam-tile">
    <video ref={ref} autoPlay playsInline muted aria-label={label} className={local ? 'webcam-local' : ''} />
    <figcaption>{label}</figcaption>
  </figure>
}

export default function Webcams() {
  const controller = useRef<ReturnType<typeof startWebcams> | null>(null)
  const { local, remote, pending, error } = useWebcam()
  const online = useNetwork(s => s.status === 'online')
  const names = useNetwork(s => JSON.stringify(Object.values(s.players).map(p => [p.id, p.name])))
  const players = Object.fromEntries(JSON.parse(names) as [string, string][])
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
    <div className="webcam-videos">
      {local && <Video stream={local} label="You" local />}
      {Object.entries(remote).map(([id, stream]) => <Video key={id} stream={stream} label={players[id] ?? 'Guest'} />)}
    </div>
  </section>
}
