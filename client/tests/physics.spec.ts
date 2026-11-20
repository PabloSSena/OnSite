import { test, expect } from '@playwright/test'
import { blocked, colliders, maxFeetHeight, stepPhysics, supported, verticalStep, type Box, type PhysicsState } from '../src/world'

function advance(state: PhysicsState, frames: number, dx = 0, dz = 0, jump = false) {
  for (let frame = 0; frame < frames; frame++) {
    state = stepPhysics(state, dx / 60, dz / 60, 1 / 60, jump && frame === 0)
  }
  return state
}

test('desk landing, a second jump onto a physical monitor, and walking off', () => {
  let state = { x: 4, y: 0, z: 2.35, velocity: 0 }
  // Walking into a desk cannot raise the player or pass through its side.
  state = advance(state, 30, 0, -4)
  expect(state.z).toBeGreaterThanOrEqual(2.1)
  expect(state.y).toBe(0)
  state = advance(state, 20, 0, -4, true)
  state = advance(state, 60)
  expect(state.y).toBeCloseTo(1.1)
  expect(supported(state)).toBe(true)
  // A monitor blocks walking across the desk at desk height.
  state = advance(state, 20, 0, -4)
  expect(state.z).toBeGreaterThanOrEqual(1.14)
  expect(state.y).toBeCloseTo(1.1)
  state = advance(state, 7, 0, -4, true)
  state = advance(state, 60)
  expect(state.y).toBeCloseTo(1.75)
  expect(supported(state)).toBe(true)
  state = advance(state, 45, 4)
  state = advance(state, 60)
  expect(state.y).toBe(0)
  expect(state.velocity).toBe(0)
})

test('bench and planters are reachable and jumping never bypasses room boundaries', () => {
  for (const [x, startZ, expectedY] of [[0, -5.7, 0.9], [7.5, -5.8, 1.4]]) {
    let state = advance({ x, y: 0, z: startZ, velocity: 0 }, 25, 0, -4, true)
    state = advance(state, 70)
    expect(state.y).toBeCloseTo(expectedY)
  }
  for (const y of [0, 1.1, 1.75, 3.4]) {
    const state = advance({ x: 9.4, y, z: 6, velocity: 0 }, 60, 4, 4, true)
    expect(state.x).toBeLessThanOrEqual(9.45)
    expect(state.z).toBeLessThanOrEqual(9.45)
    expect(state.y).toBeLessThanOrEqual(maxFeetHeight)
  }
})

test('vertical sweep catches thin tops and undersides, with no mid-air jump', () => {
  const landing = verticalStep({ x: 4, y: 2.5, z: 0.75, velocity: -30 }, 0.1)
  expect(landing.y).toBeCloseTo(1.75)
  expect(landing.velocity).toBe(0)
  const shelf: Box = { position: [0, 2.1, 0], size: [2, 0.2, 2], color: '#fff' }
  const hit = verticalStep({ x: 0, y: 0, z: 0, velocity: 6.8 }, 0.1, [shelf])
  expect(hit.y).toBeCloseTo(0.45)
  expect(hit.velocity).toBe(0)
  const midair = { x: 0, y: 1, z: 5, velocity: -1 }
  expect(stepPhysics(midair, 0, 0, 1 / 60, true)).toEqual(stepPhysics(midair, 0, 0, 1 / 60))
  expect(blocked(4, 0.75, 1.1)).toBe(true)
  expect(blocked(4, 0.75, 1.75)).toBe(false)
  expect(colliders).toHaveLength(11)
})

test('first-person jumps onto a desk and monitor, holds Space without bouncing, then walks off', async ({ page }) => {
  test.setTimeout(90000)
  let position = { x: 0, y: 0, z: 6 }
  const samples: typeof position[] = []
  page.on('websocket', socket => socket.on('framesent', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'move') {
      position = message
      samples.push({ x: message.x, y: message.y, z: message.z })
    }
  }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('Physics tester')
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live')
  await page.locator('canvas').click({ position: { x: 500, y: 300 } })
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
  const poll = { timeout: 15000, intervals: [25, 50] }
  const walkUntil = async (key: string, condition: () => boolean) => {
    await page.keyboard.down(key)
    try {
      await expect.poll(condition, poll).toBe(true)
    } finally {
      await page.keyboard.up(key)
    }
  }
  await walkUntil('KeyD', () => position.x >= 3.9)
  await walkUntil('KeyW', () => position.z <= 2.4)
  await page.keyboard.down('Space')
  try {
    await walkUntil('KeyW', () => position.z <= 1.6)
    await expect.poll(() => position.y, poll).toBeCloseTo(1.1, 3)
    const landed = samples.length
    // These keydowns are auto-repeat: holding Space must not jump from the desk.
    for (let i = 0; i < 4; i++) await page.keyboard.down('Space')
    await expect.poll(() => samples.length - landed, poll).toBeGreaterThan(12)
    expect(samples.slice(landed).every(p => Math.abs(p.y - 1.1) < 0.001)).toBe(true)
  } finally {
    await page.keyboard.up('Space')
  }
  // Stop on the thin monitor in the browser's own movement tick. Waiting for
  // the test driver's round trip can carry us past it on a busy software GPU.
  await page.evaluate(() => {
    const send = WebSocket.prototype.send
    WebSocket.prototype.send = function (data) {
      send.call(this, data)
      if (typeof data !== 'string') return
      const message = JSON.parse(data)
      if (message.type === 'move' && message.z <= 0.95) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }))
        WebSocket.prototype.send = send
      }
    }
  })
  await page.keyboard.press('Space')
  await walkUntil('KeyW', () => position.z <= 0.95)
  await expect.poll(() => position.y, poll).toBeCloseTo(1.75, 3)
  await walkUntil('KeyD', () => position.x >= 6)
  await expect.poll(() => position.y, poll).toBe(0)
  expect(samples.some(p => p.y > 2)).toBe(true)
  expect(samples.every(p => p.y >= 0 && p.y <= maxFeetHeight)).toBe(true)
})
