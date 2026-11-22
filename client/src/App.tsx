import { useEffect, useRef, useState, type FormEvent } from 'react'
import Office, { useSeatHint, useSeatedDesk, type ViewMode } from './Office'
import { DeskEditor, DeskFree, DeskVisit } from './DeskEditor'
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
  const seatHint = useSeatHint(s => s.hint)
  const hintDesk = useSeatHint(s => s.desk)
  const seatedDesk = useSeatedDesk(s => s.desk)
  const log = useRef<HTMLDivElement>(null)
  const desks = useNetwork(s => s.desks)
  const myDesk = useNetwork(s => s.myDesk)
  // Sitting in a desk chair opens that desk's panel; Done/Esc closes it while you stay seated.
  const [deskPanel, setDeskPanel] = useState<number | null>(null)
  const deskDialog = useRef<HTMLDialogElement>(null)
  const panelDesk = deskPanel === null ? undefined : desks.find(d => d.id === deskPanel)
  const panelMode = !panelDesk ? null : !panelDesk.style ? 'free' : panelDesk.id === myDesk ? 'edit' : 'visit'

  useEffect(() => {
    if (seatedDesk === null) {
      deskDialog.current?.close() // Standing up closes the panel.
      return
    }
    if (document.pointerLockElement) document.exitPointerLock()
    setMenuOpen(false)
    setDeskPanel(seatedDesk)
  }, [seatedDesk])
  useEffect(() => {
    // Non-modal, so the desk stays visible (and live) beside the panel.
    if (deskPanel === null) return
    if (!deskDialog.current?.open) deskDialog.current?.show()
    const escape = (e: KeyboardEvent) => {
      if (e.code === 'Escape') deskDialog.current?.close()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [deskPanel])
  const hinted = hintDesk === null ? undefined : desks.find(d => d.id === hintDesk)
  const seatPrompt = !seatHint ? '' : seatHint === 'stand' ? 'Press E to stand up'
    : !hinted ? 'Press E to sit'
      : !hinted.style ? (myDesk === null ? 'Press E to sit and claim this desk' : 'Press E to sit')
        : hinted.id === myDesk ? 'Press E to sit at your desk' : `Press E to sit at ${hinted.ownerName}'s desk`

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
      {joined && <Office viewMode={viewMode} focusDesk={deskPanel} />}
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
      <dialog ref={deskDialog} className="desk-panel panel"
        aria-label={panelMode === 'edit' ? 'Customize your desk' : panelMode === 'free' ? 'Free desk' : 'Desk notes'}
        onClose={() => setDeskPanel(null)}>
        <div className="customization-title">
          <h2>{panelMode === 'edit' ? 'Your desk' : panelMode === 'free' ? 'Free desk' : `${panelDesk?.ownerName ?? 'A'}'s desk`}</h2>
          <button onClick={() => deskDialog.current?.close()} aria-label="Close desk panel">Done</button>
        </div>
        {panelDesk && (panelMode === 'edit' ? <DeskEditor key={panelDesk.id} desk={panelDesk} />
          : panelMode === 'visit' ? <DeskVisit key={panelDesk.id} desk={panelDesk} />
            : <DeskFree desk={panelDesk} hasDesk={myDesk !== null} />)}
        <p className="desk-hint">Done or Esc closes this panel; press E afterwards to stand up.</p>
      </dialog>
      </>}
      {joined && seatPrompt && deskPanel === null && <div className="seat-hint" role="status">{seatPrompt}</div>}
      {joined && <div className="help"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move <span>·</span>
        <kbd>Space</kbd> Jump <span>·</span> Left / Right click Punch <span>·</span> <kbd>F</kbd> Alternate <span>·</span> <kbd>E</kbd> Sit (desks too)<br />
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
