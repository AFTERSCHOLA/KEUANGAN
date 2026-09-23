// Full 8-step multi-role flow simulation (Superadmin -> Cabang+Admin ->
// Sekolah -> 5 Siswa -> Trainer+account -> Trainer Absensi + verify/finance).
// Deliberately NOT part of CI — exploratory audit sim, run on demand:
//   npx playwright test tests/sim-full-flow.spec.js --project=default --workers=1
// Findings print as "## FINDING:" so the run log doubles as the audit report.
// Sim-marked entities (Sim + timestamp suffix) stay identifiable for cleanup.
import { test, expect, loginViaApi } from './fixtures.js'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const todayName = DAY_NAMES[new Date().getDay()]
const localToday = (() => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
})()

function logFinding(text) {
  console.log('## FINDING:', text)
}

function fieldInput(page, label) {
  return page.locator(`div:has(> label:text-is("${label}"))`).first().locator('input').first()
}
function fieldSelect(page, label) {
  return page.locator(`div:has(> label:text-is("${label}"))`).first().locator('select').first()
}
function fieldTextarea(page, label) {
  return page.locator(`div:has(> label:text-is("${label}"))`).first().locator('textarea').first()
}

async function waitForHydration(page) {
  // PROBE 2026-09-22: on a wiped DB the cabang cache hydrates as `[]`
  // (key exists, length 0). Wait for key EXISTENCE, not non-empty —
  // requiring length>0 times out forever on empty DB and hung the first run.
  await page.waitForFunction(() => localStorage.getItem('afterschola_v4_cabang') !== null, { timeout: 15000 })
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

async function uiLogin(page, username, password) {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  // Hang-proof: if we are still authenticated (dashboard, no login form),
  // force a browser-side logout instead of waiting the full test budget.
  const userField = page.getByLabel('Username')
  if (!(await userField.count())) {
    await page.context().clearCookies()
    await page.request.post('/api/auth/logout.php').catch(() => {})
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  }
  await userField.waitFor({ timeout: 15000 })
  await userField.fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Masuk', exact: true }).click()
}

async function completeMustChange(page, currentPass, newPass) {
  await expect(page.getByRole('heading', { name: 'Ubah Kata Sandi' })).toBeVisible({ timeout: 15000 })
  await page.getByLabel('Kata Sandi Saat Ini').fill(currentPass)
  await page.getByLabel('Kata Sandi Baru').fill(newPass)
  await page.getByLabel('Konfirmasi Kata Sandi Baru').fill(newPass)
  await page.getByRole('button', { name: 'Simpan Kata Sandi' }).click()
}

async function uiLogout(page) {
  // AccountMenu.jsx:44-109 — "Keluar" is a menuitem inside the "Akun"
  // avatar dropdown, not a top-level button. Open the menu first.
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

test('sim full flow: superadmin -> cabang+admin -> sekolah -> siswa -> trainer -> absensi', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const SUFFIX = String(Date.now()).slice(-6)
  const CABANG_NAMA = `Cabang Sim ${SUFFIX}`
  const CABANG_KODE = `SM${SUFFIX.slice(-4)}`.toUpperCase()
  const ADMIN_USER = `sim.admin.${SUFFIX}`
  const ADMIN_NAME = `Admin Sim ${SUFFIX}`
  const ADMIN_NEW_PASS = `SimAdmin123!${SUFFIX.slice(-2)}AB`
  const SEKOLAH_NAMA = `SDN Sim ${SUFFIX}`
  const SISWA_NAMES = [1, 2, 3, 4, 5].map(i => `Siswa Sim ${SUFFIX}-${i}`)
  const TRAINER_NAME = `Trainer Sim ${SUFFIX}`
  const TRAINER_USER = `sim.trainer.${SUFFIX}`
  const TRAINER_NEW_PASS = `SimTrn123!${SUFFIX.slice(-2)}AB`

  let adminInitPass = null
  let trainerInitPass = null
  let cabangId = null
  let sekolahId = null

  // ---- STEP 1: Superadmin (seeded via npm run setup; no UI to create one) ----
  console.log(`=== STEP 1: Superadmin login (suffix ${SUFFIX}) ===`)
  await loginViaApi(page, 'superadmin')
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Data Cabang' })).toBeVisible({ timeout: 20000 })
  await waitForHydration(page)
  console.log('OK step1: seeded superadmin reaches dashboard.')
  logFinding('Step 1 note: Superadmin accounts have no creation UI by design — they are bootstrapped via `npm run setup` (docs/RUN_LOCALLY.md). "Create Superadmin" in-app would contradict USER_PROVISIONING.md; seed + login is the correct path.')

  // ---- STEP 2: Create Cabang + Admin Cabang account (BranchManager UI) ----
  console.log('=== STEP 2: Buat Cabang + Admin Cabang ===')
  await page.getByRole('button', { name: 'Data Cabang' }).click()
  await page.getByRole('button', { name: 'Tambah Cabang' }).click()
  await fieldInput(page, 'Nama Cabang').fill(CABANG_NAMA)
  await fieldInput(page, 'Kode Cabang').fill(CABANG_KODE)
  const createAdminBox = page.locator('label', { hasText: 'Buat akun Admin Cabang untuk cabang ini' }).locator('input[type="checkbox"]')
  if (await createAdminBox.count() && !(await createAdminBox.isChecked())) await createAdminBox.check()
  await fieldInput(page, 'Nama Admin Cabang').fill(ADMIN_NAME)
  await fieldInput(page, 'Username Login Admin').fill(ADMIN_USER)
  await page.getByRole('button', { name: 'Simpan' }).click()
  // initial-password dialog: two readonly inputs (username, password)
  const pwdDialog = page.getByRole('heading', { name: 'Akun Admin Cabang Berhasil Dibuat' })
  if (await pwdDialog.count()) {
    const readonlyInputs = page.locator('.fixed.inset-0 input[readonly]')
    adminInitPass = await readonlyInputs.nth(1).inputValue()
    console.log(`admin account created: ${ADMIN_USER} / init-pass len=${adminInitPass?.length}`)
    await page.getByRole('button', { name: 'Saya sudah catat, tutup' }).click()
  } else {
    const alert = page.locator('.fixed.inset-0 h4')
    if (await alert.count()) {
      logFinding(`Cabang+admin save blocked by alert: "${await alert.textContent()}" (src/features/admin/BranchManager.jsx:95-175).`)
      await clearOverlays(page)
    } else {
      logFinding('Akun Admin Cabang dialog did not appear and no alert — save may have failed silently (BranchManager.jsx:170-175).')
    }
  }
  await expect(page.getByText(CABANG_NAMA).first()).toBeVisible({ timeout: 15000 })
  // backend wiring: cabang row exists server-side
  try {
    const csrf = await primeCsrf(page)
    const cabangs = await readViaApi(page, 'cabang', csrf)
    const row = cabangs.find(c => c.nama === CABANG_NAMA || c.kode === CABANG_KODE)
    if (row) { cabangId = row.id; console.log(`OK step2 backend: cabang row id=${cabangId}`) }
    else logFinding('Cabang visible in UI but NOT returned by GET /api/read.php?entity=cabang — cache/server drift (src/lib/store.js).')
  } catch (e) { logFinding(`Step2 backend check failed: ${e.message}`) }
  if (!adminInitPass) logFinding('Admin initial password was not captured — cannot continue trainer-login steps without it.')

  // ---- STEP 3: Logout + login as new Admin Cabang (incl. must-change-password) ----
  console.log('=== STEP 3: Logout superadmin, login Admin Cabang ===')
  await clearOverlays(page)
  await uiLogout(page)
  await uiLogin(page, ADMIN_USER, adminInitPass)
  try {
    await completeMustChange(page, adminInitPass, ADMIN_NEW_PASS)
  } catch { logFinding('MustChangePasswordPage did not appear for fresh admin — check users.must_change_password flag (src/features/auth/MustChangePasswordPage.jsx:13-18).') }
  await expect(page.getByRole('button', { name: 'Data Sekolah' })).toBeVisible({ timeout: 20000 })
  await waitForHydration(page)
  if (await page.getByRole('button', { name: 'Data Cabang' }).count()) logFinding('Admin Cabang still sees "Data Cabang" nav — privilege leak (SCOPE_EXPANSION_PRIVILEGES.md: Cabang management superadmin-only).')
  else console.log('OK step3: Data Cabang hidden for admin_cabang; session scoped to own branch.')

  // ---- STEP 4: As Admin Cabang, create new School ----
  console.log('=== STEP 4: Buat Sekolah Test ===')
  await page.getByRole('button', { name: 'Data Sekolah' }).click()
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await fieldSelect(page, 'Cabang').selectOption({ label: `${CABANG_NAMA} (${CABANG_KODE})` })
  await fieldInput(page, 'Nama Sekolah').fill(SEKOLAH_NAMA)
  await fieldTextarea(page, 'Alamat').fill(`Jl. Simulasi No. ${SUFFIX}`)
  await page.getByRole('button', { name: '+ Tambah Jadwal' }).click()
  await page.getByRole('button', { name: '+ Tambah Jadwal' }).click()
  const schedRows = page.locator('div.space-y-2 > .flex.gap-2.items-center')
  await schedRows.nth(0).locator('select').selectOption(todayName)
  await schedRows.nth(0).getByLabel('Jam mulai').fill('15:30')
  await schedRows.nth(0).getByLabel('Jam selesai').fill('17:00')
  await schedRows.nth(1).locator('select').selectOption('Sabtu')
  await schedRows.nth(1).getByLabel('Jam mulai').fill('09:00')
  await schedRows.nth(1).getByLabel('Jam selesai').fill('10:30')
  await page.locator('div:has(> label:text-is("SPP Bulanan"))').first().locator('input').fill('150000')
  await page.getByRole('button', { name: 'Simpan' }).click()
  if (await page.getByText(SEKOLAH_NAMA).count()) console.log('OK step4: school card visible.')
  else logFinding('School save gave no visible card — check SchoolList.jsx:99-120 validation guards (Nama/Cabang/Jadwal).')
  try {
    const csrf = await primeCsrf(page)
    const schools = await readViaApi(page, 'sekolah', csrf)
    const row = schools.find(s => s.nama === SEKOLAH_NAMA)
    if (row) { sekolahId = row.id; console.log(`OK step4 backend: sekolah id=${sekolahId} cabangId=${row.cabangId}`) }
    else logFinding('Sekolah visible in UI but missing from GET /api/read.php?entity=sekolah.')
  } catch (e) { logFinding(`Step4 backend check failed: ${e.message}`) }

  // ---- STEP 5: Input 5 test students ----
  console.log('=== STEP 5: Input 5 Siswa Test ===')
  await page.getByRole('button', { name: 'Data Siswa' }).click()
  for (let i = 0; i < SISWA_NAMES.length; i++) {
    await page.getByRole('button', { name: 'Tambah Siswa Baru' }).first().click()
    await fieldInput(page, 'Nama Siswa').fill(SISWA_NAMES[i])
    await fieldInput(page, 'Kelas').fill(String((i % 6) + 1))
    await fieldInput(page, 'WhatsApp').fill(`0812${SUFFIX}${i}`)
    await fieldSelect(page, 'Sekolah').selectOption({ label: SEKOLAH_NAMA })
    await page.getByRole('button', { name: 'Simpan' }).click()
    await page.waitForTimeout(300)
    await clearOverlays(page)
  }
  const siswaVisible = await page.getByText(SISWA_NAMES[0]).count()
  if (siswaVisible) console.log(`OK step5: first Sim student visible (${SISWA_NAMES.length} created via UI).`)
  else logFinding('Sim students not visible after save — check StudentList.jsx:79-94 save/forbidden path.')
  try {
    const csrf = await primeCsrf(page)
    const siswa = await readViaApi(page, 'siswa', csrf)
    const mine = siswa.filter(s => (s.nama || '').includes(SUFFIX))
    console.log(`OK step5 backend: ${mine.length}/5 Sim siswa rows in DB.`)
    if (mine.length < 5) logFinding(`Only ${mine.length}/5 Sim siswa persisted server-side — UI/API drift (src/features/students/StudentList.jsx:79).`)
  } catch (e) { logFinding(`Step5 backend check failed: ${e.message}`) }

  // ---- STEP 6: Create Trainer + login account ----
  console.log('=== STEP 6: Buat Trainer + akun ===')
  await page.getByRole('button', { name: 'Data Trainer' }).click()
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await fieldInput(page, 'Nama Trainer').fill(TRAINER_NAME)
  await fieldInput(page, 'WhatsApp').fill(`0813${SUFFIX}`)
  await page.locator('div:has(> label:text-is("Honor per Kedatangan"))').first().locator('input').fill('75000')
  const schoolCheck = page.locator('label', { hasText: SEKOLAH_NAMA }).locator('input[type="checkbox"]')
  if (await schoolCheck.count()) await schoolCheck.check()
  else logFinding(`Trainer form lists no checkbox for "${SEKOLAH_NAMA}" — branch scoping of Sekolah Penugasan (TrainerList.jsx:470-482).`)
  const createAccBox = page.locator('label', { hasText: 'Buat akun login untuk trainer ini' }).locator('input[type="checkbox"]')
  if (await createAccBox.count() && !(await createAccBox.isChecked())) await createAccBox.check()
  await fieldInput(page, 'Username Login').fill(TRAINER_USER)
  await page.getByRole('button', { name: 'Simpan' }).click()
  const trainerDlg = page.getByRole('heading', { name: 'Akun Trainer Berhasil Dibuat' })
  if (await trainerDlg.count()) {
    trainerInitPass = await page.locator('.fixed.inset-0 input[readonly]').nth(1).inputValue()
    console.log(`trainer account created: ${TRAINER_USER} / init-pass len=${trainerInitPass?.length}`)
    await page.getByRole('button', { name: 'Saya sudah catat, tutup' }).click()
  } else {
    const alert = page.locator('.fixed.inset-0 h4')
    logFinding(`Trainer+account dialog missing${await alert.count() ? `; alert: "${await alert.textContent()}"` : ''} (TrainerList.jsx:92-154).`)
    await clearOverlays(page)
  }
  if (await page.getByText(TRAINER_NAME).count()) console.log('OK step6: trainer card visible.')
  try {
    const csrf = await primeCsrf(page)
    const trainers = await readViaApi(page, 'trainer', csrf)
    const row = trainers.find(t => t.nama === TRAINER_NAME)
    if (row) console.log(`OK step6 backend: trainer id=${row.id} sekolahIds=${JSON.stringify(row.sekolahIds)}`)
    else logFinding('Trainer visible in UI but missing from GET /api/read.php?entity=trainer.')
  } catch (e) { logFinding(`Step6 backend check failed: ${e.message}`) }

  // ---- STEP 7+8: Login as Trainer, attendance + surrounding scenarios ----
  console.log('=== STEP 7: Logout admin, login Trainer ===')
  await clearOverlays(page)
  await uiLogout(page)
  await uiLogin(page, TRAINER_USER, trainerInitPass)
  try {
    await completeMustChange(page, trainerInitPass, TRAINER_NEW_PASS)
  } catch { logFinding('MustChangePasswordPage did not appear for fresh trainer (MustChangePasswordPage.jsx).') }
  await expect(page.getByRole('heading', { name: 'Rekap Saya' })).toBeVisible({ timeout: 20000 })
  await waitForHydration(page)
  const rekapHit = await page.getByText(SEKOLAH_NAMA).count()
  console.log(`rekap today-school hits: ${rekapHit} (today=${todayName})`)
  if (!rekapHit) logFinding(`Rekap Saya shows no "${SEKOLAH_NAMA}" though jadwalList includes ${todayName} (TrainerDashboard.jsx:8-13 scheduleIncludesToday).`)
  for (const t of ['Data Sekolah', 'Data Trainer', 'Data Pembayaran', 'Data Keuangan', 'Data Cabang', 'Overview']) {
    if (await page.getByRole('button', { name: t }).count()) logFinding(`Trainer still sees nav "${t}" — should be hidden (App.jsx role tabs).`)
  }

  console.log('=== STEP 8: Absensi + scenarios as Trainer ===')
  await page.getByRole('button', { name: 'Data Siswa' }).click()
  if (await page.getByRole('button', { name: 'Tambah Siswa Baru' }).count()) logFinding('Trainer can see Tambah Siswa Baru — should be read-only (StudentList.jsx readOnly).')
  else console.log('OK: trainer student list is read-only.')
  await page.getByRole('button', { name: 'Data Absensi' }).click()
  await fieldSelect(page, 'Sekolah').selectOption({ label: SEKOLAH_NAMA })
  const trainerOpts = await fieldSelect(page, 'Trainer').locator('option').allTextContents()
  console.log('trainer dropdown as trainer:', JSON.stringify(trainerOpts))
  if (trainerOpts.length > 2) logFinding('TRAINER IMPERSONATION: trainer dropdown offers other trainers (AttendanceForm has no identity pinning).')
  await fieldSelect(page, 'Trainer').selectOption({ label: TRAINER_NAME })
  // tap each Sim student to Hadir
  for (const nm of SISWA_NAMES) {
    const el = page.getByText(nm, { exact: true })
    if (await el.count()) await el.first().click()
  }
  const catatanBox = page.locator('div:has(> label:text-is("Catatan")) textarea, div:has(> label:text-is("Catatan")) input').first()
  if (await catatanBox.count()) await catatanBox.fill(`Sim absensi ${SUFFIX} — semua hadir`)
  await page.getByRole('button', { name: 'Simpan Absensi' }).click()
  const confirmTxt = await page.locator('.fixed.inset-0 p.text-sm').first().textContent().catch(() => '')
  console.log('attendance confirm:', confirmTxt)
  await page.getByRole('button', { name: 'Ya, Simpan' }).click()
  await page.waitForTimeout(800)
  await clearOverlays(page)
  try {
    const csrf = await primeCsrf(page)
    const abs = await readViaApi(page, 'absensi', csrf)
    const hit = abs.filter(a => a.sekolahId === sekolahId && (a.tanggal || '').slice(0, 10) === localToday)
    console.log(`OK step8 backend: ${hit.length} absensi row(s) today for Sim school; siswaList len=${hit[0]?.siswaList?.length ?? 'n/a'}`)
    if (!hit.length) logFinding('Absensi saved in UI but no matching row via GET /api/read.php?entity=absensi for today+sekolah.')
  } catch (e) { logFinding(`Step8 backend check failed: ${e.message}`) }

  // Riwayat + weekly certification probe
  await page.getByRole('navigation').getByRole('button', { name: 'Riwayat Absensi' }).click().catch(async () => {
    await page.getByRole('button', { name: 'Riwayat Absensi' }).first().click()
  })
  const certify = page.getByRole('button', { name: /nyatakan/i })
  if (await certify.count()) {
    await certify.first().click()
    await clearOverlays(page)
    console.log('OK: weekly self-certification clicked.')
  } else {
    console.log('NOTE: no weekly-certification button (already certified or none this week).')
  }

  // Back-verify as Admin Cabang: attendance visible, verify action, finance renders
  console.log('=== VERIFY as Admin Cabang ===')
  await uiLogout(page)
  await uiLogin(page, ADMIN_USER, ADMIN_NEW_PASS)
  await page.goto('/')
  await waitForHydration(page)
  await page.getByRole('button', { name: 'Data Absensi' }).click()
  const adminSeesSchool = await page.getByText(SEKOLAH_NAMA).count()
  console.log(`admin sees Sim school in absensi: ${adminSeesSchool}`)
  if (!adminSeesSchool) logFinding('Admin Cabang cannot see own-branch Sim attendance — branch scoping leak or hydration gap.')
  await page.getByRole('button', { name: 'Riwayat Absensi' }).first().click()
  const verifyBtn = page.getByRole('button', { name: 'Verifikasi' })
  console.log(`verify buttons visible to admin: ${await verifyBtn.count()}`)
  await page.getByRole('button', { name: 'Data Pembayaran' }).click()
  if (await page.locator('tbody tr', { hasText: TRAINER_NAME }).count()) console.log('OK: trainer honor row visible to admin (read scope).')
  else logFinding('Admin Cabang payment table hides Sim trainer — branch filter may be wrong (PaymentTable).')
  await page.getByRole('button', { name: 'Data Keuangan' }).click()
  if (await page.getByText(/Laba|Keuangan/).first().count()) console.log('OK: keuangan renders for admin (redacted scope per matrix).')
  else logFinding('Data Keuangan renders nothing for admin_cabang (FinanceReport).')

  // Back-verify as Superadmin: cross-branch aggregation
  console.log('=== VERIFY as Superadmin ===')
  await uiLogout(page)
  await loginViaApi(page, 'superadmin')
  await page.goto('/')
  await waitForHydration(page)
  await page.getByRole('button', { name: 'Data Sekolah' }).click()
  if (await page.getByText(SEKOLAH_NAMA).count()) console.log('OK: superadmin aggregates Sim school.')
  else logFinding('Superadmin cannot see Sim school — aggregation broken.')
  await page.getByRole('button', { name: 'Data Siswa' }).click()
  if (await page.getByText(SISWA_NAMES[0]).count()) console.log('OK: superadmin aggregates Sim siswa.')
  else logFinding('Superadmin cannot see Sim siswa.')

  console.log(`=== SIM IDS (cleanup): cabang=${cabangId} sekolah=${sekolahId} suffix=${SUFFIX} ===`)
  console.log('cleanup SQL (run if you want to remove Sim data):')
  console.log(`-- DELETE FROM users WHERE username IN ('${ADMIN_USER}','${TRAINER_USER}'); -- + delete cabang/sekolah/siswa/trainer/absensi rows containing '${SUFFIX}' via server/tests cleanup or API deletes.`)
  console.log('pageErrors:', JSON.stringify(pageErrors))
})
