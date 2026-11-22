import { CanvasTexture, SRGBColorSpace } from 'three'
import { CLOTHING_COLORS } from './appearance'
import { validGIFURL } from './gif'
import { desks as deskPositions } from './world'

// Keep these lists aligned with server/desks.go.
export const DESK_TOPS = [
  { id: 'oak', label: 'Oak', color: '#b98253' },
  { id: 'walnut', label: 'Walnut', color: '#6e4a34' },
  { id: 'white', label: 'White', color: '#f1ede4' },
  { id: 'black', label: 'Black', color: '#2a2d31' },
  { id: 'mint', label: 'Mint', color: '#9fdcc6' },
  { id: 'apricot', label: 'Apricot', color: '#f6c58f' },
  { id: 'lavender', label: 'Lavender', color: '#c9b8f2' },
  { id: 'sky', label: 'Sky', color: '#a9cdf2' },
  { id: 'rose', label: 'Rose', color: '#f2adbd' },
] as const
export const WALLPAPERS = [
  { id: 'dawn', label: 'Dawn' }, { id: 'ocean', label: 'Ocean' }, { id: 'forest', label: 'Forest' },
  { id: 'grid', label: 'Grid' }, { id: 'stripes', label: 'Stripes' }, { id: 'dots', label: 'Dots' },
] as const
export const DESK_ITEMS = [
  { id: 'none', label: 'Empty' }, { id: 'succulent', label: 'Succulent' }, { id: 'cactus', label: 'Cactus' },
  { id: 'monstera', label: 'Monstera' }, { id: 'mug', label: 'Mug' }, { id: 'books', label: 'Stack of books' },
  { id: 'duck', label: 'Rubber duck' }, { id: 'figurine', label: 'Figurine' }, { id: 'snowglobe', label: 'Snow globe' },
  { id: 'headphones', label: 'Headphones' }, { id: 'monitor2', label: 'Second monitor' }, { id: 'lavalamp', label: 'Lava lamp' },
] as const
export const DESK_STATUSES = [
  { id: 'available', label: 'Available', color: '#4fd18b' },
  { id: 'busy', label: 'Busy', color: '#ff5d6c' },
  { id: 'away', label: 'Away', color: '#ffc24b' },
] as const
export const OFFLINE_COLOR = '#7b8590'
export const PLATE_MAX = 20
export const MOOD_MAX = 40
export const NOTE_MAX = 80

export type DeskTop = typeof DESK_TOPS[number]['id']
export type Wallpaper = typeof WALLPAPERS[number]['id']
export type DeskItem = typeof DESK_ITEMS[number]['id']
export type DeskStatus = typeof DESK_STATUSES[number]['id']
export type DeskStyle = {
  top: DeskTop
  chairColor: string
  lampColor: string
  lampOn: boolean
  keyboardColor: string
  wallpaper: Wallpaper
  items: [DeskItem, DeskItem, DeskItem]
  plate: string
  mood: string
  status: DeskStatus
  poster: string
}
export type DeskNote = { id: string; author: string; text: string; at: string; yours: boolean }
export type Desk = { id: number; ownerName: string; online: boolean; style: DeskStyle | null; notes: DeskNote[] }

const styleKeys: (keyof DeskStyle)[] = ['top', 'chairColor', 'lampColor', 'lampOn', 'keyboardColor',
  'wallpaper', 'items', 'plate', 'mood', 'status', 'poster']
const has = (list: readonly { id: string }[], value: unknown) => list.some(entry => entry.id === value)
const paletteColor = (value: unknown) => CLOTHING_COLORS.some(color => color.value === value)
// Count code points like Go runes, so an emoji is one character on both sides.
export const limit = (text: string, max: number) => [...text].slice(0, max).join('')

export function parseDeskStyle(value: unknown): DeskStyle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const s = value as Record<string, unknown>
  if (Object.keys(s).length !== styleKeys.length || !styleKeys.every(key => Object.hasOwn(s, key))) return null
  const items = s.items
  if (!Array.isArray(items) || items.length !== 3 || !items.every(item => has(DESK_ITEMS, item))) return null
  if (!has(DESK_TOPS, s.top) || !has(WALLPAPERS, s.wallpaper) || !has(DESK_STATUSES, s.status) ||
    !paletteColor(s.chairColor) || !paletteColor(s.lampColor) || !paletteColor(s.keyboardColor) ||
    typeof s.lampOn !== 'boolean' || typeof s.plate !== 'string' || typeof s.mood !== 'string' ||
    [...s.plate].length > PLATE_MAX || [...s.mood].length > MOOD_MAX ||
    typeof s.poster !== 'string' || (s.poster !== '' && !validGIFURL(s.poster))) return null
  return { ...s, items: [...items] } as DeskStyle
}

export function parseDesks(value: unknown): Desk[] | null {
  if (!Array.isArray(value)) return null
  const result: Desk[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const d = raw as Record<string, unknown>
    if (typeof d.id !== 'number' || typeof d.ownerName !== 'string' || typeof d.online !== 'boolean' ||
      !Array.isArray(d.notes)) return null
    const style = d.style === null ? null : parseDeskStyle(d.style)
    if (d.style !== null && !style) return null
    const notes = d.notes.filter((n): n is DeskNote => !!n && typeof n === 'object' &&
      typeof n.id === 'string' && typeof n.author === 'string' && typeof n.text === 'string' &&
      typeof n.at === 'string' && typeof n.yours === 'boolean')
    result.push({ id: d.id, ownerName: d.ownerName, online: d.online, style, notes })
  }
  return result
}

export const topColor = (top: DeskTop) => DESK_TOPS.find(t => t.id === top)?.color ?? DESK_TOPS[0].color
export const statusColor = (desk: Desk) => !desk.style || !desk.online ? OFFLINE_COLOR
  : DESK_STATUSES.find(s => s.id === desk.style!.status)?.color ?? OFFLINE_COLOR

const tokenKey = 'office-desk-token-v1'
let memoryToken = ''
// A per-browser secret: the server stores only its hash and grants desk edits to it.
export function deskToken(): string {
  try {
    const stored = localStorage.getItem(tokenKey)
    if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored
  } catch { /* Storage may be blocked; fall back to this tab's memory. */ }
  if (!memoryToken) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    memoryToken = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  }
  try { localStorage.setItem(tokenKey, memoryToken) } catch { /* Keep the in-memory token. */ }
  return memoryToken
}

const wallpaperColors: Record<Wallpaper, [string, string]> = {
  dawn: ['#ffb38a', '#7d6bd1'], ocean: ['#3fc1d9', '#173a6b'], forest: ['#9fd17a', '#24513d'],
  grid: ['#1c2633', '#52d6b1'], stripes: ['#ffe3a3', '#ff8fa3'], dots: ['#25333e', '#b69cff'],
}

function paintWallpaper(ctx: CanvasRenderingContext2D, wallpaper: Wallpaper, w: number, h: number) {
  const [a, b] = wallpaperColors[wallpaper]
  if (wallpaper === 'grid' || wallpaper === 'dots') {
    ctx.fillStyle = a
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = ctx.fillStyle = b
    ctx.globalAlpha = 0.55
    for (let x = 16; x < w; x += 32) for (let y = 16; y < h; y += 32) {
      if (wallpaper === 'dots') {
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()
      } else ctx.strokeRect(x - 16, y - 16, 32, 32)
    }
    ctx.globalAlpha = 1
    return
  }
  if (wallpaper === 'stripes') {
    for (let x = -h; x < w; x += 40) {
      ctx.fillStyle = (x / 40) % 2 ? a : b
      ctx.beginPath()
      ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.lineTo(x + h + 40, 0); ctx.lineTo(x + 40, h)
      ctx.fill()
    }
    return
  }
  const gradient = ctx.createLinearGradient(0, 0, 0, h)
  gradient.addColorStop(0, a)
  gradient.addColorStop(1, b)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
}

const font = (size: number) => `600 ${size}px system-ui, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) paint(ctx)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

// Monitor screen: wallpaper, owner name, and mood line. Redrawn only on change.
export function screenTexture(style: DeskStyle | null, ownerName: string) {
  return canvasTexture(256, 140, ctx => {
    if (!style) {
      ctx.fillStyle = '#20303a'
      ctx.fillRect(0, 0, 256, 140)
      ctx.fillStyle = '#9fb6c2'
      ctx.font = font(18)
      ctx.textAlign = 'center'
      ctx.fillText('Free desk', 128, 64)
      ctx.font = font(13)
      ctx.fillText('Press E to claim', 128, 88)
      return
    }
    paintWallpaper(ctx, style.wallpaper, 256, 140)
    ctx.fillStyle = '#0d1520b0'
    ctx.fillRect(0, 96, 256, 44)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.font = font(14)
    ctx.fillText(limit(ownerName, 24), 10, 114, 236)
    ctx.font = font(12)
    ctx.fillStyle = '#d7e3ea'
    ctx.fillText(style.mood || '…', 10, 131, 236)
  })
}

export function plateTexture(text: string) {
  return canvasTexture(256, 48, ctx => {
    ctx.fillStyle = '#fff8e8'
    ctx.fillRect(0, 0, 256, 48)
    ctx.fillStyle = '#25333e'
    ctx.font = font(26)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text || ' ', 128, 26, 240)
  })
}

// The nearest desk within E-interaction range, or null. The server allows 2.6 for latency.
export function nearestDesk(x: number, z: number, range = 2.3): number | null {
  let best: number | null = null
  let bestDistance = range
  deskPositions.forEach(([dx, dz], i) => {
    const distance = Math.hypot(x - dx, z - dz)
    if (distance <= bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return best
}
