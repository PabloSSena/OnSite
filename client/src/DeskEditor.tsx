import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CLOTHING_COLORS } from './appearance'
import {
  DESK_ITEMS, DESK_STATUSES, DESK_TOPS, MOOD_MAX, NOTE_MAX, PLATE_MAX, WALLPAPERS, limit, statusColor,
  type Desk, type DeskItem, type DeskNote, type DeskStyle,
} from './desks'
import { validGIFURL } from './gif'
import { send } from './network'
import './appearance.css'
import './desks.css'

function NoteList({ desk, canRemove }: { desk: Desk; canRemove: (note: DeskNote) => boolean }) {
  if (desk.notes.length === 0) return <p className="desk-empty">No notes yet.</p>
  return <ul className="desk-note-list">
    {desk.notes.map(note => <li key={note.id}>
      <p>{note.text}</p>
      <small>{note.author} · {new Date(note.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
      {canRemove(note) && <button type="button" aria-label={`Remove note from ${note.author}`}
        onClick={() => send({ type: 'desk-note-remove', desk: desk.id, note: note.id })}>Remove</button>}
    </li>)}
  </ul>
}

// Owner editor. It keeps a local copy so quick successive edits never build on a stale echo.
export function DeskEditor({ desk }: { desk: Desk }) {
  const prefix = useId()
  const [style, setStyle] = useState<DeskStyle>(() => desk.style!)
  const [poster, setPoster] = useState(desk.style?.poster ?? '')
  const [posterError, setPosterError] = useState('')
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef(style)
  useEffect(() => () => {
    // Flush a debounced text edit when the dialog closes.
    if (pending.current) {
      clearTimeout(pending.current)
      send({ type: 'desk-update', desk: desk.id, style: latest.current })
    }
  }, [desk.id])

  function update(change: Partial<DeskStyle>, debounce = false) {
    const next = { ...latest.current, ...change }
    latest.current = next
    setStyle(next)
    clearTimeout(pending.current)
    pending.current = undefined
    const commit = () => {
      pending.current = undefined
      send({ type: 'desk-update', desk: desk.id, style: { ...latest.current,
        plate: latest.current.plate.trim(), mood: latest.current.mood.trim() } })
    }
    if (debounce) pending.current = setTimeout(commit, 500)
    else commit()
  }
  function pinPoster(e: FormEvent) {
    e.preventDefault()
    const url = poster.trim()
    if (url && !validGIFURL(url)) {
      setPosterError('Use a direct HTTPS .gif link from Tenor, GIPHY, or Discord—not a share page.')
      return
    }
    setPosterError('')
    update({ poster: url })
  }
  const palette = (key: 'chairColor' | 'lampColor' | 'keyboardColor', label: string) =>
    <fieldset className="appearance-palette"><legend>{label}</legend>
      {CLOTHING_COLORS.map(color => <button key={color.value} type="button"
        aria-label={`${label}: ${color.label}`} title={color.label} aria-pressed={style[key] === color.value}
        style={{ backgroundColor: color.value }} onClick={() => update({ [key]: color.value })} />)}
    </fieldset>
  const item = (slot: 0 | 1 | 2, label: string) =>
    <div className="appearance-select"><label htmlFor={`${prefix}-item${slot}`}>{label}</label>
      <select id={`${prefix}-item${slot}`} value={style.items[slot]} onChange={e => {
        const items = [...style.items] as DeskStyle['items']
        items[slot] = e.target.value as DeskItem
        update({ items })
      }}>{DESK_ITEMS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select>
    </div>

  return <section className="desk-editor" aria-label="Desk customization">
    <div className="desk-fields">
      <label htmlFor={`${prefix}-plate`}>Name plate</label>
      <input id={`${prefix}-plate`} value={style.plate} placeholder="Your name ✨"
        onChange={e => update({ plate: limit(e.target.value, PLATE_MAX) }, true)} />
      <label htmlFor={`${prefix}-mood`}>Mood / now playing</label>
      <input id={`${prefix}-mood`} value={style.mood} placeholder="🎧 lo-fi beats"
        onChange={e => update({ mood: limit(e.target.value, MOOD_MAX) }, true)} />
    </div>
    <fieldset className="desk-status"><legend>Status light</legend>
      {DESK_STATUSES.map(s => <button key={s.id} type="button" aria-pressed={style.status === s.id}
        onClick={() => update({ status: s.id })}><span style={{ backgroundColor: s.color }} />{s.label}</button>)}
    </fieldset>
    <fieldset className="appearance-palette desk-tops"><legend>Desktop</legend>
      {DESK_TOPS.map(top => <button key={top.id} type="button" aria-label={`Desktop: ${top.label}`}
        title={top.label} aria-pressed={style.top === top.id} style={{ backgroundColor: top.color }}
        onClick={() => update({ top: top.id })} />)}
    </fieldset>
    {palette('chairColor', 'Chair color')}
    <div className="appearance-selects">
      <div className="appearance-select"><label htmlFor={`${prefix}-wallpaper`}>Wallpaper</label>
        <select id={`${prefix}-wallpaper`} value={style.wallpaper}
          onChange={e => update({ wallpaper: e.target.value as DeskStyle['wallpaper'] })}>
          {WALLPAPERS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      <label className="appearance-backpack"><input type="checkbox" checked={style.lampOn}
        onChange={e => update({ lampOn: e.target.checked })} /> Lamp on</label>
    </div>
    {palette('lampColor', 'Lamp color')}
    {palette('keyboardColor', 'Keyboard color')}
    <div className="appearance-selects">
      {item(0, 'Back left')}
      {item(1, 'Front left')}
      {item(2, 'Front right')}
    </div>
    <form className="desk-poster-form" onSubmit={pinPoster}>
      <label htmlFor={`${prefix}-poster`}>Poster GIF</label>
      <div>
        <input id={`${prefix}-poster`} maxLength={1500} value={poster} placeholder="Direct .gif link (empty to remove)"
          onChange={e => { setPoster(e.target.value); setPosterError('') }} />
        <button type="submit">{poster.trim() ? 'Pin' : 'Remove'}</button>
      </div>
      {posterError && <p className="gif-error" role="alert">{posterError}</p>}
    </form>
    <h3>Notes from friends</h3>
    <NoteList desk={desk} canRemove={() => true} />
    <button type="button" className="desk-release" onClick={() => {
      if (pending.current) clearTimeout(pending.current)
      pending.current = undefined
      send({ type: 'desk-release', desk: desk.id })
    }}>Release desk</button>
  </section>
}

export function DeskVisit({ desk }: { desk: Desk }) {
  const [text, setText] = useState('')
  const [cooldown, setCooldown] = useState(false)
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(false), 5000)
    return () => clearTimeout(timer)
  }, [cooldown])
  const status = desk.style && desk.online ? DESK_STATUSES.find(s => s.id === desk.style!.status)?.label : 'Offline'
  function leave(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || cooldown) return
    send({ type: 'desk-note', desk: desk.id, text: text.trim() })
    setText('')
    setCooldown(true)
  }
  return <section className="desk-visit" aria-label={`${desk.ownerName}'s desk`}>
    <p className="desk-visit-status"><span style={{ backgroundColor: statusColor(desk) }} />{status}
      {desk.style?.mood && <> · <i>{desk.style.mood}</i></>}</p>
    <NoteList desk={desk} canRemove={note => note.yours} />
    <form className="desk-note-form" onSubmit={leave}>
      <label htmlFor="desk-note-text">Leave a sticky note</label>
      <textarea id="desk-note-text" maxLength={NOTE_MAX} rows={2} value={text}
        onChange={e => setText(limit(e.target.value, NOTE_MAX))} placeholder="Coffee later? ☕" />
      <button type="submit" disabled={!text.trim() || cooldown}>{cooldown ? 'Sent' : 'Stick it'}</button>
    </form>
  </section>
}
