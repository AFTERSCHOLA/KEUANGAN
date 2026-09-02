import { test, expect, loginViaApi, TEST_USERS } from './fixtures.js'

// PM.2.1: pre-M4.2 this spec asserted the soft-login role-picker shape
// ("Pilih Peran Masuk" modal, picker → Masuk, role persisted in
// afterschola_v4_ui). Post-M4.2 there is no picker and the role no
// longer lives in localStorage (M1.2; src/lib/auth.js). The semantic
// the old test was reaching for — "a session survives a refresh" —
// still matters, so this spec now asserts the post-M4.2 equivalent:
// a session established via loginViaApi() survives a page reload
// (server-side cookie + CSRF stay valid), while an anonymous reload
// returns to the credential form. This is the same invariant
// auth-login-page.spec.js exercises from the credential form side;
// m51 covers it from the API-session side.

const APP = 'http://localhost:5173'

test('M5.1.1: loginViaApi session survives refresh; anonymous refresh returns to login', async ({ page, pageErrors }) => {
  // ---- 1. Establish a real session via loginViaApi (no UI). ----
  await loginViaApi(page, 'superadmin')

  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  // Dashboard rendered: superadmin sees Data Cabang.
  await expect(page.getByRole('button', { name: 'Data Cabang', exact: true })).toBeVisible()
  // The credential form MUST NOT be visible.
  await expect(page.getByLabel('Username')).toHaveCount(0)
  await expect(page.getByLabel('Password')).toHaveCount(0)

  // ---- 2. Refresh the page; session cookie + CSRF must survive. ----
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Data Cabang', exact: true })).toBeVisible()
  await expect(page.getByLabel('Username')).toHaveCount(0)

  // ---- 3. Log out via the sidebar's Keluar control. ----
  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page.getByLabel('Username')).toBeVisible()

  // ---- 4. Reload after logout — must stay on the credential form. ----
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByLabel('Username')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Data Cabang', exact: true })).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})
