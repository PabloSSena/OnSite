import { validGIFURL } from './gif'

export const GIF_HISTORY_KEY = 'office-gif-history'
export const GIF_HISTORY_LIMIT = 24

// Stored data is untrusted: validate before rendering any external image.
export function sanitizeGIFHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const urls: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const url = entry.trim()
    if (validGIFURL(url) && !urls.includes(url)) urls.push(url)
    if (urls.length === GIF_HISTORY_LIMIT) break
  }
  return urls
}

export function rememberGIF(history: string[], url: string): string[] {
  return sanitizeGIFHistory([url, ...history])
}

export function loadGIFHistory(storage?: Pick<Storage, 'getItem'>): string[] {
  try {
    return sanitizeGIFHistory(JSON.parse((storage ?? localStorage).getItem(GIF_HISTORY_KEY) ?? '[]'))
  } catch {
    return []
  }
}

export function saveGIFHistory(history: string[], storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? localStorage).setItem(GIF_HISTORY_KEY, JSON.stringify(sanitizeGIFHistory(history)))
  } catch {
    // Private browsing or a full storage quota must not prevent GIF reactions.
  }
}
