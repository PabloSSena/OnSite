import { test, expect } from '@playwright/test'
import { closeMenu, openMenu } from './helpers'

test('joined HUD starts collapsed, keeps controls mounted, and has no header or world labels', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  await page.goto('/')
  await page.getByLabel('What should we call you?').fill('HUD tester')
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(page.locator('.presence')).toContainText('Live', { timeout: 20000 })

  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('header, .brand-dot, .subtitle')).toHaveCount(0)
  await expect(page.locator('.presence')).toHaveCount(1)
  await expect(page.locator('.presence')).toBeHidden()
  await expect(page.getByRole('button', { name: 'First-person view', includeHidden: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Leave', exact: true, includeHidden: true })).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
  for (const text of [
    'THE STUDIO', 'IDEA ROOM', 'LIVING ROOM', 'THE KITCHEN', 'THE COMMONS', 'THE GARDEN',
    'Make something good', 'Big plans, small team', 'Take a little break',
    'Coffee & company', 'A little house for big ideas', 'Room to breathe',
  ]) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0)
  }
  await page.screenshot({ path: testInfo.outputPath('collapsed-hud.png') })

  await openMenu(page)
  await expect(page.locator('.presence')).toBeVisible()
  const firstPerson = page.getByRole('button', { name: 'First-person view' })
  await expect(firstPerson).toHaveAttribute('aria-pressed', 'true')
  await firstPerson.click()
  await expect(firstPerson).toHaveAttribute('aria-pressed', 'false')
  for (const name of ['Leave', 'Join voice', 'Turn camera on']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }
  // Closing the menu hides controls instead of throwing away their state.
  await page.locator('.presence').evaluate(element => element.setAttribute('data-menu-probe', 'retained'))
  await closeMenu(page)
  await expect(page.locator('.presence')).toHaveAttribute('data-menu-probe', 'retained')
  await expect(page.locator('.presence')).toBeHidden()
  await openMenu(page)
  await expect(firstPerson).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.presence')).toHaveAttribute('data-menu-probe', 'retained')
  await page.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Join the office' })).toBeVisible()
  await page.getByRole('button', { name: 'Join the office' }).click()
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
})
