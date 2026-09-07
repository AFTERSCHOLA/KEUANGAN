import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// A2.5-LOGO — Settings.logo: file picker (F-19, D-10 = B)
//
// VERIFY (per SCOPE_EXPANSION_MILESTONES.md A2.5-LOGO):
// opens Settings as superadmin, uploads a small test image, asserts
// the header's logo updates to the uploaded thumbnail, refreshes,
// asserts the logo survives.
//
// Storage contract (mirror of A2.5-SEKOLAH-FOTO): the logo is
// referenced by IndexedDB entry (settings.logoEntry =
// { type: 'idb', key, size }) or logoUrl — never the raw file.
// The header's SidebarLogo (src/components/SidebarLayout.jsx:13-32)
// prefers the uploaded entry over the URL.
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

test('A2.5-LOGO: upload thumbnail in header + survives refresh', async ({ page, pageErrors }) => {
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

  // Upload a small test image.
  const jpegBuffer = await mintTestJpeg(page, '#2563eb')
  await fileInput.setInputFiles({
    name: 'test-logo.jpg',
    mimeType: 'image/jpeg',
    buffer: jpegBuffer,
  })

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

  // The saved settings carry the IndexedDB reference, not raw bytes.
  const logoEntry = await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('afterschola_v4_settings') || '{}')
    return settings.logoEntry
  })
  expect(logoEntry).toBeTruthy()
  expect(logoEntry.type).toBe('idb')

  // Refresh: the logo survives (settings persist, SidebarLogo
  // re-hydrates from IndexedDB).
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  const headerLogoAfter = page.locator('img[alt="Logo"]').first()
  await expect
    .poll(async () => (await headerLogoAfter.getAttribute('src')) || '', { timeout: 15000 })
    .toMatch(/^data:image\/jpeg;base64,/)

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
