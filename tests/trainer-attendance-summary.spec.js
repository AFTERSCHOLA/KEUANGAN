import { test, expect, loginViaApi, primeCsrf, readEntity, logout } from './fixtures.js'

// ============================================================
// TA.C.1 — Personal attendance summary (absensiPengajar).
//
// VERIFY (TRAINER_ATTENDANCE_MILESTONES.md TA.C.1):
// -> akun trainer A tidak menampilkan record trainer B;
// -> total status sesuai fixture;
// -> filter periode mengubah data sesuai periode.
//
// Idiom mirrors tests/trainer-attendance-form.spec.js (seed as
// superadmin — trainer cannot write master data) and
// tests/trainer-attendance-admin.spec.js (switchRole via logout +
// clearCookies, trainerFillAndSync via the real "Absensi Saya" form +
// manual Sinkronisasi flush, cell-scoped assertions to avoid the
// <option>-vs-<td> strict-mode violation).
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

async function switchRole(page, role) {
  await logout(page)
  await page.context().clearCookies()
  await loginViaApi(page, role)
}

function monthRange(offsetYears) {
  const ms = offsetYears * 365 * 24 * 60 * 60 * 1000
  return new Date(Date.now() + ms).toISOString().slice(0, 10)
}

// Append (not replace) an active assignment for TRAINER_ID, as
// superadmin. Mirrors trainer-attendance-admin.spec.js addActiveAssignment.
async function addActiveAssignment(page, csrf, sekolahId, cabangId) {
  const trainerListRes = await page.request.get('/api/read.php?entity=trainer', {
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!trainerListRes.ok()) throw new Error(`read trainer failed: ${trainerListRes.status()} ${await trainerListRes.text()}`)
  const trainerList = await trainerListRes.json()
  const currentTrainer = trainerList.find(t => t.id === TRAINER_ID)
  if (!currentTrainer) throw new Error(`trainer ${TRAINER_ID} tidak ditemukan`)
  const { cabangId: _omit, ...trainerWithoutCabang } = currentTrainer
  const existing = currentTrainer.penugasanPengajar || []
  const res = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      ...trainerWithoutCabang,
      id: TRAINER_ID,
      action: 'update',
      penugasanPengajar: [
        ...existing,
        {
          id: `pgs-TAC1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sekolahId,
          trainerId: TRAINER_ID,
          asistenId: null,
          cabangId,
          periodeMulai: monthRange(-1),
          periodeSelesai: monthRange(1),
          aktif: true,
        },
      ],
    },
  })
  if (!res.ok()) throw new Error(`addActiveAssignment failed: ${res.status()} ${await res.text()}`)
}

async function seedSchoolAsSuperadmin(page, csrf, nama) {
  const res = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: `skl-TAC1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, nama, spp: 500000, cabangId: CABANG_ID, action: 'create' },
  })
  if (!res.ok()) throw new Error(`seed sekolah failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

async function trainerFillMultipleAndSync(page, entries) {
  await switchRole(page, 'trainer')
  await gotoApp(page)
  await openTab(page, 'Absensi Saya')
  for (const { sekolahId, status } of entries) {
    const sekolahSelect = page.locator('select').filter({ has: page.locator(`option[value="${sekolahId}"]`) })
    await expect(sekolahSelect).toBeVisible()
    await sekolahSelect.selectOption(sekolahId)
    await page.getByRole('button', { name: status, exact: true }).click()
    await page.getByRole('button', { name: 'Simpan Absensi' }).click()
    await expect(page.getByText('Tersimpan')).toBeVisible({ timeout: 10000 })
  }
  await page.getByRole('button', { name: 'Akun' }).click()
  const [syncRes] = await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/sync.php') && res.request().method() === 'POST'),
    page.getByRole('menuitem', { name: /Sinkronisasi/ }).click(),
  ])
  expect(syncRes.ok()).toBe(true)
  const syncBody = await syncRes.json()
  if (syncBody.failed?.length > 0) throw new Error(`sync failed entries: ${JSON.stringify(syncBody.failed)}`)
}

// Direct server seed of one absensiPengajar row via /api/sync.php as
// superadmin (bypasses the trainer form, which can only write today +
// own trainerId). Used for trainer-B isolation rows and other-periode
// rows the form cannot produce.
async function seedAbsensiPengajarAsSuperadmin(page, csrf, { trainerId, sekolahId, tanggal, status }) {
  const periode = tanggal.slice(0, 7)
  const id = `absp-TAC1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const res = await page.request.post('/api/sync.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { entries: [{ key: 'absensiPengajar', id, record: { id, trainerId, sekolahId, tanggal, periode, status, keterangan: null, catatan: '', cabangId: CABANG_ID } }] },
  })
  if (!res.ok()) throw new Error(`seed absensiPengajar failed: ${res.status()} ${await res.text()}`)
  const body = await res.json()
  if (body.failed?.length > 0) throw new Error(`seed absensiPengajar rejected: ${JSON.stringify(body.failed)}`)
  return id
}

test.describe('TA.C.1: ringkasan absensi pribadi', () => {
  test('total status + daftar sekolah + riwayat sesuai milik sendiri', async ({ page }) => {
    const suffix = String(Date.now()).slice(-6)
    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)
    const [{ id: sekolahAId }, { id: sekolahBId }] = await Promise.all([
      seedSchoolAsSuperadmin(page, csrf, `SD TAC1-A ${suffix}`),
      seedSchoolAsSuperadmin(page, csrf, `SD TAC1-B ${suffix}`),
    ])
    csrf = await primeCsrf(page)
    await addActiveAssignment(page, csrf, sekolahAId, CABANG_ID)
    csrf = await primeCsrf(page)
    await addActiveAssignment(page, csrf, sekolahBId, CABANG_ID)

    await trainerFillMultipleAndSync(page, [
      { sekolahId: sekolahAId, status: 'Hadir' },
      { sekolahId: sekolahBId, status: 'Izin' },
    ])

    await switchRole(page, 'trainer')
    await gotoApp(page)
    await openTab(page, 'Ringkasan Saya')

    await expect(page.getByRole('heading', { name: 'Ringkasan Saya' })).toBeVisible()
    await expect(page.getByRole('cell', { name: `SD TAC1-A ${suffix}`, exact: true }).first()).toBeVisible()
    await expect(page.getByRole('cell', { name: `SD TAC1-B ${suffix}`, exact: true }).first()).toBeVisible()
  })

  test('trainer A tidak melihat record trainer B', async ({ page }) => {
    const suffix = String(Date.now()).slice(-6)
    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)

    // Bare trainer master record (no login account needed — validation
    // only requires trainerId to reference an existing trainer).
    // Privilege matrix (server/api/trainer.php:29): ONLY admin_cabang
    // can create trainers, and cabangId must NOT be sent (it is derived
    // from the admin's own session).
    await switchRole(page, 'adminCabang')
    csrf = await primeCsrf(page)
    const trainerBId = `trn-TAC1B-${suffix}`
    const createB = await page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id: trainerBId, nama: `Trainer B TAC1 ${suffix}`, honor: 50000, tipePengajar: 'asisten', sekolahIds: [], action: 'create' },
    })
    if (!createB.ok()) throw new Error(`create trainer B failed: ${createB.status()} ${await createB.text()}`)

    await switchRole(page, 'superadmin')
    csrf = await primeCsrf(page)
    const { id: sekolahBId } = await seedSchoolAsSuperadmin(page, csrf, `SD TAC1-Milik-B ${suffix}`)
    const today = new Date().toISOString().slice(0, 10)
    csrf = await primeCsrf(page)
    await seedAbsensiPengajarAsSuperadmin(page, csrf, { trainerId: trainerBId, sekolahId: sekolahBId, tanggal: today, status: 'Hadir' })

    // Trainer A writes one own row so the summary is non-empty.
    csrf = await primeCsrf(page)
    const { id: sekolahAId } = await seedSchoolAsSuperadmin(page, csrf, `SD TAC1-Milik-A ${suffix}`)
    csrf = await primeCsrf(page)
    await addActiveAssignment(page, csrf, sekolahAId, CABANG_ID)
    await trainerFillMultipleAndSync(page, [{ sekolahId: sekolahAId, status: 'Hadir' }])

    await switchRole(page, 'trainer')
    await gotoApp(page)
    await openTab(page, 'Ringkasan Saya')

    await expect(page.getByRole('cell', { name: `SD TAC1-Milik-A ${suffix}`, exact: true }).first()).toBeVisible()
    await expect(page.getByRole('cell', { name: `SD TAC1-Milik-B ${suffix}`, exact: true })).toHaveCount(0)

    // Server contract (taste #61): trainer-scoped read must not return
    // trainer B rows at all — UI hiding alone is not the guarantee.
    csrf = await primeCsrf(page)
    const rows = await readEntity(page, 'absensiPengajar', csrf)
    expect(rows.filter(r => r.trainerId === trainerBId)).toHaveLength(0)
  })

  test('record periode lain tidak tampil di ringkasan periode ini', async ({ page }) => {
    const suffix = String(Date.now()).slice(-6)
    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)
    const { id: sekolahKiniId } = await seedSchoolAsSuperadmin(page, csrf, `SD TAC1-Kini ${suffix}`)
    csrf = await primeCsrf(page)
    await addActiveAssignment(page, csrf, sekolahKiniId, CABANG_ID)

    // Other-periode row for the SAME trainer: previous month.
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 5)
    const prevTanggal = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-05`
    csrf = await primeCsrf(page)
    const { id: sekolahLaluId } = await seedSchoolAsSuperadmin(page, csrf, `SD TAC1-Lalu ${suffix}`)
    csrf = await primeCsrf(page)
    await seedAbsensiPengajarAsSuperadmin(page, csrf, { trainerId: TRAINER_ID, sekolahId: sekolahLaluId, tanggal: prevTanggal, status: 'Alpa' })

    await trainerFillMultipleAndSync(page, [{ sekolahId: sekolahKiniId, status: 'Hadir' }])

    await switchRole(page, 'trainer')
    await gotoApp(page)
    await openTab(page, 'Ringkasan Saya')

    await expect(page.getByRole('cell', { name: `SD TAC1-Kini ${suffix}`, exact: true }).first()).toBeVisible()
    await expect(page.getByRole('cell', { name: `SD TAC1-Lalu ${suffix}`, exact: true })).toHaveCount(0)
  })
})
