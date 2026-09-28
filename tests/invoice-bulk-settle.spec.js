import { test, expect, loginAndPrime, createSekolahSuperadmin, readEntity } from './fixtures.js'

// BR.2 (F-BR1; D-BR1) — bulk school settlement from the invoice Riwayat row.
// A dibayar ortu (500rb, lunas) -> B/C belum bayar -> bulk sekolah ->
// invoice Lunas, ledger A tetap ortu semua, B/C lewat baris sekolah
// ber-invoiceId, bulk kedua tidak menulis apa pun.
// Nama unik per run supaya tidak bentrok dengan sisa run gagal sebelumnya.

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

test('bulk pelunasan sekolah: A ortu tidak tertimpa, B/C lunas via bulk, run kedua 0 baris', async ({ page, pageErrors }) => {
  const csrf = await loginAndPrime(page, 'superadmin')
  const suffix = String(Date.now()).slice(-6)

  const { body: sekolah } = await createSekolahSuperadmin(
    page, csrf, `SIM-BLK Sekolah ${suffix}`, 500000, 'cbg-test-pusat', suffix,
  )
  const namaSekolah = sekolah.nama || `SIM-BLK Sekolah ${suffix}`
  const namaA = `SIM-BLK Siswa A ${suffix}`
  const namaB = `SIM-BLK Siswa B ${suffix}`
  const namaC = `SIM-BLK Siswa C ${suffix}`

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await page.getByText('Data Siswa').click()
  for (const nama of [namaA, namaB, namaC]) {
    await page.getByRole('button', { name: /tambah siswa/i }).click()
    await fillFieldByLabel(page, 'Nama Siswa', nama)
    await selectFieldByLabel(page, 'Sekolah', namaSekolah)
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText(nama)).toBeVisible()
  }

  // A dibayar orang tua langsung: 500rb = lunas, sumberDana ortu.
  const rowA = page.locator('tr', { hasText: namaA })
  await rowA.getByTitle('Catat pembayaran SPP').click()
  await selectFieldByLabel(page, 'Periode', 'September')
  await fillFieldByLabel(page, 'Nominal', '500000')
  await fillFieldByLabel(page, 'Tanggal Bayar', new Date().toISOString().slice(0, 10))
  await selectFieldByLabel(page, 'Sumber Dana', 'Ortu langsung')
  await fillFieldByLabel(page, 'Diterima Oleh', 'E2E Ortu')
  await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()
  await expect(page.getByText('Catat Pembayaran SPP')).not.toBeVisible()

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

  // Bulk: editor melewati A (sudah lunas), menulis B + C.
  await invoiceRow.getByRole('button', { name: 'Catat pelunasan sekolah' }).click()
  await expect(invoiceRow.getByText(/2 murid/)).toBeVisible()
  await fillFieldByLabel(page, 'Diterima Oleh', 'E2E Sekolah')
  await invoiceRow.getByRole('button', { name: 'Simpan Pelunasan' }).click()
  await page.getByRole('button', { name: 'Ya, Lanjutkan' }).click()
  await expect(invoiceRow.getByText('Lunas', { exact: true })).toBeVisible({ timeout: 20000 })

  // Ledger: A tetap ortu semua; B/C lewat baris sekolah ber-invoiceId.
  const siswa = await readEntity(page, 'siswa', csrf)
  const idOf = (nama) => siswa.find((s) => s.nama === nama)?.id
  const payments = await readEntity(page, 'sppPayments', csrf)
  const rowsA = payments.filter((p) => p.siswaId === idOf(namaA))
  expect(rowsA.length).toBeGreaterThan(0)
  expect(rowsA.every((p) => (p.sumberDana || 'sekolah') === 'ortu')).toBe(true)
  expect(rowsA.some((p) => (p.sumberDana || 'sekolah') === 'sekolah')).toBe(false)
  for (const nama of [namaB, namaC]) {
    const rows = payments.filter((p) => p.siswaId === idOf(nama))
    expect(rows.some((p) => p.sumberDana === 'sekolah' && !!p.invoiceId)).toBe(true)
  }

  // Run kedua: tidak ada lagi yang bisa di-mint.
  await page.keyboard.press('Escape')
  await page.getByText('Data Sekolah').click()
  const reopenCard = page.locator('.grid > div', { hasText: namaSekolah }).first()
  await reopenCard.getByTitle('Kelola Invoice').click()
  const reopenedRow = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
  await expect(reopenedRow.getByText('Lunas', { exact: true })).toBeVisible({ timeout: 20000 })
  await expect(reopenedRow.getByText('Semua murid sudah lunas untuk invoice ini.')).toBeVisible()
  await expect(reopenedRow.getByRole('button', { name: 'Catat pelunasan sekolah' })).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})
