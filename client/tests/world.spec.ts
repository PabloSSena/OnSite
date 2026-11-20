import { test, expect } from '@playwright/test'

test('walk from the garden into a furnished room and back outside', async ({ page }) => {
  test.setTimeout(240000)
  let position = { x: 0, z: 6 }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('websocket', ws => ws.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'snapshot') {
      const me = message.players.find((p: { name: string }) => p.name === 'World explorer')
      if (me) position = me
    }
  }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('World explorer')
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live')
  await expect(page.getByText('THE COMMONS', { exact: true })).toBeVisible()
  await page.locator('canvas').click({ position: { x: 500, y: 300 } })
  await page.screenshot({ path: 'test-results/world-porch.png' })

  async function walk(key: string, reached: () => boolean) {
    await page.keyboard.down(key)
    try {
      await expect.poll(() => ({ reached: reached(), x: position.x, z: position.z }),
        { timeout: 90000, intervals: [100] }).toMatchObject({ reached: true })
    } finally {
      await page.keyboard.up(key)
    }
  }
  // A real networked walk through the entrance, up the hall, and through a side doorway.
  await walk('KeyW', () => position.z < -10.5)
  await walk('KeyA', () => position.x < -3.5)
  expect(position.x).toBeLessThan(-2)
  await page.screenshot({ path: 'test-results/world-studio.png' })
  await walk('KeyD', () => position.x > -0.25)
  await walk('KeyS', () => position.z > 17)
  expect(position.z).toBeGreaterThan(9.5) // Beyond the old map's boundary.
  await page.screenshot({ path: 'test-results/world-garden.png' })
  expect(errors).toEqual([])
  await page.getByRole('button', { name: 'Leave', exact: true }).click()
})
