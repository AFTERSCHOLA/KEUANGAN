import { test, expect, loginAsAdmin } from './fixtures.js'

// ============================================================
// KI-1 regression — Admin Cabang cannot create new trainers
// (documented in docs/PRODUCTION_MILESTONES.md "Known issues").
//
// Root cause: newTrainer() never set a `cabangId` field, so
// isWithinScope('trainer', record, ctx) in store.js rejected every
// brand-new trainer record (not in the collection yet, and
// record.cabangId was undefined) — upsert() silently no-op'd.
//
// Fix verified here:
//   1. constants.js newTrainer(cabangId, cabangKode) now stamps cabangId.
//   2. TrainerList.jsx openAdd() derives the branch from the logged-in
//      Admin Cabang's own getRoleContext().cabangId instead of cabang[0].
//
// This is also what unblocks the 5 downstream m52-verify.spec.js
// failures, whose seedBase() silently lost its seeded trainers before
// this fix (empty Trainer dropdown in the attendance form).
// ============================================================

const APP = 'http://localhost:5173'
const TRAINER_NAME = 'Trainer KI1 Test'

async function loginAdminCabang(page, branchIndex = 1) {
  await page.getByRole('button', { name: 'Pilih peran Admin' }).click()
  await page.getByLabel('Pilih Cabang Anda').selectOption({ index: branchIndex })
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
}

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__ki1_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__ki1_reset_done', '1')
  })
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

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

test('KI-1: Admin Cabang create trainer persists with matching cabangId (not silently dropped)', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await gotoApp(page)
  await loginAdminCabang(page, 1)

  // Capture which branch this Admin Cabang session is actually scoped to,
  // straight from the UI-state key store.js writes on login — this is the
  // cabangId the new trainer record MUST end up with.
  const loggedInCabangId = await page.evaluate(() => {
    const ui = JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}')
    return ui.cabangId || null
  })
  expect(loggedInCabangId).not.toBeNull()

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER_NAME)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // Pre-fix symptom: the modal would appear to save (no error/alert) but the
  // trainer never actually persisted. Assert it now DOES appear in the list.
  await expect(page.getByText(TRAINER_NAME)).toBeVisible()
  expect(pageErrors).toHaveLength(0)

  // Reload as Superadmin (unscoped) and inspect raw storage — proves the
  // record survived a refresh and carries the correct cabangId, not just
  // that it rendered transiently in this session's in-memory state.
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await loginAsAdmin(page)

  const trainers = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('afterschola_v4_trainer') || '[]')
  )
  const created = trainers.find(t => t.nama === TRAINER_NAME)
  expect(created).toBeTruthy()
  expect(created.cabangId).toBe(loggedInCabangId)

  expect(pageErrors).toHaveLength(0)
})

test('KI-1: created trainer is visible again to the same Admin Cabang (round-trip through isWithinScope)', async ({ page, pageErrors }) => {
  await resetStorage(page)
  await gotoApp(page)
  await loginAdminCabang(page, 1)

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER_NAME)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect(page.getByText(TRAINER_NAME)).toBeVisible()

  // Reload and log back in as the SAME Admin Cabang — readCached('trainer')
  // filters through isWithinScope() on every read, so this only stays
  // visible if the persisted record's cabangId truly matches this admin's
  // own branch (not just "some" cabangId that happened to render once).
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await loginAdminCabang(page, 1)
  await openTab(page, 'Data Trainer')
  await expect(page.getByText(TRAINER_NAME)).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})