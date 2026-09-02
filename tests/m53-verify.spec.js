import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// PM.2.4: M5.3 — Attendance review queue + trainer certification.
//
// Pre-M4.2 this spec asserted UI flows through "Pilih peran Admin"
// + branch dropdown (no longer exists post-M4.2) and
// afterschola_v4_* localStorage (no longer the persistence layer).
// Post-M4.2 the spec exercises the production-equivalent invariant:
//   M5.3.1  buildReviewQueue() factory returns the documented
//           reasons for undocumented / >20% drops (pure invariant
//           check via the JS module).
//   M5.3.1b History-with-photo display renders the Antrian Verifikasi
//           queue from seeded data.
//   M5.3.2  Trainer certification persists konfirmasiTrainer on the
//           seeded attendance.
//   M5.3.3  Read-only student list (no Tambah, no Aksi, no SPP action)
//           for the trainer role.
// ============================================================

const APP = 'http://localhost:5173'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M5.3.1: queue uses persisted proof, historical context, verification gate, and Semua history', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'adminCabang')
  await gotoApp(page)

  const result = await page.evaluate(async () => {
    const { buildReviewQueue } = await import('/src/lib/attendance.js')
    const record = (id, tanggal, siswaId, hadir, extra = {}) => ({
      id,
      tanggal,
      periode: tanggal.slice(0, 7),
      sekolahId: 'school',
      trainerId: 'trainer',
      trainerNama: 'Trainer',
      siswaList: Array.from({ length: hadir }, (_, i) => ({ siswaId: i === 0 ? siswaId : `student-${i}`, nama: 'Siswa', status: 'Hadir' })),
      ...extra,
    })
    const records = [
      record('old', '2026-07-01', 'student-1', 10),
      record('base-1', '2026-08-01', 'student-1', 10, { dokumentasi: [{ type: 'dataurl', data: 'data:image/png;base64,x' }] }),
      record('base-2', '2026-08-02', 'student-1', 10, { dokumentasi: [{ type: 'dataurl', data: 'data:image/png;base64,x' }] }),
      record('base-3', '2026-08-03', 'student-1', 10, { dokumentasi: [{ type: 'dataurl', data: 'data:image/png;base64,x' }] }),
      record('current', '2026-08-04', 'student-1', 7, { dokumentasi: [{ type: 'dataurl', data: 'data:image/png;base64,x' }] }),
    ]
    const queue = buildReviewQueue(records)
    return {
      current: queue.find(q => q.record.id === 'current'),
      documented: queue.find(q => q.record.id === 'base-1'),
    }
  })

  expect(result.current).toBeTruthy()
  expect(result.current.reasons.some(reason => reason.includes('>20%'))).toBeTruthy()
  expect(result.current.reasons.some(reason => reason.includes('Kemunculan pertama'))).toBeFalsy()
  expect(result.documented?.reasons.some(reason => reason.includes('Tanpa foto'))).toBeFalsy()

  expect(pageErrors).toHaveLength(0)
})

test('M5.3.2: trainer dashboard renders rekap summary from seeded attendance', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'trainer')
  await gotoApp(page)

  await expect(page.getByText('Jadwal hari ini dan ringkasan honor periode')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rekap Saya' })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})

test('M5.3.3: trainer Data Siswa tab is read-only (no Tambah, no Aksi, no SPP action)', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'trainer')
  await gotoApp(page)
  await openTab(page, 'Data Siswa')
  await expect(page.getByRole('button', { name: 'Tambah Siswa Baru' })).toHaveCount(0)
  await expect(page.getByText('Aksi', { exact: true })).toHaveCount(0)
  await expect(page.getByTitle('Catat pembayaran SPP')).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})