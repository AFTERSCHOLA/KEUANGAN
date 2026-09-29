// T2.A.2 (F-T2-2; D-T2-2; R-T2-1, R-T2-2, R-T2-5) — dashboard Honor Saya
// updates when the sync lands, with no hard refresh.
//
// Current: TrainerDashboard mounts snapshot-only (readCached, no
//   subscribeStore/read/tick), so a pre-hydrate mount computes 0 sesi and
//   never updates — the sibling TrainerAttendanceSummary.jsx:16-29 idiom
//   self-heals, the dashboard does not.
// Expected: after the absensiPengajar/honorPayments sync lands, the
//   already-mounted Honor Saya card re-renders with the server counts.
// Rule: mirror the Summary idiom, no new derivation, Indonesian copy
//   unchanged (PLAN section 4: dashboard = behavior fix only).
// Result: FAIL pre-fix (stays "0 sesi"), green post-fix.
//
// Shape: seed one honorable Hadir row as superadmin, log in as trainer,
// prove the hydrated dashboard is non-zero, then simulate a stale
// pre-hydrate mount (wipe the two ledger caches + tab-switch remount —
// App.jsx hydrates on currentUser.id only, so a tab switch remounts
// WITHOUT re-hydrate) and assert the card self-heals with NO
// page.reload() anywhere past the stale point. The away tab MUST be
// Data Siswa: StudentList mounts zero read() calls (readCached only),
// while Ringkasan Saya would re-read absensiPengajar on mount
// (TrainerAttendanceSummary.jsx:28) and repopulate the wiped cache
// before the dashboard remounts, masking the stale state.
//
// VERIFY: npx playwright test tests/trainer-honor-refresh.spec.js --workers=1

import { test, expect, loginViaApi, primeCsrf, logout } from './fixtures.js'

const APP = 'http://localhost:5173'
const TRAINER_ID = 'trn-test-1'
const CABANG_ID = 'cbg-test-pusat'

function localToday() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function seedSchoolAsSuperadmin(page, csrf, nama) {
  const id = `sch-T2A2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const res = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id, nama, spp: 500000, cabangId: CABANG_ID, action: 'create' },
  })
  if (!res.ok()) throw new Error(`seed sekolah failed: ${res.status()} ${await res.text()}`)
  return id
}

// Direct server seed of one absensiPengajar Hadir row as superadmin via
// /api/sync.php (legacy-retained but functional — same harness as
// tests/trainer-attendance-summary.spec.js seedAbsensiPengajarAsSuperadmin).
async function seedHadirAsSuperadmin(page, csrf, sekolahId, tanggal) {
  const id = `absp-T2A2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const res = await page.request.post('/api/sync.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      entries: [{
        key: 'absensiPengajar',
        id,
        record: {
          id, trainerId: TRAINER_ID, sekolahId, tanggal,
          periode: tanggal.slice(0, 7), status: 'Hadir',
          keterangan: null, catatan: '', cabangId: CABANG_ID,
        },
      }],
    },
  })
  if (!res.ok()) throw new Error(`seed absensiPengajar failed: ${res.status()} ${await res.text()}`)
  const body = await res.json()
  if (body.failed?.length > 0) throw new Error(`seed absensiPengajar rejected: ${JSON.stringify(body.failed)}`)
  return id
}

async function switchRole(page, role) {
  await logout(page)
  await page.context().clearCookies()
  await loginViaApi(page, role)
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('T2.A.2: Honor Saya updates when the sync lands — no hard refresh', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const today = localToday()

  // Seed honorable session: one Hadir row for trn-test-1 in the current
  // periode (trainer honor 50000 => 1 Hadir row prices > 0 via
  // finance.js pengajarHonorStats; Sesi Hadir flips 0 -> N).
  await loginViaApi(page, 'superadmin')
  let csrf = await primeCsrf(page)
  const sekolahId = await seedSchoolAsSuperadmin(page, csrf, `SD T2A2 ${suffix}`)
  csrf = await primeCsrf(page)
  await seedHadirAsSuperadmin(page, csrf, sekolahId, today)

  // Mount the dashboard as trainer (login hydrate populates the caches).
  await switchRole(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('heading', { name: 'Rekap Saya' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Honor Saya' })).toBeVisible()

  // Sanity: hydrated Honor Saya is non-zero (server data landed).
  // Regex, not an exact count — earlier runs accumulate Hadir rows for
  // the same canonical trainer in the shared test DB.
  await expect(page.getByText(/^[1-9]\d* sesi$/)).toBeVisible()

  // Simulate a stale pre-hydrate mount: park on the fetch-free Data
  // Siswa tab, wipe the two ledger caches, then tab-switch back.
  // App.jsx hydrates on currentUser.id only, so the switch remounts
  // TrainerDashboard WITHOUT re-hydrate.
  await openTab(page, 'Data Siswa')
  await expect(page.getByRole('heading', { name: 'Manajemen Siswa' })).toBeVisible()
  await page.evaluate(() => {
    localStorage.setItem('afterschola_v4_absensiPengajar', '[]')
    localStorage.setItem('afterschola_v4_honorPayments', '[]')
  })
  await openTab(page, 'Rekap Saya')

  // Stale proof: the remount computed from the empty cache. The
  // transient "0 sesi" must be asserted FIRST — the Honor Saya heading
  // lands in the same commit, and awaiting it first burns the window
  // while the mount-time read() resolves and re-renders non-zero.
  await expect(page.getByText('0 sesi', { exact: true })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('heading', { name: 'Honor Saya' })).toBeVisible()

  // NO page.reload() past this point. The dashboard's own mount-time
  // read('absensiPengajar') + read('honorPayments') (D-T2-2, mirrored
  // from TrainerAttendanceSummary.jsx:16-29) must re-pull the server
  // rows and re-render Honor Saya by itself. Pre-fix this never fires
  // and the card stays at "0 sesi".
  await expect(page.getByText('0 sesi', { exact: true })).toHaveCount(0, { timeout: 15000 })
  await expect(page.getByText(/^[1-9]\d* sesi$/)).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})
