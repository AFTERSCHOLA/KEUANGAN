import { test, expect } from './fixtures.js'

// ============================================================
// FLOW SIMULATION — Trainer "day in the life" vs Head Trainer
// "month-end close". This spec drives the REAL app and injects
// planned attendance and SPP ledger fields straight into localStorage
// to verify the Trainer ↔ Head Trainer handoff end to end.
//
// Goal: expose loopholes in the Trainer ↔ Head Trainer flow that
// a feature checklist would miss (e.g. "the trainer needs a
// Students Data tab even though the menu is already correct").
// ============================================================

const APP = 'http://localhost:5173'
const SCH = 'SD Harapan Bangsa'
const SCH2 = 'SD Mentari Pagi'
const TRAINER = 'Budi Santoso'
const TRAINER2 = 'Dewi Lestari'
const SISWA_A = 'Andi Pratama'
const SISWA_B = 'Bunga Citra'
const SISWA_C = 'Citra Lestari'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__flow_sim_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__flow_sim_reset_done', '1')
  })
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
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

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

function thisMonthDate(day) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(day).padStart(2, '0')}`
}

// Seed realistic base data through the real admin UI.
async function seedBase(page) {
  // School A + School B.
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH)
  await field(page, 'SPP Bulanan').fill('100000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH2)
  await field(page, 'SPP Bulanan').fill('120000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Trainer A (Budi → School A), Trainer B (Dewi → School B).
  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.locator('label', { hasText: SCH }).first().getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER2)
  await field(page, 'Honor per Kedatangan').fill('60000')
  await page.locator('label', { hasText: SCH2 }).first().getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Students: 2 in School A, 1 in School B.
  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SISWA_A)
  await field(page, 'Kelas').fill('5A')
  await field(page, 'Sekolah').selectOption({ label: SCH })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SISWA_B)
  await field(page, 'Kelas').fill('4B')
  await field(page, 'Sekolah').selectOption({ label: SCH })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SISWA_C)
  await field(page, 'Kelas').fill('3C')
  await field(page, 'Sekolah').selectOption({ label: SCH2 })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
}

// Inject the PLANNED fields into the seeded records so the CURRENT UI is
// forced to confront the future schema (M5.2 + M6.1). We do NOT add the
// UI for them — that's exactly the point of the simulation.
async function injectPlannedFields(page) {
  await page.evaluate(({ SCH, SCH2, TRAINER, TRAINER2, SISWA_A, SISWA_B, SISWA_C }) => {
    const get = (k) => JSON.parse(localStorage.getItem(`afterschola_v4_${k}`) || '[]')
    const set = (k, v) => localStorage.setItem(`afterschola_v4_${k}`, JSON.stringify(v))

    const sekolah = get('sekolah')
    const trainer = get('trainer')
    const siswa = get('siswa')
    const absensi = get('absensi')

    const budi = trainer.find(t => t.nama === TRAINER)
    const dewi = trainer.find(t => t.nama === TRAINER2)
    const schA = sekolah.find(s => s.nama === SCH)
    const schB = sekolah.find(s => s.nama === SCH2)
    const andi = siswa.find(s => s.nama === SISWA_A)
    const bunga = siswa.find(s => s.nama === SISWA_B)
    const citra = siswa.find(s => s.nama === SISWA_C)

    // Absensi with PLANNED fields: asisten, dokumentasi (two slots),
    // catatan, statusVerifikasi. Represents what M5.2 will write.
    const sessions = [
      {
        id: 'abs-sim-1',
        tanggal: '2026-08-10',
        periode: '2026-08',
        sekolahId: schA.id,
        trainerId: budi.id,
        trainerNama: TRAINER,
        trainerStatus: 'Hadir',
        asistenId: dewi.id,
        asistenNama: TRAINER2,
        dokumentasi: [
          { slot: 'kehadiran', type: 'dataurl', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' },
          { slot: 'kegiatan', type: 'dataurl', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' },
        ],
        catatan: 'Latihan membaca; 1 siswa izin lomba.',
        statusVerifikasi: null,
        siswaList: [
          { siswaId: andi.id, nama: SISWA_A, status: 'Hadir' },
          { siswaId: bunga.id, nama: SISWA_B, status: 'Tidak Hadir' },
        ],
      },
      {
        id: 'abs-sim-2',
        tanggal: '2026-08-11',
        periode: '2026-08',
        sekolahId: schB.id,
        trainerId: dewi.id,
        trainerNama: TRAINER2,
        trainerStatus: 'Hadir',
        asistenId: null,
        asistenNama: '',
        dokumentasi: [],
        catatan: 'Tidak ada foto — handphone mati.',
        statusVerifikasi: null,
        siswaList: [{ siswaId: citra.id, nama: SISWA_C, status: 'Hadir' }],
      },
    ]
    set('absensi', sessions)

    // SPP payment ledger (M6.1) — the head trainer records a channel-aware
    // payment. The CURRENT StudentList still reads `sppLunas`, so this is
    // exactly the future divergence point.
    const sppPayments = [
      {
        id: 'sp-sim-1',
        siswaId: andi.id,
        periode: '2026-08',
        nominal: 100000,
        tanggalBayar: '2026-08-12',
        metode: 'Tunai-Trainer',
        diterimaOleh: budi.id,
        sudahDisetor: false,
        bukti: null,
      },
    ]
    set('sppPayments', sppPayments)
  }, { SCH, SCH2, TRAINER, TRAINER2, SISWA_A, SISWA_B, SISWA_C })
}

test('flow simulation: Trainer day + Head Trainer month-end exposes handoff gaps', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await gotoApp(page)

  // ---- ADMIN SEEDS. ----
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await seedBase(page)

  // ---- INJECT THE FUTURE SCHEMA. ----
  await injectPlannedFields(page)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // ============================================================
  // PHASE 1 — TRAINER DAY (Budi, School A only)
  // ============================================================
  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await page.getByRole('button', { name: 'Pilih peran Trainer' }).click()
  await page.locator('select').first().selectOption({ label: TRAINER })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()

  // Trainer tabs are correct (menu-level check — already proven in M5.1.2).
  const trainerNav = page.getByRole('navigation').getByRole('button')
  await expect(trainerNav).toHaveCount(4)

  // M5.3.2: Rekap Saya exposes a real trainer landing surface.
  await expect(page.getByText('Jadwal hari ini dan ringkasan honor periode')).toBeVisible()
  await expect(page.getByText(/Sesi Hadir|Tarif per Sesi|Honor Dibayar|Sisa Honor/).first()).toBeVisible()

  // M5.2/M5.3: the trainer can capture and retain proof details.
  await openTab(page, 'Data Absensi')
  await page.getByRole('button', { name: 'Input Absensi' }).click()
  await expect(field(page, 'Sekolah')).toBeVisible()
  await expect(page.locator('label').filter({ hasText: 'Asisten' }).first()).toBeVisible()
  await expect(page.getByText(/Foto Kehadiran|Foto Kegiatan/).first()).toBeVisible()
  await expect(page.getByText(/Catatan/).first()).toBeVisible()

  // GAP CHECK 2: Trainer can only reach students through the read-only
  // "Data Siswa" tab, but the read-only list still shows only the "SPP
  // Bulan Ini" column (hardcoded "Belum Bayar"). The planned flow wants
  // the trainer to see "who's enrolled" to run attendance. That works, but
  // the SPP status is financial noise — not useful to the trainer.
  await openTab(page, 'Data Siswa')
  await expect(page.getByText('Manajemen Siswa')).toBeVisible()
  await expect(page.getByText(SISWA_A, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(SISWA_B, { exact: true }).first()).toBeVisible()
  // School B's student is correctly hidden (role scope works).
  await expect(page.getByText(SISWA_C, { exact: true })).toHaveCount(0)

  // M5.3.1b: own history is proof-visible before self-certification.
  await openTab(page, 'Riwayat Absensi')
  await expect(page.getByText('Riwayat Absensi Saya')).toBeVisible()
  await expect(page.getByText(/Latihan membaca/)).toBeVisible()
  await expect(page.getByText(TRAINER2, { exact: true })).toBeVisible()
  await expect(page.locator('img[alt="Foto Kehadiran"]')).toBeVisible()
  await expect(page.locator('img[alt="Foto Kegiatan"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Saya nyatakan absensi minggu ini sesuai dokumen kertas' })).toBeVisible()

  // ============================================================
  // PHASE 2 — HEAD TRAINER MONTH-END (switch back to Admin)
  // ============================================================
  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()

  // M5.3.1: Head Trainer receives the exception-filtered verification queue.
  await openTab(page, 'Riwayat Absensi')
  await expect(page.getByText('Antrian Verifikasi')).toBeVisible()
  await expect(page.getByText(/Tanpa foto bukti sesi|Kemunculan pertama siswa/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verifikasi' }).first()).toBeVisible()

  // M6.1: the ledger-only payment reaches student status without requiring
  // a manually edited sppLunas cache.
  await openTab(page, 'Data Siswa')
  await expect(page.getByText('Lunas', { exact: true }).first()).toBeVisible()

  // M6.1: finance reads the ledger nominal directly.
  await openTab(page, 'Data Keuangan')
  await expect(page.locator('div.space-y-1', { hasText: 'Pemasukan SPP' }).locator('h3')).toHaveText('Rp 100.000')

  // GAP CHECK 6: Honor payments show the trainer's accrued honor, but there
  // is no Slip Honor button (planned M6.2.1). Month-end "print the slip" is
  // currently impossible — the head trainer still has to export to CSV.
  await openTab(page, 'Data Pembayaran')
  await expect(page.getByText('Lembar Pembayaran Honor Trainer')).toBeVisible()
  await expect(page.getByRole('button', { name: /Cetak Slip|Slip Honor/i })).toHaveCount(0)

  // GAP CHECK 7: Finance report has no invoice, aging, or range controls.
  await openTab(page, 'Data Keuangan')
  await expect(page.getByText('Laporan Keuangan Laba Rugi')).toBeVisible()
  await expect(page.getByRole('button', { name: /Invoice/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Rentang Kustom', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Semester', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tahun Ajaran', exact: true })).toBeVisible()

  // ============================================================
  // PHASE 3 — ASSERT THE REPAIRED DATA FLOW END-TO-END
  // ============================================================
  const storeSnapshot = await page.evaluate(async () => {
    const mod = await import('/src/lib/store.js')
    return {
      absensi: mod.readCached('absensi'),
      sppPaymentsExist: !!localStorage.getItem('afterschola_v4_sppPayments'),
      siswa: mod.readCached('siswa'),
    }
  })
  expect(storeSnapshot.absensi.length).toBe(2)
  expect(storeSnapshot.sppPaymentsExist).toBe(true)
  const andi = storeSnapshot.siswa.find(s => s.nama === SISWA_A)
  expect(andi && Object.keys(andi.sppLunas || {}).length === 0).toBe(true)

  expect(pageErrors).toHaveLength(0)
})
