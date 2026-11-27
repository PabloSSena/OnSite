import { create } from 'zustand'
import { validGIFURL } from './gif'
import { loadAppearance, parseAppearance, type Appearance } from './appearance'
import { deskToken, parseDesks, type Desk } from './desks'

export type Animation = 'idle' | 'walk' | 'sit'
export type Player = {
  id: string
  name: string
  color: string
  x: number
  y: number
  z: number
  punch: number
  punchLeft: number
  rotation: number
  animation: Animation
  voice: boolean
  speaking: number
  camera: boolean
  appearance: Appearance
  holding: Holding
  drink: number
}
export type Holding = 'none' | 'beer'
export type World = { fridgeOpen: boolean }
export type VideoSignal = { type: 'camera-signal'; from: string; session: string; kind: 'offer' | 'answer'; sdp: string }
const videoSignalListeners = new Set<(signal: VideoSignal) => void>()
export function onVideoSignal(listener: (signal: VideoSignal) => void) {
  videoSignalListeners.add(listener)
  return () => { videoSignalListeners.delete(listener) }
}
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
  | { type: 'welcome'; id: string; players: Player[]; world?: World }
  | { type: 'snapshot'; players: Player[]; world?: World }
  | { type: 'join'; player: Player }
  | { type: 'leave'; id: string }
  | { type: 'correction'; player: Player }
  | { type: 'gif'; id: string; url: string }
  | { type: 'desks'; desks: unknown; mine: number | null }

type State = {
  id: string | null
  status: 'offline' | 'connecting' | 'online' | 'reconnecting'
  players: Record<string, Player>
  gifs: Record<string, GIFReaction>
  desks: Desk[]
  myDesk: number | null
  fridgeOpen: boolean
}
export const useNetwork = create<State>(() => ({
  id: null, status: 'offline', players: {}, gifs: {}, desks: [], myDesk: null, fridgeOpen: false,
}))

// Mutable local simulation: no React re-render on every animation frame.
// `holding` mirrors the server's accepted value; only `drink` is simulated locally.
export const localPlayer = {
  x: 0, y: 0, z: 6, punch: 0, punchLeft: 0, speaking: 0, rotation: 0, drink: 0,
  animation: 'idle' as Animation, holding: 'none' as Holding,
}
const fromServer = (p: Player) => ({ ...p, punchLeft: p.punchLeft ?? 0, holding: p.holding === 'beer' ? 'beer' as const : 'none' as const, drink: p.drink ?? 0 })
let socket: WebSocket | null = null

export function send(message: object) {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 8192) {
    socket.send(JSON.stringify(message))
  }
}

export function connect(name: string, getAppearance?: () => Appearance): () => void {
  let stopped = false
  let retry: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  let current: WebSocket | null = null

  function open() {
    useNetwork.setState({ status: attempt ? 'reconnecting' : 'connecting' })
    const url = import.meta.env.VITE_WS_URL?.trim()
      || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
    const ws = new WebSocket(url)
    socket = current = ws
    ws.onopen = () => {
      const appearance = parseAppearance(getAppearance ? getAppearance() : loadAppearance()) ?? loadAppearance()
      ws.send(JSON.stringify({ type: 'join', name, appearance, token: deskToken() }))
    }
    ws.onmessage = (event) => {
      if (stopped) return
      let msg: ServerMessage
      try { msg = JSON.parse(event.data) as ServerMessage } catch { return }
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
          if (me) Object.assign(localPlayer, fromServer(me))
          useNetwork.setState({
            id: msg.id, status: 'online',
            players: Object.fromEntries(msg.players.map(p => [p.id, p])),
            gifs: {}, fridgeOpen: msg.world?.fridgeOpen === true,
          })
          break
        }
        case 'snapshot': {
          const { id } = useNetwork.getState()
          const me = msg.players.find(p => p.id === id)
          // Interactions are server-approved: adopt the accepted hands, keep local motion.
          if (me) {
            localPlayer.holding = me.holding === 'beer' ? 'beer' : 'none'
            if (localPlayer.holding === 'none') localPlayer.drink = 0
          }
          useNetwork.setState({
            players: Object.fromEntries(msg.players.map(p => [p.id, p])),
            fridgeOpen: msg.world?.fridgeOpen === true,
          })
          break
        }
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
          Object.assign(localPlayer, fromServer(msg.player))
          break
        case 'desks': {
          const desks = parseDesks(msg.desks)
          const mine = typeof msg.mine === 'number' ? msg.mine : null
          if (desks) useNetwork.setState({ desks, myDesk: mine })
          break
        }
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
      localPlayer.holding = 'none'
      localPlayer.drink = 0
      useNetwork.setState({ id: null, players: {}, gifs: {}, desks: [], myDesk: null, fridgeOpen: false, status: 'reconnecting' })
      retry = setTimeout(open, Math.min(1000 * 2 ** attempt++, 10000))
    }
  }
  open()
  return () => {
    stopped = true
    clearTimeout(retry)
    if (current) {
      current.onclose = null
      current.close()
    }
    if (socket === current) socket = null
    localPlayer.holding = 'none'
    localPlayer.drink = 0
    useNetwork.setState({ id: null, players: {}, gifs: {}, desks: [], myDesk: null, fridgeOpen: false, status: 'offline' })
  }
}
