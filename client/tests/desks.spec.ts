import { test, expect, type Page } from '@playwright/test'
import { closeMenu, openMenu, walkUntilSent } from './helpers'

type DeskMessage = { desks: { id: number; ownerName: string; online: boolean; style: { top: string; plate: string } | null; notes: { text: string }[] }[]; mine: number | null }

// The meeting-room desk nearest the doorway, at x 5, z -12.
const DESK = 6

async function join(page: Page, name: string) {
  const state = { position: { x: 0, z: 6 }, desks: null as DeskMessage | null }
  page.on('websocket', ws => ws.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'snapshot') {
      const me = message.players.find((p: { name: string }) => p.name === name)
      if (me) state.position = me
    }
    if (message.type === 'desks') state.desks = message
  }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live')
  await expect.poll(() => state.desks?.desks.length).toBe(10)
  return state
}

async function walkToDesk(page: Page) {
  await openMenu(page)
  const firstPerson = page.getByRole('button', { name: 'First-person view' })
  if (await firstPerson.getAttribute('aria-pressed') === 'true') await firstPerson.click()
  await closeMenu(page)
  await page.locator('canvas').click({ position: { x: 480, y: 120 } })
  // Up the hallway, then through the meeting-room doorway to stand behind the desk's chair.
  await walkUntilSent(page, 'KeyW', 'z', '<=', -10.5)
  await walkUntilSent(page, 'KeyD', 'x', '>=', 3.4)
}

test('claim, customize, and visit a desk, with notes and a persistent claim', async ({ browser }) => {
  test.setTimeout(480000)
  const owner = await (await browser.newContext()).newPage()
  const visitor = await (await browser.newContext()).newPage()
  const errors: string[] = []
  for (const page of [owner, visitor]) page.on('pageerror', error => errors.push(error.message))

  const a = await join(owner, 'Desk owner')
  expect(a.desks!.desks[DESK].style, 'the test desk must start free').toBeNull()
  await walkToDesk(owner)
  await expect(owner.locator('.desk-prompt')).toHaveText('Press E to claim this desk')
  await owner.keyboard.press('KeyE')
  await expect.poll(() => a.desks?.mine).toBe(DESK)
  await expect(owner.locator('.desk-prompt')).toHaveText('Press E to customize your desk')

  // The owner edits the desktop and name plate.
  await owner.keyboard.press('KeyE')
  const editor = owner.getByRole('dialog', { name: 'Customize your desk' })
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: 'Desktop: Walnut' }).click()
  await editor.getByLabel('Name plate').fill('Owner 🌵')
  await editor.getByLabel('Back left').selectOption('lavalamp')
  await editor.getByRole('button', { name: 'Close desk panel' }).click()

  const b = await join(visitor, 'Desk visitor')
  await expect.poll(() => b.desks?.desks[DESK].style).toMatchObject({ top: 'walnut', plate: 'Owner 🌵' })
  expect(b.desks!.desks[DESK]).toMatchObject({ ownerName: 'Desk owner', online: true })
  expect(b.desks!.mine).toBeNull()
  // Software WebGL is slow: render one scene at a time. Leaving also turns the light offline.
  await owner.goto('about:blank')
  await expect.poll(() => b.desks?.desks[DESK].online).toBe(false)

  // The visitor cannot claim it, but can leave a note.
  await walkToDesk(visitor)
  await expect(visitor.locator('.desk-prompt')).toHaveText("Press E to visit Desk owner's desk")
  await visitor.keyboard.press('KeyE')
  const visit = visitor.getByRole('dialog', { name: 'Desk notes' })
  await visit.getByLabel('Leave a sticky note').fill('Coffee at 3? ☕')
  await visit.getByRole('button', { name: 'Stick it' }).click()
  await expect(visit.getByText('Coffee at 3? ☕')).toBeVisible()
  await expect(visit.getByRole('button', { name: 'Remove note from Desk visitor' })).toBeVisible()
  await visit.getByRole('button', { name: 'Close desk panel' }).click()
  await expect(visitor.locator('.desk-notes')).toContainText('Coffee at 3?')
  await visitor.screenshot({ path: 'test-results/desk-visit.png' })

  await visitor.goto('about:blank')

  // Coming back keeps the claim through the browser's token.
  const again = await join(owner, 'Desk owner')
  await expect.poll(() => again.desks?.mine).toBe(DESK)
  expect(again.desks!.desks[DESK]).toMatchObject({ online: true, notes: [{ text: 'Coffee at 3? ☕' }] })
  await openMenu(owner)
  await owner.getByRole('button', { name: 'My desk' }).click()
  const reopened = owner.getByRole('dialog', { name: 'Customize your desk' })
  await expect(reopened.getByLabel('Name plate')).toHaveValue('Owner 🌵')
  await reopened.getByRole('button', { name: 'Remove note from Desk visitor' }).click()
  await expect.poll(() => again.desks?.desks[DESK].notes.length).toBe(0)
  await reopened.getByRole('button', { name: 'Release desk' }).click()
  await expect.poll(() => again.desks?.desks[DESK].style).toBeNull()
  await expect(reopened).toBeHidden()
  expect(errors).toEqual([])
})
