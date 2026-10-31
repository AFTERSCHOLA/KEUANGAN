import { test, expect, loginViaApi, primeCsrf, createSekolahSuperadmin, logout } from './fixtures.js'

// ============================================================
// Task 3 — Rekap month-grid calendar navigation.
//
// The Rekap view keeps a LOCAL month (`bulan`, default = global
// periode once) with a PenugasanTimetable-style month grid above the
// matrix table: Monday-first leading blanks, min-h-20 day cells with
// per-day record counts, `Bulan lalu` / `Bulan depan` navigation, and
// day-click drill setting an in-place date-filter chip. Empty months
// render the grid + the existing empty-table message, no crash.
// Global periode context stays untouched (Daftar view still shows
// the global periode after Rekap month-hopping).
//
// Seeding goes through the real server (superadmin /api/sync.php,
// Sim-marked): one past-month record (day 15) + one current-month
// record — the trainer-attendance-recap.spec.js:52-66 recipe.
// Run: npx playwright test tests/rekap-calendar.spec.js --project=default --workers=1
// Requires PHP :8000 + test DB live (same prerequisite as export-doc.spec.js).
// ============================================================

const APP = 'http://localhost:5173'
const CABANG_A = 'cbg-test-pusat'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openMatriks(page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Absensi Tenaga Pengajar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Absensi Tenaga Pengajar' })).toBeVisible()
  await page.getByRole('button', { name: 'Rekap Matriks', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Rekap Absensi Pengajar' })).toBeVisible()
}

async function switchRole(page, role) {
  await logout(page)
  await page.context().clearCookies()
  await loginViaApi(page, role)
}

async function seedRowAsSuperadmin(page, csrf, { trainerId, sekolahId, tanggal, status, keterangan, cabangId }) {
  const id = `absp-T3CAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
  return id
}

test('rekap month-grid: past-month navigation + day drill + empty month', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const now = new Date()
  const currentPeriode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevPeriode = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  const pastDay = `${prevPeriode}-15`
  const todayISO = `${currentPeriode}-${String(now.getDate()).padStart(2, '0')}`
  const todayN = String(now.getDate())
  const namaTrainer = `Sim Cal Trainer ${suffix}`
  const namaSekolah = `Sim Cal SD ${suffix}`
  const trainerId = `trn-T3CAL-${suffix}`
  const rowIds = []

  // Trainer master records are admin-cabang-only (server/api/trainer.php).
  await loginViaApi(page, 'adminCabang')
  let csrf = await primeCsrf(page)
  const createRes = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: trainerId, nama: namaTrainer, honor: 50000, tipePengajar: 'instruktur', sekolahIds: [], action: 'create' },
  })
  if (!createRes.ok()) throw new Error(`create trainer failed: ${createRes.status()} ${await createRes.text()}`)

  await switchRole(page, 'superadmin')
  csrf = await primeCsrf(page)
  const { id: schId } = await createSekolahSuperadmin(page, csrf, namaSekolah, 500000, CABANG_A, `T3CAL-${suffix}`)
  csrf = await primeCsrf(page)
  rowIds.push(await seedRowAsSuperadmin(page, csrf, { trainerId, sekolahId: schId, tanggal: pastDay, status: 'Hadir', cabangId: CABANG_A }))
  csrf = await primeCsrf(page)
  rowIds.push(await seedRowAsSuperadmin(page, csrf, { trainerId, sekolahId: schId, tanggal: todayISO, status: 'Hadir', cabangId: CABANG_A }))

  await gotoApp(page)
  await openMatriks(page)

  // Grid renders above the matrix for the default (current-periode) month.
  await expect(page.getByTestId('rekap-calendar')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: todayN, exact: true }).first()).toBeVisible()

  // Navigate to the seeded past month: matrix header shows its days.
  await page.getByRole('button', { name: 'Bulan lalu' }).click()
  await expect(page.getByRole('columnheader', { name: '15', exact: true }).first()).toBeVisible()
  const schRow = page.locator('tr', { hasText: namaSekolah })
  await expect(schRow.getByText(`${namaTrainer} (I)`, { exact: false })).toBeVisible()

  // Day cell carries the per-day record count (not names — names live in
  // the table cells); clicking drills into an in-place date-filter chip.
  const pastCell = page.locator(`[data-tanggal="${pastDay}"]`)
  await expect(pastCell).toBeVisible()
  await expect(pastCell).toContainText('1 record')
  await pastCell.click()
  await expect(page.getByText(`Tanggal: ${pastDay}`)).toBeVisible()
  // Filtered table shows only the drilled date column.
  await expect(page.getByRole('columnheader', { name: '15', exact: true })).toHaveCount(1)
  await expect(page.getByRole('columnheader', { name: '1', exact: true })).toHaveCount(0)
  await expect(schRow.getByText(`${namaTrainer} (I)`, { exact: false })).toBeVisible()
  // Clearing the chip restores the full month.
  await page.getByRole('button', { name: 'Hapus filter tanggal' }).click()
  await expect(page.getByRole('columnheader', { name: '1', exact: true }).first()).toBeVisible()

  // Empty month: keep going back until a month with no records renders
  // the grid + the existing empty-table message, no crash.
  for (let i = 0; i < 10; i++) {
    if (await page.getByText('Belum ada absensi tenaga pengajar untuk periode ini.').isVisible()) break
    await page.getByRole('button', { name: 'Bulan lalu' }).click()
  }
  await expect(page.getByText('Belum ada absensi tenaga pengajar untuk periode ini.')).toBeVisible()
  await expect(page.getByTestId('rekap-calendar')).toBeVisible()
  await expect(page.getByTestId('rekap-hari').first()).toBeVisible()

  // Global periode context untouched: Daftar still shows the global month.
  await page.getByRole('button', { name: 'Bulan depan' }).click()
  await page.getByRole('button', { name: 'Daftar', exact: true }).click()
  await expect(page.getByText(`Periode ${currentPeriode}`, { exact: false }).first()).toBeVisible()

  // In-run cleanup (reverse order): school, then trainer; ledger rows are
  // out-of-band (ids logged, AP.C.3 idiom).
  await switchRole(page, 'superadmin')
  csrf = await primeCsrf(page)
  console.log(`## T3CAL cleanup sekolah -> ${(await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: schId } })).status()}`)
  await switchRole(page, 'adminCabang')
  csrf = await primeCsrf(page)
  console.log(`## T3CAL cleanup trainer -> ${(await page.request.post('/api/trainer.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: trainerId } })).status()}`)
  console.log(`## T3CAL ledger orphans (out-of-band removal): ${JSON.stringify(rowIds)}`)

  expect(pageErrors).toHaveLength(0)
})
