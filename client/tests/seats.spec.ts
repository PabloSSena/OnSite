import { test, expect } from '@playwright/test'
import { closeMenu, openMenu } from './helpers'

type Snapshot = { x: number; z: number; rotation: number; animation: string }

test('sit on a kitchen chair and stand back up', async ({ page }) => {
  test.setTimeout(180000)
  let me: Snapshot = { x: 0, z: 6, rotation: 0, animation: 'idle' }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('websocket', ws => ws.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'snapshot') {
      const found = message.players.find((p: { name: string }) => p.name === 'Chair tester')
      if (found) me = found
    }
  }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('Chair tester')
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live')
  await openMenu(page)
  const firstPerson = page.getByRole('button', { name: 'First-person view' })
  if (await firstPerson.getAttribute('aria-pressed') === 'true') await firstPerson.click()
  await expect(firstPerson).toHaveAttribute('aria-pressed', 'false')
  await closeMenu(page)
  await page.locator('canvas').click({ position: { x: 500, y: 300 } })

  async function walk(key: string, reached: () => boolean) {
    await page.keyboard.down(key)
    try {
      await expect.poll(() => ({ reached: reached(), x: me.x, z: me.z }),
        { timeout: 60000, intervals: [100] }).toMatchObject({ reached: true })
    } finally {
      await page.keyboard.up(key)
    }
  }
  const hint = page.locator('.seat-hint')
  // Through the entrance, east through the hallway doorway, then behind the kitchen chairs.
  await walk('KeyW', () => me.z < 1)
  await expect(hint).toHaveCount(0)
  await walk('KeyD', () => me.x > 4.5)
  await walk('KeyS', () => me.z > 2.5)
  await walk('KeyD', () => me.x > 6.5)
  // Walk into the chair's back; collision stops us at a predictable spot.
  await walk('KeyW', () => me.z < 2.6)
  await expect(hint).toContainText('Press E to sit')
  const entry = { x: me.x, z: me.z }

  await page.keyboard.press('KeyE')
  // Kitchen chair at x 6.8; the seat point is 0.15 in front of its centre (z 1.6).
  await expect.poll(() => me, { timeout: 15000, intervals: [100] })
    .toMatchObject({ animation: 'sit', rotation: 0 })
  expect(me.x).toBeCloseTo(6.8, 1)
  expect(me.z).toBeCloseTo(1.45, 1)
  await expect(hint).toContainText('Press E to stand')
  await page.screenshot({ path: 'test-results/seated-kitchen.png' })

  await page.keyboard.press('KeyE')
  await expect.poll(() => me.animation, { timeout: 15000, intervals: [100] }).toBe('idle')
  expect(Math.hypot(me.x - entry.x, me.z - entry.z)).toBeLessThan(0.3)
  await expect(hint).toContainText('Press E to sit')
  expect(errors).toEqual([])
  await openMenu(page)
  await page.getByRole('button', { name: 'Leave', exact: true }).click()
})
