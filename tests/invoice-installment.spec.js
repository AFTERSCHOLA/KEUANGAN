import { test, expect, loginAndPrime, createSekolahSuperadmin } from './fixtures.js'

// SB.B.3 / SBF.3 — invoice installment + auto Lunas/Belum Lunas badge,
// updated to the SB.C.2 canonical flow (D-SBF3): creation is
// "Buat & Terbitkan Invoice" straight to Terbit via
// /api/invoices-generate.php — no Draft stage, no per-row Terbitkan.
// Nama siswa diberi suffix unik per run supaya tidak bentrok dengan sisa
// data dari run gagal sebelumnya (DB test tidak direset otomatis antar run).

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

test('cicilan invoice: 2 pembayaran parsial -> badge otomatis Lunas, tombol Tandai Lunas tidak ada', async ({ page, pageErrors }) => {
  const csrf = await loginAndPrime(page, 'superadmin')
  const suffix = String(Date.now()).slice(-6)

  const { body: sekolah } = await createSekolahSuperadmin(
    page, csrf, `SIM-E2E Sekolah ${suffix}`, 500000, 'cbg-test-pusat', suffix
  )
  const namaSekolah = sekolah.nama || `SIM-E2E Sekolah ${suffix}`
  const namaA = `SIM-E2E Siswa A ${suffix}`
  const namaB = `SIM-E2E Siswa B ${suffix}`

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

  // SBF.3: canonical creation — direct to Terbit, no Draft stage.
  await page.getByRole('button', { name: 'Buat & Terbitkan Invoice' }).click()
  await page.getByRole('button', { name: 'Ya, Lanjutkan' }).click()
  const invoiceRow = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
  await expect(invoiceRow.getByText('Belum Lunas')).toBeVisible({ timeout: 20000 })

  await expect(page.getByRole('button', { name: /tandai lunas/i })).toHaveCount(0)

  await page.keyboard.press('Escape')

  await page.getByText('Data Siswa').click()
  const payments = [
    { nama: namaA, nominal: '300000' },
    { nama: namaA, nominal: '200000' },
    { nama: namaB, nominal: '500000' },
  ]
  for (const { nama, nominal } of payments) {
    const studentRow = page.locator('tr', { hasText: nama })
    await studentRow.getByTitle('Catat pembayaran SPP').click()
    // Pin the payment periode to the invoiced month so the ledger match
    // (sekolahId + periode) holds whatever the current month is.
    await selectFieldByLabel(page, 'Periode', 'September')
    await fillFieldByLabel(page, 'Nominal', nominal)
    await fillFieldByLabel(page, 'Tanggal Bayar', new Date().toISOString().slice(0, 10))
    await fillFieldByLabel(page, 'Diterima Oleh', 'E2E Tester')
    await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()
    await expect(page.getByText('Catat Pembayaran SPP')).not.toBeVisible()
  }

  await page.getByText('Data Sekolah').click()
  const reopenCard = page.locator('.grid > div', { hasText: namaSekolah }).first()
  await reopenCard.getByTitle('Kelola Invoice').click()
  const reopenedRow = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
  await expect(reopenedRow.getByText('Lunas', { exact: true })).toBeVisible({ timeout: 20000 })

  expect(pageErrors).toHaveLength(0)
})
