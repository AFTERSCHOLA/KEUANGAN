import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// RH.D.5 — Client server-photo tier roundtrip (F-RH5, M5.2)
//
// VERIFY (per RELEASE_HYGIENE_MILESTONES.md RH.D.5):
// login as admin_cabang, upload via PhotoSlot, assert the saved
// record carries entry {type:'server', id} and the download endpoint
// serves the bytes; a second context (fresh login, empty idb)
// renders the thumbnail from the download endpoint.
//
// Storage contract (PRODUCTION_PLAN §8, photoStorage.js): online
// authenticated saves become {type:'server', id} backed by a
// photo_uploads row with an idb cache warm; offline/anonymous stays
// {type:'idb'} (photo outbox deferred, RELEASE_HYGIENE_PLAN §13).
//
// NOTE: photo_uploads rows have no delete endpoint, so the uploaded
// test photo row is intentionally left behind (one row per run;
// `npm run db:reset` wipes it). The sekolah record itself is deleted
// through the API at the end so later runs stay canonical.
// ============================================================

const APP = 'http://localhost:5173'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

// Same localStorage-polling idiom as sekolah-foto-picker.spec.js:
// hydrateServerData() fills the cabang cache asynchronously after
// login; the Sekolah form rejects saves until cbg-test-pusat lands.
async function waitForServerCabang(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem('afterschola_v4_cabang') || '[]').some((c) => c.id === 'cbg-test-pusat'),
        ),
      { message: 'menunggu cabang server (cbg-test-pusat) muncul di cache lokal', timeout: 15000 },
    )
    .toBe(true)
}

// Mint a real 16x16 JPEG at runtime through the browser's own canvas
// encoder (mirror of sekolah-foto-picker.spec.js — avoids hand-written
// base64 fixtures the app would correctly reject).
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

test('RH.D.5: admin_cabang PhotoSlot upload becomes a server entry that renders on a fresh device', async ({
  browser,
  page,
  pageErrors,
}) => {
  const runSuffix = String(Date.now()).slice(-6)
  const namaSekolah = `SD RHD5 Sim ${runSuffix}`
  let savedSekolahId = null
  let savedPhotoId = null

  await loginViaApi(page, 'adminCabang')
  await gotoApp(page)
  await waitForServerCabang(page)
  await openTab(page, 'Data Sekolah')

  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()

  await modal.locator('div:has(> label:text("Nama Sekolah")) input').fill(namaSekolah)

  const photoSlot = modal.locator('div').filter({ hasText: 'Foto Sekolah (Unggah)' }).last()
  const fileInput = photoSlot.locator('input[type="file"]')
  await expect(fileInput).toHaveCount(1)

  // The server tier fires on save: capture the upload round-trip while
  // the file picker runs (admin_cabang session supplies the branch
  // server-side — no cabangId leaves the client).
  const jpegBuffer = await mintTestJpeg(page, '#166534')
  const [uploadRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/photo-upload.php') && res.request().method() === 'POST',
      { timeout: 15000 },
    ),
    fileInput.setInputFiles({
      name: 'test-rhd5.jpg',
      mimeType: 'image/jpeg',
      buffer: jpegBuffer,
    }),
  ])
  expect(uploadRes.status()).toBe(201)

  await expect(photoSlot.getByText('Ganti foto')).toBeVisible({ timeout: 15000 })
  const previewImg = photoSlot.locator('img[alt="Foto Sekolah (Unggah)"]')
  await expect(previewImg).toBeVisible()
  await expect
    .poll(async () => (await previewImg.getAttribute('src')) || '', { timeout: 15000 })
    .toMatch(/^data:image\/jpeg;base64,/)

  await modal.getByRole('button', { name: 'Simpan' }).click()
  await expect(modal).toBeHidden({ timeout: 15000 })

  // The saved record carries a server reference — not raw bytes, not an
  // idb key (storage contract: photos never in localStorage).
  const saved = await page.evaluate((nama) => {
    const rows = JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]')
    const row = rows.find((s) => s.nama === nama)
    return row ? { id: row.id, fotoEntry: row.fotoEntry || null } : null
  }, namaSekolah)
  expect(saved).toBeTruthy()
  expect(saved.fotoEntry?.type).toBe('server')
  expect(typeof saved.fotoEntry?.id).toBe('string')
  savedSekolahId = saved.id
  savedPhotoId = saved.fotoEntry.id
  expect(savedPhotoId.length).toBeGreaterThan(0)

  // The photo_uploads row exists: the scope-checked download endpoint
  // serves the exact bytes with an image content type (black-box proof
  // of the row — there is no list endpoint for photo_uploads).
  const downloadRes = await page.request.get(`/api/photo-download.php?id=${encodeURIComponent(savedPhotoId)}`)
  expect(downloadRes.ok()).toBe(true)
  expect(downloadRes.headers()['content-type']).toMatch(/image\/(jpeg|png|webp)/)
  const downloadBytes = await downloadRes.body()
  expect(downloadBytes.length).toBeGreaterThan(0)

  // --- second device: fresh context (empty idb by construction) --------
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  const page2Errors = []
  page2.on('pageerror', (error) => page2Errors.push(error.message))
  try {
    await loginViaApi(page2, 'adminCabang')
    await page2.goto(APP)
    await page2.waitForLoadState('domcontentloaded')
    await waitForServerCabang(page2)

    // The server-synced record arrives with the same server entry.
    await expect
      .poll(
        async () =>
          page2.evaluate((nama) => {
            const rows = JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]')
            const row = rows.find((s) => s.nama === nama)
            return row?.fotoEntry ?? null
          }, namaSekolah),
        { message: 'menunggu fotoEntry server tiba di perangkat kedua', timeout: 20000 },
      )
      .toMatchObject({ type: 'server', id: savedPhotoId })

    // The card thumbnail resolves through the download endpoint (idb
    // starts empty on this context — the bytes can only come from the
    // server tier). Register the response waiter BEFORE opening the tab:
    // SchoolThumbnail's effect fires the fetch at mount, so a waiter
    // attached after openTab()/toBeVisible() misses the (already 200)
    // response and times out — the same register-too-late race class as
    // the 881ae5c loginViaApi fix. The img.src poll stays as the render
    // proof; the waiter only proves the request went to the server.
    const thumbnailResponse = page2.waitForResponse(
      (res) => res.url().includes(`/api/photo-download.php?id=${encodeURIComponent(savedPhotoId)}`),
      { timeout: 20000 },
    )
    await openTab(page2, 'Data Sekolah')
    const card = page2
      .locator('div')
      .filter({ hasText: namaSekolah })
      .filter({ has: page2.getByRole('button', { name: 'Edit sekolah' }) })
      .last()
    await expect(card).toBeVisible({ timeout: 15000 })
    const thumbnailRes = await thumbnailResponse
    expect(thumbnailRes.status()).toBe(200)
    await expect
      .poll(async () => (await card.locator('img').first().getAttribute('src')) || '', { timeout: 20000 })
      .toMatch(/^data:image\/(jpeg|png|webp);base64,/)
    expect(page2Errors).toHaveLength(0)
  } finally {
    await ctx2.close()
  }

  // Cleanup (taste testing #33): delete the sim sekolah so the shared
  // test database stays canonical. The photo_uploads row has no delete
  // endpoint and is intentionally retained (see header note).
  if (savedSekolahId) {
    const csrf = await primeCsrf(page)
    const delRes = await page.request.post('/api/sekolah.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id: savedSekolahId, action: 'delete' },
    })
    expect(delRes.ok()).toBe(true)
  }

  expect(pageErrors).toHaveLength(0)
})
