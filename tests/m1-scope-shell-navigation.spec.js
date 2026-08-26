import { test, expect } from './fixtures.js'

const APP = 'http://localhost:5173'

async function seedStorage(page, collections = {}) {
  await page.addInitScript((collections) => {
    if (sessionStorage.getItem('__m1_shell_seed_done')) return
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('afterschola_v4')) localStorage.removeItem(key)
    }
    Object.entries(collections).forEach(([key, value]) => {
      localStorage.setItem(`afterschola_v4_${key}`, JSON.stringify(value))
    })
    sessionStorage.setItem('__m1_shell_seed_done', '1')
  }, collections)
}

function navButtons(page) {
  return page.getByRole('navigation').getByRole('button')
}

test.describe('M1.3 — scope shell navigation', () => {
  test('Trainer sees exactly the four allowed tabs', async ({ page, pageErrors }) => {
    // trainerId alone is sufficient for getRoleContext() to accept the
    // role (see store.js) — the trainer record itself isn't required
    // just to check which tabs render.
    await seedStorage(page, { ui: { role: 'trainer', trainerId: 'trainer-1' } })
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    const labels = await navButtons(page).allTextContents()
    expect(labels).toEqual(['Data Absensi', 'Riwayat Absensi', 'Data Siswa', 'Rekap Saya'])
    expect(pageErrors).toHaveLength(0)
  })

  test('Trainer landing on an admin-only saved tab is redirected to Rekap Saya', async ({ page, pageErrors }) => {
    await seedStorage(page, {
      ui: { role: 'trainer', trainerId: 'trainer-1', activeTab: 'keuangan' },
    })
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByRole('navigation').getByRole('button', { name: 'Rekap Saya', exact: true })).toBeVisible()
    const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}'))
    expect(ui.activeTab).toBe('rekap')
    expect(pageErrors).toHaveLength(0)
  })

  test('Admin Cabang lacks branch management and is redirected off a superadmin-only saved tab', async ({ page, pageErrors }) => {
    await seedStorage(page, {
      cabang: [{ id: 'cabang-1', nama: 'Cabang Satu', kode: 'PST' }],
      ui: { role: 'admin_cabang', cabangId: 'cabang-1', activeTab: 'cabang' },
    })
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    await expect(navButtons(page).filter({ hasText: 'Data Cabang' })).toHaveCount(0)
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true })).toBeVisible()
    const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}'))
    expect(ui.activeTab).toBe('overview')
    expect(pageErrors).toHaveLength(0)
  })

  test('Superadmin switches the Overview branch filter and sees scoped data change', async ({ page, pageErrors }) => {
    await seedStorage(page, { ui: { role: 'superadmin' } })
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    // Create a school (lands in the default seeded branch, kode PST — see
    // M7.1.1) and a second, empty branch, mirroring m71-verify.spec.js so
    // the records go through the app's own factories, not raw JSON.
    await page.getByRole('navigation').getByRole('button', { name: 'Data Sekolah', exact: true }).click()
    await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
    await page.locator('div:has(> label:text("Nama Sekolah")) input').first().fill('SDN Uji Cabang')
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()

    await page.getByRole('navigation').getByRole('button', { name: 'Data Cabang', exact: true }).click()
    await page.getByRole('button', { name: 'Tambah Cabang' }).click()
    await page.locator('div:has(> label:text("Nama Cabang")) input').first().fill('Cabang Kosong')
    await page.locator('div:has(> label:text("Kode Cabang")) input').first().fill('KSG')
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByText('Cabang Kosong', { exact: true })).toBeVisible()

    await page.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true }).click()

    // Default "Semua Cabang" includes the school just created.
    await expect(page.getByText('Belum ada data sekolah, siswa, atau trainer.')).toHaveCount(0)

    // Switching to the empty branch filters the school out entirely.
    await page.getByLabel('Cabang', { exact: true }).selectOption({ label: 'Cabang Kosong (KSG)' })
    await expect(page.getByText('Belum ada data sekolah, siswa, atau trainer.')).toBeVisible()

    // Switching back restores the unfiltered view.
    await page.getByLabel('Cabang', { exact: true }).selectOption({ label: 'Semua Cabang' })
    await expect(page.getByText('Belum ada data sekolah, siswa, atau trainer.')).toHaveCount(0)

    expect(pageErrors).toHaveLength(0)
  })
})