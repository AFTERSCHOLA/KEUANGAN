import { test, expect, loginViaApi, primeCsrf, createSekolahSuperadmin, logout } from './fixtures.js'

// EX.1 VERIFY (persists per taste #16): Unduh Dokumen opens the
// server-rendered attendance matrix (POST /api/export-doc.php) with the
// same cells as the Rekap view; print-to-PDF of the opened doc is 1 page
// for a full 31-day seeded month AND long-name schools; pageErrors 0.
// Run: npx playwright test tests/export-doc.spec.js --project=default --workers=1
// Requires PHP :8000 + test DB live (same prerequisite as invoice-doc.spec.js).

const APP = 'http://localhost:5173'
const CABANG_A = 'cbg-test-pusat'
const PERIODE = '2026-08' // fixed 31-day month (Agustus 2026)

function pad2(n) {
  return String(n).padStart(2, '0')
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

function countPdfPages(pdfBuffer) {
  const text = pdfBuffer.toString('latin1')
  const matches = text.match(/\/Type\s*\/Page[^s]/g)
  return matches ? matches.length : 0
}

test('export-doc: Unduh Dokumen opens server matrix; 1-page PDF on full month + long names', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const namaWidia = `SIM-EXD Widia ${suffix}`
  const namaAsyifa = `SIM-EXD Asyifa ${suffix}`
  const namaSekolah = `SIM-EXD SD Matrix ${suffix}`
  const namaPanjang = `SIM-EXD SD Negeri Panjang Nama Sekali ${suffix} Kebon Kelapa`
  const widiaId = `trn-EXDW-${suffix}`
  const asyifaId = `trn-EXDA-${suffix}`

  // Pin the Rekap periode to the fixed 31-day month before the app boots.
  await page.addInitScript(() => {
    try {
      const raw = localStorage.getItem('afterschola_v4_ui')
      const cur = raw ? JSON.parse(raw) : {}
      localStorage.setItem('afterschola_v4_ui', JSON.stringify({ ...cur, selectedYear: 2026, selectedMonth: 8 }))
    } catch { /* storage unavailable — periode falls back to current month */ }
  })

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
  const { id: schId } = await createSekolahSuperadmin(page, csrf, namaSekolah, 500000, CABANG_A, `EXD-${suffix}`)
  csrf = await primeCsrf(page)
  const { id: schLongId } = await createSekolahSuperadmin(page, csrf, namaPanjang, 500000, CABANG_A, `EXDL-${suffix}`)
  csrf = await primeCsrf(page)

  // Full-month seed: every day of 2026-08 carries rows (odd = Widia
  // Hadir, even = Asyifa Hadir+EXPO), plus tokens + a correction pair
  // (original Alpa superseded by Hadir) + long-name school rows.
  const entries = []
  const rowIds = []
  function pushRow(trainerId, sekolahId, day, extra = {}) {
    const rid = `absp-EXD-${suffix}-${pad2(day)}-${rowIds.length}`
    rowIds.push(rid)
    entries.push({
      key: 'absensiPengajar',
      id: rid,
      record: {
        id: rid, trainerId, sekolahId,
        tanggal: `${PERIODE}-${pad2(day)}`, periode: PERIODE,
        status: 'Hadir', keterangan: null, catatan: '', cabangId: CABANG_A,
        ...extra,
      },
    })
  }
  for (let day = 1; day <= 31; day++) {
    if (day % 2 === 1) pushRow(widiaId, schId, day)
    else pushRow(asyifaId, schId, day, { keterangan: 'EXPO' })
  }
  pushRow(widiaId, schId, 17, { keterangan: 'LIBUR' })
  pushRow(widiaId, schId, 20, { status: 'Izin', keterangan: 'Pengganti', catatan: 'Catatan ralat EXD' })
  const corrOrig = `absp-EXD-${suffix}-corr-orig`
  const corrFix = `absp-EXD-${suffix}-corr-fix`
  rowIds.push(corrOrig, corrFix)
  entries.push({
    key: 'absensiPengajar',
    id: corrOrig,
    record: { id: corrOrig, trainerId: widiaId, sekolahId: schId, tanggal: `${PERIODE}-21`, periode: PERIODE, status: 'Alpa', keterangan: null, catatan: '', cabangId: CABANG_A },
  })
  entries.push({
    key: 'absensiPengajar',
    id: corrFix,
    record: { id: corrFix, trainerId: widiaId, sekolahId: schId, tanggal: `${PERIODE}-21`, periode: PERIODE, status: 'Hadir', keterangan: null, catatan: '', cabangId: CABANG_A, correctionOf: corrOrig },
  })
  for (const day of [3, 10, 17, 24, 31]) pushRow(asyifaId, schLongId, day)
  const seedRes = await page.request.post('/api/sync.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { entries },
  })
  if (!seedRes.ok()) throw new Error(`seed rows failed: ${seedRes.status()} ${await seedRes.text()}`)
  const seedBody = await seedRes.json()
  expect(seedBody.failed ?? [], 'all seeded rows accepted').toHaveLength(0)

  await gotoApp(page)
  await openMatriks(page)
  await expect(page.getByText(`Periode ${PERIODE}`, { exact: false })).toBeVisible()

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Unduh Dokumen', exact: true }).click(),
  ])
  await popup.waitForLoadState('domcontentloaded')
  await expect(popup.getByText('NAMA SEKOLAH').first()).toBeVisible({ timeout: 15000 })
  await expect(popup.getByText(namaSekolah).first()).toBeVisible()
  await expect(popup.getByText(namaPanjang).first()).toBeVisible()
  await expect(popup.getByText('Agustus 2026')).toBeVisible()
  await expect(popup.getByText(`${namaWidia} (I)`, { exact: false }).first()).toBeVisible()
  await expect(popup.getByText('LIBUR', { exact: false }).first()).toBeVisible()
  console.log('## EX.1 server doc carries matrix content OK')

  const pdf = await popup.pdf()
  const pages = countPdfPages(pdf)
  console.log(`## EX.1 opened doc PDF pages: ${pages} (bytes=${pdf.length})`)
  expect(pages, 'full 31-day month + long names fit 1 landscape page').toBe(1)

  // in-run cleanup (reverse order): trainers + schools; ledger rows are
  // out-of-band (ids logged, AP.C.3 idiom).
  await switchRole(page, 'adminCabang')
  csrf = await primeCsrf(page)
  for (const tid of [widiaId, asyifaId]) {
    console.log(`## EX.1 cleanup trainer -> ${(await page.request.post('/api/trainer.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: tid } })).status()}`)
  }
  await switchRole(page, 'superadmin')
  csrf = await primeCsrf(page)
  for (const sid of [schId, schLongId]) {
    console.log(`## EX.1 cleanup sekolah -> ${(await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: sid } })).status()}`)
  }
  console.log(`## EX.1 ledger orphans (out-of-band removal): ${JSON.stringify(rowIds)}`)

  expect(pageErrors).toHaveLength(0)
})
