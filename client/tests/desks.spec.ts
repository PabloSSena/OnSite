import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { closeMenu, openMenu, walkUntilSent } from './helpers'

type DeskStyle = { top: string; plate: string; wallpaperURL: string }
type DeskMessage = { desks: { id: number; ownerName: string; online: boolean; style: DeskStyle | null; notes: { text: string }[] }[]; mine: number | null }

// The meeting-room desk nearest the doorway, at x 5, z -12.
const DESK = 6
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const WALLPAPER = 'https://images.example.test/wall.png'
const BLOCKED = 'https://blocked.example.test/wall.png'

// Fake image hosts: one allows embedding (CORS), one does not. No real network.
async function imageHosts(context: BrowserContext) {
  await context.route('https://images.example.test/**', route => route.fulfill({
    status: 200, contentType: 'image/png', body: PNG, headers: { 'Access-Control-Allow-Origin': '*' },
  }))
  // Playwright-fulfilled responses skip the browser's CORS check, so a refused
  // load stands in for a host without Access-Control-Allow-Origin (same error path).
  await context.route('https://blocked.example.test/**', route => route.abort('accessdenied'))
  await context.route('https://media.tenor.com/**', route => route.fulfill({
    status: 200, contentType: 'image/gif',
    body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
  }))
}

async function join(page: Page, name: string) {
  const state = { desks: null as DeskMessage | null, moves: [] as number[] }
  page.on('websocket', ws => ws.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'desks') state.desks = message
  }))
  page.on('websocket', ws => ws.on('framesent', frame => {
    const message = JSON.parse(frame.payload.toString())
    if (message.type === 'move') state.moves.push(message.z)
  }))
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live')
  await expect.poll(() => state.desks?.desks.length).toBe(10)
  return state
}

// Up the hallway, then through the meeting-room doorway to stand beside the desk's chair
// (within the 1.3 sitting range of its seat at x 5, z -10.9).
// At the initial yaw, W and D move along -z and +x in both camera modes.
async function walkToDesk(page: Page, firstPerson: boolean) {
  await openMenu(page)
  const toggle = page.getByRole('button', { name: 'First-person view' })
  if ((await toggle.getAttribute('aria-pressed') === 'true') !== firstPerson) await toggle.click()
  await closeMenu(page)
  await page.locator('canvas').click({ position: { x: 480, y: 120 } })
  if (firstPerson) await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS')
  await walkUntilSent(page, 'KeyW', 'z', '<=', -10.5)
  await walkUntilSent(page, 'KeyD', 'x', '>=', 4)
}

test('claim and customize a desk in first person, then visit it, with notes and a persistent claim', async ({ browser }) => {
  test.setTimeout(480000)
  const ownerContext = await browser.newContext()
  const visitorContext = await browser.newContext()
  await imageHosts(ownerContext)
  await imageHosts(visitorContext)
  const owner = await ownerContext.newPage()
  const visitor = await visitorContext.newPage()
  const errors: string[] = []
  for (const page of [owner, visitor]) page.on('pageerror', error => errors.push(error.message))

  const a = await join(owner, 'Desk owner')
  expect(a.desks!.desks[DESK].style, 'the test desk must start free').toBeNull()
  await walkToDesk(owner, true)
  await expect(owner.getByRole('button', { name: 'My desk' })).toHaveCount(0)
  // Using a desk is sitting at it: E sits, and a desk chair opens the desk's side panel.
  // The player stays in first person, looking at the desk.
  await expect(owner.locator('.seat-hint')).toHaveText('Press E to sit and claim this desk')
  await owner.keyboard.press('KeyE')
  const free = owner.getByRole('dialog', { name: 'Free desk' })
  await expect(free).toBeVisible()
  await free.getByRole('button', { name: 'Claim this desk' }).click()
  await expect.poll(() => a.desks?.mine).toBe(DESK)
  const editor = owner.getByRole('dialog', { name: 'Customize your desk' })
  await expect(editor).toBeVisible()
  await expect.poll(() => owner.evaluate(() => document.pointerLockElement)).toBeNull()
  await editor.getByRole('button', { name: 'Desktop: Walnut' }).click()
  await editor.getByLabel('Name plate').fill('Owner 🌵')
  await editor.getByLabel('Back left').selectOption('lavalamp')
  // A host that blocks embedding is caught before anything is shared.
  await editor.getByLabel('Wallpaper image link').fill(BLOCKED)
  await editor.getByRole('button', { name: 'Apply' }).click()
  await expect(editor.getByRole('alert')).toContainText("doesn't allow embedding")
  await editor.getByLabel('Wallpaper image link').fill(WALLPAPER)
  await editor.getByRole('button', { name: 'Apply' }).click()
  await expect(editor.getByText('Wallpaper applied.')).toBeVisible()
  await expect.poll(() => a.desks?.desks[DESK].style?.wallpaperURL).toBe(WALLPAPER)
  await editor.getByLabel('Poster GIF').fill('https://media.tenor.com/test/desk.gif')
  await editor.getByRole('button', { name: 'Pin' }).click()
  await owner.screenshot({ path: 'test-results/desk-first-person-editor.png' })
  await owner.keyboard.press('Escape')
  await expect(editor).toBeHidden()

  const b = await join(visitor, 'Desk visitor')
  await expect.poll(() => b.desks?.desks[DESK].style).toMatchObject({ top: 'walnut', plate: 'Owner 🌵', wallpaperURL: WALLPAPER })
  expect(b.desks!.desks[DESK]).toMatchObject({ ownerName: 'Desk owner', online: true })
  expect(b.desks!.mine).toBeNull()
  // Software WebGL is slow: render one scene at a time. Leaving also turns the light offline.
  await owner.goto('about:blank')
  await expect.poll(() => b.desks?.desks[DESK].online).toBe(false)

  // Third person (the secondary mode): the visitor cannot claim it, but can leave a note.
  await walkToDesk(visitor, false)
  await expect(visitor.locator('.seat-hint')).toHaveText("Press E to sit at Desk owner's desk")
  await visitor.keyboard.press('KeyE')
  const visit = visitor.getByRole('dialog', { name: 'Desk notes' })
  await expect(visit).toBeVisible()
  // Seated with the panel open: movement keys do nothing.
  const sent = b.moves
  const before = sent.length
  await visitor.keyboard.down('KeyS')
  await expect.poll(() => sent.length - before).toBeGreaterThan(5)
  await visitor.keyboard.up('KeyS')
  const frozen = sent.slice(before)
  expect(Math.max(...frozen) - Math.min(...frozen)).toBeLessThan(0.001)
  await visit.getByLabel('Leave a sticky note').fill('Coffee at 3? ☕')
  await visit.getByRole('button', { name: 'Stick it' }).click()
  await expect(visit.getByText('Coffee at 3? ☕')).toBeVisible()
  await expect(visit.getByRole('button', { name: 'Remove note from Desk visitor' })).toBeVisible()
  await visit.getByRole('button', { name: 'Close desk panel' }).click()
  // Closing the panel keeps you seated; E then stands up.
  await expect(visitor.locator('.seat-hint')).toHaveText('Press E to stand up')
  await visitor.screenshot({ path: 'test-results/desk-visit.png' })
  await visitor.keyboard.press('KeyE')
  await expect(visitor.locator('.seat-hint')).toHaveText("Press E to sit at Desk owner's desk")
  await visitor.goto('about:blank')

  // Coming back keeps the claim through the browser's token; the note is waiting.
  const again = await join(owner, 'Desk owner')
  await expect.poll(() => again.desks?.mine).toBe(DESK)
  expect(again.desks!.desks[DESK]).toMatchObject({ online: true, notes: [{ text: 'Coffee at 3? ☕' }] })
  await walkToDesk(owner, true)
  await owner.screenshot({ path: 'test-results/desk-first-person.png' })
  await owner.keyboard.press('KeyE')
  const reopened = owner.getByRole('dialog', { name: 'Customize your desk' })
  await expect(reopened.getByLabel('Name plate')).toHaveValue('Owner 🌵')
  await expect(reopened.getByLabel('Wallpaper image link')).toHaveValue(WALLPAPER)
  await owner.screenshot({ path: 'test-results/desk-first-person-notes.png' })
  await reopened.getByRole('button', { name: 'Remove note from Desk visitor' }).click()
  await expect.poll(() => again.desks?.desks[DESK].notes.length).toBe(0)
  await reopened.getByRole('button', { name: 'Release desk' }).click()
  await reopened.getByRole('button', { name: 'Yes, release my desk' }).click()
  await expect.poll(() => again.desks?.desks[DESK].style).toBeNull()
  // Still seated: the panel turns back into the free-desk view.
  await expect(owner.getByRole('dialog', { name: 'Free desk' }).getByRole('button', { name: 'Claim this desk' })).toBeVisible()
  expect(errors).toEqual([])
})
