import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// T2.E.1 (F-T2-13; D-T2-9; R-T2-1, R-T2-5, R-T2-7, R-T2-8) —
// Prove double-booking hard-block, failing-first.
//
// Current: client pre-check returns before write + server re-checks
//   (PenugasanManager.jsx:272-286 + assignments.php:219-316), but no E2E
//   proves the second save is rejected AND unsaved.
// Expected: Trainer A Senin 09:00 School 1 active, then attempt School 2
//   same slot -> pinned PENUGASAN_OVERLAP_ERROR + second row ABSENT
//   after reload. Warning-only-that-saves = FAIL.
// Rule: failing-first proof before any code (R-T2-8); code only the
//   failing layer (client pre-check and/or server/lib/assignments.php +
//   server/api/trainer.php).
// Result: RED below isolates the failing layer; GREEN pins the block.
//
// Pattern: tests/penugasan-crosshost.spec.js (UI reject + server-clean +
//   reload single-row + direct API 422). Hermetic Sim-marked schools +
//   trainers, all residue removed in-run.
//
// VERIFY: npx playwright test tests/penugasan-double-booking.spec.js --workers=1
// ============================================================

const APP = 'http://localhost:5173'
const CABANG_ID = 'cbg-test-pusat'
const PINNED = 'Penugasan ganda: sekolah dan waktu yang sama sudah terisi pada rentang tanggal ini.'
const SLOT = { hari: 'Senin', jamMulai: '09:00', jamSelesai: '10:00' }
const JADWAL = [{ dayOfWeek: 'Senin', time: '09:00', endTime: '10:00' }]

function todayLocal() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function seedSchool(page, nama, tag) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const res = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      id: `skl-T2E1${tag}-${Date.now()}`,
      nama, spp: 500000, cabangId: CABANG_ID, action: 'create',
      jadwalList: JADWAL,
    },
  })
  if (!res.ok()) throw new Error(`seed sekolah failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

async function createTrainer(page, id, nama) {
  await loginViaApi(page, 'adminCabang')
  const csrf = await primeCsrf(page)
  const res = await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id, nama, honor: 100000, tipePengajar: 'instruktur', sekolahIds: [], action: 'create' },
  })
  if (!res.ok()) throw new Error(`create trainer failed: ${res.status()} ${await res.text()}`)
}

async function serverRowsForTrainer(page, hostId) {
  const res = await page.request.get('/api/read.php?entity=trainer')
  if (!res.ok()) throw new Error('read trainer failed')
  const host = (await res.json()).find(t => t.id === hostId)
  return (host && host.penugasanPengajar) || []
}

async function cleanup(page, sekolahIds, trainerIds) {
  try {
    await loginViaApi(page, 'adminCabang')
    const csrf = await primeCsrf(page)
    for (const id of trainerIds) {
      await page.request.post('/api/trainer.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: { id, action: 'delete' },
      })
    }
  } catch { /* inert */ }
  try {
    await loginViaApi(page, 'superadmin')
    const csrf2 = await primeCsrf(page)
    for (const id of sekolahIds) {
      await page.request.post('/api/sekolah.php', {
        headers: { 'X-CSRF-Token': csrf2 },
        data: { action: 'delete', id },
      })
    }
  } catch { /* inert */ }
}

async function fillSlot(dialog, slot = SLOT) {
  await dialog.locator('select').nth(4).selectOption(slot.hari)
  await dialog.getByLabel('Jam Mulai').fill(slot.jamMulai)
  await dialog.getByLabel('Jam Selesai').fill(slot.jamSelesai)
}

test('T2.E.1a: UI double-booking hard-block — School 2 same slot rejected, nothing persists', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const schoolAName = `SD T2E1 A ${suffix}`
  const schoolBName = `SD T2E1 B ${suffix}`
  const hostA = `trn-T2E1A-${suffix}`
  const hostANama = `Instruktur T2E1 A ${suffix}`
  let sekolahAId = null
  let sekolahBId = null

  try {
    const schA = await seedSchool(page, schoolAName, `A${suffix}`)
    const schB = await seedSchool(page, schoolBName, `B${suffix}`)
    sekolahAId = schA.id
    sekolahBId = schB.id
    await createTrainer(page, hostA, hostANama)

    await loginViaApi(page, 'superadmin')
    await gotoApp(page)
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('heading', { name: 'Penugasan Pengajar' })).toBeVisible()

    // Row 1: Trainer A, School 1, Senin 09:00-10:00, active ongoing.
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').nth(0).selectOption(sekolahAId)
    await dialog.locator('select').nth(1).selectOption(hostA)
    await fillSlot(dialog)
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByRole('cell', { name: schoolAName }).first()).toBeVisible({ timeout: 15000 })
    expect((await serverRowsForTrainer(page, hostA)).filter(a => a && a.sekolahId === sekolahAId).length).toBe(1)

    // Row 2 attempt: same Trainer A, School 2, SAME slot + overlapping dates.
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()
    const dialog2 = page.getByRole('dialog')
    await expect(dialog2).toBeVisible()
    await dialog2.locator('select').nth(0).selectOption(sekolahBId)
    await dialog2.locator('select').nth(1).selectOption(hostA)
    await fillSlot(dialog2)
    await dialog2.getByRole('button', { name: 'Simpan', exact: true }).click()

    // Hard-block: pinned error visible; second row NEVER saved.
    await expect(page.getByText(PINNED)).toBeVisible({ timeout: 15000 })
    const afterAttempt = await serverRowsForTrainer(page, hostA)
    expect(afterAttempt.filter(a => a && a.sekolahId === sekolahBId)).toEqual([])
    expect(afterAttempt.filter(a => a && a.sekolahId === sekolahAId).length).toBe(1)

    // Reload: exactly one row survives (School 1 only).
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('cell', { name: schoolAName }).first()).toBeVisible({ timeout: 15000 })
    const afterReload = await serverRowsForTrainer(page, hostA)
    expect(afterReload.filter(a => a && a.sekolahId === sekolahAId).length).toBe(1)
    expect(afterReload.filter(a => a && a.sekolahId === sekolahBId)).toEqual([])

    expect(pageErrors).toEqual([])
  } finally {
    await cleanup(page, [sekolahAId, sekolahBId].filter(Boolean), [hostA])
  }
})

test('T2.E.1b: direct API double-booking 422s with pinned copy, nothing persists', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const hostA = `trn-T2E1C-${suffix}`
  let sekolahAId = null
  let sekolahBId = null

  async function updateHost(rows) {
    await loginViaApi(page, 'superadmin')
    const csrf = await primeCsrf(page)
    const res = await page.request.get('/api/read.php?entity=trainer')
    if (!res.ok()) throw new Error('read trainer failed')
    const current = (await res.json()).find(t => t.id === hostA)
    const { cabangId: _omit, ...rest } = current
    return page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      data: { ...rest, id: hostA, action: 'update', penugasanPengajar: rows },
    })
  }

  function newRow(sekolahId, tag) {
    return {
      id: `pgs-T2E1-${suffix}-${tag}`,
      sekolahId,
      trainerId: hostA,
      asistenId: null,
      asistenIds: null,
      cabangId: CABANG_ID,
      periodeMulai: todayLocal(),
      periodeSelesai: null,
      aktif: true,
      ...SLOT,
    }
  }

  try {
    const schA = await seedSchool(page, `SD T2E1 C ${suffix}`, `C${suffix}`)
    const schB = await seedSchool(page, `SD T2E1 D ${suffix}`, `D${suffix}`)
    sekolahAId = schA.id
    sekolahBId = schB.id
    await createTrainer(page, hostA, `Instruktur T2E1 C ${suffix}`)

    // Seed Row 1 via API (School 1, Senin 09:00).
    const seed = await updateHost([newRow(sekolahAId, 'a')])
    expect(seed.ok()).toBe(true)
    expect((await serverRowsForTrainer(page, hostA)).length).toBe(1)

    // Direct conflicting write (School 2, same slot, same person) -> 422.
    const existing = await serverRowsForTrainer(page, hostA)
    const dup = await updateHost([...existing, newRow(sekolahBId, 'b')])
    expect(dup.status()).toBe(422)
    expect(JSON.stringify(await dup.json())).toContain('Penugasan ganda')
    const after = await serverRowsForTrainer(page, hostA)
    expect(after.filter(a => a && a.sekolahId === sekolahBId)).toEqual([])
    expect(after.filter(a => a && a.sekolahId === sekolahAId).length).toBe(1)

    expect(pageErrors).toEqual([])
  } finally {
    await cleanup(page, [sekolahAId, sekolahBId].filter(Boolean), [hostA])
  }
})
