import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

// Run against the isolated preview server, not the multiplayer game.
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.OFFICE_URL ?? 'http://127.0.0.1:8197'}/avatar-concepts.html`)
  await page.locator('canvas').last().waitFor()
  assert.equal(await page.locator('canvas').count(), 6)
  for (const name of ['Front', 'Side', 'Back', '¾']) {
    const button = page.getByRole('button', { name, exact: true })
    await button.click()
    assert.equal(await button.getAttribute('aria-pressed'), 'true')
  }
  const canvas = page.locator('canvas').first()
  const still = await canvas.screenshot()
  await page.getByRole('button', { name: 'Walk', exact: true }).click()
  assert.notDeepEqual(await canvas.screenshot(), still)
  await page.getByRole('button', { name: 'Still', exact: true }).click()
  const sage = await canvas.screenshot()
  await page.getByRole('button', { name: 'Blue', exact: true }).click()
  assert.notDeepEqual(await canvas.screenshot(), sage)
  const face = await canvas.screenshot()
  await page.getByLabel('Little face').uncheck()
  assert.notDeepEqual(await canvas.screenshot(), face)
  await page.getByLabel('Little face').check()
  await page.getByRole('button', { name: 'Choose Tiny flippers', exact: true }).click()
  await page.getByText('Your pick: 02 / Tiny flippers').waitFor()
  assert.equal(await page.locator('.card.selected').count(), 1)
  await canvas.focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('#views [aria-pressed="true"]').count(), 0)
  const bounds = await canvas.boundingBox()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 + 35, bounds.y + bounds.height / 2)
  await page.mouse.up()
  await page.getByRole('button', { name: '¾', exact: true }).click()
  if (process.env.PREVIEW_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.PREVIEW_SCREENSHOT_DIR}/avatar-concepts-desktop.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  if (process.env.PREVIEW_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.PREVIEW_SCREENSHOT_DIR}/avatar-concepts-mobile.png`, fullPage: true })
  }
  assert.deepEqual(errors, [])
  console.log('PASS: six previews, camera presets, walk rendering, colors, face toggle, selection, keyboard/drag rotation, mobile overflow, no browser errors.')
} finally {
  await browser.close()
}
