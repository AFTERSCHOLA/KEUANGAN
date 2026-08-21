import { test, expect, loginAsAdmin } from './fixtures.js'

const APP = 'http://localhost:5173'
const SCH = 'SD Harapan Bangsa'
const TRAINER = 'Budi Santoso'
const SISWA = 'Andi Pratama'
const SPP = 100000

function thisMonthDate(day) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(day).padStart(2, '0')}`
}

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__e2e_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__e2e_reset_done', '1')
  })
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

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

async function getStoreJson(page, key) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(`afterschola_v4_${k}`) || '[]'), key)
}

async function seed(page) {
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH)
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.locator('label', { hasText: SCH }).first().getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
}

// R3.1 — siswa WA blur normalizes (0812 3456 7890 → 6281234567890)
test('R3.1: siswa WA normalizes to 62 format on blur', async ({ page }) => {
  await resetStorage(page)
  await gotoApp(page)
  await loginAsAdmin(page)
  await seed(page)

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SISWA)
  await field(page, 'WhatsApp').fill('0812 3456 7890')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // value in the form was normalized on blur, so the saved record is 62...
  const siswa = await getStoreJson(page, 'siswa')
  expect(siswa[0].wa).toBe('6281234567890')
})

// R3.2 — trainer WA blur normalizes (form shows 6281234567890)
test('R3.2: trainer WA normalizes to 62 format on blur', async ({ page }) => {
  await resetStorage(page)
  await gotoApp(page)
  await loginAsAdmin(page)
  await seed(page)

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER)
  const waInput = field(page, 'WhatsApp')
  await waInput.fill('0812 3456 7890')
  await waInput.blur()
  await expect(waInput).toHaveValue('6281234567890')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  const trainers = await getStoreJson(page, 'trainer')
  expect(trainers[1].wa).toBe('6281234567890')
})

// R3.3 — attendance columns show real counts (2 Hadir sessions this periode)
test('R3.3: Kehadiran column shows 2 Sesi after two Hadir sessions', async ({ page }) => {
  await resetStorage(page)
  await gotoApp(page)
  await loginAsAdmin(page)
  await seed(page)

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SISWA)
  await field(page, 'Sekolah').selectOption({ label: SCH })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  for (const day of [5, 9]) {
    await openTab(page, 'Data Absensi')
    await page.getByRole('button', { name: 'Input Absensi' }).click()
    await field(page, 'Tanggal Kelas').fill(thisMonthDate(day))
    await field(page, 'Sekolah').selectOption({ label: SCH })
    await field(page, 'Trainer').selectOption({ label: TRAINER })
    await page.getByText(SISWA, { exact: true }).click()
    await page.getByRole('button', { name: 'Simpan Absensi' }).click()
    await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()
  }

  await openTab(page, 'Data Siswa')
  const row = page.locator('tr', { hasText: SISWA }).first()
  await expect(row.locator('td').nth(3)).toHaveText('2 Sesi')
  await expect(row.locator('td').nth(4)).toHaveText('2 Sesi')
})

// R3.4 — SPP ledger payment bumps Pemasukan SPP by the recorded nominal
test('R3.4: SPP ledger payment → Pemasukan SPP increments by nominal', async ({ page }) => {
  await resetStorage(page)
  await gotoApp(page)
  await loginAsAdmin(page)
  await seed(page)

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SISWA)
  await field(page, 'Sekolah').selectOption({ label: SCH })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await page.locator('tr', { hasText: SISWA }).locator('button[title="Catat pembayaran SPP"]').click()
  await field(page, 'Nominal').fill('100000')
  await field(page, 'Diterima Oleh').fill('Admin')
  await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()

  await openTab(page, 'Data Keuangan')
  await expect(
    page.locator('div.space-y-1', { hasText: 'Pemasukan SPP' }).locator('h3')
  ).toHaveText('Rp 100.000')
})
