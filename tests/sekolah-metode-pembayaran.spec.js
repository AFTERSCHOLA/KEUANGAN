import { test, expect, loginViaApi, loginAndPrime, createSekolahSuperadmin } from './fixtures.js'

const APP = 'http://localhost:5173'
const SUFFIX = String(Date.now()).slice(-6)
const SCH_NEW = `SD SB.C.1 Sim ${SUFFIX}`
const SCH_LEGACY = `SD SB.C.1 Legacy ${SUFFIX}`
const ADMIN_BRANCH_ID = 'cbg-test-pusat'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
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

// SB.C.1 — new school: fill metode pembayaran, save, refresh, re-open, verify.
test('SB.C.1: sekolah metode pembayaran survives save and refresh', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'superadmin')
  await gotoApp(page)

  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()

  await field(page, 'Nama Sekolah').fill(SCH_NEW)

  await field(page, 'Basis Penagihan').selectOption({ value: 'trainer' })
  await field(page, 'Tarif per Pertemuan').fill('75000')
  await field(page, 'Pemicu Penagihan').selectOption({ value: 'per_n_pertemuan' })
  await field(page, 'Jumlah Pertemuan').fill('5')
  await field(page, 'Sumber Dana').selectOption({ value: 'ortu' })

  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Tunggu writeRemote() selesai menulis ke cache lokal.
  await expect.poll(() =>
    page.evaluate(name => {
      const list = JSON.parse(
        localStorage.getItem('afterschola_v4_sekolah') || '[]'
      )
      return list.some(s => s.nama === name)
    }, SCH_NEW)
  ).toBe(true)

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await openTab(page, 'Data Sekolah')

  const card = page.locator('div.bg-white.rounded-2xl', {
  has: page.getByRole('heading', { name: SCH_NEW, level: 3 }),
}).first()

await card.getByRole('button', { name: 'Edit sekolah' }).click()

  await expect(field(page, 'Basis Penagihan')).toHaveValue('trainer')
  await expect(field(page, 'Tarif per Pertemuan')).toHaveValue('75.000')
  await expect(field(page, 'Pemicu Penagihan')).toHaveValue('per_n_pertemuan')
  await expect(field(page, 'Jumlah Pertemuan')).toHaveValue('5')
  await expect(field(page, 'Sumber Dana')).toHaveValue('ortu')

  expect(pageErrors).toHaveLength(0)
})

// SB.C.1 — legacy school tanpa metodePembayaran tetap bisa dibuka
// dan disimpan tanpa crash / 422.
test('SB.C.1: legacy sekolah without metodePembayaran still opens and saves', async ({ page, pageErrors }) => {
  const csrf = await loginAndPrime(page, 'superadmin')

  // API-seeded school sengaja tidak memiliki key metodePembayaran,
  // untuk menguji backward compatibility terhadap record lama.
  await createSekolahSuperadmin(
    page,
    csrf,
    SCH_LEGACY,
    100000,
    ADMIN_BRANCH_ID,
    `sbc1-legacy-${SUFFIX}`
  )

  await gotoApp(page)

  await openTab(page, 'Data Sekolah')

  const card = page
    .getByRole('heading', { name: SCH_LEGACY, level: 3 })
    .locator('..')
    .locator('..')
    .locator('..')

  await card.getByRole('button', { name: 'Edit sekolah' }).click()

  // Record lama tidak punya metodePembayaran.
  // Form harus tetap aman dibuka dan menggunakan default UI.
  await expect(field(page, 'Basis Penagihan')).toHaveValue('siswa')
  await expect(field(page, 'Pemicu Penagihan')).toHaveValue('per_bulan')
  await expect(field(page, 'Sumber Dana')).toHaveValue('sekolah')

  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await expect.poll(() =>
    page.evaluate(name => {
      const list = JSON.parse(
        localStorage.getItem('afterschola_v4_sekolah') || '[]'
      )
      return list.some(s => s.nama === name)
    }, SCH_LEGACY)
  ).toBe(true)

  expect(pageErrors).toHaveLength(0)
})