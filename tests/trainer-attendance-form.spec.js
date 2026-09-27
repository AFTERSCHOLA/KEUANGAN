import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// TA.B.3 — Trainer self-attendance form (absensiPengajar).
//
// VERIFY (TRAINER_ATTENDANCE_MILESTONES.md TA.B.3):
// -> form tampil;
// -> sekolah hanya assignment valid;
// -> Hadir/Izin/Alpa dapat disimpan;
// -> EXPO/Pengganti/Lainnya tersimpan.
//
// FIX dari draft sebelumnya: seed sekolah + penugasanPengajar HARUS
// lewat session superadmin, bukan trainer — trainer tidak berwenang
// membuat sekolah (TRAINER_ATTENDANCE_PLAN.md §7 Access model: trainer
// hanya boleh melihat/mengisi absensinya sendiri, tidak mengelola data
// master). Draft sebelumnya salah asumsi dan gagal 422 "cabangId tidak
// ditemukan" karena trainer punya cabangId:null (trainer discope lewat
// trainerId, bukan cabangId — lihat App.jsx getRoleContext() pola role
// trainer). Sekarang: login superadmin dulu untuk seeding, baru
// loginViaApi(page, 'trainer') lagi untuk bagian UI (cookie di-overwrite
// bersih oleh addCookies() setiap panggilan loginViaApi).
//
// Uses the canonical trn-test-1 trainer (tests/fixtures.js:
// trainer@test.local, trainerId=trn-test-1) dan cbg-test-pusat sebagai
// cabang seed canonical (dipakai berulang di spec lain seperti
// invoice-installment.spec.js saat login sebagai superadmin).
// ============================================================

const APP = 'http://localhost:5173'
const TRAINER_ID = 'trn-test-1'
const CABANG_ID = 'cbg-test-pusat'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

// Seed satu sekolah + satu penugasan aktif untuk trn-test-1, dilakukan
// SEBAGAI SUPERADMIN (trainer tidak berwenang menulis sekolah/trainer).
// Rentang periode mencakup hari ini supaya test tidak flaky terhadap
// tanggal jalannya test.
async function seedActiveAssignmentAsSuperadmin(page, namaSekolah) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)

  // The attendance forms stamp LOCAL calendar date (localDateString() in
  // src/lib/constants.js) — never UTC. `today` must use the same convention
  // or exact-tanggal assertions miss during UTC+X evenings (2026-09-24).
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const yearAhead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const sekolahRes = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      id: `skl-TAB3-${Date.now()}`,
      nama: namaSekolah,
      spp: 500000,
      cabangId: CABANG_ID,
      action: 'create',
    },
  })
  if (!sekolahRes.ok()) {
    throw new Error(`seed sekolah failed: ${sekolahRes.status()} ${await sekolahRes.text()}`)
  }
  const sekolah = await sekolahRes.json()
  const sekolahId = sekolah.id

  // Update wajib kirim `version` yang terakhir dibaca (_master.php optimistic
  // concurrency, baris ~112-114: clientVersion !== existing.version -> 409).
  // Ambil data + version terkini dulu via /api/read.php sebelum update.
  const trainerListRes = await page.request.get('/api/read.php?entity=trainer', {
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!trainerListRes.ok()) {
    throw new Error(`read trainer failed: ${trainerListRes.status()} ${await trainerListRes.text()}`)
  }
  const trainerList = await trainerListRes.json()
  const currentTrainer = trainerList.find(t => t.id === TRAINER_ID)
  if (!currentTrainer) {
    throw new Error(`trainer ${TRAINER_ID} tidak ditemukan di /api/read.php?entity=trainer`)
  }

  const { cabangId: _omitCabangId, ...trainerWithoutCabang } = currentTrainer

  const assignmentId = `pgs-TAB3-${Date.now()}`
  const trainerUpdateRes = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      ...trainerWithoutCabang,
      id: TRAINER_ID,
      action: 'update',
      penugasanPengajar: [{
        id: assignmentId,
        sekolahId,
        trainerId: TRAINER_ID,
        asistenId: null,
        cabangId: CABANG_ID,
        periodeMulai: yearAgo,
        periodeSelesai: yearAhead,
        aktif: true,
      }],
    },
  })
  if (!trainerUpdateRes.ok()) {
    throw new Error(`seed penugasanPengajar failed: ${trainerUpdateRes.status()} ${await trainerUpdateRes.text()}`)
  }

  return { sekolahId, sekolahNama: namaSekolah, today }
}

// Sekolah TANPA penugasan, dibuat sebagai superadmin juga.
async function seedUnassignedSchoolAsSuperadmin(page, namaSekolah) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)

  const sekolahRes = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      id: `skl-TAB3-unassigned-${Date.now()}`,
      nama: namaSekolah,
      spp: 500000,
      cabangId: CABANG_ID,
      action: 'create',
    },
  })
  if (!sekolahRes.ok()) {
    throw new Error(`seed unassigned sekolah failed: ${sekolahRes.status()} ${await sekolahRes.text()}`)
  }
  return sekolahRes.json()
}

test('TA.B.3: form absensi tampil, sekolah hanya dari assignment aktif, Hadir tersimpan', async ({ page }) => {
  const suffix = String(Date.now()).slice(-6)
  const { sekolahId, today } = await seedActiveAssignmentAsSuperadmin(page, `SD TA.B.3 ${suffix}`)

  await loginViaApi(page, 'trainer')
  await gotoApp(page)
  await openTab(page, 'Absensi Saya')

  await expect(page.getByRole('heading', { name: 'Absensi Saya' })).toBeVisible()
  await expect(page.getByText('Tanggal', { exact: true })).toBeVisible()
  await expect(page.getByText('Sekolah', { exact: true })).toBeVisible()

  const sekolahSelect = page.locator('select').filter({ has: page.locator(`option[value="${sekolahId}"]`) })
  await expect(sekolahSelect).toBeVisible()
  await expect(page.getByText('Tidak ada penugasan aktif untuk tanggal ini.')).not.toBeVisible()

  await sekolahSelect.selectOption(sekolahId)
  await page.getByRole('button', { name: 'Hadir', exact: true }).click()
  await page.getByRole('button', { name: 'Simpan Absensi' }).click()

  await expect(page.getByText('Tersimpan')).toBeVisible({ timeout: 10000 })

  // DC.B.4 (D-DC1) — direct save: Tersimpan means server-persisted
  // (writeRemote); the Sinkronisasi queue is removed. Read back straight
  // from the server.

  const readRes = await page.request.get('/api/read.php?entity=absensiPengajar')
  expect(readRes.ok()).toBe(true)
  const rows = await readRes.json()
  const saved = rows.find(r => r.trainerId === TRAINER_ID && r.sekolahId === sekolahId && r.tanggal === today)
  expect(saved).toBeTruthy()
  expect(saved.status).toBe('Hadir')
})

test('TA.B.3: Izin dan Alpa dapat disimpan', async ({ page }) => {
  const suffix = String(Date.now()).slice(-6)
  const { sekolahId, today } = await seedActiveAssignmentAsSuperadmin(page, `SD TA.B.3 IzinAlpa ${suffix}`)

  await loginViaApi(page, 'trainer')
  await gotoApp(page)
  await openTab(page, 'Absensi Saya')

  const sekolahSelect = page.locator('select').filter({ has: page.locator(`option[value="${sekolahId}"]`) })
  await sekolahSelect.selectOption(sekolahId)
  await page.getByRole('button', { name: 'Izin', exact: true }).click()
  await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await expect(page.getByText('Tersimpan')).toBeVisible({ timeout: 10000 })

  // DC.B.4 (D-DC1) — direct save: Tersimpan means server-persisted
  // (writeRemote); the Sinkronisasi queue is removed. Read back straight
  // from the server.

  const readRes = await page.request.get('/api/read.php?entity=absensiPengajar')
  const rows = await readRes.json()
  const saved = rows.find(r => r.trainerId === TRAINER_ID && r.sekolahId === sekolahId && r.tanggal === today)
  expect(saved).toBeTruthy()
  expect(saved.status).toBe('Izin')
})

test('TA.B.3: keterangan EXPO/Pengganti/Lainnya tersimpan', async ({ page }) => {
  const suffix = String(Date.now()).slice(-6)
  const { sekolahId, today } = await seedActiveAssignmentAsSuperadmin(page, `SD TA.B.3 Keterangan ${suffix}`)

  await loginViaApi(page, 'trainer')
  await gotoApp(page)
  await openTab(page, 'Absensi Saya')

  const sekolahSelect = page.locator('select').filter({ has: page.locator(`option[value="${sekolahId}"]`) })
  await sekolahSelect.selectOption(sekolahId)
  await page.getByRole('button', { name: 'Hadir', exact: true }).click()

  const keteranganLabel = page.locator('label', { hasText: 'Keterangan' }).first()
  await keteranganLabel.locator('xpath=following-sibling::select[1]').selectOption('EXPO')

  await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await expect(page.getByText('Tersimpan')).toBeVisible({ timeout: 10000 })

  // DC.B.4 (D-DC1) — direct save: Tersimpan means server-persisted
  // (writeRemote); the Sinkronisasi queue is removed. Read back straight
  // from the server.

  const readRes = await page.request.get('/api/read.php?entity=absensiPengajar')
  const rows = await readRes.json()
  const saved = rows.find(r => r.trainerId === TRAINER_ID && r.sekolahId === sekolahId && r.tanggal === today)
  expect(saved).toBeTruthy()
  expect(saved.keterangan).toBe('EXPO')
})

test('TA.B.3: sekolah tanpa penugasan aktif tidak muncul di dropdown', async ({ page }) => {
  const suffix = String(Date.now()).slice(-6)
  const unassignedSekolah = await seedUnassignedSchoolAsSuperadmin(page, `SD Tidak Ditugaskan ${suffix}`)

  await loginViaApi(page, 'trainer')
  await gotoApp(page)
  await openTab(page, 'Absensi Saya')

  const unassignedOption = page.locator(`option[value="${unassignedSekolah.id}"]`)
  await expect(unassignedOption).toHaveCount(0)
})
