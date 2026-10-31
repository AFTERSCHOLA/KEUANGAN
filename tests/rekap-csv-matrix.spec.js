import { test, expect, loginViaApi, primeCsrf, createSekolahSuperadmin, logout } from './fixtures.js'
import { buildTrainerMatrix, formatMatrixCell } from '../src/lib/trainerAttendance.js'
import fs from 'node:fs'

// Task-2 VERIFY (persists per taste #16): matrix CSV downloads with the
// `sep=;` opener, xlsx-matching header (NO + NAMA SEKOLAH + one column per
// calendar day), cells byte-equal to formatMatrixCell, and no duplicate
// display lines (Paris Jundi exemplar chase: two stored records with
// identical fields must render/export exactly once — data stays in DB).
// Run: npx playwright test tests/rekap-csv-matrix.spec.js --project=default --workers=1
// Requires PHP :8000 + test DB live (same prerequisite as export-doc.spec.js).

const APP = 'http://localhost:5173'
const CABANG_A = 'cbg-test-pusat'
// Fixed 31-day month (Agustus 2026) — same proven pin as
// tests/export-doc.spec.js (localStorage selectedYear/selectedMonth).
const PERIODE = '2026-08'
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

function weekdayHeader(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return HARI[(new Date(y, m - 1, d).getDay() + 6) % 7]
}

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

function pinPeriode(page) {
  return page.addInitScript(() => {
    try {
      const raw = localStorage.getItem('afterschola_v4_ui')
      const cur = raw ? JSON.parse(raw) : {}
      localStorage.setItem('afterschola_v4_ui', JSON.stringify({ ...cur, selectedYear: 2026, selectedMonth: 8 }))
    } catch { /* storage unavailable — periode falls back to current month */ }
  })
}

test('matrixCSV: identical display lines collapse to one entry (dupe-chase pin)', () => {
  const trainer = [{ id: 'trn-w', nama: 'Paris Jundi', tipePengajar: 'instruktur' }]
  const sekolah = [{ id: 'skl-x', nama: 'SD Al-Irhaam' }]
  const day = `${PERIODE}-12`
  // Exemplar shape: TWO stored records, distinct ids, identical fields.
  const twin1 = { id: 'dup-1', trainerId: 'trn-w', sekolahId: 'skl-x', tanggal: day, periode: PERIODE, status: 'Hadir', keterangan: null, catatan: '', cabangId: CABANG_A }
  const twin2 = { ...twin1, id: 'dup-2' }
  const { rows } = buildTrainerMatrix({ absensiPengajar: [twin1, twin2], sekolah, trainer, periode: PERIODE })
  expect(rows).toHaveLength(1)
  expect(rows[0].cells[day]).toHaveLength(1)
  expect(rows[0].cells[day][0]).toMatchObject({ nama: 'Paris Jundi', label: 'I' })

  // Same record joined twice collapses too (single mechanism: identical
  // display lines — first wins, data untouched).
  const again = buildTrainerMatrix({ absensiPengajar: [twin1, twin1], sekolah, trainer, periode: PERIODE })
  expect(again.rows[0].cells[day]).toHaveLength(1)

  // Guard against over-dedupe: same person/date with DIFFERENT details
  // (the AP.C.3 flat-export scenario) must keep both lines.
  const other = { ...twin1, id: 'dup-3', status: 'Izin', keterangan: 'Pengganti' }
  const kept = buildTrainerMatrix({ absensiPengajar: [twin1, other], sekolah, trainer, periode: PERIODE })
  expect(kept.rows[0].cells[day]).toHaveLength(2)
})

test('matrixCSV: sep opener + matrix header + byte-equal cells + no dupe lines', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const namaWidia = `Sim M2X Widia ${suffix}`
  const namaAsyifa = `Sim M2X Asyifa ${suffix}`
  const namaSekolah = `Sim M2X SD Matrix ${suffix}`
  const widiaId = `trn-M2XW-${suffix}`
  const asyifaId = `trn-M2XA-${suffix}`
  const dayTwin = `${PERIODE}-12`
  const daySingle = `${PERIODE}-05`
  const rowIds = []

  await pinPeriode(page)
  await loginViaApi(page, 'adminCabang')
  let csrf = await primeCsrf(page)
  for (const [id, nama, tipe] of [[widiaId, namaWidia, 'instruktur'], [asyifaId, namaAsyifa, 'asisten']]) {
    const res = await page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id, nama, honor: 50000, tipePengajar: tipe, sekolahIds: [], action: 'create' },
    })
    if (!res.ok()) throw new Error(`create trainer failed: ${res.status()} ${await res.text()}`)
    csrf = await primeCsrf(page)
  }

  await switchRole(page, 'superadmin')
  csrf = await primeCsrf(page)
  const { id: schId } = await createSekolahSuperadmin(page, csrf, namaSekolah, 500000, CABANG_A, `M2X-${suffix}`)
  function pushEntry(list, trainerId, tanggal, extra = {}) {
    const rid = `absp-M2X-${suffix}-${list.length}`
    rowIds.push(rid)
    list.push({
      key: 'absensiPengajar',
      id: rid,
      record: {
        id: rid, trainerId, sekolahId: schId,
        tanggal, periode: PERIODE,
        status: 'Hadir', keterangan: null, catatan: '', cabangId: CABANG_A,
        ...extra,
      },
    })
  }
  const entries = []
  // Double-recording pair on one date (exemplar Paris Jundi shape).
  pushEntry(entries, widiaId, dayTwin)
  pushEntry(entries, widiaId, dayTwin)
  pushEntry(entries, asyifaId, dayTwin, { keterangan: 'EXPO' })
  pushEntry(entries, widiaId, daySingle)
  const seedRes = await page.request.post('/api/sync.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { entries },
  })
  if (!seedRes.ok()) throw new Error(`seed rows failed: ${seedRes.status()} ${await seedRes.text()}`)
  expect((await seedRes.json()).failed ?? [], 'all seeded rows accepted').toHaveLength(0)

  await gotoApp(page)
  await openMatriks(page)
  await expect(page.getByText(`Periode ${PERIODE}`, { exact: false })).toBeVisible()
  // On-screen matrix already collapses the twin pair to one line per date
  // (dayTwin single + daySingle single = 2, not 3).
  const schRow = page.locator('tr', { hasText: namaSekolah })
  await expect(schRow.getByText(`${namaWidia} (I)`, { exact: false })).toHaveCount(2)

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Unduh CSV Matriks', exact: true }).click({ timeout: 15000 }),
  ])
  console.log('## M2X download:', download.suggestedFilename())
  expect(download.suggestedFilename()).toBe(`Rekap_Matriks_${PERIODE}.csv`)
  const raw = fs.readFileSync(await download.path(), 'utf8')
  expect(raw.charCodeAt(0)).toBe(0xFEFF) // Excel BOM kept
  const content = raw.replace(/^\uFEFF/, '')
  expect(content).toContain('\r\n') // CRLF endings (Excel open-correctly)
  const lines = content.split('\r\n')
  expect(lines[0]).toBe('sep=;') // opener exact (Excel honors + hides it)

  // Header: NO + NAMA SEKOLAH + one column per calendar day (31 + 2),
  // each date flattened as `<Hari> <n>` from the two-row doc header.
  const header = lines[1].split(';')
  expect(header.slice(0, 2)).toEqual(['NO', 'NAMA SEKOLAH'])
  expect(header.length).toBe(31 + 2)
  expect(header[2]).toBe(`${weekdayHeader(`${PERIODE}-01`)} 1`)
  expect(header[13]).toBe(`${weekdayHeader(dayTwin)} 12`)

  // One row per school — never more rows than the visible table.
  const mine = lines.filter(l => l.includes(namaSekolah))
  expect(mine).toHaveLength(1)

  // Cells byte-equal to formatMatrixCell (the single text owner).
  const widiaText = formatMatrixCell({ nama: namaWidia, label: 'I', status: 'Hadir', keterangan: null, catatan: '' })
  const asyifaText = formatMatrixCell({ nama: namaAsyifa, label: 'A', status: 'Hadir', keterangan: 'EXPO', catatan: '' })
  expect(mine[0]).toContain(widiaText)
  expect(mine[0]).toContain(asyifaText)

  // Dupe chase: the double-recorded pair exports exactly once per date
  // (dayTwin collapsed + daySingle single = 2 occurrences, not 3).
  const widiaHits = content.split(widiaText).length - 1
  expect(widiaHits).toBe(2)
  const asyifaHits = content.split(asyifaText).length - 1
  expect(asyifaHits).toBe(1)
  console.log('## M2X matrix CSV shape + dupe-collapse OK')

  // in-run cleanup (reverse order): trainers + school; ledger rows are
  // out-of-band (ids logged, AP.C.3 idiom).
  await switchRole(page, 'adminCabang')
  csrf = await primeCsrf(page)
  for (const tid of [widiaId, asyifaId]) {
    console.log(`## M2X cleanup trainer -> ${(await page.request.post('/api/trainer.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: tid } })).status()}`)
  }
  await switchRole(page, 'superadmin')
  csrf = await primeCsrf(page)
  console.log(`## M2X cleanup sekolah -> ${(await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: schId } })).status()}`)
  console.log(`## M2X ledger orphans (out-of-band removal): ${JSON.stringify(rowIds)}`)

  expect(pageErrors).toHaveLength(0)
})
