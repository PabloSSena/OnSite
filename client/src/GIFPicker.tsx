import { useEffect, useRef, useState, type FormEvent } from 'react'
import { validGIFURL } from './gif'
import { loadGIFHistory, rememberGIF, saveGIFHistory } from './gifHistory'
import { send, useNetwork } from './network'

export default function GIFPicker() {
  const [open, setOpen] = useState(false)
  const [url, setURL] = useState('')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(false)
  const [history, setHistory] = useState(loadGIFHistory)
  const historyRef = useRef(history)
  const status = useNetwork(s => s.status)
  const input = useRef<HTMLInputElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const nextSendAt = useRef(0)
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Only a server-accepted own reaction belongs in history; send() may silently drop.
    return useNetwork.subscribe((state, previous) => {
      if (!state.id) return
      const reaction = state.gifs[state.id]
      if (!reaction || (state.id === previous.id && reaction === previous.gifs[state.id])) return
      const next = rememberGIF(historyRef.current, reaction.url)
      historyRef.current = next
      saveGIFHistory(next)
      setHistory(next)
    })
  }, [])

  useEffect(() => () => clearTimeout(cooldownTimer.current), [])
  useEffect(() => {
    const locked = () => {
      if (document.pointerLockElement) setOpen(false)
    }
    document.addEventListener('pointerlockchange', locked)
    return () => document.removeEventListener('pointerlockchange', locked)
  }, [])
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  function shareGIF(value: string) {
    // Read the live status and a synchronous deadline so rapid clicks cannot bypass guards.
    if (useNetwork.getState().status !== 'online' || performance.now() < nextSendAt.current) return
    const trimmed = value.trim()
    if (!validGIFURL(trimmed)) {
      setError('Use a direct HTTPS .gif link from Tenor, GIPHY, or Discord—not a share page.')
      return
    }
    nextSendAt.current = performance.now() + 2000
    setCooldown(true)
    clearTimeout(cooldownTimer.current)
    cooldownTimer.current = setTimeout(() => setCooldown(false), 2000)
    send({ type: 'gif', url: trimmed })
    setURL('')
    setError('')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    shareGIF(url)
  }

  const disabled = status !== 'online' || cooldown
  return <aside className="gif-picker" aria-label="GIF reactions">
    <button ref={toggle} className="gif-toggle" aria-expanded={open} aria-controls="gif-picker-panel"
      onClick={() => {
        if (document.pointerLockElement) document.exitPointerLock()
        setOpen(current => !current)
      }}>GIFs</button>
    <section id="gif-picker-panel" className="gif-picker-panel panel" aria-label="GIF picker" hidden={!open}
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        setOpen(false)
        toggle.current?.focus()
      }}>
      <h2>Send a GIF</h2>
      <form onSubmit={submit}>
        <input ref={input} aria-label="GIF link" aria-describedby="gif-help" maxLength={1500}
          value={url} onChange={e => { setURL(e.target.value); setError('') }}
          placeholder="Paste a direct .gif link…" disabled={status !== 'online'} />
        <button type="submit" disabled={disabled || !url.trim()}>GIF</button>
      </form>
      <p id="gif-help" className="gif-help">Shows above your head for 8 seconds. External images load for everyone.</p>
      <p className="gif-status" role="status">{status !== 'online' ? 'Connect to send GIFs.'
        : cooldown ? 'Wait 2 seconds between GIFs.' : ''}</p>
      {error && <p className="gif-error" role="alert">{error}</p>}
      {history.length > 0 && <section className="gif-history" aria-label="Recent GIFs">
        <h3>Recent GIFs</h3>
        <div className="gif-history-grid">
          {history.map((recent, index) => <button key={recent} type="button"
            aria-label={`Send recent GIF ${index + 1}`} disabled={disabled} onClick={() => shareGIF(recent)}>
            <img src={recent} alt="" loading="lazy" referrerPolicy="no-referrer" />
          </button>)}
        </div>
      </section>}
    </section>
  </aside>
}
