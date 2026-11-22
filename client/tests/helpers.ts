import { expect, type Page } from '@playwright/test'

export async function openMenu(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(menu).toHaveAttribute('aria-expanded', /^(true|false)$/)
  if (await menu.getAttribute('aria-expanded') === 'false') await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
}

export async function closeMenu(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(menu).toHaveAttribute('aria-expanded', /^(true|false)$/)
  if (await menu.getAttribute('aria-expanded') === 'true') await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
}
