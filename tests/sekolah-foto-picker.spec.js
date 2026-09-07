import { test, expect, loginViaApi } from './fixtures.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP = 'http://localhost:5173'
const SUFFIX = String(Date.now()).slice(-6)
const SCH_NAME = `SD Foto Sim ${SUFFIX}`

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

// A2.5-SEKOLAH-FOTO — Sekolah.foto: file picker (F-10)
test('A2.5: Sekolah Foto — upload gambar via file picker, thumbnail persists after refresh', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()

  // Tunggu modal (createPortal ke document.body) beneran ter-render dulu.
  await expect(page.getByRole('dialog')).toBeVisible()

  await field(page, 'Nama Sekolah').fill(SCH_NAME)

  // Assert the file-picker option exists alongside the URL input.
  await expect(page.getByText('Foto Sekolah (Unggah)')).toBeVisible()
  const fileInput = page.locator('input[type="file"]').first()
  await expect(fileInput).toBeAttached()

  // Upload a small test image (1x1 px PNG fixture).
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'test-image.png'))

  // PhotoSlot shows a thumbnail once compressImage()/storePhoto() resolve.
  await expect(page.locator('img[alt="Foto Sekolah (Unggah)"]')).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Card grid should render the uploaded thumbnail for this school.
  const card = page.getByRole('img', { name: SCH_NAME })
  await expect(card).toBeVisible({ timeout: 10000 })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Thumbnail survives a full reload — proves the fotoEntry (IndexedDB
  // reference) round-tripped through writeRemote() and re-resolved.
  const cardAfterReload = page.getByRole('img', { name: SCH_NAME })
  await expect(cardAfterReload).toBeVisible({ timeout: 10000 })

  expect(pageErrors).toHaveLength(0)
})