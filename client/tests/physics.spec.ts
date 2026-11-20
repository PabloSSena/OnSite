import { test, expect } from '@playwright/test'
import { blocked, colliders, furniture, maxFeetHeight, monitors, stepPhysics, supported, verticalStep, walls, WORLD_LIMIT, type Box, type PhysicsState } from '../src/world'

function advance(state: PhysicsState, frames: number, dx = 0, dz = 0, jump = false) {
  for (let frame = 0; frame < frames; frame++) {
    state = stepPhysics(state, dx / 60, dz / 60, 1 / 60, jump && frame === 0)
  }
  return state
}

test('desk landing, a second jump onto a physical monitor, and walking off', () => {
  let state = { x: -6, y: 0, z: -13.35, velocity: 0 }
  // Walking into a desk cannot raise the player or pass through its side.
  state = advance(state, 30, 0, 4)
  expect(state.z).toBeLessThanOrEqual(-13.1)
  expect(state.y).toBe(0)
  state = advance(state, 12, 0, 4, true)
  state = advance(state, 60)
  expect(state.y).toBeCloseTo(0.84)
  expect(supported(state)).toBe(true)
  // A monitor blocks walking across the desk at desk height.
  state = advance(state, 20, 0, 4)
  expect(state.z).toBeLessThanOrEqual(-12.645)
  expect(state.y).toBeCloseTo(0.84)
  state = advance(state, 12, 0, 4, true)
  state = advance(state, 60)
  expect(state.y).toBeCloseTo(1.48)
  expect(supported(state)).toBe(true)
  state = advance(state, 45, 4)
  state = advance(state, 60)
  expect(state.y).toBe(0)
  expect(state.velocity).toBe(0)
})

test('bench and planter landings, solid walls, jumpable fences, and absolute map bounds', () => {
  for (const [x, startZ, dz, expectedY] of [[-10, 8, 4, 0.5], [4, 6.9, -4, 0.8]]) {
    let state = advance({ x, y: 0, z: startZ, velocity: 0 }, 18, 0, dz, true)
    state = advance(state, 70)
    expect(state.y).toBeCloseTo(expectedY)
  }
  for (const y of [0, 0.84, 1.48, 3.4]) {
    const state = advance({ x: 23.4, y, z: 23.4, velocity: 0 }, 60, 4, 4, true)
    expect(state.x).toBeLessThanOrEqual(WORLD_LIMIT)
    expect(state.z).toBeLessThanOrEqual(WORLD_LIMIT)
    expect(state.y).toBeLessThanOrEqual(maxFeetHeight)
  }
  const wall = advance({ x: 0, y: 0, z: -15, velocity: 0 }, 60, 0, -4, true)
  expect(wall.z).toBeGreaterThanOrEqual(-15.5)
  expect(blocked(0, -16, 2.99)).toBe(true)
  expect(blocked(0, -16, 3)).toBe(false)
  const wallLanding = verticalStep({ x: 0, y: 3.4, z: -16, velocity: -2 }, 0.5)
  expect(wallLanding.y).toBe(3)
  expect(supported(wallLanding)).toBe(true)
  expect(blocked(23, 0, 0)).toBe(true)
  expect(blocked(23, 0, 1.2)).toBe(false)
  const overFence = stepPhysics({ x: 22.5, y: 1.4, z: 0, velocity: 0 }, 0.8, 0, 0.05)
  expect(overFence.x).toBeGreaterThan(23.1)
})

test('vertical sweep catches thin tops and undersides, with no mid-air jump', () => {
  const landing = verticalStep({ x: -6, y: 2.5, z: -12.25, velocity: -30 }, 0.1)
  expect(landing.y).toBeCloseTo(1.48)
  expect(landing.velocity).toBe(0)
  const shelf: Box = { position: [0, 2.1, 0], size: [2, 0.2, 2], color: '#fff' }
  const hit = verticalStep({ x: 0, y: 0, z: 0, velocity: 6.8 }, 0.1, [shelf])
  expect(hit.y).toBeCloseTo(0.45)
  expect(hit.velocity).toBe(0)
  const midair = { x: 0, y: 1, z: 5, velocity: -1 }
  expect(stepPhysics(midair, 0, 0, 1 / 60, true)).toEqual(stepPhysics(midair, 0, 0, 1 / 60))
  expect(blocked(-6, -12.25, 0.84)).toBe(true)
  expect(blocked(-6, -12.25, 1.48)).toBe(false)
  expect(colliders).toEqual([...walls, ...furniture, ...monitors])
  expect(monitors).toHaveLength(4)
  expect(blocked(NaN, 0)).toBe(true)
  expect(blocked(0, Infinity)).toBe(true)
  expect(blocked(0, 0, NaN)).toBe(true)
})

test('first-person jumps onto a desk and monitor, holds Space without bouncing, then walks off', async ({ page }) => {
  test.setTimeout(240000)
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
  const poll = { timeout: 40000, intervals: [25, 50] }
  const walkUntil = async (key: string, condition: () => boolean) => {
    await page.keyboard.down(key)
    try {
      await expect.poll(condition, poll).toBe(true)
    } finally {
      await page.keyboard.up(key)
    }
  }
  // Enter the studio doorway, then approach the northern desk from behind.
  await walkUntil('KeyW', () => position.z <= -11)
  await walkUntil('KeyA', () => position.x <= -3.5)
  await walkUntil('KeyW', () => position.z <= -14)
  await walkUntil('KeyA', () => position.x <= -6)
  await walkUntil('KeyS', () => position.z >= -13.35)
  // Stop each short approach in the browser's own send tick, so a slow test
  // driver's round trip cannot overshoot the narrow landing area.
  const stopAt = async (z: number) => page.evaluate(targetZ => {
    const send = WebSocket.prototype.send
    WebSocket.prototype.send = function (data) {
      send.call(this, data)
      if (typeof data !== 'string') return
      const message = JSON.parse(data)
      if (message.type === 'move' && message.z >= targetZ) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS', bubbles: true }))
        WebSocket.prototype.send = send
      }
    }
  }, z)
  await stopAt(-12.95)
  await page.keyboard.down('Space')
  try {
    await walkUntil('KeyS', () => position.z >= -12.95)
    await expect.poll(() => position.y, poll).toBeCloseTo(0.84, 3)
    const landed = samples.length
    // These keydowns are auto-repeat: holding Space must not jump from the desk.
    for (let i = 0; i < 4; i++) await page.keyboard.down('Space')
    await expect.poll(() => samples.length - landed, poll).toBeGreaterThan(12)
    expect(samples.slice(landed).every(p => Math.abs(p.y - 0.84) < 0.001)).toBe(true)
  } finally {
    await page.keyboard.up('Space')
  }
  await stopAt(-12.25)
  await page.keyboard.press('Space')
  await walkUntil('KeyS', () => position.z >= -12.25)
  await expect.poll(() => position.y, poll).toBeCloseTo(1.48, 3)
  await walkUntil('KeyD', () => position.x >= -3.8)
  await expect.poll(() => position.y, poll).toBe(0)
  expect(samples.some(p => p.y > 2)).toBe(true)
  expect(samples.every(p => p.y >= 0 && p.y <= maxFeetHeight)).toBe(true)
})
