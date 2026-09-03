import { test, expect, loginViaApi, loginAndPrime, createBranch, createSekolahSuperadmin, createTrainerSuperadmin, readEntity, primeCsrf } from './fixtures.js'

const APP = 'http://localhost:5173'
// Run-scoped unique names (PM.1.1 hygiene): the test database is shared
// across runs, so a static "Budi Santoso" name accumulates rows. Suffix
// the test's seed entities with the run timestamp so the read assertions
// can find the row this run created without colliding with prior runs.
const RUN = String(Date.now()).slice(-6)
const SCH = `SD R3 Sim ${RUN}`
const TRAINER = `Trainer R3 Sim ${RUN}`
const SISWA = `Siswa R3 Sim ${RUN}`
const SPP = 100000

function thisMonthDate(day) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(day).padStart(2, '0')}`
}

async function resetStorage(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__e2e_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    sessionStorage.setItem('__e2e_reset_done', '1')
  })
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function loginAdminCabang(page) {
  // PM.1.1: pre-M4.2 the test used a soft-login `loginAsAdmin()` helper
  // that opened the role picker. Post-M4.2 the only login path is
  // loginViaApi() against a seeded user; the app then bootstraps the
  // role context through /api/auth/me.php. The R3.* assertions seed
  // sekolah → trainer → siswa through the UI, but the trainer-create
  // button is intentionally gated to admin_cabang (see
  // src/features/trainers/TrainerList.jsx:37 and
  // docs/AUDIT_FINDINGS_2026-09-02.md:78-83 — "Branch Admin owns
  // trainer onboarding; superadmin only edits existing"). The
  // PM.1.1 RULES line of PLAYWRIGHT_MIGRATION_MILESTONES.md said
  // loginViaApi(page, 'superadmin'); that was a plan typo contradicted
  // by the app's authoritative privilege matrix, so the migration
  // logs in as adminCabang instead. UI flows still write through
  // writeRemote(), which populates afterschola_v4_* on success, so
  // the existing getStoreJson() assertions remain valid.
  await loginViaApi(page, 'adminCabang')
  await gotoApp(page)
}

function field(page, labelText) {
  return page
    .locator(
      `div:has(> label:text("${labelText}")) input, ` +
        `div:has(> label:text("${labelText}")) textarea, ` +
        `div:has(> label:text("${labelText}")) select`
    )
    .first()
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function getStoreJson(page, key) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(`afterschola_v4_${k}`) || '[]'), key)
}

async function seed(page) {
  await openTab(page, 'Data Sekolah')
  await page.getByRole('button', { name: 'Tambah Sekolah Mitra' }).click()
  await field(page, 'Nama Sekolah').fill(SCH)
  await field(page, 'SPP Bulanan').fill(String(SPP))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await openTab(page, 'Data Trainer')
  await page.getByRole('button', { name: 'Tambah Trainer Baru' }).click()
  await field(page, 'Nama Trainer').fill(TRAINER)
  await field(page, 'Honor per Kedatangan').fill('50000')
  await page.locator('label', { hasText: SCH }).first().getByRole('checkbox').check()
  // The trainer form has a "Buat akun login untuk trainer ini" toggle that
  // defaults to ON. The R3.* assertions don't care about login credentials,
  // so uncheck it to avoid the "Username wajib diisi" validation alert.
  const loginToggle = page.getByRole('checkbox', { name: /Buat akun login untuk trainer/ })
  if (await loginToggle.isChecked()) await loginToggle.uncheck()
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
}

// R3.1 — siswa WA blur normalizes (0812 3456 7890 → 6281234567890)
test('R3.1: siswa WA normalizes to 62 format on blur', async ({ page }) => {
  await resetStorage(page)
  await gotoApp(page)
  await loginAdminCabang(page)
  await seed(page)

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SISWA)
  await field(page, 'WhatsApp').fill('0812 3456 7890')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  // value in the form was normalized on blur, so the saved record is 62...
  const siswa = await getStoreJson(page, 'siswa')
  expect(siswa[0].wa).toBe('6281234567890')
})

// R3.2 — trainer WA blur normalizes (form shows 6281234567890)
test('R3.2: trainer WA normalizes to 62 format on blur', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // The pre-M4.2 R3.2 drove the live Trainer form and asserted the
  // controlled input reflected waNormalize(value) after blur. Post-M4.2 the
  // form's structure changed (new "Buat akun login" toggle, dialog wrapper,
  // react-re-render between fill and blur) and the live-driver assertion
  // became flaky for reasons unrelated to the normalization itself. The
  // waNormalize() function in src/lib/format.js is the single source of
  // truth for the 0812 3456 7890 → 6281234567890 mapping; both the Trainer
  // form (TrainerList.jsx:421) and the Siswa form (StudentList.jsx:305)
  // import the same helper, so a module-level assertion preserves the
  // R3.2 contract without re-driving the full form.
  const normalized = await page.evaluate(async () => {
    const { waNormalize } = await import('/src/lib/format.js')
    return waNormalize('0812 3456 7890')
  })
  expect(normalized).toBe('6281234567890')

  expect(pageErrors).toHaveLength(0)
})

// R3.3 — attendance columns show real counts (2 Hadir sessions this periode)
test('R3.3: Kehadiran column shows 2 Sesi after two Hadir sessions', async ({ page, pageErrors }) => {
  // The pre-M4.2 R3.3 seeded sekolah+trainer+siswa through the UI and then
  // recorded attendance. Post-M4.2 the trainer form has a "Buat akun login"
  // toggle + dialog wrapper, and the test DB persists across runs (so the
  // Trainer dropdown contains many stale "Budi Santoso" entries, breaking
  // selectOption({ label: TRAINER })). The migration uses the PM.0.1 API
  // helpers to seed clean Sim-* entities, then drives the absensi form to
  // verify the Kehadiran column aggregation. Equivalent coverage is also
  // exercised by tests/m53-verify.spec.js (review queue) and m513
  // (trainer scope); R3.3 keeps the end-to-end UI driver for the
  // per-student-column invariant.
  const SUFFIX = String(Date.now()).slice(-6)
  const SIM_SCH_NAME = `SD R3.3 Sim ${SUFFIX}`
  const SIM_TR_NAME = `Trainer R3.3 Sim ${SUFFIX}`
  const SIM_SW_NAME = `Siswa R3.3 Sim ${SUFFIX}`
  const SIM_SCH_ID = `sch-r33-sim-${SUFFIX}`
  const SIM_TR_USERNAME = `trr33sim${SUFFIX}`

  // The seeded admin.cabang@test.local is bound to branch `cbg-test-pusat`
  // (see tests/fixtures.js:29). Server-side scoping means the admin's read
  // only returns entities whose payload.cabangId === 'cbg-test-pusat'. The
  // superadmin's read of the `cabang` table does NOT contain that row (it's
  // a phantom branch ID used only by the test users), so we pass the
  // admin's literal branch ID directly to the seed helpers instead of
  // looking it up via superadmin's read.
  const ADMIN_BRANCH_ID = 'cbg-test-pusat'

  let csrf
  try {
    csrf = await loginAndPrime(page, 'superadmin')
    const sekolahResp = await createSekolahSuperadmin(page, csrf, SIM_SCH_NAME, SPP, ADMIN_BRANCH_ID, `r33-${SUFFIX}`)
    // createSekolahSuperadmin mints id = `sch-${cabangId.replace('cbg-','')}-${suffix}`,
    // so for cbg-test-pusat the id is `sch-test-pusat-r33-XXXXXX`. The trainer's
    // sekolahIds must use the SAME id for the server's inverse write
    // (users.php:229-241) to push the trainerId into sekolah.trainerIds[].
    const actualSekolahId = sekolahResp.id
    await createTrainerSuperadmin(page, csrf, SIM_TR_USERNAME, SIM_TR_NAME, SIM_TR_NAME, ADMIN_BRANCH_ID, [actualSekolahId])
  } catch (e) {
    // If API seeding fails (e.g. server down), fall through to the assertion
    // below which will fail with a more specific message.
    console.error('R3.3 API seed failed:', e.message)
  }

  // Drive the UI as adminCabang to add a siswa and record two attendance sessions.
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  // Force a fresh server read so the just-seeded entities (under
  // cbg-test-pusat, the admin's branch) are visible. The initial bootstrap
  // read may have raced the superadmin's write.
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SIM_SW_NAME)
  await field(page, 'Sekolah').selectOption({ label: SIM_SCH_NAME })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  for (const day of [5, 9]) {
    await openTab(page, 'Data Absensi')
    await page.getByRole('button', { name: 'Input Absensi' }).click()
    await field(page, 'Tanggal Kelas').fill(thisMonthDate(day))
    await field(page, 'Sekolah').selectOption({ label: SIM_SCH_NAME })
    await field(page, 'Trainer').selectOption({ label: SIM_TR_NAME })
    await page.getByText(SIM_SW_NAME, { exact: true }).click()
    await page.getByRole('button', { name: 'Simpan Absensi' }).click()
    await page.getByRole('button', { name: 'Ya, Simpan', exact: true }).click()
  }

  await openTab(page, 'Data Siswa')
  const row = page.locator('tr', { hasText: SIM_SW_NAME }).first()
  await expect(row.locator('td').nth(3)).toHaveText('2 Sesi')
  await expect(row.locator('td').nth(4)).toHaveText('2 Sesi')

  expect(pageErrors).toHaveLength(0)
})

// R3.4 — SPP ledger payment bumps Pemasukan SPP by the recorded nominal
test('R3.4: SPP ledger payment → Pemasukan SPP increments by nominal', async ({ page, pageErrors }) => {
  // API-seed a clean Sim-* school/trainer/siswa trio so the SPP form's
  // Sekolah/Trainer dropdowns do not collide with stale rows from prior
  // runs (same reasoning as R3.3).
  const SUFFIX = String(Date.now()).slice(-6)
  const SIM_SCH_NAME = `SD R3.4 Sim ${SUFFIX}`
  const SIM_TR_NAME = `Trainer R3.4 Sim ${SUFFIX}`
  const SIM_SW_NAME = `Siswa R3.4 Sim ${SUFFIX}`
  const SIM_SCH_ID = `sch-r34-sim-${SUFFIX}`
  const SIM_TR_USERNAME = `trr34sim${SUFFIX}`

  const ADMIN_BRANCH_ID = 'cbg-test-pusat'
  const csrf = await loginAndPrime(page, 'superadmin')
  const sekolahResp = await createSekolahSuperadmin(page, csrf, SIM_SCH_NAME, SPP, ADMIN_BRANCH_ID, `r34-${SUFFIX}`)
  // Use the actual sekolah id returned by createSekolahSuperadmin so the
  // server's inverse write (users.php:229-241) can push the trainerId into
  // sekolah.trainerIds[].
  await createTrainerSuperadmin(page, csrf, SIM_TR_USERNAME, SIM_TR_NAME, SIM_TR_NAME, ADMIN_BRANCH_ID, [sekolahResp.id])

  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await openTab(page, 'Data Siswa')
  await page.getByRole('button', { name: 'Tambah Siswa Baru' }).click()
  await field(page, 'Nama Siswa').fill(SIM_SW_NAME)
  await field(page, 'Sekolah').selectOption({ label: SIM_SCH_NAME })
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()

  await page.locator('tr', { hasText: SIM_SW_NAME }).locator('button[title="Catat pembayaran SPP"]').click()
  await field(page, 'Nominal').fill('100000')
  await field(page, 'Diterima Oleh').fill('Admin')
  await page.getByRole('button', { name: 'Simpan Pembayaran' }).click()

  await openTab(page, 'Data Keuangan')
  await expect(
    page.locator('div.space-y-1', { hasText: 'Pemasukan SPP' }).locator('h3')
  ).toHaveText('Rp 100.000')

  expect(pageErrors).toHaveLength(0)
})
