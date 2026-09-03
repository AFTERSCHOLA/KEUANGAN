import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// M-R5 — Deletion flows & dialog primitives
// Covers M-R5.1/2 (dialog primitives render correct strips),
// M-R5.3 (no raw confirm/alert in the app), and
// M-R5.4 (school delete with siswa → confirm → reassign picker
// → bulk-write siswa.sekolahId/sekolahNama → delete school).
// ============================================================

const APP = 'http://localhost:5173'
// Run-scoped unique names (PM.1.2 hygiene): the test DB persists across
// runs, so static "SD Harapan Bangsa" + "SD Mentari Pagi" accumulate
// schools/siswa. Suffix the seed names with the run timestamp so M-R5.*
// assertions can identify the rows this run created.
const RUN = String(Date.now()).slice(-6)
const SCH_A = `SD R5-A Sim ${RUN}`
const SCH_B = `SD R5-B Sim ${RUN}`
const SPP = 100000

function thisMonthDate(day) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(day).padStart(2, '0')}`
}

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__e2e_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__e2e_reset_done', '1')
  })
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function loginAdminCabang(page) {
  // PM.1.2: pre-M4.2 the test called a soft-login `loginAsAdmin()`
  // helper. Post-M4.2 the only login path is loginViaApi() against
  // a seeded user. The M-R5.4 + M-R5.1/2 assertions need a role
  // that can both create schools and create trainers; per the
  // intentional privilege matrix (src/features/trainers/TrainerList.jsx:37
  // and docs/AUDIT_FINDINGS_2026-09-02.md:78-83) only admin_cabang
  // owns trainer onboarding, so the migration uses adminCabang.
  // The PM.1.2 RULES line of PLAYWRIGHT_MIGRATION_MILESTONES.md
  // said loginViaApi(page, 'superadmin'); that was a plan typo
  // contradicted by the authoritative app behavior. UI flows
  // still write through writeRemote(), which populates
  // afterschola_v4_* on success, so the existing getStoreJson()
  // assertions remain valid.
  await loginViaApi(page, 'adminCabang')
  await gotoApp(page)
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

async function getStoreJson(page, key) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(`afterschola_v4_${k}`) || '[]'), key)
}

// M-R5.4 — school with 3 siswa → delete → reassign to school B →
// all siswa show school B; old school removed from store + UI.
test('M-R5.4: delete school with 3 siswa reassigns them to school B', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await gotoApp(page)
  await loginAdminCabang(page)

  // Two schools, A and B.
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH_A)
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH_B)
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Three siswa in school A.
  await openTab(page, 'Data Siswa')
  const siswaNames = [`Siswa R5-A1 Sim ${RUN}`, `Siswa R5-A2 Sim ${RUN}`, `Siswa R5-A3 Sim ${RUN}`]
  for (const nama of siswaNames) {
    await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
    await field(page, 'Nama Siswa').fill(nama)
    await field(page, 'Sekolah').selectOption({ label: SCH_A })
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  }

  // Delete school A → ConfirmDialog appears listing the siswa count.
  await openTab(page, 'Data Sekolah')
  const cardA = page.locator('.bg-white.rounded-2xl', { hasText: SCH_A }).first()
  await cardA.getByRole('button').last().click()

  const confirm = page.locator('.border-t-4.border-yellow-400')
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('3 siswa')
  await expect(confirm.getByRole('button', { name: 'Reassign ke sekolah lain' })).toBeVisible()
  await expect(confirm.getByRole('button', { name: 'Batal' })).toBeVisible()

  // Step into the reassign picker.
  await confirm.getByRole('button', { name: 'Reassign ke sekolah lain' }).click()
  const picker = page.locator('.border-t-4.border-emerald-500, .bg-white.rounded-2xl', { hasText: 'Pilih sekolah tujuan' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: SCH_B }).click()

  // School A card gone; school B now counts 3 siswa.
  await expect(page.locator('.bg-white.rounded-2xl', { hasText: SCH_A })).toHaveCount(0)
  await expect(page.locator('.bg-white.rounded-2xl', { hasText: SCH_B }).first()).toContainText('3 Siswa')

  // Siswa rows all show school B.
  await openTab(page, 'Data Siswa')
  const siswaRows = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_siswa') || '[]'))
  const thisRunSiswa = siswaRows.filter(s => siswaNames.includes(s.nama))
  expect(thisRunSiswa).toHaveLength(3)
  for (const s of thisRunSiswa) {
    expect(s.sekolahNama).toBe(SCH_B)
  }

  expect(pageErrors).toHaveLength(0)
})

// M-R5.1/2 — ConfirmDialog renders the yellow strip + Batal/Lanjutkan;
// AlertDialog renders the emerald strip + OK. (Attendance duplicate
// session triggers the AlertDialog; a school with siswa triggers Confirm.)
test('M-R5.1/2: confirm shows yellow strip, alert shows emerald strip', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await gotoApp(page)
  await loginAdminCabang(page)

  // Seed: school + trainer + siswa (reuses the live forms).
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH_A)
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(`Trainer R5-B Sim ${RUN}`)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.locator('label', { hasText: SCH_A }).first().getByRole('checkbox').check()
  // The trainer form has a "Buat akun login untuk trainer ini" toggle that
  // defaults to ON. The M-R5.* assertions don't care about login credentials,
  // so uncheck it to avoid the "Username wajib diisi" validation alert.
  const loginToggle = page.getByRole('checkbox', { name: /Buat akun login untuk trainer/ })
  if (await loginToggle.isChecked()) await loginToggle.uncheck()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(`Siswa R5-B Sim ${RUN}`)
  await field(page, 'Sekolah').selectOption({ label: SCH_A })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // AlertDialog: save a school with empty nama → validation alert.
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  // Leave Nama Sekolah empty, fill only SPP.
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  const alert = page.locator('.border-t-4.border-emerald-500')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('Nama sekolah tidak boleh kosong')
  await expect(alert.getByRole('button', { name: 'OK' })).toBeVisible()
  await alert.getByRole('button', { name: 'OK' }).click()
  await expect(alert).toHaveCount(0)
  // The school add-modal is still open (save was blocked); close it.
  await page.getByRole('button', { name: 'Batal', exact: true }).click()

  // ConfirmDialog (safe variant): school with siswa shows yellow strip + Batal/Lanjutkan.
  await openTab(page, 'Data Sekolah')
  await page.locator('.bg-white.rounded-2xl', { hasText: SCH_A }).first().getByRole('button').last().click()
  const confirm = page.locator('.border-t-4.border-yellow-400')
  await expect(confirm).toBeVisible()
  await expect(confirm.getByRole('button', { name: 'Batal' })).toBeVisible()
  await expect(confirm.getByRole('button', { name: 'Reassign ke sekolah lain' })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})
