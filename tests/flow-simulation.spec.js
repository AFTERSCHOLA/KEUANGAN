import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// FLOW SIMULATION — multi-role auth smoke test
//
// M-AF1.2 migration: the original flow-simulation spec exercised a
// soft-login role picker (admin/trainer selector + role-switcher
// button) that was removed in M-AUTH.5. This version uses the
// production loginViaApi() helper for both phases and never
// references the deleted buttons.
//
// Original test's deeper purpose — driving the Trainer day + Head
// Trainer month-end flow against M5.2 / M5.3 / M6.1 features —
// depends on scope-expansion work that is NOT in the audit-followup
// scope. The previous M5.x / M6.1 assertions have been retired; the
// M-AF1.2 contract is only "authenticate via the production API
// helper, never reference the deleted buttons, zero page errors".
// The deeper multi-role flow remains a separate future work item
// (see MULTI_ACCOUNT_SYNC.md and SCOPE_EXPANSION_PLAN.md).
// ============================================================

const APP = 'http://localhost:5173'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__flow_sim_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__flow_sim_reset_done', '1')
  })
}

test('flow simulation: superadmin reaches the dashboard via loginViaApi', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByRole('button', { name: 'Data Sekolah', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Data Trainer', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Data Siswa', exact: true })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})

test('flow simulation: trainer reaches the dashboard via loginViaApi', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Trainer landing is the 4-tab reduced surface, not the full admin nav.
  const nav = page.getByRole('navigation').getByRole('button')
  await expect(nav).toHaveCount(4)

  expect(pageErrors).toHaveLength(0)
})
