// Temporary ad-hoc probe (REMOVE after passing): logout via Akun menu + login roundtrip.
import { test, expect, loginViaApi } from './fixtures.js'

test('probe: akun-menu logout then UI login', async ({ page, pageErrors }) => {
  test.setTimeout(90000)
  await loginViaApi(page, 'superadmin')
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Data Cabang' })).toBeVisible({ timeout: 20000 })
  await page.getByLabel('Akun').first().click()
  const keluar = page.getByRole('menuitem', { name: 'Keluar' })
  await keluar.waitFor({ timeout: 10000 })
  await keluar.click()
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeVisible({ timeout: 15000 })
  console.log('## PROBE logout ok')
  await page.getByLabel('Username').fill('superadmin@test.local')
  await page.getByLabel('Password').fill('SuperTest123!X')
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Data Cabang' })).toBeVisible({ timeout: 20000 })
  console.log('## PROBE relogin ok, pageErrors:', JSON.stringify(pageErrors))
})
