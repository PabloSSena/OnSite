import { expect, type Page } from '@playwright/test'

export async function openMenu(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(menu).toHaveAttribute('aria-expanded', /^(true|false)$/)
  if (await menu.getAttribute('aria-expanded') === 'false') await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
}

export async function closeMenu(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(menu).toHaveAttribute('aria-expanded', /^(true|false)$/)
  if (await menu.getAttribute('aria-expanded') === 'true') await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
}

// Hold a movement key until the browser's own outgoing move crosses a threshold,
// then release it in the same tick. A slow test driver cannot overshoot narrow doorways.
export async function walkUntilSent(page: Page, key: string, axis: 'x' | 'z', compare: '<=' | '>=', target: number, timeout = 150000) {
  await page.evaluate(({ key, axis, compare, target }) => {
    const original = WebSocket.prototype.send
    const w = window as unknown as { __walkDone?: boolean }
    w.__walkDone = false
    WebSocket.prototype.send = function (data) {
      original.call(this, data)
      if (typeof data !== 'string') return
      const message = JSON.parse(data)
      if (message.type !== 'move') return
      ;(window as unknown as { __lastMove?: unknown }).__lastMove = { x: message.x, z: message.z, y: message.y }
      const value = message[axis] as number
      if (compare === '<=' ? value <= target : value >= target) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: key, bubbles: true }))
        WebSocket.prototype.send = original
        w.__walkDone = true
      }
    }
  }, { key, axis, compare, target })
  await page.keyboard.down(key)
  try {
    await expect.poll(() => page.evaluate(() => (window as unknown as { __walkDone?: boolean }).__walkDone),
      { timeout, intervals: [50], message: `${key} until ${axis} ${compare} ${target}` }).toBe(true)
  } catch (error) {
    const last = await page.evaluate(() => (window as unknown as { __lastMove?: unknown }).__lastMove)
    throw new Error(`${(error as Error).message}
Last sent move: ${JSON.stringify(last)}`)
  } finally {
    await page.keyboard.up(key)
  }
}
