import { test, expect } from './fixtures.js'

// ============================================================
// M5.1.3 — Role-context filtering in the store.
// getRoleContext() derives the active scope (role, trainerId,
// cabangId) from the persisted UI state; read()/write()/upsert()
// narrow data to that scope when the role is 'trainer'.
// Verify: a trainer sees ONLY own-branch (own assigned school)
// data in every list they can reach — store reads, the Absensi
// school dropdown, the read-only Siswa list, and Riwayat.
// ============================================================

const APP = 'http://localhost:5173'
const SCH_A = 'SD Harapan Bangsa'
const SCH_B = 'SD Mentari Pagi'
const TRAINER = 'Budi Santoso'
const TRAINER2 = 'Dewi Lestari'
const SISWA_A = 'Andi Pratama'
const SISWA_B = 'Bunga Citra'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__m513_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__m513_reset_done', '1')
  })
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function recordSession(page, { schoolName, trainerName, date }) {
  await openTab(page, 'Data Absensi')
  await page.getByRole('button', { name: 'Input Absensi' }).click()
  await field(page, 'Tanggal Kelas').fill(date)
  await field(page, 'Sekolah').selectOption({ label: schoolName })
  await field(page, 'Trainer').selectOption({ label: trainerName })
  await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()
}

function thisMonthDate(day) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(day).padStart(2, '0')}`
}

test('M5.1.3: trainer sees only own assigned school data (role-context filtered read)', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await gotoApp(page)

  // ---- Seed as admin: two schools, trainer A on school A, trainer B on school B,
  //      one siswa per school, one session per trainer. ----
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()

  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH_A)
  await field(page, 'SPP Bulanan').fill('100000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH_B)
  await field(page, 'SPP Bulanan').fill('100000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.locator('label', { hasText: SCH_A }).first().getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER2)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.locator('label', { hasText: SCH_B }).first().getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SISWA_A)
  await field(page, 'Sekolah').selectOption({ label: SCH_A })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SISWA_B)
  await field(page, 'Sekolah').selectOption({ label: SCH_B })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await recordSession(page, { schoolName: SCH_A, trainerName: TRAINER, date: thisMonthDate(10) })
  await recordSession(page, { schoolName: SCH_B, trainerName: TRAINER2, date: thisMonthDate(11) })

  // ---- Log out and in as trainer A (assigned to school A only). ----
  await page.getByRole('button', { name: 'Ganti Peran' }).click()
  await expect(page.getByText('Pilih Peran Masuk')).toBeVisible()
  await page.getByRole('button', { name: 'Pilih peran Trainer' }).click()
  await page.locator('select').first().selectOption({ label: TRAINER })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()

  // Store reads are scoped: only trainer A's school, siswa, and sessions.
  const scoped = await page.evaluate(async () => {
    const mod = await import('/src/lib/store.js')
    return {
      sekolah: mod.readCached('sekolah').map(s => s.nama),
      siswa: mod.readCached('siswa').map(s => s.nama),
      absensi: mod.readCached('absensi').map(a => a.sekolahId),
      trainers: mod.readCached('trainer').map(t => t.nama),
    }
  })
  expect(scoped.sekolah).toEqual([SCH_A])
  expect(scoped.siswa).toEqual([SISWA_A])
  expect(scoped.trainers).toEqual([TRAINER])
  expect(scoped.absensi.length).toBe(1)

  // Absensi form: school dropdown lists only the trainer's own school.
  await openTab(page, 'Data Absensi')
  await page.getByRole('button', { name: 'Input Absensi' }).click()
  const schoolOptions = await field(page, 'Sekolah').locator('option').allTextContents()
  expect(schoolOptions).toContain(SCH_A)
  expect(schoolOptions).not.toContain(SCH_B)

  // Read-only student list shows only the trainer's own siswa.
  await openTab(page, 'Data Siswa')
  await expect(page.getByText('Manajemen Siswa')).toBeVisible()
  await expect(page.getByText(SISWA_A, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(SISWA_B, { exact: true })).toHaveCount(0)

  // Riwayat shows only the trainer's own sessions.
  await openTab(page, 'Riwayat Absensi')
  await expect(page.getByText('Riwayat Absensi Saya')).toBeVisible()
  await expect(page.getByText(TRAINER2, { exact: true })).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})
