// PM.5.21 (F-17): Trial-siswa row buttons reserve space via `invisible`.
//
// VERIFY (PLAYWRIGHT_MIGRATION_MILESTONES.md PM.5.21): open Data Siswa as
// Admin Cabang, locate a Trial siswa row, assert the row's button group is
// right-aligned (a visible action button's getBoundingClientRect().right
// matches the row's right edge within 4px) even when the Kirim Tagihan
// button is invisible.

import { test, expect, loginViaApi, createSekolahSuperadmin, loginAndPrime } from './fixtures.js'

const APP = 'http://localhost:5173'
const ADMIN_BRANCH_ID = 'cbg-test-pusat'

async function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

test('PM.5.21: Trial siswa row buttons stay right-anchored while Kirim Tagihan is invisible', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SIM_SCH_NAME = `SD PM521 Sim ${SUFFIX}`
  const SIM_SW_NAME = `Siswa PM521 Sim ${SUFFIX}`

  const csrf = await loginAndPrime(page, 'superadmin')
  await createSekolahSuperadmin(page, csrf, SIM_SCH_NAME, 100000, ADMIN_BRANCH_ID, `pm521-${SUFFIX}`)

  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Create a Trial siswa through the form (Status Siswa: Trial).
  await page.getByRole('navigation').getByRole('button', { name: 'Data Siswa', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  const namaField = await field(page, 'Nama Siswa')
  await namaField.fill(SIM_SW_NAME)
  const sekolahField = await field(page, 'Sekolah')
  await sekolahField.selectOption({ label: SIM_SCH_NAME })
  await page.getByLabel('Trial', { exact: true }).check()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Wait for the async writeRemote to land.
  await expect
    .poll(
      () => page.evaluate(
        ([key, nama]) => JSON.parse(localStorage.getItem(`afterschola_v4_${key}`) || '[]').some(r => r.nama === nama),
        ['siswa', SIM_SW_NAME],
      ),
      { timeout: 15000 },
    )
    .toBe(true)

  const row = page.locator('tr', { hasText: SIM_SW_NAME }).first()
  await expect(row).toBeVisible()

  // The Trial badge renders in the row (status sanity for the fixture).
  await expect(row.getByText('Trial', { exact: true }).first()).toBeVisible()

  // The WA billing anchor is present in the DOM but invisible (Trial is
  // never billable — StudentList.jsx:354-388).
  const waAnchor = row.locator('a[title="Kirim tagihan via WhatsApp"]')
  await expect(waAnchor).toHaveCount(1)
  expect(await waAnchor.evaluate(el => getComputedStyle(el).visibility)).toBe('hidden')

  // Right-anchor invariant (F-17): when a row's Kirim Tagihan button is
  // hidden, the remaining action buttons must NOT drift toward center —
  // they stay anchored at the same right offset as a row whose WA button
  // is fully applicable. The plan's absolute "within 4px of the row's
  // right edge" pin missed the Aksi cell's intentional px-6 (24px)
  // padding; the falsifiable form is comparing the two rows' offsets.
  const rowBox = await row.boundingBox()
  const buttons = row.locator('td div.flex button:visible')
  const n = await buttons.count()
  expect(n).toBeGreaterThanOrEqual(2)
  const lastBox = await buttons.nth(n - 1).boundingBox()
  expect(lastBox).not.toBeNull()
  const trialOffset = rowBox.x + rowBox.width - (lastBox.x + lastBox.width)

  // Control row: an Aktif siswa in the same table (WA button visible or
  // invisible per tunggakan state — either way its button group must sit
  // at the same anchored offset). Seed one Aktif siswa via the form.
  const aktibName = `Siswa PM521 Aktif ${SUFFIX}`
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  const namaField2 = await field(page, 'Nama Siswa')
  await namaField2.fill(aktibName)
  const sekolahField2 = await field(page, 'Sekolah')
  await sekolahField2.selectOption({ label: SIM_SCH_NAME })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect
    .poll(
      () => page.evaluate(
        ([key, nm]) => JSON.parse(localStorage.getItem(`afterschola_v4_${key}`) || '[]').some(r => r.nama === nm),
        ['siswa', aktibName],
      ),
      { timeout: 15000 },
    )
    .toBe(true)

  const aktifRow = page.locator('tr', { hasText: aktibName }).first()
  await expect(aktifRow).toBeVisible()
  const aktifBox = await aktifRow.boundingBox()
  const aktifButtons = aktifRow.locator('td div.flex button:visible')
  const m = await aktifButtons.count()
  expect(m).toBeGreaterThanOrEqual(2)
  const aktifLastBox = await aktifButtons.nth(m - 1).boundingBox()
  const aktifOffset = aktifBox.x + aktifBox.width - (aktifLastBox.x + aktifLastBox.width)

  // The invisible WA button kept the Trial row's group anchored: both
  // rows' right offsets match the Aksi cell padding within 2px.
  expect(Math.abs(trialOffset - aktifOffset)).toBeLessThanOrEqual(2)
  expect(trialOffset).toBeGreaterThan(0)
  expect(trialOffset).toBeLessThan(40)

  expect(pageErrors).toHaveLength(0)
})
