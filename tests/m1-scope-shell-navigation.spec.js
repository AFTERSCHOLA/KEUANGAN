import { test, expect, loginViaApi } from './fixtures.js'
import { execFileSync } from 'node:child_process'

const APP = 'http://localhost:5173'
const PHP = process.env.PHP_BIN || 'php'
const SEED_USERS = 'C:/Users/barak/AppData/Local/Temp/seed_users.php'
const CLEAR_THROTTLE = 'C:/Users/barak/AppData/Local/Temp/clear_throttle.php'

test.beforeAll(() => {
  // M-AUTH.5: ensure the test users exist (idempotent) and the login
  // throttle is clean. Without this, a previous test suite (e.g.
  // auth-login-page test 5) can leave the trainer account locked for
  // 15 minutes and block this spec.
  try {
    execFileSync(PHP, [SEED_USERS], { stdio: 'ignore' })
    execFileSync(PHP, [CLEAR_THROTTLE], { stdio: 'ignore' })
  } catch {}
})

function navButtons(page) {
  // Filter to a nav that contains a known app tab so we read the app's
  // own sidebar instead of any transient HMR overlay <nav>. The
  // "Overview" button is the broadest anchor (admin + superadmin).
  return page.getByRole('navigation').filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) }).getByRole('button')
}

test.describe('M1.3 — scope shell navigation (authenticated)', () => {
  test('Trainer sees exactly the four allowed tabs', async ({ page, pageErrors }) => {
    await loginViaApi(page, 'trainer')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    // Anchor on a trainer-only tab (Rekap Saya) to disambiguate from
    // any transient <nav> mounted by the dev server.
    await expect(page.getByRole('button', { name: 'Rekap Saya', exact: true })).toBeVisible()

    const trainerNav = page.getByRole('navigation').filter({ has: page.getByRole('button', { name: 'Rekap Saya', exact: true }) }).getByRole('button')
    const labels = await trainerNav.allTextContents()
    expect(labels).toEqual(['Data Absensi', 'Riwayat Absensi', 'Data Siswa', 'Rekap Saya'])
    expect(pageErrors).toHaveLength(0)
  })

  test('Trainer landing on an admin-only saved tab is redirected to Rekap Saya', async ({ page, pageErrors }) => {
    // Seed a forbidden activeTab so the redirect path can fire on the
    // first render; the trainer's own role still drives the redirect.
    await page.addInitScript(() => {
      const ui = JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}')
      localStorage.setItem('afterschola_v4_ui', JSON.stringify({ ...ui, activeTab: 'keuangan' }))
    })
    await loginViaApi(page, 'trainer')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByRole('navigation').getByRole('button', { name: 'Rekap Saya', exact: true })).toBeVisible()
    const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}'))
    expect(ui.activeTab).toBe('rekap')
    expect(pageErrors).toHaveLength(0)
  })

  test('Admin Cabang lacks branch management and is redirected off a superadmin-only saved tab', async ({ page, pageErrors }) => {
    await page.addInitScript(() => {
      const ui = JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}')
      localStorage.setItem('afterschola_v4_ui', JSON.stringify({ ...ui, activeTab: 'cabang' }))
    })
    await loginViaApi(page, 'adminCabang')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')

    await expect(navButtons(page).filter({ hasText: 'Data Cabang' })).toHaveCount(0)
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true })).toBeVisible()
    const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_ui') || '{}'))
    expect(ui.activeTab).toBe('overview')
    expect(pageErrors).toHaveLength(0)
  })

  test('Superadmin can see all admin tabs including Data Cabang', async ({ page, pageErrors }) => {
    await loginViaApi(page, 'superadmin')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    // Anchor the wait on the app's own nav by waiting for an
    // always-present tab (Data Cabang is superadmin-only).
    await expect(page.getByRole('button', { name: 'Data Cabang', exact: true })).toBeVisible()

    const labels = await navButtons(page).allTextContents()
    expect(labels).toContain('Data Cabang')
    expect(labels).toContain('Data Sekolah')
    expect(labels).toContain('Data Siswa')
    expect(pageErrors).toHaveLength(0)
  })
})
