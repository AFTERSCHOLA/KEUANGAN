import { test, expect, loginViaApi, primeCsrf, readEntity, TEST_USERS } from './fixtures.js'
import { request as playwrightRequest } from '@playwright/test'

// T2.D.3 (F-T2-12; D-T2-8; R-T2-1, R-T2-2, R-T2-5, R-T2-7, R-T2-8) —
// prove cover save-vs-retrieve, fix the failing side only.
//
// Current: cover rows creatable, but the schedule must show
//   `Trainer B Mon 09:00 Cover` replacing Trainer A (user §F P1.3).
// Expected: (a) server holds a coverOf row on Trainer B (API read),
//   AND (b) the timetable on the cover tanggal shows `B (Pengganti)`.
// Rule: proof-first — write this split BEFORE any code; fix ONLY the
//   failing side (save path OR retrieve path, never both).
// Result: red side isolated below; green side untouched.
//
// Split design (independent probes):
//   Test 1 SAVE probe: origin seeded via API -> cover created via the
//     Penugasan UI (Buat Pengganti) -> API read asserts the coverOf row
//     landed on Trainer B. RED here = save path fails.
//   Test 2 RETRIEVE probe: origin + cover seeded via API (UI save
//     bypassed entirely) -> Jadwal Penugasan on the cover tanggal must
//     show `B (Pengganti)`. RED here = retrieve path fails.
//
// Slots ride today's weekday (PSB1 pattern) so the cover tanggal is
// always aligned with the scoped hari — no hardcoded dates, green
// year-round. Cover tanggal = today, matching the UI default.
//
// VERIFY: npx playwright test tests/penugasan-cover-schedule.spec.js --workers=1

const APP = 'http://localhost:5173'
const CABANG_ID = 'cbg-test-pusat'
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function todayParts() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    todayName: DAY_NAMES[now.getDay()],
  }
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

// Seeds: school (1 today-09:00 slot) + trainers A/B + scoped origin row
// on A. Returns { sekolahId, aId, bId, originId, api, hdrs }.
async function seedOrigin(page, suffix) {
  const { today, todayName } = todayParts()
  const schoolName = `SD T2D3 ${suffix}`
  const aNama = `T2D3 TrainerA ${suffix}`
  const bNama = `T2D3 TrainerB ${suffix}`
  const aId = `trn-T2D3A-${suffix}`
  const bId = `trn-T2D3B-${suffix}`
  const originId = `pgs-T2D3-o-${suffix}`

  const csrf0 = await loginAndPrimeSuperadmin(page)
  const schRes = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf0 },
    data: {
      id: `sch-T2D3-${Date.now()}-${suffix}`, nama: schoolName, spp: 500000,
      cabangId: CABANG_ID, action: 'create',
      jadwalList: [{ dayOfWeek: todayName, time: '09:00', endTime: '10:00' }],
    },
  })
  if (!schRes.ok()) throw new Error(`seed sekolah: ${await schRes.text()}`)
  const sekolahId = (await schRes.json()).id

  const api = await playwrightRequest.newContext({ baseURL: 'http://localhost:5173' })
  const login = await api.post('/api/auth/login.php', {
    data: { username: TEST_USERS.adminCabang.username, password: TEST_USERS.adminCabang.password },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!login.ok()) throw new Error('adminCabang login failed')
  const m = (login.headers()['set-cookie'] || '').match(/afterschola_session=([^;]+)/)
  const ck = m ? `afterschola_session=${m[1]}` : ''
  const csrfR = await api.get('/api/auth/csrf.php', { headers: ck ? { Cookie: ck } : {} })
  const csrfA = (await csrfR.json()).csrfToken
  const hdrs = { 'X-CSRF-Token': csrfA, 'Content-Type': 'application/json' }
  if (ck) hdrs.Cookie = ck

  for (const [id, nama] of [[aId, aNama], [bId, bNama]]) {
    const mk = await api.post('/api/trainer.php', {
      headers: hdrs,
      data: { id, nama, honor: 50000, tipePengajar: 'instruktur', sekolahIds: [], action: 'create' },
    })
    if (!mk.ok()) throw new Error(`create trainer ${nama}: ${await mk.text()}`)
  }
  const originRow = {
    id: originId, sekolahId, trainerId: aId, asistenId: null, cabangId: CABANG_ID,
    periodeMulai: '2020-01-01', periodeSelesai: null, aktif: true,
    hari: todayName, jamMulai: '09:00', jamSelesai: '10:00',
  }
  const listRes = await api.get('/api/read.php?entity=trainer', { headers: hdrs })
  const hosts = await listRes.json()
  const current = hosts.find(t => t.id === aId)
  const { cabangId: _omitHost, ...hostRest } = current
  const put = await api.post('/api/trainer.php', {
    headers: hdrs,
    data: { ...hostRest, id: aId, action: 'update', penugasanPengajar: [originRow] },
  })
  if (!put.ok()) throw new Error(`seed origin: ${await put.text()}`)

  return { sekolahId, aId, bId, aNama, bNama, schoolName, originId, today, todayName, api, hdrs }
}

async function loginAndPrimeSuperadmin(page) {
  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  return primeCsrf(page)
}

async function cleanupSeed(page, seed) {
  if (!seed) return
  try { await seed.api.dispose() } catch { /* inert */ }
  try {
    await loginViaApi(page, 'adminCabang')
    const csrfA = await primeCsrf(page)
    for (const id of [seed.aId, seed.bId]) {
      await page.request.post('/api/trainer.php', {
        headers: { 'X-CSRF-Token': csrfA, 'Content-Type': 'application/json' },
        data: { id, action: 'delete' },
      })
    }
  } catch (e) { console.log(`## T2.D.3 cleanup trainers: ${e.message}`) }
  try {
    await loginViaApi(page, 'superadmin')
    const csrf = await primeCsrf(page)
    await page.request.post('/api/sekolah.php', {
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      data: { action: 'delete', id: seed.sekolahId },
    })
  } catch (e) { console.log(`## T2.D.3 cleanup sekolah: ${e.message}`) }
}

test('T2.D.3 SAVE probe: UI cover create lands a coverOf row on Trainer B', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  let seed = null
  try {
    seed = await seedOrigin(page, suffix)
    const { aNama, bNama, bId, originId, today } = seed

    // ---- create the cover through the Penugasan UI ----
    await loginAndPrimeSuperadmin(page)
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('heading', { name: 'Penugasan Pengajar' })).toBeVisible({ timeout: 15000 })
    const originTr = page.locator('tbody tr', { hasText: aNama }).first()
    await expect(originTr).toBeVisible({ timeout: 15000 })
    await originTr.getByRole('button', { name: 'Buat Pengganti', exact: true }).click()

    const coverDialog = page.getByRole('dialog')
    await expect(coverDialog).toBeVisible({ timeout: 10000 })
    await coverDialog.locator('select').nth(0).selectOption(bId)
    // Slot + tanggal ride the origin defaults (hari=today weekday,
    // tanggal=today) — the aligned case the schedule must show.
    await coverDialog.getByRole('button', { name: 'Buat', exact: true }).click()
    const confirm = page.getByRole('dialog').filter({ hasText: 'Sekolah ditagih' })
    await expect(confirm).toBeVisible({ timeout: 10000 })
    await confirm.getByRole('button', { name: 'Buat', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15000 })

    // ---- (a) server must hold the coverOf row on Trainer B ----
    const csrf = await primeCsrf(page)
    const trainers = await readEntity(page, 'trainer', csrf)
    const hostB = trainers.find(t => t.id === bId)
    const coverRow = (hostB && hostB.penugasanPengajar || []).find(r => r && r.coverOf === originId)
    console.log(`## T2.D.3 SAVE probe: hostB rows=${JSON.stringify((hostB && hostB.penugasanPengajar || []).map(r => ({ id: r.id, coverOf: r.coverOf ?? null })))}`)
    expect(coverRow).toBeTruthy()
    expect(coverRow).toMatchObject({
      sekolahId: seed.sekolahId, trainerId: bId,
      hari: seed.todayName, jamMulai: '09:00', jamSelesai: '10:00',
      periodeMulai: today, aktif: true,
    })

    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeed(page, seed)
  }
})

test('T2.D.3 RETRIEVE probe: API-seeded cover renders B (Pengganti) on cover tanggal', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  let seed = null
  try {
    seed = await seedOrigin(page, suffix)
    const { bId, bNama, originId, sekolahId, today, todayName, api, hdrs } = seed
    const coverId = `pgs-T2D3-c-${suffix}`

    // ---- seed the cover row via API (UI save bypassed: pure retrieve probe) ----
    const listRes = await api.get('/api/read.php?entity=trainer', { headers: hdrs })
    const hosts = await listRes.json()
    const hostB = hosts.find(t => t.id === bId)
    const { cabangId: _omitB, ...hostBRest } = hostB
    const coverRow = {
      id: coverId, sekolahId, trainerId: bId, asistenId: null, cabangId: CABANG_ID,
      periodeMulai: today, periodeSelesai: null, aktif: true,
      hari: todayName, jamMulai: '09:00', jamSelesai: '10:00',
      coverOf: originId,
    }
    const put = await api.post('/api/trainer.php', {
      headers: hdrs,
      data: { ...hostBRest, id: bId, action: 'update', penugasanPengajar: [coverRow] },
    })
    if (!put.ok()) throw new Error(`seed cover: ${await put.text()}`)

    // ---- (a) server holds it (retrieve probe precondition) ----
    let csrf = await loginAndPrimeSuperadmin(page)
    let trainers = await readEntity(page, 'trainer', csrf)
    const saved = (trainers.find(t => t.id === bId)?.penugasanPengajar || []).find(r => r && r.coverOf === originId)
    console.log(`## T2.D.3 RETRIEVE probe server row: ${JSON.stringify(saved ? { id: saved.id, coverOf: saved.coverOf } : null)}`)
    expect(saved).toBeTruthy()

    // ---- (b) timetable on the cover tanggal shows B (Pengganti) ----
    await openTab(page, 'Jadwal Penugasan')
    await expect(page.getByRole('heading', { name: 'Jadwal Penugasan' })).toBeVisible({ timeout: 15000 })
    const pengganti = page.getByText(`${bNama} (Pengganti)`)
    console.log(`## T2.D.3 RETRIEVE probe: expecting "${bNama} (Pengganti)" on ${today}`)
    await expect(pengganti.first()).toBeVisible({ timeout: 15000 })

    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeed(page, seed)
  }
})

test('T2.D.3 SAVE guard: mismatched cover tanggal is rejected, never an invisible row', async ({ page, pageErrors }) => {
  // The user-visible bug (F-T2-12 Current): the cover modal defaults
  // Tanggal=today while Hari rides the origin slot. When the weekdays
  // differ, the save succeeds but the weekday+triple retrieve gate
  // (buildDailyTimetable, pinned by penugasan-timetable.test.js:
  // non-matching scope yields zero rows) can never render the row on
  // its own tanggal — creatable but invisible.
  //
  // Failing side = SAVE (the retrieve gate is correct by contract and
  // covered by unit + CS.D.2 E2E pins — never touched here). Fix: the
  // save path rejects a tanggal that does not fall on the cover hari.
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  let seed = null
  try {
    seed = await seedOrigin(page, suffix)
    const { aNama, bNama, bId, originId, todayName } = seed
    // Tomorrow always falls on a different weekday than today.
    const t = new Date()
    t.setDate(t.getDate() + 1)
    const pad = n => String(n).padStart(2, '0')
    const tomorrow = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`

    await loginAndPrimeSuperadmin(page)
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('heading', { name: 'Penugasan Pengajar' })).toBeVisible({ timeout: 15000 })
    const originTr = page.locator('tbody tr', { hasText: aNama }).first()
    await expect(originTr).toBeVisible({ timeout: 15000 })
    await originTr.getByRole('button', { name: 'Buat Pengganti', exact: true }).click()

    const coverDialog = page.getByRole('dialog')
    await expect(coverDialog).toBeVisible({ timeout: 10000 })
    await coverDialog.locator('select').nth(0).selectOption(bId)
    // Hari stays the origin default (today weekday); tanggal mismatched.
    await coverDialog.locator('input[type=date]').fill(tomorrow)
    await coverDialog.getByRole('button', { name: 'Buat', exact: true }).click()

    // The save path must block with the pinned copy — no confirm, no row.
    const guardCopy = `Tanggal pengganti harus jatuh pada hari ${todayName}.`
    console.log(`## T2.D.3 SAVE guard probe: expecting block "${guardCopy}" for tanggal=${tomorrow}`)
    await expect(page.getByText(guardCopy)).toBeVisible({ timeout: 15000 })

    const csrf = await primeCsrf(page)
    const trainers = await readEntity(page, 'trainer', csrf)
    const stray = ((trainers.find(tr => tr.id === bId) || {}).penugasanPengajar || [])
      .filter(r => r && r.coverOf === originId)
    console.log(`## T2.D.3 SAVE guard probe: stray cover rows on B=${stray.length}`)
    expect(stray).toHaveLength(0)

    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeed(page, seed)
  }
})
