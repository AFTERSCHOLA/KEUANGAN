import { test, expect, loginViaApi, createBranch, primeCsrf } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF5.2 — SchoolList Cabang dropdown subscribes to
// the store + cross-tab storage events.
//
// F-02 (manual audit #017, #018): the Sekolah form's Cabang <select>
// read a stale `cabang` snapshot because SchoolList only updated the
// list in response to same-tab UI actions. After this fix, deleting a
// Cabang — in this tab OR another tab — refreshes the Sekolah form's
// dropdown within 1 second without a full page reload.
//
// Strategy:
//   - Two pages in the same BrowserContext share localStorage, so
//     writes from one page fire the native `storage` event in the other.
//   - Tab A creates the Cabang via API, then opens Data Sekolah.
//   - Tab B opens Data Sekolah + the Sekolah form modal and asserts
//     the seeded Cabang is in the Cabang <select>.
//   - Tab A deletes the Cabang via /api/cabang.php AND re-reads it
//     through /api/read.php?entity=cabang, writing the result to
//     window.localStorage from inside tab A's document (so the cross-
//     tab `storage` event actually fires in tab B).
//   - Tab B's SchoolList.jsx `useEffect` listens to `storage` events
//     and re-reads the cache, so the Cabang <select> must drop the
//     deleted entry within 1 second.
//
// NOTE on the tab-A API call: `page.request` runs in a detached
// APIRequestContext that does NOT share window.localStorage with the
// tab, so it cannot fire the cross-tab `storage` event. We drive the
// delete + cache re-read through `page.evaluate(fetch)` so the
// localStorage write happens inside tab A's document and the storage
// event lands in tab B.
// ============================================================

const APP = 'http://localhost:5173'
const SUFFIX = String(Date.now()).slice(-6)
const CABANG_KODE = `AF5S${SUFFIX}`
const CABANG_NAMA = `Cabang AF5.2 Sim ${SUFFIX}`
const CABANG_ID = `cbg-${CABANG_KODE}-${SUFFIX}`

test('M-AF5.2: deleting a Cabang in tab A removes it from tab B Sekolah form dropdown within 1s', async ({ browser }) => {
  const context = await browser.newContext()
  const tabA = await context.newPage()
  const tabB = await context.newPage()
  const pageErrorsA = []
  const pageErrorsB = []
  tabA.on('pageerror', e => pageErrorsA.push(e.message))
  tabB.on('pageerror', e => pageErrorsB.push(e.message))

  try {
    // ---- Seed: log in as superadmin via tab A and create the Cabang.
    await loginViaApi(tabA, 'superadmin')
    const csrf = await primeCsrf(tabA)
    await createBranch(tabA, csrf, CABANG_KODE, CABANG_NAMA, SUFFIX)

    // ---- Tab A navigates to Data Sekolah so its SchoolList mounts and
    // subscribes to the store + storage events.
    await tabA.goto(APP)
    await tabA.waitForLoadState('domcontentloaded')
    await tabA.getByRole('button', { name: 'Data Sekolah', exact: true }).click()
    await expect(tabA.getByRole('heading', { name: 'Manajemen Sekolah Mitra' })).toBeVisible({ timeout: 10000 })

    // ---- Tab B inherits the session cookie from the shared context
    // and opens Data Sekolah + the Sekolah form modal so its Cabang
    // <select> renders.
    await tabB.goto(APP)
    await tabB.waitForLoadState('domcontentloaded')
    await tabB.getByRole('button', { name: 'Data Sekolah', exact: true }).click()
    await expect(tabB.getByRole('heading', { name: 'Manajemen Sekolah Mitra' })).toBeVisible({ timeout: 10000 })

    await tabB.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
    const tabBDialog = tabB.getByRole('dialog')
    await expect(tabBDialog).toBeVisible()

    const cabangSelect = tabBDialog.locator('div:has(> label:text("Cabang")) select').first()
    await expect(cabangSelect).toBeVisible()

    // Confirm the seeded Cabang is initially present in tab B's dropdown.
    await expect(async () => {
      const values = await cabangSelect.evaluate(el =>
        Array.from(el.options).map(o => ({ value: o.value, text: o.textContent }))
      )
      const found = values.find(o => o.value === CABANG_ID)
      if (!found) throw new Error(`CABANG_ID=${CABANG_ID} not in tab B dropdown: ${JSON.stringify(values)}`)
    }).toPass({ timeout: 5000 })

    // ---- Delete the Cabang and re-read the list inside tab A's document
    // so the localStorage write fires the cross-tab `storage` event.
    const deleteResult = await tabA.evaluate(async ({ csrf, cabangId }) => {
      const del = await fetch('/api/cabang.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ id: cabangId, action: 'delete' }),
      })
      await del.json().catch(() => ({}))
      const ref = await fetch('/api/read.php?entity=cabang', {
        method: 'GET',
        headers: { 'X-CSRF-Token': csrf },
      })
      const refBody = await ref.json()
      // Mirror what store.js does on a successful read so the
      // localStorage write happens inside tab A's document and the
      // cross-tab `storage` event fires in tab B.
      const list = Array.isArray(refBody) ? refBody
        : (refBody && Array.isArray(refBody.cabang)) ? refBody.cabang
        : null
      if (list) localStorage.setItem('afterschola_v4_cabang', JSON.stringify(list))
      return { delStatus: del.status, idsAfter: list ? list.map(c => c.id) : null }
    }, { csrf, cabangId: CABANG_ID })
    expect(deleteResult.delStatus).toBe(200)
    expect(deleteResult.idsAfter.includes(CABANG_ID)).toBe(false)

    // ---- Within 1 second of the deletion, tab B's Cabang dropdown must
    // no longer list the deleted Cabang. 1500ms leaves a margin for the
    // storage event to land and React to commit the state update.
    await expect(async () => {
      const values = await cabangSelect.evaluate(el =>
        Array.from(el.options).map(o => o.value)
      )
      if (values.includes(CABANG_ID)) {
        throw new Error(`CABANG_ID=${CABANG_ID} still in dropdown: ${JSON.stringify(values)}`)
      }
    }).toPass({ timeout: 1500 })

    // The refresh must leave at least one branch option behind (it
    // didn't wipe the list — it only removed the deleted one).
    const finalValues = await cabangSelect.evaluate(el =>
      Array.from(el.options).map(o => o.value)
    )
    expect(finalValues.length).toBeGreaterThan(0)

    expect(pageErrorsA).toHaveLength(0)
    expect(pageErrorsB).toHaveLength(0)
  } finally {
    // Best-effort cleanup: delete the seeded branch if a retry left it
    // behind. The test deletes the branch before this point, so this
    // is only a safety net for unexpected early exits.
    try {
      const csrfCleanup = await primeCsrf(tabA)
      await tabA.evaluate(async ({ csrf, cabangId }) => {
        await fetch('/api/cabang.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ id: cabangId, action: 'delete' }),
        }).catch(() => {})
      }, { csrf: csrfCleanup, cabangId: CABANG_ID })
    } catch { /* ignore — cleanup is best-effort */ }
    await context.close()
  }
})
