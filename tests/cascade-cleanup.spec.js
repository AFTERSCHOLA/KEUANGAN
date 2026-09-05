import { test, expect, loginViaApi, primeCsrf, readEntity } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF5.7 — cascade cleanup on sekolah + trainer
// delete. Surfaces the gaps M-AF5.6 documented at server/api/
// sekolah.php:31-33 (KNOWN GAP inline comment) and the trainer
// delete reverse-link gap noted at server/api/trainer.php:24 —
// both fixed server-side in this milestone. The SQL-level
// verification lives in server/tests/cascade-cleanup.php; this
// spec drives the cascade through the actual HTTP layer to
// prove the wiring is intact end-to-end.
//
// Strategy:
//   - Test A: drive sekolah delete via /api/sekolah.php with a
//     trainer-with-account bound to the sekolah (the trainer row
//     already has the sekolah in sekolahIds[]; the sekolah row
//     already has the trainer in trainerIds[]). Assert both
//     references are cleared, then assert the sekolah DELETE
//     returned 200 and a second DELETE on the same id 422s.
//   - Test B: drive trainer delete via /api/trainer.php under
//     admin_cabang (the only role that can delete a trainer),
//     re-login as superadmin to read back the sekolah row, and
//     assert the trainer id is gone from sekolah.trainerIds[]
//     while the sekolah row itself remains intact.
// ============================================================

const APP = 'http://localhost:5173'
const SIM_TAG = 'M-AF5.7'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__af57_reset')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__af57_reset', '1')
  })
}

async function deleteSekolah(page, csrf, id) {
  const res = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id, action: 'delete' },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`deleteSekolah(${id}) failed: ${res.status()} ${body}`)
  }
}

async function deleteTrainer(page, csrf, id) {
  const res = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id, action: 'delete' },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`deleteTrainer(${id}) failed: ${res.status()} ${body}`)
  }
}

test('M-AF5.7: sekolah delete via /api/sekolah.php nullifies trainer.sekolahIds[]', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)

  const suffix = String(Date.now()).slice(-6)
  const cabangId = `cbg-${SIM_TAG.toLowerCase()}-${suffix}`
  const sekolahId = `sch-${SIM_TAG.toLowerCase()}-${suffix}`

  // Seed parent branch + sekolah + trainer-with-account bound to that
  // sekolah. The with-account path (users.php:createTrainerRecord +
  // users.php:230-249 reverse-link loop) populates BOTH sides:
  //   trainer.payload.sekolahIds = [sekolahId]
  //   sekolah.payload.trainerIds = [trainerId]
  // The kode includes the suffix so it survives repeated test runs
  // without colliding on the UNIQUE KEY uq_cabang_kode (kode) constraint
  // — leftover Sim-* branches from prior runs stay in place.
  const kode = `MC${suffix.slice(-4).toUpperCase()}`
  await page.request.post('/api/cabang.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'create', id: cabangId, kode, nama: `${SIM_TAG} Cabang ${suffix}` },
  })
  await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'create', id: sekolahId, nama: `${SIM_TAG} Sekolah`, spp: 100000, cabangId },
  })
  const trainerIdPlaceholder = `trn-${SIM_TAG.toLowerCase()}-${suffix}` // informational; the server mints the real id (users.php:198)
  const username = `trainer.${SIM_TAG.toLowerCase()}.${suffix}.test`
  const createTrainerRes = await page.request.post('/api/users.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'create',
      role: 'trainer',
      username,
      displayName: `${SIM_TAG} Trainer`,
      cabangId,
      trainer: { nama: `${SIM_TAG} Trainer`, wa: '08123456789', jadwal: 'Senin', honor: 50000, sekolahIds: [sekolahId] },
    },
  })
  if (!createTrainerRes.ok()) {
    throw new Error(`createTrainer failed: ${createTrainerRes.status()} ${await createTrainerRes.text()}`)
  }
  const trainerBody = await createTrainerRes.json()
  const trainerId = trainerBody.user?.trainerId || trainerBody.trainerId || trainerIdPlaceholder

  // ---- ASSERT (pre): both references are populated. ----
  let trainers = await readEntity(page, 'trainer', csrf)
  let trainer = trainers.find(t => t.id === trainerId)
  expect(trainer).toBeTruthy()
  expect(trainer.sekolahIds || []).toContain(sekolahId)

  let sekolahs = await readEntity(page, 'sekolah', csrf)
  let sekolah = sekolahs.find(s => s.id === sekolahId)
  expect(sekolah).toBeTruthy()
  expect(sekolah.trainerIds || []).toContain(trainerId)

  // ---- DELETE the sekolah via /api/sekolah.php ----
  await deleteSekolah(page, csrf, sekolahId)

  // ---- ASSERT (post-delete): sekolah row is gone ----
  sekolahs = await readEntity(page, 'sekolah', csrf)
  expect(sekolahs.find(s => s.id === sekolahId)).toBeUndefined()

  // ---- ASSERT (cascade): trainer.sekolahIds[] no longer references it ----
  trainers = await readEntity(page, 'trainer', csrf)
  trainer = trainers.find(t => t.id === trainerId)
  expect(trainer).toBeTruthy()
  expect(trainer.sekolahIds || []).not.toContain(sekolahId)

  // The trainer itself is preserved (cascade nulls the FK, doesn't drop
  // the trainer row — taste #35 reference-preservation).
  expect(trainer.nama).toBe(`${SIM_TAG} Trainer`)

  // ---- ASSERT (idempotence via 422): a second DELETE on the same id
  // 422s (record not found) and emits no additional cascade. ----
  const secondDelete = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: sekolahId, action: 'delete' },
  })
  expect(secondDelete.status()).toBe(422)

  expect(pageErrors).toHaveLength(0)
})

test('M-AF5.7: trainer delete via /api/trainer.php strips id from sekolah.trainerIds[]', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'superadmin')
  const csrfSuper = await primeCsrf(page)

  const suffix = String(Date.now()).slice(-6) + 'b'

  // Use cbg-test-pusat (the seeded admin.cabang@test.local branch) so
  // the admin_cabang role guard at trainer.php:21-23 passes when we
  // delete the trainer. sekolah + trainer are both bound to that branch.
  const sekolahId = `sch-${SIM_TAG.toLowerCase()}-pusat-${suffix}`
  const createSekolahRes = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrfSuper },
    data: { action: 'create', id: sekolahId, nama: `${SIM_TAG} Sekolah Pusat`, spp: 100000, cabangId: 'cbg-test-pusat' },
  })
  if (!createSekolahRes.ok()) {
    throw new Error(`createSekolah pusat failed: ${createSekolahRes.status()} ${await createSekolahRes.text()}`)
  }
  const trainerIdPlaceholder = `trn-${SIM_TAG.toLowerCase()}-pusat-${suffix}` // informational; server mints the real id (users.php:198)
  const username = `trainer.${SIM_TAG.toLowerCase()}.pusat.${suffix}.test`
  const createTrainerRes = await page.request.post('/api/users.php', {
    headers: { 'X-CSRF-Token': csrfSuper },
    data: {
      action: 'create',
      role: 'trainer',
      username,
      displayName: `${SIM_TAG} Trainer Pusat`,
      cabangId: 'cbg-test-pusat',
      trainer: { nama: `${SIM_TAG} Trainer Pusat`, wa: '08123456789', jadwal: 'Rabu', honor: 50000, sekolahIds: [sekolahId] },
    },
  })
  if (!createTrainerRes.ok()) {
    throw new Error(`createTrainer pusat failed: ${createTrainerRes.status()} ${await createTrainerRes.text()}`)
  }
  const trainerBody = await createTrainerRes.json()
  const pusatTrainerId = trainerBody.user?.trainerId || trainerBody.trainerId || trainerIdPlaceholder

  // ---- ASSERT (pre): sekolah.trainerIds[] contains the trainer id. ----
  let sekolahs = await readEntity(page, 'sekolah', csrfSuper)
  let sekolah = sekolahs.find(s => s.id === sekolahId)
  expect(sekolah).toBeTruthy()
  expect(sekolah.trainerIds || []).toContain(pusatTrainerId)

  // ---- Login as admin_cabang (bound to cbg-test-pusat) and delete the
  // trainer. This is the only way the role guard at trainer.php:21-23
  // passes. ----
  await page.request.post('/api/auth/logout.php')
  await loginViaApi(page, 'adminCabang')
  const csrfAdmin = await primeCsrf(page)
  await deleteTrainer(page, csrfAdmin, pusatTrainerId)

  // Re-login as superadmin to read back across branches (admin_cabang's
  // read filter is branch-scoped — fine here since the sekolah IS in
  // cbg-test-pusat, but superadmin keeps the assertion independent of
  // the read-filter's branch logic).
  await page.request.post('/api/auth/logout.php')
  await loginViaApi(page, 'superadmin')
  const csrfSuper2 = await primeCsrf(page)
  sekolahs = await readEntity(page, 'sekolah', csrfSuper2)
  sekolah = sekolahs.find(s => s.id === sekolahId)
  expect(sekolah).toBeTruthy()

  // ---- ASSERT (cascade): pusatTrainerId is no longer in sekolah.trainerIds[] ----
  expect(sekolah.trainerIds || []).not.toContain(pusatTrainerId)

  // ---- ASSERT (reference-preserving): sekolah row itself survives. ----
  expect(sekolah.nama).toBe(`${SIM_TAG} Sekolah Pusat`)
  expect(sekolah.id).toBe(sekolahId)

  expect(pageErrors).toHaveLength(0)
})