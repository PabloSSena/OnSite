import { test, expect, type Page } from '@playwright/test'
import { colliders, fridge, FRIDGE_REACH, nearFridge } from '../src/world'
import { fridgeAction, fridgePrompt } from '../src/interaction'
import { closeMenu, openMenu } from './helpers'

test('fridge reach, actions, and collision', () => {
  const [x, , z] = fridge.position
  expect(nearFridge(x - FRIDGE_REACH, z)).toBe(true)
  expect(nearFridge(x - FRIDGE_REACH - 0.01, z)).toBe(false)
  expect(nearFridge(0, 6)).toBe(false)
  expect(colliders).toContain(fridge)
  expect(fridgeAction(false, 'none')).toBe('toggle-fridge')
  expect(fridgeAction(true, 'none')).toBe('take-beer')
  expect(fridgeAction(true, 'beer')).toBe('toggle-fridge')
  expect([fridgePrompt(false, 'none'), fridgePrompt(true, 'none'), fridgePrompt(true, 'beer')])
    .toEqual(['Open fridge', 'Take a beer', 'Close fridge'])
})

type Seen = { x: number; z: number; holding?: string; drink?: number }

async function join(page: Page, name: string) {
  const state = { me: { x: 0, z: 6 } as Seen, players: {} as Record<string, Seen>, fridgeOpen: false }
  page.on('websocket', ws => ws.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type !== 'snapshot') return
    state.fridgeOpen = message.world?.fridgeOpen === true
    for (const p of message.players) state.players[p.name] = p
    if (state.players[name]) state.me = state.players[name]
  }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live')
  return state
}

test('open the fridge, grab a beer, sip, and drop it, seen by a friend', async ({ browser }) => {
  test.setTimeout(240000)
  const errors: string[] = []
  const [first, second] = await Promise.all([browser.newContext(), browser.newContext()])
  const page = await first.newPage()
  const friend = await second.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const mine = await join(page, 'Fridge raider')
  const theirs = await join(friend, 'Thirsty friend')

  await openMenu(page)
  const firstPerson = page.getByRole('button', { name: 'First-person view' })
  if (await firstPerson.getAttribute('aria-pressed') === 'true') await firstPerson.click()
  await expect(firstPerson).toHaveAttribute('aria-pressed', 'false')
  await page.locator('canvas').click({ position: { x: 500, y: 300 } })

  async function walk(key: string, reached: () => boolean) {
    await page.keyboard.down(key)
    try {
      await expect.poll(() => ({ reached: reached(), x: mine.me.x, z: mine.me.z }),
        { timeout: 90000, intervals: [100] }).toMatchObject({ reached: true })
    } finally {
      await page.keyboard.up(key)
    }
  }
  // Up the hall, through the kitchen doorway (z -3..2 at x = 2), around the kitchen
  // table, then along the fridge's front. Each leg tolerates overshoot from slow frames.
  await walk('KeyW', () => mine.me.z < 1)
  await walk('KeyD', () => mine.me.x > 6)
  await walk('KeyW', () => mine.me.z < -2)
  await walk('KeyD', () => mine.me.x > 13.2)

  // The server accepts at most one interaction every 250 ms.
  const press = async (key: string) => { await page.waitForTimeout(300); await page.keyboard.press(key) }
  const prompt = page.getByRole('status', { name: 'Interaction' })
  await expect(prompt).toContainText('Open fridge')
  await press('KeyE')
  await expect(prompt).toContainText('Take a beer')
  await expect.poll(() => theirs.fridgeOpen).toBe(true)
  await press('KeyE')
  await expect(prompt).toContainText('Sip')
  await expect(prompt).toContainText('Close fridge')
  await expect.poll(() => theirs.players['Fridge raider']?.holding).toBe('beer')
  await page.screenshot({ path: 'test-results/fridge-beer.png' })
  // First person is the priority: check the open fridge and the bottle in hand from your own eyes.
  await openMenu(page)
  await firstPerson.click()
  await expect(firstPerson).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'test-results/fridge-first-person.png' })
  await firstPerson.click()
  await expect(firstPerson).toHaveAttribute('aria-pressed', 'false')
  await closeMenu(page)
  await page.locator('canvas').click({ position: { x: 500, y: 300 } })

  await press('KeyR')
  await expect.poll(() => theirs.players['Fridge raider']?.drink ?? 0).toBeGreaterThan(0)
  await press('KeyG')
  await expect.poll(() => theirs.players['Fridge raider']?.holding).toBe('none')
  await expect(prompt).not.toContainText('Sip')
  await press('KeyE')
  await expect.poll(() => theirs.fridgeOpen).toBe(true) // E with empty hands at an open fridge takes another.
  await expect.poll(() => theirs.players['Fridge raider']?.holding).toBe('beer')
  await press('KeyE')
  await expect.poll(() => theirs.fridgeOpen).toBe(false)

  expect(errors).toEqual([])
  await Promise.all([first.close(), second.close()])
})
