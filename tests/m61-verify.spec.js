import { test, expect, loginAsAdmin } from './fixtures.js'

const SCHOOL = 'SD M6.1'
const STUDENT = 'Siswa M6.1'
const PERIOD = '2026-08'
const SPP = 100000

function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
      `div:has(> label:text("${labelText}")) textarea, ` +
      `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__m61_reset_done')) return
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    sessionStorage.setItem('__m61_reset_done', '1')
  })
}

async function seedStudent(page) {
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCHOOL)
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(STUDENT)
  await field(page, 'Kelas').fill('5A')
  await field(page, 'Sekolah').selectOption({ label: SCHOOL })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
}

async function storeJson(page, key) {
  return page.evaluate(k => JSON.parse(localStorage.getItem(`afterschola_v4_${k}`) || '[]'), key)
}

test('M6.1 SPP ledger: collect, derive, finance, correct, persist', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await page.goto('http://localhost:5173')
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)
  await seedStudent(page)

  await openTab(page, 'Data Siswa')
  const row = page.locator('tr', { hasText: STUDENT }).first()
  await row.locator('button[title="Catat pembayaran SPP"]').click()
  await expect(page.getByText(`Catat Pembayaran SPP — ${STUDENT}`)).toBeVisible()
  await field(page, 'Periode').selectOption(PERIOD)
  await field(page, 'Nominal').fill(String(SPP))
  await field(page, 'Metode').selectOption({ label: 'Transfer' })
  await field(page, 'Diterima Oleh').fill('Admin M6.1')
  await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()

  let payments = await storeJson(page, 'sppPayments')
  expect(payments).toHaveLength(1)
  expect(payments[0]).toMatchObject({
    siswaId: (await storeJson(page, 'siswa'))[0].id,
    periode: PERIOD,
    nominal: SPP,
    metode: 'Transfer',
    diterimaOleh: 'Admin M6.1',
    bukti: null,
    sudahDisetor: false,
  })

  let siswa = await storeJson(page, 'siswa')
  expect(siswa[0].sppLunas[PERIOD]).toBe(true)

  await openTab(page, 'Data Keuangan')
  await expect(page.locator('div.space-y-1', { hasText: 'Pemasukan SPP' }).locator('h3')).toHaveText('Rp 100.000')

  const originalPaymentId = payments[0].id
  const partial = await page.evaluate(async ({ period, siswaId }) => {
    const mod = await import('/src/lib/sppPayments.js')
    const payment = mod.newSppPayment({
      siswaId,
      periode: period,
      nominal: 50000,
      tanggalBayar: '2026-08-20',
      metode: 'Tunai-Admin',
      diterimaOleh: 'Admin M6.1',
    })
    mod.addSppPayment(payment)
    return payment
  }, { period: PERIOD, siswaId: siswa[0].id })

  payments = await storeJson(page, 'sppPayments')
  expect(payments).toHaveLength(2)
  const remaining = await page.evaluate(async ({ paymentId, siswaId }) => {
    const mod = await import('/src/lib/sppPayments.js')
    mod.deleteSppPayment(paymentId)
    return {
      payments: mod.listSppPayments(),
      siswa: mod.recomputeSppLunasForSiswa(siswaId),
    }
  }, { paymentId: originalPaymentId, siswaId: siswa[0].id })
  expect(remaining.payments).toHaveLength(1)
  expect(remaining.payments[0].id).toBe(partial.id)
  expect(remaining.siswa.sppLunas[PERIOD]).toBeUndefined()

  await page.reload()
  await loginAsAdmin(page)
  await openTab(page, 'Data Keuangan')
  await expect(page.locator('div.space-y-1', { hasText: 'Pemasukan SPP' }).locator('h3')).toHaveText('Rp 50.000')

  const warning = await page.evaluate(async () => {
    const mod = await import('/src/lib/constants.js')
    const messages = []
    const originalWarn = console.warn
    console.warn = message => messages.push(message)
    const siswa = mod.newSiswa('school-m61', 'SD M6.1')
    siswa.sppLunas = { '2026-08': true }
    console.warn = originalWarn
    return messages
  })
  expect(warning[0]).toContain('derived dari sppPayments ledger')

  await page.reload()
  await loginAsAdmin(page)
  await openTab(page, 'Data Siswa')
  await expect(page.locator('tr', { hasText: STUDENT }).first()).toContainText('Sebagian Bayar')
  expect(await storeJson(page, 'sppPayments')).toHaveLength(1)
  expect((await storeJson(page, 'siswa'))[0].sppLunas[PERIOD]).toBeUndefined()
  expect(pageErrors).toHaveLength(0)
})
