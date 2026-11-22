import { test, expect } from '@playwright/test'
import { openMenu } from './helpers'

test('first-person supports mouse look, relative movement, collision, chat, and switching back', async ({ page }) => {
  const errors: string[] = []
  let position = { x: 0, z: 6, rotation: 0 }
  page.on('pageerror', error => errors.push(error.message))
  page.on('websocket', ws => ws.on('framesent', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'move') position = message
  }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('Camera tester')
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live')
  await openMenu(page)
  const toggle = page.getByRole('button', { name: 'First-person view' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.nametag.me')).toHaveCount(0)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.nametag.me')).toHaveCount(1)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.nametag.me')).toHaveCount(0)
  await page.locator('canvas').click({ position: { x: 500, y: 300 } })
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
  // Turn right by 90 degrees and look up; forward must still stay horizontal.
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', {
    movementX: Math.PI / 2 / 0.002, movementY: -400,
  })))
  await expect.poll(() => position.rotation).toBeCloseTo(-Math.PI / 2, 2)
  await page.keyboard.down('KeyW')
  try {
    await expect.poll(() => position.x, { timeout: 15000 }).toBeGreaterThan(2.8)
    // The entrance planter at (4, 5.5) blocks this camera-relative path.
    await page.waitForTimeout(500)
    expect(position.x).toBeLessThanOrEqual(3.1 + 0.001)
    expect(position.z).toBeCloseTo(6, 1)
  } finally {
    await page.keyboard.up('KeyW')
  }
  await page.screenshot({ path: 'test-results/first-person.png' })
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true)
  await page.getByRole('textbox', { name: 'Message' }).fill('First-person works!')
  await page.getByRole('textbox', { name: 'Message' }).press('Enter')
  await expect(page.getByRole('log')).toContainText('First-person works!')
  await openMenu(page)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.nametag.me')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('two tabs render movement, exchange chat messages, and remove players who leave', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 960, height: 600 } })
  const ana = await context.newPage()
  const bia = await context.newPage()
  const errors: string[] = []
  let remoteX = 0
  bia.on('websocket', ws => ws.on('framereceived', frame => {
    const msg = JSON.parse(frame.payload.toString())
    if (msg.type === 'snapshot') remoteX = msg.players.find((p: { name: string }) => p.name === 'Ana')?.x ?? remoteX
  }))
  for (const [page, name] of [[ana, 'Ana'], [bia, 'Bia']] as const) {
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')
    await page.getByLabel('What should we call you?').fill(name)
    await page.getByRole('button', { name: 'Join the office' }).click()
    await expect(page.locator('.presence')).toContainText('Live')
    await openMenu(page)
    await page.getByRole('button', { name: 'First-person view' }).click()
  }
  await expect(bia.locator('.nametag')).toHaveCount(2)
  const tag = bia.locator('.nametag').filter({ hasText: /^Ana$/ })
  await expect(tag).toBeVisible()
  const before = await tag.boundingBox()
  expect(before).not.toBeNull()
  await ana.locator('canvas').click({ position: { x: 500, y: 300 } })
  await ana.keyboard.down('KeyD')
  try {
    await expect.poll(() => remoteX).toBeGreaterThan(1)
  } finally {
    await ana.keyboard.up('KeyD')
  }
  await expect.poll(async () => {
    const after = await tag.boundingBox()
    return Math.abs((after?.x ?? before!.x) - before!.x)
  }).toBeGreaterThan(15)
  await ana.getByRole('textbox', { name: 'Message' }).fill('wasd: hi, Bia!')
  await ana.getByRole('textbox', { name: 'Message' }).press('Enter')
  await expect(bia.getByRole('log')).toContainText('wasd: hi, Bia!')
  await expect(ana.getByRole('log')).toContainText('wasd: hi, Bia!')
  await bia.screenshot({ path: 'test-results/office.png' })
  await openMenu(ana)
  await ana.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(bia.locator('.nametag')).toHaveCount(1)
  expect(errors).toEqual([])
  await context.close()
})
