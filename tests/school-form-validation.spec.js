import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF3.1 — pre-submit cabangId sanity check
//
// The form's <select> only renders real branch options, and the
// select's onChange handler always maps the chosen value back to a
// real branch (or cabang[0] as a fallback). The "devtools override"
// scenario the milestone describes means directly mutating the
// React form state — something a determined user (or a stale
// `cabang` cache after a branch delete) can produce. The cleanest
// way to exercise the guard from a Playwright spec is to walk the
// React fiber attached to the rendered <select> and walk UP the
// fiber tree to the parent SchoolList component, then dispatch a
// synthetic onChange that lands an invalid id in form.cabangId.
//
// M-AF3.1 contract:
//   1. As superadmin, open the Add School modal.
//   2. Force form.cabangId to an id that is NOT in the cached
//      `cabang` list (the devtools-override scenario).
//   3. Click Simpan.
//   4. Assert the inline alert "Cabang tidak valid" appears AND
//      no /api/sekolah.php POST was fired.
// ============================================================

const APP = 'http://localhost:5173'

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__af31_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__af31_reset_done', '1')
  })
}

test('M-AF3.1: invalid cabangId via devtools override shows "Cabang tidak valid" and never hits /api/sekolah.php', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // Network sentinel — record any POST to /api/sekolah.php so we
  // can prove the early-return happened before writeRemote.
  const sekolahPosts = []
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('/api/sekolah.php')) {
      sekolahPosts.push(req.url())
    }
  })

  await page.getByRole('button', { name: 'Data Sekolah', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()

  // Fill nama first so the only remaining failure mode is the
  // cabangId check (otherwise the "Nama sekolah tidak boleh
  // kosong" branch fires first).
  await page.getByRole('dialog').locator('input').first().fill('SD AF3.1 Invalid Cabang')

  // Devtools-override scenario: walk up the React fiber tree
  // from the modal's <select> to the SchoolList component, find
  // its `useState` for the form, and call the setter with a
  // payload that contains an invalid cabangId. The fiber walk
  // lands in the SchoolList's hooks queue (where `form` lives),
  // and we directly invoke the dispatcher, which IS the same
  // mechanism a developer-tools state edit would use.
  //
  // This is a brittle but documented test-only path. The
  // alternative — exposing a window hook in production code just
  // for this test — would be more invasive than the brittleness
  // (taste #33: reactive test-data hygiene > code-level quotas).
  const injected = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (!dialog) return { ok: false, reason: 'No dialog' }
    const select = dialog.querySelector('select')
    if (!select) return { ok: false, reason: 'No select' }
    const fiberKey = Object.keys(select).find(k => k.startsWith('__reactFiber$'))
    if (!fiberKey) return { ok: false, reason: 'No fiber on select' }
    let fiber = select[fiberKey]
    // Walk up to find a component that owns a `setForm` dispatcher
    // (SchoolList or its memoized wrapper). The hooks queue lives
    // on `fiber.memoizedState` as a singly-linked list.
    let attempts = 0
    let setForm = null
    while (fiber && attempts < 50) {
      attempts++
      const state = fiber.memoizedState
      // Scan the hooks chain for a dispatcher pair. React's
      // useState stores `[value, setter]` in `state.queue.dispatch`
      // and `state.memoizedState` holds the value. We need the
      // pair where the current value is an object (the `form`).
      let hook = state
      while (hook) {
        if (hook.queue && typeof hook.queue.dispatch === 'function' && hook.memoizedState && typeof hook.memoizedState === 'object' && hook.memoizedState !== null && 'cabangId' in hook.memoizedState) {
          setForm = hook.queue.dispatch
          break
        }
        hook = hook.next
      }
      if (setForm) break
      fiber = fiber.return
    }
    if (!setForm) return { ok: false, reason: 'No setForm dispatcher found in fiber tree' }
    setForm((prev) => ({ ...prev, cabangId: 'cbg-FAKE-NOT-REAL' }))
    return { ok: true }
  })
  expect(injected.ok).toBe(true)

  // Submit. The early-return guard must fire.
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // The AlertDialog body carries the exact copy the plan pins.
  await expect(page.getByText('Cabang tidak valid')).toBeVisible({ timeout: 5000 })

  // No /api/sekolah.php POST may have been issued. Give any
  // in-flight network a brief moment to settle.
  await page.waitForTimeout(500)
  expect(sekolahPosts).toEqual([])

  expect(pageErrors).toHaveLength(0)
})
