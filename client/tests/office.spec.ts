import { test, expect } from '@playwright/test'

test('two tabs render movement, exchange chat messages, and remove players who leave', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
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
  await ana.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(bia.locator('.nametag')).toHaveCount(1)
  expect(errors).toEqual([])
  await context.close()
})
