import { test, expect, loginAndPrime, createTrainerSuperadmin, logout } from './fixtures.js'

// ============================================================
// A2.5-JADWAL-1 — Sekolah.jadwal: day-picker + Add More (F-18, D-18 = B)
//
// VERIFY (per SCOPE_EXPANSION_MILESTONES.md A2.5-JADWAL-1, extended with
// TEAM_FEEDBACK G3.2 ranges):
// opens Tambah Sekolah as superadmin, adds 2 jadwal range entries
// (Senin 14:00–15:00, Rabu 15:00–16:00), saves, refreshes, asserts the
// form re-hydrates with start + end entries; opens the app as a trainer
// assigned to that school, asserts the Rekap Saya page shows the school
// on the matching day with the en-dash range.
//
// Date-awareness (testing taste): the day the trainer sees the
// school is derived at runtime — the seeded jadwalList always
// includes today's Indonesian day name, so the Rekap Saya leg
// stays green year-round. The fixed Senin/Rabu entries from the
// VERIFY line are also added to exercise the multi-entry UI.
// ============================================================

const APP = 'http://localhost:5173'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const ALL_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

// Boot-sync race guard (same as sekolah-foto-picker.spec.js): the
// sekolah form must not open before the server cabang cache lands.
async function waitForServerCabang(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_cabang') || '[]').some((c) => c.id === 'cbg-test-pusat')),
      { message: 'menunggu cabang server (cbg-test-pusat) muncul di cache lokal', timeout: 15000 },
    )
    .toBe(true)
}

// Boot-sync race guard for the trainer leg: hydrateServerData() may not
// have finished pulling `sekolah` into localStorage yet even after the
// "Rekap Saya" heading is visible. Poll the cache directly instead of
// asserting on the DOM immediately.
async function waitForSekolahInCache(page, nama) {
  await expect
    .poll(
      () =>
        page.evaluate(
          (n) => JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]').some((s) => s.nama === n),
          nama,
        ),
      { message: `menunggu sekolah "${nama}" muncul di cache trainer setelah hydrateServerData()`, timeout: 15000 },
    )
    .toBe(true)
}

test('A2.5-JADWAL-1: day-picker adds 2 entries, re-hydrates, and surfaces on Rekap Saya', async ({ page, pageErrors }) => {
  const run = String(Date.now()).slice(-6)
  const todayName = DAY_NAMES[new Date().getDay()]
  const sekolahNama = `SD A25 Jadwal Sim ${run}`
  const trainerNama = `Trainer A25 Jadwal Sim ${run}`

  // ---- Leg 1: superadmin creates the sekolah through the UI with
  // 2 jadwal entries (Senin 14:00, Rabu 15:00) plus today's day so
  // the trainer leg finds it scheduled today.
  const csrf = await loginAndPrime(page, 'superadmin')
  await gotoApp(page)
  await waitForServerCabang(page)
  await openTab(page, 'Data Sekolah')

  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()

  await modal.locator('div:has(> label:text("Nama Sekolah")) input').fill(sekolahNama)

  // The day-picker starts empty ("Belum diatur"); add the two pinned
  // entries from the VERIFY line.
  await modal.getByRole('button', { name: '+ Tambah Jadwal' }).click()
  await modal.getByRole('button', { name: '+ Tambah Jadwal' }).click()

  const entryRows = modal.locator('div.space-y-2 > .flex.gap-2.items-center')
  await expect(entryRows).toHaveCount(2)

  // Entry 0: Senin 14:00–15:00 (the newJadwalEntry default is already
  // Senin 14:00–15:00; set the start explicitly to prove the control
  // works, leave the default end in place).
  await entryRows.nth(0).getByLabel('Jam mulai').fill('14:00')
  await expect(entryRows.nth(0).getByLabel('Jam selesai')).toHaveValue('15:00')
  // Entry 1: Rabu 15:00–16:00. The end MUST be set explicitly: the row
  // default end (15:00) is not after start 15:00, and the G3.2 guard
  // blocks saving with end <= start.
  await entryRows.nth(1).locator('select').selectOption('Rabu')
  await entryRows.nth(1).getByLabel('Jam mulai').fill('15:00')
  await entryRows.nth(1).getByLabel('Jam selesai').fill('16:00')

  // If today is neither Senin nor Rabu, add a third entry for today
  // so the Rekap Saya leg is deterministic.
  if (todayName !== 'Senin' && todayName !== 'Rabu') {
    await modal.getByRole('button', { name: '+ Tambah Jadwal' }).click()
    await entryRows.nth(2).locator('select').selectOption(todayName)
    await entryRows.nth(2).getByLabel('Jam mulai').fill('16:00')
    await entryRows.nth(2).getByLabel('Jam selesai').fill('17:00')
  }

  await modal.getByRole('button', { name: 'Simpan' }).click()
  await expect(modal).toBeHidden({ timeout: 15000 })

  // The saved record carries jadwalList (not just the legacy string).
  const savedJadwalList = await page.evaluate((nama) => {
    const rows = JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]')
    const row = rows.find((s) => s.nama === nama)
    return row ? row.jadwalList : null
  }, sekolahNama)
  expect(savedJadwalList).toBeTruthy()
  expect(savedJadwalList.some((e) => e.dayOfWeek === 'Senin' && e.time === '14:00' && e.endTime === '15:00')).toBe(true)
  expect(savedJadwalList.some((e) => e.dayOfWeek === 'Rabu' && e.time === '15:00' && e.endTime === '16:00')).toBe(true)

  const sekolahId = await page.evaluate((nama) => {
    const rows = JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]')
    const row = rows.find((s) => s.nama === nama)
    return row ? row.id : null
  }, sekolahNama)
  expect(sekolahId).toBeTruthy()

  // ---- Refresh + re-hydrate: open Edit and assert the form
  // re-populates with the same jadwal entries.
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await openTab(page, 'Data Sekolah')

  const card = page.locator('div').filter({ hasText: new RegExp(sekolahNama) }).filter({ has: page.getByRole('button', { name: 'Edit sekolah' }) }).last()
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.getByRole('button', { name: 'Edit sekolah' }).click()
  const editModal = page.getByRole('dialog')
  await expect(editModal).toBeVisible()

  const editRows = editModal.locator('div.space-y-2 > .flex.gap-2.items-center')
  const expectedCount = todayName === 'Senin' || todayName === 'Rabu' ? 2 : 3
  await expect(editRows).toHaveCount(expectedCount, { timeout: 15000 })

  const hydrated = await editRows.evaluateAll((rows) =>
    rows.map((r) => ({
      day: r.querySelector('select')?.value,
      start: r.querySelector('input[aria-label="Jam mulai"]')?.value,
      end: r.querySelector('input[aria-label="Jam selesai"]')?.value,
    })),
  )
  expect(hydrated).toContainEqual({ day: 'Senin', start: '14:00', end: '15:00' })
  expect(hydrated).toContainEqual({ day: 'Rabu', start: '15:00', end: '16:00' })
  await editModal.getByRole('button', { name: 'Batal' }).click()
  await expect(editModal).toBeHidden()

  // ---- Leg 2: seed a trainer assigned to this sekolah via the API
  // (superadmin cannot create trainers through the UI — privilege
  // matrix). The create response returns the one-time initialPassword,
  // used below to log in as this trainer. Username follows the
  // server policy (3-64 chars, letters/digits/_/./- only — no @).
  //
  // Use the sekolah's ACTUAL cabangId, not a hardcoded value — the UI
  // form's default/first cabang option is not guaranteed to be
  // cbg-test-pusat. Root-caused 2026-09-08: a hardcoded cbg-test-pusat
  // here silently broke the server's reverse-link (server/api/users.php
  // does SELECT ... WHERE id = :id AND cabang_id = :cab, which never
  // matches on a wrong cabangId and just `continue`s with no error),
  // leaving sekolah.trainerIds permanently empty and the trainer never
  // seeing this school — not a hydration timing issue as first suspected.
  const cabangId = await page.evaluate((nama) => {
    const rows = JSON.parse(localStorage.getItem('afterschola_v4_sekolah') || '[]')
    return rows.find((s) => s.nama === nama)?.cabangId
  }, sekolahNama)
  expect(cabangId).toBeTruthy()

  const username = `trainer.a25.sim.${run}`
  const created = await createTrainerSuperadmin(page, csrf, username, trainerNama, trainerNama, cabangId, [sekolahId])
  const initialPassword = created.initialPassword
  expect(initialPassword).toBeTruthy()

  // ---- Leg 3: log in as the new trainer and check Rekap Saya.
  await logout(page)
  await page.context().clearCookies()
  const trainerLogin = await page.request.post('/api/auth/login.php', {
    data: { username, password: initialPassword },
    headers: { 'Content-Type': 'application/json' },
  })
  const trainerBody = await trainerLogin.json()
  if (trainerLogin.status() !== 200) {
    test.skip(true, `trainer login seed failed: ${JSON.stringify(trainerBody)}`)
    return
  }
  const setCookie = trainerLogin.headers()['set-cookie']
  const match = setCookie?.match(/afterschola_session=([^;]+)/)
  if (match) {
    await page.context().addCookies([{
      name: 'afterschola_session',
      value: match[1],
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    }])
  }

  await gotoApp(page)

  // A freshly-created trainer carries must_change_password=1, so the
  // app gates on "Ubah Kata Sandi" before any dashboard tab. The
  // gate page renders only AFTER the async bootstrapAuth() round-trip
  // completes — a bare count() races it and can read 0 while the gate
  // is still loading (caught via trace: the first queryCount read 0,
  // the block was skipped, and the gate appeared one paint later).
  // Wait for either outcome first: the gate heading OR the trainer
  // dashboard's "Rekap Saya" (in case the session already cleared).
  const pwHeading = page.getByRole('heading', { name: 'Ubah Kata Sandi' })
  const rekapHeading = page.getByRole('heading', { name: 'Rekap Saya' })
  await expect(pwHeading.or(rekapHeading).first()).toBeVisible({ timeout: 15000 })

  if (await pwHeading.isVisible()) {
    const newPassword = `A25-${run}-Jadwal-2026`
    await page.getByPlaceholder('Masukkan kata sandi saat ini').fill(initialPassword)
    await page.getByPlaceholder('Minimal 12 karakter, huruf besar, kecil, dan angka').fill(newPassword)
    await page.getByPlaceholder('Ulangi kata sandi baru').fill(newPassword)
    await page.getByRole('button', { name: 'Simpan Kata Sandi' }).click()
    // changePassword() flips currentUser via subscribeAuth and App
    // re-routes to the dashboard automatically — the heading must go.
    await expect(pwHeading).toHaveCount(0, { timeout: 15000 })
  }

  // Trainer lands on Rekap Saya. The school must appear as scheduled
  // today (jadwalList includes today's day name).
  //
  // Boot-sync race: right after login, hydrateServerData() may not have
  // finished pulling `sekolah` into localStorage yet even though the
  // "Rekap Saya" heading is already visible. Wait for the sekolah cache
  // itself before asserting on its rendered name.
  const main = page.locator('main').first()
  await expect(main.getByText('Rekap Saya')).toBeVisible({ timeout: 15000 })
  await waitForSekolahInCache(page, sekolahNama)
  await expect(main.getByText(sekolahNama)).toBeVisible({ timeout: 15000 })
  await expect(main.getByText('Belum Diisi').or(main.getByText('Selesai')).first()).toBeVisible()

  // The schedule line renders the formatted jadwalList range (e.g.
  // "Senin 14:00–15:00, Rabu 15:00–16:00" — formatJadwalList join).
  await expect(main.getByText(/Senin 14:00–15:00/)).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})