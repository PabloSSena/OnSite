// Real integration through the proxy: two clients, movement, chat, leaving, reconnection.
import assert from 'node:assert/strict'

const base = process.env.OFFICE_URL ?? 'http://localhost:8081'
const sockets = []
const health = await fetch(`${base}/healthz`)
assert.equal(await health.text(), 'ok')

async function client(name) {
  const url = new URL('/ws', base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(url)
  sockets.push(ws)
  const messages = []
  const waiters = new Set()
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data)
    messages.push(msg)
    for (const waiter of waiters) waiter()
  })
  const next = (predicate) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      waiters.delete(check)
      reject(new Error(`Timeout: ${name}, ${predicate}`))
    }, 5000)
    function check() {
      const index = messages.findIndex(predicate)
      if (index < 0) return
      clearTimeout(timeout)
      waiters.delete(check)
      resolve(messages.splice(index, 1)[0])
    }
    waiters.add(check)
    check()
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  ws.send(JSON.stringify({ type: 'join', name }))
  const welcome = await next(m => m.type === 'welcome')
  return { ws, next, id: welcome.id, welcome }
}

try {
  const a = await client('Ana')
  const b = await client('Bia')
  assert.equal(b.welcome.players.length, 2)
  await a.next(m => m.type === 'join' && m.player.id === b.id)
  a.ws.send(JSON.stringify({ type: 'move', x: 0.2, z: 6, rotation: 0, animation: 'walk' }))
  await b.next(m => m.type === 'snapshot' && m.players.some(p => p.id === a.id && p.x === 0.2))
  a.ws.send(JSON.stringify({ type: 'chat', text: 'Hello, Bia!', name: 'spoof' }))
  const chat = await b.next(m => m.type === 'chat')
  assert.equal(chat.name, 'Ana')
  assert.equal(chat.text, 'Hello, Bia!')
  assert.equal(chat.id, a.id)
  a.ws.close()
  await b.next(m => m.type === 'leave' && m.id === a.id)
  const reconnect = await client('Ana')
  assert.notEqual(reconnect.id, a.id)
  assert.equal(reconnect.welcome.players.length, 2)
  console.log('PASS: health, join, movement, chat identity, leave, reconnect')
} finally {
  sockets.forEach(ws => ws.close())
}
