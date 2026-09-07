import { test, expect, loginViaApi } from './fixtures.js'

const APP = 'http://localhost:5173'
const SUFFIX = String(Date.now()).slice(-6)
const SCH_NAME = `SD Jadwal Sim ${SUFFIX}`

function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('A2.5: Sekolah Jadwal — add 2 entries, persists after refresh', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await field(page, 'Nama Sekolah').fill(SCH_NAME)

  const dialog = page.getByRole('dialog')
  await dialog.getByText('+ Tambah Jadwal').click()
  const day1 = dialog.locator('select').filter({ has: page.locator('option', { hasText: 'Senin' }) }).first()
  await day1.selectOption('Senin')
  await dialog.locator('input[type="time"]').first().fill('14:00')

  await dialog.getByText('+ Tambah Jadwal').click()
  const day2 = dialog.locator('select').filter({ has: page.locator('option', { hasText: 'Senin' }) }).nth(1)
  await day2.selectOption('Rabu')
  await dialog.locator('input[type="time"]').nth(1).fill('15:00')

  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  const heading = page.getByRole('heading', { name: SCH_NAME, exact: true })
  const card = heading.locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]')
  await expect(card.getByText(/Senin 14:00, Rabu 15:00/)).toBeVisible({ timeout: 10000 })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await openTab(page, 'Data Sekolah')
  const headingAfterReload = page.getByRole('heading', { name: SCH_NAME, exact: true })
  const cardAfterReload = headingAfterReload.locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]')
  await cardAfterReload.getByRole('button', { name: 'Edit sekolah' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await expect(page.getByRole('dialog').locator('input[type="time"]')).toHaveCount(2)

  expect(pageErrors).toHaveLength(0)
})