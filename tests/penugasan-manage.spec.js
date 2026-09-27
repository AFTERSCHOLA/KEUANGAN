import { test, expect, loginViaApi, primeCsrf, TEST_USERS } from './fixtures.js'
import { request as playwrightRequest } from '@playwright/test'

// ============================================================
// PG.A.1 — Penugasan manager writes trainer.penugasanPengajar[].
//
// VERIFY (docs/PENUGASAN_MILESTONES.md PG.A.1):
// -> admin creates assignment via UI, refresh, row persists;
// -> validator rejects mismatched/empty input with pinned copy;
// -> readCached('trainer') contains the row (store state, not just text).
// ============================================================

const APP = 'http://localhost:5173'
const TRAINER_ID = 'trn-test-1'
const CABANG_ID = 'cbg-test-pusat'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function seedSchoolAsSuperadmin(page, namaSekolah) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const res = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: `skl-PGA-${Date.now()}`, nama: namaSekolah, spp: 500000, cabangId: CABANG_ID, action: 'create' },
  })
  if (!res.ok()) throw new Error(`seed sekolah failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

async function cleanupAssignment(page, sekolahId) {
  // Fresh API context (own cookie jar + network stack): the test's own
  // context repeatedly wedged its page.request pipeline late in this long
  // test (login POST 60s timeout, request never reached healthy PHP/Vite —
  // root cause Unverified, see AP.B.1 DONE record). A new context is both
  // the discriminating experiment and immune to wedged-renderer fallout.
  const api = await playwrightRequest.newContext({ baseURL: 'http://localhost:5173' })
  try {
    const login = await api.post('/api/auth/login.php', {
      data: { username: TEST_USERS.superadmin.username, password: TEST_USERS.superadmin.password },
      headers: { 'Content-Type': 'application/json' },
    })
    if (!login.ok()) throw new Error(`cleanup login -> ${login.status()}`)
    const setCookie = login.headers()['set-cookie'] || ''
    const m = setCookie.match(/afterschola_session=([^;]+)/)
    const cookieHeader = m ? `afterschola_session=${m[1]}` : ''
    const csrfRes = await api.get('/api/auth/csrf.php', { headers: cookieHeader ? { Cookie: cookieHeader } : {} })
    if (!csrfRes.ok()) throw new Error('cleanup csrf failed')
    const csrf = (await csrfRes.json()).csrfToken
    const hdrs = { 'X-CSRF-Token': csrf }
    if (cookieHeader) hdrs.Cookie = cookieHeader
    const listRes = await api.get('/api/read.php?entity=trainer', { headers: hdrs })
    if (!listRes.ok()) return
    const list = await listRes.json()
    const current = list.find(t => t.id === TRAINER_ID)
    if (!current) return
    const next = (current.penugasanPengajar || []).filter(a => a && a.sekolahId !== sekolahId)
    if (next.length === (current.penugasanPengajar || []).length) return
    const { cabangId: _omit, ...rest } = current
    await api.post('/api/trainer.php', {
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      data: { ...rest, id: TRAINER_ID, action: 'update', penugasanPengajar: next },
    })
    // Hermetic suites: remove the temp school too (it holds no siswa).
    await api.post('/api/sekolah.php', {
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      data: { action: 'delete', id: sekolahId },
    })
  } finally {
    await api.dispose()
  }
}

test('PG.A.1: admin creates active assignment via UI, persists across refresh', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const sekolah = await seedSchoolAsSuperadmin(page, `SD PGA Sim ${suffix}`)
  const sekolahId = sekolah.id

  try {
    await loginViaApi(page, 'superadmin')
    await gotoApp(page)
    await openTab(page, 'Penugasan Pengajar')

    await expect(page.getByRole('heading', { name: 'Penugasan Pengajar' })).toBeVisible()
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').nth(0).selectOption(sekolahId)
    await dialog.locator('select').nth(1).selectOption(TRAINER_ID)
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()

    await expect(page.getByRole('cell', { name: `SD PGA Sim ${suffix}` }).first()).toBeVisible({ timeout: 15000 })

    // Persistensi: refresh penuh, baris harus terbaca kembali dari server.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('cell', { name: `SD PGA Sim ${suffix}` }).first()).toBeVisible({ timeout: 15000 })

    // Invariant tersembunyi: store/server state, bukan cuma teks tabel.
    const storeState = await page.evaluate(() => {
      const raw = localStorage.getItem('afterschola_v4_trainer')
      const trainers = raw ? JSON.parse(raw) : []
      const host = trainers.find(t => t.id === 'trn-test-1')
      return (host && host.penugasanPengajar) || []
    })
    expect(storeState.some(a => a.sekolahId === sekolahId && a.trainerId === TRAINER_ID && a.aktif === true)).toBe(true)

    const readRes = await page.request.get('/api/read.php?entity=trainer')
    expect(readRes.ok()).toBe(true)
    const rows = await readRes.json()
    const host = rows.find(t => t.id === TRAINER_ID)
    expect(host.penugasanPengajar.some(a => a.sekolahId === sekolahId && a.trainerId === TRAINER_ID && a.aktif === true)).toBe(true)

    expect(pageErrors).toEqual([])
  } finally {
    await cleanupAssignment(page, sekolahId)
  }
})

// AP.B.1 (D-AP3) — dynamic Tindakan per status + Edit persistence +
// Aktifkan restore. Appended per AUTO_PENUGASAN_MILESTONES.md (extend,
// same file); the PG.A.1 test above is untouched.
test('AP.B.1: manager actions follow status; edit persists; activate restores', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const sekolah = await seedSchoolAsSuperadmin(page, `SD APB Sim ${suffix}`)
  const sekolahId = sekolah.id

  async function serverRows() {
    const res = await page.request.get('/api/read.php?entity=trainer')
    if (!res.ok()) throw new Error('read trainer failed')
    const host = (await res.json()).find(t => t.id === TRAINER_ID)
    return (host.penugasanPengajar || []).filter(a => a && a.sekolahId === sekolahId)
  }

  try {
    await loginViaApi(page, 'superadmin')
    await gotoApp(page)
    await openTab(page, 'Penugasan Pengajar')
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').nth(0).selectOption(sekolahId)
    await dialog.locator('select').nth(1).selectOption(TRAINER_ID)
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
    const row = page.locator('tbody tr', { hasText: `SD APB Sim ${suffix}` }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    const idBefore = (await serverRows()).map(a => a.id)
    expect(idBefore.length).toBe(1)

    // Edit reuses the modal pre-filled; change asisten only (no conditional
    // fields — deterministic). Row id must be preserved.
    await row.getByRole('button', { name: 'Edit', exact: true }).click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toContainText('Edit Penugasan')
    await editDialog.locator('select').nth(2).selectOption({ label: 'Trainer Test Dua' })
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
    await page.waitForTimeout(800)
    const afterEdit = await serverRows()
    expect(afterEdit.length).toBe(1)
    expect(afterEdit[0].id).toBe(idBefore[0])
    const trainersAll = await page.request.get('/api/read.php?entity=trainer').then(r => r.json())
    const asistenId = trainersAll.find(t => t.nama === 'Trainer Test Dua').id
    expect(afterEdit[0].asistenId).toBe(asistenId)

    // Deactivate -> actions become Edit + Aktifkan + Hapus.
    const row2 = page.locator('tbody tr', { hasText: `SD APB Sim ${suffix}` }).first()
    await row2.getByRole('button', { name: 'Nonaktifkan', exact: true }).click()
    await expect(row2.getByText('Nonaktif')).toBeVisible({ timeout: 15000 })
    await expect(row2.getByRole('button', { name: 'Aktifkan', exact: true })).toBeVisible()
    await expect(row2.getByRole('button', { name: 'Hapus', exact: true })).toBeVisible()
    await expect(row2.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    expect(await row2.getByRole('button', { name: 'Nonaktifkan', exact: true }).count()).toBe(0)

    // Hapus confirm copy check (cancel — no state change).
    await row2.getByRole('button', { name: 'Hapus', exact: true }).click()
    await expect(page.getByText('Riwayat absensi tidak ikut terhapus.')).toBeVisible()
    await page.getByRole('button', { name: 'Batal', exact: true }).click()
    expect((await serverRows()).length).toBe(1)

    // Aktifkan restores gating actions.
    await row2.getByRole('button', { name: 'Aktifkan', exact: true }).click()
    await page.getByRole('button', { name: 'Aktifkan', exact: true }).last().click()
    await expect(row2.getByText('Aktif', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(row2.getByRole('button', { name: 'Nonaktifkan', exact: true })).toBeVisible()

    expect(pageErrors).toEqual([])

    // Safety net: no overlay may stay open into finally (the app Modal has
    // no Escape handling; an open dialog here wedged a prior run's cleanup).
    const batal = page.getByRole('button', { name: 'Batal', exact: true })
    if (await batal.count()) await batal.first().click()

    // Heartbeat: proves the renderer answers entering finally (discriminates
    // wedged-renderer vs transport hang if cleanup still stalls). Never fails.
    try {
      const beat = await page.evaluate(
        () => new Promise(r => setTimeout(() => r('alive'), 500)), null, { timeout: 10000 },
      )
      console.log('## AP.B.1 renderer heartbeat:', beat)
    } catch (e) {
      console.log('## AP.B.1 renderer heartbeat FAILED:', String(e.message || e).slice(0, 120))
    }
  } finally {
    await cleanupAssignment(page, sekolahId)
  }
})

// DC.C.2 (F-DC3; D-DC3) — Asisten 2 persists server-side via asistenIds
// and renders joined in the manager table. Self-contained: seeds its own
// school + two assistant trainers (created/deleted as adminCabang, the
// only role that may create trainers), host is the canonical trn-test-1.
test('DC.C.2: Asisten 2 persists via asistenIds and renders joined', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const sekolah = await seedSchoolAsSuperadmin(page, `SD PGC2 Sim ${suffix}`)
  const sekolahId = sekolah.id
  const asisten1Id = `trn-PGC2A-${suffix}`
  const asisten2Id = `trn-PGC2B-${suffix}`
  const asisten1Nama = `Asisten Satu PGC2 ${suffix}`
  const asisten2Nama = `Asisten Dua PGC2 ${suffix}`

  async function createAssistant(id, nama) {
    await loginViaApi(page, 'adminCabang')
    const csrf = await primeCsrf(page)
    const res = await page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id, nama, honor: 50000, tipePengajar: 'asisten', sekolahIds: [], action: 'create' },
    })
    if (!res.ok()) throw new Error(`create assistant failed: ${res.status()} ${await res.text()}`)
  }

  try {
    await createAssistant(asisten1Id, asisten1Nama)
    await createAssistant(asisten2Id, asisten2Nama)

    await loginViaApi(page, 'superadmin')
    await gotoApp(page)
    await openTab(page, 'Penugasan Pengajar')
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').nth(0).selectOption(sekolahId)
    await dialog.locator('select').nth(1).selectOption(TRAINER_ID)
    await dialog.locator('select').nth(2).selectOption({ label: asisten1Nama })
    // Asisten 2 is the 4th select (Sekolah, Instruktur, Asisten, Asisten 2).
    await dialog.locator('select').nth(3).selectOption({ label: asisten2Nama })
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()

    const row = page.locator('tbody tr', { hasText: `SD PGC2 Sim ${suffix}` }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row).toContainText(`${asisten1Nama}, ${asisten2Nama}`)

    const readRes = await page.request.get('/api/read.php?entity=trainer')
    expect(readRes.ok()).toBe(true)
    const host = (await readRes.json()).find(t => t.id === TRAINER_ID)
    const saved = (host.penugasanPengajar || []).find(a => a && a.sekolahId === sekolahId)
    expect(saved).toBeTruthy()
    expect(saved.asistenId).toBe(asisten1Id)
    expect(saved.asistenIds).toEqual([asisten2Id])

    expect(pageErrors).toEqual([])
  } finally {
    await cleanupAssignment(page, sekolahId)
    for (const id of [asisten1Id, asisten2Id]) {
      await loginViaApi(page, 'adminCabang')
      const csrf = await primeCsrf(page)
      await page.request.post('/api/trainer.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { id, action: 'delete' },
      })
    }
  }
})
