import { test, expect, loginAsAdmin } from './fixtures.js'

const APP = 'http://localhost:5173'
const SCHOOL = 'SD M6.2'
const TRAINER = 'Trainer M6.2'
const PERIOD = '2026-08'
const SPP = 100000

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

async function resetStorage(page) {
  await page.addInitScript(() => {
    window.__printCalled = false
    window.print = () => { window.__printCalled = true }
    if (sessionStorage.getItem('__m62_reset_done')) return
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    sessionStorage.setItem('__m62_reset_done', '1')
  })
}

async function seedSchoolTrainerAndStudents(page) {
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCHOOL)
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await page.evaluate(({ school, spp, period }) => {
    const key = 'afterschola_v4'
    const schools = JSON.parse(localStorage.getItem(`${key}_sekolah`))
    const schoolRecord = schools.find(item => item.nama === school)
    const students = Array.from({ length: 30 }, (_, index) => ({
      id: `sw-m62-${index + 1}`,
      nama: `Siswa M6.2 ${index + 1}`,
      sekolahId: schoolRecord.id,
      sekolahNama: school,
      kelas: '5A',
      wa: `6281234567${String(index).padStart(3, '0')}`,
      sppLunas: { [period]: false },
      status: 'Aktif',
      trialMulai: null,
      createdAt: new Date().toISOString(),
    }))
    localStorage.setItem(`${key}_siswa`, JSON.stringify(students))
    localStorage.setItem(`${key}_sppPayments`, JSON.stringify([]))
  }, { school: SCHOOL, spp: SPP, period: PERIOD })
}

test('M6.2.1 Slip Honor prints the selected payment entry', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)
  await seedSchoolTrainerAndStudents(page)

  await page.evaluate(({ key, trainerName, schoolName, period }) => {
    const trainer = JSON.parse(localStorage.getItem(`${key}_trainer`)).find(item => item.nama === trainerName)
    const school = JSON.parse(localStorage.getItem(`${key}_sekolah`)).find(item => item.nama === schoolName)
    localStorage.setItem(`${key}_absensi`, JSON.stringify([{
      id: 'abs-m62-1',
      tanggal: `${period}-10`,
      periode: period,
      sekolahId: school.id,
      sekolahNama: school.nama,
      trainerId: trainer.id,
      trainerNama: trainer.nama,
      trainerStatus: 'Hadir',
      siswaHadir: [],
    }]))
    localStorage.setItem(`${key}_honorPayments`, JSON.stringify([{
      id: 'hon-m62-1',
      trainerId: trainer.id,
      periode: period,
      nominal: 50000,
      tanggalBayar: `${period}-20`,
    }]))
  }, { key: 'afterschola_v4', trainerName: TRAINER, schoolName: SCHOOL, period: PERIOD })
  await page.reload()
  await loginAsAdmin(page)
  await openTab(page, 'Data Pembayaran')

  await page.getByRole('button', { name: /Riwayat \(1\)/ }).click()
  await page.locator('button[title="Cetak Slip"]').click()

  await expect(page.getByRole('heading', { name: 'Slip Honor Trainer' })).toBeVisible()
  await expect(page.getByText(TRAINER, { exact: true }).last()).toBeVisible()
  await expect(page.getByText('Rp 50.000', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cetak Slip', exact: true }).click()
  expect(await page.evaluate(() => window.__printCalled)).toBe(true)
  expect(pageErrors).toHaveLength(0)
})

test('M6.2.2 Invoice totals 30 students and transitions Draft to Terbit to Lunas', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)
  await seedSchoolTrainerAndStudents(page)

  await openTab(page, 'Data Sekolah')
  await page.locator(`button[title="Kelola Invoice"]`).click()
  await expect(page.getByRole('heading', { name: `Invoice — ${SCHOOL}` })).toBeVisible()
  await expect(page.getByText('Rp 3.000.000', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Simpan sebagai Draft' }).click()
  await expect(page.locator('span').filter({ hasText: 'Draft' }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Terbitkan', exact: true }).click()
  await page.getByRole('button', { name: 'Ya, Lanjutkan', exact: true }).click()
  await expect(page.getByText(/[A-Z0-9]+-\d{6}-\d{4}/)).toBeVisible()
  await expect(page.getByText('Terbit', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Tandai Lunas', exact: true }).click()
  await page.getByRole('button', { name: 'Ya, Lanjutkan', exact: true }).click()
  await expect(page.getByText('Lunas', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Cetak', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'INVOICE', exact: true })).toBeVisible()
  await expect(page.locator('.printable-report span.text-xl').filter({ hasText: 'Rp 3.000.000' })).toBeVisible()
  await page.getByRole('button', { name: 'Cetak Invoice', exact: true }).click()
  expect(await page.evaluate(() => window.__printCalled)).toBe(true)
  expect(pageErrors).toHaveLength(0)
})
