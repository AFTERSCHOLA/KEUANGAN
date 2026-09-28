import { test, expect, loginViaApi, primeCsrf, TEST_USERS } from './fixtures.js'
import { request as playwrightRequest } from '@playwright/test'

// PS.B.1 VERIFY (persists per taste #16): scoped assignment renders only
// its exact slots (D-PS4); unscoped twin fans out over every slot that
// weekday. Slots ride on today's weekday so the spec stays green
// year-round (no hardcoded dates).

const APP = 'http://localhost:5173'
const CABANG_ID = 'cbg-test-pusat'
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

test('PS.B.1: scoped assignment lists 1 row where unscoped lists 2', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const todayName = DAY_NAMES[now.getDay()]
  const schoolName = `SD PSB1 ${suffix}`
  const scopedId = `trn-PSB1A-${suffix}`
  const scopedNama = `Scoped PSB1 ${suffix}`
  const wideId = `trn-PSB1B-${suffix}`
  const wideNama = `Luas PSB1 ${suffix}`

  await loginViaApi(page, 'superadmin')
  let csrf = await primeCsrf(page)
  const schRes = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      id: `skl-PSB1-${Date.now()}`, nama: schoolName, spp: 500000, cabangId: CABANG_ID, action: 'create',
      jadwalList: [
        { dayOfWeek: todayName, time: '09:00', endTime: '10:00' },
        { dayOfWeek: todayName, time: '10:00', endTime: '11:00' },
      ],
    },
  })
  if (!schRes.ok()) throw new Error(`seed sekolah: ${await schRes.text()}`)
  const sekolahId = (await schRes.json()).id

  const api = await playwrightRequest.newContext({ baseURL: 'http://localhost:5173' })
  try {
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

    for (const [id, nama] of [[scopedId, scopedNama], [wideId, wideNama]]) {
      const mk = await api.post('/api/trainer.php', {
        headers: hdrs,
        data: { id, nama, honor: 50000, tipePengajar: 'instruktur', sekolahIds: [], action: 'create' },
      })
      if (!mk.ok()) throw new Error(`create trainer ${nama}: ${await mk.text()}`)
    }
    const scopedRow = { id: `pgs-PSB1s-${suffix}`, sekolahId, trainerId: scopedId, asistenId: null, cabangId: CABANG_ID, periodeMulai: '2020-01-01', periodeSelesai: null, aktif: true, hari: todayName, jamMulai: '09:00', jamSelesai: '10:00' }
    const wideRow = { id: `pgs-PSB1w-${suffix}`, sekolahId, trainerId: wideId, asistenId: null, cabangId: CABANG_ID, periodeMulai: '2020-01-01', periodeSelesai: null, aktif: true }
    const listRes = await api.get('/api/read.php?entity=trainer', { headers: hdrs })
    const freshHosts = await listRes.json()
    for (const [id, row] of [[scopedId, scopedRow], [wideId, wideRow]]) {
      const current = freshHosts.find(t => t.id === id)
      const { cabangId: _omitHost, ...hostRest } = current
      const put = await api.post('/api/trainer.php', {
        headers: hdrs,
        data: { ...hostRest, id, action: 'update', penugasanPengajar: [row] },
      })
      if (!put.ok()) throw new Error(`seed assignment ${id}: ${await put.text()}`)
    }

    await loginViaApi(page, 'superadmin')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('navigation').getByRole('button', { name: 'Jadwal Penugasan', exact: true }).click()
    const scopedRows = page.locator('tbody tr', { hasText: scopedNama })
    const wideRows = page.locator('tbody tr', { hasText: wideNama })
    await expect(scopedRows).toHaveCount(1)
    await expect(scopedRows.first()).toContainText('09:00–10:00')
    await expect(wideRows).toHaveCount(2)

    expect(pageErrors).toEqual([])
  } finally {
    await api.dispose()
    await loginViaApi(page, 'adminCabang')
    const csrfA = await primeCsrf(page)
    for (const id of [scopedId, wideId]) {
      await page.request.post('/api/trainer.php', {
        headers: { 'X-CSRF-Token': csrfA, 'Content-Type': 'application/json' },
        data: { id, action: 'delete' },
      })
    }
    await loginViaApi(page, 'superadmin')
    csrf = await primeCsrf(page)
    await page.request.post('/api/sekolah.php', {
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      data: { action: 'delete', id: sekolahId },
    })
  }
})
