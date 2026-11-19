import { create } from 'zustand'

export type Player = {
  id: string
  name: string
  color: string
  x: number
  z: number
  rotation: number
  animation: 'idle' | 'walk'
}
export type Chat = { id: string; name: string; text: string; at: string }
type ServerMessage =
  | { type: 'welcome'; id: string; players: Player[] }
  | { type: 'snapshot'; players: Player[] }
  | { type: 'join'; player: Player }
  | { type: 'leave'; id: string }
  | { type: 'correction'; player: Player }
  | ({ type: 'chat' } & Chat)

type State = {
  id: string | null
  status: 'offline' | 'connecting' | 'online' | 'reconnecting'
  players: Record<string, Player>
  chats: Chat[]
}
export const useNetwork = create<State>(() => ({
  id: null, status: 'offline', players: {}, chats: [],
}))

// Mutable local simulation: no React re-render on every animation frame.
export const localPlayer = { x: 0, z: 6, rotation: 0, animation: 'idle' as 'idle' | 'walk' }
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
      switch (msg.type) {
        case 'welcome': {
          attempt = 0
          const me = msg.players.find(p => p.id === msg.id)
          if (me) Object.assign(localPlayer, me)
          useNetwork.setState({
            id: msg.id, status: 'online',
            players: Object.fromEntries(msg.players.map(p => [p.id, p])),
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
            return { players }
          })
          break
        case 'correction':
          Object.assign(localPlayer, msg.player)
          break
        case 'chat':
          useNetwork.setState(s => ({ chats: [...s.chats.slice(-99), msg] }))
          break
      }
    }
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      if (stopped) return
      useNetwork.setState({ id: null, players: {}, status: 'reconnecting' })
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
    useNetwork.setState({ id: null, players: {}, status: 'offline' })
  }
}
