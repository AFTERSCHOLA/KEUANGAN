// PM.5.22 (F-21): row numbering as first th/td.
//
// VERIFY (PLAYWRIGHT_MIGRATION_MILESTONES.md PM.5.22): open Data Siswa as
// superadmin, assert the first <th> text is `#`, and the first <td> in each
// body row contains 1..N matching the row index. Companion: the Sekolah
// card grid numbers its cards top-left (the plan's card-layout pick).

import { test, expect, loginViaApi, createSekolahSuperadmin, createTrainerSuperadmin, loginAndPrime } from './fixtures.js'

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

test('PM.5.22: siswa table renders # header and 1-indexed row numbers', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SIM_SCH_NAME = `SD PM522 Sim ${SUFFIX}`
  const SIM_TR_NAME = `Trainer PM522 Sim ${SUFFIX}`
  const SIM_SW_NAMES = [`Siswa PM522 A ${SUFFIX}`, `Siswa PM522 B ${SUFFIX}`]

  // Seed sekolah + trainer via the API helpers, then two siswa via the form.
  const csrf = await loginAndPrime(page, 'superadmin')
  const sekolahResp = await createSekolahSuperadmin(page, csrf, SIM_SCH_NAME, 100000, ADMIN_BRANCH_ID, `pm522-${SUFFIX}`)
  await createTrainerSuperadmin(page, csrf, `trpm522sim${SUFFIX}`, SIM_TR_NAME, SIM_TR_NAME, ADMIN_BRANCH_ID, [sekolahResp.id])

  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  for (const nama of SIM_SW_NAMES) {
    await page.getByRole('navigation').getByRole('button', { name: 'Data Siswa', exact: true }).click()
    await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
    const namaField = await field(page, 'Nama Siswa')
    await namaField.fill(nama)
    const sekolahField = await field(page, 'Sekolah')
    await sekolahField.selectOption({ label: SIM_SCH_NAME })
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect
      .poll(
        () => page.evaluate(
          ([key, nm]) => JSON.parse(localStorage.getItem(`afterschola_v4_${key}`) || '[]').some(r => r.nama === nm),
          ['siswa', nama],
        ),
        { timeout: 15000 },
      )
      .toBe(true)
  }

  // ---- Data Siswa numbering assertions (superadmin view also has the
  // Aksi column; the numbering contract is role-independent) ----
  await page.getByRole('navigation').getByRole('button', { name: 'Data Siswa', exact: true }).click()

  const table = page.locator('table').first()
  await expect(table).toBeVisible()

  // First <th> is exactly "#".
  await expect(table.locator('thead th').first()).toHaveText('#')

  // First <td> of every body row is the 1-indexed row number. The seeded
  // rows are somewhere in the list; assert the numbering contract for every
  // rendered row (1..N contiguous), which covers ours.
  const rows = table.locator('tbody tr')
  const rowCount = await rows.count()
  expect(rowCount).toBeGreaterThanOrEqual(2)
  for (let i = 0; i < rowCount; i++) {
    const firstTd = rows.nth(i).locator('td').first()
    const text = (await firstTd.innerText()).trim()
    expect(text).toBe(String(i + 1))
  }

  // The # column is narrow (< 50px) and right-aligned (w-12 text-right).
  const headerBox = await table.locator('thead th').first().boundingBox()
  expect(headerBox.width).toBeLessThan(50)
  const textAlign = await table.locator('thead th').first().evaluate(el => getComputedStyle(el).textAlign)
  expect(textAlign).toBe('right')

  // ---- Sekolah card numbering companion (card-layout pick) ----
  await page.getByRole('navigation').getByRole('button', { name: 'Data Sekolah', exact: true }).click()
  const card = page.locator('div.bg-white.rounded-2xl', { hasText: SIM_SCH_NAME }).first()
  await expect(card).toBeVisible()
  const badge = card.locator('span.absolute.top-2.left-2').first()
  await expect(badge).toBeVisible()
  const badgeNum = parseInt((await badge.innerText()).trim(), 10)
  expect(Number.isInteger(badgeNum)).toBe(true)
  expect(badgeNum).toBeGreaterThanOrEqual(1)

  expect(pageErrors).toHaveLength(0)
})
