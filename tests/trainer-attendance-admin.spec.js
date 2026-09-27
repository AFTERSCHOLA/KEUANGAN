import { test, expect, loginViaApi, primeCsrf, readEntity, createBranch, createSekolahSuperadmin, logout } from './fixtures.js'

// ============================================================
// TA.B.4 — Admin attendance management (absensiPengajar correction + scope).
//
// VERIFY (TRAINER_ATTENDANCE_MILESTONES.md TA.B.4):
// -> admin cabang tidak melihat cabang lain;
// -> superadmin melihat semua;
// -> koreksi tersimpan dan terbaca kembali.
//
// FIX (run #3, CONFIRMED WORKING): switchRole() pakai logout(page) +
// page.context().clearCookies() sebelum loginViaApi() — race login sudah
// hilang total di run ini (dua percobaan sebelumnya, login ulang langsung
// dan page.goto('about:blank'), gagal).
//
// FIX (run #4): test 1 sebelumnya pakai getByText(nama sekolah), yang
// strict-mode-violation karena nama sekolah muncul 2x di halaman:
// <option> di dropdown filter "Semua Sekolah" DAN <td> di baris tabel.
// Diganti ke getByRole('cell', {...}) supaya scope-nya cuma ke tabel.
//
// INVESTIGASI (run #4): test 2 — modal koreksi tidak pernah nutup, TANPA
// error text sama sekali, sampai test timeout 60s habis. Ini pola request
// yang tidak resolve (saving state React nyangkut true selamanya), bukan
// lagi soal selector. Debug section diganti dari waitForTimeout+baca DOM
// jadi page.waitForResponse eksplisit ke /api/absensiPengajar.php supaya
// ketahuan persis: request-nya kekirim atau tidak, dan kalau kekirim,
// status/body-nya apa.
// ============================================================

const APP = 'http://localhost:5173'
const TRAINER_ID = 'trn-test-1'
const CABANG_A = 'cbg-test-pusat' // home cabang admin.cabang@test.local

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

// ASUMSI belum diverifikasi: trainer.php action 'update' menerima
// penugasanPengajar sebagai REPLACE penuh (dikonfirmasi di TA.B.3), jadi
// di sini kita baca dulu array yang sudah ada dan APPEND assignment baru
// supaya assignment sekolah pertama (kalau ada) tidak hilang.
async function addActiveAssignment(page, csrf, sekolahId, cabangId) {
  const trainerListRes = await page.request.get('/api/read.php?entity=trainer', {
    headers: { 'X-CSRF-Token': csrf },
  })
  if (!trainerListRes.ok()) {
    throw new Error(`read trainer failed: ${trainerListRes.status()} ${await trainerListRes.text()}`)
  }
  const trainerList = await trainerListRes.json()
  const currentTrainer = trainerList.find(t => t.id === TRAINER_ID)
  if (!currentTrainer) throw new Error(`trainer ${TRAINER_ID} tidak ditemukan`)

  const { cabangId: _omit, ...trainerWithoutCabang } = currentTrainer
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const yearAhead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const existing = currentTrainer.penugasanPengajar || []
  const assignmentId = `pgs-TAB4-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  const res = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      ...trainerWithoutCabang,
      id: TRAINER_ID,
      action: 'update',
      penugasanPengajar: [
        ...existing,
        {
          id: assignmentId,
          sekolahId,
          trainerId: TRAINER_ID,
          asistenId: null,
          cabangId,
          periodeMulai: yearAgo,
          periodeSelesai: yearAhead,
          aktif: true,
        },
      ],
    },
  })
  if (!res.ok()) throw new Error(`addActiveAssignment failed: ${res.status()} ${await res.text()}`)
}

// DC.B.4 (D-DC1) — direct save: Tersimpan means server-persisted; no
// Sinkronisasi step. Helpers renamed (drop the Sync suffix).
async function trainerFillMultiple(page, entries) {
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
}

async function trainerFill(page, sekolahId, status = 'Hadir') {
  await trainerFillMultiple(page, [{ sekolahId, status }])
}

test.describe('TA.B.4: admin attendance management', () => {
  test('admin cabang hanya melihat absensi cabangnya, superadmin melihat semua', async ({ page }) => {
    const suffix = String(Date.now()).slice(-6)

    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)

    const { id: sekolahAId } = await createSekolahSuperadmin(
      page, csrf, `SD TAB4-A ${suffix}`, 500000, CABANG_A, `TAB4A-${suffix}`,
    )
    await addActiveAssignment(page, csrf, sekolahAId, CABANG_A)

    const kodeB = `TAB4B${suffix}`
    await createBranch(page, csrf, kodeB, `Cabang TAB4 B ${suffix}`, suffix)
    const cabangBId = `cbg-${kodeB}-${suffix}`

    const { id: sekolahBId } = await createSekolahSuperadmin(
      page, csrf, `SD TAB4-B ${suffix}`, 500000, cabangBId, `TAB4Bsch-${suffix}`,
    )
    await addActiveAssignment(page, csrf, sekolahBId, cabangBId)

    await trainerFillMultiple(page, [
      { sekolahId: sekolahAId, status: 'Hadir' },
      { sekolahId: sekolahBId, status: 'Hadir' },
    ])

    await switchRole(page, 'adminCabang')
    await gotoApp(page)
    await openTab(page, 'Absensi Tenaga Pengajar')

    await expect(page.getByRole('heading', { name: 'Absensi Tenaga Pengajar' })).toBeVisible()
    // FIX (run #4): getByRole('cell', ...) bukan getByText — nama sekolah
    // juga muncul di <option> dropdown filter, getByText kena strict-mode
    // violation karena 2 match.
    await expect(page.getByRole('cell', { name: `SD TAB4-A ${suffix}`, exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: `SD TAB4-B ${suffix}`, exact: true })).not.toBeVisible()

    await switchRole(page, 'superadmin')
    const [absensiPengajarRes, sekolahRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/read.php') && res.url().includes('entity=absensiPengajar')),
      page.waitForResponse(res => res.url().includes('/api/read.php') && res.url().includes('entity=sekolah')),
      gotoApp(page),
    ])
    expect(absensiPengajarRes.ok()).toBe(true)
    expect(sekolahRes.ok()).toBe(true)
    await openTab(page, 'Absensi Tenaga Pengajar')

    await expect(page.getByRole('cell', { name: `SD TAB4-A ${suffix}`, exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: `SD TAB4-B ${suffix}`, exact: true })).toBeVisible()
  })

  test('koreksi admin tersimpan sebagai record baru dan terbaca kembali', async ({ page }) => {
    const suffix = String(Date.now()).slice(-6)

    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)
    const { id: sekolahId } = await createSekolahSuperadmin(
      page, csrf, `SD TAB4-Koreksi ${suffix}`, 500000, CABANG_A, `TAB4K-${suffix}`,
    )
    await addActiveAssignment(page, csrf, sekolahId, CABANG_A)

    await trainerFill(page, sekolahId, 'Hadir')

    await switchRole(page, 'superadmin')
    csrf = await primeCsrf(page)
    const before = await readEntity(page, 'absensiPengajar', csrf)
    const original = before.find(r => r.trainerId === TRAINER_ID && r.sekolahId === sekolahId && !r.correctionOf)
    expect(original).toBeTruthy()

    await switchRole(page, 'adminCabang')
    await gotoApp(page)
    await openTab(page, 'Absensi Tenaga Pengajar')

    const row = page.locator('tr', { hasText: `SD TAB4-Koreksi ${suffix}` })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Koreksi' }).click()

    await expect(page.getByText(/Koreksi Absensi/)).toBeVisible()
    await page.locator('select').last().selectOption('Izin')

    // INVESTIGASI (run #4): ganti dari waitForTimeout+baca DOM ke
    // page.waitForResponse eksplisit. Kalau ini sendiri timeout 15s,
    // berarti request-nya TIDAK PERNAH terkirim/diterima server (masalah
    // di client, bukan server). Kalau dapat response tapi status-nya
    // bukan 200, itu jawabannya langsung dari body.
    const [correctRes] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes('/api/absensiPengajar.php') && res.request().method() === 'POST',
        { timeout: 15000 },
      ),
      page.getByRole('button', { name: 'Simpan Koreksi' }).click(),
    ])

    await expect(page.getByText(/Koreksi Absensi/)).not.toBeVisible()
    await expect(row.getByText('Sudah dikoreksi')).toBeVisible()
    await expect(row.getByText('Izin')).toBeVisible()

    csrf = await primeCsrf(page)
    const after = await readEntity(page, 'absensiPengajar', csrf)
    const stillOriginal = after.find(r => r.id === original.id)
    expect(stillOriginal).toBeTruthy()
    expect(stillOriginal.status).toBe('Hadir')

    const correction = after.find(r => r.correctionOf === original.id)
    expect(correction).toBeTruthy()
    expect(correction.status).toBe('Izin')
  })
})