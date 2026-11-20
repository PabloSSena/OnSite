import { create } from 'zustand'
import { validGIFURL } from './gif'

export type Player = {
  id: string
  name: string
  color: string
  x: number
  y: number
  z: number
  punch: number
  rotation: number
  animation: 'idle' | 'walk'
  voice: boolean
  camera: boolean
}
export type VideoSignal = { type: 'camera-signal'; from: string; session: string; kind: 'offer' | 'answer'; sdp: string }
const videoSignalListeners = new Set<(signal: VideoSignal) => void>()
export function onVideoSignal(listener: (signal: VideoSignal) => void) {
  videoSignalListeners.add(listener)
  return () => { videoSignalListeners.delete(listener) }
}
export type Chat = { id: string; name: string; text: string; at: string }
export type VoiceSignal =
  | { type: 'signal'; from: string; kind: 'offer' | 'answer'; data: RTCSessionDescriptionInit }
  | { type: 'signal'; from: string; kind: 'ice'; data: RTCIceCandidateInit | null }
const signalListeners = new Set<(signal: VoiceSignal) => void>()
export function subscribeSignals(listener: (signal: VoiceSignal) => void): () => void {
  signalListeners.add(listener)
  return () => { signalListeners.delete(listener) }
}
export type GIFReaction = { url: string; receivedAt: number }
type ServerMessage =
  | VoiceSignal
  | VideoSignal
  | { type: 'welcome'; id: string; players: Player[] }
  | { type: 'snapshot'; players: Player[] }
  | { type: 'join'; player: Player }
  | { type: 'leave'; id: string }
  | { type: 'correction'; player: Player }
  | ({ type: 'chat' } & Chat)
  | { type: 'gif'; id: string; url: string }

type State = {
  id: string | null
  status: 'offline' | 'connecting' | 'online' | 'reconnecting'
  players: Record<string, Player>
  chats: Chat[]
  gifs: Record<string, GIFReaction>
}
export const useNetwork = create<State>(() => ({
  id: null, status: 'offline', players: {}, chats: [], gifs: {},
}))

// Mutable local simulation: no React re-render on every animation frame.
export const localPlayer = { x: 0, y: 0, z: 6, punch: 0, rotation: 0, animation: 'idle' as 'idle' | 'walk' }
let socket: WebSocket | null = null

export function send(message: object) {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 8192) {
    socket.send(JSON.stringify(message))
  }
}

export function connect(name: string): () => void {
  let stopped = false
  let retry: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  let current: WebSocket | null = null

  function open() {
    useNetwork.setState({ status: attempt ? 'reconnecting' : 'connecting' })
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`)
    socket = current = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', name }))
    ws.onmessage = (event) => {
      if (stopped) return
      let msg: ServerMessage
      try { msg = JSON.parse(event.data) as ServerMessage } catch { return }
      console.log('heyy', msg.type)
      switch (msg.type) {
        case 'camera-signal':
          videoSignalListeners.forEach(listener => listener(msg))
          break
        case 'signal':
          signalListeners.forEach(listener => listener(msg))
          break
        case 'welcome': {
          attempt = 0
          const me = msg.players.find(p => p.id === msg.id)
          if (me) Object.assign(localPlayer, me)
          useNetwork.setState({
            id: msg.id, status: 'online',
            players: Object.fromEntries(msg.players.map(p => [p.id, p])),
            gifs: {},
          })
          break
        }
        case 'snapshot':
          useNetwork.setState({ players: Object.fromEntries(msg.players.map(p => [p.id, p])) })
          break
        case 'join':
          useNetwork.setState(s => ({ players: { ...s.players, [msg.player.id]: msg.player } }))
          break
        case 'leave':
          useNetwork.setState(s => {
            const players = { ...s.players }
            delete players[msg.id]
            const gifs = { ...s.gifs }
            delete gifs[msg.id]
            return { players, gifs }
          })
          break
        case 'correction':
          Object.assign(localPlayer, msg.player)
          break
        case 'chat':
          useNetwork.setState(s => ({ chats: [...s.chats.slice(-99), msg] }))
          break
        case 'gif':
          if (validGIFURL(msg.url) && useNetwork.getState().players[msg.id]) {
            useNetwork.setState(s => ({
              gifs: { ...s.gifs, [msg.id]: { url: msg.url, receivedAt: Date.now() } },
            }))
          }
          break
      }
    }
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      if (stopped) return
      useNetwork.setState({ id: null, players: {}, gifs: {}, status: 'reconnecting' })
      retry = setTimeout(open, Math.min(1000 * 2 ** attempt++, 10000))
    }
  }
  useNetwork.setState({ chats: [] })
  open()
  return () => {
    stopped = true
    clearTimeout(retry)
    if (current) {
      current.onclose = null
      current.close()
    }
    if (socket === current) socket = null
    useNetwork.setState({ id: null, players: {}, gifs: {}, status: 'offline' })
  }
}
