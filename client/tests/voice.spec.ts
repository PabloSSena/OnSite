import { test as base, expect, chromium, type BrowserContext, type Page } from '@playwright/test'

type VoiceProbe = {
  __voicePCs: RTCPeerConnection[]
  __voiceStreams: MediaStream[]
  __voiceRequests: number
  __voiceDenyNext: boolean
  __voiceSockets: WebSocket[]
  __voiceDelayNext: boolean
  __voiceRelease?: () => void
}

const test = base.extend<{ voiceContext: BrowserContext }>({
  voiceContext: async ({}, use) => {
    const browser = await chromium.launch({
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--enable-unsafe-swiftshader',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
      ],
    })
    try {
      const context = await browser.newContext({
        baseURL: process.env.OFFICE_URL ?? 'http://localhost:8081',
        viewport: { width: 960, height: 600 },
      })
      await context.addInitScript(() => {
        const probe = window as unknown as VoiceProbe
        probe.__voicePCs = []
        probe.__voiceStreams = []
        probe.__voiceRequests = 0
        probe.__voiceDenyNext = false
        probe.__voiceSockets = []
        probe.__voiceDelayNext = false
        window.WebSocket = new Proxy(window.WebSocket, {
          construct(target, args) {
            const socket = Reflect.construct(target, args) as WebSocket
            probe.__voiceSockets.push(socket)
            return socket
          },
        })
        window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
          construct(target, args) {
            const connection = Reflect.construct(target, args) as RTCPeerConnection
            probe.__voicePCs.push(connection)
            return connection
          },
        })
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async constraints => {
          probe.__voiceRequests++
          if (probe.__voiceDenyNext) {
            probe.__voiceDenyNext = false
            throw new DOMException('Microphone permission denied for this test', 'NotAllowedError')
          }
          const delayed = probe.__voiceDelayNext
          probe.__voiceDelayNext = false
          const gate = delayed ? new Promise<void>(resolve => { probe.__voiceRelease = resolve }) : undefined
          const stream = await getUserMedia(constraints)
          probe.__voiceStreams.push(stream)
          if (gate) await gate
          return stream
        }
      })
      await use(context)
    } finally {
      await browser.close()
    }
  },
})

const check = expect.configure({ timeout: 15000 })
const poll = { timeout: 15000 }

async function joinRoom(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByRole('button', { name: 'Join the office' }).click()
  await check(page.locator('.presence')).toContainText('Live')
  await check(page.locator('.voice-status')).toHaveText(/^Voice: off$/)
  expect(await page.evaluate(() => (window as unknown as VoiceProbe).__voiceRequests)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as VoiceProbe).__voicePCs.length)).toBe(0)
}

async function joinVoice(page: Page) {
  await page.bringToFront()
  await page.getByRole('button', { name: 'Join voice', exact: true }).click()
  await check(page.getByRole('button', { name: 'Mute microphone', exact: true })).toBeVisible()
}

async function expectAudioFlow(page: Page) {
  await check(page.locator('.voice-status')).toHaveText(/^Voice: 1 connected\b.*$/)
  await check.poll(() => page.evaluate(async () => {
    const connections = (window as unknown as VoiceProbe).__voicePCs
      .filter(connection => connection.connectionState !== 'closed')
    if (connections.length !== 1 || connections[0].connectionState !== 'connected') return 0
    const stats = await connections[0].getStats()
    let bytes = 0
    stats.forEach(report => {
      if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
        bytes += report.bytesReceived ?? 0
      }
    })
    return bytes
  }), poll).toBeGreaterThan(0)
  await check.poll(() => page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLAudioElement>('audio[data-voice-peer]')]
    return elements.length === 1 && elements.every(element =>
      element.parentElement === document.body
      && element.srcObject instanceof MediaStream
      && element.srcObject.getAudioTracks().length > 0)
  }), poll).toBe(true)
  const enableSound = page.getByRole('button', { name: 'Enable sound', exact: true })
  if (await enableSound.isVisible()) await enableSound.click()
}

async function expectStopped(page: Page) {
  await check.poll(() => page.evaluate(() => {
    const probe = window as unknown as VoiceProbe
    return probe.__voiceStreams.length > 0
      && probe.__voiceStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))
      && probe.__voicePCs.every(connection => connection.connectionState === 'closed')
  }), poll).toBe(true)
  await check(page.locator('audio[data-voice-peer]')).toHaveCount(0)
}

test('voice is opt-in, carries audio both ways, mutes locally, and cleans up on voice and room leave', async ({ voiceContext }) => {
  test.setTimeout(120000)
  const ana = await voiceContext.newPage()
  const bia = await voiceContext.newPage()
  const errors: string[] = []
  for (const page of [ana, bia]) page.on('pageerror', error => errors.push(error.message))

  await joinRoom(ana, 'Voice Ana')
  await joinRoom(bia, 'Voice Bia')
  await joinVoice(ana)
  await check(ana.locator('.voice-status')).toHaveText(/^Voice: 0 connected\b.*$/)
  expect(await bia.evaluate(() => (window as unknown as VoiceProbe).__voiceRequests)).toBe(0)
  await check(bia.locator('audio[data-voice-peer]')).toHaveCount(0)
  await joinVoice(bia)
  await expectAudioFlow(ana)
  await expectAudioFlow(bia)

  await ana.getByRole('button', { name: 'Mute microphone', exact: true }).click()
  await check(ana.getByRole('button', { name: 'Unmute microphone', exact: true })).toBeVisible()
  await check.poll(() => ana.evaluate(() => {
    const tracks = (window as unknown as VoiceProbe).__voiceStreams.flatMap(stream => stream.getAudioTracks())
    return tracks.length > 0 && tracks.every(track => track.readyState === 'live' && !track.enabled)
  }), poll).toBe(true)
  await ana.getByRole('button', { name: 'Unmute microphone', exact: true }).click()
  await check.poll(() => ana.evaluate(() => {
    const tracks = (window as unknown as VoiceProbe).__voiceStreams.flatMap(stream => stream.getAudioTracks())
    return tracks.length > 0 && tracks.every(track => track.readyState === 'live' && track.enabled)
  }), poll).toBe(true)

  await ana.getByRole('button', { name: 'Leave voice', exact: true }).click()
  await check(ana.locator('.voice-status')).toHaveText(/^Voice: off$/)
  await expectStopped(ana)
  await check(bia.locator('.voice-status')).toHaveText(/^Voice: 0 connected\b.*$/)
  await check(bia.locator('audio[data-voice-peer]')).toHaveCount(0)
  await check.poll(() => bia.evaluate(() => (window as unknown as VoiceProbe).__voicePCs
    .every(connection => connection.connectionState === 'closed')), poll).toBe(true)

  // Rejoining must create fresh tracks and connections, not reuse stopped resources.
  await joinVoice(ana)
  await expectAudioFlow(ana)
  await expectAudioFlow(bia)
  expect(await ana.evaluate(() => (window as unknown as VoiceProbe).__voiceRequests)).toBe(2)
  await ana.getByRole('button', { name: 'Leave', exact: true }).click()
  await check(ana.getByRole('button', { name: 'Join the office' })).toBeVisible()
  await expectStopped(ana)
  await check(bia.locator('.voice-status')).toHaveText(/^Voice: 0 connected\b.*$/)
  await check(bia.locator('audio[data-voice-peer]')).toHaveCount(0)
  await check.poll(() => bia.evaluate(() => (window as unknown as VoiceProbe).__voicePCs
    .every(connection => connection.connectionState === 'closed')), poll).toBe(true)
  await bia.getByRole('button', { name: 'Leave', exact: true }).click()
  await expectStopped(bia)
  expect(errors).toEqual([])
})

test('a denied microphone request leaves voice off and allows an explicit retry', async ({ voiceContext }) => {
  test.setTimeout(120000)
  const page = await voiceContext.newPage()
  await joinRoom(page, 'Voice permission tester')
  await page.evaluate(() => { (window as unknown as VoiceProbe).__voiceDenyNext = true })
  await page.getByRole('button', { name: 'Join voice', exact: true }).click()
  await check(page.locator('.voice-status')).toHaveText(/^Voice: off$/)
  await check(page.getByRole('button', { name: 'Join voice', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => (window as unknown as VoiceProbe).__voiceRequests)).toBe(1)
  expect(await page.evaluate(() => (window as unknown as VoiceProbe).__voiceStreams.length)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as VoiceProbe).__voicePCs.length)).toBe(0)
  await check(page.locator('audio[data-voice-peer]')).toHaveCount(0)

  await joinVoice(page)
  await check(page.locator('.voice-status')).toHaveText(/^Voice: 0 connected\b.*$/)
  expect(await page.evaluate(() => (window as unknown as VoiceProbe).__voiceRequests)).toBe(2)
  await page.getByRole('button', { name: 'Leave voice', exact: true }).click()
  await expectStopped(page)
})

test('losing the room socket releases voice and reconnects without requesting the microphone again', async ({ voiceContext }) => {
  test.setTimeout(120000)
  const ana = await voiceContext.newPage()
  const bia = await voiceContext.newPage()
  await joinRoom(ana, 'Reconnect Ana')
  await joinRoom(bia, 'Reconnect Bia')
  await joinVoice(ana)
  await joinVoice(bia)
  await expectAudioFlow(ana)
  await expectAudioFlow(bia)
  const socketCount = await ana.evaluate(() => {
    const sockets = (window as unknown as VoiceProbe).__voiceSockets
    const socket = sockets.find(candidate => candidate.readyState === WebSocket.OPEN)
    if (!socket) throw new Error('Expected an open room WebSocket')
    socket.close()
    return sockets.length
  })
  await expectStopped(ana)
  // A new open socket proves recovery; the old Live label alone could be stale.
  await check.poll(() => ana.evaluate(previousCount => {
    const sockets = (window as unknown as VoiceProbe).__voiceSockets
    return sockets.length > previousCount && sockets.at(-1)?.readyState === WebSocket.OPEN
  }, socketCount), poll).toBe(true)
  await check(ana.locator('.presence')).toContainText('Live')
  await check(ana.locator('.voice-status')).toHaveText(/^Voice: off$/)
  await check(ana.getByRole('button', { name: 'Join voice', exact: true })).toBeEnabled()
  await expectStopped(ana)
  expect(await ana.evaluate(() => (window as unknown as VoiceProbe).__voiceRequests)).toBe(1)
  await check(bia.locator('.voice-status')).toHaveText(/^Voice: 0 connected\b.*$/)
  await check(bia.locator('audio[data-voice-peer]')).toHaveCount(0)
  await check.poll(() => bia.evaluate(() => (window as unknown as VoiceProbe).__voicePCs
    .every(connection => connection.connectionState === 'closed')), poll).toBe(true)
  await bia.getByRole('button', { name: 'Leave voice', exact: true }).click()
  await expectStopped(bia)
})

test('cancelling a pending microphone request stops the late stream and permits an explicit retry', async ({ voiceContext }) => {
  test.setTimeout(120000)
  const page = await voiceContext.newPage()
  await joinRoom(page, 'Pending microphone tester')
  await page.evaluate(() => { (window as unknown as VoiceProbe).__voiceDelayNext = true })
  await page.getByRole('button', { name: 'Join voice', exact: true }).click()
  await check(page.locator('.voice-status')).toHaveText(/^Requesting microphone…$/)
  await check.poll(() => page.evaluate(() => (window as unknown as VoiceProbe).__voiceStreams.length), poll).toBe(1)
  await page.getByRole('button', { name: 'Cancel microphone request', exact: true }).click()
  await check(page.locator('.voice-status')).toHaveText(/^Voice: off$/)
  await page.evaluate(() => { (window as unknown as VoiceProbe).__voiceRelease?.() })
  await expectStopped(page)
  await check(page.locator('.voice-status')).toHaveText(/^Voice: off$/)
  expect(await page.evaluate(() => (window as unknown as VoiceProbe).__voicePCs.length)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as VoiceProbe).__voiceRequests)).toBe(1)
  await joinVoice(page)
  await check(page.locator('.voice-status')).toHaveText(/^Voice: 0 connected\b.*$/)
  expect(await page.evaluate(() => (window as unknown as VoiceProbe).__voiceRequests)).toBe(2)
  await page.getByRole('button', { name: 'Leave voice', exact: true }).click()
  await expectStopped(page)
})
