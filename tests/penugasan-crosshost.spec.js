import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// DB.A.3 — Cross-host occupant guard pinned end-to-end.
//
// VERIFY (docs/DOUBLE_BOOKING_MILESTONES.md DB.A.3):
// -> admin creates a row for instructor A; the same person as
//    assistant on instructor B's overlapping row is rejected in the
//    UI with the pinned copy + nothing persists server-side;
// -> the same write via direct API POST 422s with the pinned copy;
// -> a distinct person on the same school+slot still saves (occupant
//    reading, not slot-capacity); refresh persists exactly one
//    overlapping occupant.
// Hermetic: Sim-marked school + trainers, all residue removed in-run.
// ============================================================

const APP = 'http://localhost:5173'
const CABANG_ID = 'cbg-test-pusat'
const PINNED = 'Penugasan ganda: sekolah dan waktu yang sama sudah terisi pada rentang tanggal ini.'

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

async function seedSchool(page, nama) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const res = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: `skl-DBX-${Date.now()}`, nama, spp: 500000, cabangId: CABANG_ID, action: 'create' },
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

async function serverAssignments(page, hostId, sekolahId) {
  const res = await page.request.get('/api/read.php?entity=trainer')
  if (!res.ok()) throw new Error('read trainer failed')
  const host = (await res.json()).find(t => t.id === hostId)
  return ((host && host.penugasanPengajar) || []).filter(a => a && a.sekolahId === sekolahId)
}

async function cleanup(page, sekolahId, trainerIds) {
  await loginViaApi(page, 'adminCabang')
  const csrf = await primeCsrf(page)
  for (const id of trainerIds) {
    await page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { id, action: 'delete' },
    })
  }
  await loginViaApi(page, 'superadmin')
  const csrf2 = await primeCsrf(page)
  await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf2 },
    data: { action: 'delete', id: sekolahId },
  })
}

test('DB.A.3a: cross-host same-person duplicate rejected in UI, nothing persists', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const sekolah = await seedSchool(page, `SD DBX Sim ${suffix}`)
  const sekolahId = sekolah.id
  const hostA = `trn-DBXA-${suffix}`
  const hostB = `trn-DBXB-${suffix}`
  const hostANama = `Instruktur DBX A ${suffix}`

  try {
    await createTrainer(page, hostA, hostANama)
    await createTrainer(page, hostB, `Instruktur DBX B ${suffix}`)

    await loginViaApi(page, 'superadmin')
    await gotoApp(page)
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('heading', { name: 'Penugasan Pengajar' })).toBeVisible()

    // Row 1: instructor A, unscoped (Semua slot), today -> ongoing.
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').nth(0).selectOption(sekolahId)
    await dialog.locator('select').nth(1).selectOption(hostA)
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByRole('cell', { name: `SD DBX Sim ${suffix}` }).first()).toBeVisible({ timeout: 15000 })
    expect((await serverAssignments(page, hostA, sekolahId)).length).toBe(1)

    // Row 2: instructor B with A as assistant, same school+slot+dates.
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()
    const dialog2 = page.getByRole('dialog')
    await expect(dialog2).toBeVisible()
    await dialog2.locator('select').nth(0).selectOption(sekolahId)
    await dialog2.locator('select').nth(1).selectOption(hostB)
    await dialog2.locator('select').nth(2).selectOption({ label: hostANama })
    await dialog2.getByRole('button', { name: 'Simpan', exact: true }).click()

    // Rejected with the pinned copy; nothing persisted server-side.
    await expect(page.getByText(PINNED)).toBeVisible({ timeout: 15000 })
    expect(await serverAssignments(page, hostB, sekolahId)).toEqual([])

    // Refresh: exactly one overlapping occupant survives (host A only).
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('cell', { name: `SD DBX Sim ${suffix}` }).first()).toBeVisible({ timeout: 15000 })
    expect((await serverAssignments(page, hostA, sekolahId)).length).toBe(1)
    expect(await serverAssignments(page, hostB, sekolahId)).toEqual([])

    expect(pageErrors).toEqual([])
  } finally {
    await cleanup(page, sekolahId, [hostA, hostB])
  }
})

test('DB.A.3b: direct API duplicate 422s; distinct person saves; state persists', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const sekolah = await seedSchool(page, `SD DBY Sim ${suffix}`)
  const sekolahId = sekolah.id
  const hostA = `trn-DBYA-${suffix}`
  const hostB = `trn-DBYB-${suffix}`

  async function updateHost(hostId, rows) {
    await loginViaApi(page, 'superadmin')
    const csrf = await primeCsrf(page)
    const res = await page.request.get('/api/read.php?entity=trainer')
    if (!res.ok()) throw new Error('read trainer failed')
    const current = (await res.json()).find(t => t.id === hostId)
    const { cabangId: _omit, ...rest } = current
    return page.request.post('/api/trainer.php', {
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      data: { ...rest, id: hostId, action: 'update', penugasanPengajar: rows },
    })
  }

  function newRow(over = {}) {
    return {
      id: `pgs-DBY-${suffix}-${Math.floor(Math.random() * 1e6)}`,
      sekolahId,
      trainerId: hostB,
      asistenId: null,
      asistenIds: null,
      periodeMulai: todayLocal(),
      periodeSelesai: null,
      aktif: true,
      ...over,
    }
  }

  try {
    await createTrainer(page, hostA, `Instruktur DBY A ${suffix}`)
    await createTrainer(page, hostB, `Instruktur DBY B ${suffix}`)

    // Seed host A row via API (unscoped, today -> ongoing).
    const seedA = await updateHost(hostA, [newRow({ id: `pgs-DBYA-${suffix}`, trainerId: hostA })])
    expect(seedA.ok()).toBe(true)

    // Direct conflicting write on host B (A as assistant) -> 422.
    const dup = await updateHost(hostB, [newRow({ trainerId: hostB, asistenId: hostA })])
    expect(dup.status()).toBe(422)
    expect(JSON.stringify(await dup.json())).toContain('Penugasan ganda')
    expect(await serverAssignments(page, hostB, sekolahId)).toEqual([])

    // Distinct person, same school+slot -> 200 (occupant reading).
    const okRes = await updateHost(hostB, [newRow({ trainerId: hostB, asistenId: null })])
    expect(okRes.ok()).toBe(true)
    expect((await serverAssignments(page, hostB, sekolahId)).length).toBe(1)

    // Refresh via UI: both rows render; still exactly one shared occupant.
    await loginViaApi(page, 'superadmin')
    await gotoApp(page)
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('cell', { name: `SD DBY Sim ${suffix}` }).first()).toBeVisible({ timeout: 15000 })

    expect(pageErrors).toEqual([])
  } finally {
    await cleanup(page, sekolahId, [hostA, hostB])
  }
})
