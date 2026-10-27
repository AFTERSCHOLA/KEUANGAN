import { test, expect, loginAndPrime, createSekolahSuperadmin } from './fixtures.js'

// ============================================================
// M-F3 — Invoice footer carries the Official Logo + "Afterschola".
// Seeds a real invoice (sekolah + 1 Aktif siswa + generate), opens the
// print view from Data Sekolah, and asserts the footer brand in both
// the client print template and the server Dokumen Resmi HTML.
// ============================================================

const APP = 'http://localhost:5173'

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('M-F3: invoice footer shows Official Logo and Afterschola', async ({ page, pageErrors }) => {
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
  await openTab(page, 'Data Sekolah')
  const card = page.locator('div.bg-white', { has: page.getByText(namaSekolah) }).first()
  await card.getByTitle('Kelola Invoice').click()
  await page.getByRole('button', { name: 'Cetak' }).first().click()
  const report = page.locator('.printable-report')
  await expect(report).toBeVisible()
  // RED before fix: no footer brand exists in the print template.
  await expect(report.getByText('Afterschola')).toBeVisible()
  await expect(report.getByAltText('Logo Afterschola')).toBeVisible()

  // Server Dokumen Resmi carries the same footer brand.
  const docRes = await page.request.post('/api/invoices-doc.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: invoiceId },
  })
  expect(docRes.ok()).toBeTruthy()
  const docHtml = await docRes.text()
  expect(docHtml).toContain('Afterschola')

  // Cleanup (best-effort, reverse dependency order).
  const csrf2 = csrf
  await page.request.post('/api/invoices.php', { headers: { 'X-CSRF-Token': csrf2 }, data: { action: 'delete', id: invoiceId } })
  await page.request.post('/api/siswa.php', { headers: { 'X-CSRF-Token': csrf2 }, data: { action: 'delete', id: `sis-foot-${suffix}` } })
  await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf2 }, data: { action: 'delete', id: sekolahId } })

  expect(pageErrors).toHaveLength(0)
})
