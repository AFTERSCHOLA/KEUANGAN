import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// PG.A.2 — Prove Absensi Saya unblocked by a UI-created assignment.
//
// VERIFY (docs/PENUGASAN_MILESTONES.md PG.A.2):
// -> the trainer assigned in PG.A.1-style flow via the NEW UI (not an
//    API-seeded bypass) can select that school in Absensi Saya.
// This is the falsifiable closure proof for Bug A.
// ============================================================

const APP = 'http://localhost:5173'
const TRAINER_ID = 'trn-test-1'
const CABANG_ID = 'cbg-test-pusat'

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

async function cleanupAssignment(page, sekolahId) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const listRes = await page.request.get('/api/read.php?entity=trainer')
  if (!listRes.ok()) return
  const list = await listRes.json()
  const current = list.find(t => t.id === TRAINER_ID)
  if (!current) return
  const next = (current.penugasanPengajar || []).filter(a => a && a.sekolahId !== sekolahId)
  if (next.length === (current.penugasanPengajar || []).length) return
  const { cabangId: _omit, ...rest } = current
  await page.request.post('/api/trainer.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { ...rest, id: TRAINER_ID, action: 'update', penugasanPengajar: next },
  })
}

test('PG.A.2: UI-created assignment unblocks Absensi Saya school dropdown', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const namaSekolah = `SD PGA Unblock ${suffix}`

  await loginViaApi(page, 'superadmin')
  let csrf = await primeCsrf(page)
  const sekolahRes = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: `skl-PGAU-${Date.now()}`, nama: namaSekolah, spp: 500000, cabangId: CABANG_ID, action: 'create' },
  })
  if (!sekolahRes.ok()) throw new Error(`seed sekolah failed: ${sekolahRes.status()} ${await sekolahRes.text()}`)
  const { id: sekolahId } = await sekolahRes.json()

  try {
    // Assignment created through the NEW UI, not the API seed path.
    await gotoApp(page)
    await openTab(page, 'Penugasan Pengajar')
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').nth(0).selectOption(sekolahId)
    await dialog.locator('select').nth(1).selectOption(TRAINER_ID)
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()
    await expect(page.getByRole('cell', { name: namaSekolah }).first()).toBeVisible({ timeout: 15000 })

    // Trainer path: the previously-impossible selection now works.
    await loginViaApi(page, 'trainer')
    await gotoApp(page)
    await openTab(page, 'Absensi Saya')
    await expect(page.getByRole('heading', { name: 'Absensi Saya' })).toBeVisible()

    const sekolahSelect = page.locator('select').filter({ has: page.locator(`option[value="${sekolahId}"]`) })
    await expect(sekolahSelect).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Tidak ada penugasan aktif untuk tanggal ini.')).not.toBeVisible()
    await sekolahSelect.selectOption(sekolahId)
    await page.getByRole('button', { name: 'Hadir', exact: true }).click()
    await page.getByRole('button', { name: 'Simpan Absensi' }).click()
    await expect(page.getByText('Tersimpan')).toBeVisible({ timeout: 10000 })

    expect(pageErrors).toEqual([])
  } finally {
    await cleanupAssignment(page, sekolahId)
  }
})
