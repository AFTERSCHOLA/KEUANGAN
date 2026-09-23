import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// AUDIT_FOLLOWUP M-AF3.1 (revised) — school cabangId validation
//
// SUPERSEDED contract (pre-b8b57b7): any `cabangId` missing from the
// local `cabang` cache showed "Cabang tidak valid" with no network.
// That guard false-positived on stale caches, so HEAD removed it:
// validation is now server-authoritative.
//
// New contract (b8b57b7 + G1 follow-ups):
//   A. Superadmin with EMPTY cabangId -> client dialog
//      "Cabang wajib dipilih", no /api/sekolah.php POST.
//   B. Superadmin with UNKNOWN-but-present cabangId -> POST fires;
//      the server 422s ("cabangId tidak ditemukan").
//   C. admin_cabang never sends cabangId (server derives from
//      session) — covered by tests/multi-account-crud-sync.spec.js,
//      not repeated here.
//
// Both cases below reuse the documented fiber-injection path to
// force React form state (the devtools-override scenario), the same
// mechanism the original spec used.
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

// Walks up the React fiber tree from the modal's <select> to the
// SchoolList form state and applies `mutate` to it. Returns the
// { ok } verdict from inside the page.
async function forceFormCabangId(page, cabangId) {
  return page.evaluate((id) => {
    const dialog = document.querySelector('[role="dialog"]')
    if (!dialog) return { ok: false, reason: 'No dialog' }
    const select = dialog.querySelector('select')
    if (!select) return { ok: false, reason: 'No select' }
    const fiberKey = Object.keys(select).find(k => k.startsWith('__reactFiber$'))
    if (!fiberKey) return { ok: false, reason: 'No fiber on select' }
    let fiber = select[fiberKey]
    let attempts = 0
    let setForm = null
    while (fiber && attempts < 50) {
      attempts++
      let hook = fiber.memoizedState
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
    setForm((prev) => ({ ...prev, cabangId: id }))
    return { ok: true }
  }, cabangId)
}

async function openAddSchool(page, nama) {
  await page.getByRole('button', { name: 'Data Sekolah', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  // Fill nama first so the only remaining failure mode is cabangId.
  await page.getByRole('dialog').locator('input').first().fill(nama)
}

test('M-AF3.1r (A): empty cabangId as superadmin shows "Cabang wajib dipilih" and never hits /api/sekolah.php', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const sekolahPosts = []
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('/api/sekolah.php')) {
      sekolahPosts.push(req.url())
    }
  })

  await openAddSchool(page, 'SD AF3.1 Sim Kosong')

  const injected = await forceFormCabangId(page, '')
  expect(injected.ok).toBe(true)

  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await expect(page.getByText('Cabang wajib dipilih')).toBeVisible({ timeout: 5000 })

  await page.waitForTimeout(500)
  expect(sekolahPosts).toEqual([])

  expect(pageErrors).toHaveLength(0)
})

test('M-AF3.1r (B): unknown-but-present cabangId as superadmin reaches the server (422, no silent block)', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const sekolahPosts = []
  let serverStatus = null
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('/api/sekolah.php')) {
      sekolahPosts.push(req.url())
    }
  })
  page.on('response', async res => {
    if (res.request().method() === 'POST' && res.url().includes('/api/sekolah.php')) {
      serverStatus = res.status()
      // Drain the body so the handler never leaves a pending promise.
      await res.text().catch(() => {})
    }
  })

  await openAddSchool(page, 'SD AF3.1 Sim Bogus')

  const injected = await forceFormCabangId(page, 'cbg-FAKE-NOT-REAL')
  expect(injected.ok).toBe(true)

  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // The client must NOT early-return: the request reaches the server,
  // which rejects the unknown branch authoritatively.
  await expect.poll(() => sekolahPosts.length, { timeout: 10000 }).toBe(1)
  await expect.poll(() => serverStatus, { timeout: 10000 }).toBe(422)
  // The old silent-block copy must never appear for a present id.
  await expect(page.getByText('Cabang tidak valid')).toHaveCount(0)

  expect(pageErrors).toHaveLength(0)
})
