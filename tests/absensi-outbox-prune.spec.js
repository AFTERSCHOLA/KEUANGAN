// M-AF5.5 (F-11) — absensi outbox prune path regression.
//
// The original F-11 symptom was "absensi record disappears after sync".
// The team's symptom was real but multi-source (delete-and-recreate,
// 4xx server response, outbox prune). This spec pins down the outbox
// prune path: a successful sync removes the queued entry, and a 4xx
// server response keeps it in the queue WITH a `failed` marker so the
// failed-state is observable.
//
// Why a localStorage-driven probe instead of an end-to-end UI form:
// the trainer account seeded for the test suite (trainer@test.local /
// trn-test-1) has no `sekolahIds`, so the live AttendanceForm would
// render an empty Sekolah dropdown and refuse to submit. The prune
// path lives in src/lib/store.js:syncPending() and is reached through
// the same AccountMenu "Sinkronisasi" button regardless of how the
// queue was populated, so seeding the queue directly exercises the
// real production code without depending on a UI form that the
// trainer role can't actually drive in this seed state.
//
// Persists as a named regression file (taste #16): this is a
// milestone-acceptance spec, not an ad-hoc debug spec.
import { test, expect, loginViaApi } from './fixtures.js'

const APP = 'http://localhost:5173'

// 5 absensi records (taste #56 — fabricated dates stay in the current
// month so the readCached() filter in RiwayatAbsensi surfaces them).
function fiveAbsensiRecords() {
  const records = []
  for (let i = 1; i <= 5; i++) {
    records.push({
      id: `abs-f11-${i}`,
      tanggal: new Date().toISOString().slice(0, 10),
      sekolahId: 'skl-f11',
      trainerId: 'trn-test-1',
      trainerNama: 'Trainer Test Satu',
      trainerStatus: 'Hadir',
      siswaList: [],
      catatan: `f11 record ${i}`,
      dokumentasi: [],
      foto: '',
      statusVerifikasi: null,
      konfirmasiTrainer: null,
      sesiKe: i,
      lastEditedAt: new Date().toISOString(),
    })
  }
  return records
}

async function resetWithQueue(page, records) {
  await page.addInitScript(({ records }) => {
    if (sessionStorage.getItem('__e2e_reset_done')) return
    const prefix = 'afterschola_v4'
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) localStorage.removeItem(k)
    }
    // M-AF5.5: migrateIds() in src/main.jsx runs at module load and
    // throws when an absensi row references a sekolahId not present in
    // the sekolah collection. Inject a matching sekolah row + the
    // trn-test-1 trainer row the records reference so migrateIds
    // passes and the React tree can mount.
    const sekolah = [{
      id: 'skl-f11', nama: 'SD F11 Sim', trainerIds: ['trn-test-1'], cabangId: 'cbg-test-pusat',
    }]
    const trainer = [{
      id: 'trn-test-1', nama: 'Trainer Test Satu', wa: '628123456789', jadwal: 'Senin', honor: 50000, sekolahIds: ['skl-f11'], cabangId: 'cbg-test-pusat',
    }]
    const cabang = [{ id: 'cbg-test-pusat', kode: 'TSP', nama: 'Cabang Test Pusat' }]
    localStorage.setItem('afterschola_v4_cabang', JSON.stringify(cabang))
    localStorage.setItem('afterschola_v4_sekolah', JSON.stringify(sekolah))
    localStorage.setItem('afterschola_v4_trainer', JSON.stringify(trainer))
    localStorage.setItem('afterschola_v4_absensi', JSON.stringify(records))
    localStorage.setItem('afterschola_v4_syncLog', JSON.stringify(
      records.map(r => ({ key: 'absensi', id: r.id, record: r, queuedAt: Date.now() })),
    ))
    sessionStorage.setItem('__e2e_reset_done', '1')
  }, { records })
}

// Open the AccountMenu dropdown (the Sinkronisasi button is inside it
// for trainer/admin roles; src/components/AccountMenu.jsx:60-112).
async function openAccountMenu(page) {
  await page.getByRole('button', { name: 'Akun' }).click()
}

async function clickSync(page) {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: /Sinkronisasi/ }).click()
}

// Shared read.php fixture: intercept hydrateServerData()'s pulls so
// the local cache isn't wiped by whatever the real DB happens to hold.
// Each entity returns the minimal seed rows our probe references.
function readPhpFixtureFor(records) {
  const sekolah = [{ id: 'skl-f11', nama: 'SD F11 Sim', trainerIds: ['trn-test-1'], cabangId: 'cbg-test-pusat' }]
  const trainer = [{ id: 'trn-test-1', nama: 'Trainer Test Satu', wa: '628123456789', jadwal: 'Senin', honor: 50000, sekolahIds: ['skl-f11'], cabangId: 'cbg-test-pusat' }]
  const cabang = [{ id: 'cbg-test-pusat', kode: 'TSP', nama: 'Cabang Test Pusat' }]
  const map = { sekolah, trainer, siswa: [], absensi: records, cabang, sppPayments: [], honorPayments: [], invoices: [] }
  return async route => {
    const url = route.request().url()
    const m = url.match(/[?&]entity=([^&]+)/)
    const entity = m ? decodeURIComponent(m[1]) : null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(entity && map[entity] !== undefined ? map[entity] : []),
    })
  }
}

test('F-11: 5 trainer save→sync cycles prune the outbox to 0', async ({ page, pageErrors }) => {
  const records = fiveAbsensiRecords()
  await resetWithQueue(page, records)

  // Intercept /api/sync.php so the test does not depend on the PHP
  // dev server being reachable (per taste #56: no fabrication; the
  // intercepted response IS the contract the client sees). 200-OK
  // with empty `failed` = "every entry was applied".
  await page.route('**/api/sync.php', async route => {
    const body = JSON.parse(route.request().postData() || '{}')
    const ids = (body.entries || []).map(e => e.id)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ synced: ids.map(id => ({ id, entity: 'absensi' })), alreadyApplied: [], failed: [] }),
    })
  })
  await page.route('**/api/read.php**', readPhpFixtureFor(records))

  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  // 5 save→sync cycles. Each save: upsert into the store (already done
  // by the reset), then click Sinkronisasi. The first cycle drains the
  // full queue to 0; subsequent cycles re-upsert one new entry so the
  // queue grows by 1 and the next sync drains it back to 0. This
  // pins the invariant: a successful sync NEVER leaves phantom entries
  // behind, regardless of how many times the user clicks.
  for (let cycle = 1; cycle <= 5; cycle++) {
    if (cycle > 1) {
      // Add one fresh entry per cycle through the real store API
      // so the AccountMenu's `syncPending` state updates (writing
      // localStorage directly bypasses the store's notify event).
      await page.evaluate(async ({ cycle, records }) => {
        const store = await import('/src/lib/store.js')
        const r = { ...records[0], id: `abs-f11-r${cycle}`, catatan: `f11 cycle ${cycle}` }
        store.upsert('absensi', r)
        // Dispatch the store-changed event so React subscribers
        // (App.jsx's syncStatus via subscribeStore) re-render with the
        // new syncPending count.
        window.dispatchEvent(new Event('afterschola_v4_changed'))
      }, { cycle, records })
      // Give React a tick to re-render the AccountMenu badge.
      await page.waitForTimeout(300)
    }
    await clickSync(page)

    const snapshot = await page.evaluate(() => ({
      pending: JSON.parse(localStorage.getItem('afterschola_v4_syncLog') || '[]'),
      absensi: JSON.parse(localStorage.getItem('afterschola_v4_absensi') || '[]'),
    }))
    expect(snapshot.pending).toHaveLength(0)
    // After cycle 1 we have 5 records; after each subsequent cycle we
    // add 1 more, so the cache grows monotonically.
    expect(snapshot.absensi.length).toBeGreaterThanOrEqual(5)
  }

  // The absensi records are still in the cache after sync — sync prunes
  // the outbox, NOT the records themselves. Per F-11 the bug was that
  // records disappeared from "Semua"; here they survive.
  const finalAbsensi = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_absensi') || '[]'))
  expect(finalAbsensi.length).toBeGreaterThanOrEqual(5)
  for (const r of records) {
    expect(finalAbsensi.some(a => a.id === r.id)).toBe(true)
  }

  expect(pageErrors).toHaveLength(0)
})

test('F-11: 4xx server response keeps the entry with a failed marker', async ({ page, pageErrors }) => {
  const records = fiveAbsensiRecords()
  await resetWithQueue(page, records)

  // First sync call: force a 422. The client's syncPending() must
  // preserve every queued entry AND tag it with a failed marker.
  let syncCallCount = 0
  await page.route('**/api/sync.php', async route => {
    syncCallCount += 1
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Simulated F-11 server rejection' }),
    })
  })
  // Intercept /api/read.php so handleSync()'s post-sync
  // hydrateServerData() does NOT wipe our seeded records with
  // whatever happens to live on the real DB. Each entity returns
  // the minimal seed rows the trainer's scope check needs.
  await page.route('**/api/read.php**', readPhpFixtureFor(records))

  await loginViaApi(page, 'trainer')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  await clickSync(page)
  await expect.poll(async () => syncCallCount, { timeout: 5000 }).toBeGreaterThanOrEqual(1)

  const afterFail = await page.evaluate(() => ({
    pending: JSON.parse(localStorage.getItem('afterschola_v4_syncLog') || '[]'),
    absensi: JSON.parse(localStorage.getItem('afterschola_v4_absensi') || '[]'),
  }))
  // All 5 entries survive the 4xx — no silent prune.
  expect(afterFail.pending).toHaveLength(5)
  // AND every surviving entry carries the failed marker so the
  // failed-state is observable (per the OUTCOME line of M-AF5.5).
  for (const entry of afterFail.pending) {
    expect(entry.failedAt).toBeTruthy()
    expect(entry.failedStatus).toBe(422)
    expect(entry.failedError).toBeTruthy()
  }
  // The absensi cache is untouched — sync.php never received a chance
  // to mutate it, and the client must not lose local records on a 4xx.
  expect(afterFail.absensi).toHaveLength(5)

  // Now flip the interceptor to 200 and confirm a retry drains the
  // queue (the entries are still good, the server just had a bad day).
  await page.unroute('**/api/sync.php')
  await page.route('**/api/sync.php', async route => {
    const body = JSON.parse(route.request().postData() || '{}')
    const ids = (body.entries || []).map(e => e.id)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ synced: ids.map(id => ({ id, entity: 'absensi' })), alreadyApplied: [], failed: [] }),
    })
  })

  await clickSync(page)

  const afterRetry = await page.evaluate(() => JSON.parse(localStorage.getItem('afterschola_v4_syncLog') || '[]'))
  expect(afterRetry).toHaveLength(0)

  expect(pageErrors).toHaveLength(0)
})
