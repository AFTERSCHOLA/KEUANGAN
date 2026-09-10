import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// RH.F.3 — UI import path + E2E (F-RH7, D-RH3)
//
// VERIFY (per RELEASE_HYGIENE_MILESTONES.md RH.F.3):
// trainer renders no import button; superadmin imports a seeded v4
// fixture (use-browser-data leg), /api/read.php counts match; second
// import surfaces the conflict preview.
//
// The server importer (server/api/v4-import.php) is the only write
// path asserted here — there is deliberately no localStorage-only
// import leg (R-RH8: this spec asserts only the new import surface).
//
// Data hygiene (taste testing #31, #33): every fixture id carries a
// unique per-run suffix (`-v4e-<suffix>`) so the spec is re-runnable
// without `npm run db:reset`, and every nama carries a "Sim" marker
// so leftovers stay identifiable for
// `php server/tests/_cleanup_sim_data.php --pattern=Sim --execute`.
// NOTE: absensi/sppPayments/honorPayments have no delete endpoint
// (append-only ledgers), so one row per ledger per run is
// intentionally left behind — the same accepted-leftover precedent
// as tests/photo-server-roundtrip.spec.js. The destructive commit
// runs last within its test (taste #55).
// ============================================================

const APP = 'http://localhost:5173'

const IMPORT_ENTITIES = [
  'cabang',
  'sekolah',
  'trainer',
  'siswa',
  'absensi',
  'honorPayments',
  'sppPayments',
  'invoices',
  'settings',
]

// Mirror of server/tests/v4-import.fixtures.json `valid`, with a
// per-run suffix on every id (re-runnable) and Sim-marked names
// (identifiable + cleanable). One row per entity.
function buildV4Fixture(suffix) {
  const tag = `Sim ${suffix}`
  const cabangId = `cbg-v4e-${suffix}`
  const sekolahId = `skl-v4e-${suffix}`
  const trainerId = `trn-v4e-${suffix}`
  const siswaId = `sw-v4e-${suffix}`
  const today = new Date().toISOString().slice(0, 10)
  const periode = today.slice(0, 7)
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      cabang: [
        { id: cabangId, kode: `V4E${suffix}`, nama: `Cabang V4 Impor ${tag}` },
      ],
      sekolah: [
        {
          id: sekolahId,
          nama: `Sekolah V4 Impor ${tag}`,
          alamat: `Jl V4 Impor ${suffix}`,
          cabangId,
          spp: 150000,
          trainerIds: [trainerId],
          jadwalList: [],
        },
      ],
      trainer: [
        {
          id: trainerId,
          nama: `Trainer V4 Impor ${tag}`,
          wa: '628000000001',
          jadwal: 'Senin',
          sekolahIds: [sekolahId],
          honor: 50000,
          cabangId,
        },
      ],
      siswa: [
        {
          id: siswaId,
          nama: `Siswa V4 Impor ${tag}`,
          wa: '628000000002',
          kelas: 'A',
          sekolahId,
          sekolahNama: `Sekolah V4 Impor ${tag}`,
          status: 'Aktif',
          sppLunas: {},
        },
      ],
      absensi: [
        {
          id: `abs-v4e-${suffix}`,
          tanggal: today,
          periode,
          sekolahId,
          trainerId,
          trainerNama: `Trainer V4 Impor ${tag}`,
          trainerStatus: 'Hadir',
          siswaList: [{ siswaId, status: 'Hadir' }],
          sesiKe: 1,
        },
      ],
      honorPayments: [
        {
          id: `pay-v4e-${suffix}`,
          trainerId,
          periode,
          nominal: 50000,
          tanggalBayar: today,
        },
      ],
      sppPayments: [
        {
          id: `spp-v4e-${suffix}`,
          siswaId,
          periode,
          nominal: 150000,
          tanggalBayar: today,
          metode: 'Tunai',
          diterimaOleh: 'Admin',
        },
      ],
      invoices: [
        {
          id: `inv-v4e-${suffix}`,
          sekolahId,
          mode: 'bulanan',
          periodeList: [periode],
          jumlahSiswa: 1,
          hargaSatuan: 150000,
          jumlahPertemuan: 4,
          total: 150000,
          tanggalTerbit: today,
          status: 'Draft',
        },
      ],
      // An id-carrying object (not the id-less browser shape) so the
      // row id stays unique per run instead of colliding on the
      // synthesized 'settings-global' id.
      settings: { id: `stg-v4e-${suffix}`, title: `V4 Impor ${tag}`, logoUrl: '' },
    },
  }
}

// Overwrite (not merge) the whole browser dataset with the fixture so
// "Gunakan Data Browser" (exportBackup()) sends exactly this fixture.
// Retries past a late hydrateServerData() write: read() overwrites
// keys wholesale, so a re-seed after it lands always sticks.
async function seedBrowserFixture(page, fixture) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((fx) => {
      for (const [key, value] of Object.entries(fx.data)) {
        localStorage.setItem(`afterschola_v4_${key}`, JSON.stringify(value))
      }
    }, fixture)
    await page.waitForTimeout(400)
    const cabangIds = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('afterschola_v4_cabang') || '[]').map((r) => r.id)
      } catch {
        return []
      }
    })
    if (cabangIds.length === 1 && cabangIds[0] === fixture.data.cabang[0].id) return
  }
  throw new Error('seedBrowserFixture: fixture seed did not survive hydrate settle')
}

async function readAllCounts(page) {
  const res = await page.request.get('/api/read.php')
  expect(res.ok()).toBe(true)
  const body = await res.json()
  const counts = {}
  for (const entity of IMPORT_ENTITIES) {
    if (!Array.isArray(body[entity])) throw new Error(`readAllCounts: /api/read.php missing array for ${entity}`)
    counts[entity] = body[entity].length
  }
  return counts
}

async function openBackupModal(page) {
  await page.getByRole('button', { name: 'Akun' }).click()
  await page.getByRole('menuitem', { name: 'Backup & Restore' }).click()
  await expect(page.getByRole('dialog', { name: 'Backup & Restore Data' })).toBeVisible()
}

function v4ImportResponse(page) {
  return page.waitForResponse(
    (res) => res.url().includes('/api/v4-import.php') && res.request().method() === 'POST',
    { timeout: 15000 },
  )
}

test('RH.F.3: trainer Backup & Restore renders no v4 import surface', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  await openBackupModal(page)

  await expect(page.getByTestId('v4-import-block')).toHaveCount(0)
  await expect(page.getByText('Impor Data v4 ke Server')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Gunakan Data Browser' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pilih File V4...' })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Backup & Restore Data' })).toBeHidden()

  expect(pageErrors).toHaveLength(0)
})

test('RH.F.3: superadmin imports a seeded v4 fixture via Gunakan Data Browser; second import shows the conflict preview', async ({
  page,
  pageErrors,
}) => {
  const suffix = String(Date.now()).slice(-6)
  const fixture = buildV4Fixture(suffix)
  const fixtureCabangId = fixture.data.cabang[0].id

  await loginViaApi(page, 'superadmin')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Akun' })).toBeVisible({ timeout: 20000 })

  const before = await readAllCounts(page)
  await seedBrowserFixture(page, fixture)

  await openBackupModal(page)
  await expect(page.getByTestId('v4-import-block')).toBeVisible()

  const dryRun = v4ImportResponse(page)
  await page.getByRole('button', { name: 'Gunakan Data Browser' }).click()
  expect((await dryRun).status()).toBe(200)

  const preview = page.getByRole('dialog', { name: 'Pratinjau Impor' })
  await expect(preview).toBeVisible()
  for (const entity of IMPORT_ENTITIES) {
    await expect(preview.getByTestId(`impor-count-${entity}`)).toContainText(': 1')
  }

  const commit = v4ImportResponse(page)
  await preview.getByRole('button', { name: 'Mulai Impor' }).click()
  expect((await commit).status()).toBe(201)
  // The commit closes the preview; App.jsx's onRestored hard-reloads
  // immediately, so the reboot may already be done here — wait for
  // readiness (not for a future 'load' event that may have fired).
  await expect(preview).toBeHidden({ timeout: 5000 })
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'Akun' })).toBeVisible({ timeout: 20000 })

  // /api/read.php counts match: exactly one new row per entity.
  const after = await readAllCounts(page)
  for (const entity of IMPORT_ENTITIES) {
    expect(after[entity]).toBe(before[entity] + 1)
  }

  // Second import of the same fixture: dry-run 409s and the preview
  // surfaces the conflict list instead of a commit button.
  await seedBrowserFixture(page, fixture)
  await openBackupModal(page)
  const dryRun2 = v4ImportResponse(page)
  await page.getByRole('button', { name: 'Gunakan Data Browser' }).click()
  expect((await dryRun2).status()).toBe(409)

  const preview2 = page.getByRole('dialog', { name: 'Pratinjau Impor' })
  await expect(preview2).toBeVisible()
  await expect(preview2.getByTestId('impor-conflicts')).toContainText(fixtureCabangId)
  await expect(preview2.getByRole('button', { name: 'Mulai Impor' })).toHaveCount(0)
  await preview2.getByRole('button', { name: 'Batalkan' }).click()
  await expect(preview2).toBeHidden()

  expect(pageErrors).toHaveLength(0)
})
