import { test, expect, loginAndPrime, createSekolahSuperadmin } from './fixtures.js'

// IP.3 — Dokumen Resmi: the server-rendered invoice document
// (POST /api/invoices-doc.php) opens from InvoiceTemplate with the same
// nomor + grand total as the app row. Requires PHP :8000 + test DB live
// (same prerequisite as invoice-installment.spec.js).

async function fillFieldByLabel(page, labelText, value) {
  const label = page.locator('label', { hasText: labelText }).first()
  const input = label.locator('xpath=following-sibling::input[1]')
  await input.fill('')
  await input.fill(value)
}

async function selectFieldByLabel(page, labelText, optionLabel) {
  const label = page.locator('label', { hasText: labelText }).first()
  await label.locator('xpath=following-sibling::select[1]').selectOption({ label: optionLabel })
}

test('dokumen resmi: server invoice doc opens with nomor + grand total', async ({ page, pageErrors }) => {
  const csrf = await loginAndPrime(page, 'superadmin')
  const suffix = String(Date.now()).slice(-6)

  const { body: sekolah } = await createSekolahSuperadmin(
    page, csrf, `SIM-DOC Sekolah ${suffix}`, 500000, 'cbg-test-pusat', suffix
  )
  const namaSekolah = sekolah.nama || `SIM-DOC Sekolah ${suffix}`
  const namaA = `SIM-DOC Siswa A ${suffix}`
  const namaB = `SIM-DOC Siswa B ${suffix}`

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await page.getByText('Data Siswa').click()
  for (const nama of [namaA, namaB]) {
    await page.getByRole('button', { name: /tambah siswa/i }).click()
    await fillFieldByLabel(page, 'Nama Siswa', nama)
    await selectFieldByLabel(page, 'Sekolah', namaSekolah)
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText(nama)).toBeVisible()
  }

  await page.getByText('Data Sekolah').click()
  const firstSchoolCard = page.locator('.grid > div', { hasText: namaSekolah }).first()
  await firstSchoolCard.getByTitle('Kelola Invoice').click()
  await expect(page.getByText(`Invoice — ${namaSekolah}`)).toBeVisible()

  const bulanLabel = page.locator('label', { hasText: 'Bulan' }).first()
  await bulanLabel.locator('xpath=following-sibling::select[1]').selectOption({ label: 'September' })

  await page.getByRole('button', { name: 'Buat & Terbitkan Invoice' }).click()
  await page.getByRole('button', { name: 'Ya, Lanjutkan' }).click()
  const invoiceRow = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
  await expect(invoiceRow.getByText('Belum Lunas')).toBeVisible({ timeout: 20000 })

  const rowText = await invoiceRow.innerText()
  const nomor = (rowText.match(/AFS-\d{6}-\d{4}/) || [])[0]
  expect(nomor, 'riwayat row shows an AFS nomor').toBeTruthy()

  // Open the printable preview, then the server document.
  await invoiceRow.getByRole('button', { name: 'Cetak' }).click()
  await expect(page.getByRole('button', { name: 'Dokumen Resmi' })).toBeVisible()

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Dokumen Resmi' }).click(),
  ])
  await popup.waitForLoadState('domcontentloaded')
  await expect(popup.getByText(nomor)).toBeVisible({ timeout: 15000 })
  await expect(popup.getByText('GRAND TOTAL')).toBeVisible()
  await expect(popup.getByText('Terbilang')).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})
