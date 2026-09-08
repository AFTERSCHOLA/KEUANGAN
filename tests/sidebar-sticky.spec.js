// PM.5.16 (F-15): desktop sidebar is sticky (top-0 self-start) and does
// not stretch with page content; the mobile drawer still opens as an overlay.
//
// VERIFY (PLAYWRIGHT_MIGRATION_MILESTONES.md PM.5.16): open the app as
// superadmin, scroll a long page, assert the sidebar's top edge stays at
// viewport y=0, then assert the mobile drawer (375px) still opens.

import { test, expect, loginViaApi } from './fixtures.js'

const APP = 'http://localhost:5173'

test('PM.5.16: desktop sidebar sticks at y=0 while scrolling; mobile drawer still opens', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const sidebar = page.getByRole('complementary')
  await expect(sidebar).toBeVisible()

  // Sticky classes live on the <aside> (SidebarLayout.jsx:80), not the
  // inner <nav> element — read the complementary landmark's container.
  const aside = page.getByRole('complementary')
  await expect(aside).toBeVisible()
  const classNames = await aside.evaluate(el => el.className)
  expect(classNames).toContain('sticky')
  expect(classNames).toContain('top-0')
  expect(classNames).toContain('self-start')

  // Scroll the long Overview page…
  await page.evaluate(() => window.scrollTo(0, 2000))
  await page.waitForTimeout(300)

  // …and the sidebar's top edge is still at viewport y=0 (sticky), not
  // scrolled away.
  const box = await aside.boundingBox()
  expect(box).not.toBeNull()
  expect(box.y).toBeLessThanOrEqual(1)

  // The sidebar does not stretch with content: its height is the viewport
  // height (h-screen), not document height.
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  expect(box.height).toBeLessThan(docHeight)

  // ---- Mobile drawer (375px) still opens as an overlay ----
  await page.setViewportSize({ width: 375, height: 720 })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Buka menu' }).click()
  await expect(aside).toBeVisible()
  // Drawer closes via its dedicated close control (aria-label "Tutup menu").
  await page.getByRole('button', { name: 'Tutup menu' }).click()
  await expect(page.getByRole('button', { name: 'Tutup menu' })).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})
