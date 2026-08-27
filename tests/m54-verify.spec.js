import { test, expect, loginAsAdmin } from './fixtures.js'

const APP = 'http://localhost:5173'
const SCHOOL = 'SD M54'
const TRAINER = 'Trainer M54'
const ASSISTANT = 'Asisten M54'
const TRIAL_DATE = '2026-08-12'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function todayWeekday() {
  const names = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  return names[new Date(`${today()}T00:00:00`).getDay()]
}

async function resetStorage(page, token) {
  await page.addInitScript(token => {
    if (sessionStorage.getItem(token)) return
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    sessionStorage.setItem(token, '1')
  }, token)
}

async function loginAdmin(page) {
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByLabel('Pilih Cabang Anda').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

function field(page, labelText) {
  return page.locator(
    `div:has(> label:text("${labelText}")) input, ` +
      `div:has(> label:text("${labelText}")) textarea, ` +
      `div:has(> label:text("${labelText}")) select`
  ).first()
}

async function seed(page, data) {
  await page.evaluate(data => {
    for (const [key, value] of Object.entries(data)) {
      localStorage.setItem(`afterschola_v4_${key}`, JSON.stringify(value))
    }
  }, data)
}

function financeSnapshot(page) {
  return page.evaluate(async () => {
    const { financialData } = await import('/src/lib/finance.js')
    const get = key => JSON.parse(localStorage.getItem(`afterschola_v4_${key}`) || '[]')
    const periode = new Date().toISOString().slice(0, 7)
    const result = financialData({
      sekolah: get('sekolah'),
      siswa: get('siswa'),
      trainer: get('trainer'),
      absensi: get('absensi'),
      honorPayments: get('honorPayments'),
      periode,
    })
    return {
      potensiSpp: result.potensiSpp,
      belumTertagih: result.belumTertagih,
      pemasukanSpp: result.pemasukanSpp,
      labaRugi: result.labaRugi,
    }
  })
}

test('M5.4.1/M5.4.2: factory defaults and Trial status/date persist after reload', async ({ page, pageErrors }) => {
  await resetStorage(page, '__m54_form_reset')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAdmin(page)

  const factory = await page.evaluate(async () => {
    const { newSiswa } = await import('/src/lib/constants.js')
    return newSiswa('school-m54', 'School M54')
  })
  expect(factory.status).toBe('Aktif')
  expect(factory.trialMulai).toBeNull()

  await seed(page, {
    sekolah: [{ id: 'school-m54', nama: SCHOOL, spp: 100000, jadwal: '', trainerIds: [] }],
    siswa: [],
    ui: { role: 'admin', trainerId: null },
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)
  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill('Trial M54')
  await field(page, 'Sekolah').selectOption({ label: SCHOOL })
  await page.getByRole('radio', { name: 'Trial' }).check()
  await field(page, 'Trial Mulai').fill(TRIAL_DATE)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)
  await openTab(page, 'Data Siswa')
  await expect(page.getByRole('radio', { name: 'Trial' })).toHaveCount(0)

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_siswa') || '[]'))
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ nama: 'Trial M54', status: 'Trial', trialMulai: TRIAL_DATE })
  expect(pageErrors).toHaveLength(0)
})

test('M5.4.3: 30 Active plus 2 Trial students bill only 30', async ({ page, pageErrors }) => {
  await resetStorage(page, '__m54_finance_reset')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAdmin(page)

  const school = { id: 'school-finance-m54', nama: 'School Finance M54', spp: 100000, trainerIds: [] }
  const siswa = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `active-${i}`, nama: `Active ${i}`, sekolahId: school.id, status: 'Aktif', sppLunas: {} })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `trial-${i}`, nama: `Trial ${i}`, sekolahId: school.id, status: 'Trial', trialMulai: TRIAL_DATE, sppLunas: {} })),
  ]
  await seed(page, {
    sekolah: [school],
    siswa,
    trainer: [],
    absensi: [],
    honorPayments: [],
    ui: { role: 'admin', trainerId: null },
  })

  const result = await page.evaluate(async () => {
    const { financialData } = await import('/src/lib/finance.js')
    const get = key => JSON.parse(localStorage.getItem(`afterschola_v4_${key}`) || '[]')
    return financialData({
      sekolah: get('sekolah'),
      siswa: get('siswa'),
      trainer: [],
      absensi: [],
      honorPayments: [],
      periode: '2026-08',
    })
  })

  expect(result.sekolahFinance[0].siswaCount).toBe(32)
  expect(result.sekolahFinance[0].targetSpp).toBe(3000000)
  expect(result.potensiSpp).toBe(3000000)
  expect(result.belumTertagih).toBe(3000000)
  expect(pageErrors).toHaveLength(0)
})

test('M5.4 exit gate: trainer capture/certification reaches admin verification without changing finance', async ({ page, pageErrors }) => {
  await resetStorage(page, '__m54_exit_reset')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAdmin(page)

  const currentDate = today()
  const school = { id: 'school-exit-m54', nama: SCHOOL, spp: 100000, jadwal: todayWeekday(), trainerIds: ['trainer-exit-m54', 'assistant-exit-m54'] }
  const trainer = { id: 'trainer-exit-m54', nama: TRAINER, honor: 50000, sekolahIds: [school.id] }
  const assistant = { id: 'assistant-exit-m54', nama: ASSISTANT, honor: 40000, sekolahIds: [school.id] }
  const siswa = [
    { id: 'student-active-m54', nama: 'Active Exit M54', sekolahId: school.id, sekolahNama: SCHOOL, status: 'Aktif', sppLunas: {} },
    { id: 'student-trial-m54', nama: 'Trial Exit M54', sekolahId: school.id, sekolahNama: SCHOOL, status: 'Trial', trialMulai: TRIAL_DATE, sppLunas: {} },
  ]
  await seed(page, {
    sekolah: [school],
    trainer: [trainer, assistant],
    siswa,
    absensi: [{
      id: 'attendance-prior-m54',
      tanggal: `${currentDate.slice(0, 8)}01`,
      periode: currentDate.slice(0, 7),
      sekolahId: school.id,
      trainerId: trainer.id,
      trainerNama: TRAINER,
      trainerStatus: 'Hadir',
      siswaList: [{ siswaId: siswa[0].id, nama: siswa[0].nama, status: 'Hadir' }],
      dokumentasi: [{ slot: 'kehadiran', type: 'dataurl', data: 'data:image/png;base64,iVBORw0KGgo=' }],
      catatan: 'Sesi sebelumnya',
      statusVerifikasi: { by: 'admin', at: `${currentDate}T00:00:00.000Z` },
      konfirmasiTrainer: `${currentDate}T00:00:00.000Z`,
    }],
    honorPayments: [{ id: 'payment-exit-m54', trainerId: trainer.id, periode: currentDate.slice(0, 7), nominal: 20000, tanggalBayar: currentDate }],
    ui: { role: 'admin', trainerId: null, selectedYear: Number(currentDate.slice(0, 4)), selectedMonth: Number(currentDate.slice(5, 7)) },
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await page.getByRole('button', { name: 'Pilih peran Trainer' }).click()
  await page.locator('select').first().selectOption({ label: TRAINER })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Rekap Saya' })).toBeVisible()
  await expect(page.getByText(SCHOOL, { exact: true })).toBeVisible()
  await expect(page.getByText('Belum Diisi')).toBeVisible()
  await expect(page.getByText('1 sesi')).toBeVisible()
  await expect(page.getByText('Rp 50.000')).toBeVisible()
  await expect(page.getByText('Rp 20.000')).toBeVisible()
  await expect(page.getByText('Rp 30.000')).toBeVisible()

  await openTab(page, 'Data Absensi')
  await page.getByRole('button', { name: 'Input Absensi' }).click()
  await field(page, 'Tanggal Kelas').fill(currentDate)
  await field(page, 'Sekolah').selectOption({ label: SCHOOL })
  await field(page, 'Trainer').selectOption({ label: TRAINER })
  await field(page, 'Catatan').fill('Catatan exit gate M54')
  await page.getByRole('button', { name: 'Semua Hadir?' }).click()

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  const inputs = page.locator('input[type="file"]')
  await inputs.nth(0).setInputFiles({ name: 'kehadiran.png', mimeType: 'image/png', buffer: png })
  await inputs.nth(1).setInputFiles({ name: 'kegiatan.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('img[alt="Foto Kehadiran"]')).toBeVisible()
  await expect(page.locator('img[alt="Foto Kegiatan"]')).toBeVisible()
  await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()

  await openTab(page, 'Riwayat Absensi')
  const newHistoryRow = page.locator('tr').filter({ hasText: 'Catatan exit gate M54' })
  await expect(newHistoryRow).toBeVisible()
  await expect(newHistoryRow.locator('img[alt="Foto Kehadiran"]')).toBeVisible()
  await expect(newHistoryRow.locator('img[alt="Foto Kegiatan"]')).toBeVisible()
  await page.getByRole('button', { name: 'Saya nyatakan absensi minggu ini sesuai dokumen kertas' }).click()

  const certified = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_absensi') || '[]').find(record => record.catatan === 'Catatan exit gate M54'))
  expect(certified.konfirmasiTrainer).toEqual(expect.any(String))
  const beforeVerify = await financeSnapshot(page)

  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByLabel('Pilih Cabang Anda').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await openTab(page, 'Riwayat Absensi')
  await expect(page.getByText('Antrian Verifikasi')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verifikasi' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Verifikasi' }).first().click()

  const verified = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_absensi') || '[]')[0])
  expect(verified.statusVerifikasi).toMatchObject({ by: 'admin' })
  const afterVerify = await financeSnapshot(page)
  expect(afterVerify).toEqual(beforeVerify)
  expect(pageErrors).toHaveLength(0)
})
