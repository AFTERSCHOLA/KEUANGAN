import { test, expect } from './fixtures.js'

const APP = 'http://localhost:5173'

async function seedTwoBranches(page) {
  await page.addInitScript(() => {
    const key = name => `afterschola_v4_${name}`
    const branches = [
      { id: 'cbg-PST-test', nama: 'Cabang Pusat', kode: 'PST' },
      { id: 'cbg-BDG-test', nama: 'Cabang Bandung', kode: 'BDG' },
    ]
    const schools = [
      { id: 'skl-PST-test', nama: 'Sekolah Pusat', spp: 100000, trainerIds: ['trn-PST-test'], cabangId: 'cbg-PST-test' },
      { id: 'skl-BDG-test', nama: 'Sekolah Bandung', spp: 150000, trainerIds: ['trn-BDG-test'], cabangId: 'cbg-BDG-test' },
    ]
    const trainers = [
      { id: 'trn-PST-test', nama: 'Trainer Pusat', honor: 50000, sekolahIds: ['skl-PST-test'] },
      { id: 'trn-BDG-test', nama: 'Trainer Bandung', honor: 75000, sekolahIds: ['skl-BDG-test'] },
    ]
    const students = [
      { id: 'sw-PST-test', nama: 'Siswa Pusat', status: 'Aktif', sekolahId: 'skl-PST-test' },
      { id: 'sw-BDG-test', nama: 'Siswa Bandung', status: 'Aktif', sekolahId: 'skl-BDG-test' },
    ]
    const attendance = [
      { id: '2026-08-01_skl-PST-test_trn-PST-test', periode: '2026-08', sekolahId: 'skl-PST-test', trainerId: 'trn-PST-test', trainerStatus: 'Hadir', siswaList: [] },
      { id: '2026-08-02_skl-BDG-test_trn-BDG-test', periode: '2026-08', sekolahId: 'skl-BDG-test', trainerId: 'trn-BDG-test', trainerStatus: 'Hadir', siswaList: [] },
    ]
    const honorPayments = [
      { id: 'pay-PST-test', trainerId: 'trn-PST-test', periode: '2026-08', nominal: 10000 },
      { id: 'pay-BDG-test', trainerId: 'trn-BDG-test', periode: '2026-08', nominal: 20000 },
    ]
    const sppPayments = [
      { id: 'spp-PST-test', siswaId: 'sw-PST-test', periode: '2026-08', nominal: 100000 },
      { id: 'spp-BDG-test', siswaId: 'sw-BDG-test', periode: '2026-08', nominal: 150000 },
    ]
    const empty = { trainer: [], siswa: [], absensi: [], honorPayments: [], sppPayments: [], invoices: [] }
    for (const [name, value] of Object.entries({ cabang: branches, sekolah: schools, trainer: trainers, siswa: students, absensi: attendance, honorPayments, sppPayments, invoices: empty.invoices })) {
      localStorage.setItem(key(name), JSON.stringify(value))
    }
    localStorage.setItem(key('settings'), JSON.stringify({ migrations: { m71BranchSchema: { completedAt: '2026-08-20T00:00:00.000Z' } } }))
    localStorage.setItem(key('ui'), JSON.stringify({ role: 'superadmin', activeTab: 'overview', selectedYear: 2026, selectedMonth: 8, selectedCabangId: '' }))
  })
}

test('M7.3.3: superadmin branch selection scopes every Overview-derived view', async ({ page, pageErrors }) => {
  await seedTwoBranches(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const branchSelect = page.getByLabel('Cabang', { exact: true })
  await expect(branchSelect).toBeVisible()
  await expect(branchSelect).toHaveValue('')
  await expect(page.getByText('Sekolah Pusat', { exact: true })).toBeVisible()
  await expect(page.getByText('Sekolah Bandung', { exact: true })).toBeVisible()
  await expect(page.getByText('Rp 250.000').first()).toBeVisible()

  await branchSelect.selectOption({ label: 'Cabang Bandung (BDG)' })

  await expect(branchSelect).toHaveValue('cbg-BDG-test')
  await expect(page.getByText('Sekolah Bandung', { exact: true })).toBeVisible()
  await expect(page.getByText('Sekolah Pusat', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Rp 150.000').first()).toBeVisible()
  await expect(page.getByText('Rp 250.000')).toHaveCount(0)
  expect(pageErrors).toHaveLength(0)
})

test('M7.3.3: admin does not see the superadmin branch selector', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('afterschola_v4_ui', JSON.stringify({ role: 'admin', activeTab: 'overview' })))
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByLabel('Cabang', { exact: true })).toHaveCount(0)
})
