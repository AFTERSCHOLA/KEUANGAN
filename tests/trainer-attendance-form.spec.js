import { test, expect, loginViaApi, primeCsrf, createTrainerSuperadmin, readEntity, deleteSekolah } from './fixtures.js'

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

// SF.3 — asisten whose assignment lives on the HOST trainer's record
// (F-SF1): own trainer cache = own record only (penugasanPengajar reset
// to []), sekolah cache = server-scoped host-assigned schools, scope
// via the real /api/myPenugasan.php lane (no route stub — the point is
// the client/server union agrees end to end). Row A uses the legacy
// asistenId slot, row B the asistenIds[] slot (DC.C.1 union, both legs).
async function updateTrainerPenugasanAsSuperadmin(page, csrf, trainerId, rows) {
  const listRes = await page.request.get('/api/read.php?entity=trainer', {
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!listRes.ok()) {
    throw new Error(`read trainer failed: ${listRes.status()} ${await listRes.text()}`)
  }
  const list = await listRes.json()
  const current = list.find(t => t.id === trainerId)
  if (!current) {
    throw new Error(`trainer ${trainerId} tidak ditemukan di /api/read.php?entity=trainer`)
  }
  const { cabangId: _omitCabangId, ...rest } = current
  const updateRes = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { ...rest, id: trainerId, action: 'update', penugasanPengajar: rows },
  })
  if (!updateRes.ok()) {
    throw new Error(`update penugasanPengajar failed: ${updateRes.status()} ${await updateRes.text()}`)
  }
}

async function seedHostHeldAssignmentAsSuperadmin(page, suffix) {
  // Sweep leaked fixtures from crashed runs: host trainers created by
  // this test carry "Host SF3 " names. Their host-held rows reference
  // TRAINER_ID, which would 422 later seeds via the BUG7 cross-host
  // guard — delete them (admin_cabang owns trainer delete, scoped to
  // its own branch) before seeding.
  await loginViaApi(page, 'adminCabang')
  let csrf = await primeCsrf(page)
  const trunkedTrainers = await readEntity(page, 'trainer', csrf)
  for (const t of trunkedTrainers.filter(t => typeof t?.nama === 'string' && t.nama.startsWith('Host SF3 '))) {
    await page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id: t.id, action: 'delete' },
    })
  }

  await loginViaApi(page, 'superadmin')
  csrf = await primeCsrf(page)
  const leakedSchools = (await readEntity(page, 'sekolah', csrf))
    .filter(s => typeof s?.nama === 'string' && s.nama.startsWith('SD SF.3 Host '))
  for (const s of leakedSchools) {
    await deleteSekolah(page, csrf, s.id)
  }

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const yearAhead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  async function createSchool(id, nama, jadwalList) {
    const res = await page.request.post('/api/sekolah.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id, nama, spp: 500000, cabangId: CABANG_ID, action: 'create', jadwalList },
    })
    if (!res.ok()) {
      throw new Error(`seed sekolah failed: ${res.status()} ${await res.text()}`)
    }
    return (await res.json()).id
  }

  // BUG7 (F-PG5) guard: one host payload cannot hold two unscoped
  // overlapping rows (any two unscoped rows in one payload conflict, no
  // occupant check). Scope the rows to different weekdays so the
  // server write gate accepts them; the form's date predicate
  // (isAssignmentActiveOnDate) ignores slot scope, so both schools stay
  // visible on any tanggal inside the range — same as unscoped rows.
  const schoolAId = await createSchool(`skl-SF3A-${suffix}`, `SD SF.3 Host A ${suffix}`,
    [{ dayOfWeek: 'Senin', time: '08:00', endTime: '09:00' }])
  const schoolBId = await createSchool(`skl-SF3B-${suffix}`, `SD SF.3 Host B ${suffix}`,
    [{ dayOfWeek: 'Selasa', time: '08:00', endTime: '09:00' }])

  const host = await createTrainerSuperadmin(
    page, csrf,
    `host-sf3-${suffix}`, `Host SF3 ${suffix}`, `Host SF3 ${suffix}`,
    CABANG_ID, [],
  )
  const hostTrainerId = host.user?.trainerId || host.trainer?.id || host.trainerId
  if (!hostTrainerId) {
    throw new Error(`host trainer create returned no trainerId: ${JSON.stringify(host)}`)
  }

  // F-SF1 premise: the asisten's own record carries no penugasan — the
  // pre-SF.3 trainers-loop derivation always computed an empty set here.
  // Reset FIRST: the BUG7 cross-host guard scans other hosts' rows, so a
  // leftover own assignment (unscoped, from an earlier seed) would 422
  // the host update below via the shared-occupant overlap.
  await updateTrainerPenugasanAsSuperadmin(page, csrf, TRAINER_ID, [])
  await updateTrainerPenugasanAsSuperadmin(page, csrf, hostTrainerId, [
    {
      id: `pgs-SF3A-${suffix}`,
      sekolahId: schoolAId,
      trainerId: hostTrainerId,
      asistenId: TRAINER_ID,
      asistenIds: null,
      cabangId: CABANG_ID,
      periodeMulai: yearAgo,
      periodeSelesai: yearAhead,
      aktif: true,
      hari: 'Senin',
      jamMulai: null,
      jamSelesai: null,
    },
    {
      id: `pgs-SF3B-${suffix}`,
      sekolahId: schoolBId,
      trainerId: hostTrainerId,
      asistenId: null,
      asistenIds: [TRAINER_ID],
      cabangId: CABANG_ID,
      periodeMulai: yearAgo,
      periodeSelesai: null,
      aktif: true,
      hari: 'Selasa',
      jamMulai: null,
      jamSelesai: null,
    },
  ])

  return { schoolAId, schoolBId, today, hostTrainerId, hostUserId: host.user?.id }
}

// Delete the host trainer record (admin_cabang owns trainer delete) and
// its schools + user so this test never poisons the shared DB for
// suites that seed trn-test-1 afterwards (BUG7 cross-host guard).
async function cleanupHostHeldAssignment(page, { schoolAId, schoolBId, hostTrainerId, hostUserId }) {
  try {
    await loginViaApi(page, 'adminCabang')
    const csrf = await primeCsrf(page)
    if (hostTrainerId) {
      await page.request.post('/api/trainer.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { id: hostTrainerId, action: 'delete' },
      })
    }
    if (hostUserId) {
      await page.request.post('/api/users.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { id: hostUserId, action: 'delete' },
      })
    }
  } catch { /* best-effort: never fail the test on cleanup */ }
  try {
    await loginViaApi(page, 'superadmin')
    const csrf = await primeCsrf(page)
    for (const id of [schoolAId, schoolBId]) {
      if (id) await deleteSekolah(page, csrf, id)
    }
  } catch { /* best-effort: never fail the test on cleanup */ }
}

test('SF.3: asisten sees host-held schools on covered date, empty message on uncovered date', async ({ page }) => {
  const suffix = String(Date.now()).slice(-6)
  const seed = await seedHostHeldAssignmentAsSuperadmin(page, suffix)
  const { schoolAId, schoolBId, today } = seed
  try {
    await loginViaApi(page, 'trainer')
    await gotoApp(page)
    await openTab(page, 'Absensi Saya')

    await expect(page.getByRole('heading', { name: 'Absensi Saya' })).toBeVisible()

    const sekolahSelect = page.locator('label', { hasText: 'Sekolah' }).first().locator('xpath=following-sibling::select[1]')

    // Covered date (default today): both host-held schools offered.
    await expect(sekolahSelect.locator(`option[value="${schoolAId}"]`)).toHaveCount(1)
    await expect(sekolahSelect.locator(`option[value="${schoolBId}"]`)).toHaveCount(1)
    await expect(page.getByText('Tidak ada penugasan aktif untuk tanggal ini.')).toHaveCount(0)

    // Uncovered date: host schools gone, verbatim empty message, Simpan disabled.
    await page.locator('input[type="date"]').fill('2020-01-01')
    await expect(sekolahSelect.locator(`option[value="${schoolAId}"]`)).toHaveCount(0)
    await expect(sekolahSelect.locator(`option[value="${schoolBId}"]`)).toHaveCount(0)
    await expect(page.getByText('Tidak ada penugasan aktif untuk tanggal ini. Minta Admin Cabang membuat penugasan.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Simpan Absensi' })).toBeDisabled()

    // Back to the covered date without remount: options return (D4 live derive).
    await page.locator('input[type="date"]').fill(today)
    await expect(sekolahSelect.locator(`option[value="${schoolAId}"]`)).toHaveCount(1)
    await expect(sekolahSelect.locator(`option[value="${schoolBId}"]`)).toHaveCount(1)
  } finally {
    await cleanupHostHeldAssignment(page, seed)
  }
})
