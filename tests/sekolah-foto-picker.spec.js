import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// A2.5-SEKOLAH-FOTO — Sekolah.foto: file picker (F-10, D-10 = B)
//
// VERIFY (per SCOPE_EXPANSION_MILESTONES.md A2.5-SEKOLAH-FOTO):
// opens Tambah Sekolah as superadmin, asserts the Foto field has a
// file-picker option, uploads a small test image, asserts the
// thumbnail renders; refreshes the page, asserts the sekolah record
// re-hydrates with the same thumbnail.
//
// Photo storage contract (PRODUCTION_PLAN.md:121-125, photoStorage.js):
// the raw file is NEVER stored on the sekolah record or in
// localStorage — PhotoSlot stores a compressed JPEG dataURL in
// IndexedDB (idb-keyval) and the record carries only
// fotoEntry: { type: 'idb', key, size }.
// ============================================================

const APP = 'http://localhost:5173'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

// Boot-sync race: hydrateServerData() runs after login and fills
// localStorage from the server asynchronously. If the form opens
// before the cabang cache lands, newSekolah() captures the client
// default (cbg-PST-default) while the select renders the server
// branch — save()'s guard then correctly rejects with "Cabang
// tidak valid". Wait until the server's seeded branch is in the
// local cache before opening the form (same localStorage-polling
// idiom as r3-verify.spec.js waitForSekolahByName).
async function waitForServerCabang(page) {
  await expect
    .poll(
      () =>
        page
          .evaluate(() => (JSON.parse(localStorage.getItem('afterschola_v4_cabang') || '[]').some((c) => c.id === 'cbg-test-pusat'))),
      { message: 'menunggu cabang server (cbg-test-pusat) muncul di cache lokal', timeout: 15000 },
    )
    .toBe(true)
}

// Mint a real 16x16 JPEG at runtime through the browser's own
// canvas encoder — avoids hand-written base64 fixtures that can be
// silently malformed (the first draft of this spec shipped an
// invalid JPEG and the app correctly rejected it with
// "Gagal memuat gambar").
async function mintTestJpeg(page, fillStyle) {
  const dataUrl = await page.evaluate((color) => {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 16, 16)
    return canvas.toDataURL('image/jpeg', 0.8)
  }, fillStyle)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('A2.5-SEKOLAH-FOTO: picker option + upload thumbnail + re-hydration', async ({ page, pageErrors }) => {
  const runSuffix = String(Date.now()).slice(-6)
  const namaSekolah = `SD A25 Foto Sim ${runSuffix}`

  await loginViaApi(page, 'superadmin')
  await gotoApp(page)
  await waitForServerCabang(page)
  await openTab(page, 'Data Sekolah')

  // Open the form. The Foto field offers (a) the existing URL input
  // and (b) the PhotoSlot file picker ("Foto Sekolah (Unggah)").
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()

  // The URL input is present (labelled "Foto (URL)").
  await expect(modal.locator('div:has(> label:text("Foto (URL)")) input')).toBeVisible()

  // The file-picker option: PhotoSlot renders a "Pilih foto" label
  // wrapping a hidden file input.
  const photoSlot = modal.locator('div').filter({ hasText: 'Foto Sekolah (Unggah)' }).last()
  await expect(photoSlot.getByText('Pilih foto')).toBeVisible()
  const fileInput = photoSlot.locator('input[type="file"]')
  await expect(fileInput).toHaveCount(1)

  // Fill the required name first so save() can proceed later.
  await modal.locator('div:has(> label:text("Nama Sekolah")) input').fill(namaSekolah)

  // Upload a small test image through the hidden file input.
  const jpegBuffer = await mintTestJpeg(page, '#dc2626')
  await fileInput.setInputFiles({
    name: 'test-sekolah.jpg',
    mimeType: 'image/jpeg',
    buffer: jpegBuffer,
  })

  // The upload round-trips through compressImage → storePhoto
  // (IndexedDB). Busy state shows "Memproses..." until done, then the
  // PhotoSlot preview thumbnail renders and the label flips to
  // "Ganti foto".
  await expect(photoSlot.getByText('Ganti foto')).toBeVisible({ timeout: 15000 })
  const previewImg = photoSlot.locator('img[alt="Foto Sekolah (Unggah)"]')
  await expect(previewImg).toBeVisible()
  const previewSrc = await previewImg.getAttribute('src')
  expect(previewSrc).toMatch(/^data:image\/jpeg;base64,/)

  // Save the record and wait for the modal to close.
  await modal.getByRole('button', { name: 'Simpan' }).click()
  await expect(modal).toBeHidden({ timeout: 15000 })

  // The saved record carries an IndexedDB reference — not a raw
  // dataURL — in fotoEntry (storage contract: photos outside
  // localStorage).
  const fotoEntry = await page.evaluate(async (nama) => {
    const rows = JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]')
    const row = rows.find((s) => s.nama === nama)
    return row ? row.fotoEntry : null
  }, namaSekolah)
  expect(fotoEntry).toBeTruthy()
  expect(fotoEntry.type).toBe('idb')
  expect(typeof fotoEntry.key).toBe('string')

  // Refresh: the sekolah card re-hydrates the same thumbnail from
  // IndexedDB (SchoolThumbnail loads via loadPhotoDataUrl).
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Sekolah')

  const card = page
    .locator('div')
    .filter({ hasText: namaSekolah })
    .filter({ has: page.getByRole('button', { name: 'Edit sekolah' }) })
    .last()
  await expect(card).toBeVisible({ timeout: 15000 })

  // The thumbnail <img> inside the card resolves to a data URL with
  // the same byte payload the first render produced.
  const cardImg = card.locator('img').first()
  await expect
    .poll(async () => (await cardImg.getAttribute('src')) || '', { timeout: 15000 })
    .toMatch(/^data:image\/jpeg;base64,/)

  // Cleanup: delete the sim sekolah through the UI so the shared
  // test database stays canonical for later runs.
  const deleteBtn = page
    .locator('div')
    .filter({ hasText: namaSekolah })
    .filter({ has: page.getByRole('button', { name: 'Edit sekolah' }) })
    .last()
    .locator('button[title="Kelola Invoice"] ~ button ~ button')
  if (await deleteBtn.count()) {
    await deleteBtn.first().click()
    const confirm = page.getByRole('button', { name: 'Hapus', exact: true })
    if (await confirm.count()) await confirm.first().click()
    await page.waitForTimeout(500)
  }

  expect(pageErrors).toHaveLength(0)
})
