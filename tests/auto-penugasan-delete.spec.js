// AP.B.2 VERIFY (persists per taste #16): deleting the assignment removes
// only the array entry — absensiPengajar rows and honor math are untouched.
// Run: npx playwright test tests/auto-penugasan-delete.spec.js --project=default --workers=1
import { test, expect, loginViaApi } from './fixtures.js'
import { request as playwrightRequest } from '@playwright/test'
import { TEST_USERS } from './fixtures.js'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const todayName = DAY_NAMES[new Date().getDay()]

function fieldInput(page, label) {
  return page.locator(`div:has(> label:text-is("${label}"))`).first().locator('input').first()
}
function fieldSelect(page, label) {
  return page.locator(`div:has(> label:text-is("${label}"))`).first().locator('select').first()
}
async function clearOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const x = page.locator('.fixed.inset-0 .bg-blue-900 button').first()
    if (await x.count()) { await x.click(); await page.waitForTimeout(150); continue }
    let dismissed = false
    for (const label of ['Batal', 'OK']) {
      const b = page.getByRole('button', { name: label, exact: true })
      if (await b.count()) { await b.first().click(); await page.waitForTimeout(150); dismissed = true; break }
    }
    if (!dismissed) break
  }
}
async function readViaApi(page, entity, csrf) {
  const res = await page.request.get(`/api/read.php?entity=${entity}`, {
    headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
  })
  if (!res.ok()) throw new Error(`read ${entity} -> ${res.status()}`)
  const body = await res.json()
  return Array.isArray(body) ? body : (body[entity] || [])
}
async function primeCsrf(page) {
  const res = await page.request.get('/api/auth/csrf.php')
  if (!res.ok()) throw new Error(`csrf prime -> ${res.status()}`)
  return (await res.json()).csrfToken
}
async function uiLogin(page, username, password) {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  const userField = page.getByLabel('Username')
  if (!(await userField.count())) {
    await page.context().clearCookies()
    await page.request.post('/api/auth/logout.php').catch(() => {})
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  }
  await userField.waitFor({ timeout: 15000 })
  await page.waitForTimeout(1500)
  await userField.fill(username)
  await page.getByLabel('Password').fill(password)
  const masukBtn = page.getByRole('button', { name: 'Masuk', exact: true })
  await masukBtn.click()
  await page.waitForTimeout(3000)
  if (await masukBtn.count() && await masukBtn.first().isVisible().catch(() => false)) {
    await userField.fill(username)
    await page.getByLabel('Password').fill(password)
    await masukBtn.first().click()
    await expect(masukBtn).toBeHidden({ timeout: 15000 })
  }
}
async function uiLogout(page) {
  const akunBtn = page.getByLabel('Akun')
  if (await akunBtn.count()) {
    await akunBtn.first().click()
    const keluar = page.getByRole('menuitem', { name: 'Keluar' })
    await keluar.waitFor({ timeout: 10000 })
    await keluar.click()
    await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeVisible({ timeout: 15000 })
  } else {
    await page.context().clearCookies()
    await page.request.post('/api/auth/logout.php').catch(() => {})
    await page.goto('/')
  }
}
async function completeMustChange(page, currentPass, newPass) {
  await expect(page.getByRole('heading', { name: 'Ubah Kata Sandi' })).toBeVisible({ timeout: 15000 })
  await page.getByLabel('Kata Sandi Saat Ini').fill(currentPass)
  await page.getByLabel('Kata Sandi Baru', { exact: true }).fill(newPass)
  await page.getByLabel('Konfirmasi Kata Sandi Baru').fill(newPass)
  await page.getByRole('button', { name: 'Simpan Kata Sandi' }).click()
}

test('AP.B.2 assignment delete preserves attendance history and honor math', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const SUFFIX = `dl${String(Date.now()).slice(-6)}`
  const SCH = `SDN DL ${SUFFIX}`
  const TRAINER_NAME = `Trainer DL ${SUFFIX}`
  const TRAINER_USER = `dl.trn.${SUFFIX}`.toLowerCase()
  const TRAINER_PASS = 'DlSim123!456'
  let initPass = null
  let trainerId = null
  let schId = null

  // ---- 1. admin: school + trainer+account (auto-row) ----
  await loginViaApi(page, 'adminCabang')
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Data Sekolah' })).toBeVisible({ timeout: 20000 })
  await page.waitForFunction(() => localStorage.getItem('afterschola_v4_cabang') !== null, null, { timeout: 15000 })
  await page.getByRole('button', { name: 'Data Sekolah' }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  const cabangSel = fieldSelect(page, 'Cabang')
  if (await cabangSel.count()) {
    const opts = await cabangSel.locator('option').allTextContents()
    const own = opts.find(o => !o.includes('Pilih') && o.trim() !== '')
    if (own) await cabangSel.selectOption({ label: own.trim() })
  }
  await fieldInput(page, 'Nama Sekolah').fill(SCH)
  await page.getByRole('button', { name: '+ Tambah Jadwal' }).click()
  const newRow = page.locator('div.space-y-2 > .flex.gap-2.items-center').first()
  await newRow.locator('select').selectOption(todayName)
  await newRow.getByLabel('Jam mulai').fill('15:30')
  await newRow.getByLabel('Jam selesai').fill('17:00')
  await page.locator('div:has(> label:text-is("SPP Bulanan"))').first().locator('input').fill('150000')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText(SCH).first()).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: 'Data Trainer' }).click()
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await fieldInput(page, 'Nama Trainer').fill(TRAINER_NAME)
  await page.locator('div:has(> label:text-is("Honor per Kedatangan"))').first().locator('input').fill('50000')
  await page.locator('label', { hasText: SCH }).locator('input[type="checkbox"]').check()
  // CS.A.2 — pick the school's single slot so the link mints a scoped row.
  const slotBlock = page.locator(`div[aria-label="Slot untuk ${SCH}"]`)
  await expect(slotBlock).toBeVisible({ timeout: 10000 })
  await slotBlock.getByRole('checkbox', { name: new RegExp(todayName) }).check()
  const accBox = page.locator('label', { hasText: 'Buat akun login untuk trainer ini' }).locator('input[type="checkbox"]')
  if (await accBox.count() && !(await accBox.isChecked())) await accBox.check()
  await fieldInput(page, 'Username Login').fill(TRAINER_USER)
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByRole('heading', { name: 'Akun Trainer Berhasil Dibuat' })).toBeVisible({ timeout: 15000 })
  initPass = await page.locator('.fixed.inset-0 input[readonly]').nth(1).inputValue()
  await page.getByRole('button', { name: 'Saya sudah catat, tutup' }).click()

  // ---- 2. trainer: Hadir save + sync ----
  await clearOverlays(page)
  await uiLogout(page)
  await uiLogin(page, TRAINER_USER, initPass)
  await completeMustChange(page, initPass, TRAINER_PASS)
  await expect(page.getByRole('heading', { name: 'Rekap Saya' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'Absensi Saya' }).click()
  await page.locator('div:has(> label:text-is("Sekolah"))').first().locator('select').first().selectOption({ label: SCH })
  await page.getByRole('button', { name: 'Hadir', exact: true }).click()
  await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  await expect(page.getByText('Tersimpan')).toBeVisible({ timeout: 15000 })
  await page.getByLabel('Akun').first().click()
  const syncItem = page.getByRole('menuitem', { name: /Sinkronisasi/ })
  await expect(syncItem).toBeVisible({ timeout: 10000 })
  // CS.A.2 spec-assumption fix (taste #14): the Hadir save above syncs
  // directly (TA.B.2 design), so the outbox is empty and the menu item is
  // correctly disabled — there is nothing to flush. Click only when items
  // are actually pending; the API reads below stay falsifiable either way.
  if (await syncItem.isEnabled()) {
    await syncItem.click()
    await page.waitForTimeout(3000)
  } else {
    console.log('## AP.B.2 sync skipped: outbox empty (direct-sync active)')
    // The sync click would have closed the Akun menu via handle(); skipping
    // leaves it open, which would invert uiLogout's toggle below — close it.
    await page.getByLabel('Akun').first().click()
  }

  // ---- 3. admin: beban>0, Hapus assignment, beban unchanged ----
  await clearOverlays(page)
  await uiLogout(page)
  await uiLogin(page, TEST_USERS.adminCabang.username, TEST_USERS.adminCabang.password)
  await expect(page.getByRole('button', { name: 'Data Pembayaran' })).toBeVisible({ timeout: 20000 })
  await page.waitForFunction(() => localStorage.getItem('afterschola_v4_cabang') !== null, null, { timeout: 15000 })
  let csrf = await primeCsrf(page)
  let trainers = await readViaApi(page, 'trainer', csrf)
  let trow = trainers.find(t => t.nama === TRAINER_NAME)
  trainerId = trow.id
  schId = (await readViaApi(page, 'sekolah', csrf)).find(s => s.nama === SCH).id
  let abs = await readViaApi(page, 'absensiPengajar', csrf)
  let mine = abs.filter(a => a.trainerId === trainerId)
  console.log(`## AP.B.2 pre-delete absensiPengajar rows: ${mine.length}`)
  expect(mine.length).toBe(1)
  const absId = mine[0].id

  await page.getByRole('button', { name: 'Data Pembayaran' }).click()
  const payRow = page.locator('tbody tr', { hasText: TRAINER_NAME }).first()
  await expect(payRow).toBeVisible({ timeout: 15000 })
  const cellsBefore = await payRow.locator('td').allTextContents()
  console.log('## AP.B.2 payment cells before:', JSON.stringify(cellsBefore))
  expect(cellsBefore[2]).toContain('1')
  expect(cellsBefore[4]).toContain('50.000')

  await page.getByRole('button', { name: 'Penugasan Pengajar' }).click()
  const mrow = page.locator('tbody tr', { hasText: SCH }).first()
  await expect(mrow).toBeVisible({ timeout: 15000 })
  // Hapus exists only on inactive rows (D-AP3) — deactivate first.
  await mrow.getByRole('button', { name: 'Nonaktifkan', exact: true }).click()
  await expect(mrow.getByText('Nonaktif')).toBeVisible({ timeout: 15000 })
  await mrow.getByRole('button', { name: 'Hapus', exact: true }).click()
  await page.getByRole('button', { name: 'Hapus', exact: true }).last().click()
  await expect(page.locator('tbody tr', { hasText: SCH })).toHaveCount(0, { timeout: 15000 })

  abs = await readViaApi(page, 'absensiPengajar', csrf)
  mine = abs.filter(a => a.trainerId === trainerId)
  console.log(`## AP.B.2 post-delete absensiPengajar rows: ${mine.length}`)
  expect(mine.length).toBe(1)
  expect(mine[0].id).toBe(absId)

  await page.getByRole('button', { name: 'Data Pembayaran' }).click()
  const payRowAfter = page.locator('tbody tr', { hasText: TRAINER_NAME }).first()
  const cellsAfter = await payRowAfter.locator('td').allTextContents()
  console.log('## AP.B.2 payment cells after:', JSON.stringify(cellsAfter))
  expect(cellsAfter[2]).toContain('1')
  expect(cellsAfter[4]).toContain('50.000')

  // ---- 4. trainer blocked from new saves ----
  await clearOverlays(page)
  await uiLogout(page)
  await uiLogin(page, TRAINER_USER, TRAINER_PASS)
  await expect(page.getByRole('heading', { name: 'Rekap Saya' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'Absensi Saya' }).click()
  await expect(page.getByText('Tidak ada penugasan aktif')).toBeVisible({ timeout: 15000 })
  console.log('## AP.B.2 trainer blocked after delete: true')

  // ---- 5. cleanup (fresh context; ledger orphan removed out-of-band) ----
  const api = await playwrightRequest.newContext({ baseURL: 'http://localhost:5173' })
  try {
    const login = await api.post('/api/auth/login.php', {
      data: { username: TEST_USERS.adminCabang.username, password: TEST_USERS.adminCabang.password },
      headers: { 'Content-Type': 'application/json' },
    })
    if (!login.ok()) throw new Error('cleanup login failed')
    const m = (login.headers()['set-cookie'] || '').match(/afterschola_session=([^;]+)/)
    const ck = m ? `afterschola_session=${m[1]}` : ''
    const csrfRes = await api.get('/api/auth/csrf.php', { headers: ck ? { Cookie: ck } : {} })
    const csrf2 = (await csrfRes.json()).csrfToken
    const hdrs = { 'X-CSRF-Token': csrf2 }
    if (ck) hdrs.Cookie = ck
    console.log(`## AP.B.2 cleanup trainer -> ${(await api.post('/api/trainer.php', { headers: { ...hdrs, 'Content-Type': 'application/json' }, data: { action: 'delete', id: trainerId } })).status()}`)
    console.log(`## AP.B.2 cleanup sekolah -> ${(await api.post('/api/sekolah.php', { headers: { ...hdrs, 'Content-Type': 'application/json' }, data: { action: 'delete', id: schId } })).status()}`)
  } finally {
    await api.dispose()
  }
  console.log(`## AP.B.2 ledger orphan absensiPengajar id (out-of-band removal): ${absId}`)

  expect(pageErrors).toHaveLength(0)
})
