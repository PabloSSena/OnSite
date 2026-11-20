import { test, expect } from '@playwright/test'

test('articulated avatar renders in the mirror, walks, and keeps first-person legs visible', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  const errors: string[] = []
  let position = { x: 0, z: 6 }
  page.on('pageerror', error => errors.push(error.message))
  page.on('websocket', socket => socket.on('framesent', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'move') position = message
  }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('Animation tester')
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live', { timeout: 15000 })
  await page.locator('canvas').click({ position: { x: 500, y: 300 } })
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
  const walk = async (key: string, reached: () => boolean) => {
    await page.keyboard.down(key)
    try {
      await expect.poll(reached, { timeout: 40000, intervals: [50] }).toBe(true)
    } finally {
      await page.keyboard.up(key)
    }
  }
  // Go around the bench, rather than hiding the lower body behind it.
  await walk('KeyW', () => position.z < -5.3)
  await walk('KeyD', () => position.x > 2.65)
  await walk('KeyW', () => position.z < -8.12)
  await walk('KeyA', () => position.x < 0.1)
  await page.waitForTimeout(400)
  await page.screenshot({ path: testInfo.outputPath('avatar-mirror-idle.png') })
  await page.keyboard.down('KeyD')
  try {
    const start = position.x
    await expect.poll(() => position.x - start, { timeout: 10000 }).toBeGreaterThan(0.15)
    await page.screenshot({ path: testInfo.outputPath('avatar-mirror-walking.png') })
  } finally {
    await page.keyboard.up('KeyD')
  }
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementY: 720 })))
  await page.screenshot({ path: testInfo.outputPath('avatar-first-person-legs.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'First-person view' }).click()
  await expect(page.locator('.nametag.me')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('avatar-third-person.png') })
  expect(errors).toEqual([])
})
