import { test, expect, loginViaApi, primeCsrf, createBranch, createSekolahSuperadmin, logout } from './fixtures.js'

// ============================================================
// TA.C.2 — Monthly attendance matrix (absensiPengajar).
//
// VERIFY (TRAINER_ATTENDANCE_MILESTONES.md TA.C.2), fixture
// September 2026 shape (run against the current periode so the
// suite stays green year-round per taste-testing #6):
// -> SD Tridaya-like school shows Widia (I) dan Asyifa (A) in one cell;
// -> second school shows many teachers on one date;
// -> empty dates stay columns; date order follows the periode.
// Plus branch-scope inheritance: admin cabang sees only own cabang.
//
// Seeding goes through the real server (superadmin /api/sync.php for
// rows, adminCabang /api/trainer.php for trainer master records —
// only admin_cabang may create trainers per server/api/trainer.php:29).
// ============================================================

const APP = 'http://localhost:5173'
const CABANG_A = 'cbg-test-pusat'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function openMatriks(page) {
  await openTab(page, 'Absensi Tenaga Pengajar')
  await expect(page.getByRole('heading', { name: 'Absensi Tenaga Pengajar' })).toBeVisible()
  await page.getByRole('button', { name: 'Rekap Matriks', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Rekap Absensi Pengajar' })).toBeVisible()
}

async function switchRole(page, role) {
  await logout(page)
  await page.context().clearCookies()
  await loginViaApi(page, role)
}

async function createTrainerAsAdminCabang(page, csrf, id, nama, tipePengajar) {
  const res = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id, nama, honor: 50000, tipePengajar, sekolahIds: [], action: 'create' },
  })
  if (!res.ok()) throw new Error(`create trainer failed: ${res.status()} ${await res.text()}`)
}

async function seedRowAsSuperadmin(page, csrf, { trainerId, sekolahId, tanggal, status, keterangan, cabangId }) {
  const id = `absp-TAC2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const res = await page.request.post('/api/sync.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      entries: [{
        key: 'absensiPengajar', id,
        record: { id, trainerId, sekolahId, tanggal, periode: tanggal.slice(0, 7), status, keterangan: keterangan || null, catatan: '', cabangId },
      }],
    },
  })
  if (!res.ok()) throw new Error(`seed row failed: ${res.status()} ${await res.text()}`)
  const body = await res.json()
  if (body.failed?.length > 0) throw new Error(`seed row rejected: ${JSON.stringify(body.failed)}`)
}

test.describe('TA.C.2: rekap matriks bulanan', () => {
  test('satu sel memuat banyak pengajar dengan label I/A + keterangan', async ({ page }) => {
    const suffix = String(Date.now()).slice(-6)
    const today = new Date().toISOString().slice(0, 10)
    const widiaId = `trn-TAC2W-${suffix}`
    const asyifaId = `trn-TAC2A-${suffix}`
    const iraId = `trn-TAC2I-${suffix}`

    await loginViaApi(page, 'adminCabang')
    let csrf = await primeCsrf(page)
    await createTrainerAsAdminCabang(page, csrf, widiaId, `Widia TAC2 ${suffix}`, 'instruktur')
    csrf = await primeCsrf(page)
    await createTrainerAsAdminCabang(page, csrf, asyifaId, `Asyifa TAC2 ${suffix}`, 'asisten')
    csrf = await primeCsrf(page)
    await createTrainerAsAdminCabang(page, csrf, iraId, `Ira TAC2 ${suffix}`, 'asisten')

    await switchRole(page, 'superadmin')
    csrf = await primeCsrf(page)
    const { id: tridayaId } = await createSekolahSuperadmin(page, csrf, `SD Tridaya TAC2 ${suffix}`, 500000, CABANG_A, `TAC2T-${suffix}`)
    csrf = await primeCsrf(page)
    const { id: sabangId } = await createSekolahSuperadmin(page, csrf, `SDN 037 Sabang TAC2 ${suffix}`, 500000, CABANG_A, `TAC2S-${suffix}`)

    csrf = await primeCsrf(page)
    await seedRowAsSuperadmin(page, csrf, { trainerId: widiaId, sekolahId: tridayaId, tanggal: today, status: 'Hadir', cabangId: CABANG_A })
    csrf = await primeCsrf(page)
    await seedRowAsSuperadmin(page, csrf, { trainerId: asyifaId, sekolahId: tridayaId, tanggal: today, status: 'Hadir', keterangan: 'EXPO', cabangId: CABANG_A })
    csrf = await primeCsrf(page)
    await seedRowAsSuperadmin(page, csrf, { trainerId: widiaId, sekolahId: sabangId, tanggal: today, status: 'Hadir', cabangId: CABANG_A })
    csrf = await primeCsrf(page)
    await seedRowAsSuperadmin(page, csrf, { trainerId: asyifaId, sekolahId: sabangId, tanggal: today, status: 'Hadir', cabangId: CABANG_A })
    csrf = await primeCsrf(page)
    await seedRowAsSuperadmin(page, csrf, { trainerId: iraId, sekolahId: sabangId, tanggal: today, status: 'Hadir', cabangId: CABANG_A })

    await gotoApp(page)
    await openMatriks(page)

    // One Tridaya cell holds both teachers with operational labels
    // (row-scoped: Widia also appears in the Sabang row same date).
    const tridayaRow = page.locator('tr', { hasText: `SD Tridaya TAC2 ${suffix}` })
    await expect(tridayaRow.getByRole('cell', { name: `Widia TAC2 ${suffix} (I)` })).toBeVisible()
    await expect(tridayaRow.getByRole('cell', { name: `Asyifa TAC2 ${suffix} (A) — EXPO` })).toBeVisible()
    // Sabang same-date cell holds three teachers.
    const sabangRow = page.locator('tr', { hasText: `SDN 037 Sabang TAC2 ${suffix}` })
    await expect(sabangRow.getByRole('cell', { name: `Ira TAC2 ${suffix} (A)` })).toBeVisible()
    await expect(sabangRow.getByRole('cell', { name: `Widia TAC2 ${suffix} (I)` })).toBeVisible()

    // Empty dates stay columns in periode order: day-1 header exists
    // before the today column header.
    const dayOne = page.getByRole('columnheader', { name: '1', exact: true }).first()
    await expect(dayOne).toBeVisible()
    const todayDay = String(Number(today.slice(8, 10)))
    await expect(page.getByRole('columnheader', { name: todayDay, exact: true }).first()).toBeVisible()
  })

  test('admin cabang hanya melihat matriks cabangnya', async ({ page }) => {
    const suffix = String(Date.now()).slice(-6)
    const today = new Date().toISOString().slice(0, 10)

    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)
    const { id: sekolahAId } = await createSekolahSuperadmin(page, csrf, `SD TAC2-A ${suffix}`, 500000, CABANG_A, `TAC2A-${suffix}`)
    const kodeB = `TAC2B${suffix}`
    await createBranch(page, csrf, kodeB, `Cabang TAC2 B ${suffix}`, suffix)
    const cabangBId = `cbg-${kodeB}-${suffix}`
    csrf = await primeCsrf(page)
    const { id: sekolahBId } = await createSekolahSuperadmin(page, csrf, `SD TAC2-B ${suffix}`, 500000, cabangBId, `TAC2Bsch-${suffix}`)

    csrf = await primeCsrf(page)
    const trainers = await (await page.request.get('/api/read.php?entity=trainer', { headers: { 'X-CSRF-Token': csrf } })).json()
    const trainerId = trainers.find(t => t.id === 'trn-test-1')?.id || trainers[0].id
    await seedRowAsSuperadmin(page, csrf, { trainerId, sekolahId: sekolahAId, tanggal: today, status: 'Hadir', cabangId: CABANG_A })
    csrf = await primeCsrf(page)
    await seedRowAsSuperadmin(page, csrf, { trainerId, sekolahId: sekolahBId, tanggal: today, status: 'Hadir', cabangId: cabangBId })

    await switchRole(page, 'adminCabang')
    await gotoApp(page)
    await openMatriks(page)
    await expect(page.getByRole('cell', { name: `SD TAC2-A ${suffix}`, exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: `SD TAC2-B ${suffix}`, exact: true })).toHaveCount(0)

    await switchRole(page, 'superadmin')
    await gotoApp(page)
    await openMatriks(page)
    await expect(page.getByRole('cell', { name: `SD TAC2-A ${suffix}`, exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: `SD TAC2-B ${suffix}`, exact: true })).toBeVisible()
  })
})
