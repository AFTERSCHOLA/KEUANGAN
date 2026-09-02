import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF1.3 — deleting a siswa nullifies absensi
// entries[].siswaId so attendanceStats() / Rekap no longer count
// the deleted student. sppPayments rows are append-only (RD) and
// must survive. Verifies the cascade server-side AND the local
// cache mirror (client's best-effort).
// ============================================================

const APP = 'http://localhost:5173'
const SISWA_NAME = 'AF1.3 Siswa Verifikasi'
const SISWA_NAME_2 = 'AF1.3 Siswa Kontrol'

function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

// The Data Siswa page has a page-level PeriodFilter with a "Bulan" select
// whose options are "Januari", "Februari", ... "Oktober" etc. (no
// "Sekolah" label, but the field helper's :has(> label) requires a direct
// label child, so it shouldn't match). The actual Sekolah select lives in
// the Tambah Siswa modal. Use a Modal-scoped locator to disambiguate.
function sekolahSelectInModal(page) {
  return page.getByRole('dialog').locator('div:has(> label:text("Sekolah")) select').first()
}

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__af13_reset')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__af13_reset', '1')
  })
}

test('M-AF1.3: siswa delete nullifies absensi siswaId, spares sppPayments, drops Rekap count', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // ---- SEED: 1 sekolah, 2 siswa, 1 absensi entry per siswa. ----
  await page.getByRole('button', { name: 'Data Sekolah', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill('SD AF1.3')
  await field(page, 'SPP Bulanan').fill('100000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(page.getByText('SD AF1.3').first()).toBeVisible()

  await page.getByRole('button', { name: 'Data Siswa', exact: true }).click()
  for (const name of [SISWA_NAME, SISWA_NAME_2]) {
    await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
    await field(page, 'Nama Siswa').fill(name)
    await field(page, 'Kelas').fill('1A')
    await sekolahSelectInModal(page).selectOption({ label: 'SD AF1.3' })
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  }

  // Inject the absensi + sppPayments ledgers directly into localStorage,
  // then reload so the app re-pulls server-side data on next navigation.
  // Both siswa get a 'Hadir' attendance record (counts in stats) and a
  // paid SPP entry (preserved by RD). The deleted siswa's absensi
  // siswaId should be nullified, but their SPP payment row stays.
  const injected = await page.evaluate(({ names }) => {
    const sekolah = JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]')
    const siswa = JSON.parse(localStorage.getItem('afterschola_v4_siswa') || '[]')
    const sch = sekolah.find(s => s.nama === 'SD AF1.3')
    const target = siswa.find(s => s.nama === names[0])
    const control = siswa.find(s => s.nama === names[1])
    const today = new Date().toISOString().slice(0, 10)
    const periode = today.slice(0, 7)
    const absensi = [{
      id: `abs-af13-${Date.now()}`,
      tanggal: today,
      periode,
      sekolahId: sch.id,
      trainerId: 'trn-af13',
      trainerNama: 'AF1.3 Trainer',
      trainerStatus: 'Hadir',
      siswaList: [
        { siswaId: target.id, nama: names[0], status: 'Hadir' },
        { siswaId: control.id, nama: names[1], status: 'Hadir' },
      ],
    }]
    const sppPayments = [{
      id: `spp-af13-${Date.now()}`,
      siswaId: target.id,
      periode,
      nominal: 100000,
      tanggalBayar: today,
      metode: 'Tunai-Trainer',
      diterimaOleh: 'trn-af13',
      sudahDisetor: false,
      bukti: null,
    }]
    localStorage.setItem('afterschola_v4_absensi', JSON.stringify(absensi))
    localStorage.setItem('afterschola_v4_sppPayments', JSON.stringify(sppPayments))
    return { targetId: target.id, controlId: control.id, absensiCount: absensi.length, sppCount: sppPayments.length }
  }, { names: [SISWA_NAME, SISWA_NAME_2] })

  expect(injected.absensiCount).toBe(1)
  expect(injected.sppCount).toBe(1)

  // ---- DELETE the target siswa via the UI. ----
  await page.getByRole('button', { name: 'Data Siswa', exact: true }).click()
  const targetRow = page.locator('tr', { has: page.getByText(SISWA_NAME) }).first()
  const deleteBtn = targetRow.locator('button').last()
  await deleteBtn.click()
  // Wait for the confirm dialog to be visible
  await page.getByRole('button', { name: 'Hapus', exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Hapus', exact: true }).click()
  // Wait for either the row to disappear or the dialog to close
  await page.waitForTimeout(3000)
  const state = await page.evaluate(({ name }) => {
    const siswa = JSON.parse(localStorage.getItem('afterschola_v4_siswa') || '[]')
    return {
      siswaCount: siswa.length,
      siswaNames: siswa.map(s => s.nama),
      hasTarget: siswa.some(s => s.nama === name),
    }
  }, { name: SISWA_NAME })
  console.log(`AF1.3: post-delete state: ${JSON.stringify(state)}`)
  const rowCount = await page.locator('tr', { has: page.getByText(SISWA_NAME) }).count()
  console.log(`AF1.3: rowCount=${rowCount}`)
  await expect(targetRow).toHaveCount(0)

  // ---- ASSERT — absensi entry for the deleted siswa has siswaId = null,
  // sppPayments row for the deleted siswa survives. ----
  const after = await page.evaluate(({ targetId, controlId }) => {
    const absensi = JSON.parse(localStorage.getItem('afterschola_v4_absensi') || '[]')
    const sppPayments = JSON.parse(localStorage.getItem('afterschola_v4_sppPayments') || '[]')
    const siswa = JSON.parse(localStorage.getItem('afterschola_v4_siswa') || '[]')
    return {
      absensi,
      sppPayments,
      siswaStillThere: siswa.some(s => s.id === targetId),
    }
  }, injected)

  // The single absensi row should still exist, but its siswaList entries
  // for the deleted siswa must have siswaId = null. The control siswa is
  // untouched.
  expect(after.absensi.length).toBe(1)
  const targetEntry = after.absensi[0].siswaList.find(e => e.nama === SISWA_NAME)
  const controlEntry = after.absensi[0].siswaList.find(e => e.nama === SISWA_NAME_2)
  expect(targetEntry).toBeTruthy()
  expect(targetEntry.siswaId).toBeNull()
  expect(controlEntry.siswaId).toBe(injected.controlId)
  expect(controlEntry.siswaId).not.toBeNull()

  // The SPP payment row survives (append-only ledger).
  expect(after.sppPayments.length).toBe(1)
  expect(after.sppPayments[0].siswaId).toBe(injected.targetId)
  expect(after.siswaStillThere).toBe(false)

  // ---- ASSERT — Rekap / Overview no longer counts the deleted siswa. ----
  // After the delete + cache re-read, attendanceStats() should produce
  // 1 'Hadir' per live siswa (control only). The deleted siswa's count
  // was previously 1, so the live count must be exactly 1.
  const liveStats = await page.evaluate(async () => {
    const store = await import('/src/lib/store.js')
    const finance = await import('/src/lib/finance.js')
    const absensi = store.readCached('absensi')
    const siswa = store.readCached('siswa')
    const today = new Date().toISOString().slice(0, 10)
    const periode = today.slice(0, 7)
    return {
      stats: finance.attendanceStats(absensi, periode),
      siswaIds: siswa.map(s => s.id),
    }
  })
  const liveStudentIds = new Set(liveStats.siswaIds)
  // No active siswa should have a null/undefined stats key.
  for (const id of liveStudentIds) {
    expect(liveStats.stats.studentPeriodCount[id] ?? 0).toBe(1)
  }
  // The "null" key would only exist if a deleted siswa was still counted.
  expect(liveStats.stats.studentPeriodCount['null'] ?? 0).toBe(0)

  expect(pageErrors).toHaveLength(0)
})
