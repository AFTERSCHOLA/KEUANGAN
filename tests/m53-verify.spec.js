import { test, expect } from './fixtures.js'

const APP = 'http://localhost:5173'
const SCHOOL = 'SD M53'
const TRAINER = 'Trainer M53'
const ASSISTANT = 'Asisten M53'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__m53_reset_done')) return
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    sessionStorage.setItem('__m53_reset_done', '1')
  })
}

async function loginAdmin(page) {
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByLabel('Pilih Cabang Anda').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

function field(page, labelText) {
  return page.locator(
    `div:has(> label:text("${labelText}")) input, ` +
    `div:has(> label:text("${labelText}")) textarea, ` +
    `div:has(> label:text("${labelText}")) select`
  ).first()
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function weekday() {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'UTC' }).format(new Date())
}

test('M5.3.1: queue uses persisted proof, historical context, verification gate, and Semua history', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAdmin(page)

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

  await page.evaluate(({ SCHOOL, TRAINER }) => {
    const get = key => JSON.parse(localStorage.getItem(`afterschola_v4_${key}`) || '[]')
    const set = (key, value) => localStorage.setItem(`afterschola_v4_${key}`, JSON.stringify(value))
    const school = { id: 'school-ui', nama: SCHOOL, jadwal: '', spp: 100000, trainerIds: ['trainer-ui'] }
    const trainer = { id: 'trainer-ui', nama: TRAINER, honor: 50000, sekolahIds: ['school-ui'] }
    set('sekolah', [school])
    set('trainer', [trainer])
    set('absensi', [
      { id: 'history-jul', tanggal: '2026-07-01', periode: '2026-07', sekolahId: school.id, trainerId: trainer.id, trainerNama: trainer.nama, trainerStatus: 'Hadir', siswaList: [] },
      { id: 'history-aug', tanggal: '2026-08-01', periode: '2026-08', sekolahId: school.id, trainerId: trainer.id, trainerNama: trainer.nama, trainerStatus: 'Hadir', siswaList: [] },
    ])
    set('ui', { role: 'admin', trainerId: null, selectedYear: 2026, selectedMonth: 8 })
  }, { SCHOOL, TRAINER })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Riwayat Absensi')
  await expect(page.getByText('Antrian Verifikasi')).toBeVisible()
  await page.getByRole('button', { name: 'Semua', exact: true }).click()
  await expect(page.getByText('2026-07-01')).toBeVisible()
  await expect(page.getByText('2026-08-01')).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})

test('M5.3.1b/M5.3.2: trainer inspects proof, certifies own week, and sees schedule plus honor summary', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAdmin(page)

  await page.evaluate(({ SCHOOL, TRAINER, ASSISTANT, today, weekday }) => {
    const school = { id: 'school-ui', nama: SCHOOL, jadwal: weekday, spp: 100000, trainerIds: ['trainer-ui'] }
    const trainer = { id: 'trainer-ui', nama: TRAINER, honor: 50000, sekolahIds: [school.id] }
    const assistant = { id: 'assistant-ui', nama: ASSISTANT, honor: 40000, sekolahIds: [school.id] }
    const absensi = [
      {
        id: 'attendance-ui', tanggal: today, periode: today.slice(0, 7), sekolahId: school.id,
        trainerId: trainer.id, trainerNama: trainer.nama, trainerStatus: 'Hadir',
        asistenId: assistant.id, asistenNama: assistant.nama,
        dokumentasi: [{ slot: 'kehadiran', type: 'dataurl', data: 'data:image/png;base64,iVBORw0KGgo=' }],
        catatan: 'Catatan sesi M53', statusVerifikasi: null, konfirmasiTrainer: null,
        siswaList: [{ siswaId: 'student-ui', nama: 'Siswa M53', status: 'Hadir' }],
      },
    ]
    const set = (key, value) => localStorage.setItem(`afterschola_v4_${key}`, JSON.stringify(value))
    set('sekolah', [school])
    set('trainer', [trainer, assistant])
    set('siswa', [{ id: 'student-ui', nama: 'Siswa M53', sekolahId: school.id, sekolahNama: SCHOOL, status: 'Aktif', sppLunas: {} }])
    set('absensi', absensi)
    set('honorPayments', [{ id: 'payment-ui', trainerId: trainer.id, periode: today.slice(0, 7), nominal: 20000, tanggalBayar: today }])
    set('ui', { role: 'trainer', trainerId: trainer.id, selectedYear: Number(today.slice(0, 4)), selectedMonth: Number(today.slice(5, 7)) })
  }, { SCHOOL, TRAINER, ASSISTANT, today: today(), weekday: weekday() })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByText('Jadwal hari ini dan ringkasan honor periode')).toBeVisible()
  await expect(page.getByText(SCHOOL, { exact: true })).toBeVisible()
  await expect(page.getByText('Selesai')).toBeVisible()
  await expect(page.getByText('1 sesi')).toBeVisible()
  await expect(page.getByText('Rp 50.000')).toBeVisible()
  await expect(page.getByText('Rp 20.000')).toBeVisible()
  await expect(page.getByText('Rp 30.000')).toBeVisible()

  await openTab(page, 'Riwayat Absensi')
  await expect(page.getByText(ASSISTANT, { exact: true })).toBeVisible()
  await expect(page.getByText('Catatan sesi M53', { exact: true })).toBeVisible()
  await expect(page.locator('img[alt="Foto Kehadiran"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Saya nyatakan absensi minggu ini sesuai dokumen kertas' })).toBeVisible()
  await expect(page.getByText('Simpan kertas absensi minimal 1 tahun ajaran.')).toBeVisible()
  await page.getByRole('button', { name: 'Saya nyatakan absensi minggu ini sesuai dokumen kertas' }).click()
  const certified = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_absensi'))[0].konfirmasiTrainer)
  expect(certified).toEqual(expect.any(String))

  expect(pageErrors).toHaveLength(0)
})

test('M5.3.3: trainer student list is read-only and Trial badge remains visible', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await loginAdmin(page)

  await page.evaluate(() => {
    localStorage.setItem('afterschola_v4_sekolah', JSON.stringify([{ id: 'school-ui', nama: 'School UI', trainerIds: ['trainer-ui'] }]))
    localStorage.setItem('afterschola_v4_trainer', JSON.stringify([{ id: 'trainer-ui', nama: 'Trainer UI', honor: 50000, sekolahIds: ['school-ui'] }]))
    localStorage.setItem('afterschola_v4_siswa', JSON.stringify([{ id: 'student-ui', nama: 'Trial UI', sekolahId: 'school-ui', sekolahNama: 'School UI', status: 'Trial', trialMulai: '2026-08-01', sppLunas: {} }]))
    localStorage.setItem('afterschola_v4_ui', JSON.stringify({ role: 'trainer', trainerId: 'trainer-ui' }))
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Siswa')
  await expect(page.getByText('Trial', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tambah Siswa Baru' })).toHaveCount(0)
  await expect(page.getByText('Aksi', { exact: true })).toHaveCount(0)
  await expect(page.getByTitle('Catat pembayaran SPP')).toHaveCount(0)

  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await openTab(page, 'Data Siswa')
  await expect(page.getByText('Aksi', { exact: true })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})
