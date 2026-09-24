import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// PG.A.1 — Penugasan manager writes trainer.penugasanPengajar[].
//
// VERIFY (docs/PENUGASAN_MILESTONES.md PG.A.1):
// -> admin creates assignment via UI, refresh, row persists;
// -> validator rejects mismatched/empty input with pinned copy;
// -> readCached('trainer') contains the row (store state, not just text).
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

async function seedSchoolAsSuperadmin(page, namaSekolah) {
  await loginViaApi(page, 'superadmin')
  const csrf = await primeCsrf(page)
  const res = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id: `skl-PGA-${Date.now()}`, nama: namaSekolah, spp: 500000, cabangId: CABANG_ID, action: 'create' },
  })
  if (!res.ok()) throw new Error(`seed sekolah failed: ${res.status()} ${await res.text()}`)
  return res.json()
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

test('PG.A.1: admin creates active assignment via UI, persists across refresh', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const sekolah = await seedSchoolAsSuperadmin(page, `SD PGA Sim ${suffix}`)
  const sekolahId = sekolah.id

  try {
    await loginViaApi(page, 'superadmin')
    await gotoApp(page)
    await openTab(page, 'Penugasan Pengajar')

    await expect(page.getByRole('heading', { name: 'Penugasan Pengajar' })).toBeVisible()
    await page.getByRole('button', { name: 'Tambah Penugasan', exact: true }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').nth(0).selectOption(sekolahId)
    await dialog.locator('select').nth(1).selectOption(TRAINER_ID)
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click()

    await expect(page.getByRole('cell', { name: `SD PGA Sim ${suffix}` }).first()).toBeVisible({ timeout: 15000 })

    // Persistensi: refresh penuh, baris harus terbaca kembali dari server.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Penugasan Pengajar')
    await expect(page.getByRole('cell', { name: `SD PGA Sim ${suffix}` }).first()).toBeVisible({ timeout: 15000 })

    // Invariant tersembunyi: store/server state, bukan cuma teks tabel.
    const storeState = await page.evaluate(() => {
      const raw = localStorage.getItem('afterschola_v4_trainer')
      const trainers = raw ? JSON.parse(raw) : []
      const host = trainers.find(t => t.id === 'trn-test-1')
      return (host && host.penugasanPengajar) || []
    })
    expect(storeState.some(a => a.sekolahId === sekolahId && a.trainerId === TRAINER_ID && a.aktif === true)).toBe(true)

    const readRes = await page.request.get('/api/read.php?entity=trainer')
    expect(readRes.ok()).toBe(true)
    const rows = await readRes.json()
    const host = rows.find(t => t.id === TRAINER_ID)
    expect(host.penugasanPengajar.some(a => a.sekolahId === sekolahId && a.trainerId === TRAINER_ID && a.aktif === true)).toBe(true)

    expect(pageErrors).toEqual([])
  } finally {
    await cleanupAssignment(page, sekolahId)
  }
})
