import { test, expect, type Page } from '@playwright/test'
import { openGIFs, walkUntilSent } from './helpers'

// Two one-pixel frames (magenta, green), 300 ms each, looping indefinitely.
const animatedGIF = Buffer.from(
  '47494638396101000100800000ff00ff00ff00' +
  '21ff0b4e45545343415045322e300301000000' +
  '21f904001e0000002c0000000001000100000202440100' +
  '21f904001e0000002c00000000010001000002024c01003b', 'hex')

async function reflectedColors(page: Page) {
  // Read after the render callback, before the default drawing buffer is discarded.
  // This excludes DOM overlays and avoids screenshot latency missing an 8-second GIF.
  return page.evaluate(() => new Promise<{ magenta: number; green: number }>(resolve => requestAnimationFrame(() => {
    const canvas = document.querySelector('canvas')!
    const gl = canvas.getContext('webgl2')!
    const width = Math.floor(gl.drawingBufferWidth * 0.2)
    const height = Math.floor(gl.drawingBufferHeight * 0.4)
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(Math.floor(gl.drawingBufferWidth * 0.4), gl.drawingBufferHeight - height,
      width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let magenta = 0, green = 0
    for (let i = 0; i < pixels.length; i += 4) {
      // Reflector blends the scene with its grey surface, so reflected colors are tinted.
      if (pixels[i] > 180 && pixels[i + 1] < 140 && pixels[i + 2] > 180) magenta++
      if (pixels[i] < 180 && pixels[i + 1] > 180 && pixels[i + 2] < 140) green++
    }
    resolve({ magenta, green })
  })))
}

test('own animated GIF is reflected in first person and disappears after expiry', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const probe = window as unknown as {
      ImageDecoder?: new (options: unknown) => { close(): void }
      closedGIFDecoders: number
    }
    probe.closedGIFDecoders = 0
    const Original = probe.ImageDecoder
    if (Original) probe.ImageDecoder = new Proxy(Original, {
      construct(target, args) {
        const decoder = new target(args[0])
        const close = decoder.close.bind(decoder)
        decoder.close = () => { probe.closedGIFDecoders++; close() }
        return decoder
      },
    })
  })
  await page.route('https://media.tenor.com/**', route => route.fulfill({
    contentType: 'image/gif',
    headers: { 'access-control-allow-origin': '*' },
    body: animatedGIF,
  }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('Mirror GIF tester')
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live')
  await page.locator('canvas').click({ position: { x: 500, y: 300 } })
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
  await walkUntilSent(page, 'KeyW', 'z', '<=', -13)
  await page.keyboard.press('Escape')
  const before = await reflectedColors(page)
  expect(before.magenta).toBe(0)
  expect(before.green).toBe(0)
  await openGIFs(page)
  await page.getByRole('textbox', { name: 'GIF link', exact: true }).fill('https://media.tenor.com/test/mirror.gif')
  await page.getByRole('button', { name: 'GIF', exact: true }).click()
  const seen = { magenta: false, green: false }
  await expect.poll(async () => {
    const colors = await reflectedColors(page)
    seen.magenta ||= colors.magenta > 40
    seen.green ||= colors.green > 40
    return seen.magenta && seen.green
  }, { timeout: 7000, intervals: [50] }).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('first-person-mirror-gif.png') })
  await expect.poll(async () => {
    const colors = await reflectedColors(page)
    return colors.magenta + colors.green
  }, { timeout: 12000, intervals: [200] }).toBe(0)
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { closedGIFDecoders: number }).closedGIFDecoders)).toBe(1)
  expect(errors).toEqual([])
})
