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
//
// TA.B.3 update: trainer nav grew from 4 to 5 tabs with the addition
// of "Absensi Saya" (absensiPengajar — TRAINER_ATTENDANCE_PLAN.md
// D-TA7, TRAINER_ATTENDANCE_MILESTONES.md TA.B.3). This is an
// intentional scope change to the M5.1.2 "4 tabs" contract, not a
// regression — see TRAINER_ATTENDANCE_MILESTONES.md Gate TA.B.
//
// TA.C.1 update: trainer nav grew from 5 to 6 tabs with "Ringkasan
// Saya" (personal absensiPengajar summary — D-TA13, TA.C.1). Same
// intentional scope change, not a regression.
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

  // Trainer landing is the 6-tab reduced surface (Absensi Saya,
  // Ringkasan Saya, Data Absensi, Riwayat Absensi, Data Siswa, Rekap
  // Saya), not the full admin nav. Was 4 before TA.B.3 added "Absensi
  // Saya", 5 before TA.C.1 added "Ringkasan Saya" (absensiPengajar) —
  // see header note.
  const nav = page.getByRole('navigation').getByRole('button')
  await expect(nav).toHaveCount(6)
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Ringkasan Saya', exact: true })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})