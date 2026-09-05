import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF5.1 — Always confirm Sekolah delete.
//
// F-01 (manual audit #008): deleting a Sekolah without siswa used to
// silently delete (remove() short-circuited straight to doDelete),
// which left no recovery path and surprised users. The fix routes the
// no-siswa case through a ConfirmDialog with confirmLabel="Hapus" +
// danger={true}, mirroring the existing ConfirmDialog usage in
// TrainerList / StudentList / BranchManager / BackupRestorePanel.
//
// The with-siswa re-assign flow (confirmLabel="Reassign ke sekolah
// lain") is unchanged — this spec only exercises the no-siswa path.
// ============================================================

const APP = 'http://localhost:5173'
const SCHOOL_NAME = 'SD AF5.1 Konfirmasi'

function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

test('M-AF5.1: deleting a Sekolah without siswa opens a ConfirmDialog with Hapus, Batal cancels, Hapus deletes', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Seed: create one Sekolah with no siswa via the UI.
  await page.getByRole('button', { name: 'Data Sekolah', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  // The form's controlled <select> uses a fallback `value={form.cabangId
  // || cabang[0]?.id || defaultCabang().id}` — when form.cabangId is
  // null and the displayed branch id differs from the React state, the
  // displayed value never round-trips through onChange, so save()'s
  // M-AF3.1 pre-submit check sees a null form.cabangId and rejects with
  // "Cabang tidak valid". Select an option whose id matches a real
  // branch entry (skips the defaultCabang() placeholder) so onChange
  // fires and populates form.cabangId correctly.
  const cabangSelect = page.getByRole('dialog').locator('div:has(> label:text("Cabang")) select').first()
  // Pick a non-default option (skip index 0 which is the placeholder).
  const optionValues = await cabangSelect.evaluate(el =>
    Array.from(el.options).map(o => o.value)
  )
  const realId = optionValues.find(v => v && v.startsWith('cbg-'))
  if (!realId) throw new Error('No real cabang id found in select: ' + JSON.stringify(optionValues))
  await cabangSelect.selectOption(realId)
  await field(page, 'Nama Sekolah').fill(SCHOOL_NAME)
  await field(page, 'SPP Bulanan').fill('100000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  // Wait for the form modal to close before asserting on the card,
  // since save() is async and the card render waits for refresh().
  await expect(page.getByRole('heading', { name: 'Tambah Sekolah' })).toBeHidden({ timeout: 10000 })
  await expect(page.getByText(SCHOOL_NAME).first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(SCHOOL_NAME).first()).toBeVisible({ timeout: 10000 })

  // Locate the school card by name and click its trash icon
  // (last action button in the absolute-positioned action group).
  const card = page.locator('div.bg-white.rounded-2xl', { hasText: SCHOOL_NAME }).first()
  const cardDeleteBtn = card.locator('div.absolute.top-2.right-2 > button').last()
  await cardDeleteBtn.click()

  // The no-siswa delete must open a ConfirmDialog with confirmLabel="Hapus".
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const hapusBtn = dialog.getByRole('button', { name: 'Hapus', exact: true })
  await expect(hapusBtn).toBeVisible()
  const batalBtn = dialog.getByRole('button', { name: 'Batal', exact: true })
  await expect(batalBtn).toBeVisible()

  // Click Batal — row must remain.
  await batalBtn.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(SCHOOL_NAME).first()).toBeVisible()

  // Click delete again — confirm — assert row is gone.
  await cardDeleteBtn.click()
  const dialog2 = page.getByRole('dialog')
  await expect(dialog2).toBeVisible()
  await dialog2.getByRole('button', { name: 'Hapus', exact: true }).click()
  // The card disappears after the delete + cache re-read. Wait for the
  // text to vanish (a generous timeout for the network round-trip).
  await expect(page.getByText(SCHOOL_NAME).first()).toHaveCount(0, { timeout: 10000 })

  expect(pageErrors).toHaveLength(0)
})
