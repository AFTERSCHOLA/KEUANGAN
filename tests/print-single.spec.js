import { test, expect, loginAndPrime, createSekolahSuperadmin } from './fixtures.js'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================
// M-F6 — long invoices print without orphan mid-row breaks.
// Seeds an invoice with a 40-line uraian, opens the print view,
// asserts every line renders, stubs window.print and asserts the
// Cetak Invoice call, and pins the print-break CSS rules.
// ============================================================

const APP = 'http://localhost:5173'

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M-F6: long invoice print view calls print with unbroken rows', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const namaSekolah = `Sim Sekolah Print ${suffix}`
  const now = new Date()
  const periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lines = Array.from({ length: 40 }, (_, i) => `Item baris ${i + 1} Sim ${suffix}`)
  const uraian = lines.join('\n')

  const csrf = await loginAndPrime(page, 'superadmin')
  const { id: sekolahId } = await createSekolahSuperadmin(page, csrf, namaSekolah, 100000, 'cbg-test-pusat', suffix)

  const siswaRes = await page.request.post('/api/siswa.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'create', id: `sis-pr-${suffix}`, nama: `Sim Siswa Print ${suffix}`, kelas: 'X-1', wa: '08123456789', sekolahId, sekolahNama: namaSekolah, status: 'Aktif' },
  })
  expect(siswaRes.ok()).toBeTruthy()

  const genRes = await page.request.post('/api/invoices-generate.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { periode, uraian, sekolahId },
  })
  expect(genRes.ok()).toBeTruthy()
  const invoiceId = genRes.json ? (await genRes.json()).generated[0].id : null
  expect(invoiceId).toBeTruthy()

  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Sekolah')
  const card = page.locator('div.bg-white', { has: page.getByText(namaSekolah) }).first()
  await card.getByTitle('Kelola Invoice').click()
  await page.getByRole('button', { name: 'Cetak' }).first().click()
  const report = page.locator('.printable-report')
  await expect(report).toBeVisible()
  // One text block (whitespace-pre-line): assert per-line via content.
  const bodyText = await report.textContent()
  for (const line of lines) {
    expect(bodyText).toContain(line)
  }
  // Parity pin: multi-line uraian keeps its line breaks like the server
  // Dokumen Resmi (nl2br) instead of collapsing to one visual line.
  await expect(report.locator('td.whitespace-pre-line')).toBeVisible()

  // window.print interception (taste testing #29).
  await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true } })
  await page.getByRole('button', { name: 'Cetak Invoice' }).click()
  expect(await page.evaluate(() => window.__printed)).toBe(true)

  // Task 3 — force single-page scale: 40-line invoice must shrink to fit.
  const zoom = await page.evaluate(() => window.__lastPrintZoom)
  expect(zoom).toBeLessThan(1)
  expect(zoom).toBeGreaterThanOrEqual(0.55)

  // Single-page height assert: hub math min(1, min((1010-110)/scrollHeight,
  // 680/scrollWidth)) (A4 printable 267mm ≈ 1010px at 96dpi minus 110px
  // measured print-origin allowance for in-flow hidden app chrome; width
  // budget 180mm ≈ 680px), floor 0.55, applied inline.
  const probe = await page.evaluate(() => {
    const el = document.querySelector('.printable-report')
    return { scrollWidth: el ? el.scrollWidth : 0, scrollHeight: el ? el.scrollHeight : 0, inlineZoom: el ? el.style.zoom : '' }
  })
  expect(parseFloat(probe.inlineZoom)).toBeCloseTo(zoom, 5)
  expect(zoom).toBeCloseTo(Math.max(0.55, Math.min(1, Math.min((1010 - 110) / probe.scrollHeight, 680 / probe.scrollWidth))), 2)

  // Print-break CSS pins (screen can't apply @media print; pin the source).
  const css = fs.readFileSync(path.resolve('src/print.css'), 'utf8')
  for (const pin of ['table-header-group', 'page-break-inside: avoid', '.avoid-break', ':not(.raport-sheet)', 'size: A4', 'print-fit-scale']) {
    expect(css).toContain(pin)
  }

  // Cleanup (best-effort).
  await page.request.post('/api/invoices.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: invoiceId } })
  await page.request.post('/api/siswa.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: `sis-pr-${suffix}` } })
  await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: sekolahId } })

  expect(pageErrors).toHaveLength(0)
})

// ============================================================
// R2.2 — standard raport print view applies the two-axis fit.
// Persisted pin (no PDF emission — fast): open the raport print view,
// click the app's own Cetak Raport button (fit-first wiring), assert
// __lastPrintZoom lands in (0.55, 1] and matches
// min((1010-110)/scrollHeight, 680/scrollWidth) via evaluate.
// ============================================================
test('R2.2: standard raport print view applies two-axis fit zoom', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const namaSekolah = `Sim Sekolah R22 Pin ${suffix}`
  const namaSiswa = `Sim Siswa R22 Pin ${suffix}`
  const now = new Date()
  const tahunAjaran = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1

  const csrf = await loginAndPrime(page, 'superadmin')
  const { id: sekolahId } = await createSekolahSuperadmin(page, csrf, namaSekolah, 100000, 'cbg-test-pusat', suffix)
  const siswaId = `sis-r22-pin-${suffix}`
  const sswRes = await page.request.post('/api/siswa.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'create', id: siswaId, nama: namaSiswa, kelas: '3A', wa: '08123456789', sekolahId, sekolahNama: namaSekolah, status: 'Aktif' },
  })
  expect(sswRes.ok()).toBeTruthy()
  const raportId = `rpt-r22-pin-${suffix}`
  const rptRes = await page.request.post('/api/raport.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'create', id: raportId, siswaId, cabangId: 'cbg-test-pusat',
      semester: 'Ganjil', tahunAjaran,
      nilai: { helpingTeam: 100, computationalThinking: 100, problemSolving: 100, creativity: 100 },
      total: 400, rataRata: 100, grade: 'A', catatan: 'bagus', status: 'Terverifikasi',
    },
  })
  expect(rptRes.ok()).toBeTruthy()

  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Raport')
  const row = page.locator('tr', { has: page.getByText(namaSiswa) }).first()
  await expect(row).toBeVisible({ timeout: 15000 })
  await row.getByRole('button', { name: 'Cetak', exact: true }).click()
  const printable = page.locator('.printable-report')
  await expect(printable).toBeVisible({ timeout: 10000 })

  await page.evaluate(() => { window.print = () => { window.__printed = true } })
  await page.getByRole('button', { name: 'Cetak Raport', exact: true }).click()
  expect(await page.evaluate(() => window.__printed)).toBe(true)

  const zoom = await page.evaluate(() => window.__lastPrintZoom)
  expect(zoom).toBeLessThanOrEqual(1)
  expect(zoom).toBeGreaterThanOrEqual(0.55)
  const probe = await page.evaluate(() => {
    const el = document.querySelector('.printable-report.raport-sheet .raport-page')
      || document.querySelector('.printable-report')
    return { scrollWidth: el ? el.scrollWidth : 0, scrollHeight: el ? el.scrollHeight : 0, inlineZoom: el ? el.style.zoom : '' }
  })
  expect(parseFloat(probe.inlineZoom)).toBeCloseTo(zoom, 5)
  expect(zoom).toBeCloseTo(Math.max(0.55, Math.min(1, Math.min((1010 - 110) / probe.scrollHeight, 680 / probe.scrollWidth))), 2)

  // Cleanup in reverse order of creation (E2E hygiene).
  await page.request.post('/api/raport.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: raportId } })
  await page.request.post('/api/siswa.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: siswaId } })
  await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: sekolahId } })

  expect(pageErrors).toHaveLength(0)
})
