import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF5.3 — siswa.foto field removed from the form
// (privacy, D-20 = A). The SiswaForm no longer renders a Foto
// label/input.
//
// The legacy data assertion (pre-migration of legacy `foto` values
// in the siswa list) is deliberately deferred to M-AF5.4 per the
// microtask's VERIFY clause.
// ============================================================

const APP = 'http://localhost:5173'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__af53_reset')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__af53_reset', '1')
  })
}

test('M-AF5.3: SiswaForm has no Foto label or input', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Open Data Siswa and click Tambah Siswa Baru to surface the SiswaForm modal.
  await page.getByRole('button', { name: 'Data Siswa', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()

  const dialog = page.getByRole('dialog')

  // ASSERT: no label and no input related to Foto inside the SiswaForm modal.
  // The old field was a label "Foto (URL)" plus a single text input. Probe
  // both: any label whose text starts with "Foto" (case-sensitive) and any
  // input that sits inside the <div> whose direct child <label> starts with
  // "Foto (URL)".
  await expect(dialog.locator('label', { hasText: /^Foto/ })).toHaveCount(0)
  await expect(dialog.locator('div:has(> label:text("Foto (URL)")) input')).toHaveCount(0)

  // Sanity: the form still has its required fields (so we know we are inside
  // a real SiswaForm modal and the absence is not because the modal failed
  // to open).
  await expect(dialog.getByText('Nama Siswa', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Status Siswa', { exact: true })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})
