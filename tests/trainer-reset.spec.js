import { test, expect, loginViaApi, loginAndPrime, primeCsrf } from './fixtures.js'
import { request as playwrightRequest } from '@playwright/test'

// ============================================================
// M-F2 — Admin Cabang resets a Trainer password from Data Trainer.
// 1. admin_cabang creates a trainer WITH login account (API, own branch).
// 2. On the trainer card, `Reset Kata Sandi` returns a temp password in
//    the same one-time dialog idiom as creation (`Saya sudah catat`).
// 3. The temp password logs in and forces `Ubah Kata Sandi`
//    (mustChangePassword=1, server-set).
// ============================================================

const APP = 'http://localhost:5173'

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M-F2: admin_cabang resets trainer password from the trainer card', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const username = `reset.t-${suffix}`
  const nama = `Sim Reset Trainer ${suffix}`

  const csrf = await loginAndPrime(page, 'adminCabang')

  // Seed: trainer WITH login account in the admin's own branch.
  const created = await page.request.post('/api/users.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'create',
      role: 'trainer',
      username,
      displayName: nama,
      trainer: { nama, wa: '08123456789', honor: 50000, sekolahIds: [] },
    },
  })
  expect(created.ok()).toBeTruthy()
  const createdBody = await created.json()
  const trainerId = createdBody?.trainer?.id
  expect(trainerId).toBeTruthy()

  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Trainer')
  await expect(page.getByText(nama).first()).toBeVisible()

  // RED before fix: no `Reset Kata Sandi` affordance exists on the card.
  const card = page.locator('div.bg-white', { has: page.getByRole('heading', { name: nama }) }).first()
  await card.getByRole('button', { name: 'Reset Kata Sandi' }).click()

  // One-time dialog shows the temp password (existing idiom).
  await expect(page.getByText('Kata Sandi Sementara')).toBeVisible()
  const tempPassword = await page
    .locator('div:has(> label:text("Kata Sandi Sementara")) input')
    .inputValue()
  expect(tempPassword.length).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Saya sudah catat, tutup' }).click()

  // The temp password authenticates and forces the change-password page.
  // Isolated context: page.request keeps the admin session for cleanup.
  const api = await playwrightRequest.newContext({ baseURL: 'http://localhost:5173' })
  const loginRes = await api.post('/api/auth/login.php', {
    data: { username, password: tempPassword },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(loginRes.status()).toBe(200)
  const trainerUser = (await loginRes.json()).user
  expect(trainerUser.mustChangePassword).toBe(true)
  // App.jsx gates the dashboard on user.mustChangePassword, so the flag
  // on the login response IS the forced-change proof (no page assert:
  // the page context still holds the admin session).
  await api.dispose()

  // Cleanup (best-effort): remove the trainer as admin_cabang.
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  const csrf2 = await primeCsrf(page)
  await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf2 },
    data: { action: 'delete', id: trainerId },
  })

  expect(pageErrors).toHaveLength(0)
})
