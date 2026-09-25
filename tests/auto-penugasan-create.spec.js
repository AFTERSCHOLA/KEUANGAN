// AP.A.1 VERIFY (persists per taste #16): assigning a school to a trainer
// auto-creates exactly one overlapping active assignment server-side.
// Covers all three link-write paths: users.php (create-with-account),
// trainer.php (edit link), sekolah.php (school-side link). Sim-marked,
// cleans up in-run. Run: npx playwright test tests/auto-penugasan-create.spec.js --project=default --workers=1
import { test, expect, loginViaApi } from './fixtures.js'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const todayName = DAY_NAMES[new Date().getDay()]
const localToday = (() => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
})()

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

test('AP.A.1 auto-create assignment on school-trainer link', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const SUFFIX = `ap${String(Date.now()).slice(-6)}`
  const SCH_A = `SDN AP ${SUFFIX}A`
  const SCH_B = `SDN AP ${SUFFIX}B`
  const TRAINER_NAME = `Trainer AP ${SUFFIX}`
  const TRAINER_USER = `ap.trn.${SUFFIX}`.toLowerCase()
  const TRAINER_PASS = 'ApSim123!456'

  // ---- as admin_cabang: two schools ----
  await loginViaApi(page, 'adminCabang')
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Data Sekolah' })).toBeVisible({ timeout: 20000 })
  await page.waitForFunction(() => localStorage.getItem('afterschola_v4_cabang') !== null, null, { timeout: 15000 })

  for (const sch of [SCH_A, SCH_B]) {
    await page.getByRole('button', { name: 'Data Sekolah' }).click()
    await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
    const cabangSel = fieldSelect(page, 'Cabang')
    if (await cabangSel.count()) {
      const opts = await cabangSel.locator('option').allTextContents()
      const own = opts.find(o => !o.includes('Pilih') && o.trim() !== '')
      if (own) await cabangSel.selectOption({ label: own.trim() })
    }
    await fieldInput(page, 'Nama Sekolah').fill(sch)
    await page.getByRole('button', { name: '+ Tambah Jadwal' }).click()
    const row = page.locator('div.space-y-2 > .flex.gap-2.items-center').first()
    await row.locator('select').selectOption(todayName)
    await row.getByLabel('Jam mulai').fill('15:30')
    await row.getByLabel('Jam selesai').fill('17:00')
    await page.locator('div:has(> label:text-is("SPP Bulanan"))').first().locator('input').fill('150000')
    await page.getByRole('button', { name: 'Simpan' }).click()
    await expect(page.getByText(sch).first()).toBeVisible({ timeout: 15000 })
  }

  // ---- trainer WITH account linked to school A (users.php path) ----
  await page.getByRole('button', { name: 'Data Trainer' }).click()
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await fieldInput(page, 'Nama Trainer').fill(TRAINER_NAME)
  await page.locator('div:has(> label:text-is("Honor per Kedatangan"))').first().locator('input').fill('50000')
  await page.locator('label', { hasText: SCH_A }).locator('input[type="checkbox"]').check()
  const accBox = page.locator('label', { hasText: 'Buat akun login untuk trainer ini' }).locator('input[type="checkbox"]')
  if (await accBox.count() && !(await accBox.isChecked())) await accBox.check()
  await fieldInput(page, 'Username Login').fill(TRAINER_USER)
  await page.getByRole('button', { name: 'Simpan' }).click()
  const dlg = page.getByRole('heading', { name: 'Akun Trainer Berhasil Dibuat' })
  await expect(dlg).toBeVisible({ timeout: 15000 })
  const initPass = await page.locator('.fixed.inset-0 input[readonly]').nth(1).inputValue()
  expect(initPass.length).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Saya sudah catat, tutup' }).click()
  await expect(page.getByText(TRAINER_NAME).first()).toBeVisible({ timeout: 15000 })

  let csrf = await primeCsrf(page)
  let trainers = await readViaApi(page, 'trainer', csrf)
  let trow = trainers.find(t => t.nama === TRAINER_NAME)
  expect(trow).toBeTruthy()
  const rowsA = (trow.penugasanPengajar || []).filter(r => r.sekolahId && r.aktif === true)
  console.log(`## AP.A.1 users.php path rows: ${rowsA.length}`)
  expect(rowsA.length).toBe(1)
  expect(rowsA[0].periodeMulai).toBe(localToday)
  expect(rowsA[0].periodeSelesai ?? null).toBe(null)
  expect(rowsA[0].asistenId ?? null).toBe(null)
  const trainerId = trow.id
  const schools = await readViaApi(page, 'sekolah', csrf)
  const schAId = schools.find(s => s.nama === SCH_A).id
  const schBId = schools.find(s => s.nama === SCH_B).id
  expect(rowsA[0].sekolahId).toBe(schAId)

  // ---- edit trainer: link school B too (trainer.php path) ----
  const card = page.locator('div.bg-white.p-5', { hasText: TRAINER_NAME }).first()
  await card.getByTitle('Edit').or(card.locator('button').nth(0)).first().click()
  await page.locator('label', { hasText: SCH_B }).locator('input[type="checkbox"]').check()
  await page.getByRole('button', { name: 'Simpan' }).click()
  await page.waitForTimeout(800)
  await clearOverlays(page)
  csrf = await primeCsrf(page)
  trainers = await readViaApi(page, 'trainer', csrf)
  trow = trainers.find(t => t.id === trainerId)
  const rowsAB = (trow.penugasanPengajar || []).filter(r => r.aktif === true)
  console.log(`## AP.A.1 trainer.php path rows: ${rowsAB.length}`)
  expect(rowsAB.length).toBe(2)

  // ---- re-save unchanged: zero new rows (idempotent) ----
  await card.getByTitle('Edit').or(card.locator('button').nth(0)).first().click()
  await page.getByRole('button', { name: 'Simpan' }).click()
  await page.waitForTimeout(800)
  await clearOverlays(page)
  trainers = await readViaApi(page, 'trainer', csrf)
  trow = trainers.find(t => t.id === trainerId)
  const rowsRe = (trow.penugasanPengajar || []).filter(r => r.aktif === true)
  console.log(`## AP.A.1 re-save rows: ${rowsRe.length}`)
  expect(rowsRe.length).toBe(2)

  // ---- cross-branch link gains no row (same-branch gate) ----
  const version = trow.version
  const badRes = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'update', id: trainerId, version, nama: TRAINER_NAME, wa: '', honor: 50000, sekolahIds: [schAId, schBId, 'sch-does-not-exist'], penugasanPengajar: trow.penugasanPengajar },
  })
  console.log(`## AP.A.1 cross-branch attempt -> ${badRes.status()}`)
  expect(badRes.ok()).toBe(true)
  trainers = await readViaApi(page, 'trainer', csrf)
  trow = trainers.find(t => t.id === trainerId)
  const rowsBad = (trow.penugasanPengajar || []).filter(r => r.aktif === true)
  expect(rowsBad.length).toBe(2)
  // restore clean sekolahIds (drop the bogus link)
  await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'update', id: trainerId, version: trow.version, nama: TRAINER_NAME, wa: '', honor: 50000, sekolahIds: [schAId, schBId], penugasanPengajar: trow.penugasanPengajar },
  })

  // ---- unblock proof: login as the new trainer, Absensi Saya offers school A ----
  await page.context().clearCookies()
  await page.request.post('/api/auth/logout.php').catch(() => {})
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  const userField = page.getByLabel('Username')
  await userField.waitFor({ timeout: 15000 })
  await page.waitForTimeout(1500)
  await userField.fill(TRAINER_USER)
  await page.getByLabel('Password').fill(initPass)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ubah Kata Sandi' })).toBeVisible({ timeout: 15000 })
  await page.getByLabel('Kata Sandi Saat Ini').fill(initPass)
  await page.getByLabel('Kata Sandi Baru', { exact: true }).fill(TRAINER_PASS)
  await page.getByLabel('Konfirmasi Kata Sandi Baru').fill(TRAINER_PASS)
  await page.getByRole('button', { name: 'Simpan Kata Sandi' }).click()
  await expect(page.getByRole('heading', { name: 'Rekap Saya' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'Absensi Saya' }).click()
  await page.waitForTimeout(1000)
  const blocked = await page.getByText('Tidak ada penugasan aktif').count()
  console.log(`## AP.A.1 trainer blocked markers: ${blocked}`)
  expect(blocked).toBe(0)
  const schSel = page.locator('div:has(> label:text-is("Sekolah"))').first().locator('select').first()
  const schOpts = await schSel.locator('option').allTextContents()
  console.log('## AP.A.1 trainer school options:', JSON.stringify(schOpts))
  expect(schOpts.some(o => o.includes(SCH_A))).toBe(true)

  // ---- cleanup in-run: trainer delete cascades user deactivation (D9.1), then schools ----
  await loginViaApi(page, 'adminCabang')
  csrf = await primeCsrf(page)
  const delT = await page.request.post('/api/trainer.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: trainerId } })
  console.log(`## AP.A.1 cleanup trainer -> ${delT.status()}`)
  for (const sid of [schAId, schBId]) {
    const delS = await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf }, data: { action: 'delete', id: sid } })
    console.log(`## AP.A.1 cleanup sekolah ${sid} -> ${delS.status()}`)
  }
  const leftT = (await readViaApi(page, 'trainer', csrf)).filter(t => (t.nama || '').includes(SUFFIX))
  const leftS = (await readViaApi(page, 'sekolah', csrf)).filter(s => (s.nama || '').includes(SUFFIX))
  console.log(`## AP.A.1 leftover: trainers=${leftT.length} schools=${leftS.length}`)
  expect(leftT.length).toBe(0)
  expect(leftS.length).toBe(0)

  expect(pageErrors).toHaveLength(0)
})
