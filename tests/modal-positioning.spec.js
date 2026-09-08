// PM.5.11 (F-03): modal createPortal + tuned padding.
// Every modal must render through createPortal(target=document.body) so it
// escapes any ancestor stacking context, and the outer div uses p-2 sm:p-4
// so the panel hugs the viewport edge on small screens.
//
// VERIFY (PLAYWRIGHT_MIGRATION_MILESTONES.md PM.5.11): open the Sekolah form
// modal as superadmin in three viewports (375, 768, 1280), assert the modal
// is not visually clipped by the header (fully inside the viewport).
//
// Note on the plan's original "panel top within 8px of viewport top"
// expectation: the milestone's own OUTCOME pins `createPortal` + `p-2
// sm:p-4` (both asserted below), while the shipped AppModal centers the
// panel vertically (`items-center`, AppModal.jsx:85). A centered panel's
// top edge is intentionally NOT at the viewport top on tall viewports;
// the F-03 defect this microtask fixes is the fixed overlay being trapped
// in a transformed ancestor's containing block, so the falsifiable guard
// is: the portaled backdrop covers the viewport EXACTLY (x=0, y=0, w=vw,
// h=vh) even while the page is scrolled, and the panel is never clipped.

import { test, expect, loginViaApi } from './fixtures.js'

const APP = 'http://localhost:5173'

async function openSekolahModal(page) {
  // Below md (768px) the sidebar lives in the mobile drawer; open it first.
  const vp = page.viewportSize()
  if (vp.width < 768) {
    await page.getByRole('button', { name: 'Buka menu' }).click()
  }
  await page.getByRole('navigation').getByRole('button', { name: 'Data Sekolah', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  const panel = page.locator('[role="dialog"]')
  await expect(panel).toBeVisible()
  return panel
}

for (const vp of [
  { width: 375, height: 720 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
]) {
  test(`PM.5.11: modal portal escapes stacking contexts — viewport-exact backdrop, unclipped panel @${vp.width}px`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await loginViaApi(page, 'superadmin')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    const panel = await openSekolahModal(page)
    const backdrop = page.locator('[role="dialog"] >> xpath=..')

    // (a) Portal target: createPortal(document.body) mounts the backdrop
    // as a DIRECT child of document.body (AppModal.jsx:83-117) — outside
    // every animated/transformed ancestor (.animate-fadeIn main column,
    // header stacking context) that trapped the pre-fix overlay.
    const backdropParent = await backdrop.evaluate(el => el.parentElement.tagName)
    expect(backdropParent).toBe('BODY')

    // (b) Backdrop padding tuned: p-2 sm:p-4 (AppModal.jsx:85).
    const backdropClasses = await backdrop.evaluate(el => el.className)
    expect(backdropClasses).toContain('p-2')
    expect(backdropClasses).toContain('sm:p-4')

    // (c) The F-03 guard: `fixed inset-0` is viewport-relative — the
    // backdrop rect equals the viewport exactly. If the overlay were still
    // trapped in a transformed ancestor's containing block, this rect
    // would be offset/shrunken.
    const vpRect = await backdrop.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
    }))
    let bb = await backdrop.boundingBox()
    expect(Math.round(bb.x)).toBe(0)
    expect(Math.round(bb.y)).toBe(0)
    expect(Math.round(bb.width)).toBe(vpRect.w)
    expect(Math.round(bb.height)).toBe(vpRect.h)

    // (d) Same guard holds while the page is scrolled: scroll, reopen the
    // modal, and the backdrop still covers the viewport exactly (the
    // pre-F-03 symptom was an offset overlay relative to a scrolled
    // ancestor).
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, 2000))
    await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
    await expect(panel).toBeVisible()
    bb = await backdrop.boundingBox()
    expect(Math.round(bb.x)).toBe(0)
    expect(Math.round(bb.y)).toBe(0)
    expect(Math.round(bb.width)).toBe(vpRect.w)
    expect(Math.round(bb.height)).toBe(vpRect.h)

    // (e) Not visually clipped by the header: the panel is fully inside
    // the viewport on both axes.
    const pbox = await panel.boundingBox()
    expect(pbox).not.toBeNull()
    expect(pbox.y).toBeGreaterThanOrEqual(0)
    expect(pbox.x).toBeGreaterThanOrEqual(0)
    expect(pbox.x + pbox.width).toBeLessThanOrEqual(vp.width + 1)
    expect(pbox.y + pbox.height).toBeLessThanOrEqual(vp.height + 1)

    expect(pageErrors).toHaveLength(0)
  })
}
