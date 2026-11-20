import { test, expect } from '@playwright/test'

type ActionState = { x: number; y: number; z: number; punch: number }

test('actions sync to a second tab, respect input focus, and work in first-person by the mirror', async ({ context }, testInfo) => {
  test.setTimeout(120000)
  const actor = await context.newPage()
  const observer = await context.newPage()
  const samples: ActionState[] = []
  const errors: string[] = []
  const consoleMessages: string[] = []
  const check = expect.configure({ timeout: 15000 })
  const poll = { timeout: 15000, intervals: [25, 50, 100] }
  const latest = () => samples.at(-1)

  for (const [page, name] of [[actor, 'Action tester'], [observer, 'Action observer']] as const) {
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`))
    page.on('console', message => {
      consoleMessages.push(`${name} [${message.type()}] ${message.text()}`)
      if (message.type() === 'error') errors.push(`${name}: ${message.text()}`)
    })
  }
  // Observe server snapshots, not the actor's outgoing move messages.
  observer.on('websocket', socket => socket.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type !== 'snapshot') return
    const player = message.players.find((p: { name: string }) => p.name === 'Action tester')
    if (player) samples.push({ x: player.x, y: player.y, z: player.z, punch: player.punch })
  }))

  try {
    for (const [page, name] of [[actor, 'Action tester'], [observer, 'Action observer']] as const) {
      await page.goto('/')
      await page.getByLabel('What should we call you?').fill(name)
      await page.getByRole('button', { name: 'Join the office' }).click()
      await check(page.locator('.presence')).toContainText('Live')
      await page.getByRole('button', { name: 'First-person view' }).click()
    }
    await check.poll(() => samples.length, poll).toBeGreaterThan(0)
    await check(observer.locator('.nametag')).toHaveCount(2)
    await actor.bringToFront()
    await actor.locator('canvas').click({ position: { x: 500, y: 300 } })
    // The third-person focus click may itself punch; let that action finish.
    const focusStart = samples.length
    await check.poll(() => samples.length - focusStart, poll).toBeGreaterThan(10)
    await check.poll(() => latest()?.punch, poll).toBe(0)

    const jumpStart = samples.length
    await actor.keyboard.down('Space')
    try {
      await check.poll(() => samples.slice(jumpStart).some(p => p.y > 0.15), poll).toBe(true)
      await check.poll(() => latest()?.y, poll).toBe(0)
      const heldStart = samples.length
      // Repeated keydown calls model auto-repeat while Space remains held.
      for (let i = 0; i < 4; i++) await actor.keyboard.down('Space')
      await check.poll(() => samples.length - heldStart, poll).toBeGreaterThan(10)
      expect(samples.slice(heldStart).every(p => p.y === 0)).toBe(true)
    } finally {
      await actor.keyboard.up('Space')
    }
    // A new press after release must jump again.
    const secondJump = samples.length
    await actor.keyboard.press('Space')
    await check.poll(() => samples.slice(secondJump).some(p => p.y > 0.15), poll).toBe(true)
    await check.poll(() => latest()?.y, poll).toBe(0)

    const punchStart = samples.length
    await actor.keyboard.press('KeyF')
    await check.poll(() => samples.slice(punchStart).some(p => p.punch > 0), poll).toBe(true)
    await check.poll(() => latest()?.punch, poll).toBe(0)

    const message = actor.getByRole('textbox', { name: 'Message' })
    await message.focus()
    const typingStart = samples.length
    await actor.keyboard.press('Space')
    await actor.keyboard.press('KeyF')
    await check(message).toHaveValue(' f')
    await check.poll(() => samples.length - typingStart, poll).toBeGreaterThan(10)
    expect(samples.slice(typingStart).every(p => p.y === 0 && p.punch === 0)).toBe(true)
    await message.fill('')

    const toggle = actor.getByRole('button', { name: 'First-person view' })
    await toggle.click()
    await check(toggle).toHaveAttribute('aria-pressed', 'true')
    await check(actor.locator('.nametag.me')).toHaveCount(0)
    const lockStart = samples.length
    await actor.locator('canvas').click({ position: { x: 500, y: 300 } })
    await check.poll(() => actor.evaluate(() => document.pointerLockElement?.tagName), poll).toBe('CANVAS')
    await check.poll(() => samples.length - lockStart, poll).toBeGreaterThan(10)
    expect(samples.slice(lockStart).every(p => p.punch === 0)).toBe(true)

    const clickStart = samples.length
    await actor.mouse.click(500, 300)
    await check.poll(() => samples.slice(clickStart).some(p => p.punch > 0), poll).toBe(true)
    await check.poll(() => latest()?.punch, poll).toBe(0)
    const firstPersonJump = samples.length
    await actor.keyboard.press('Space')
    await check.poll(() => samples.slice(firstPersonJump).some(p => p.y > 0.15), poll).toBe(true)
    await check.poll(() => latest()?.y, poll).toBe(0)

    // The central aisle is clear up to the bench at z=-7. Stop before it,
    // facing north so the mirror and reflected local avatar are easy to inspect.
    await actor.keyboard.down('KeyW')
    try {
      await check.poll(() => latest()?.z, { ...poll, timeout: 40000 }).toBeLessThan(-4.7)
    } finally {
      await actor.keyboard.up('KeyW')
    }
    expect(Math.abs(latest()!.x)).toBeLessThan(0.2)
    expect(latest()!.z).toBeGreaterThan(-5.9)
    await actor.screenshot({ path: testInfo.outputPath('first-person-mirror.png') })
    await actor.keyboard.press('Escape')
    await check.poll(() => actor.evaluate(() => document.pointerLockElement === null), poll).toBe(true)

    expect(samples.every(p => Number.isFinite(p.y) && p.y >= 0 && p.y <= 1.5)).toBe(true)
    expect(samples.every(p => Number.isFinite(p.punch) && p.punch >= 0 && p.punch <= 0.32)).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await testInfo.attach('action-console', { body: consoleMessages.join('\n'), contentType: 'text/plain' })
    await testInfo.attach('action-errors', { body: errors.join('\n'), contentType: 'text/plain' })
  }
})
