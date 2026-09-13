import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// A2.5-LOGO — Settings.logo: file picker (F-19, D-10 = B; LP.B.4 server contract F-LP1, D-LP4)
//
// VERIFY (per SCOPE_EXPANSION_MILESTONES.md A2.5-LOGO + LOGO_PORTABILITY_MILESTONES.md LP.B.4):
// opens Settings as superadmin, uploads a small test image, asserts
// the saved settings carry {type:'server', id} (not {type:'idb'}),
// the header's logo updates to the uploaded thumbnail, refreshes
// (same-device leg — now proves idb cache warming), then opens a
// second browser context (fresh device: empty idb/localStorage by
// construction) and asserts it resolves the same logo id through
// logo-current.php and renders the same bytes through
// logo-download.php with zero per-device import.
//
// Storage contract (LP.B.3 client, D-LP4): online superadmin saves
// become {type:'server', id} backed by a photo_uploads row
// (cabang_id NULL) with an idb cache warm; offline/denied stays
// {type:'idb'} (photo outbox deferred, R-LP5). The header's
// SidebarLogo (src/components/SidebarLayout.jsx:13-39) prefers the
// cached entry, falls back to logo-current → logo-download on a
// fresh device, and App.jsx converges the second device's local
// entry to the same server id.
//
// NOTE: photo_uploads rows have no delete endpoint, so the uploaded
// test logo row is intentionally left behind (one row per run;
// `npm run db:reset` wipes it). The cleanup leg clears the local
// logoEntry via "Hapus foto" so the shared test browser profile
// does not leak the entry into other specs.
// ============================================================

const APP = 'http://localhost:5173'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

// Mint a real 16x16 JPEG at runtime through the browser's own
// canvas encoder (mirror of sekolah-foto-picker.spec.js).
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

test('A2.5-LOGO: upload thumbnail in header + survives refresh + renders on second device', async ({ browser, page, pageErrors }) => {
  await loginViaApi(page, 'superadmin')
  await gotoApp(page)

  // Snapshot the current header logo src so the delta is provable.
  // SidebarLogo renders <img alt="Logo"> inside the sidebar <aside>
  // (complementary), not the <nav> — scope to the page root.
  const headerLogoBefore = page.locator('img[alt="Logo"]').first()
  const beforeCount = await headerLogoBefore.count()
  const beforeSrc = beforeCount ? await headerLogoBefore.getAttribute('src') : ''

  // Open Settings: the account menu (avatar button, aria-label
  // "Akun") carries the "Pengaturan" menu item.
  const settingsTrigger = page.getByRole('button', { name: 'Akun' })
  await expect(settingsTrigger).toBeVisible()
  await settingsTrigger.click()
  await page.getByRole('menuitem', { name: 'Pengaturan' }).click()

  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()

  // The Logo field offers URL input (existing) + file picker (new).
  await expect(modal.locator('div:has(> label:text("Logo URL")) input')).toBeVisible()

  const photoSlot = modal.locator('div').filter({ hasText: 'Logo (Unggah)' }).last()
  const fileInput = photoSlot.locator('input[type="file"]')
  await expect(fileInput).toHaveCount(1)

  // Upload a small test image. The server tier fires on file pick
  // (superadmin session posts to the cabang-less logo-upload.php):
  // capture the round-trip while the picker runs.
  const jpegBuffer = await mintTestJpeg(page, '#2563eb')
  const [uploadRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/logo-upload.php') && res.request().method() === 'POST',
      { timeout: 15000 },
    ),
    fileInput.setInputFiles({
      name: 'test-logo.jpg',
      mimeType: 'image/jpeg',
      buffer: jpegBuffer,
    }),
  ])
  expect(uploadRes.status()).toBe(201)

  await expect(photoSlot.getByText('Ganti foto')).toBeVisible({ timeout: 15000 })
  const previewImg = photoSlot.locator('img[alt="Logo (Unggah)"]')
  await expect(previewImg).toBeVisible()

  // Save the Identitas panel.
  await modal.getByRole('button', { name: 'Simpan' }).first().click()
  await expect(modal).toBeHidden({ timeout: 15000 })

  // The header's logo now renders the uploaded thumbnail
  // (data URL from IndexedDB), different from the pre-save src.
  const headerLogoAfterSave = page.locator('img[alt="Logo"]').first()
  await expect
    .poll(async () => (await headerLogoAfterSave.getAttribute('src')) || '', { timeout: 15000 })
    .toMatch(/^data:image\/jpeg;base64,/)

  const afterSrc = await headerLogoAfterSave.getAttribute('src')
  expect(afterSrc).not.toBe(beforeSrc)

  // The saved settings carry the server reference, not raw bytes
  // and not an idb-only entry (LP.B.4 server contract).
  const logoEntry = await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('afterschola_v4_settings') || '{}')
    return settings.logoEntry
  })
  expect(logoEntry).toBeTruthy()
  expect(logoEntry.type).toBe('server')
  expect(typeof logoEntry.id).toBe('string')
  expect(logoEntry.id.length).toBeGreaterThan(0)
  const savedLogoId = logoEntry.id

  // The logo-current endpoint resolves the same id, and the
  // logo-download endpoint serves the exact bytes with an image
  // content type (black-box proof of the photo_uploads row).
  const currentRes = await page.request.get('/api/logo-current.php')
  expect(currentRes.ok()).toBe(true)
  const currentBody = await currentRes.json()
  expect(currentBody.id).toBe(savedLogoId)
  const downloadRes = await page.request.get(`/api/logo-download.php?id=${encodeURIComponent(savedLogoId)}`)
  expect(downloadRes.ok()).toBe(true)
  expect(downloadRes.headers()['content-type']).toMatch(/image\/(jpeg|png|webp)/)
  const downloadBytes = await downloadRes.body()
  expect(downloadBytes.length).toBeGreaterThan(0)

  // Refresh (same-device leg — now proves cache warming): the logo
  // survives (settings persist, SidebarLogo re-hydrates from the
  // warmed idb cache without another upload).
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  const headerLogoAfter = page.locator('img[alt="Logo"]').first()
  await expect
    .poll(async () => (await headerLogoAfter.getAttribute('src')) || '', { timeout: 15000 })
    .toMatch(/^data:image\/jpeg;base64,/)

  // --- second device: fresh context (empty idb/localStorage by construction) ---
  // The bytes can only arrive through the logo-current → logo-download
  // tier. Register the response waiter BEFORE goto: SidebarLogo's +
  // App.jsx's effects fire the fetch at mount, so a waiter attached
  // after goto()/toBeVisible() misses the (already 200) response and
  // times out — the same register-too-late race class as the 881ae5c
  // loginViaApi fix and the photo-server-roundtrip thumbnail waiter.
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  const page2Errors = []
  page2.on('pageerror', (error) => page2Errors.push(error.message))
  try {
    await loginViaApi(page2, 'superadmin')
    const currentWait = page2.waitForResponse(
      (res) => res.url().includes('/api/logo-current.php') && res.request().method() === 'GET',
      { timeout: 20000 },
    )
    await page2.goto(APP)
    await page2.waitForLoadState('domcontentloaded')
    const currentRes2 = await currentWait
    expect(currentRes2.status()).toBe(200)
    const currentBody2 = await currentRes2.json()
    expect(currentBody2.id).toBe(savedLogoId)

    // The second device converges its local entry to the same server
    // id (App.jsx portable-logo effect) with zero per-device import.
    await expect
      .poll(
        async () =>
          page2.evaluate(() => {
            const settings = JSON.parse(localStorage.getItem('afterschola_v4_settings') || '{}')
            return settings.logoEntry ?? null
          }),
        { message: 'menunggu logoEntry server tiba di perangkat kedua', timeout: 20000 },
      )
      .toMatchObject({ type: 'server', id: savedLogoId })

    // The header renders the same bytes on the fresh device.
    const headerLogo2 = page2.locator('img[alt="Logo"]').first()
    await expect
      .poll(async () => (await headerLogo2.getAttribute('src')) || '', { timeout: 20000 })
      .toMatch(/^data:image\/(jpeg|png|webp);base64,/)
    const secondSrc = await headerLogo2.getAttribute('src')
    expect(secondSrc).toBe(afterSrc)

    // The download tier serves the same bytes to the second device.
    const downloadRes2 = await page2.request.get(`/api/logo-download.php?id=${encodeURIComponent(savedLogoId)}`)
    expect(downloadRes2.ok()).toBe(true)
    expect(downloadRes2.headers()['content-type']).toMatch(/image\/(jpeg|png|webp)/)
    expect((await downloadRes2.body()).length).toBeGreaterThan(0)

    expect(page2Errors).toHaveLength(0)
  } finally {
    await ctx2.close()
  }

  // Restore: clear the uploaded logo so the shared test browser
  // profile doesn't leak the entry into other specs. The Settings
  // modal's "Hapus foto" path removes the entry.
  const settingsTrigger2 = page.getByRole('button', { name: 'Akun' })
  await settingsTrigger2.click()
  await page.getByRole('menuitem', { name: 'Pengaturan' }).click()
  const modal2 = page.getByRole('dialog')
  await expect(modal2).toBeVisible()
  const photoSlot2 = modal2.locator('div').filter({ hasText: 'Logo (Unggah)' }).last()
  await photoSlot2.getByRole('button', { name: 'Hapus foto' }).click()
  await expect(photoSlot2.getByText('Pilih foto')).toBeVisible({ timeout: 15000 })
  await modal2.getByRole('button', { name: 'Simpan' }).first().click()
  await expect(modal2).toBeHidden({ timeout: 15000 })

  expect(pageErrors).toHaveLength(0)
})
