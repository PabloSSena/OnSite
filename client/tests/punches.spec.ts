import { test, expect } from '@playwright/test'

type Pose = { punch: number; punchLeft: number; y: number }

test('independent arms sync, alternate on F, and respect capture and chat focus', async ({ context }) => {
  test.setTimeout(240000)
  const actor = await context.newPage()
  const observer = await context.newPage()
  const sent: Pose[] = []
  const seen: Pose[] = []
  const errors: string[] = []
  const check = expect.configure({ timeout: 20000 })
  const poll = { timeout: 20000, intervals: [25, 50, 100] }
  actor.on('websocket', ws => ws.on('framesent', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'move') sent.push(message)
  }))
  observer.on('websocket', ws => ws.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type !== 'snapshot') return
    const player = message.players.find((p: { name: string }) => p.name === 'Punch actor')
    if (player) seen.push(player)
  }))
  for (const [page, name] of [[actor, 'Punch actor'], [observer, 'Punch observer']] as const) {
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')
    await page.getByLabel('What should we call you?').fill(name)
    await page.getByRole('button', { name: 'Join the office' }).click()
    await check(page.locator('.presence')).toContainText('Live')
  }
  await actor.bringToFront()
  await check.poll(() => sent.length > 0 && seen.length > 0, poll).toBe(true)
  const pointer = async (...buttons: number[]) => {
    await actor.locator('canvas').evaluate((canvas, values) => {
      for (const button of values) canvas.dispatchEvent(new PointerEvent('pointerdown', { button, bubbles: true }))
    }, buttons)
  }
  const quiet = async () => {
    const start = sent.length
    // Count simulation samples rather than wall time on slow software-rendered worlds.
    await check.poll(() => sent.length - start, poll).toBeGreaterThan(12)
    expect(sent.slice(-2).every(p => p.punch === 0 && p.punchLeft === 0)).toBe(true)
  }
  const action = async (trigger: () => Promise<unknown>, left: boolean, right: boolean) => {
    await quiet()
    const outgoing = sent.length
    const incoming = seen.length
    await trigger()
    const matches = (p: Pose) => (p.punchLeft > 0) === left && (p.punch > 0) === right
    await check.poll(() => sent.slice(outgoing).some(matches), poll).toBe(true)
    await check.poll(() => seen.slice(incoming).some(matches), poll).toBe(true)
    if (!left) expect(sent.slice(outgoing).every(p => p.punchLeft === 0)).toBe(true)
    if (!right) expect(sent.slice(outgoing).every(p => p.punch === 0)).toBe(true)
  }
  // First person is the default. Right click must neither capture nor punch.
  await quiet()
  const beforeCapture = sent.length
  await actor.mouse.click(500, 300, { button: 'right' })
  expect(await actor.evaluate(() => document.pointerLockElement === null)).toBe(true)
  await actor.locator('canvas').click({ position: { x: 500, y: 300 } })
  await check.poll(() => actor.evaluate(() => document.pointerLockElement?.tagName), poll).toBe('CANVAS')
  await quiet()
  expect(sent.slice(beforeCapture).every(p => p.punch === 0 && p.punchLeft === 0)).toBe(true)
  await action(() => actor.mouse.click(500, 300), true, false)
  await action(() => actor.mouse.click(500, 300, { button: 'right' }), false, true)
  await action(() => pointer(0, 2), true, true)

  // A second arm remains available immediately while the first is cooling down.
  await quiet()
  const independent = sent.length
  // Schedule the second input in the browser on the first left-arm sample.
  // An automation round-trip can outlast the whole animation under SwiftShader.
  await actor.locator('canvas').evaluate(canvas => {
    const original = WebSocket.prototype.send
    WebSocket.prototype.send = function(data) {
      original.call(this, data)
      if (typeof data !== 'string') return
      const message = JSON.parse(data)
      if (message.type !== 'move' || message.punchLeft <= 0) return
      WebSocket.prototype.send = original
      for (const button of [0, 2]) canvas.dispatchEvent(new PointerEvent('pointerdown', { button, bubbles: true }))
    }
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }))
  })
  await check.poll(() => sent.slice(independent).some(p => p.punchLeft > 0 && p.punch > 0), poll).toBe(true)
  const leftFrames = sent.slice(independent).filter(p => p.punchLeft > 0)
  expect(leftFrames.every((p, i) => i === 0 || p.punchLeft <= leftFrames[i - 1].punchLeft)).toBe(true)

  await action(() => actor.keyboard.press('KeyF'), true, false)
  await action(() => actor.keyboard.press('KeyF'), false, true)
  await quiet()
  const held = sent.length
  await actor.keyboard.down('KeyF')
  await check.poll(() => sent.slice(held).some(p => p.punchLeft > 0), poll).toBe(true)
  await quiet()
  const repeated = sent.length
  for (let i = 0; i < 4; i++) await actor.keyboard.down('KeyF')
  await quiet()
  expect(sent.slice(repeated).every(p => p.punch === 0 && p.punchLeft === 0)).toBe(true)
  await actor.keyboard.up('KeyF')
  await action(() => actor.keyboard.press('KeyF'), false, true)

  for (const event of ['blur', 'visibilitychange', 'pointerlockchange']) {
    await quiet()
    const start = sent.length
    await actor.locator('canvas').evaluate((canvas, name) => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true }))
      // Queue and clear in one task so no animation frame can consume the request.
      const target = name === 'blur' ? window : document
      target.dispatchEvent(new Event(name))
    }, event)
    await quiet()
    expect(sent.slice(start).every(p => p.punch === 0 && p.punchLeft === 0)).toBe(true)
  }

  expect(await actor.locator('canvas').evaluate(canvas =>
    !canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true)
  await actor.keyboard.press('Escape')
  await check.poll(() => actor.evaluate(() => document.pointerLockElement === null), poll).toBe(true)
  const chat = actor.getByRole('textbox', { name: 'Message' })
  await chat.focus()
  await quiet()
  const typing = sent.length
  await actor.keyboard.press('KeyF')
  await actor.keyboard.press('Space')
  await pointer(0, 2)
  await quiet()
  await check(chat).toHaveValue('f ')
  expect(sent.slice(typing).every(p => p.punch === 0 && p.punchLeft === 0 && p.y === 0)).toBe(true)
  expect(await chat.evaluate(input =>
    input.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true)

  // Third person accepts either mouse button without pointer capture.
  await actor.getByRole('button', { name: 'Menu', exact: true }).click()
  await actor.getByRole('button', { name: 'First-person view' }).click()
  await actor.getByRole('button', { name: 'Menu', exact: true }).click()
  await actor.locator('canvas').click({ position: { x: 500, y: 300 } })
  await action(() => pointer(0), true, false)
  await action(() => pointer(2), false, true)
  await action(() => pointer(0, 2), true, true)
  expect(await actor.evaluate(() => document.pointerLockElement === null)).toBe(true)
  expect(sent.every(p => [p.punch, p.punchLeft].every(value => Number.isFinite(value) && value >= 0 && value <= 0.32))).toBe(true)
  expect(errors).toEqual([])
})
