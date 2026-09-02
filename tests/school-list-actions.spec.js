import { test, expect, loginViaApi } from './fixtures.js'

const APP = 'http://localhost:5173'

test('school-list-actions: superadmin sees three icon actions per school card and Edit opens the edit modal', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Data Sekolah', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Data Sekolah', exact: true }).click()

  // Wait for at least one school card to render. The grid container is
  // sibling-after-the-header and is the only place that renders a card
  // whose photo area has an absolute-positioned action group on top-right.
  const card = page.locator('div.bg-white.rounded-2xl:has(div.absolute.top-2.right-2)').first()
  await expect(card).toBeVisible()

  // The card's action area should expose three icon buttons.
  const actions = card.locator('div.absolute.top-2.right-2 > button')
  await expect(actions).toHaveCount(3)

  // Edit button (the middle one) must have an SVG, a title, and an aria-label.
  const editBtn = card.getByRole('button', { name: 'Edit sekolah' })
  await expect(editBtn).toBeVisible()
  await expect(editBtn).toHaveAttribute('title', 'Edit')
  await expect(editBtn.locator('svg')).toHaveCount(1)

  // Click it and assert the edit modal opens with the right title.
  await editBtn.click()
  await expect(page.getByRole('heading', { name: 'Edit Sekolah' })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})