// PM.5.15 (F-14): sidebar collapse keeps the toggle + logo inside the rail.
//
// VERIFY (PLAYWRIGHT_MIGRATION_MILESTONES.md PM.5.15): open the app as
// superadmin at 1280px, click the collapse toggle, assert the sidebar's
// bounding box is exactly 80px wide (the plan's "exactly 80px" refers to
// the w-20 rail; the <aside> is border-box so 80px INCLUDES the 2px
// border-right) and the toggle button's right edge is within the rail.

import { test, expect, loginViaApi } from './fixtures.js'

const APP = 'http://localhost:5173'

test('PM.5.15: collapsed desktop sidebar is exactly 80px and keeps the toggle inside the rail', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // The rail is the <aside> (complementary landmark) — the <nav> inside it
  // is only the content box (aside width minus the 2px border).
  const sidebar = page.getByRole('complementary')
  await expect(sidebar).toBeVisible()

  const collapseButton = page.getByRole('button', { name: 'Ciutkan sidebar' })
  await expect(collapseButton).toBeVisible()

  // Pre-check: expanded rail is exactly 256px (w-64, border-box).
  let box = await sidebar.boundingBox()
  expect(Math.round(box.width)).toBe(256)

  await collapseButton.click()

  // Collapsed rail: exactly 80px (w-20, border-box — the plan's "exactly
  // 80px" is this box).
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox()).width))
    .toBe(80)

  // …and the toggle's right edge stays inside the rail.
  const sidebarBox = await sidebar.boundingBox()
  const toggleBox = await page.getByRole('button', { name: 'Perluas sidebar' }).boundingBox()
  expect(toggleBox).not.toBeNull()
  expect(toggleBox.x).toBeGreaterThanOrEqual(sidebarBox.x)
  expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width + 1)

  // The overflow-hidden class (SidebarLayout.jsx:80) is what prevents the
  // wide logo/title from bleeding into the main content while collapsed.
  const classNames = await sidebar.evaluate(el => el.className)
  expect(classNames).toContain('overflow-hidden')

  // Restore the expanded state for any test that follows in this worker.
  await page.getByRole('button', { name: 'Perluas sidebar' }).click()
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox()).width))
    .toBe(256)

  expect(pageErrors).toHaveLength(0)
})
