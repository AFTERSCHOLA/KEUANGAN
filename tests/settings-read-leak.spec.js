import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF2.2 — close settings read-side leak
//
// The settings modal is reachable from AccountMenu (which renders
// the "Pengaturan" item for every role) and from App.jsx's
// settingsModalOpen state. The server already denies writes for
// non-superadmin (settings.php requireAuthorization 'manage_settings'
// deny-list) and the 'settings' entity is excluded from non-superadmin
// roleCanReadEntity. The remaining leak is the form rendering: even
// when bank rekening / penandatangan / alamatUsaha sit in
// localStorage, a non-superadmin should never see them in the DOM.
//
// M-AF2.2 contract: when a trainer (or admin_cabang) opens
// SettingsModal, the modal renders a placeholder message and never
// shows any of the bank / penandatangan / alamatUsaha labels or
// their stored values. Superadmin path is unchanged.
// ============================================================

const APP = 'http://localhost:5173'

const SAMPLE_SETTINGS = {
  logoUrl: 'https://example.com/logo.png',
  title: 'Afterschola Test Title',
  alamatUsaha: 'Jl. Contoh No. 1, Bandung',
  rekeningBank: 'BSI Test',
  rekeningNomor: '1234567890',
  rekeningAtasNama: 'PT Test',
  penandatangan: 'Pak Budi Test',
}

async function seedSettings(page) {
  await page.evaluate((data) => {
    localStorage.setItem('afterschola_v4_settings', JSON.stringify(data))
  }, SAMPLE_SETTINGS)
}

async function openSettingsViaState(page) {
  // The AccountMenu "Pengaturan" item isn't trivially reachable via
  // a single role-based locator because the avatar dropdown is
  // already closed. The simplest, deterministic way to surface the
  // SettingsModal in this spec is to navigate the app shell directly:
  // click the avatar (aria-label "Akun") and then click "Pengaturan"
  // from the menu — both role-based locators (taste #7).
  await page.getByRole('button', { name: 'Akun' }).click()
  await page.getByRole('menuitem', { name: 'Pengaturan' }).click()
}

test('M-AF2.2: trainer SettingsModal renders the read-only notice and shows no bank / penandatangan / alamatUsaha fields', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Seed a "leaky" settings record BEFORE opening the modal. If the
  // role gate is broken, the modal would happily render these
  // values into the inputs.
  await seedSettings(page)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await openSettingsViaState(page)

  // The placeholder must be visible.
  await expect(page.getByTestId('settings-readonly-notice')).toBeVisible()
  await expect(page.getByTestId('settings-readonly-notice')).toContainText('Hanya Superadmin')

  // None of the sensitive labels (or their stored values) should
  // appear anywhere in the modal DOM. The Indonesian copy is the
  // same wording used in the superadmin form, so a literal
  // substring search across the modal's text is the right check.
  const modal = page.getByRole('dialog')
  const modalText = (await modal.innerText()).toLowerCase()
  for (const forbidden of [
    'alamat usaha',
    'nama bank',
    'no. rekening',
    'atas nama',
    'nama penandatangan invoice',
    'spsi test',          // the seeded rekeningBank value
    'pt test',            // the seeded rekeningAtasNama value
    'pak budi test',      // the seeded penandatangan value
    'jl. contoh no. 1',   // the seeded alamatUsaha value
  ]) {
    expect(modalText).not.toContain(forbidden)
  }

  expect(pageErrors).toHaveLength(0)
})

test('M-AF2.2: superadmin SettingsModal still shows the editable form (regression check)', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  await seedSettings(page)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await openSettingsViaState(page)

  // Superadmin path is unchanged: no read-only notice, and the
  // sensitive labels render in the form.
  await expect(page.getByTestId('settings-readonly-notice')).toHaveCount(0)
  await expect(page.getByText('Alamat Usaha', { exact: false })).toBeVisible()
  await expect(page.getByText('Nama Bank', { exact: false })).toBeVisible()
  await expect(page.getByText('Nama Penandatangan Invoice', { exact: false })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})
