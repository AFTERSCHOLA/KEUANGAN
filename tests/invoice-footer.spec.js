import { test, expect, loginAndPrime, createSekolahSuperadmin } from './fixtures.js'

// ============================================================
// Invoice brand top-left — client preview + server Dokumen Resmi
// parity: top block = logo + `AfterSchola` text + alamat; bottom
// block = bank note + signature only (no logo/brand).
// ============================================================

const APP = 'http://localhost:5173'

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('invoice brand AfterSchola renders top-left, not in footer', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const namaSekolah = `Sim Sekolah Footer ${suffix}`
  const now = new Date()
  const periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const csrf = await loginAndPrime(page, 'superadmin')
  const { id: sekolahId } = await createSekolahSuperadmin(page, csrf, namaSekolah, 100000, 'cbg-test-pusat', suffix)

  const siswaRes = await page.request.post('/api/siswa.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'create',
      id: `sis-foot-${suffix}`,
      nama: `Sim Siswa Footer ${suffix}`,
      kelas: 'X-1',
      wa: '08123456789',
      sekolahId,
      status: 'Aktif',
    },
  })
  expect(siswaRes.ok()).toBeTruthy()

  const genRes = await page.request.post('/api/invoices-generate.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { periode, uraian: `SPP Sim ${suffix}`, sekolahId },
  })
  expect(genRes.ok()).toBeTruthy()
  const genBody = await genRes.json()
  expect(genBody.generatedCount).toBe(1)
  const invoiceId = genBody.generated[0].id
  expect(invoiceId).toBeTruthy()

  // Client print template via Data Sekolah -> Kelola Invoice -> Cetak.
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  // window.print interception: stub before any print call.
  await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true } })
  await openTab(page, 'Data Sekolah')
  const card = page.locator('div.bg-white', { has: page.getByText(namaSekolah) }).first()
  await card.getByTitle('Kelola Invoice').click()
  await page.getByRole('button', { name: 'Cetak' }).first().click()
  const report = page.locator('.printable-report')
  await expect(report).toBeVisible()

  // Top brand, no bottom brand (client preview).
  await expect(report.getByText('AfterSchola')).toBeVisible()
  await expect(report.getByText('AfterSchola')).toHaveCount(1)
  const topLogo = report.locator('img[alt="Logo"]')
  await expect(topLogo).toBeVisible()
  // footer must not carry a second logo/brand
  await expect(report.getByAltText('Logo Afterschola')).toHaveCount(0)

  // Offline tolerance: hide logo via onError still leaves AfterSchola text visible.
  await topLogo.evaluateAll((els) => els.forEach((e) => { e.style.display = 'none' }))
  await expect(report.getByText('AfterSchola')).toBeVisible()

  // Server parity: same invoice id renders top brand once, no footer brand.
  const docRes = await page.request.post('/api/invoices-doc.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: invoiceId },
  })
  expect(docRes.ok()).toBeTruthy()
  const docHtml = await docRes.text()
  expect(docHtml.match(/AfterSchola/g) || []).toHaveLength(1)
  expect(docHtml).not.toContain('Logo Afterschola')

  // Cleanup (best-effort, reverse dependency order).
  const csrf2 = csrf
  await page.request.post('/api/invoices.php', { headers: { 'X-CSRF-Token': csrf2 }, data: { action: 'delete', id: invoiceId } })
  await page.request.post('/api/siswa.php', { headers: { 'X-CSRF-Token': csrf2 }, data: { action: 'delete', id: `sis-foot-${suffix}` } })
  await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf2 }, data: { action: 'delete', id: sekolahId } })

  expect(pageErrors).toHaveLength(0)
})
