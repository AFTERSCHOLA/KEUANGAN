import { test, expect, loginViaApi, primeCsrf, readEntity } from './fixtures.js'

// ============================================================
// Task 2 (notif) — in-app H-1/H-day notification bell.
// Task 3 appends describe('ringkas') and Task 4 appends
// describe('kalender') below — APPEND only, never rewrite this block.
// ============================================================

test.describe('notif', () => {
  const APP = 'http://localhost:5173'
  const CABANG_ID = 'cbg-test-pusat'
  const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

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

  test('bell counts H-day + H-1, drops after absensi done, dropdown shows sections', async ({ page, pageErrors }) => {
    test.setTimeout(180000)
    const SUFFIX = String(Date.now()).slice(-6)
    const { todayName, tomorrowName, todayISO } = dayFixture()
    const PERIODE = todayISO.slice(0, 7)
    const SCH_TODAY = `SD NTF Hari Ini ${SUFFIX}`
    const SCH_TOMORROW = `SD NTF Besok ${SUFFIX}`
    const ID_TODAY = `skl-ntf-today-${SUFFIX}`
    const ID_TOMORROW = `skl-ntf-tom-${SUFFIX}`
    const TRAINER_USER = `ntr-ntf-${SUFFIX}.test`
    const TRAINER_NAME = `Trainer NTF ${SUFFIX}`
    const NEW_PASS = `NotifBel${SUFFIX.slice(-4)}45xQ`
    let trainerId = null
    let userId = null

    await resetStorage(page)
    try {
      // ---- seed as superadmin: 2 schools + dedicated trainer assigned to both.
      // Dedicated login keeps the badge count hermetic (canonical trn-test-1
      // is shared with parallel suite files).
      await loginViaApi(page, 'superadmin')
      let csrf = await primeCsrf(page)
      for (const [id, nama, day, time, endTime] of [
        [ID_TODAY, SCH_TODAY, todayName, '14:00', '15:00'],
        [ID_TOMORROW, SCH_TOMORROW, tomorrowName, '09:00', '10:00'],
      ]) {
        const r = await apiPost(page, csrf, '/api/sekolah.php', {
          action: 'create',
          id,
          nama,
          spp: 150000,
          cabangId: CABANG_ID,
          jadwalList: [{ dayOfWeek: day, time, endTime }],
        })
        if (r.status !== 201 && r.status !== 200) throw new Error(`seed sekolah gagal: ${r.status} ${JSON.stringify(r.body)}`)
      }
      const trnRes = await apiPost(page, csrf, '/api/users.php', {
        action: 'create',
        role: 'trainer',
        username: TRAINER_USER,
        displayName: TRAINER_NAME,
        cabangId: CABANG_ID,
        trainer: { nama: TRAINER_NAME, wa: '08123456789', jadwal: todayName, honor: 50000, sekolahIds: [ID_TODAY, ID_TOMORROW] },
      })
      if (trnRes.status !== 200 && trnRes.status !== 201) throw new Error(`seed trainer gagal: ${trnRes.status} ${JSON.stringify(trnRes.body)}`)
      trainerId = trnRes.body?.user?.trainerId || trnRes.body?.trainerId
      userId = trnRes.body?.user?.id || trnRes.body?.userId || null
      const initialPassword = trnRes.body?.initialPassword
      if (!trainerId || !initialPassword) throw new Error(`seed trainer tanpa id/password: ${JSON.stringify(trnRes.body)}`)

      // ---- login as the new trainer (must-change first), bell badge 2.
      await page.request.post('/api/auth/logout.php')
      await loginViaApi(page, 'fresh-trainer', { credentials: { username: TRAINER_USER, password: initialPassword } })
      await page.goto(APP)
      await page.waitForLoadState('domcontentloaded')
      await completeMustChange(page, initialPassword, NEW_PASS)

      const bell = page.getByRole('button', { name: /notifikasi/i })
      await expect(bell).toBeVisible({ timeout: 15000 })
      await expect(bell).toContainText('2', { timeout: 15000 })

      // ---- mark today's attendance done in the trainer's own session
      // (trainer write-own lane, no session juggling), badge drops to 1.
      csrf = await primeCsrf(page)
      const abs = await apiPost(page, csrf, '/api/absensi.php', {
        id: `abs-ntf-${SUFFIX}`,
        cabangId: CABANG_ID,
        sekolahId: ID_TODAY,
        trainerId,
        trainerNama: TRAINER_NAME,
        tanggal: todayISO,
        periode: PERIODE,
        trainerStatus: 'Hadir',
        siswaList: [],
      })
      if (abs.status !== 200 && abs.status !== 201) throw new Error(`seed absensi gagal: ${abs.status} ${JSON.stringify(abs.body)}`)

      await page.goto(APP)
      await page.waitForLoadState('domcontentloaded')
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
      await menu.getByRole('menuitem', { name: 'Lihat Jadwal' }).click()
      await expect(menu).toBeHidden()

      expect(pageErrors).toHaveLength(0)
    } finally {
      // Single adminCabang login covers all cleanup: school delete
      // cascades the absensi rows (M-AF5.7), trainer delete strips reverse
      // links, user delete deactivates the login.
      await page.request.post('/api/auth/logout.php').catch(() => {})
      await loginViaApi(page, 'adminCabang')
      const csrf2 = await primeCsrf(page)
      for (const id of [ID_TODAY, ID_TOMORROW]) {
        await apiPost(page, csrf2, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
      }
      if (trainerId) {
        await apiPost(page, csrf2, '/api/trainer.php', { action: 'delete', id: trainerId }).catch(() => {})
      }
      if (userId) {
        await apiPost(page, csrf2, '/api/users.php', { action: 'delete', id: userId }).catch(() => {})
      }
    }
  })

  test('admin_cabang bell excludes other-branch schools', async ({ page, pageErrors }) => {
    test.setTimeout(180000)
    const SUFFIX = String(Date.now()).slice(-6)
    const { todayName } = dayFixture()
    const SCH_IN = `SD NTF Pusat ${SUFFIX}`
    const SCH_OUT = `SD NTF Luar ${SUFFIX}`
    const ID_IN = `skl-ntf-in-${SUFFIX}`
    const ID_OUT = `skl-ntf-out-${SUFFIX}`
    const BRANCH_OUT = `cbg-ntf-${SUFFIX}`
    const TRAINER_ID = 'trn-test-1'
    const ROW_ID = `pgs-ntf-${SUFFIX}`

    await resetStorage(page)
    try {
      // ---- seed: other-branch school + own-branch school assigned to trn-test-1.
      await loginViaApi(page, 'superadmin')
      let csrf = await primeCsrf(page)
      const br = await apiPost(page, csrf, '/api/cabang.php', {
        action: 'create', id: BRANCH_OUT, kode: `ntf${SUFFIX}`, nama: `Cabang NTF ${SUFFIX}`,
      })
      if (br.status !== 200 && br.status !== 201) throw new Error(`seed cabang gagal: ${br.status} ${JSON.stringify(br.body)}`)
      for (const [id, nama, cabangId, time, endTime] of [
        [ID_OUT, SCH_OUT, BRANCH_OUT, '10:00', '11:00'],
        [ID_IN, SCH_IN, CABANG_ID, '11:00', '12:00'],
      ]) {
        const r = await apiPost(page, csrf, '/api/sekolah.php', {
          action: 'create',
          id,
          nama,
          spp: 150000,
          cabangId,
          jadwalList: [{ dayOfWeek: todayName, time, endTime }],
        })
        if (r.status !== 201 && r.status !== 200) throw new Error(`seed sekolah gagal: ${r.status} ${JSON.stringify(r.body)}`)
      }
      const trainers = await readEntity(page, 'trainer', csrf)
      const trnRec = trainers.find(t => t.id === TRAINER_ID)
      if (!trnRec) throw new Error(`trainer ${TRAINER_ID} tidak ditemukan`)
      const beforeRows = Array.isArray(trnRec.penugasanPengajar) ? trnRec.penugasanPengajar : []
      const { cabangId: _drop, ...trnNoCabang } = trnRec
      const upd = await apiPost(page, csrf, '/api/trainer.php', {
        ...trnNoCabang,
        id: TRAINER_ID,
        action: 'update',
        version: trnRec.version,
        penugasanPengajar: [...beforeRows,
          { id: ROW_ID, sekolahId: ID_IN, trainerId: TRAINER_ID, asistenId: null, cabangId: CABANG_ID, periodeMulai: '2020-01-01', periodeSelesai: null, aktif: true, hari: todayName, jamMulai: '11:00', jamSelesai: '12:00' },
        ],
      })
      if (upd.status !== 200) throw new Error(`assign gagal: ${upd.status} ${JSON.stringify(upd.body)}`)

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
      const cur = (await readEntity(page, 'trainer', csrf2)).find(t => t.id === TRAINER_ID)
      if (cur) {
        const { cabangId: _c2, ...noCab } = cur
        const kept = (Array.isArray(noCab.penugasanPengajar) ? noCab.penugasanPengajar : []).filter(a => !(a && a.id === ROW_ID))
        await apiPost(page, csrf2, '/api/trainer.php', {
          ...noCab, id: TRAINER_ID, action: 'update', version: cur.version, penugasanPengajar: kept,
        }).catch(() => {})
      }
      for (const id of [ID_IN, ID_OUT]) {
        await apiPost(page, csrf2, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
      }
      await apiPost(page, csrf2, '/api/cabang.php', { action: 'delete', id: BRANCH_OUT }).catch(() => {})
    }
  })
})
