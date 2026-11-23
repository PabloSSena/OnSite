import { test, expect } from '@playwright/test'
import { openGIFs, openMenu } from './helpers'

test('GIF links appear above both avatars, replace, expire, and fail gracefully', async ({ browser }) => {
  test.setTimeout(120000)
  const context = await browser.newContext({ viewport: { width: 960, height: 600 } })
  // Keep the test deterministic and avoid sending requests to a third party.
  await context.route('https://media.tenor.com/**', route => route.fulfill({
    contentType: 'image/gif',
    body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
  }))
  await context.route('https://media.giphy.com/**', route => route.abort())
  const ana = await context.newPage()
  const bia = await context.newPage()
  const errors: string[] = []
  for (const [page, name] of [[ana, 'Ana'], [bia, 'Bia']] as const) {
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')
    await page.getByLabel('What should we call you?').fill(name)
    await page.getByRole('button', { name: 'Join the office' }).click()
    await expect(page.locator('.presence')).toContainText('Live')
    await openMenu(page)
    await page.getByRole('button', { name: 'First-person view' }).click()
  }
  await expect(ana.locator('.nametag')).toHaveCount(2)
  await openGIFs(ana)
  const input = ana.getByRole('textbox', { name: 'GIF link', exact: true })
  const share = ana.getByRole('button', { name: 'GIF', exact: true })
  await input.fill('https://tenor.com/view/not-a-direct-image')
  await share.click()
  await expect(ana.getByRole('alert')).toContainText('direct HTTPS .gif')
  await expect(bia.locator('.gif-bubble')).toHaveCount(0)

  await input.fill('https://media.tenor.com/test/first.gif')
  await share.click()
  for (const page of [ana, bia]) {
    await expect(page.getByAltText("Ana's GIF", { exact: true })).toHaveAttribute('src', /first\.gif$/)
    await expect.poll(() => page.getByAltText("Ana's GIF", { exact: true })
      .evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  }
  await input.fill('https://media.tenor.com/test/second.gif')
  await expect(share).toBeEnabled()
  await share.click()
  await expect(bia.locator('.gif-bubble')).toHaveCount(1)
  await expect(bia.getByAltText("Ana's GIF", { exact: true })).toHaveAttribute('src', /second\.gif$/)
  await expect(ana.locator('.gif-bubble')).toHaveCount(0, { timeout: 12000 })
  await expect(bia.locator('.gif-bubble')).toHaveCount(0)

  await ana.getByRole('button', { name: 'Send recent GIF 2', exact: true }).click()
  await expect(bia.getByAltText("Ana's GIF", { exact: true })).toHaveAttribute('src', /first\.gif$/)
  await expect(ana.getByRole('button', { name: /^Send recent GIF \d+$/ })).toHaveCount(2)
  await input.fill('https://media.giphy.com/test/broken.gif')
  await expect(share).toBeEnabled()
  await share.click()
  await expect(bia.locator('.gif-bubble')).toHaveText('GIF unavailable')
  // Closing the sender removes its reaction immediately, not only on expiry.
  await ana.close()
  await expect(bia.locator('.gif-bubble')).toHaveCount(0)
  expect(errors).toEqual([])
  await context.close()
})

test('first-person GIF picker supports paste, persistent recents, and one-click reuse without text chat', async ({ browser }) => {
  test.setTimeout(120000)
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  await context.route('https://media.tenor.com/**', route => route.fulfill({
    contentType: 'image/gif',
    body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
  }))
  const page = await context.newPage()
  const sent: string[] = []
  page.on('websocket', ws => ws.on('framesent', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'gif') sent.push(message.url)
  }))
  async function join() {
    await page.getByLabel('What should we call you?').fill('GIF collector')
    await page.getByRole('button', { name: 'Join the office' }).click()
    await expect(page.locator('.presence')).toContainText('Live')
  }
  await page.goto('/')
  await join()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveCount(0)
  await expect(page.getByRole('log')).toHaveCount(0)
  await openMenu(page)
  await expect(page.getByRole('button', { name: 'First-person view' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.locator('canvas').click({ position: { x: 500, y: 300 } })
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true)
  await openGIFs(page)
  const url = 'https://media.tenor.com/test/saved.gif'
  await page.evaluate(value => navigator.clipboard.writeText(value), url)
  const input = page.getByRole('textbox', { name: 'GIF link', exact: true })
  await input.focus()
  await input.press('Control+V')
  await expect(input).toHaveValue(url)
  await page.getByRole('button', { name: 'GIF', exact: true }).click()
  await expect.poll(() => sent).toEqual([url])
  const recent = page.getByRole('button', { name: 'Send recent GIF 1', exact: true })
  await expect(recent).toBeVisible()
  await expect(recent.locator('img')).toHaveAttribute('src', url)
  await expect(recent).toBeEnabled()
  await recent.click()
  await expect.poll(() => sent).toEqual([url, url])
  await expect(page.getByRole('button', { name: /^Send recent GIF \d+$/ })).toHaveCount(1)
  await page.screenshot({ path: 'test-results/gif-picker-first-person.png' })
  await page.reload()
  await join()
  await openGIFs(page)
  await expect(recent).toBeVisible()
  await expect(recent.locator('img')).toHaveAttribute('src', url)
  expect(sent).toEqual([url, url]) // Loading history must not resend automatically.
  await recent.click()
  await expect.poll(() => sent).toEqual([url, url, url])
  await context.close()
})
