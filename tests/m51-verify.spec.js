import { test, expect } from './fixtures.js'

test('M5.1.1: role picker blocks boot, persists across refresh', async ({ page, pageErrors }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__m51_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__m51_reset_done', '1')
  })
  await page.goto('http://localhost:5173')
  await page.waitForLoadState('domcontentloaded')

  // Modal blocks: role-picker heading visible, dashboard NOT rendered.
  await expect(page.getByText('Pilih Peran Masuk')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Overview' })).toHaveCount(0)

  // Select Admin -> Masuk -> dashboard appears.
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible()
  await expect(page.getByText('Pilih Peran Masuk')).toHaveCount(0)

  // UI state persisted.
  const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_ui')))
  expect(ui.role).toBe('admin')
  expect(ui.trainerId).toBe(null)

  // Refresh -> still logged in, no picker.
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible()
  await expect(page.getByText('Pilih Peran Masuk')).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})
