import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// Slice 1 Raport — Data Siswa Tingkat/Mapel + Raport legs.
//
// S5 (Task 5): admin mengisi Tingkat + Mapel di Data Siswa →
// tersimpan server (reload → tetap); trainer read-only.
// S6/S7 (Task 6/7): legs RaportList/Form/cetak di-append di file
// ini (bukan file baru) oleh task berikutnya.
// ============================================================

const APP = 'http://localhost:5173'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__s5_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__s5_reset_done', '1')
  })
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

// Pola tests/siswa-row-button-anchor.spec.js: label tanpa htmlFor,
// jadi dicari lewat div pembungkus di dalam dialog.
function fieldInDialog(page, labelText) {
  return page.getByRole('dialog').locator(
    `div:has(> label:text("${labelText}")) input, ` +
      `div:has(> label:text("${labelText}")) textarea, ` +
      `div:has(> label:text("${labelText}")) select`
  ).first()
}

async function getStoreJson(page, key) {
  return page.evaluate(k => JSON.parse(localStorage.getItem(`afterschola_v4_${k}`) || '[]'), key)
}

async function waitForSiswaByName(page, nama) {
  await expect.poll(
    () => getStoreJson(page, 'siswa').then(arr => arr.some(r => r.nama === nama)),
    { message: `menunggu "${nama}" muncul di cache lokal (siswa) setelah writeRemote()`, timeout: 15000 }
  ).toBe(true)
}

test('S5.1: admin set Tingkat Beginner + Mapel Scratch 3 tersimpan dan bertahan setelah reload', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SIM_SCH_NAME = `SD S5 Sim ${SUFFIX}`
  const SIM_SW_NAME = `Siswa S5 Sim ${SUFFIX}`

  await resetStorage(page)
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Seed sekolah milik cabang admin lewat UI (cabang diturunkan server dari sesi).
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await page.getByRole('dialog').locator('div:has(> label:text("Nama Sekolah")) input').first().fill(SIM_SCH_NAME)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect.poll(
    () => getStoreJson(page, 'sekolah').then(arr => arr.some(s => s.nama === SIM_SCH_NAME)),
    { timeout: 15000 }
  ).toBe(true)

  // Tambah siswa, lalu Edit untuk mengisi Tingkat + Mapel.
  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await fieldInDialog(page, 'Nama Siswa').fill(SIM_SW_NAME)
  await page.getByRole('dialog').locator('div:has(> label:text("Sekolah")) select').first().selectOption({ label: SIM_SCH_NAME })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await waitForSiswaByName(page, SIM_SW_NAME)

  const row = page.locator('tr', { has: page.getByText(SIM_SW_NAME) }).first()
  await expect(row).toBeVisible()
  const aksiButtons = row.locator('td div.flex button')
  await expect.poll(() => aksiButtons.count(), { timeout: 10000 }).toBeGreaterThanOrEqual(2)
  // Urutan tombol Aksi: [SPP?, Edit, Hapus] — Edit selalu kedua dari akhir
  // (pola targetRow.locator('button').last() untuk Hapus di
  // tests/student-delete-absensi.spec.js).
  const n = await aksiButtons.count()
  await aksiButtons.nth(n - 2).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await fieldInDialog(page, 'Tingkat').selectOption('Beginner')
  await fieldInDialog(page, 'Mapel').fill('Scratch 3')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Tersimpan: cache lokal membawa tingkat/mapel baru (writeRemote → server → cache).
  await expect.poll(async () => {
    const arr = await getStoreJson(page, 'siswa')
    const s = arr.find(r => r.nama === SIM_SW_NAME)
    return s ? `${s.tingkat || ''}|${s.mapel || ''}` : 'belum-ada'
  }, { timeout: 15000 }).toBe('Beginner|Scratch 3')

  // Badge tampil di baris (gaya badge Trial).
  await expect(row.getByText('Beginner', { exact: true })).toBeVisible()
  await expect(row.getByText('Scratch 3')).toBeVisible()

  // Reload → nilai tetap (bukti persist server, bukan sekadar cache lokal).
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Siswa')
  const rowAfter = page.locator('tr', { has: page.getByText(SIM_SW_NAME) }).first()
  await expect(rowAfter.getByText('Beginner', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(rowAfter.getByText('Scratch 3')).toBeVisible()

  // Nilai form ikut bertahan bila dialog dibuka ulang.
  const aksiAfter = rowAfter.locator('td div.flex button')
  await expect.poll(() => aksiAfter.count(), { timeout: 10000 }).toBeGreaterThanOrEqual(2)
  const m = await aksiAfter.count()
  await aksiAfter.nth(m - 2).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(fieldInDialog(page, 'Tingkat')).toHaveValue('Beginner')
  await expect(fieldInDialog(page, 'Mapel')).toHaveValue('Scratch 3')
  await page.getByRole('button', { name: 'Batal', exact: true }).click()

  expect(pageErrors).toHaveLength(0)
})

test('S5.2: trainer Data Siswa read-only — tombol tulis tak ada', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Siswa')

  await expect(page.getByRole('button', { name: 'Tambah Siswa Baru' })).toHaveCount(0)
  await expect(page.getByText('Aksi', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Simpan', exact: true })).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})
