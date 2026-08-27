import { test, expect } from './fixtures.js'

const APP = 'http://localhost:5173'

// Resets the v4 namespace and optionally seeds collections, once per test
// (guarded so a deliberate page.reload() inside a test doesn't re-wipe
// state gained through the UI — same pattern as m71-verify.spec.js).
async function seedStorage(page, collections = {}) {
  const payload = {
    // Skip migrateIds() entirely by default: M1.2 tests soft-login
    // behavior, not M7.1's migration/ID-prefix logic (already covered
    // by tests/m71-verify.spec.js). Without this, migrateIds() runs on
    // every boot after a storage reset and silently seeds a default
    // branch / rewrites seeded trainer IDs before RolePicker ever
    // renders. Individual tests can still override `settings` if a
    // scenario specifically needs migration to run.
    settings: { migrations: { m71BranchSchema: { completedAt: '2020-01-01T00:00:00.000Z', version: 1 } } },
    ...collections,
  }
  await page.addInitScript((payload) => {
    if (sessionStorage.getItem('__m1_seed_done')) return
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    Object.entries(payload).forEach(([key, value]) => {
      localStorage.setItem(`afterschola_v4_${key}`, JSON.stringify(value))
    })
    sessionStorage.setItem('__m1_seed_done', '1')
  }, payload)
}

function trainerSelect(page) {
  return page.locator('div:has(> label:text("Pilih Trainer Anda")) select')
}

test.describe('M1.2 — soft login render and persistence', () => {
  test('Superadmin: submits immediately and persists across reload', async ({ page, pageErrors }) => {
    await seedStorage(page)
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText('Pilih Peran Masuk')).toBeVisible()
    await page.getByRole('button', { name: 'Pilih peran Superadmin', exact: true }).click()
    const masuk = page.getByRole('button', { name: 'Masuk', exact: true })
    await expect(masuk).toBeEnabled()
    await masuk.click()

    await expect(page.getByText('Pilih Peran Masuk')).toHaveCount(0)
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Data Cabang', exact: true })).toBeVisible()

    let ui = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}'))
    expect(ui.role).toBe('superadmin')
    expect(ui.trainerId ?? null).toBeNull()
    expect(ui.cabangId ?? null).toBeNull()

    // Reload proves persistence: the picker must not reappear.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('Pilih Peran Masuk')).toHaveCount(0)
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Data Cabang', exact: true })).toBeVisible()
    expect(pageErrors).toHaveLength(0)
  })

  test('Admin Cabang: blocked without a branch, submits and persists with one', async ({ page, pageErrors }) => {
    await seedStorage(page, {
      cabang: [{ id: 'cabang-1', nama: 'Cabang Satu', kode: 'PST' }],
    })
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: 'Pilih peran Admin Cabang', exact: true }).click()
    const masuk = page.getByRole('button', { name: 'Masuk', exact: true })

    // Invalid submission stays blocked: no branch chosen yet.
    await expect(masuk).toBeDisabled()

    await page.getByLabel('Pilih Cabang Anda').selectOption({ label: 'Cabang Satu' })
    await expect(masuk).toBeEnabled()
    await masuk.click()

    await expect(page.getByText('Pilih Peran Masuk')).toHaveCount(0)
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Data Cabang', exact: true })).toHaveCount(0)

    let ui = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}'))
    expect(ui.role).toBe('admin_cabang')
    expect(ui.cabangId).toBe('cabang-1')
    expect(ui.trainerId ?? null).toBeNull()

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('Pilih Peran Masuk')).toHaveCount(0)
    expect(pageErrors).toHaveLength(0)
  })

  test('Admin Cabang: no branches seeded shows warning and stays blocked', async ({ page, pageErrors }) => {
    await seedStorage(page)
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: 'Pilih peran Admin Cabang', exact: true }).click()
    await expect(page.getByText('Belum ada data cabang. Buat dulu lewat akun Superadmin.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeDisabled()
    expect(pageErrors).toHaveLength(0)
  })

  test('Trainer: blocked without a selection, submits and persists with one', async ({ page, pageErrors }) => {
    await seedStorage(page, {
      trainer: [{ id: 'trainer-1', nama: 'Budi Trainer', sekolahIds: [] }],
    })
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: 'Pilih peran Trainer', exact: true }).click()
    const masuk = page.getByRole('button', { name: 'Masuk', exact: true })

    // Invalid submission stays blocked: no trainer chosen yet.
    await expect(masuk).toBeDisabled()

    await trainerSelect(page).selectOption({ label: 'Budi Trainer' })
    await expect(masuk).toBeEnabled()
    await masuk.click()

    await expect(page.getByText('Pilih Peran Masuk')).toHaveCount(0)
    // Trainer lands on the rekap tab per handleRoleSelected in App.jsx.
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Rekap Saya', exact: true })).toBeVisible()

    let ui = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}'))
    expect(ui.role).toBe('trainer')
    expect(ui.trainerId).toBe('trainer-1')
    expect(ui.activeTab).toBe('rekap')

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('Pilih Peran Masuk')).toHaveCount(0)
    expect(pageErrors).toHaveLength(0)
  })

  test('Trainer: no trainers seeded shows warning and stays blocked', async ({ page, pageErrors }) => {
    await seedStorage(page)
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: 'Pilih peran Trainer', exact: true }).click()
    await expect(page.getByText('Belum ada data trainer. Buat dulu lewat akun Admin Cabang.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeDisabled()
    expect(pageErrors).toHaveLength(0)
  })
})