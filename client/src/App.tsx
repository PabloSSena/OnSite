import { useEffect, useRef, useState, type FormEvent } from 'react'
import Office, { type ViewMode } from './Office'
import Webcams, { WebcamSelfPreview } from './Webcams'
import { connect, send, useNetwork } from './network'
import { enableVoicePlayback, joinVoice, leaveVoice, toggleMicrophone, useVoice } from './voice'
import { validGIFURL } from './gif'
import AppearanceEditor from './AppearanceEditor'
import { loadAppearance, saveAppearance, type Appearance } from './appearance'

const labels = { offline: 'Offline', connecting: 'Connecting…', online: 'Live', reconnecting: 'Reconnecting… (room may be full)' }

export default function App() {
  const [name, setName] = useState(() => sessionStorage.getItem('office-name') ?? '')
  const [joined, setJoined] = useState(false)
  const [text, setText] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('first-person')
  const [menuOpen, setMenuOpen] = useState(false)
  const [appearance, setAppearance] = useState(loadAppearance)
  const [editingAppearance, setEditingAppearance] = useState(false)
  const appearanceRef = useRef(appearance)
  const customization = useRef<HTMLDialogElement>(null)
  const [gifURL, setGifURL] = useState('')
  const [gifError, setGifError] = useState('')
  const [gifCooldown, setGifCooldown] = useState(false)
  const { status, players, chats } = useNetwork()
  const voice = useVoice()
  const log = useRef<HTMLDivElement>(null)


  useEffect(() => {
    if (!gifCooldown) return
    const timer = setTimeout(() => setGifCooldown(false), 2000)
    return () => clearTimeout(timer)
  }, [gifCooldown])
  useEffect(() => {
    if (joined) return connect(name, () => appearanceRef.current)
  }, [joined, name])
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [chats])

  function changeAppearance(next: Appearance) {
    appearanceRef.current = next
    setAppearance(next)
    saveAppearance(next)
    if (joined) send({ type: 'appearance', appearance: next })
  }

  function enter(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    sessionStorage.setItem('office-name', trimmed)
    setName(trimmed)
    setMenuOpen(false)
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
      {joined && <Office viewMode={viewMode} />}
      {joined && <>
      <aside className="game-menu" aria-label="Game controls">
        <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="game-controls"
          title={labels[status]} onClick={() => setMenuOpen(open => !open)}>
          <span aria-hidden="true" className={status === 'online' ? 'live' : ''}>●</span> Menu
        </button>
        <div id="game-controls" className="game-menu-panel panel" hidden={!menuOpen}>
        <div className="presence" role="status">{labels[status]} <span className="count">{Object.keys(players).length}/10 people</span></div>
        <div className="game-actions">
          <button aria-pressed={viewMode === 'first-person'} onClick={() => setViewMode(viewMode === 'third-person' ? 'first-person' : 'third-person')}>First-person view</button>
          <button onClick={() => {
            if (document.pointerLockElement) document.exitPointerLock()
            setEditingAppearance(true)
            customization.current?.showModal()
          }}>Customize character</button>
          <button onClick={() => { setMenuOpen(false); setJoined(false) }}>Leave</button>
        </div>
      <section className="voice" aria-label="Voice chat">
        <div className="voice-status" role="status">{voice.status === 'off' ? 'Voice: off'
          : voice.status === 'requesting' ? 'Requesting microphone…'
            : `Voice: ${voice.connected} connected · ${voice.muted ? 'Mic muted' : 'Mic on'}`}</div>
        <div className="voice-controls">
          {voice.status === 'off'
            ? <button onClick={() => void joinVoice()} disabled={status !== 'online'}>Join voice</button>
            : <>
              {voice.status === 'active' && <button onClick={toggleMicrophone} aria-pressed={voice.muted}>
                {voice.muted ? 'Unmute microphone' : 'Mute microphone'}
              </button>}
              <button onClick={leaveVoice}>{voice.status === 'requesting' ? 'Cancel microphone request' : 'Leave voice'}</button>
            </>}
          {voice.playbackBlocked && <button onClick={() => void enableVoicePlayback()}>Enable sound</button>}
        </div>
        {voice.error && <p className="voice-error" role="alert">{voice.error}</p>}
      </section>
      <Webcams />
        </div>
      </aside>
      <WebcamSelfPreview />
      <dialog ref={customization} className="customization-dialog panel" aria-label="Customize character"
        onClose={() => setEditingAppearance(false)}>
        <div className="customization-title"><h2>Your character</h2>
          <button onClick={() => customization.current?.close()} aria-label="Close customization">Done</button>
        </div>
        {editingAppearance && <AppearanceEditor value={appearance} onChange={changeAppearance} />}
      </dialog>
      </>}
      {joined && <div className="help"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move <span>·</span>
        <kbd>Space</kbd> Jump <span>·</span> Left / Right click Punch <span>·</span> <kbd>F</kbd> Alternate<br />
        {viewMode === 'first-person' ? 'Click the scene to look around · Esc to release mouse / chat' : 'Click the scene to play · Click the chat to talk'}</div>}
      {!joined ? (
        <div className="overlay">
          <div className="join-layout panel">
          <form className="join" onSubmit={enter}>
            <span className="eyebrow">YOUR MEETING SPOT</span>
            <h1>Ready to work<br />together?</h1>
            <p>Pick a name and join the office.<br />Open another tab to try it with a friend.</p>
            <label htmlFor="name">What should we call you?</label>
            <input id="name" autoFocus maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
            <button className="primary" type="submit">Join the office →</button>
            <small>Movement + GIFs + opt-in voice and camera • headphones recommended</small>
          </form>
          <AppearanceEditor value={appearance} onChange={changeAppearance} />
          </div>
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
