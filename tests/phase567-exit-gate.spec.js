import { test, expect } from './fixtures.js'

const APP = 'http://localhost:5173'
const BRANCH_PUSAT = 'cbg-PST-sim'
const BRANCH_BANDUNG = 'cbg-BDG-sim'
const SCHOOL_PUSAT = 'skl-PST-sim'
const SCHOOL_BANDUNG = 'skl-BDG-sim'
const TRAINER_PUSAT = 'trn-PST-sim'
const ASSISTANT_PUSAT = 'trn-PST-assistant-sim'
const TRAINER_BANDUNG = 'trn-BDG-sim'
const STUDENT_PUSAT_A = 'sw-PST-sim-a'
const STUDENT_PUSAT_B = 'sw-PST-sim-b'
const STUDENT_TRIAL = 'sw-PST-sim-trial'
const STUDENT_BANDUNG = 'sw-BDG-sim'
const PERIOD = new Date().toISOString().slice(0, 7)
const TODAY = new Date().toISOString().slice(0, 10)
const PREVIOUS_DAY = `${TODAY.slice(0, 8)}01`
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const TODAY_NAME = DAY_NAMES[new Date(`${TODAY}T00:00:00`).getDay()]
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

function key(name) {
  return `afterschola_v4_${name}`
}

async function seedScenario(page) {
  await page.addInitScript(({ data, ui }) => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const storageKey = localStorage.key(i)
      if (storageKey?.startsWith('afterschola_v4')) localStorage.removeItem(storageKey)
    }
    for (const [name, records] of Object.entries(data)) {
      localStorage.setItem(`afterschola_v4_${name}`, JSON.stringify(records))
    }
    localStorage.setItem('afterschola_v4_settings', JSON.stringify({
      migrations: { m71BranchSchema: { completedAt: new Date().toISOString() } },
    }))
    localStorage.setItem('afterschola_v4_ui', JSON.stringify(ui))
  }, {
    data: {
      cabang: [
        { id: BRANCH_PUSAT, nama: 'Cabang Pusat Simulasi', kode: 'PST' },
        { id: BRANCH_BANDUNG, nama: 'Cabang Bandung Simulasi', kode: 'BDG' },
      ],
      sekolah: [
        {
          id: SCHOOL_PUSAT,
          nama: 'SD Harapan Simulasi',
          spp: 100000,
          jadwal: TODAY_NAME,
          trainerIds: [TRAINER_PUSAT, ASSISTANT_PUSAT],
          cabangId: BRANCH_PUSAT,
        },
        {
          id: SCHOOL_BANDUNG,
          nama: 'SD Mentari Simulasi',
          spp: 150000,
          jadwal: 'Senin',
          trainerIds: [TRAINER_BANDUNG],
          cabangId: BRANCH_BANDUNG,
        },
      ],
      trainer: [
        { id: TRAINER_PUSAT, nama: 'Budi Simulasi', honor: 50000, sekolahIds: [SCHOOL_PUSAT] },
        { id: ASSISTANT_PUSAT, nama: 'Dewi Asisten Simulasi', honor: 40000, sekolahIds: [SCHOOL_PUSAT] },
        { id: TRAINER_BANDUNG, nama: 'Citra Simulasi', honor: 60000, sekolahIds: [SCHOOL_BANDUNG] },
      ],
      siswa: [
        { id: STUDENT_PUSAT_A, nama: 'Andi Aktif Simulasi', kelas: '5A', sekolahId: SCHOOL_PUSAT, sekolahNama: 'SD Harapan Simulasi', status: 'Aktif', sppLunas: {} },
        { id: STUDENT_PUSAT_B, nama: 'Bunga Aktif Simulasi', kelas: '4B', sekolahId: SCHOOL_PUSAT, sekolahNama: 'SD Harapan Simulasi', status: 'Aktif', sppLunas: {} },
        { id: STUDENT_TRIAL, nama: 'Trial Simulasi', kelas: '3C', sekolahId: SCHOOL_PUSAT, sekolahNama: 'SD Harapan Simulasi', status: 'Trial', trialMulai: PREVIOUS_DAY, sppLunas: {} },
        { id: STUDENT_BANDUNG, nama: 'Dimas Bandung Simulasi', kelas: '6A', sekolahId: SCHOOL_BANDUNG, sekolahNama: 'SD Mentari Simulasi', status: 'Aktif', sppLunas: {} },
      ],
      absensi: [
        {
          id: 'abs-PST-sim-history',
          tanggal: PREVIOUS_DAY,
          periode: PERIOD,
          sekolahId: SCHOOL_PUSAT,
          trainerId: TRAINER_PUSAT,
          trainerNama: 'Budi Simulasi',
          trainerStatus: 'Hadir',
          asistenId: ASSISTANT_PUSAT,
          asistenNama: 'Dewi Asisten Simulasi',
          dokumentasi: [{ slot: 'kehadiran', type: 'dataurl', data: 'data:image/png;base64,iVBORw0KGgo=' }, { slot: 'kegiatan', type: 'dataurl', data: 'data:image/png;base64,iVBORw0KGgo=' }],
          catatan: 'Sesi terdahulu dengan bukti lengkap.',
          statusVerifikasi: null,
          konfirmasiTrainer: null,
          siswaList: [
            { siswaId: STUDENT_PUSAT_A, nama: 'Andi Aktif Simulasi', status: 'Hadir' },
            { siswaId: STUDENT_PUSAT_B, nama: 'Bunga Aktif Simulasi', status: 'Hadir' },
          ],
        },
        {
          id: 'abs-BDG-sim-flagged',
          tanggal: PREVIOUS_DAY,
          periode: PERIOD,
          sekolahId: SCHOOL_BANDUNG,
          trainerId: TRAINER_BANDUNG,
          trainerNama: 'Citra Simulasi',
          trainerStatus: 'Hadir',
          dokumentasi: [],
          catatan: 'Bukti foto belum tersedia untuk review head trainer.',
          statusVerifikasi: null,
          siswaList: [{ siswaId: STUDENT_BANDUNG, nama: 'Dimas Bandung Simulasi', status: 'Hadir' }],
        },
      ],
      honorPayments: [
        { id: 'pay-PST-sim', trainerId: TRAINER_PUSAT, periode: PERIOD, nominal: 20000, tanggalBayar: TODAY, cabangId: BRANCH_PUSAT },
        { id: 'pay-BDG-sim', trainerId: TRAINER_BANDUNG, periode: PERIOD, nominal: 30000, tanggalBayar: TODAY, cabangId: BRANCH_BANDUNG },
      ],
      sppPayments: [
        { id: 'spp-BDG-sim', siswaId: STUDENT_BANDUNG, periode: PERIOD, nominal: 150000, tanggalBayar: TODAY, metode: 'Transfer', diterimaOleh: 'Admin Bandung Simulasi', sudahDisetor: true, bukti: null, cabangId: BRANCH_BANDUNG },
      ],
      invoices: [],
    },
    ui: { role: null, trainerId: null, activeTab: 'overview', selectedYear: Number(PERIOD.slice(0, 4)), selectedMonth: Number(PERIOD.slice(5, 7)), selectedCabangId: '' },
  })
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

async function switchRole(page, roleLabel, trainerName = null) {
  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await page.getByRole('button', { name: `Pilih peran ${roleLabel}` }).click()
  if (trainerName) await page.locator('select').first().selectOption({ label: trainerName })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
}

async function financeSnapshot(page) {
  return page.evaluate(async () => {
    const { financialData } = await import('/src/lib/finance.js')
    const get = name => JSON.parse(localStorage.getItem(`afterschola_v4_${name}`) || '[]')
    const ui = JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}')
    const periode = `${ui.selectedYear}-${String(ui.selectedMonth).padStart(2, '0')}`
    return financialData({
      sekolah: get('sekolah'),
      siswa: get('siswa'),
      trainer: get('trainer'),
      absensi: get('absensi'),
      honorPayments: get('honorPayments'),
      sppPayments: get('sppPayments'),
      periode,
    })
  })
}

test('Phase 5-7 exit gates: Trainer to Head Trainer and branch close simulation', async ({ page, pageErrors }) => {
  await seedScenario(page)
  await page.route('**/api/read.php**', route => route.abort())
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Phase 5: Trainer day, capture, proof review, and self-certification.
  await expect(page.getByText('Pilih Peran Masuk')).toBeVisible()
  await page.getByRole('button', { name: 'Pilih peran Trainer' }).click()
  await page.locator('select').first().selectOption({ label: 'Budi Simulasi' })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()

  const trainerNav = page.getByRole('navigation').getByRole('button')
  await expect(trainerNav).toHaveCount(4)
  await expect(page.getByText('Jadwal hari ini dan ringkasan honor periode')).toBeVisible()
  await expect(page.getByText('SD Harapan Simulasi', { exact: true })).toBeVisible()
  await expect(page.getByText('Belum Diisi')).toBeVisible()
  await expect(page.getByText('1 sesi')).toBeVisible()
  await expect(page.getByText('Rp 50.000')).toBeVisible()
  await expect(page.getByText('Rp 20.000')).toBeVisible()
  await expect(page.getByText('Rp 30.000')).toBeVisible()

  await openTab(page, 'Data Absensi')
  await page.getByRole('button', { name: 'Input Absensi' }).click()
  await field(page, 'Tanggal Kelas').fill(TODAY)
  await field(page, 'Sekolah').selectOption({ label: 'SD Harapan Simulasi' })
  await field(page, 'Trainer').selectOption({ label: 'Budi Simulasi' })
  await field(page, 'Catatan').fill('Sesi simulasi trainer dengan bukti lengkap.')
  await page.getByRole('button', { name: 'Semua Hadir?' }).click()
  await page.locator('input[type="file"]').nth(0).setInputFiles({ name: 'kehadiran.png', mimeType: 'image/png', buffer: PNG })
  await page.locator('input[type="file"]').nth(1).setInputFiles({ name: 'kegiatan.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('img[alt="Foto Kehadiran"]')).toBeVisible()
  await expect(page.locator('img[alt="Foto Kegiatan"]')).toBeVisible()
  await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()

  await openTab(page, 'Riwayat Absensi')
  await expect(page.getByText('Sesi simulasi trainer dengan bukti lengkap.', { exact: true })).toBeVisible()
  await expect(page.getByText('Dewi Asisten Simulasi', { exact: true })).toBeVisible()
  await expect(page.locator('img[alt="Foto Kehadiran"]').first()).toBeVisible()
  await expect(page.locator('img[alt="Foto Kegiatan"]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Saya nyatakan absensi minggu ini sesuai dokumen kertas' }).click()

  const certified = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_absensi') || '[]').find(record => record.catatan === 'Sesi simulasi trainer dengan bukti lengkap.'))
  expect(certified.konfirmasiTrainer).toEqual(expect.any(String))
  const beforeVerification = await financeSnapshot(page)

  await switchRole(page, 'Superadmin')
  await openTab(page, 'Riwayat Absensi')
  await expect(page.getByText('Antrian Verifikasi')).toBeVisible()
  await expect(page.getByText(/Tanpa foto bukti sesi/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Verifikasi' }).first().click()
  const afterVerification = await financeSnapshot(page)
  expect(afterVerification).toEqual(beforeVerification)

  const trialFinance = await page.evaluate(async () => {
    const { financialData } = await import('/src/lib/finance.js')
    const get = name => JSON.parse(localStorage.getItem(`afterschola_v4_${name}`) || '[]')
    return financialData({ sekolah: get('sekolah'), siswa: get('siswa'), trainer: get('trainer'), absensi: get('absensi'), honorPayments: get('honorPayments'), sppPayments: get('sppPayments'), periode: get('ui').selectedYear + '-08' })
  })
  expect(trialFinance.potensiSpp).toBe(350000)

  // Phase 6: Head Trainer records payment and closes finance through the app.
  await openTab(page, 'Data Siswa')
  const studentRow = page.locator('tr', { hasText: 'Andi Aktif Simulasi' }).first()
  await studentRow.locator('button[title="Catat pembayaran SPP"]').click()
  await expect(page.getByText('Catat Pembayaran SPP — Andi Aktif Simulasi')).toBeVisible()
  await field(page, 'Periode').selectOption(PERIOD)
  await field(page, 'Nominal').fill('100000')
  await field(page, 'Metode').selectOption({ label: 'Tunai-Admin' })
  await field(page, 'Diterima Oleh').fill('Head Trainer Simulasi')
  await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()

  const payments = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_sppPayments') || '[]'))
  expect(payments).toEqual(expect.arrayContaining([expect.objectContaining({ siswaId: 'sw-PST-sim-a', nominal: 100000, metode: 'Tunai-Admin', diterimaOleh: 'Head Trainer Simulasi' })]))
  await openTab(page, 'Data Keuangan')
  await expect(page.locator('div.space-y-1', { hasText: 'Pemasukan SPP' }).locator('h3')).toHaveText('Rp 250.000')

  await openTab(page, 'Data Pembayaran')
  await page.getByRole('button', { name: /Riwayat \(1\)/ }).first().click()
  await page.locator('button[title="Cetak Slip"]').first().click()
  await expect(page.getByRole('heading', { name: 'Slip Honor Trainer' })).toBeVisible()
  await page.getByRole('button', { name: 'Cetak Slip', exact: true }).click()

  await openTab(page, 'Data Sekolah')
  await page.locator('button[title="Kelola Invoice"]').first().click()
  await expect(page.getByRole('heading', { name: 'Invoice — SD Harapan Simulasi' })).toBeVisible()
  await expect(page.getByText('Rp 200.000', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Simpan sebagai Draft' }).click()
  await page.getByRole('button', { name: 'Terbitkan', exact: true }).click()
  await page.getByRole('button', { name: 'Ya, Lanjutkan', exact: true }).click()
  await expect(page.getByText('Terbit', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tandai Lunas', exact: true }).click()
  await page.getByRole('button', { name: 'Ya, Lanjutkan', exact: true }).click()
  await expect(page.getByText('Lunas', { exact: true })).toBeVisible()
  await page.locator('div.fixed.inset-0.bg-slate-900\\/60').click({ position: { x: 4, y: 4 } })

  await openTab(page, 'Umur Piutang')
  await expect(page.getByText('SD Harapan Simulasi', { exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '2+ Bulan' })).toBeVisible()
  await openTab(page, 'Data Keuangan')
  await page.getByRole('button', { name: 'Semester', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ganjil (Jul–Des)', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ganjil (Jul–Des)', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: 'Total', exact: true })).toBeVisible()

  // Phase 7: branch aggregation, client-side scope, and offline sync queue.
  await openTab(page, 'Overview')
  const branchSelect = page.getByLabel('Cabang', { exact: true })
  await expect(branchSelect).toHaveValue('')
  await expect(page.getByText('Rp 250.000').first()).toBeVisible()
  await branchSelect.selectOption({ label: 'Cabang Bandung Simulasi (BDG)' })
  await expect(page.getByText('Rp 150.000').first()).toBeVisible()
  await expect(page.getByText('Rp 250.000')).toHaveCount(0)
  await branchSelect.selectOption({ label: 'Cabang Pusat Simulasi (PST)' })
  await expect(page.getByText('Rp 100.000').first()).toBeVisible()
  await expect(page.getByText('Rp 150.000')).toHaveCount(0)

  await page.evaluate(() => localStorage.setItem('afterschola_v4_syncLog', JSON.stringify([])))
  const syncResult = await page.evaluate(async ({ schoolId, trainerId, period }) => {
    const { upsert, getSyncStatus } = await import('/src/lib/store.js')
    upsert('absensi', {
      id: 'abs-PST-sync-sim',
      tanggal: new Date().toISOString().slice(0, 10),
      periode: period,
      sekolahId: schoolId,
      trainerId,
      trainerStatus: 'Hadir',
      siswaList: [],
    })
    return getSyncStatus()
  }, { schoolId: SCHOOL_PUSAT, trainerId: TRAINER_PUSAT, period: PERIOD })
  expect(syncResult.pending).toBe(1)
  await expect(page.getByRole('button', { name: /Sinkronisasi \(1\)/ })).toBeVisible()

  let syncPayload = null
  await page.route('**/api/sync.php', async route => {
    syncPayload = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced: 0, alreadyApplied: ['abs-PST-sync-sim'], failed: [] }) })
  })
  await page.getByRole('button', { name: /Sinkronisasi \(1\)/ }).click()
  await expect(page.getByRole('button', { name: 'Sinkronisasi', exact: true })).toBeVisible()
  expect(syncPayload.entries).toHaveLength(1)
  expect(syncPayload.entries[0].key).toBe('absensi')
  expect(syncPayload.entries[0].record.sekolahId).toBe(SCHOOL_PUSAT)
  expect(syncPayload.entries[0].record).not.toHaveProperty('cabang')
  expect(syncPayload.entries[0].record).not.toHaveProperty('trainer')

  const finalSnapshot = await page.evaluate(() => ({
    pending: JSON.parse(localStorage.getItem('afterschola_v4_syncLog') || '[]'),
    branches: JSON.parse(localStorage.getItem('afterschola_v4_cabang') || '[]'),
    masterData: Object.keys(localStorage).filter(storageKey => storageKey.includes('sekolah') || storageKey.includes('trainer') || storageKey.includes('siswa')),
  }))
  expect(finalSnapshot.pending).toHaveLength(0)
  expect(finalSnapshot.branches).toHaveLength(2)
  expect(finalSnapshot.masterData.length).toBeGreaterThanOrEqual(3)
  expect(pageErrors).toHaveLength(0)
})
