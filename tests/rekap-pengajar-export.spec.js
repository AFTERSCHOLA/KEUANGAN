// AP.C.3 VERIFY (persists per taste #16): Rekap export downloads
// full-detail actuals byte-equal to visible cells + print path fires.
// Run: npx playwright test tests/rekap-pengajar-export.spec.js --project=default --workers=1
import { test, expect, loginViaApi, primeCsrf, createSekolahSuperadmin, logout } from './fixtures.js'
import fs from 'node:fs'

const CABANG_A = 'cbg-test-pusat'

async function gotoApp(page) {
  await page.goto('http://localhost:5173')
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

test('AP.C.3 rekap export carries full details + print fires', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const today = new Date().toISOString().slice(0, 10)
  const widiaId = `trn-RPXW-${suffix}`
  const asyifaId = `trn-RPXA-${suffix}`
  const rowIds = []

  await loginViaApi(page, 'adminCabang')
  let csrf = await primeCsrf(page)
  for (const [id, nama, tipe] of [[widiaId, `Widia RPX ${suffix}`, 'instruktur'], [asyifaId, `Asyifa RPX ${suffix}`, 'asisten']]) {
    const res = await page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id, nama, honor: 50000, tipePengajar: tipe, sekolahIds: [], action: 'create' },
    })
    if (!res.ok()) throw new Error(`create trainer failed: ${res.status()} ${await res.text()}`)
    csrf = await primeCsrf(page)
  }

  await switchRole(page, 'superadmin')
  csrf = await primeCsrf(page)
  const { id: schId } = await createSekolahSuperadmin(page, csrf, `SD RPX ${suffix}`, 500000, CABANG_A, `RPX-${suffix}`)
  for (const [tid, status, ket] of [[widiaId, 'Hadir', null], [asyifaId, 'Hadir', 'EXPO'], [asyifaId, 'Izin', 'Pengganti']]) {
    const rid = `absp-RPX-${suffix}-${Math.random().toString(36).slice(2, 6)}`
    rowIds.push(rid)
    csrf = await primeCsrf(page)
    const res = await page.request.post('/api/sync.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: {
        entries: [{
          key: 'absensiPengajar', id: rid,
          record: { id: rid, trainerId: tid, sekolahId: schId, tanggal: today, periode: today.slice(0, 7), status, keterangan: ket, catatan: '', cabangId: CABANG_A },
        }],
      },
    })
    if (!res.ok()) throw new Error(`seed row failed: ${res.status()}`)
  }
  // NOTE: three rows same school+date: widia Hadir, asyifa Hadir+EXPO,
  // asyifa Izin+Pengganti — same trainer twice is fine for display math.

  await gotoApp(page)
  await openMatriks(page)
  const schRow = page.locator('tr', { hasText: `SD RPX ${suffix}` })
  await expect(schRow.getByRole('cell', { name: `Widia RPX ${suffix} (I)` })).toBeVisible()
  await expect(schRow.getByRole('cell', { name: `Asyifa RPX ${suffix} (A) — EXPO` })).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Unduh CSV', exact: true }).click(),
  ])
  console.log('## AP.C.3 download:', download.suggestedFilename())
  expect(download.suggestedFilename()).toContain('Rekap_Pengajar_')
  const content = fs.readFileSync(await download.path(), 'utf8')
  expect(content).toContain('Sekolah,Tanggal,Nama,Peran,Status,Keterangan,Teks')
  expect(content).toContain(`Asyifa RPX ${suffix}`)
  expect(content).toContain('— EXPO')
  expect(content).toContain('— Izin, Pengganti')
  console.log('## AP.C.3 csv full-detail OK')

  await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++ } })
  await page.getByRole('button', { name: 'Cetak Laporan', exact: true }).click()
  expect(await page.evaluate(() => window.__printCalls)).toBe(1)
  console.log('## AP.C.3 print intercepted OK')

  // in-run cleanup: trainers + school (ledger rows out-of-band, ids logged)
  await switchRole(page, 'adminCabang')
  csrf = await primeCsrf(page)
  for (const tid of [widiaId, asyifaId]) {
    console.log(`## AP.C.3 cleanup trainer -> ${(await page.request.post('/api/trainer.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: tid } })).status()}`)
  }
  await switchRole(page, 'superadmin')
  csrf = await primeCsrf(page)
  console.log(`## AP.C.3 cleanup sekolah -> ${(await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: schId } })).status()}`)
  console.log(`## AP.C.3 ledger orphans (out-of-band removal): ${JSON.stringify(rowIds)}`)

  expect(pageErrors).toHaveLength(0)
})
