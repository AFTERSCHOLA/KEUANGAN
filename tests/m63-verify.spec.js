import { test, expect, loginAsAdmin } from './fixtures.js'

const APP = 'http://localhost:5173'
const ACADEMIC_YEAR = 2026
const SELECTED_MONTH = 10
const CURRENT_PERIOD = '2026-10'
const SCHOOL = 'SDN 01 M6.3'
const SECOND_SCHOOL = 'SDN 02 M6.3'
const TRAINER = 'Trainer M6.3'
const SPP = 150000

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__m63_reset_done')) return
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    sessionStorage.setItem('__m63_reset_done', '1')
  })
}

async function seed(page) {
  await page.evaluate(({ academicYear, selectedMonth, currentPeriod }) => {
    const key = 'afterschola_v4'
    const school = { id: 'school-m63-01', nama: 'SDN 01 M6.3', spp: 150000, trainerIds: ['trainer-m63'], jadwal: '' }
    const secondSchool = { id: 'school-m63-02', nama: 'SDN 02 M6.3', spp: 100000, trainerIds: [], jadwal: '' }
    const siswa = [
      { id: 'student-m63-01', nama: 'Siswa M6.3 1', sekolahId: school.id, sekolahNama: school.nama, status: 'Aktif', sppLunas: { '2026-07': true, '2026-08': true, '2026-09': true } },
      { id: 'student-m63-02', nama: 'Siswa M6.3 2', sekolahId: school.id, sekolahNama: school.nama, status: 'Aktif', sppLunas: { '2026-07': true, '2026-08': true, '2026-09': true } },
      { id: 'student-m63-trial', nama: 'Trial M6.3', sekolahId: school.id, sekolahNama: school.nama, status: 'Trial', sppLunas: {} },
      { id: 'student-m63-second', nama: 'Siswa M6.3 Sekolah 2', sekolahId: secondSchool.id, sekolahNama: secondSchool.nama, status: 'Aktif', sppLunas: {} },
    ]
    const absensi = [{
      id: 'abs-m63-01',
      tanggal: '2026-10-10',
      periode: currentPeriod,
      sekolahId: school.id,
      sekolahNama: school.nama,
      trainerId: 'trainer-m63',
      trainerNama: 'Trainer M6.3',
      trainerStatus: 'Hadir',
      siswaList: [],
    }]
    const honorPayments = [{
      id: 'honor-m63-01',
      trainerId: 'trainer-m63',
      periode: currentPeriod,
      nominal: 50000,
      tanggalBayar: '2026-10-20',
    }]
    const sppPayments = [
      { id: 'spp-m63-01', siswaId: siswa[0].id, periode: '2026-07', nominal: 150000 },
      { id: 'spp-m63-02', siswaId: siswa[1].id, periode: '2026-07', nominal: 150000 },
      { id: 'spp-m63-03', siswaId: siswa[0].id, periode: currentPeriod, nominal: 150000 },
      { id: 'spp-m63-04', siswaId: siswa[1].id, periode: currentPeriod, nominal: 150000 },
    ]

    localStorage.setItem(`${key}_sekolah`, JSON.stringify([school, secondSchool]))
    localStorage.setItem(`${key}_siswa`, JSON.stringify(siswa))
    localStorage.setItem(`${key}_trainer`, JSON.stringify([{ id: 'trainer-m63', nama: 'Trainer M6.3', honor: 100000, sekolahIds: [school.id] }]))
    localStorage.setItem(`${key}_absensi`, JSON.stringify(absensi))
    localStorage.setItem(`${key}_honorPayments`, JSON.stringify(honorPayments))
    localStorage.setItem(`${key}_sppPayments`, JSON.stringify(sppPayments))
    localStorage.setItem(`${key}_ui`, JSON.stringify({ role: 'admin', trainerId: null, selectedYear: academicYear, selectedMonth }))
  }, { academicYear: ACADEMIC_YEAR, selectedMonth: SELECTED_MONTH, currentPeriod: CURRENT_PERIOD })
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M6.3.1 Aging report buckets two months of unpaid SPP into 2+ months', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)
  await seed(page)
  await page.reload()
  await loginAsAdmin(page)
  await openTab(page, 'Umur Piutang')

  const row = page.locator('tbody tr', { hasText: SCHOOL }).first()
  await expect(row).toBeVisible()
  await expect(row.locator('td').nth(3)).toHaveText('Rp 600.000')
  await expect(row.locator('td').nth(4)).toHaveText('Rp 600.000')
  await expect(page.locator('tbody tr', { hasText: 'Trial M6.3' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Bulan Ini' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '1 Bulan' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '2+ Bulan' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Total Piutang' })).toBeVisible()
  expect(pageErrors).toHaveLength(0)
})

test('M6.3.2 Semester Ganjil renders six monthly columns and totals', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)
  await seed(page)
  await page.reload()
  await loginAsAdmin(page)
  await openTab(page, 'Data Keuangan')
  await page.getByRole('button', { name: 'Semester', exact: true }).click()
  await page.getByRole('button', { name: 'Ganjil (Jul–Des)', exact: true }).click()

  const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Pos' }) }).first()
  await expect(table).toBeVisible()
  for (const label of ['Juli 2026', 'Agustus 2026', 'September 2026', 'Oktober 2026', 'November 2026', 'Desember 2026', 'Total']) {
    await expect(table.getByRole('columnheader', { name: label, exact: true })).toBeVisible()
  }
  await expect(table.getByRole('columnheader')).toHaveCount(8)
  await expect(table.getByRole('row').first()).toContainText('Juli 2026')
  await expect(table.getByRole('row').first()).toContainText('Desember 2026')
  await expect(pageErrors).toHaveLength(0)
})

test('M6.3.3 Overview summary matches FinanceReport and shows three red flags', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)
  await seed(page)
  await page.reload()
  await loginAsAdmin(page)

  const finance = await page.evaluate(async () => {
    const { financialData } = await import('/src/lib/finance.js')
    const get = key => JSON.parse(localStorage.getItem(`afterschola_v4_${key}`) || '[]')
    return financialData({
      sekolah: get('sekolah'),
      siswa: get('siswa'),
      trainer: get('trainer'),
      absensi: get('absensi'),
      honorPayments: get('honorPayments'),
      sppPayments: get('sppPayments'),
      periode: '2026-10',
    })
  })

  await expect(page.getByText('3 Sorotan Utama')).toBeVisible()
  await expect(page.getByText('Laba / Rugi — Periode Berjalan')).toBeVisible()
  await expect(page.getByText('Rp 250.000', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('75.0%', { exact: true })).toBeVisible()
  await expect(page.getByText('Kolektibilitas SPP Terendah')).toBeVisible()
  await expect(page.getByText('Sisa Honor Terbesar')).toBeVisible()
  await expect(page.getByText('Tunggakan Terlama')).toBeVisible()

  await openTab(page, 'Data Keuangan')
  const labaRugi = page.locator('div.space-y-1', { hasText: 'Laba / Rugi' }).locator('h3').first()
  await expect(labaRugi).toHaveText('Rp 250.000')
  await expect(page.getByText(`Rp ${new Intl.NumberFormat('id-ID').format(finance.labaRugi)}`, { exact: true }).first()).toBeVisible()
  expect(finance.labaRugi).toBe(250000)
  expect(finance.potensiSpp).toBe(400000)
  expect(finance.pemasukanSpp).toBe(300000)
  expect(pageErrors).toHaveLength(0)
})
