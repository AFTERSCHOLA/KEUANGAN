import { test, expect } from './fixtures.js'

const APP = 'http://localhost:5173'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__m71_reset_done')) return
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    sessionStorage.setItem('__m71_reset_done', '1')
  })
}

async function login(page, role) {
  if (await page.getByText('Pilih Peran Masuk').count()) {
    await page.getByRole('button', { name: `Pilih peran ${role}` }).click()
    await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  }
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M7.1.1: default branch and school branch dropdown', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await login(page, 'Superadmin')
  await openTab(page, 'Data Sekolah')

  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await expect(page.locator('div:has(> label:text("Cabang")) select')).toBeVisible()
  await page.locator('div:has(> label:text("Nama Sekolah")) input').first().fill('SDN Default M7.1')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  const snapshot = await page.evaluate(() => ({
    schools: JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]'),
    branches: JSON.parse(localStorage.getItem('afterschola_v4_cabang') || '[]'),
  }))
  expect(snapshot.branches[0].kode).toBe('PST')
  expect(snapshot.schools[0].cabangId).toBe(snapshot.branches[0].id)
  expect(snapshot.schools[0].id).toMatch(/^skl-PST-\d+-[a-z0-9]+$/)
  expect(pageErrors).toHaveLength(0)
})

test('M7.1.2: migration prefixes IDs, remaps references, and is idempotent', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await login(page, 'Superadmin')

  await page.evaluate(() => {
    const key = 'afterschola_v4'
    const branches = [
      { id: 'branch-pst', nama: 'Pusat', kode: 'PST' },
      { id: 'branch-bdg', nama: 'Bandung', kode: 'BDG' },
    ]
    const school = { id: 'school-legacy', nama: 'Legacy BDG', cabangId: 'branch-bdg', trainerIds: ['trainer-legacy'] }
    const trainer = { id: 'trainer-legacy', nama: 'Trainer Legacy', sekolahIds: [school.id], honor: 50000 }
    const student = { id: 'student-legacy', nama: 'Student Legacy', sekolahId: school.id, sekolahNama: school.nama, sppLunas: {} }
    localStorage.setItem(`${key}_cabang`, JSON.stringify(branches))
    localStorage.setItem(`${key}_sekolah`, JSON.stringify([school]))
    localStorage.setItem(`${key}_trainer`, JSON.stringify([trainer]))
    localStorage.setItem(`${key}_siswa`, JSON.stringify([student]))
    localStorage.setItem(`${key}_absensi`, JSON.stringify([{ id: '2026-08-01_school-legacy_trainer-legacy', tanggal: '2026-08-01', sekolahId: school.id, trainerId: trainer.id, siswaList: [{ siswaId: student.id, nama: student.nama }] }]))
    localStorage.setItem(`${key}_honorPayments`, JSON.stringify([{ id: 'payment-legacy', trainerId: trainer.id, nominal: 50000 }]))
    localStorage.setItem(`${key}_sppPayments`, JSON.stringify([{ id: 'spp-legacy', siswaId: student.id, nominal: 100000 }]))
    localStorage.setItem(`${key}_invoices`, JSON.stringify([{ id: 'invoice-legacy', sekolahId: school.id }]))
    localStorage.setItem(`${key}_settings`, JSON.stringify({}))
    localStorage.setItem(`${key}_ui`, JSON.stringify({ role: 'superadmin' }))
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const first = await page.evaluate(() => {
    const get = key => JSON.parse(localStorage.getItem(`afterschola_v4_${key}`) || '[]')
    return {
      cabang: get('cabang'),
      sekolah: get('sekolah'),
      trainer: get('trainer'),
      siswa: get('siswa'),
      absensi: get('absensi'),
      honorPayments: get('honorPayments'),
      sppPayments: get('sppPayments'),
      invoices: get('invoices'),
      settings: JSON.parse(localStorage.getItem('afterschola_v4_settings') || '{}'),
    }
  })
  expect(first.sekolah[0].id).toMatch(/^skl-BDG-\d+-[a-z0-9]+$/)
  expect(first.trainer[0].id).toMatch(/^trn-BDG-\d+-[a-z0-9]+$/)
  expect(first.siswa[0].id).toMatch(/^sw-BDG-\d+-[a-z0-9]+$/)
  expect(first.honorPayments[0].id).toMatch(/^pay-BDG-\d+-[a-z0-9]+$/)
  expect(first.sppPayments[0].id).toMatch(/^spp-BDG-\d+-[a-z0-9]+$/)
  expect(first.invoices[0].id).toMatch(/^inv-BDG-\d+-[a-z0-9]+$/)
  expect(first.trainer[0].sekolahIds[0]).toBe(first.sekolah[0].id)
  expect(first.siswa[0].sekolahId).toBe(first.sekolah[0].id)
  expect(first.absensi[0].sekolahId).toBe(first.sekolah[0].id)
  expect(first.absensi[0].trainerId).toBe(first.trainer[0].id)
  expect(first.absensi[0].siswaList[0].siswaId).toBe(first.siswa[0].id)
  expect(first.settings.migrations.m71BranchSchema.completedAt).toBeTruthy()

  await page.reload()
  const second = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]'))
  expect(second[0].id).toBe(first.sekolah[0].id)
  expect(pageErrors).toHaveLength(0)
})

test('M7.1.3: superadmin branch CRUD, school assignment, and branch filter', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await login(page, 'Superadmin')

  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await page.locator('div:has(> label:text("Nama Sekolah")) input').first().fill('SDN Pusat')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Cabang')
  await page.getByRole('button', { name: 'Tambah Cabang' }).click()
  await page.locator('div:has(> label:text("Nama Cabang")) input').first().fill('Cabang Bandung')
  await page.locator('div:has(> label:text("Kode Cabang")) input').first().fill('BDG')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(page.getByText('Cabang Bandung', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '+ Assign Sekolah' }).last().click()
  await page.getByRole('button', { name: 'SDN Pusat', exact: true }).click()
  await openTab(page, 'Data Sekolah')
  await page.getByLabel('Filter Cabang').selectOption({ label: 'Cabang Bandung (BDG)' })
  await expect(page.getByText('SDN Pusat', { exact: true })).toBeVisible()
  await page.getByLabel('Filter Cabang').selectOption({ label: 'Cabang Pusat (PST)' })
  await expect(page.getByText('SDN Pusat', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Data Cabang', exact: true })).toHaveCount(0)
  expect(pageErrors).toHaveLength(0)
})
