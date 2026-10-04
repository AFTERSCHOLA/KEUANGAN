import fs from 'node:fs'
import { test, expect, loginViaApi, primeCsrf, readEntity } from './fixtures.js'

// ============================================================
// Slice 3 — Jadwal Harian/Mingguan/Kalender.
// Switcher segmented Harian/Mingguan/Kalender di toolbar Jadwal
// Penugasan (persist jadwalView); Mingguan = Senin–Minggu pada
// minggu yang memuat tanggal; Kalender = grid sebulan (Senin-first).
// Semua views reuse buildDailyTimetable per tanggal; CSV parity
// visible-view (P2: Unduh CSV di semua view + kolom Tanggal per
// baris cocok tbody[data-tanggal]). Pola seed:
// tests/raport-verify.spec.js (API seed + disposable data +
// webServer self-boot).
// ============================================================

const APP = 'http://localhost:5173'
const CABANG_ID = 'cbg-test-pusat'
const DAY_NAMES_ALL = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

function todayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function daysInMonthOf(iso) {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// Minimal quote-aware CSV parse (matches downloadCSV quoting in csv.js:
// fields with , \n " come wrapped in ", inner " doubled as "").
function parseCSV(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ } else field += c
  }
  row.push(field); rows.push(row)
  return rows.filter(r => !(r.length === 1 && r[0] === ''))
}

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__jadwal_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__jadwal_reset_done', '1')
  })
}

async function openJadwal(page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Jadwal Penugasan', exact: true }).click()
}

async function apiPost(page, csrf, url, data) {
  const res = await page.request.post(url, {
    headers: { 'X-CSRF-Token': csrf },
    data,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status(), body }
}

async function seedSchoolAllDays(page, suffix, tag, schoolName) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const jadwalList = DAY_NAMES_ALL.map(d => ({ dayOfWeek: d, time: '09:00', endTime: '10:00' }))
  const r = await apiPost(page, csrf, '/api/sekolah.php', {
    action: 'create',
    id: `skl-${tag}-${suffix}`,
    nama: schoolName,
    spp: 150000,
    cabangId: CABANG_ID,
    jadwalList,
  })
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`seed sekolah gagal: ${r.status} ${JSON.stringify(r.body)}`)
  }
  return r.body.id || `skl-${tag}-${suffix}`
}

async function seedTrainerWithAssignment(page, { trainerId, nama, sekolahId, rowId }) {
  await loginViaApi(page, 'adminCabang')
  const csrf = await primeCsrf(page)
  const mk = await apiPost(page, csrf, '/api/trainer.php', {
    id: trainerId, nama, honor: 50000, tipePengajar: 'instruktur', sekolahIds: [], action: 'create',
  })
  if (mk.status !== 201 && mk.status !== 200) {
    throw new Error(`seed trainer gagal: ${mk.status} ${JSON.stringify(mk.body)}`)
  }
  const list = await readEntity(page, 'trainer', csrf)
  const cur = list.find(t => t.id === trainerId)
  if (!cur) throw new Error(`trainer ${trainerId} tidak ditemukan setelah create`)
  const { cabangId: _omit, ...rest } = cur
  const upd = await apiPost(page, csrf, '/api/trainer.php', {
    ...rest,
    id: trainerId,
    action: 'update',
    penugasanPengajar: [{
      id: rowId, sekolahId, trainerId, asistenId: null, cabangId: CABANG_ID,
      periodeMulai: '2020-01-01', periodeSelesai: null, aktif: true,
    }],
  })
  if (upd.status !== 200) {
    throw new Error(`seed assignment gagal: ${upd.status} ${JSON.stringify(upd.body)}`)
  }
}

async function cleanupSeeds(page, { trainerIds = [], schoolIds = [] } = {}) {
  try {
    await loginViaApi(page, 'adminCabang')
    const csrfA = await primeCsrf(page)
    for (const id of trainerIds) {
      await apiPost(page, csrfA, '/api/trainer.php', { id, action: 'delete' }).catch(() => {})
    }
    await loginViaApi(page, 'superadmin')
    const csrf = await primeCsrf(page)
    for (const id of schoolIds) {
      await apiPost(page, csrf, '/api/sekolah.php', { action: 'delete', id }).catch(() => {})
    }
  } catch {
    /* abaikan — cleanup best-effort */
  }
}

test('J1: switcher tampil default Harian; pindah Mingguan → reload → tetap Mingguan; CSV parity visible view', async ({ page, pageErrors }) => {
  test.setTimeout(120_000)
  await resetStorage(page)
  const SUFFIX = String(Date.now()).slice(-6)
  const SCH_NAME = `SD J1 ${SUFFIX}`
  const TRAINER_ID = `trn-J1-${SUFFIX}`
  let schoolId = null
  try {
    schoolId = await seedSchoolAllDays(page, SUFFIX, 'j1', SCH_NAME)
    await seedTrainerWithAssignment(page, {
      trainerId: TRAINER_ID, nama: `Host J1 ${SUFFIX}`, sekolahId: schoolId, rowId: `pgs-j1-${SUFFIX}`,
    })

    await loginViaApi(page, 'adminCabang')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openJadwal(page)

    // Switcher di grup Tampilan (scope grup: tombol navbar KALENDER_SHORTCUT
    // punya nama aksesibel yang sama — tanpa scope, strict-mode violation).
    const viewGroup = page.getByRole('group', { name: 'Tampilan jadwal' })
    const harianBtn = viewGroup.getByRole('button', { name: 'Harian', exact: true })
    const mingguanBtn = viewGroup.getByRole('button', { name: 'Mingguan', exact: true })
    const kalenderBtn = viewGroup.getByRole('button', { name: 'Kalender', exact: true })
    const unduhCsv = page.getByRole('button', { name: 'Unduh CSV', exact: true })
    await expect(harianBtn).toBeVisible({ timeout: 15000 })
    await expect(mingguanBtn).toBeVisible()
    await expect(kalenderBtn).toBeVisible()
    await expect(harianBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(mingguanBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(unduhCsv).toBeVisible()

    // P2 parity — Mingguan: Unduh CSV visible + row-count = tbody terlihat.
    await mingguanBtn.click()
    await expect(mingguanBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(unduhCsv).toBeVisible()
    const seedRows = page.locator('tbody[data-tanggal] tr', { hasText: SUFFIX })
    await expect(seedRows.first()).toBeVisible({ timeout: 15000 })
    const visibleCount = await seedRows.count()
    expect(visibleCount).toBe(7)
    const isoSet = new Set(await page.locator('tbody[data-tanggal]').evaluateAll(
      els => els.map(e => e.getAttribute('data-tanggal'))))
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      unduhCsv.click(),
    ])
    const raw = fs.readFileSync(await download.path(), 'utf8')
    const csvRows = parseCSV(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw)
    expect(csvRows[0]).toEqual(['Sekolah', 'Trainer', 'Asisten', 'Waktu', 'Tanggal'])
    const seedCsv = csvRows.slice(1).filter(r => (r[0] || '').includes(SUFFIX))
    expect(seedCsv).toHaveLength(visibleCount)
    for (const r of seedCsv) expect(isoSet.has(r[4])).toBe(true)

    // P2 parity — Kalender: Unduh CSV visible.
    await kalenderBtn.click()
    await expect(kalenderBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(unduhCsv).toBeVisible()
    await mingguanBtn.click()
    await expect(mingguanBtn).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await openJadwal(page)
    await expect(page.getByRole('group', { name: 'Tampilan jadwal' }).getByRole('button', { name: 'Mingguan', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: 'Tampilan jadwal' }).getByRole('button', { name: 'Harian', exact: true })).toHaveAttribute('aria-pressed', 'false')

    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeeds(page, { trainerIds: [TRAINER_ID], schoolIds: schoolId ? [schoolId] : [] })
  }
})

test('J2: sesi yang dikenal muncul di grup hari yang benar (Mingguan)', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SCH_NAME = `SD J2 ${SUFFIX}`
  const TRAINER_ID = `trn-J2-${SUFFIX}`
  const today = todayISO()
  let schoolId = null

  await resetStorage(page)
  try {
    schoolId = await seedSchoolAllDays(page, SUFFIX, 'j2', SCH_NAME)
    await seedTrainerWithAssignment(page, {
      trainerId: TRAINER_ID, nama: `Host J2 ${SUFFIX}`, sekolahId: schoolId, rowId: `pgs-j2-${SUFFIX}`,
    })

    await loginViaApi(page, 'adminCabang')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openJadwal(page)
    await page.getByRole('button', { name: 'Mingguan', exact: true }).click()

    const group = page.locator(`tbody[data-tanggal="${today}"]`)
    await expect(group).toBeVisible({ timeout: 15000 })
    await expect(group).toContainText(SCH_NAME)
    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeeds(page, { trainerIds: [TRAINER_ID], schoolIds: schoolId ? [schoolId] : [] })
  }
})

test('J3: kalender — jumlah sel = hari bulan itu, chip sesi ada', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SCH_NAME = `SD J3 ${SUFFIX}`
  const TRAINER_ID = `trn-J3-${SUFFIX}`
  const today = todayISO()
  let schoolId = null

  await resetStorage(page)
  try {
    schoolId = await seedSchoolAllDays(page, SUFFIX, 'j3', SCH_NAME)
    await seedTrainerWithAssignment(page, {
      trainerId: TRAINER_ID, nama: `Host J3 ${SUFFIX}`, sekolahId: schoolId, rowId: `pgs-j3-${SUFFIX}`,
    })

    await loginViaApi(page, 'adminCabang')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openJadwal(page)
    await page.getByRole('button', { name: 'Kalender', exact: true }).click()

    const cells = page.getByTestId('kalender-hari')
    await expect(cells).toHaveCount(daysInMonthOf(today), { timeout: 15000 })
    const todayCell = page.locator(`[data-testid="kalender-hari"][data-tanggal="${today}"]`)
    await expect(todayCell).toBeVisible()
    await expect(todayCell).toContainText(SCH_NAME)

    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeeds(page, { trainerIds: [TRAINER_ID], schoolIds: schoolId ? [schoolId] : [] })
  }
})

test('J4: klik hari di kalender → Harian dengan tanggal itu', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SCH_NAME = `SD J4 ${SUFFIX}`
  const TRAINER_ID = `trn-J4-${SUFFIX}`
  const today = todayISO()
  let schoolId = null

  await resetStorage(page)
  try {
    schoolId = await seedSchoolAllDays(page, SUFFIX, 'j4', SCH_NAME)
    await seedTrainerWithAssignment(page, {
      trainerId: TRAINER_ID, nama: `Host J4 ${SUFFIX}`, sekolahId: schoolId, rowId: `pgs-j4-${SUFFIX}`,
    })

    await loginViaApi(page, 'adminCabang')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openJadwal(page)
    await page.getByRole('button', { name: 'Kalender', exact: true }).click()

    const todayCell = page.locator(`[data-testid="kalender-hari"][data-tanggal="${today}"]`)
    await expect(todayCell).toBeVisible({ timeout: 15000 })
    await todayCell.click()

    await expect(page.getByRole('button', { name: 'Harian', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('input[type="date"]')).toHaveValue(today)
    await expect(page.locator('tbody tr', { hasText: SCH_NAME }).first()).toBeVisible({ timeout: 15000 })

    expect(pageErrors).toHaveLength(0)
  } finally {
    await cleanupSeeds(page, { trainerIds: [TRAINER_ID], schoolIds: schoolId ? [schoolId] : [] })
  }
})

// J5 menempel/mencopot baris pada akun trainer bersama (trn-test-1):
// sapu sisa run lama (baris pgs-j5-own-*, trainer trn-J5out-*, sekolah
// SD J5 *) agar run ulang setelah timeout tidak menabrak gate
// double-booking. Semua pola disposable milik run ini.
async function sweepJ5Leftovers(page, keepSuffix) {
  await loginViaApi(page, 'superadmin')
  let csrf = await primeCsrf(page)
  const trainers = await readEntity(page, 'trainer', csrf)
  const staleTrainerIds = trainers
    .filter(t => t && typeof t.id === 'string' && t.id.startsWith('trn-J5out-') && !t.id.endsWith(keepSuffix))
    .map(t => t.id)
  const trnRec = trainers.find(t => t.id === 'trn-test-1')
  const staleRowIds = new Set(
    (Array.isArray(trnRec && trnRec.penugasanPengajar) ? trnRec.penugasanPengajar : [])
      .filter(a => a && typeof a.id === 'string' && a.id.startsWith('pgs-j5-own-'))
      .map(a => a.id)
  )
  if (staleTrainerIds.length > 0) {
    await loginViaApi(page, 'adminCabang')
    const csrfA = await primeCsrf(page)
    for (const id of staleTrainerIds) {
      await apiPost(page, csrfA, '/api/trainer.php', { id, action: 'delete' }).catch(() => {})
    }
  }
  await loginViaApi(page, 'superadmin')
  csrf = await primeCsrf(page)
  if (staleRowIds.size > 0) {
    const cur = (await readEntity(page, 'trainer', csrf)).find(t => t.id === 'trn-test-1')
    if (cur) {
      const { cabangId: _d, ...noCab } = cur
      await apiPost(page, csrf, '/api/trainer.php', {
        ...noCab, id: 'trn-test-1', action: 'update', version: cur.version,
        penugasanPengajar: (Array.isArray(noCab.penugasanPengajar) ? noCab.penugasanPengajar : [])
          .filter(a => !(a && staleRowIds.has(a.id))),
      }).catch(() => {})
    }
  }
  const schools = await readEntity(page, 'sekolah', csrf)
  for (const s of schools) {
    if (s && typeof s.nama === 'string' && /^SD J5 (In|Out) /.test(s.nama) && !s.nama.endsWith(keepSuffix)) {
      await apiPost(page, csrf, '/api/sekolah.php', { action: 'delete', id: s.id }).catch(() => {})
    }
  }
}

test('J5: trainer hanya melihat sesi sendiri di ketiga views', async ({ page, pageErrors }) => {
  const SUFFIX = String(Date.now()).slice(-6)
  const SCH_IN = `SD J5 In ${SUFFIX}`
  const SCH_OUT = `SD J5 Out ${SUFFIX}`
  const OWN_ROW_ID = `pgs-j5-own-${SUFFIX}`
  const OTHER_TRAINER_ID = `trn-J5out-${SUFFIX}`
  const TRAINER_ID = 'trn-test-1'
  const today = todayISO()
  let schoolIn = null
  let schoolOut = null

  await resetStorage(page)
  try {
    await sweepJ5Leftovers(page, SUFFIX)
    schoolIn = await seedSchoolAllDays(page, SUFFIX, 'j5in', SCH_IN)
    schoolOut = await seedSchoolAllDays(page, SUFFIX, 'j5out', SCH_OUT)

    // Tugaskan trn-test-1 ke sekolah IN (append), trainer lain ke OUT.
    await loginViaApi(page, 'superadmin')
    let csrf = await primeCsrf(page)
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
      penugasanPengajar: [...beforeRows, {
        id: OWN_ROW_ID, sekolahId: schoolIn, trainerId: TRAINER_ID, asistenId: null,
        cabangId: CABANG_ID, periodeMulai: '2020-01-01', periodeSelesai: null, aktif: true,
      }],
    })
    if (upd.status !== 200) throw new Error(`assign trainer gagal: ${upd.status} ${JSON.stringify(upd.body)}`)
    await seedTrainerWithAssignment(page, {
      trainerId: OTHER_TRAINER_ID, nama: `Host J5 Out ${SUFFIX}`, sekolahId: schoolOut, rowId: `pgs-j5-out-${SUFFIX}`,
    })

    await loginViaApi(page, 'trainer')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openJadwal(page)

    // Harian: sesi sendiri ada, sesi luar-scope tidak ada.
    await expect(page.locator('tbody tr', { hasText: SCH_IN }).first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('tbody tr', { hasText: SCH_OUT })).toHaveCount(0)

    // Mingguan: sama.
    await page.getByRole('button', { name: 'Mingguan', exact: true }).click()
    const group = page.locator(`tbody[data-tanggal="${today}"]`)
    await expect(group).toBeVisible({ timeout: 15000 })
    await expect(group).toContainText(SCH_IN)
    await expect(group).not.toContainText(SCH_OUT)

    // Kalender: chip sendiri ada, chip luar-scope tidak ada.
    await page.getByRole('button', { name: 'Kalender', exact: true }).click()
    const todayCell = page.locator(`[data-testid="kalender-hari"][data-tanggal="${today}"]`)
    await expect(todayCell).toBeVisible({ timeout: 15000 })
    await expect(todayCell).toContainText(SCH_IN)
    await expect(todayCell).not.toContainText(SCH_OUT)

    expect(pageErrors).toHaveLength(0)
  } finally {
    await loginViaApi(page, 'superadmin')
    const csrf2 = await primeCsrf(page)
    const cur = (await readEntity(page, 'trainer', csrf2)).find(t => t.id === TRAINER_ID)
    if (cur) {
      const { cabangId: _c2, ...noCab } = cur
      const kept = (Array.isArray(noCab.penugasanPengajar) ? noCab.penugasanPengajar : []).filter(a => !(a && a.id === OWN_ROW_ID))
      await apiPost(page, csrf2, '/api/trainer.php', {
        ...noCab, id: TRAINER_ID, action: 'update', version: cur.version, penugasanPengajar: kept,
      }).catch(() => {})
    }
    await cleanupSeeds(page, {
      trainerIds: [OTHER_TRAINER_ID],
      schoolIds: [schoolIn, schoolOut].filter(Boolean),
    })
  }
})
