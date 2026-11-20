import { useEffect, useRef, useState, type FormEvent } from 'react'
import Office from './Office'
import { connect, send, useNetwork } from './network'
import { validGIFURL } from './gif'

const labels = { offline: 'Offline', connecting: 'Connecting…', online: 'Live', reconnecting: 'Reconnecting… (room may be full)' }

export default function App() {
  const [name, setName] = useState(() => sessionStorage.getItem('office-name') ?? '')
  const [joined, setJoined] = useState(false)
  const [text, setText] = useState('')
  const [gifURL, setGifURL] = useState('')
  const [gifError, setGifError] = useState('')
  const [gifCooldown, setGifCooldown] = useState(false)
  const { status, players, chats } = useNetwork()
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!gifCooldown) return
    const timer = setTimeout(() => setGifCooldown(false), 2000)
    return () => clearTimeout(timer)
  }, [gifCooldown])
  useEffect(() => {
    if (joined) return connect(name)
  }, [joined, name])
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [chats])

  function enter(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    sessionStorage.setItem('office-name', trimmed)
    setName(trimmed)
    setJoined(true)
  }
  function chat(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || status !== 'online') return
    send({ type: 'chat', text: text.trim() })
    setText('')
  }
  function shareGIF(e: FormEvent) {
    e.preventDefault()
    if (status !== 'online' || gifCooldown) return
    const url = gifURL.trim()
    if (!validGIFURL(url)) {
      setGifError('Use a direct HTTPS .gif link from Tenor, GIPHY, or Discord—not a share page.')
      return
    }
    send({ type: 'gif', url })
    setGifCooldown(true)
    setGifURL('')
    setGifError('')
  }
  return (
    <main>
      <Office />
      <header className="hud">
        <div><strong><span className="brand-dot" /> office</strong><span className="subtitle">Close, even from afar.</span></div>
        <div className="presence"><span className={status === 'online' ? 'live' : ''}>●</span> {labels[status]} <span className="count">{Object.keys(players).length}/10 people</span></div>
        {joined && <button onClick={() => setJoined(true)}>Leave</button>}
      </header>
      <div className="help"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move <span>·</span> Click the chat to talk</div>
      {!joined ? (
        <div className="overlay">
          <form className="join panel" onSubmit={enter}>
            <span className="eyebrow">YOUR MEETING SPOT</span>
            <h1>Ready to work<br />together?</h1>
            <p>Pick a name and join the office.<br />Open another tab to try it with a friend.</p>
            <label htmlFor="name">What should we call you?</label>
            <input id="name" autoFocus maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
            <button className="primary" type="submit">Join the office →</button>
            <small>Prototype • movement + chat • voice comes later</small>
          </form>
        </div>
      ) : (
        <section className="chat panel" aria-label="Room chat">
          <div className="chat-title"># office <span>ROOM CHAT</span></div>
          <div className="messages" ref={log} role="log" aria-live="polite">
            {chats.length === 0 && <p className="empty">Virtual coffee. Real conversations.<br />Say hello 👋</p>}
            {chats.map((m, i) => <div className="message" key={i}><b>{m.name}</b><time>{new Date(m.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</time><p>{m.text}</p></div>)}
          </div>
          <form onSubmit={chat}>
            <input aria-label="Message" maxLength={300} value={text} onChange={e => setText(e.target.value)} placeholder="Say hello… (Enter to send)" disabled={status !== 'online'} />
            <button type="submit" disabled={status !== 'online' || !text.trim()} aria-label="Send message">↑</button>
          </form>
          <form onSubmit={shareGIF} aria-label="GIF reaction">
            <input aria-label="GIF link" aria-describedby="gif-help" maxLength={1500}
              value={gifURL} onChange={e => { setGifURL(e.target.value); setGifError('') }}
              placeholder="Paste a direct .gif link…" disabled={status !== 'online'} />
            <button type="submit" disabled={status !== 'online' || gifCooldown || !gifURL.trim()}>GIF</button>
          </form>
          <p id="gif-help" className="gif-help">Shows above your head for 8 seconds. External images load for everyone.</p>
          {gifError && <p className="gif-error" role="alert">{gifError}</p>}
        </section>
      )}
    </main>
  )
}
