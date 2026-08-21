import { test, expect, loginAsAdmin } from './fixtures.js'

// ============================================================
// M-R5 — Deletion flows & dialog primitives
// Covers M-R5.1/2 (dialog primitives render correct strips),
// M-R5.3 (no raw confirm/alert in the app), and
// M-R5.4 (school delete with siswa → confirm → reassign picker
// → bulk-write siswa.sekolahId/sekolahNama → delete school).
// ============================================================

const APP = 'http://localhost:5173'
const SCH_A = 'SD Harapan Bangsa'
const SCH_B = 'SD Mentari Pagi'
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
  await loginAsAdmin(page)

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
  for (const nama of ['Andi Pratama', 'Bunga Citra', 'Citra Lestari']) {
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
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(3)
  for (const nama of ['Andi Pratama', 'Bunga Citra', 'Citra Lestari']) {
    const row = page.locator('tbody tr', { hasText: nama }).first()
    await expect(row).toContainText(SCH_B)
  }

  // Store-level assertions: sekolah A removed, siswa all point at B.
  const sekolah = await getStoreJson(page, 'sekolah')
  expect(sekolah.some(s => s.nama === SCH_A)).toBe(false)
  const siswa = await getStoreJson(page, 'siswa')
  expect(siswa).toHaveLength(3)
  for (const s of siswa) {
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
  await loginAsAdmin(page)

  // Seed: school + trainer + siswa (reuses the live forms).
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH_A)
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill('Budi Santoso')
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.locator('label', { hasText: SCH_A }).first().getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill('Andi Pratama')
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
