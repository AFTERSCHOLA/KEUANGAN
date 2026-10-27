import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// M-F5 — show/hide password toggles.
// LoginPage: eye toggle flips type without clearing the value.
// MustChange page: all three password fields have independent toggles.
// ============================================================

const APP = 'http://localhost:5173'

test('M-F5: password visibility toggles preserve values', async ({ page, pageErrors }) => {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Login form (unauthenticated landing).
  const passwordInput = page.locator('#password')
  await expect(passwordInput).toHaveAttribute('type', 'password')
  // RED before fix: no toggle button exists.
  const toggle = page.getByLabel('Tampilkan kata sandi')
  await expect(toggle).toHaveCount(1)
  await passwordInput.fill('Rahasia123!')
  await toggle.click()
  await expect(passwordInput).toHaveAttribute('type', 'text')
  await expect(page.getByLabel('Sembunyikan kata sandi')).toHaveCount(1)
  await expect(passwordInput).toHaveValue('Rahasia123!')
  await page.getByLabel('Sembunyikan kata sandi').click()
  await expect(passwordInput).toHaveAttribute('type', 'password')
  await expect(passwordInput).toHaveValue('Rahasia123!')

  // Must-change form: three independent toggles.
  await loginViaApi(page, 'trainer', {
    credentials: { username: 'trainer.must@test.local', password: 'MustChange123!X' },
  })
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('heading', { name: 'Ubah Kata Sandi' })).toBeVisible()
  await expect(page.getByLabel('Tampilkan kata sandi')).toHaveCount(3)
  const newInput = page.locator('#newPassword')
  await newInput.fill('BaruKataSandi1')
  await page.getByLabel('Tampilkan kata sandi').nth(1).click()
  await expect(newInput).toHaveAttribute('type', 'text')
  await expect(newInput).toHaveValue('BaruKataSandi1')
  await expect(page.locator('#currentPassword')).toHaveAttribute('type', 'password')

  expect(pageErrors).toHaveLength(0)
})
