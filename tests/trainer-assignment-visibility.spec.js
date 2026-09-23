import { test, expect, loginViaApi, primeCsrf, readEntity, createSekolahSuperadmin } from './fixtures.js'

// ============================================================
// G2/G3c/U1 acceptance — assignment-only trainer visibility.
//
// A trainer linked to a school SOLELY via penugasanPengajar
// (legacy `sekolahIds` stays empty) must see, from their own
// login: the school's students (Data Siswa, G2 store.js:127),
// the school on Rekap Saya when scheduled today (G3c
// TrainerDashboard.jsx), and the school as selectable in
// Absensi Saya with no blocking notice (U1 copy + R-TA8).
//
// Setup runs as the seeded branch admin (cbg-test-pusat) — the
// faithful branch-ops path — except the sekolah create, which
// reuses the proven superadmin helper. All names carry a Sim-
// marker + run suffix; cleanup deletes in reverse order so a
// green run leaves zero rows behind.
// ============================================================

const APP = 'http://localhost:5173'
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

async function apiPost(page, csrf, url, data) {
  const res = await page.request.post(url, {
    headers: { 'X-CSRF-Token': csrf },
    data,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status(), body }
}

test('G2/G3c: assignment-only trainer sees students, Rekap school, and selectable Absensi school', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const stim = s => `${s} ${suffix}`
  const schoolName = stim('SD Sim Visibility')
  const studentName = stim('Siswa Sim Vis')
  const trainerUsername = `trs.sim.${suffix}`
  const trainerPass = `SimTrainer${suffix}!1`
  const pastDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  let trainerId = null
  let schoolId = null
  let siswaId = `sw-sim-vis-${suffix}`

  // ---- setup: sekolah (superadmin helper, proven path) ----
  await loginViaApi(page, 'superadmin')
  let csrf = await primeCsrf(page)
  const sch = await createSekolahSuperadmin(page, csrf, schoolName, 150000, 'cbg-test-pusat', `vis${suffix}`)
  schoolId = sch.id

  // ---- setup: everything else as the branch admin ----
  await loginViaApi(page, 'adminCabang')
  csrf = await primeCsrf(page)

  // All-days schedule so Rekap matches whatever weekday the run lands on.
  const schools = await readEntity(page, 'sekolah', csrf)
  const schoolRec = schools.find(s => s.id === schoolId)
  expect(schoolRec).toBeTruthy()
  delete schoolRec.cabangId // admin_cabang must not send it (sekolah.php:156-158)
  schoolRec.jadwalList = DAYS.map(d => ({ dayOfWeek: d, time: '08:00', endTime: '09:00' }))
  const schUpd = await apiPost(page, csrf, '/api/sekolah.php', { ...schoolRec, action: 'update' })
  expect(schUpd.status).toBe(200)

  // Trainer WITH login account, no legacy school links.
  const trnRes = await apiPost(page, csrf, '/api/users.php', {
    action: 'create',
    role: 'trainer',
    username: trainerUsername,
    displayName: stim('Trainer Sim Vis'),
    trainer: { nama: stim('Trainer Sim Vis'), wa: '08123456789', honor: 50000, sekolahIds: [] },
  })
  expect(trnRes.status).toBe(201)
  trainerId = trnRes.body.trainer.id
  const initialPassword = trnRes.body.initialPassword
  expect(trainerId).toBeTruthy()
  expect(initialPassword).toBeTruthy()

  // Penugasan on the trainer's own record (trainerId must match record id).
  const trainers = await readEntity(page, 'trainer', csrf)
  const trnRec = trainers.find(t => t.id === trainerId)
  expect(trnRec).toBeTruthy()
  delete trnRec.cabangId // admin_cabang must not send it (trainer.php:41-43)
  trnRec.penugasanPengajar = [{
    sekolahId: schoolId,
    trainerId,
    asistenId: null,
    aktif: true,
    periodeMulai: pastDate,
    periodeSelesai: null,
    cabangId: 'cbg-test-pusat',
  }]
  const trnUpd = await apiPost(page, csrf, '/api/trainer.php', { ...trnRec, action: 'update', version: trnRec.version })
  expect(trnUpd.status).toBe(200)

  // One student in the assigned school.
  const ssw = await apiPost(page, csrf, '/api/siswa.php', {
    action: 'create', id: siswaId, nama: studentName, sekolahId: schoolId, status: 'Aktif',
  })
  expect(ssw.status).toBe(201)

  // ---- trainer session: rotate the must-change password, then assert ----
  await loginViaApi(page, 'trainer', { credentials: { username: trainerUsername, password: initialPassword } })
  csrf = await primeCsrf(page)
  const chg = await apiPost(page, csrf, '/api/auth/change-password.php', {
    currentPassword: initialPassword, newPassword: trainerPass,
  })
  expect(chg.status).toBe(200)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Data Siswa shows the assigned school's student (G2).
  await page.getByRole('button', { name: 'Data Siswa', exact: true }).click()
  await expect(page.getByText(studentName)).toBeVisible({ timeout: 10000 })

  // Rekap Saya lists the scheduled school (G3c).
  await page.getByRole('button', { name: 'Rekap Saya', exact: true }).click()
  await expect(page.getByText(schoolName)).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Tidak ada sekolah terjadwal hari ini.')).toHaveCount(0)

  // Absensi Saya offers the school with no blocking notice (R-TA8/U1).
  await page.getByRole('button', { name: 'Absensi Saya', exact: true }).click()
  const schoolSelect = page.locator('select').first()
  await expect(schoolSelect).toBeEnabled({ timeout: 10000 })
  await expect(schoolSelect.locator(`option:text("${schoolName}")`)).toHaveCount(1)
  await expect(page.getByText('Tidak ada penugasan aktif')).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)

  // ---- cleanup (reverse order, branch admin) ----
  await loginViaApi(page, 'adminCabang')
  csrf = await primeCsrf(page)
  expect((await apiPost(page, csrf, '/api/siswa.php', { action: 'delete', id: siswaId })).status).toBe(200)
  expect((await apiPost(page, csrf, '/api/sekolah.php', { action: 'delete', id: schoolId })).status).toBe(200)
  expect((await apiPost(page, csrf, '/api/trainer.php', { action: 'delete', id: trainerId })).status).toBe(200)
})
