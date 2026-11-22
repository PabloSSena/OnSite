import { test, expect, type Page } from '@playwright/test'
import { openMenu } from './helpers'

test.use({
  launchOptions: {
    args: [
      '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
  permissions: ['camera'],
})

async function join(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live')
  await openMenu(page)
}

async function playing(page: Page, name: string) {
  await expect.poll(() => page.getByLabel(name, { exact: true }).evaluate(
    video => (video as HTMLVideoElement).videoWidth,
  ), { timeout: 20000 }).toBeGreaterThan(0)
}

test('webcam reaches late viewers, supports simultaneous cameras, toggling, and leaving', async ({ context }) => {
  test.setTimeout(120000)
  const ana = await context.newPage()
  const bia = await context.newPage()
  const errors: string[] = []
  for (const page of [ana, bia]) {
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      const streams: MediaStream[] = []
      Object.assign(window, { capturedStreams: streams })
      const NativeWebSocket = window.WebSocket
      const sockets: WebSocket[] = []
      Object.assign(window, { roomSockets: sockets })
      window.WebSocket = class extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols)
          sockets.push(this)
        }
      }
      navigator.mediaDevices.getUserMedia = async constraints => {
        if (constraints?.audio !== false) throw new Error('Audio must never be captured')
        const stream = await original(constraints)
        streams.push(stream)
        return stream
      }
    })
  }
  await join(ana, 'Ana')
  await expect(ana.locator('video')).toHaveCount(0)
  await ana.getByRole('button', { name: 'Turn camera on', exact: true }).click()
  await playing(ana, 'You')
  await playing(ana, 'Local camera source')
  await expect(ana.locator('video')).toHaveCount(2)
  await expect(ana.getByLabel('Local camera source', { exact: true })).toBeHidden()
  await join(bia, 'Bia')
  await playing(bia, 'Ana')
  await expect(bia.locator('video[data-world-camera]')).toHaveCount(1)
  await expect(bia.getByLabel('Ana', { exact: true })).toBeHidden()
  await expect(bia.getByRole('button', { name: 'Turn camera on', exact: true })).toBeVisible()
  await bia.getByRole('button', { name: 'Turn camera on', exact: true }).click()
  await playing(ana, 'Bia')
  await playing(bia, 'You')
  await ana.getByRole('button', { name: 'Turn camera off', exact: true }).click()
  await expect(bia.getByLabel('Ana', { exact: true })).toHaveCount(0)
  await expect(ana.getByLabel('You', { exact: true })).toHaveCount(0)
  expect(await ana.evaluate(() => (
    window as unknown as { capturedStreams: MediaStream[] }
  ).capturedStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true)
  await playing(ana, 'Bia')
  await ana.getByRole('button', { name: 'Turn camera on', exact: true }).click()
  await playing(bia, 'Ana')
  await ana.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(ana.locator('video')).toHaveCount(0)
  await expect(bia.getByLabel('Ana', { exact: true })).toHaveCount(0)
  expect(await ana.evaluate(() => (
    window as unknown as { capturedStreams: MediaStream[] }
  ).capturedStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true)
  await ana.getByRole('button', { name: 'Join the office' }).click()
  await expect(ana.locator('.presence')).toContainText('Live')
  await openMenu(ana)
  await expect(ana.getByRole('button', { name: 'Turn camera on', exact: true })).toBeVisible()
  await playing(ana, 'Bia')
  await ana.getByRole('button', { name: 'Turn camera on', exact: true }).click()
  await playing(bia, 'Ana')
  await ana.evaluate(() => {
    const sockets = (window as unknown as { roomSockets: WebSocket[] }).roomSockets
    sockets[sockets.length - 1].close()
  })
  await expect(bia.getByLabel('Ana', { exact: true })).toHaveCount(0)
  await expect(ana.locator('.presence')).toContainText('Live')
  await expect(ana.getByRole('button', { name: 'Turn camera on', exact: true })).toBeVisible()
  await expect(ana.getByLabel('You', { exact: true })).toHaveCount(0)
  expect(await ana.evaluate(() => (
    window as unknown as { capturedStreams: MediaStream[] }
  ).capturedStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true)
  await playing(ana, 'Bia')
  expect(errors).toEqual([])
})

test('camera denial displays an error and leaves room chat usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Camera permission denied', 'NotAllowedError')
    }
  })
  await join(page, 'Viewer')
  await page.getByRole('button', { name: 'Turn camera on', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Camera permission denied')
  await expect(page.locator('video')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Message' }).fill('Still here')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('log')).toContainText('Still here')
})
