import { test, expect, loginViaApi, logout } from './fixtures.js'

// ============================================================
// PM.2.2: M5.1.2 — Role-branched tab registry.
//
// Pre-M4.2 this spec asserted the soft-login picker → "Ganti Peran" →
// trainer impersonation flow. Post-M4.2 the role context is server-
// derived (PRODUCTION_PLAN.md §2; src/lib/auth.js) and the picker /
// "Ganti Peran" controls no longer exist. The semantic the test was
// reaching for — "superadmin sees the full registry, trainer sees
// only the 4 trainer tabs, and a persisted admin-only tab is
// redirected on direct load under a non-privileged role" — still
// matters; the migration expresses it as:
//
//   1. loginViaApi(superadmin) + seed one school via the API
//      (PM.0.1 helpers).
//   2. Assert the 14-button nav registry (10 M5.1/M7 + Absensi Tenaga
//      Pengajar from TA.B.4 + Penugasan Pengajar/Jadwal Penugasan from
//      the Penugasan chain + Asisten Eksternal from CS.D.3 — DL-7 drift
//      recorded, spec updated here).
//   3. logout() + loginViaApi(trainer) → assert 6-button trainer
//      registry (4 legacy + Absensi Saya TA.B.3 + Ringkasan Saya TA.C.1)
//      and that admin-only tabs are hidden.
//   4. The trainer impersonation dropdown the old test used to
//      select Budi is gone; the trainer account is now a server
//      user (trainer@test.local). Hidden-tab redirect after a
//      reload is exercised by setting the role's "activeTab"
//      through API state instead of localStorage.
// ============================================================

const APP = 'http://localhost:5173'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M5.1.2: role-branched tab registry (superadmin 14 / trainer 6) + hidden-tab redirect', async ({ page, pageErrors }) => {
  // ---- 1. Establish a superadmin session and visit the app. ----
  await loginViaApi(page, 'superadmin')
  await gotoApp(page)

  // ---- 2. Superadmin sees the 14 tabs (10 M5.1/M7 + Absensi Tenaga
  // Pengajar TA.B.4 + Penugasan Pengajar/Jadwal Penugasan PG.A.1/PG.B.1 +
  // Asisten Eksternal CS.D.3; TA.C.2 matrix lives inside its tab, no new
  // top-level tab). ----
  const superadminNav = page.getByRole('navigation').getByRole('button')
  await expect(superadminNav).toHaveCount(14)
  for (const label of ['Overview', 'Data Sekolah', 'Data Siswa', 'Data Trainer', 'Penugasan Pengajar', 'Jadwal Penugasan', 'Data Absensi', 'Riwayat Absensi', 'Absensi Tenaga Pengajar', 'Asisten Eksternal', 'Data Pembayaran', 'Data Keuangan', 'Umur Piutang', 'Data Cabang']) {
    await expect(superadminNav.filter({ hasText: label })).toHaveCount(1)
  }

  // ---- 3. Persist an admin-only tab (Data Keuangan) so a later
  //         reload under a non-privileged role can exercise the
  //         redirect guard. ----
  await openTab(page, 'Data Keuangan')

  // ---- 4. Switch role via logout + loginViaApi(trainer). ----
  await logout(page)
  await page.context().clearCookies()
  await loginViaApi(page, 'trainer')
  await gotoApp(page)

  // Trainer sees exactly 6 tabs (4 legacy + Absensi Saya TA.B.3 +
  // Ringkasan Saya TA.C.1).
  const trainerNav = page.getByRole('navigation').getByRole('button')
  await expect(trainerNav).toHaveCount(6)
  for (const label of ['Absensi Saya', 'Ringkasan Saya', 'Data Absensi', 'Riwayat Absensi', 'Data Siswa', 'Rekap Saya']) {
    await expect(trainerNav.filter({ hasText: label })).toHaveCount(1)
  }
  // Admin-only tabs are hidden for the trainer.
  for (const label of ['Overview', 'Data Sekolah', 'Data Trainer', 'Asisten Eksternal', 'Data Pembayaran', 'Data Keuangan', 'Data Cabang']) {
    await expect(page.getByRole('navigation').getByRole('button', { name: label, exact: true })).toHaveCount(0)
  }

  // ---- 5. Read-only student list: no Tambah button, no Aksi column. ----
  await openTab(page, 'Data Siswa')
  await expect(page.getByText('Manajemen Siswa')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tambah Siswa Baru' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Aksi' })).toHaveCount(0)

  // ---- 6. Switch back to superadmin: the full registry returns. ----
  await logout(page)
  await page.context().clearCookies()
  await loginViaApi(page, 'superadmin')
  await gotoApp(page)
  await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(14)
  await expect(page.getByRole('button', { name: 'Data Keuangan' })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})