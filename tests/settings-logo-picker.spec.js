import { test, expect, loginViaApi } from './fixtures.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP = 'http://localhost:5173'

// A2.5-LOGO — Settings.logo: file picker (F-19)
test('A2.5: Settings Logo — upload updates header logo, survives refresh', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Open Settings via the account menu.
  await page.getByRole('button', { name: 'Akun', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Pengaturan' }).click()

  await expect(page.getByText('Logo (Unggah)')).toBeVisible()
  const fileInput = page.locator('input[type="file"]').first()
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'test-image.png'))

  await expect(page.locator('img[alt="Logo (Unggah)"]')).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Simpan', exact: true }).first().click()

  // Header's SidebarLogo should now render the uploaded image instead
  // of the default SVG placeholder.
  await expect(page.locator('aside img[alt="Logo"]')).toBeVisible({ timeout: 10000 })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('aside img[alt="Logo"]')).toBeVisible({ timeout: 10000 })

  expect(pageErrors).toHaveLength(0)
})