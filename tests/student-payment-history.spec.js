import { test, expect, loginAndPrime, createSekolahSuperadmin } from './fixtures.js'

// T2.B.2 (F-T2-4; D-T2-3; R-T2-1, R-T2-2, R-T2-4, R-T2-5) — student rows
// list per-payment source rows.
//
// Current: pill `Lunas/Sebagian/Belum` only (StudentList.jsx:334-351),
//   so TEST 12 "paid by Parent" cannot be proven from the UI.
// Expected: a parent-paid student shows its `Ortu langsung` source row
//   under an expandable `Riwayat (N)` toggle (periode · nominal ·
//   sumberDana · metode — copy pinned by PLAN section 4), while the
//   school invoice stays outstanding (only half of its total collected).
// Rule: display-only; tunggakan pill math untouched; mirror the
//   PaymentTable.jsx:304-335 honor `Riwayat` idiom (T2.B.1 pattern).
// Result: FAIL pre-fix (no `Riwayat` toggle), green post-fix.
//
// Shape: 1 school (SPP 500rb) + 2 students + 1 September invoice
// (total 1jt), then 1 parent payment (500rb, sumberDana ortu) via the
// per-siswa modal for student A only. Student A row asserts Lunas pill
// + expanded source row with ALL four fields; student B row asserts no
// toggle; reopened invoice asserts Belum Lunas.
//
// VERIFY: npx playwright test tests/student-payment-history.spec.js --workers=1

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

test('T2.B.2: parent-paid student lists its Ortu source row while school invoice stays outstanding', async ({ page, pageErrors }) => {
  const csrf = await loginAndPrime(page, 'superadmin')
  const suffix = String(Date.now()).slice(-6)

  const { body: sekolah } = await createSekolahSuperadmin(
    page, csrf, `T2B2 Sekolah ${suffix}`, 500000, 'cbg-test-pusat', suffix
  )
  const namaSekolah = sekolah.nama || `T2B2 Sekolah ${suffix}`
  const namaA = `T2B2 SiswaA ${suffix}`
  const namaB = `T2B2 SiswaB ${suffix}`

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  // Pin the viewed periode to September (academic year default 2026/2027).
  await page.getByLabel('Bulan').selectOption({ label: 'September' })

  // Two students on the same school.
  await page.getByText('Data Siswa').click()
  for (const nama of [namaA, namaB]) {
    await page.getByRole('button', { name: /tambah siswa/i }).click()
    await fillFieldByLabel(page, 'Nama Siswa', nama)
    await selectFieldByLabel(page, 'Sekolah', namaSekolah)
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText(nama)).toBeVisible()
  }

  // September invoice over both students: total Rp1.000.000.
  await page.getByText('Data Sekolah').click()
  const schoolCard = page.locator('.grid > div', { hasText: namaSekolah }).first()
  await schoolCard.getByTitle('Kelola Invoice').click()
  await expect(page.getByText(`Invoice — ${namaSekolah}`)).toBeVisible()
  const bulanLabel = page.locator('label', { hasText: 'Bulan' }).first()
  await bulanLabel.locator('xpath=following-sibling::select[1]').selectOption({ label: 'September' })
  await page.getByRole('button', { name: 'Buat & Terbitkan Invoice' }).click()
  await page.getByRole('button', { name: 'Ya, Lanjutkan' }).click()
  const invoiceRow = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
  await expect(invoiceRow.getByText('Belum Lunas')).toBeVisible({ timeout: 20000 })
  await page.keyboard.press('Escape')

  // Parent pays student A directly: full tarif, sumberDana Ortu langsung.
  await page.getByText('Data Siswa').click()
  const rowA = page.locator('tr', { hasText: namaA })
  await rowA.getByTitle('Catat pembayaran SPP').click()
  await selectFieldByLabel(page, 'Periode', 'September')
  await fillFieldByLabel(page, 'Nominal', '500000')
  await fillFieldByLabel(page, 'Tanggal Bayar', '2026-09-05')
  await selectFieldByLabel(page, 'Metode', 'Transfer')
  await selectFieldByLabel(page, 'Sumber Dana', 'Ortu langsung')
  await fillFieldByLabel(page, 'Diterima Oleh', 'E2E Tester')
  await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()
  await expect(page.getByText('Catat Pembayaran SPP')).not.toBeVisible()

  // Student A: Lunas pill + expandable Riwayat (1) with ALL four fields
  // (periode · nominal · sumberDana · metode — T2.B.1 review minor).
  const paidRow = page.locator('tr', { hasText: namaA })
  await expect(paidRow.getByText('Lunas', { exact: true })).toBeVisible()
  const toggle = paidRow.getByRole('button', { name: /riwayat \(1\)/i })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(paidRow.getByText(/September 2026/)).toBeVisible()
  await expect(paidRow.getByText(/Rp\s*500\.000/)).toBeVisible()
  await expect(paidRow.getByText(/Sumber: Ortu langsung/)).toBeVisible()
  await expect(paidRow.getByText(/Metode: Transfer/)).toBeVisible()

  // Student B (unpaid): no history toggle — history is per-student.
  const unpaidRow = page.locator('tr', { hasText: namaB })
  await expect(unpaidRow.getByRole('button', { name: /riwayat/i })).toHaveCount(0)

  // School invoice stays outstanding: only half of Rp1.000.000 collected.
  await page.getByText('Data Sekolah').click()
  const reopenCard = page.locator('.grid > div', { hasText: namaSekolah }).first()
  await reopenCard.getByTitle('Kelola Invoice').click()
  const reopenedRow = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
  await expect(reopenedRow.getByText('Belum Lunas')).toBeVisible({ timeout: 20000 })

  expect(pageErrors).toHaveLength(0)
})
