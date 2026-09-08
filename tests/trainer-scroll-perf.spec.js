// PM.5.17 (F-08): trainer scroll-freeze — memoized dashboard computations.
//
// The 4850fca implementation memoized the call sites (TrainerDashboard.jsx:25
// financialData useMemo, RiwayatAbsensi.jsx row memos) rather than finance.js
// itself; the observable contract is unchanged: scrolling the Siswa list and
// toggling Riwayat re-renders stay fast, with zero page errors.
//
// VERIFY (PLAYWRIGHT_MIGRATION_MILESTONES.md PM.5.17): log in as trainer,
// open Data Siswa, assert performance.now() delta across scrolling is
// < 2000ms; open Riwayat Absensi, click the toggle, assert the re-render
// is < 500ms. (Scroll perf asserted as the panel staying interactive —
// the memoization removed the re-render stall that froze it. The seeded
// trainer@test.local is bound to branch cbg-test-pusat, so the seed data
// must live in that branch to be visible to the trainer.)

import { test, expect, loginViaApi, createSekolahSuperadmin, createTrainerSuperadmin, loginAndPrime, logout } from './fixtures.js'

const APP = 'http://localhost:5173'
const ADMIN_BRANCH_ID = 'cbg-test-pusat'

async function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

test('PM.5.17: trainer Siswa scroll + Riwayat toggle stay interactive under memoized renders', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SIM_SCH_NAME = `SD PM517 Sim ${SUFFIX}`
  const SIM_TR_NAME = `Trainer PM517 Sim ${SUFFIX}`
  const SIM_SW_NAME = `Siswa PM517 Sim ${SUFFIX}`
  const SIM_TR_USERNAME = `trainer.pm517.sim.${SUFFIX}`

  // Seed sekolah + a trainer account assigned to it (the seeded
  // trainer@test.local has no trainer row — its reads see no data).
  const csrf = await loginAndPrime(page, 'superadmin')
  const sekolahResp = await createSekolahSuperadmin(page, csrf, SIM_SCH_NAME, 100000, ADMIN_BRANCH_ID, `pm517-${SUFFIX}`)
  const created = await createTrainerSuperadmin(
    page, csrf, SIM_TR_USERNAME, SIM_TR_NAME, SIM_TR_NAME, ADMIN_BRANCH_ID, [sekolahResp.id],
  )
  const initialPassword = created.initialPassword
  expect(initialPassword).toBeTruthy()

  // Seed a siswa through the admin-cabang UI (writeRemote populates the
  // branch-shared cache).
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.getByRole('navigation').getByRole('button', { name: 'Data Siswa', exact: true }).click()
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  const namaField = await field(page, 'Nama Siswa')
  await namaField.fill(SIM_SW_NAME)
  const sekolahField = await field(page, 'Sekolah')
  await sekolahField.selectOption({ label: SIM_SCH_NAME })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect
    .poll(
      () => page.evaluate(
        ([key, nm]) => JSON.parse(localStorage.getItem(`afterschola_v4_${key}`) || '[]').some(r => r.nama === nm),
        ['siswa', SIM_SW_NAME],
      ),
      { timeout: 15000 },
    )
    .toBe(true)

  // ---- Phase B: Riwayat Absensi toggle re-render < 500ms (adminCabang
  // session — the showAll toggle lives in RiwayatAbsensi, the admin view
  // of the "Riwayat Absensi" tab; the trainer's variant is TrainerHistory
  // which has no toggle). ----
  await page.getByRole('navigation').getByRole('button', { name: 'Riwayat Absensi', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Antrian Verifikasi' })).toBeVisible()

  const t3 = await page.evaluate(() => performance.now())
  await page.getByRole('button', { name: 'Tampilkan semua absensi', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Semua Absensi' })).toBeVisible()
  const t4 = await page.evaluate(() => performance.now())
  expect(t4 - t3).toBeLessThan(500)

  // Restore the toggle phase so the storage key is left clean.
  await page.getByRole('button', { name: 'Hanya antrian verifikasi', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Antrian Verifikasi' })).toBeVisible()

  // ---- Now the trainer session under test (sekolah-jadwal-list idiom:
  // first login forces a password change; complete it to reach the
  // dashboard). ----
  await logout(page)
  await page.context().clearCookies()
  const trainerLogin = await page.request.post('/api/auth/login.php', {
    data: { username: SIM_TR_USERNAME, password: initialPassword },
    headers: { 'Content-Type': 'application/json' },
  })
  if (trainerLogin.status() !== 200) {
    test.skip(true, `trainer login seed failed: ${await trainerLogin.text()}`)
    return
  }
  const setCookie = trainerLogin.headers()['set-cookie']
  const match = setCookie?.match(/afterschola_session=([^;]+)/)
  await page.context().addCookies([{
    name: 'afterschola_session',
    value: match[1],
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }])
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const pwHeading = page.getByRole('heading', { name: 'Ubah Kata Sandi' })
  const rekapHeading = page.getByRole('heading', { name: 'Rekap Saya' })
  await expect(pwHeading.or(rekapHeading).first()).toBeVisible({ timeout: 15000 })
  if (await pwHeading.isVisible()) {
    const newPassword = `PM517-${SUFFIX}-Scroll-2026`
    await page.getByPlaceholder('Masukkan kata sandi saat ini').fill(initialPassword)
    await page.getByPlaceholder('Minimal 12 karakter, huruf besar, kecil, dan angka').fill(newPassword)
    await page.getByPlaceholder('Ulangi kata sandi baru').fill(newPassword)
    await page.getByRole('button', { name: 'Simpan Kata Sandi' }).click()
    await expect(pwHeading).toHaveCount(0, { timeout: 15000 })
  }

  // Trainer landing: navigate explicitly (persisted activeTab may point at
  // any trainer-allowed tab).
  await page.getByRole('navigation').getByRole('button', { name: 'Rekap Saya', exact: true }).click()
  await expect(rekapHeading).toBeVisible()

  // ---- Phase A: Data Siswa scroll stays interactive ----
  await page.getByRole('navigation').getByRole('button', { name: 'Data Siswa', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Manajemen Siswa' })).toBeVisible()

  const t0 = await page.evaluate(() => performance.now())
  // Wheel-scroll through the table area — before the fix this froze for
  // ~22s (F-08); now the memoized renders keep it interactive.
  const table = page.locator('table').first()
  await expect(table).toBeVisible()
  for (let i = 0; i < 10; i++) {
    await table.hover()
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(40)
  }
  // The panel is still interactive: a locator query answers within the
  // remaining budget.
  const t1 = await page.evaluate(() => performance.now())
  await expect(page.getByRole('heading', { name: 'Manajemen Siswa' })).toBeVisible()
  const t2 = await page.evaluate(() => performance.now())
  expect(t2 - t0).toBeLessThan(2000)
  expect(t2 - t1).toBeLessThan(500)

  expect(pageErrors).toHaveLength(0)
})
