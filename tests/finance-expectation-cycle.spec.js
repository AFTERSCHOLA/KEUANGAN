import { test, expect, loginViaApi, primeCsrf, readEntity, logout, createSekolahSuperadmin } from './fixtures.js'

// ============================================================
// T2.E.2 (F-T2-14/F-T2-15/F-T2-16; D-T2-9; R-T2-1, R-T2-4, R-T2-5,
// R-T2-7, R-T2-8) — Prove audit, frozen, payable-independence,
// failing-first. Code ONLY where a leg fails, one side per leg.
//
// Leg 1 (F-T2-14 audit): admin correction stores recorder identity
//   readable in summary payload.
//   Current: correction preserves dicatatOleh client-side
//     (trainerAttendance.js:110-124); admin UI edits status/catatan
//     only (TrainerAttendanceAdmin.jsx:106-111); server correct path
//     re-runs the caller-identity gate as the CORRECTOR
//     (absensiPengajar.php:50-53) — preservation vs gate unproven.
//   Expected: external row recorded by trainer T (dicatatOleh=T) ->
//     admin corrects Hadir->Izin via UI -> correction row keeps
//     dicatatOleh=T AND summarizeTrainerAttendance() riwayat for the
//     external carries dicatatOleh=T (recorder identity survives the
//     correction and is readable in the summary payload).
//   Rule: failing-first proof (R-T2-8); fix one side only.
//   Result: RED below isolates the failing side; GREEN pins audit.
//
// Leg 2 (F-T2-15 frozen): frozen Terbit invoice immune to later
//   student-count/meeting-count changes.
//   Current: grandTotal stored once at Terbit
//     (invoiceGenerator.php:225-228); settlement reads the stored
//     total (invoices.js:221-251) — immunity unproven.
//   Expected: Terbit invoice grandTotal byte-identical after +1
//     student AND +1 weekly meeting on the school; invoiceSettlement
//     total unchanged; UI reopens with the same total.
//   Rule: already decided (D-SB11) — proof only unless leg fails.
//   Result: GREEN pins frozen; RED would scope a (forbidden-by-D-SB11)
//     recompute path to one side.
//
// Leg 3 (F-T2-16 payable-independence, TEST 17 CRITICAL): SPP 10jt
//   paid 5jt while trainer completed 2jt work -> payable stays 2jt,
//   payment 0/unpaid.
//   Current: payable derives from attendance+role/tier with no SPP
//     input (finance.js:89-225) — full-payable-while-partial-SPP
//     unproven end-to-end.
//   Expected: school SPP 500rb x 20 siswa = invoice 10jt; 10 siswa
//     paid (5jt); trainer honor 500rb x 4 Hadir = 2jt work, zero honor
//     payments -> Data Pembayaran row shows Akumulasi Beban Rp2jt /
//     Dibayar Rp0 / Status Unpaid; Data Keuangan school row shows
//     realisasi 5jt beside beban 2jt (payable NEVER reads SPP).
//   Rule: already designed — proof only unless leg fails.
//   Result: GREEN pins independence; a 1jt-priced payable = Major FAIL.
//
// Pattern: tests/penugasan-double-booking.spec.js (API seed + UI act
//   + server read-back + reload) + tests/invoice-installment.spec.js
//   (canonical Buat & Terbitkan Invoice flow). Hermetic suffix-marked
//   schools/trainers/students; best-effort cleanup in-run.
//
// VERIFY: npx playwright test tests/finance-expectation-cycle.spec.js --workers=1
// ============================================================

const APP = 'http://localhost:5173'
const CABANG_ID = 'cbg-test-pusat'
const PERIODE = '2026-09'
const TRAINER_SEED_ID = 'trn-test-1'

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
  return loginViaApi(page, role)
}

async function appendTrainerAssignment(page, csrf, trainerId, sekolahId, cabangId) {
  const trainers = await readEntity(page, 'trainer', csrf)
  const current = trainers.find(t => t.id === trainerId)
  if (!current) throw new Error(`trainer ${trainerId} tidak ditemukan`)
  const { cabangId: _omit, ...rest } = current
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const yearAhead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  // Explicit distinct clock slot: slot-less rows are unscoped and fan out
  // against every overlapping row on the same host (assignments.php:246
  // + T2.E.1 hard-block), so a bare append 422s on residue-rich trainers.
  const assignmentId = `pgs-T2E2-${Date.now()}`
  const res = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      ...rest,
      id: trainerId,
      action: 'update',
      penugasanPengajar: [
        ...(current.penugasanPengajar || []),
        {
          id: assignmentId,
          sekolahId,
          trainerId,
          asistenId: null,
          cabangId,
          periodeMulai: yearAgo,
          periodeSelesai: yearAhead,
          aktif: true,
          hari: 'Sabtu',
          jamMulai: '07:00',
          jamSelesai: '08:00',
        },
      ],
    },
  })
  if (!res.ok()) throw new Error(`append assignment failed: ${res.status()} ${await res.text()}`)
  return assignmentId
}

// Drops this task's assignment rows from a shared seed trainer so
// re-runs never stack overlapping rows onto it (own residue only:
// pgs-T2E2- spec rows + pgs-probe- throwaway-probe rows).
async function removeOwnAssignments(page, trainerId) {
  const ownPrefixes = ['pgs-T2E2-', 'pgs-probe-']
  try {
    await loginViaApi(page, 'superadmin')
    const csrf = await primeCsrf(page)
    const trainers = await readEntity(page, 'trainer', csrf)
    const current = trainers.find(t => t.id === trainerId)
    if (!current) return
    const kept = (current.penugasanPengajar || []).filter(a => !(a && typeof a.id === 'string' && ownPrefixes.some(p => a.id.startsWith(p))))
    if (kept.length === (current.penugasanPengajar || []).length) return
    const { cabangId: _omit, ...rest } = current
    await page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { ...rest, id: trainerId, action: 'update', penugasanPengajar: kept },
    })
  } catch { /* inert */ }
}

async function createSiswa(page, csrf, id, nama, sekolahId) {
  const res = await page.request.post('/api/siswa.php', {
    headers: { 'X-CSRF-Token': csrf },
    // siswa.php derives cabangId from sekolahId server-side and 422s a
    // client-sent one — mirror writeRemote's sanitize (store.js:480).
    data: { action: 'create', id, nama, sekolahId, status: 'Aktif' },
  })
  if (!res.ok()) throw new Error(`create siswa failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

async function postSppPayment(page, csrf, { id, siswaId, nominal, tanggalBayar }) {
  const res = await page.request.post('/api/sppPayments.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'create',
      id,
      siswaId,
      periode: PERIODE,
      nominal,
      tanggalBayar,
      metode: 'Transfer',
      diterimaOleh: 'E2E Tester',
      sumberDana: 'sekolah',
      cabangId: CABANG_ID,
    },
  })
  if (!res.ok()) throw new Error(`create sppPayment failed: ${res.status()} ${await res.text()}`)
}

async function postAbsensiPengajar(page, csrf, record) {
  const res = await page.request.post('/api/absensiPengajar.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: record,
  })
  const body = await res.text()
  if (!res.ok()) throw new Error(`write absensiPengajar failed: ${res.status()} ${body}`)
  return JSON.parse(body)
}

async function bestEffortCleanup(page, { sekolahIds = [], trainerIds = [] } = {}) {
  try {
    await loginViaApi(page, 'adminCabang')
    const csrf = await primeCsrf(page)
    for (const id of trainerIds) {
      await page.request.post('/api/trainer.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { id, action: 'delete' },
      })
    }
  } catch { /* inert */ }
  try {
    await loginViaApi(page, 'superadmin')
    const csrf2 = await primeCsrf(page)
    for (const id of sekolahIds) {
      await page.request.post('/api/sekolah.php', {
        headers: { 'X-CSRF-Token': csrf2 },
        data: { action: 'delete', id },
      })
    }
  } catch { /* inert */ }
}

async function generateSeptemberInvoice(page, namaSekolah) {
  await openTab(page, 'Data Sekolah')
  const card = page.locator('.grid > div', { hasText: namaSekolah }).first()
  await card.getByTitle('Kelola Invoice').click()
  await expect(page.getByText(`Invoice — ${namaSekolah}`)).toBeVisible()
  const bulanLabel = page.locator('label', { hasText: 'Bulan' }).first()
  await bulanLabel.locator('xpath=following-sibling::select[1]').selectOption({ label: 'September' })
  await page.getByRole('button', { name: 'Buat & Terbitkan Invoice' }).click()
  await page.getByRole('button', { name: 'Ya, Lanjutkan' }).click()
  const invoiceRow = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
  await expect(invoiceRow.getByText('Belum Lunas')).toBeVisible({ timeout: 30000 })
  await page.keyboard.press('Escape')
}

// ---------------- Leg 1: correction audit identity ----------------

test('T2.E.2a: admin correction preserves recorder identity readable in summary payload', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const schoolName = `SD T2E2 Audit ${suffix}`
  const extName = `Eksternal T2E2 ${suffix}`
  const extId = `ext-T2E2-${suffix}`
  let sekolahId = null

  try {
    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)
    // Clear own residue first so re-runs never stack onto trn-test-1.
    await removeOwnAssignments(page, TRAINER_SEED_ID)
    await loginViaApi(page, 'superadmin')
    csrf = await primeCsrf(page)
    const sch = await createSekolahSuperadmin(page, csrf, schoolName, 500000, CABANG_ID, `T2E2A-${suffix}`)
    sekolahId = sch.id
    await appendTrainerAssignment(page, csrf, TRAINER_SEED_ID, sekolahId, CABANG_ID)

    // External assistant in the same school (adminCabang, own branch).
    await switchRole(page, 'adminCabang')
    csrf = await primeCsrf(page)
    // admin_cabang never sends cabangId (server forces from session).
    const extRes = await page.request.post('/api/eksternal.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { action: 'create', id: extId, nama: extName, sekolahId, kontak: '' },
    })
    if (!extRes.ok()) throw new Error(`create eksternal failed: ${extRes.status()} ${await extRes.text()}`)

    // Recorder: seeded trainer writes the external session as self.
    const trainerUser = await switchRole(page, 'trainer')
    const recorderId = trainerUser.id
    expect(recorderId).toBeTruthy()
    csrf = await primeCsrf(page)
    const originalId = `absp-T2E2A-${suffix}`
    await postAbsensiPengajar(page, csrf, {
      id: originalId,
      trainerId: extId,
      sekolahId,
      tanggal: '2026-09-10',
      periode: PERIODE,
      status: 'Hadir',
      keterangan: null,
      catatan: '',
      cabangId: CABANG_ID,
      peran: 'A',
      dicatatOleh: recorderId,
    })
    // Trainer-role read scope does not return external rows; the write
    // already returned ok — verify storage as superadmin.
    await switchRole(page, 'superadmin')
    csrf = await primeCsrf(page)
    const stored = (await readEntity(page, 'absensiPengajar', csrf)).find(r => r.id === originalId)
    expect(stored).toBeTruthy()
    expect(stored.dicatatOleh).toBe(recorderId)

    // Admin corrects Hadir -> Izin + note through the real UI dialog.
    await switchRole(page, 'adminCabang')
    await gotoApp(page)
    await openTab(page, 'Absensi Tenaga Pengajar')
    await expect(page.getByRole('heading', { name: 'Absensi Tenaga Pengajar' })).toBeVisible()
    const row = page.locator('tr', { hasText: schoolName })
    await expect(row.first()).toBeVisible()
    await row.first().getByRole('button', { name: 'Koreksi' }).click()
    await expect(page.getByText(/Koreksi Absensi/)).toBeVisible()
    await page.locator('select').last().selectOption('Izin')
    const [correctRes] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes('/api/absensiPengajar.php') && res.request().method() === 'POST',
        { timeout: 15000 },
      ),
      page.getByRole('button', { name: 'Simpan Koreksi' }).click(),
    ])
    expect(correctRes.ok()).toBe(true)
    await expect(page.getByText(/Koreksi Absensi/)).not.toBeVisible()
    await expect(row.first().getByText('Sudah dikoreksi')).toBeVisible()
    await expect(row.first().getByText('Izin')).toBeVisible()

    // Server read-back: correction keeps correctionOf + recorder identity.
    csrf = await primeCsrf(page)
    const after = await readEntity(page, 'absensiPengajar', csrf)
    const correction = after.find(r => r.correctionOf === originalId)
    expect(correction).toBeTruthy()
    expect(correction.status).toBe('Izin')
    expect(correction.dicatatOleh).toBe(recorderId)

    // Summary payload: the CURRENT row for the external still carries
    // the recorder identity (audit survives correction, readable where
    // the trainer summary reads it).
    const summary = await page.evaluate(async ({ rows, personId, periode }) => {
      const m = await import('/src/lib/trainerAttendance.js')
      return m.summarizeTrainerAttendance({ absensiPengajar: rows, trainerId: personId, periode })
    }, { rows: after, personId: extId, periode: PERIODE })
    expect(summary.count).toBe(1)
    expect(summary.riwayat).toHaveLength(1)
    expect(summary.riwayat[0].id).toBe(correction.id)
    expect(summary.riwayat[0].dicatatOleh).toBe(recorderId)

    expect(pageErrors).toEqual([])
  } finally {
    await removeOwnAssignments(page, TRAINER_SEED_ID)
    await bestEffortCleanup(page, { sekolahIds: [sekolahId].filter(Boolean), trainerIds: [] })
  }
})

// ---------------- Leg 2: frozen Terbit invoice ----------------

test('T2.E.2b: Terbit invoice immune to later student-count and meeting-count changes', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const schoolName = `SD T2E2 Frozen ${suffix}`
  let sekolahId = null

  try {
    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)
    const sch = await createSekolahSuperadmin(page, csrf, schoolName, 500000, CABANG_ID, `T2E2B-${suffix}`)
    sekolahId = sch.id
    await createSiswa(page, csrf, `sw-T2E2B1-${suffix}`, `T2E2B Siswa 1 ${suffix}`, sekolahId)
    await createSiswa(page, csrf, `sw-T2E2B2-${suffix}`, `T2E2B Siswa 2 ${suffix}`, sekolahId)

    await gotoApp(page)
    await generateSeptemberInvoice(page, schoolName)

    csrf = await primeCsrf(page)
    const before = (await readEntity(page, 'invoices', csrf)).find(inv => inv.sekolahId === sekolahId)
    expect(before).toBeTruthy()
    expect(before.status).toBe('Terbit')
    const frozenTotal = before.grandTotal ?? before.total
    expect(frozenTotal).toBe(1000000)

    // Mutation A — student count grows after Terbit.
    await createSiswa(page, csrf, `sw-T2E2B3-${suffix}`, `T2E2B Siswa 3 ${suffix}`, sekolahId)
    // Mutation B — weekly meeting count grows after Terbit.
    const schools = await readEntity(page, 'sekolah', csrf)
    const current = schools.find(s => s.id === sekolahId)
    const jadwalList = [...(current.jadwalList || []), { dayOfWeek: 'Selasa', time: '10:00', endTime: '11:00' }]
    const updRes = await page.request.post('/api/sekolah.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { ...current, id: sekolahId, action: 'update', jadwalList },
    })
    if (!updRes.ok()) throw new Error(`update jadwalList failed: ${updRes.status()} ${await updRes.text()}`)

    // Frozen: stored grandTotal byte-identical; derived settlement total
    // unchanged even with the new student + new meeting on the books.
    const afterInvoices = await readEntity(page, 'invoices', csrf)
    const after = afterInvoices.find(inv => inv.id === before.id)
    expect(after).toBeTruthy()
    expect(after.grandTotal ?? after.total).toBe(frozenTotal)
    const afterPayments = await readEntity(page, 'sppPayments', csrf)
    const afterSiswa = await readEntity(page, 'siswa', csrf)
    const settlement = await page.evaluate(async ({ invoice, sppPayments, siswa }) => {
      const m = await import('/src/lib/invoices.js')
      return m.invoiceSettlement(invoice, { sppPayments, siswa })
    }, { invoice: after, sppPayments: afterPayments, siswa: afterSiswa })
    expect(settlement.total).toBe(1000000)
    expect(settlement.status).toBe('Belum Lunas')

    // UI reopens with the same frozen total.
    await gotoApp(page)
    await page.getByText('Data Sekolah').click()
    const card = page.locator('.grid > div', { hasText: schoolName }).first()
    await card.getByTitle('Kelola Invoice').click()
    const reopenedRow = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
    await expect(reopenedRow.getByText(/Rp\s*1\.000\.000 — 2026-09/)).toBeVisible({ timeout: 20000 })
    await expect(reopenedRow.getByText('Belum Lunas')).toBeVisible()

    expect(pageErrors).toEqual([])
  } finally {
    await bestEffortCleanup(page, { sekolahIds: [sekolahId].filter(Boolean), trainerIds: [] })
  }
})

// ---------------- Leg 3: payable independent of SPP (TEST 17) ----------------

test('T2.E.2c: TEST 17 — SPP 10jt paid 5jt, trainer 2jt work stays payable 2jt / Unpaid', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const schoolName = `SD T2E2 Payable ${suffix}`
  const trainerName = `Instruktur T2E2 ${suffix}`
  const trainerId = `trn-T2E2C-${suffix}`
  let sekolahId = null

  try {
    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)
    const sch = await createSekolahSuperadmin(page, csrf, schoolName, 500000, CABANG_ID, `T2E2C-${suffix}`)
    sekolahId = sch.id

    // 20 billing students x 500rb = 10jt potensi.
    const siswaIds = []
    for (let i = 1; i <= 20; i += 1) {
      const sid = `sw-T2E2C${String(i).padStart(2, '0')}-${suffix}`
      siswaIds.push(sid)
      await createSiswa(page, csrf, sid, `T2E2C Siswa ${i} ${suffix}`, sekolahId)
    }

    await gotoApp(page)
    await generateSeptemberInvoice(page, schoolName)
    csrf = await primeCsrf(page)
    const invoice = (await readEntity(page, 'invoices', csrf)).find(inv => inv.sekolahId === sekolahId)
    expect(invoice).toBeTruthy()
    expect(invoice.grandTotal ?? invoice.total).toBe(10000000)

    // Half the tuition collected: first 10 students x 500rb = 5jt.
    for (let i = 0; i < 10; i += 1) {
      await postSppPayment(page, csrf, {
        id: `spp-T2E2C${String(i).padStart(2, '0')}-${suffix}`,
        siswaId: siswaIds[i],
        nominal: 500000,
        tanggalBayar: '2026-09-15',
      })
    }

    // Trainer completes 2jt of work: honor 500rb x 4 Hadir sessions.
    // Zero honorPayments rows: nothing of the payable has been paid.
    await switchRole(page, 'adminCabang')
    csrf = await primeCsrf(page)
    const trRes = await page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id: trainerId, nama: trainerName, honor: 500000, tipePengajar: 'instruktur', sekolahIds: [], action: 'create' },
    })
    if (!trRes.ok()) throw new Error(`create trainer failed: ${trRes.status()} ${await trRes.text()}`)

    await switchRole(page, 'superadmin')
    csrf = await primeCsrf(page)
    const tanggalList = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24']
    for (let i = 0; i < tanggalList.length; i += 1) {
      await postAbsensiPengajar(page, csrf, {
        id: `absp-T2E2C${i}-${suffix}`,
        trainerId,
        sekolahId,
        tanggal: tanggalList[i],
        periode: PERIODE,
        status: 'Hadir',
        keterangan: null,
        catatan: '',
        cabangId: CABANG_ID,
        peran: 'I',
        dicatatOleh: null,
      })
    }

    // Data Pembayaran: payable holds 2jt, payment 0, status Unpaid —
    // the half-empty SPP cash position never reprices the debt.
    await gotoApp(page)
    await openTab(page, 'Data Pembayaran')
    const payRow = page.locator('tr', { hasText: trainerName })
    await expect(payRow.first()).toBeVisible({ timeout: 30000 })
    // Beban AND sisa both read Rp2jt (payable held, nothing paid).
    await expect(payRow.first().getByText(/Rp\s*2\.000\.000/)).toHaveCount(2)
    await expect(payRow.first().getByText('Rp 0', { exact: true })).toBeVisible()
    await expect(payRow.first().getByText('Unpaid', { exact: true })).toBeVisible()

    // Data Keuangan: same school row shows 5jt collected beside 2jt
    // owed — full payable while SPP partial, side by side.
    await openTab(page, 'Data Keuangan')
    const schoolRow = page.locator('tr', { hasText: schoolName })
    await expect(schoolRow.first()).toBeVisible({ timeout: 30000 })
    await expect(schoolRow.first().getByText(/Rp\s*5\.000\.000/)).toBeVisible()
    await expect(schoolRow.first().getByText(/Rp\s*2\.000\.000/)).toBeVisible()

    expect(pageErrors).toEqual([])
  } finally {
    await bestEffortCleanup(page, { sekolahIds: [sekolahId].filter(Boolean), trainerIds: [trainerId] })
  }
})
