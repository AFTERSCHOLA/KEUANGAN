import { test, expect, loginViaApi, loginAndPrime, primeCsrf, readEntity, createSekolahSuperadmin } from './fixtures.js'

// T2.D.2 (F-T2-11; D-T2-7; R-T2-1, R-T2-2, R-T2-3, R-T2-5, R-T2-7) —
// offer external assistants in the assignment picker.
//
// Current: Asisten/Asisten-2 selects list `trainers` only
//   (PenugasanManager.jsx:567,579), so a created external can never be
//   assigned -> attendance/honor chain blocked.
// Expected: both selects offer the union trainers-minus-chosen +
//   same-school eksternal with ` (Eksternal)` suffix; saved ids ride the
//   existing asistenId/asistenIds keys (max 2).
// Rule: no new keys; no login for externals; the server union gate
//   (entities.php:253 accepts trainer OR external in asistenIds) already
//   covers ids — verify, don't rebuild. Legacy asistenId stays
//   trainer-only by design (entities.php:226-231 + eksternal.php:110),
//   so external picks ride asistenIds.
// Result: FAIL pre-fix (external absent from Asisten options), green
//   post-fix.
//
// Flow: create external (Asisten Eksternal UI) -> appears in Asisten
// options (RED pre-fix) -> assign to slot (Penugasan UI) -> attendance
// writable (Absensi Saya as trainer, peran Asisten) -> honor prices 50k
// (Data Keuangan school row: 1 Sesi, Rp50.000).
//
// VERIFY: npx playwright test tests/penugasan-external-assignment.spec.js --workers=1

const APP = 'http://localhost:5173'
const HOST_TRAINER_ID = 'trn-test-1'
const CABANG_ID = 'cbg-test-pusat'

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

function selectByLabel(page, labelText) {
  return page.locator('label', { hasText: labelText }).first().locator('xpath=following-sibling::select[1]')
}

test('T2.D.2: created external is assignable via picker and flows to attendance + honor', async ({ page, pageErrors }) => {
  test.setTimeout(480000)
  const suffix = String(Date.now()).slice(-6)
  const SCH_A = `T2D2 Sekolah ${suffix}A`
  const SCH_B = `T2D2 Sekolah ${suffix}B`
  const EXT_A = `T2D2 Eksternal ${suffix}A`
  const EXT_B = `T2D2 Eksternal ${suffix}B`

  const ids = { schA: null, schB: null, extA: null, extB: null }
  let cleaned = false

  async function cleanup() {
    await loginViaApi(page, 'superadmin')
    const csrf = await primeCsrf(page)
    const hdrs = { 'X-CSRF-Token': csrf }
    // Strip this run's assignment rows off the seeded host trainer.
    try {
      const trainers = await readEntity(page, 'trainer', csrf)
      const host = trainers.find(t => t.id === HOST_TRAINER_ID)
      if (host) {
        const next = (host.penugasanPengajar || []).filter(a => a && a.sekolahId !== ids.schA && a.sekolahId !== ids.schB)
        if (next.length !== (host.penugasanPengajar || []).length) {
          const { cabangId: _omit, ...rest } = host
          await page.request.post('/api/trainer.php', {
            headers: { ...hdrs, 'Content-Type': 'application/json' },
            data: { ...rest, id: HOST_TRAINER_ID, action: 'update', penugasanPengajar: next },
          })
        }
      }
    } catch (e) { console.log(`## T2.D.2 cleanup assignment: ${e.message}`) }
    for (const extId of [ids.extA, ids.extB]) {
      if (!extId) continue
      try {
        const res = await page.request.post('/api/eksternal.php', { headers: hdrs, data: { action: 'delete', id: extId } })
        console.log(`## T2.D.2 cleanup eksternal ${extId} -> ${res.status()}`)
      } catch (e) { console.log(`## T2.D.2 cleanup eksternal ${extId}: ${e.message}`) }
    }
    for (const schId of [ids.schA, ids.schB]) {
      if (!schId) continue
      try {
        const res = await page.request.post('/api/sekolah.php', { headers: hdrs, data: { action: 'delete', id: schId } })
        console.log(`## T2.D.2 cleanup sekolah ${schId} -> ${res.status()}`)
      } catch (e) { console.log(`## T2.D.2 cleanup sekolah ${schId}: ${e.message}`) }
    }
    cleaned = true
  }

  try {
    // ---- seed: two schools (superadmin API) ----
    let csrf = await loginAndPrime(page, 'superadmin')
    const schA = await createSekolahSuperadmin(page, csrf, SCH_A, 500000, CABANG_ID, `${suffix}a`)
    const schB = await createSekolahSuperadmin(page, csrf, SCH_B, 500000, CABANG_ID, `${suffix}b`)
    ids.schA = schA.id
    ids.schB = schB.id

    // ---- create external A via UI (creation path already exists) ----
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Asisten Eksternal')
    await expect(page.getByRole('heading', { name: 'Asisten Eksternal' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Tambah Asisten Eksternal', exact: true }).click()
    const extDialog = page.getByRole('dialog')
    await expect(extDialog).toBeVisible()
    await extDialog.locator('label', { hasText: 'Nama Asisten Eksternal' }).locator('xpath=following-sibling::input[1]').fill(EXT_A)
    await selectByLabel(extDialog, 'Sekolah').selectOption(ids.schA)
    await extDialog.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByRole('cell', { name: EXT_A }).first()).toBeVisible({ timeout: 15000 })

    // ---- seed external B (other school) via API for the same-school negative ----
    csrf = await primeCsrf(page)
    const extBId = `ext-t2d2-${suffix}-b`
    const extBRes = await page.request.post('/api/eksternal.php', {
      headers: { 'X-CSRF-Token': csrf },
      data: { action: 'create', id: extBId, nama: EXT_B, sekolahId: ids.schB, kontak: '', cabangId: CABANG_ID },
    })
    if (!extBRes.ok()) throw new Error(`seed external B failed: ${extBRes.status()} ${await extBRes.text()}`)
    ids.extB = extBId

    const eksternals = await readEntity(page, 'eksternal', csrf)
    ids.extA = eksternals.find(e => e.nama === EXT_A)?.id || null
    expect(ids.extA).toBeTruthy()

    // ---- assign via Penugasan UI; RED pre-fix: external absent ----
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('heading', { name: 'Penugasan Pengajar' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').nth(0).selectOption(ids.schA)
    await dialog.locator('select').nth(1).selectOption(HOST_TRAINER_ID)
    const asistenOpts = await dialog.locator('select').nth(2).locator('option').allTextContents()
    console.log('## T2.D.2 asisten options:', JSON.stringify(asistenOpts))
    expect(asistenOpts).toContain(`${EXT_A} (Eksternal)`)
    expect(asistenOpts.some(o => o.includes(EXT_B))).toBe(false)
    await dialog.locator('select').nth(2).selectOption(ids.extA)
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()

    // Persists in the table with the external name resolved...
    const schoolCell = page.getByRole('cell', { name: SCH_A }).first()
    await expect(schoolCell).toBeVisible({ timeout: 15000 })
    const row = page.locator('tr', { hasText: SCH_A }).first()
    await expect(row.getByRole('cell', { name: EXT_A }).first()).toBeVisible({ timeout: 15000 })

    // ...and on the server riding the existing keys (max 2, no new keys):
    // external pick -> asistenIds (legacy asistenId is trainer-only).
    csrf = await primeCsrf(page)
    const trainers = await readEntity(page, 'trainer', csrf)
    const hostRow = trainers.find(t => t.id === HOST_TRAINER_ID)
    const saved = (hostRow.penugasanPengajar || []).find(a => a && a.sekolahId === ids.schA && a.aktif === true)
    expect(saved).toBeTruthy()
    console.log(`## T2.D.2 saved row keys: ${JSON.stringify({ asistenId: saved.asistenId ?? null, asistenIds: saved.asistenIds ?? null })}`)
    expect(saved.asistenId ?? null).toBe(null)
    expect(saved.asistenIds).toEqual([ids.extA])

    // ---- attendance writable: trainer records Hadir/peran-Asisten for the external ----
    const trainerUser = await loginViaApi(page, 'trainer')
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Absensi Saya')
    await expect(page.getByRole('heading', { name: 'Absensi Saya' })).toBeVisible({ timeout: 15000 })
    const schoolSel = selectByLabel(page, 'Sekolah')
    const schoolOpts = await schoolSel.locator('option').allTextContents()
    console.log('## T2.D.2 trainer school options:', JSON.stringify(schoolOpts))
    expect(schoolOpts.some(o => o.includes(SCH_A))).toBe(true)
    await schoolSel.selectOption(ids.schA)
    const personSel = selectByLabel(page, 'Kehadiran untuk')
    const personOpts = await personSel.locator('option').allTextContents()
    console.log('## T2.D.2 person options:', JSON.stringify(personOpts))
    expect(personOpts.some(o => o.includes(EXT_A))).toBe(true)
    await personSel.selectOption(ids.extA)
    await page.getByRole('button', { name: 'Asisten', exact: true }).click()
    await page.getByRole('button', { name: 'Simpan Absensi', exact: true }).click()
    await expect(page.getByText('Tersimpan')).toBeVisible({ timeout: 15000 })

    // Server row carries the external person with recorder identity.
    await loginViaApi(page, 'superadmin')
    csrf = await primeCsrf(page)
    const attRows = await readEntity(page, 'absensiPengajar', csrf)
    const attRow = attRows.find(r => r && r.trainerId === ids.extA && r.sekolahId === ids.schA)
    expect(attRow).toBeTruthy()
    expect(attRow.status).toBe('Hadir')
    expect(attRow.peran).toBe('A')
    expect(typeof attRow.dicatatOleh === 'string' && attRow.dicatatOleh.length > 0).toBe(true)
    if (trainerUser && trainerUser.id) expect(attRow.dicatatOleh).toBe(trainerUser.id)
    console.log(`## T2.D.2 attendance row: ${JSON.stringify({ trainerId: attRow.trainerId, peran: attRow.peran, status: attRow.status, dicatatOleh: attRow.dicatatOleh })}`)

    // ---- honor prices 50k: school row shows 1 Sesi + Rp50.000 beban ----
    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Data Keuangan')
    await expect(page.getByRole('heading', { name: 'Laporan Keuangan Laba Rugi' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Rincian Finansial Sekolah Mitra')).toBeVisible({ timeout: 15000 })
    const finRow = page.locator('tr', { hasText: SCH_A }).first()
    await expect(finRow).toBeVisible({ timeout: 15000 })
    await expect(finRow.getByText('1 Sesi')).toBeVisible({ timeout: 15000 })
    await expect(finRow.getByText(/50\.000/)).toBeVisible({ timeout: 15000 })

    // ---- cleanup + leftover proof ----
    await cleanup()
    csrf = await primeCsrf(page)
    const leftE = (await readEntity(page, 'eksternal', csrf)).filter(e => (e.nama || '').includes(suffix))
    const leftS = (await readEntity(page, 'sekolah', csrf)).filter(s => (s.nama || '').includes(suffix))
    console.log(`## T2.D.2 leftover: eksternal=${leftE.length} schools=${leftS.length}`)
    expect(leftE.length).toBe(0)
    expect(leftS.length).toBe(0)

    expect(pageErrors).toHaveLength(0)
  } finally {
    if (!cleaned) await cleanup().catch(() => {})
  }
})
