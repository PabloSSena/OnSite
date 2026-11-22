import { create } from 'zustand'
import { localPlayer, send, subscribeSignals, useNetwork, type VoiceSignal } from './network'
import { createMicrophoneMeter } from './microphoneMeter'

type VoiceState = {
  status: 'off' | 'requesting' | 'active'
  muted: boolean
  connected: number
  error: string
  playbackBlocked: boolean
}

export const useVoice = create<VoiceState>(() => ({
  status: 'off', muted: false, connected: 0, error: '', playbackBlocked: false,
}))

type Call = {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  candidates: (RTCIceCandidateInit | null)[]
  pending: Promise<void>
}

let stream: MediaStream | null = null
let microphoneMeter: ReturnType<typeof createMicrophoneMeter> | null = null
let identity: string | null = null
let generation = 0
const calls = new Map<string, Call>()

function rtcConfiguration(): RTCConfiguration {
  // Override at build time for a private STUN/TURN service; never commit credentials.
  const configured = import.meta.env.VITE_ICE_SERVERS
  const iceServers: RTCIceServer[] = configured
    ? JSON.parse(configured)
    : [{ urls: 'stun:stun.l.google.com:19302' }]
  if (!Array.isArray(iceServers) || iceServers.some(server => !server
    || !(typeof server.urls === 'string' || (Array.isArray(server.urls) && server.urls.every(url => typeof url === 'string'))))) {
    throw new Error('Invalid ICE server configuration')
  }
  return { iceServers }
}

function updateConnected() {
  useVoice.setState({ connected: [...calls.values()].filter(call => call.pc.connectionState === 'connected').length })
}

function removeCall(id: string) {
  const call = calls.get(id)
  if (!call) return
  calls.delete(id)
  call.pc.onicecandidate = null
  call.pc.ontrack = null
  call.pc.onconnectionstatechange = null
  call.pc.close()
  call.audio.pause()
  call.audio.srcObject = null
  call.audio.remove()
  updateConnected()
}

export function leaveVoice() {
  generation++
  // Send consent withdrawal before closing local resources.
  if (identity && useNetwork.getState().id === identity) send({ type: 'voice', enabled: false })
  identity = null
  microphoneMeter?.dispose()
  microphoneMeter = null
  localPlayer.speaking = 0
  for (const track of stream?.getTracks() ?? []) {
    track.onended = null
    track.stop()
  }
  stream = null
  for (const id of calls.keys()) removeCall(id)
  useVoice.setState({ status: 'off', muted: false, connected: 0, error: '', playbackBlocked: false })
}

function failedConnection() {
  useVoice.setState({ error: 'Voice connection failed. Leave voice and join again. Some networks require a TURN relay.' })
}

function createCall(id: string): Call {
  const existing = calls.get(id)
  if (existing) return existing
  if (!stream || !identity) throw new Error('Voice is not active')
  const pc = new RTCPeerConnection(rtcConfiguration())
  const audio = document.createElement('audio')
  audio.autoplay = true
  audio.hidden = true
  audio.dataset.voicePeer = id
  document.body.append(audio)
  const call: Call = { pc, audio, candidates: [], pending: Promise.resolve() }
  calls.set(id, call)
  for (const track of stream.getAudioTracks()) pc.addTrack(track, stream)
  pc.onicecandidate = event => {
    if (calls.get(id) !== call) return
    send({ type: 'signal', to: id, kind: 'ice', data: event.candidate?.toJSON() ?? null })
  }
  pc.ontrack = event => {
    audio.srcObject = event.streams[0] ?? new MediaStream([event.track])
    void audio.play().catch(() => {
      if (calls.get(id) === call) useVoice.setState({ playbackBlocked: true })
    })
  }
  pc.onconnectionstatechange = () => {
    updateConnected()
    if (pc.connectionState === 'failed') failedConnection()
  }
  return call
}

// Serialize SDP and ICE work per peer. Candidates can arrive before the offer.
function enqueue(id: string, call: Call, task: () => Promise<void>) {
  call.pending = call.pending.then(async () => {
    if (calls.get(id) === call && stream) await task()
  }).catch(() => {
    if (calls.get(id) === call && stream) failedConnection()
  })
}

async function flushCandidates(call: Call) {
  for (const candidate of call.candidates.splice(0)) await call.pc.addIceCandidate(candidate ?? undefined)
}

function reconcileCalls() {
  const { players, id, status } = useNetwork.getState()
  if (!stream || !identity || status !== 'online' || id !== identity) return
  for (const remoteId of calls.keys()) {
    if (!players[remoteId]?.voice) removeCall(remoteId)
  }
  for (const player of Object.values(players)) {
    if (!player.voice || player.id === id || calls.has(player.id)) continue
    try {
      const call = createCall(player.id)
      // Exactly one offerer per pair avoids simultaneous-offer glare.
      if (id < player.id) enqueue(player.id, call, async () => {
        await call.pc.setLocalDescription(await call.pc.createOffer())
        if (calls.get(player.id) === call) {
          send({ type: 'signal', to: player.id, kind: 'offer', data: call.pc.localDescription?.toJSON() })
        }
      })
    } catch {
      failedConnection()
    }
  }
}

function receiveSignal(signal: VoiceSignal) {
  if (!stream || !identity || !useNetwork.getState().players[signal.from] || signal.from === identity) return
  try {
    const call = createCall(signal.from)
    enqueue(signal.from, call, async () => {
      if (signal.kind === 'ice') {
        if (call.pc.remoteDescription) await call.pc.addIceCandidate(signal.data ?? undefined)
        else if (call.candidates.length < 100) call.candidates.push(signal.data)
      } else {
        await call.pc.setRemoteDescription(signal.data)
        await flushCandidates(call)
        if (signal.kind === 'offer') {
          await call.pc.setLocalDescription(await call.pc.createAnswer())
          if (calls.get(signal.from) === call) {
            send({ type: 'signal', to: signal.from, kind: 'answer', data: call.pc.localDescription?.toJSON() })
          }
        }
      }
    })
  } catch {
    failedConnection()
  }
}

const unsubscribeSignals = subscribeSignals(receiveSignal)
const unsubscribeNetwork = useNetwork.subscribe((state, previous) => {
  if (state.id !== previous.id || state.status !== 'online') {
    // Never silently reacquire the microphone after reconnecting.
    if (useVoice.getState().status !== 'off') leaveVoice()
  } else if (state.players !== previous.players) {
    reconcileCalls()
  }
})

export async function joinVoice() {
  if (useVoice.getState().status !== 'off') return
  const { id, status } = useNetwork.getState()
  if (!id || status !== 'online') return
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
    useVoice.setState({ error: 'Voice requires a supported browser on HTTPS or localhost.' })
    return
  }
  const request = ++generation
  useVoice.setState({ status: 'requesting', error: '' })
  let captured: MediaStream | null = null
  try {
    // Validate configuration before asking for microphone access.
    rtcConfiguration()
    captured = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    })
    if (request !== generation || useNetwork.getState().id !== id || useNetwork.getState().status !== 'online') {
      captured.getTracks().forEach(track => track.stop())
      return
    }
    if (captured.getAudioTracks().length === 0) throw new Error('No microphone track')
    stream = captured
    identity = id
    // Meter failures must not prevent the existing voice call from working.
    try { microphoneMeter = createMicrophoneMeter(stream) } catch { microphoneMeter = null }
    for (const track of stream.getAudioTracks()) track.onended = () => {
      leaveVoice()
      useVoice.setState({ error: 'Microphone disconnected. Join voice to try again.' })
    }
    useVoice.setState({ status: 'active', muted: false })
    send({ type: 'voice', enabled: true })
    reconcileCalls()
  } catch (error) {
    captured?.getTracks().forEach(track => track.stop())
    if (request !== generation) return
    leaveVoice()
    const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
    useVoice.setState({ error: denied
      ? 'Microphone permission denied. Allow microphone access in your browser, then try again.'
      : 'Could not start voice. Check your microphone and ICE server configuration, then try again.' })
  }
}

export function toggleMicrophone() {
  if (!stream) return
  const muted = !useVoice.getState().muted
  for (const track of stream.getAudioTracks()) track.enabled = !muted
  if (muted) localPlayer.speaking = 0
  else microphoneMeter?.resume()
  useVoice.setState({ muted })
}

export function localSpeechLevel(): number {
  const voice = useVoice.getState()
  return voice.status === 'active' && !voice.muted ? microphoneMeter?.level() ?? 0 : 0
}

export async function enableVoicePlayback() {
  microphoneMeter?.resume()
  const results = await Promise.allSettled([...calls.values()]
    .filter(call => call.audio.srcObject !== null).map(call => call.audio.play()))
  useVoice.setState({ playbackBlocked: results.some(result => result.status === 'rejected') })
}

window.addEventListener('pagehide', leaveVoice)

if (import.meta.hot) import.meta.hot.dispose(() => {
  leaveVoice()
  unsubscribeSignals()
  unsubscribeNetwork()
  window.removeEventListener('pagehide', leaveVoice)
})
