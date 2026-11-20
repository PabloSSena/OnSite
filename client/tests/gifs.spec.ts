import { test, expect } from '@playwright/test'

test('GIF links appear above both avatars, replace, expire, and fail gracefully', async ({ browser }) => {
  const context = await browser.newContext()
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
  }
  await expect(ana.locator('.nametag')).toHaveCount(2)
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

  await input.fill('https://media.giphy.com/test/broken.gif')
  await share.click()
  await expect(bia.locator('.gif-bubble')).toHaveText('GIF unavailable')
  // Closing the sender removes its reaction immediately, not only on expiry.
  await ana.close()
  await expect(bia.locator('.gif-bubble')).toHaveCount(0)
  expect(errors).toEqual([])
  await context.close()
})
