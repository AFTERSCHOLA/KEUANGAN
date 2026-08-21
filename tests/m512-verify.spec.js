import { test, expect } from './fixtures.js'

// ============================================================
// M5.1.2 — Role-branched tab registry.
// Superadmin sees the full admin registry; Admin sees operational tabs;
// Trainer sees 4 (Absensi, Riwayat, Siswa read-only, Rekap Saya).
// Switching role hides/shows the correct
// tabs; a persisted admin-only tab under the trainer role is
// redirected to the trainer dashboard (rekap).
// ============================================================

const APP = 'http://localhost:5173'
const SCH = 'SD Harapan Bangsa'
const SPP = 100000
const TRAINER = 'Budi Santoso'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__m512_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__m512_reset_done', '1')
  })
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M5.1.2: role-branched tab registry (admin 8 / trainer 4) + hidden-tab redirect', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await gotoApp(page)

  // ---- Seed: one school + one trainer via the real forms (admin). ----
  await page.getByRole('button', { name: 'Pilih peran Superadmin' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()

  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH)
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.locator('label', { hasText: SCH }).first().getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // ---- Admin sees the 8 M5.1 tabs plus later milestone tabs. ----
  const adminNav = page.getByRole('navigation').getByRole('button')
  await expect(adminNav).toHaveCount(10)
  for (const label of ['Overview', 'Data Sekolah', 'Data Siswa', 'Data Trainer', 'Data Absensi', 'Riwayat Absensi', 'Data Pembayaran', 'Data Keuangan']) {
    await expect(adminNav.filter({ hasText: label })).toHaveCount(1)
  }

  // ---- Persist an admin-only tab, then switch role via Ganti Peran. ----
  await openTab(page, 'Data Keuangan')
  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await expect(page.getByText('Pilih Peran Masuk')).toBeVisible()

  // ---- Login as trainer. ----
  await page.getByRole('button', { name: 'Pilih peran Trainer' }).click()
  await page.locator('select').first().selectOption({ label: TRAINER })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()

  // Trainer sees exactly 4 tabs: Absensi, Riwayat, Siswa, Rekap Saya.
  const trainerNav = page.getByRole('navigation').getByRole('button')
  await expect(trainerNav).toHaveCount(4)
  for (const label of ['Data Absensi', 'Riwayat Absensi', 'Data Siswa', 'Rekap Saya']) {
    await expect(trainerNav.filter({ hasText: label })).toHaveCount(1)
  }
  // Admin-only tabs are hidden for the trainer.
  for (const label of ['Overview', 'Data Sekolah', 'Data Trainer', 'Data Pembayaran', 'Data Keuangan']) {
    await expect(page.getByRole('navigation').getByRole('button', { name: label, exact: true })).toHaveCount(0)
  }
  // Role persisted with trainerId.
  const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_ui')))
  expect(ui.role).toBe('trainer')
  expect(ui.trainerId).toBeTruthy()

  // ---- Read-only student list: no Tambah button, no Aksi column. ----
  await openTab(page, 'Data Siswa')
  await expect(page.getByText('Manajemen Siswa')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tambah Siswa Baru' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Aksi' })).toHaveCount(0)

  // ---- Direct-load redirect: force an admin-only activeTab, reload. ----
  await page.evaluate(() => {
    const ui = JSON.parse(localStorage.getItem('afterschola_v4_ui'))
    ui.activeTab = 'keuangan'
    localStorage.setItem('afterschola_v4_ui', JSON.stringify(ui))
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  // Redirected to the trainer dashboard (rekap), not to Data Keuangan.
  await expect(page.locator('main').getByRole('heading', { name: 'Rekap Saya' })).toBeVisible()
  await expect(page.getByText('Data Keuangan')).toHaveCount(0)

  // ---- Switch back to admin: the full current registry returns. ----
  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await page.getByRole('button', { name: 'Pilih peran Superadmin' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(10)
  await expect(page.getByRole('button', { name: 'Data Keuangan' })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})
