import { test as base, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import { closeMenu, openMenu } from './helpers'

type MediaProbe = {
  __mediaPCs: RTCPeerConnection[]
  __mediaStreams: MediaStream[]
  __mediaRequests: number
  __mediaSentTypes: string[]
}

const test = base.extend<{ mediaContext: BrowserContext }>({
  mediaContext: async ({}, use) => {
    const browser = await chromium.launch({
      args: [
        '--enable-unsafe-swiftshader',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    })
    try {
      const context = await browser.newContext({
        baseURL: process.env.OFFICE_URL ?? 'http://localhost:8081',
        viewport: { width: 960, height: 600 },
      })
      await context.addInitScript(() => {
        const probe = window as unknown as MediaProbe
        probe.__mediaPCs = []
        probe.__mediaStreams = []
        probe.__mediaRequests = 0
        probe.__mediaSentTypes = []
        window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
          construct(target, args) {
            const connection = Reflect.construct(target, args) as RTCPeerConnection
            probe.__mediaPCs.push(connection)
            return connection
          },
        })
        const send = WebSocket.prototype.send
        WebSocket.prototype.send = function (data) {
          if (typeof data === 'string') {
            try {
              const message = JSON.parse(data) as { type?: unknown }
              if (typeof message.type === 'string') probe.__mediaSentTypes.push(message.type)
            } catch {
              // Ignore non-JSON traffic without changing native socket behavior.
            }
          }
          return send.call(this, data)
        }
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async constraints => {
          probe.__mediaRequests++
          const stream = await getUserMedia(constraints)
          probe.__mediaStreams.push(stream)
          return stream
        }
      })
      await use(context)
    } finally {
      await browser.close()
    }
  },
})

const check = expect.configure({ timeout: 20000 })
const poll = { timeout: 20000 }

async function joinRoom(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByRole('button', { name: 'Join the office' }).click()
  await check(page.locator('.presence')).toContainText('Live')
  await openMenu(page)
  await check(page.locator('.voice-status')).toHaveText(/^Voice: off$/)
  await check(page.getByRole('button', { name: 'Turn camera on', exact: true })).toBeVisible()
  await check(page.locator('video, audio[data-voice-peer]')).toHaveCount(0)
  expect(await page.evaluate(() => {
    const probe = window as unknown as MediaProbe
    return { requests: probe.__mediaRequests, connections: probe.__mediaPCs.length }
  })).toEqual({ requests: 0, connections: 0 })
}

async function joinVoice(page: Page) {
  await page.bringToFront()
  await openMenu(page)
  await page.getByRole('button', { name: 'Join voice', exact: true }).click()
  await check(page.getByRole('button', { name: 'Mute microphone', exact: true })).toBeVisible()
}

async function inboundAudioBytes(page: Page) {
  return page.evaluate(async () => {
    const connections = (window as unknown as MediaProbe).__mediaPCs
      .filter(connection => connection.connectionState === 'connected')
    let bytes = 0
    for (const connection of connections) {
      const stats = await connection.getStats()
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
          bytes += report.bytesReceived ?? 0
        }
      })
    }
    return bytes
  })
}

async function expectAudioFlow(page: Page) {
  await check(page.locator('.voice-status')).toHaveText(/^Voice: 1 connected\b.*$/)
  const enableSound = page.getByRole('button', { name: 'Enable sound', exact: true })
  if (await enableSound.isVisible()) await enableSound.click()
  // Require fresh packets, not stale counters from before a media toggle.
  const previousBytes = await inboundAudioBytes(page)
  await check.poll(() => inboundAudioBytes(page), poll).toBeGreaterThan(previousBytes)
  await check(page.locator('audio[data-voice-peer]')).toHaveCount(1)
}

async function expectVideoPlaying(page: Page, name: string) {
  const video = page.locator('video').and(page.getByLabel(name, { exact: true }))
  await check(video).toHaveCount(1)
  await check.poll(() => video.evaluate(element => {
    const media = element as HTMLVideoElement
    return media.videoWidth > 0 && media.readyState >= 2 && !media.paused
  }), poll).toBe(true)
  const previousTime = await video.evaluate(element => (element as HTMLVideoElement).currentTime)
  await check.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), poll)
    .toBeGreaterThan(previousTime)
}

async function expectBothCameras(ana: Page, bia: Page) {
  await expectVideoPlaying(ana, 'You')
  await expectVideoPlaying(ana, 'Media Bia')
  await expectVideoPlaying(bia, 'You')
  await expectVideoPlaying(bia, 'Media Ana')
}

async function expectAllStopped(page: Page) {
  await check.poll(() => page.evaluate(() => {
    const probe = window as unknown as MediaProbe
    return probe.__mediaStreams.length > 0
      && probe.__mediaStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))
      && probe.__mediaPCs.every(connection => connection.connectionState === 'closed')
  }), poll).toBe(true)
  await check(page.locator('video, audio[data-voice-peer]')).toHaveCount(0)
}

test('voice and cameras coexist, toggle independently, and release media when leaving', async ({ mediaContext }) => {
  // Repeated native video/audio checks plus two software-rendered worlds can
  // exceed three minutes; keep the individual playback assertions bounded.
  test.setTimeout(360000)
  const ana = await mediaContext.newPage()
  const bia = await mediaContext.newPage()
  const errors: string[] = []
  for (const page of [ana, bia]) page.on('pageerror', error => errors.push(error.message))

  await joinRoom(ana, 'Media Ana')
  await joinRoom(bia, 'Media Bia')
  await joinVoice(ana)
  await joinVoice(bia)
  await expectAudioFlow(ana)
  await expectAudioFlow(bia)

  for (const page of [ana, bia]) {
    await page.bringToFront()
    await page.getByRole('button', { name: 'Turn camera on', exact: true }).click()
  }
  await expectBothCameras(ana, bia)
  await expectAudioFlow(ana)
  await expectAudioFlow(bia)
  // Hiding controls must not unmount media owners or stop native video playback.
  const beforeClosing = await Promise.all([ana, bia].map(page => page.evaluate(() => {
    const probe = window as unknown as MediaProbe
    return { requests: probe.__mediaRequests, connections: probe.__mediaPCs.length }
  })))
  for (const page of [ana, bia]) {
    await closeMenu(page)
    await check(page.getByRole('button', { name: 'Leave voice', exact: true })).toBeHidden()
    await check(page.getByLabel('You', { exact: true })).toBeVisible()
    expect(await page.getByLabel('You', { exact: true }).evaluate(element => {
      const preview = element.closest('figure')!
      const bounds = preview.getBoundingClientRect()
      return getComputedStyle(preview).position === 'fixed'
        && preview.closest('#game-controls') === null
        && bounds.top >= 0 && bounds.top < 80
        && bounds.right <= window.innerWidth && bounds.right > window.innerWidth - 80
        && bounds.width <= 240 && bounds.height <= 200
    })).toBe(true)
  }
  await expectBothCameras(ana, bia)
  for (const [index, page] of [ana, bia].entries()) {
    await check.poll(() => page.evaluate(() => (window as unknown as MediaProbe).__mediaStreams
      .every(stream => stream.getTracks().every(track => track.readyState === 'live'))), poll).toBe(true)
    const previousBytes = await inboundAudioBytes(page)
    await check.poll(() => inboundAudioBytes(page), poll).toBeGreaterThan(previousBytes)
    expect(await page.evaluate(() => {
      const probe = window as unknown as MediaProbe
      return { requests: probe.__mediaRequests, connections: probe.__mediaPCs.length }
    })).toEqual(beforeClosing[index])
    await openMenu(page)
  }
  for (const page of [ana, bia]) {
    const types = await page.evaluate(() => (window as unknown as MediaProbe).__mediaSentTypes)
    expect(types).toContain('signal')
    expect(types).toContain('camera-signal')
  }

  await ana.getByRole('button', { name: 'Leave voice', exact: true }).click()
  await check(ana.locator('.voice-status')).toHaveText(/^Voice: off$/)
  await check(bia.locator('.voice-status')).toHaveText(/^Voice: 0 connected\b.*$/)
  for (const page of [ana, bia]) await check(page.locator('audio[data-voice-peer]')).toHaveCount(0)
  await check.poll(() => ana.evaluate(() => {
    const streams = (window as unknown as MediaProbe).__mediaStreams
    const audio = streams.flatMap(stream => stream.getAudioTracks())
    const video = streams.flatMap(stream => stream.getVideoTracks())
    return audio.length > 0 && audio.every(track => track.readyState === 'ended')
      && video.length > 0 && video.every(track => track.readyState === 'live')
  }), poll).toBe(true)
  await expectBothCameras(ana, bia)

  await joinVoice(ana)
  await expectAudioFlow(ana)
  await expectAudioFlow(bia)
  await expectBothCameras(ana, bia)

  // Keep Ana's camera on so room departure must release both media types.
  await bia.getByRole('button', { name: 'Turn camera off', exact: true }).click()
  await check(ana.locator('video[aria-label="Media Bia"]')).toHaveCount(0)
  await check(bia.locator('video[aria-label="You"]')).toHaveCount(0)
  await check.poll(() => bia.evaluate(() => {
    const streams = (window as unknown as MediaProbe).__mediaStreams
    const audio = streams.flatMap(stream => stream.getAudioTracks())
    const video = streams.flatMap(stream => stream.getVideoTracks())
    return video.length > 0 && video.every(track => track.readyState === 'ended')
      && audio.length > 0 && audio.every(track => track.readyState === 'live' && track.enabled)
  }), poll).toBe(true)
  await expectAudioFlow(ana)
  await expectAudioFlow(bia)
  await expectVideoPlaying(ana, 'You')
  await expectVideoPlaying(bia, 'Media Ana')
  for (const page of [ana, bia]) await check(page.getByRole('alert')).toHaveCount(0)

  await ana.getByRole('button', { name: 'Leave', exact: true }).click()
  await check(ana.getByRole('button', { name: 'Join the office' })).toBeVisible()
  await expectAllStopped(ana)
  await check(bia.locator('.voice-status')).toHaveText(/^Voice: 0 connected\b.*$/)
  await check(bia.locator('video, audio[data-voice-peer]')).toHaveCount(0)
  await check.poll(() => bia.evaluate(() => (window as unknown as MediaProbe).__mediaPCs
    .every(connection => connection.connectionState === 'closed')), poll).toBe(true)
  await bia.getByRole('button', { name: 'Leave', exact: true }).click()
  await expectAllStopped(bia)
  expect(errors).toEqual([])
})
