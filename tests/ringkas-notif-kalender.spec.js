import { test, expect, loginViaApi, primeCsrf, readEntity } from './fixtures.js'

// ============================================================
// Task 2 (notif) — in-app H-1/H-day notification bell.
// Task 3 appends describe('ringkas') and Task 4 appends
// describe('kalender') below — APPEND only, never rewrite this block.
//
// Fixture strategy (zero-residue): FIXED ids, no run suffixes, shared by
// both tests and reused across runs — nothing accumulates. Setup is
// delete-then-create + link reconcile, so a crashed run self-heals on the
// next run. Teardown deletes every school/branch it created (school delete
// cascades reverse links, M-AF5.7) and strips its penugasan rows.
// - The dedicated `bell-trainer.test` login + trainer row persist by design
//   (reviewer-sanctioned reuse: user rows are not listable/removable via
//   API); exactly one exists, never more.
// - `trn-test-1` is NEVER written to.
// - The absensi ledger is append-only with no API delete lane
//   (server/api/absensi.php: verify/update/certify/write only), so the
//   done-transition seeds the done STATE into the client cache the bell
//   reads (readCached) AFTER the final hydrate, with no navigation before
//   the assertion — zero server rows. The absensi→done derivation itself is
//   unit-pinned (reminders.test.js) and the server write path is covered by
//   invoice-pipeline-dashboard.spec.js.
// Do NOT run this file concurrently with itself (fixed ids).
// ============================================================

test.describe('notif', () => {
  const APP = 'http://localhost:5173'
  const CABANG_ID = 'cbg-test-pusat'
  const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

  const TRAINER_USER = 'bell-trainer.test'
  const TRAINER_NAME = 'Bell Trainer'
  const FIXED_PASS = 'BellFixed1234'
  const SCH_TODAY = 'Bell Today School'
  const SCH_TOMORROW = 'Bell Tomorrow School'
  const SCH_IN = 'Bell In School'
  const SCH_OUT = 'Bell Out School'
  const ID_TODAY = 'skl-bell-today'
  const ID_TOMORROW = 'skl-bell-tom'
  const ID_IN = 'skl-bell-in'
  const ID_OUT = 'skl-bell-out'
  const BRANCH_OUT = 'cbg-bell-out'
  // Client-cache seeding targets (src/lib/store.js: STORE_EVENT + getKeys()).
  const ABS_CACHE_KEY = 'afterschola_v4_absensi'
  const STORE_EVENT = 'afterschola_v4_changed'

  function localISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function dayFixture() {
    const now = new Date()
    const todayName = DAY_NAMES[now.getDay()]
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const tomorrowName = DAY_NAMES[tomorrow.getDay()]
    return { todayName, tomorrowName, todayISO: localISO(now) }
  }

  async function resetStorage(page) {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('__ntf_reset_done')) return
      const prefix = 'afterschola_v4'
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k && k.startsWith(prefix)) localStorage.removeItem(k)
      }
      sessionStorage.setItem('__ntf_reset_done', '1')
    })
  }

  async function apiPost(page, csrf, url, data) {
    const res = await page.request.post(url, {
      headers: { 'X-CSRF-Token': csrf },
      data,
    })
    const body = await res.json().catch(() => ({}))
    return { status: res.status(), body }
  }

  async function completeMustChange(page, currentPass, newPass) {
    await expect(page.getByRole('heading', { name: 'Ubah Kata Sandi' })).toBeVisible({ timeout: 15000 })
    await page.getByLabel('Kata Sandi Saat Ini').fill(currentPass)
    await page.getByLabel('Kata Sandi Baru', { exact: true }).fill(newPass)
    await page.getByLabel('Konfirmasi Kata Sandi Baru').fill(newPass)
    await page.getByRole('button', { name: 'Simpan Kata Sandi' }).click()
  }

  // Idempotent school seed: delete leftovers first, then create.
  async function ensureSchool(page, csrf, { id, nama, cabangId, day, time, endTime }) {
    await apiPost(page, csrf, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
    const r = await apiPost(page, csrf, '/api/sekolah.php', {
      action: 'create', id, nama, spp: 150000, cabangId,
      jadwalList: [{ dayOfWeek: day, time, endTime }],
    })
    if (r.status !== 201 && r.status !== 200) throw new Error(`seed sekolah gagal: ${r.status} ${JSON.stringify(r.body)}`)
  }

  async function ensureOutBranch(page, csrf) {
    await apiPost(page, csrf, '/api/cabang.php', { action: 'delete', id: BRANCH_OUT }).catch(() => {})
    const r = await apiPost(page, csrf, '/api/cabang.php', {
      action: 'create', id: BRANCH_OUT, kode: 'bellout', nama: 'Bell Out Branch',
    })
    if (r.status !== 200 && r.status !== 201) throw new Error(`seed cabang gagal: ${r.status} ${JSON.stringify(r.body)}`)
  }

  // Reused dedicated trainer: find by name, else create (first run only).
  // Returns { trainerId, initialPassword|null }. A 422 here with no
  // existing row means a prior run crashed between create and must-change —
  // recover manually (deactivate bell-trainer.test in DB), then re-run.
  async function ensureTrainerAccount(page, csrf, todayName) {
    const trainers = await readEntity(page, 'trainer', csrf)
    const rec = trainers.find(t => t && t.nama === TRAINER_NAME)
    if (rec) return { trainerId: rec.id, initialPassword: null }
    const r = await apiPost(page, csrf, '/api/users.php', {
      action: 'create',
      role: 'trainer',
      username: TRAINER_USER,
      displayName: TRAINER_NAME,
      cabangId: CABANG_ID,
      trainer: { nama: TRAINER_NAME, wa: '08123456789', jadwal: todayName, honor: 50000, sekolahIds: [] },
    })
    if (r.status !== 200 && r.status !== 201) throw new Error(`seed trainer gagal: ${r.status} ${JSON.stringify(r.body)}`)
    const trainerId = r.body?.user?.trainerId || r.body?.trainerId
    const initialPassword = r.body?.initialPassword
    if (!trainerId || !initialPassword) throw new Error(`seed trainer tanpa id/password: ${JSON.stringify(r.body)}`)
    return { trainerId, initialPassword }
  }

  // Deterministic links: exact sekolahIds + replace all pgs-bell-* rows.
  async function reconcileTrainer(page, csrf, trainerId, { sekolahIds, extraRows = [] }) {
    const cur = (await readEntity(page, 'trainer', csrf)).find(t => t && t.id === trainerId)
    if (!cur) throw new Error('trainer bell tidak ditemukan')
    const { cabangId: _drop, ...rest } = cur
    const kept = (Array.isArray(rest.penugasanPengajar) ? rest.penugasanPengajar : [])
      .filter(a => !(a && typeof a.id === 'string' && a.id.startsWith('pgs-bell-')))
    const upd = await apiPost(page, csrf, '/api/trainer.php', {
      ...rest, id: trainerId, action: 'update', version: cur.version,
      sekolahIds, penugasanPengajar: [...kept, ...extraRows],
    })
    if (upd.status !== 200) throw new Error(`reconcile gagal: ${upd.status} ${JSON.stringify(upd.body)}`)
  }

  function bellRow(suffix, { sekolahId, day, time, endTime }) {
    return {
      id: `pgs-bell-${suffix}`, sekolahId, trainerId: undefined,
      asistenId: null, cabangId: CABANG_ID, periodeMulai: '2020-01-01',
      periodeSelesai: null, aktif: true, hari: day, jamMulai: time, jamSelesai: endTime,
    }
  }

  test('bell counts H-day + H-1, drops after absensi done, dropdown shows sections', async ({ page, pageErrors }) => {
    test.setTimeout(180000)
    const { todayName, tomorrowName, todayISO } = dayFixture()
    const PERIODE = todayISO.slice(0, 7)

    await resetStorage(page)
    try {
      // ---- setup as superadmin: fixed schools + dedicated trainer links.
      await loginViaApi(page, 'superadmin')
      const csrf = await primeCsrf(page)
      await ensureSchool(page, csrf, { id: ID_TODAY, nama: SCH_TODAY, cabangId: CABANG_ID, day: todayName, time: '14:00', endTime: '15:00' })
      await ensureSchool(page, csrf, { id: ID_TOMORROW, nama: SCH_TOMORROW, cabangId: CABANG_ID, day: tomorrowName, time: '09:00', endTime: '10:00' })
      const { trainerId, initialPassword } = await ensureTrainerAccount(page, csrf, todayName)
      const todayRow = bellRow('today', { sekolahId: ID_TODAY, day: todayName, time: '14:00', endTime: '15:00' })
      const tomRow = bellRow('tom', { sekolahId: ID_TOMORROW, day: tomorrowName, time: '09:00', endTime: '10:00' })
      todayRow.trainerId = trainerId
      tomRow.trainerId = trainerId
      await reconcileTrainer(page, csrf, trainerId, { sekolahIds: [], extraRows: [todayRow, tomRow] })

      // ---- login as the dedicated trainer: stable password when a prior
      // run completed must-change, else fresh account + must-change now.
      await page.request.post('/api/auth/logout.php')
      if (initialPassword) {
        await loginViaApi(page, 'bell-trainer', { credentials: { username: TRAINER_USER, password: initialPassword } })
        await page.goto(APP)
        await page.waitForLoadState('domcontentloaded')
        await completeMustChange(page, initialPassword, FIXED_PASS)
      } else {
        await loginViaApi(page, 'bell-trainer', { credentials: { username: TRAINER_USER, password: FIXED_PASS } })
        await page.goto(APP)
        await page.waitForLoadState('domcontentloaded')
      }

      const bell = page.getByRole('button', { name: /notifikasi/i })
      await expect(bell).toBeVisible({ timeout: 15000 })
      await expect(bell).toContainText('2', { timeout: 15000 })

      // ---- mark today's attendance done by seeding the done STATE into the
      // client absensi cache (append-only ledger has no delete lane; no
      // navigation after this — hydrate would wipe the injected row).
      await page.evaluate(({ key, eventName, row }) => {
        let rows = []
        try {
          const parsed = JSON.parse(localStorage.getItem(key))
          if (Array.isArray(parsed)) rows = parsed
        } catch { rows = [] }
        const idx = rows.findIndex(r => r && r.id === row.id)
        if (idx >= 0) rows[idx] = row
        else rows.push(row)
        localStorage.setItem(key, JSON.stringify(rows))
        window.dispatchEvent(new Event(eventName))
      }, {
        key: ABS_CACHE_KEY,
        eventName: STORE_EVENT,
        row: {
          id: 'bell-absensi-today', tanggal: todayISO, periode: PERIODE,
          sekolahId: ID_TODAY, trainerId, trainerNama: TRAINER_NAME,
          trainerStatus: 'Hadir', siswaList: [], cabangId: CABANG_ID,
        },
      })
      await expect(bell).toContainText('1', { timeout: 15000 })

      // ---- dropdown sections + Lihat Jadwal wiring.
      await bell.click()
      const menu = page.getByRole('menu', { name: /notifikasi/i })
      await expect(menu).toBeVisible()
      await expect(menu).toContainText('Jadwal Hari Ini')
      await expect(menu).toContainText(SCH_TODAY)
      await expect(menu).toContainText('Selesai')
      await expect(menu).toContainText('Jadwal Sekolah Besok')
      await expect(menu).toContainText(SCH_TOMORROW)
      await menu.getByRole('button', { name: 'Lihat Jadwal' }).click()
      await expect(menu).toBeHidden()

      expect(pageErrors).toHaveLength(0)
    } finally {
      await page.request.post('/api/auth/logout.php').catch(() => {})
      await loginViaApi(page, 'superadmin')
      const csrf2 = await primeCsrf(page)
      const trainers = await readEntity(page, 'trainer', csrf2)
      const rec = trainers.find(t => t && t.nama === TRAINER_NAME)
      if (rec) {
        await reconcileTrainer(page, csrf2, rec.id, { sekolahIds: [], extraRows: [] }).catch(() => {})
      }
      for (const id of [ID_TODAY, ID_TOMORROW]) {
        await apiPost(page, csrf2, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
      }
    }
  })

  test('admin_cabang bell excludes other-branch schools', async ({ page, pageErrors }) => {
    test.setTimeout(180000)
    const { todayName } = dayFixture()

    await resetStorage(page)
    try {
      // ---- setup: fixed out-branch school + in-branch school linked to the
      // DEDICATED trainer via a scoped penugasan row (trn-test-1 untouched).
      await loginViaApi(page, 'superadmin')
      const csrf = await primeCsrf(page)
      await ensureOutBranch(page, csrf)
      await ensureSchool(page, csrf, { id: ID_OUT, nama: SCH_OUT, cabangId: BRANCH_OUT, day: todayName, time: '10:00', endTime: '11:00' })
      await ensureSchool(page, csrf, { id: ID_IN, nama: SCH_IN, cabangId: CABANG_ID, day: todayName, time: '11:00', endTime: '12:00' })
      const { trainerId } = await ensureTrainerAccount(page, csrf, todayName)
      const inRow = bellRow('in', { sekolahId: ID_IN, day: todayName, time: '11:00', endTime: '12:00' })
      inRow.trainerId = trainerId
      await reconcileTrainer(page, csrf, trainerId, { sekolahIds: [], extraRows: [inRow] })

      // ---- login as admin_cabang (cbg-test-pusat): sees IN, not OUT.
      await page.request.post('/api/auth/logout.php')
      await loginViaApi(page, 'adminCabang')
      await page.goto(APP)
      await page.waitForLoadState('domcontentloaded')

      const bell = page.getByRole('button', { name: /notifikasi/i })
      await expect(bell).toBeVisible({ timeout: 15000 })
      await bell.click()
      const menu = page.getByRole('menu', { name: /notifikasi/i })
      await expect(menu).toBeVisible()
      await expect(menu).toContainText(SCH_IN)
      await expect(menu).not.toContainText(SCH_OUT)

      expect(pageErrors).toHaveLength(0)
    } finally {
      await page.request.post('/api/auth/logout.php').catch(() => {})
      await loginViaApi(page, 'superadmin')
      const csrf2 = await primeCsrf(page)
      const trainers = await readEntity(page, 'trainer', csrf2)
      const rec = trainers.find(t => t && t.nama === TRAINER_NAME)
      if (rec) {
        await reconcileTrainer(page, csrf2, rec.id, { sekolahIds: [], extraRows: [] }).catch(() => {})
      }
      for (const id of [ID_IN, ID_OUT]) {
        await apiPost(page, csrf2, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
      }
      await apiPost(page, csrf2, '/api/cabang.php', { action: 'delete', id: BRANCH_OUT }).catch(() => {})
    }
  })
})
