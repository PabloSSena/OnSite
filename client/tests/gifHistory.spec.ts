import { expect, test } from '@playwright/test'
import { GIF_HISTORY_KEY, loadGIFHistory, rememberGIF, sanitizeGIFHistory, saveGIFHistory } from '../src/gifHistory'

const gif = (id: number) => `https://media.tenor.com/${id}/reaction.gif`

test('recent GIFs are valid, deduplicated, newest first, and bounded to 24', () => {
  const history = sanitizeGIFHistory([gif(0), gif(0), ...Array.from({ length: 30 }, (_, i) => gif(i + 1))])
  expect(history).toHaveLength(24)
  expect(history[0]).toBe(gif(0))
  const recent = rememberGIF(history, gif(10))
  expect(recent).toHaveLength(24)
  expect(recent[0]).toBe(gif(10))
  expect(recent.filter(url => url === gif(10))).toHaveLength(1)
  expect(rememberGIF(history, 'https://evil.example/a.gif')).toEqual(history)
})

test('history rejects malformed data and preserves the direct GIF policy', () => {
  for (const value of [null, {}, 'not an array', 10]) expect(sanitizeGIFHistory(value)).toEqual([])
  expect(sanitizeGIFHistory([
    null, 10, {}, 'http://media.tenor.com/a.gif', 'https://tenor.com/view/a',
    'https://evil.example/a.gif', 'https://media.tenor.com/a.png',
    'https://user:secret@media.tenor.com/a.gif', 'https://media.tenor.com/a.gif#fragment',
    `  ${gif(1)}  `, gif(1),
  ])).toEqual([gif(1)])
  expect(loadGIFHistory({ getItem: () => '{broken' })).toEqual([])
  expect(loadGIFHistory({ getItem: () => '{"url":"unexpected"}' })).toEqual([])
  expect(loadGIFHistory({ getItem: () => null })).toEqual([])
})

test('history survives storage failures and round-trips sanitized URLs', () => {
  const unavailable = {
    getItem: () => { throw new Error('Storage blocked') },
    setItem: () => { throw new Error('Quota exceeded') },
  }
  expect(loadGIFHistory(unavailable)).toEqual([])
  expect(() => saveGIFHistory([gif(1)], unavailable)).not.toThrow()
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }
  saveGIFHistory([gif(1), gif(1), 'invalid', gif(2)], storage)
  expect(entries.has(GIF_HISTORY_KEY)).toBe(true)
  expect(loadGIFHistory(storage)).toEqual([gif(1), gif(2)])
})
