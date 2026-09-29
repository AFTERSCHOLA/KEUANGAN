import { test, expect, loginAndPrime, createSekolahSuperadmin } from './fixtures.js'

// T2.B.1 (F-T2-3; D-T2-3; R-T2-1, R-T2-2, R-T2-4, R-T2-5) — invoice rows
// list per-payment transactions.
//
// Current: Riwayat Invoice shows aggregate Dibayar/Sisa only
//   (InvoiceModal.jsx:379-382), so TEST 11 installments cannot be
//   manually verified.
// Expected: an invoice with two installments shows two listed
//   transactions (tanggal · nominal · metode · diterimaOleh · sumberDana)
//   under an expandable `Riwayat pembayaran (N)` toggle, plus a
//   `Total dibayar/Sisa` footer reusing the existing settlement.
// Rule: display-only; computeSppLunas/invoiceSettlement untouched;
//   mirror the PaymentTable.jsx:304-335 honor `Riwayat` idiom.
// Result: FAIL pre-fix (no `Riwayat pembayaran` toggle), green post-fix.
//
// Shape: 1 school (SPP 500rb) + 1 student + 1 September invoice, then 2
// partial payments (300rb + 200rb = aggregate 500rb) via the per-siswa
// modal. Reopen the invoice modal, expand the toggle, assert both rows
// render with distinct nominal/tanggal. Copy pinned by PLAN section 4.
//
// VERIFY: npx playwright test tests/invoice-payment-history.spec.js --workers=1

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

test('T2.B.1: invoice with two installments lists two payment rows summing to aggregate', async ({ page, pageErrors }) => {
  const csrf = await loginAndPrime(page, 'superadmin')
  const suffix = String(Date.now()).slice(-6)

  const { body: sekolah } = await createSekolahSuperadmin(
    page, csrf, `T2B1 Sekolah ${suffix}`, 500000, 'cbg-test-pusat', suffix
  )
  const namaSekolah = sekolah.nama || `T2B1 Sekolah ${suffix}`
  const namaSiswa = `T2B1 Siswa ${suffix}`

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await page.getByText('Data Siswa').click()
  await page.getByRole('button', { name: /tambah siswa/i }).click()
  await fillFieldByLabel(page, 'Nama Siswa', namaSiswa)
  await selectFieldByLabel(page, 'Sekolah', namaSekolah)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(page.getByText(namaSiswa)).toBeVisible()

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

  await page.keyboard.press('Escape')

  // Two installments with distinct nominal + distinct tanggalBayar so
  // each row is individually identifiable.
  await page.getByText('Data Siswa').click()
  const payments = [
    { nominal: '300000', tanggal: '2026-09-05' },
    { nominal: '200000', tanggal: '2026-09-12' },
  ]
  for (const { nominal, tanggal } of payments) {
    const studentRow = page.locator('tr', { hasText: namaSiswa })
    await studentRow.getByTitle('Catat pembayaran SPP').click()
    await selectFieldByLabel(page, 'Periode', 'September')
    await fillFieldByLabel(page, 'Nominal', nominal)
    await fillFieldByLabel(page, 'Tanggal Bayar', tanggal)
    await fillFieldByLabel(page, 'Diterima Oleh', 'E2E Tester')
    await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()
    await expect(page.getByText('Catat Pembayaran SPP')).not.toBeVisible()
  }

  await page.getByText('Data Sekolah').click()
  const reopenCard = page.locator('.grid > div', { hasText: namaSekolah }).first()
  await reopenCard.getByTitle('Kelola Invoice').click()
  const reopenedRow = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
  await expect(reopenedRow.getByText('Lunas', { exact: true })).toBeVisible({ timeout: 20000 })

  // The expandable history toggle (mirrors PaymentTable `Riwayat (N)`).
  const toggle = reopenedRow.getByRole('button', { name: /riwayat pembayaran \(2\)/i })
  await expect(toggle).toBeVisible()
  await toggle.click()

  // Both installment rows render with distinct nominal + tanggal.
  // (formatRupiah emits Rp + NBSP per Intl id-ID, so match with \s*.)
  await expect(reopenedRow.getByText(/Rp\s*300\.000/)).toBeVisible()
  await expect(reopenedRow.getByText(/Rp\s*200\.000/)).toBeVisible()
  await expect(reopenedRow.getByText(/5 Sep 2026/)).toBeVisible()
  await expect(reopenedRow.getByText(/12 Sep 2026/)).toBeVisible()
  // Pinned copy (PLAN section 4): diterima + sumber per row, footer totals.
  await expect(reopenedRow.getByText(/Diterima: E2E Tester/)).toHaveCount(2)
  await expect(reopenedRow.getByText(/Total dibayar Rp\s*500\.000 · Sisa Rp\s*0/)).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})
