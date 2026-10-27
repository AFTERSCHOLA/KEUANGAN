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

  // Print-break CSS pins (screen can't apply @media print; pin the source).
  const css = fs.readFileSync(path.resolve('src/print.css'), 'utf8')
  for (const pin of ['table-header-group', 'page-break-inside: avoid', '.avoid-break', ':not(.raport-sheet)', 'size: A4']) {
    expect(css).toContain(pin)
  }

  // Cleanup (best-effort).
  await page.request.post('/api/invoices.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: invoiceId } })
  await page.request.post('/api/siswa.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: `sis-pr-${suffix}` } })
  await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: sekolahId } })

  expect(pageErrors).toHaveLength(0)
})
