import { create } from 'zustand'
import { onVideoSignal, send, useNetwork, type VideoSignal } from './network'

type VideoState = {
  local: MediaStream | null
  remote: Record<string, MediaStream>
  pending: boolean
  error: string
}
export const useWebcam = create<VideoState>(() => ({ local: null, remote: {}, pending: false, error: '' }))
type Link = { pc: RTCPeerConnection; session: string }

// One send-only connection per viewer avoids offer collisions when both cameras turn on.
export function startWebcams() {
  const outgoing = new Map<string, Link>()
  const incoming = new Map<string, Link>()
  const failed = new Set<string>()
  let disposed = false
  let generation = 0

  function close(map: Map<string, Link>, id: string) {
    map.get(id)?.pc.close()
    map.delete(id)
    if (map === incoming) {
      useWebcam.setState(s => {
        const remote = { ...s.remote }
        delete remote[id]
        return { remote }
      })
    }
  }

  function makeLink(): Link {
    // Optional deployment-specific STUN/TURN configuration; no external service by default.
    const iceServers: RTCIceServer[] = JSON.parse(import.meta.env.VITE_ICE_SERVERS ?? '[]')
    return { pc: new RTCPeerConnection({ iceServers }), session: crypto.randomUUID() }
  }

  async function description(link: Link, type: 'offer' | 'answer') {
    const { pc } = link
    await pc.setLocalDescription(type === 'offer' ? await pc.createOffer() : await pc.createAnswer())
    // Send complete SDP, including ICE candidates, instead of adding a trickle-ICE protocol.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Camera connection timed out.')), 12000)
      function finish(error?: Error) {
        clearTimeout(timer)
        pc.removeEventListener('icegatheringstatechange', check)
        pc.removeEventListener('signalingstatechange', check)
        if (error) reject(error)
        else resolve()
      }
      function check() {
        if (pc.signalingState === 'closed') finish(new Error('Camera connection closed.'))
        else if (pc.iceGatheringState === 'complete') finish()
      }
      pc.addEventListener('icegatheringstatechange', check)
      pc.addEventListener('signalingstatechange', check)
      check()
    })
    return pc.localDescription!.sdp
  }

  function watch(link: Link) {
    link.pc.onconnectionstatechange = () => {
      if (link.pc.connectionState === 'failed' && !disposed) {
        useWebcam.setState({ error: 'A camera connection failed. Turn the camera off and on to retry; this network may require TURN.' })
      }
    }
  }

  async function offer(id: string, stream: MediaStream) {
    let link: Link | undefined
    try {
      link = makeLink()
      outgoing.set(id, link)
      watch(link)
      stream.getVideoTracks().forEach(track => link!.pc.addTrack(track, stream))
      const sdp = await description(link, 'offer')
      if (outgoing.get(id) === link) send({ type: 'camera-signal', to: id, session: link.session, kind: 'offer', sdp })
    } catch {
      if (!disposed && outgoing.get(id) === link) {
        failed.add(id)
        close(outgoing, id)
        useWebcam.setState({ error: 'Could not start camera sharing. Check your connection and ICE configuration, then retry.' })
      }
    }
  }

  async function receive(signal: VideoSignal) {
    const { players, status } = useNetwork.getState()
    if (disposed || status !== 'online' || !players[signal.from]) return
    let link: Link | undefined
    try {
      if (signal.kind === 'offer') {
        close(incoming, signal.from)
        link = makeLink()
        link.session = signal.session
        incoming.set(signal.from, link)
        watch(link)
        const current = link
        link.pc.ontrack = event => {
          if (incoming.get(signal.from) !== current) return
          const stream = new MediaStream([event.track])
          useWebcam.setState(s => ({ remote: { ...s.remote, [signal.from]: stream } }))
        }
        await link.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
        const sdp = await description(link, 'answer')
        if (incoming.get(signal.from) === link) send({ type: 'camera-signal', to: signal.from, session: link.session, kind: 'answer', sdp })
      } else {
        link = outgoing.get(signal.from)
        if (link?.session === signal.session && link.pc.signalingState === 'have-local-offer') {
          await link.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
        }
      }
    } catch {
      if (!disposed && link?.pc.signalingState !== 'closed') {
        useWebcam.setState({ error: 'Could not connect a webcam. Turn the camera off and on to retry.' })
      }
    }
  }

  function stop() {
    generation++
    failed.clear()
    useWebcam.getState().local?.getTracks().forEach(track => track.stop())
    useWebcam.setState({ local: null, pending: false })
    for (const id of outgoing.keys()) close(outgoing, id)
    send({ type: 'camera', enabled: false })
  }

  async function enable() {
    const token = ++generation
    useWebcam.setState({ pending: true, error: '' })
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Webcams require HTTPS or localhost and a supported browser.')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } },
        audio: false,
      })
      if (disposed || token !== generation || useNetwork.getState().status !== 'online') {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      stream.getVideoTracks().forEach(track => { track.onended = stop })
      useWebcam.setState({ local: stream, pending: false })
      send({ type: 'camera', enabled: true })
      reconcile()
    } catch (error) {
      if (!disposed && token === generation) useWebcam.setState({
        pending: false,
        error: error instanceof Error ? error.message : 'Could not access your webcam.',
      })
    }
  }

  function reconcile() {
    const { id, status, players } = useNetwork.getState()
    if (status !== 'online') {
      stop()
      for (const remote of incoming.keys()) close(incoming, remote)
      return
    }
    for (const remote of outgoing.keys()) if (!players[remote]) close(outgoing, remote)
    for (const remote of incoming.keys()) if (!players[remote]?.camera) close(incoming, remote)
    const stream = useWebcam.getState().local
    if (stream) for (const remote of Object.keys(players)) {
      if (remote !== id && !outgoing.has(remote) && !failed.has(remote)) void offer(remote, stream)
    }
  }
  const unsubscribe = useNetwork.subscribe(reconcile)
  const unsignal = onVideoSignal(signal => { void receive(signal) })
  return {
    enable,
    stop,
    dispose() {
      disposed = true
      unsubscribe()
      unsignal()
      stop()
      for (const id of incoming.keys()) close(incoming, id)
      useWebcam.setState({ error: '' })
    },
  }
}
