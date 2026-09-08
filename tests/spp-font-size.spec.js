// PM.5.20 (F-16): SPP-per-Sekolah font bump text-xs → text-sm.
//
// VERIFY (PLAYWRIGHT_MIGRATION_MILESTONES.md PM.5.20): open FinanceReport as
// Admin Cabang, assert the SPP amount font-size is >= 14px (text-sm) via
// getComputedStyle. The 4850fca implementation bumped the percentage value
// in the per-school SPP chart (OverviewCards.jsx:298-302, 9 → 11 SVG font)
// and the adjacent section labels; the >= 14px computed assertion applies
// to the FinanceReport Rincian table where SPP amounts render as DOM text.

import { test, expect, loginViaApi, createSekolahSuperadmin, loginAndPrime } from './fixtures.js'

const APP = 'http://localhost:5173'
const ADMIN_BRANCH_ID = 'cbg-test-pusat'

test('PM.5.20: SPP amount typography in FinanceReport renders >= 14px', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SIM_SCH_NAME = `SD PM520 Sim ${SUFFIX}`

  // Seed a sekolah so the Rincian Finansial Sekolah Mitra table has a row
  // with SPP amounts to measure.
  const csrf = await loginAndPrime(page, 'superadmin')
  await createSekolahSuperadmin(page, csrf, SIM_SCH_NAME, 100000, ADMIN_BRANCH_ID, `pm520-${SUFFIX}`)

  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.getByRole('navigation').getByRole('button', { name: 'Data Keuangan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Laporan Keuangan' })).toBeVisible()

  // The Rincian Finansial Sekolah Mitra table: SPP amounts live in the
  // td cells (text-sm = 14px floor) of the row matching our seeded school.
  const row = page.locator('tr', { hasText: SIM_SCH_NAME }).first()
  await expect(row).toBeVisible()

  const cells = row.locator('td')
  const count = await cells.count()
  expect(count).toBeGreaterThanOrEqual(6)
  for (let i = 1; i < Math.min(count, 6); i++) {
    const px = await cells.nth(i).evaluate(el => parseFloat(getComputedStyle(el).fontSize))
    expect(px).toBeGreaterThanOrEqual(14)
  }

  // Heading/labels may stay small (text-xs label rule); the invariant is
  // only on the amounts — the first td (school name) is excluded above
  // (i starts at 1 and the amounts are the numeric cells).
  await page.screenshot({ path: 'test-results/pm520-finance-report.png', fullPage: false })

  expect(pageErrors).toHaveLength(0)
})
