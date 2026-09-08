// PM.5.13 (F-06): Salin buttons show copy feedback.
//
// VERIFY (PLAYWRIGHT_MIGRATION_MILESTONES.md PM.5.13): open the Trainer
// initial-password dialog as Admin Cabang, click Salin, assert the button
// text changes to `Tersalin`, then reverts to `Salin` after ~1.5s; same
// assertion for the BranchManager initial-password dialog (superadmin).
//
// Headless Chromium denies navigator.clipboard.writeText without a
// permission grant, which would route the UI into its 'Gagal menyalin'
// branch and mask the feedback state under test. The spec grants the
// clipboard permissions to the dev origin (test-harness workaround per
// testing-taste #32 — the app behavior is unchanged, only the environment
// friction is removed).
//
// Both dialogs mint a fresh user account during the run; those accounts are
// deliberately left behind as login fixtures (deleting them through the UI
// is out of the milestone's scope, and the users table is reset by
// `npm run db:reset` before the next suite run).

import { test, expect, loginViaApi, createSekolahSuperadmin, loginAndPrime } from './fixtures.js'

const APP = 'http://localhost:5173'
const ADMIN_BRANCH_ID = 'cbg-test-pusat'
const SUFFIX = String(Date.now()).slice(-6)
const SIM_SCH_NAME = `SD PM513 Sim ${SUFFIX}`

async function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

test.beforeEach(async ({ context, page }) => {
  // Headless Chromium's clipboard writeText rejects/pends without a
  // focused document, which would route the UI into its 'Gagal menyalin'
  // branch and mask the feedback state under test. Grant the permissions
  // AND stub writeText to resolve — the component's real copyToClipboard
  // path (setStatus('copied') → 1.5s reset) is what the spec asserts;
  // the stub only removes the environment nondeterminism (testing-taste
  // #3/#32: disposable in-harness stubs over shared-state seeding).
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:5173',
  })
  await page.addInitScript(() => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText = () => Promise.resolve()
    }
  })
})

test('PM.5.13: Trainer initial-password dialog Salin shows Tersalin feedback', async ({ page, pageErrors }) => {
  const csrf = await loginAndPrime(page, 'superadmin')
  await createSekolahSuperadmin(page, csrf, SIM_SCH_NAME, 100000, ADMIN_BRANCH_ID, `pm513-${SUFFIX}`)

  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.getByRole('navigation').getByRole('button', { name: 'Data Trainer', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()

  const nama = await field(page, 'Nama Trainer')
  await nama.fill(`Trainer PM513 Sim ${SUFFIX}`)
  const honor = await field(page, 'Honor per Kedatangan')
  await honor.fill('50000')
  // Keep "Buat akun login" checked (default) and give a unique username.
  const username = await field(page, 'Username Login')
  await username.fill(`trpm513sim${SUFFIX}`)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Initial-password dialog (USER_PROVISIONING D4).
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Akun Trainer Berhasil Dibuat')).toBeVisible()

  // Two Salin buttons: username row + password row. Pin the username one
  // by its stable aria-live attribute — a name-based locator re-resolves
  // to the *other* button the moment the label flips to "Tersalin".
  const salin = dialog.locator('button[aria-live="polite"]').first()
  await expect(salin).toBeVisible()
  await salin.click()

  // Label flips to Tersalin (aria-live polite), …
  await expect(salin).toHaveText('Tersalin')

  // …and reverts after the 1.5s reset window.
  await expect(salin).toHaveText('Salin', { timeout: 4000 })

  // Acknowledge + close so the modal unmounts cleanly.
  await dialog.getByRole('button', { name: 'Saya sudah catat, tutup' }).click()
  await expect(dialog).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})

test('PM.5.13: BranchManager initial-password dialog Salin shows Tersalin feedback', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  await page.getByRole('navigation').getByRole('button', { name: 'Data Cabang', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Cabang' }).click()

  const namaCabang = await field(page, 'Nama Cabang')
  await namaCabang.fill(`Cabang PM513 Sim ${SUFFIX}`)
  const kode = await field(page, 'Kode Cabang')
  await kode.fill(`PM5${SUFFIX.slice(-4)}`)
  // Admin account fields (createAdminAccount default true).
  const namaAdmin = await field(page, 'Nama Admin Cabang')
  await namaAdmin.fill(`Admin PM513 Sim ${SUFFIX}`)
  const usernameAdmin = await field(page, 'Username Login Admin')
  await usernameAdmin.fill(`adpm513sim${SUFFIX}`)
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  const salin = dialog.locator('button[aria-live="polite"]').first()
  await expect(salin).toBeVisible()
  await salin.click()
  await expect(salin).toHaveText('Tersalin')
  await expect(salin).toHaveText('Salin', { timeout: 4000 })

  await dialog.getByRole('button', { name: 'Saya sudah catat, tutup' }).click()
  await expect(dialog).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})
