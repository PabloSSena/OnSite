import { test, expect } from '@playwright/test'
import { openMenu } from './helpers'
import { defaultAppearance, parseAppearance } from '../src/appearance'

test('appearance accepts only complete palette-based choices', () => {
  const appearance = defaultAppearance()
  expect(parseAppearance(appearance)).toEqual(appearance)
  expect(parseAppearance({ ...appearance, topColor: '#123456' })).toBeNull()
  expect(parseAppearance({ ...appearance, hair: 'unknown' })).toBeNull()
  expect(parseAppearance({ ...appearance, hat: 'unknown' })).toBeNull()
  expect(parseAppearance({ ...appearance, topColor: '#ffd43b' })).toBeNull()
  for (const hat of ['none', 'beanie', 'cap', 'engineer', 'cowboy', 'feather']) {
    const selected = { ...appearance, hat, hatColor: '#ffd43b' }
    expect(parseAppearance(selected)).toEqual(selected)
  }
  expect(parseAppearance({ ...appearance, backpack: 'false' })).toBeNull()
  expect(parseAppearance({ ...appearance, extra: true })).toBeNull()
  expect(parseAppearance(null)).toBeNull()
})

test('customization persists and live changes reach a second player', async ({ context }, testInfo) => {
  test.setTimeout(180000)
  const ana = await context.newPage()
  const bia = await context.newPage()
  const errors: string[] = []
  for (const page of [ana, bia]) page.on('pageerror', error => errors.push(error.message))
  await ana.goto('/')
  await ana.getByLabel('Top', { exact: true }).selectOption('hoodie')
  await ana.getByRole('button', { name: 'Top color: Rose', exact: true }).click()
  await ana.getByLabel('Hat', { exact: true }).selectOption('engineer')
  await expect(ana.getByRole('button', { name: 'Hat color: Safety yellow', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(ana.locator('.character-preview canvas')).toBeVisible()
  await ana.locator('.character-preview').screenshot({ path: testInfo.outputPath('engineer-preview.png') })
  await ana.getByLabel('Wear backpack').uncheck()
  await ana.reload()
  await expect(ana.getByLabel('Top', { exact: true })).toHaveValue('hoodie')
  await expect(ana.getByLabel('Hat', { exact: true })).toHaveValue('engineer')
  await expect(ana.getByLabel('Wear backpack')).not.toBeChecked()
  await expect(ana.locator('input[type=color]')).toHaveCount(0)
  let remote: { top?: string; hat?: string; hatColor?: string; face?: string; topColor?: string } = {}
  bia.on('websocket', ws => ws.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString())
    const player = message.players?.find((p: { name: string }) => p.name === 'Appearance Ana')
      ?? (message.player?.name === 'Appearance Ana' ? message.player : undefined)
    if (player) remote = player.appearance
  }))
  for (const [page, name] of [[ana, 'Appearance Ana'], [bia, 'Appearance Bia']] as const) {
    await page.goto('/')
    await page.getByLabel('What should we call you?').fill(name)
    await page.getByRole('button', { name: 'Join the office' }).click()
    await expect(page.locator('.presence')).toContainText('Live', { timeout: 30000 })
  }
  await expect.poll(() => remote.top).toBe('hoodie')
  await expect.poll(() => remote.topColor).toBe('#ff7c9a')
  await expect.poll(() => remote.hat).toBe('engineer')
  await expect.poll(() => remote.hatColor).toBe('#ffd43b')
  await openMenu(ana)
  await ana.getByRole('button', { name: 'Customize character', exact: true }).click()
  const dialog = ana.getByRole('dialog', { name: 'Customize character' })
  await dialog.getByLabel('Top', { exact: true }).selectOption('jacket')
  await dialog.getByLabel('Face', { exact: true }).selectOption('surprised')
  await expect.poll(() => remote.top).toBe('jacket')
  await expect.poll(() => remote.face).toBe('surprised')
  for (const hat of ['cowboy', 'feather', 'beanie', 'cap', 'none', 'engineer']) {
    await dialog.getByLabel('Hat', { exact: true }).selectOption(hat)
    await expect.poll(() => remote.hat).toBe(hat)
    if (hat === 'cowboy' || hat === 'feather') {
      await dialog.locator('.character-preview').screenshot({ path: testInfo.outputPath(`${hat}-preview.png`) })
    }
  }
  await dialog.getByRole('button', { name: 'Hat color: Sky', exact: true }).click()
  await expect.poll(() => remote.hatColor).toBe('#72baff')
  await dialog.getByRole('button', { name: 'Close customization' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(ana.locator('.presence')).toContainText('Live')
  expect(errors).toEqual([])
})
