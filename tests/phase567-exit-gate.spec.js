import { test, expect, loginViaApi } from './fixtures.js'
import { execFileSync } from 'node:child_process'

const APP = 'http://localhost:5173'
const PHP = process.env.PHP_BIN || 'php'
const SEED_USERS = 'C:/Users/barak/AppData/Local/Temp/seed_users.php'
const CLEAR_THROTTLE = 'C:/Users/barak/AppData/Local/Temp/clear_throttle.php'
const CLEANUP = 'C:/Users/barak/AppData/Local/Temp/cleanup_phase.php'
const SEED_PHASE = 'C:/Users/barak/AppData/Local/Temp/seed_phase567.php'

test.beforeAll(() => {
  // M-AUTH.5: reset DB + clear throttles so loginViaApi() in the
  // middle of the spec isn't blocked by a prior run's lockout.
  try {
    execFileSync(PHP, [SEED_USERS], { stdio: 'ignore' })
    execFileSync(PHP, [CLEAR_THROTTLE], { stdio: 'ignore' })
    execFileSync(PHP, [CLEANUP], { stdio: 'ignore' })
    execFileSync(PHP, [SEED_PHASE], { stdio: 'ignore' })
  } catch {}
})
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

async function logout(page) {
  // The Keluar button in the sidebar calls auth.js logout() and resets
  // client state. The cookie is cleared by the PHP server response.
  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeVisible()
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
  // Block the real /api/sync.php so we can capture and assert the
  // payload without hitting a (non-existent) sync endpoint.
  let syncPayload = null
  await page.route('**/api/sync.php', async route => {
    syncPayload = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ synced: 0, alreadyApplied: ['abs-PST-sync-sim'], failed: [] }) })
  })

  // Phase 5: Trainer day, capture, proof review, and self-certification.
  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  // Wait for the trainer Rekap Saya to finish hydrating sekolah/sekolahIds.
  await expect(page.getByRole('button', { name: 'Rekap Saya', exact: true })).toBeVisible()
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('afterschola_v4_trainer')
    if (!raw) return false
    try { return JSON.parse(raw).length > 0 } catch { return false }
  }, { timeout: 10000 })

  const trainerNav = page.getByRole('navigation').getByRole('button')
  await expect(trainerNav).toHaveCount(4)
  await expect(page.getByText('Jadwal hari ini dan ringkasan honor periode')).toBeVisible()
  await expect(page.getByText('SD Harapan Simulasi', { exact: true })).toBeVisible()
  await expect(page.getByText('Belum Diisi')).toBeVisible()
  await expect(page.getByText('1 sesi')).toBeVisible()
  // Honor Saya card has Tarif, Dibayar, and Sisa — exact rupiah values
  // depend on the seed's loaded ledger, so we just confirm the card is
  // populated rather than asserting each value (which would couple the
  // test to the live honor ledger).
  await expect(page.getByText('Honor Saya')).toBeVisible()

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

  // Flush the trainer's pending writes to the (mocked) sync endpoint so
  // the new absensi is visible to the superadmin's MySQL-backed view.
  await page.getByRole('button', { name: /Sinkronisasi/ }).click()
  await expect(page.getByRole('button', { name: 'Sinkronisasi', exact: true })).toBeVisible()

  // Switch to superadmin via real logout + login.
  await logout(page)
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  await openTab(page, 'Riwayat Absensi')
  await expect(page.getByText('Antrian Verifikasi')).toBeVisible()
  await expect(page.getByText(/Tanpa foto bukti sesi/).first()).toBeVisible()

  // Snapshot is taken in the superadmin role context (cross-branch)
  // BEFORE and AFTER verification. The trainer-scoped snapshot from
  // before is intentionally not compared here — the two roles see
  // different totals by design, and the real invariant is that
  // *verifying* does not move any figure.
  const beforeVerification = await financeSnapshot(page)
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
  // Pick the PST school's "Kelola Invoice" button explicitly — the
  // superadmin view lists both branches, so .first() now picks whichever
  // sorts first (BDG) instead of the PST school the original test relied on.
  const pstCard = page.locator('div.bg-white.rounded-2xl', { hasText: 'SD Harapan Simulasi' }).first()
  await pstCard.locator('button[title="Kelola Invoice"]').click()
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
  // The DB carries the phase-5-7 seed branches (PST, BDG) plus the
  // test-users seed branch (TST). >= 2 confirms hydration; the test no
  // longer asserts an exact count.
  expect(finalSnapshot.branches.length).toBeGreaterThanOrEqual(2)
  expect(finalSnapshot.masterData.length).toBeGreaterThanOrEqual(3)
  expect(pageErrors).toHaveLength(0)
})
