import { test, expect } from './fixtures.js'

const APP = 'http://localhost:5173'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__m64_reset_done')) return
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    sessionStorage.setItem('__m64_reset_done', '1')
  })
}

async function loginAsAdmin(page) {
  const picker = page.getByText('Pilih Peran Masuk')
  if (await picker.count()) {
    await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  }
}

async function seed(page) {
  await page.evaluate(() => {
    const key = 'afterschola_v4'
    const school = { id: 'school-m64', nama: 'SDN M6.4', spp: 100000, trainerIds: ['trainer-m64'], jadwal: '' }
    const student = { id: 'student-m64', nama: 'Siswa M6.4', sekolahId: school.id, sekolahNama: school.nama, status: 'Aktif', sppLunas: {} }
    const trainer = { id: 'trainer-m64', nama: 'Trainer M6.4', honor: 50000, sekolahIds: [school.id] }
    const absensi = [
      { id: 'abs-m64-jul-1', tanggal: '2026-07-10', periode: '2026-07', sekolahId: school.id, trainerId: trainer.id, trainerStatus: 'Hadir', siswaList: [] },
      { id: 'abs-m64-jul-2', tanggal: '2026-07-11', periode: '2026-07', sekolahId: school.id, trainerId: trainer.id, trainerStatus: 'Hadir', siswaList: [] },
      { id: 'abs-m64-jun', tanggal: '2026-06-10', periode: '2026-06', sekolahId: school.id, trainerId: trainer.id, trainerStatus: 'Hadir', siswaList: [] },
      { id: 'abs-m64-year-1', tanggal: '2025-07-10', periode: '2025-07', sekolahId: school.id, trainerId: trainer.id, trainerStatus: 'Hadir', siswaList: [] },
      { id: 'abs-m64-year-2', tanggal: '2025-07-11', periode: '2025-07', sekolahId: school.id, trainerId: trainer.id, trainerStatus: 'Hadir', siswaList: [] },
      { id: 'abs-m64-year-3', tanggal: '2025-07-12', periode: '2025-07', sekolahId: school.id, trainerId: trainer.id, trainerStatus: 'Hadir', siswaList: [] },
    ]
    const honorPayments = [
      { id: 'honor-m64-jul', trainerId: trainer.id, periode: '2026-07', nominal: 60000 },
      { id: 'honor-m64-jun', trainerId: trainer.id, periode: '2026-06', nominal: 20000 },
      { id: 'honor-m64-year', trainerId: trainer.id, periode: '2025-07', nominal: 10000 },
    ]
    const sppPayments = [
      { id: 'spp-m64-jul', siswaId: student.id, periode: '2026-07', nominal: 300000 },
      { id: 'spp-m64-jun', siswaId: student.id, periode: '2026-06', nominal: 200000 },
      { id: 'spp-m64-year', siswaId: student.id, periode: '2025-07', nominal: 100000 },
    ]
    localStorage.setItem(`${key}_sekolah`, JSON.stringify([school]))
    localStorage.setItem(`${key}_siswa`, JSON.stringify([student]))
    localStorage.setItem(`${key}_trainer`, JSON.stringify([trainer]))
    localStorage.setItem(`${key}_absensi`, JSON.stringify(absensi))
    localStorage.setItem(`${key}_honorPayments`, JSON.stringify(honorPayments))
    localStorage.setItem(`${key}_sppPayments`, JSON.stringify(sppPayments))
    localStorage.setItem(`${key}_ui`, JSON.stringify({ role: 'admin', trainerId: null, selectedYear: 2026, selectedMonth: 7 }))
  })
}

test('M6.4.1 Jul 2026 compares Jun 2026 and Jul 2025 with deltas', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)
  await seed(page)
  await page.reload()
  await loginAsAdmin(page)
  await page.getByRole('navigation').getByRole('button', { name: 'Data Keuangan', exact: true }).click()

  const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Pos', exact: true }) }).last()
  await expect(table).toBeVisible()
  for (const label of ['Juli 2026', 'Juni 2026', 'Juli 2025', 'Δ vs Bulan Lalu', 'Δ vs Tahun Lalu']) {
    await expect(table.getByRole('columnheader', { name: label, exact: true })).toBeVisible()
  }

  const row = table.locator('tbody tr', { hasText: 'Laba / Rugi' })
  await expect(row).toContainText('Rp 240.000')
  await expect(row).toContainText('Rp 180.000')
  await expect(row).toContainText('+Rp 60.000')
  await expect(row).toContainText('+33.3%')
  await expect(row).toContainText('Rp 90.000')
  await expect(row).toContainText('+Rp 150.000')
  await expect(row).toContainText('+166.7%')
  expect(pageErrors).toHaveLength(0)
})
