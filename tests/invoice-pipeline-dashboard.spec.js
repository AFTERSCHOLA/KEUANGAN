import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// DC.D.1 (F-DC4; D-DC4/D-EF7) — dashboard-last switch, on screen.
//
// VERIFY: a Tarif school with a Terbit invoice shows the invoice figure
// with the `invoice` badge; a Frozen school (metodePembayaran null) on
// the same run keeps its flat figure with no badge. Never asserts
// pipeline figures from financialData() (layer contract — base stays
// flat); the switch lives in withPipelinePotensi() at component level.
//
// Hermetic: unique schools/students/rows per run in the current periode
// (the dashboard's default); finally deletes invoices, students, then
// schools (school delete cascades referencing surfaces, M-AF5.7).
// ============================================================

const APP = 'http://localhost:5173'
const CABANG_ID = 'cbg-test-pusat'
const PERIODE = new Date().toISOString().slice(0, 7)

async function gotoApp(page) {
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('DC.D.1: dashboard follows the invoice pipeline for Tarif, flat for Frozen', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const tarifNama = `SD PPD Tarif ${suffix}`
  const frozenNama = `SD PPD Frozen ${suffix}`
  const tarifSekolahId = `skl-PPD-t-${suffix}`
  const frozenSekolahId = `skl-PPD-f-${suffix}`
  const invoiceIds = []
  const siswaIds = []
  const sekolahIds = [tarifSekolahId, frozenSekolahId]

  await loginViaApi(page, 'superadmin')
  let csrf = await primeCsrf(page)
  async function api(path, data) {
    csrf = await primeCsrf(page)
    const res = await page.request.post(path, { headers: { 'X-CSRF-Token': csrf }, data })
    if (!res.ok()) throw new Error(`POST ${path} failed: ${res.status()} ${await res.text()}`)
    return res.json()
  }

  try {
    // ---- seed: Tarif school (2 pupils, spp face 100000) + Frozen (1 pupil, spp 250000)
    await api('/api/sekolah.php', { id: tarifSekolahId, nama: tarifNama, spp: 100000, cabangId: CABANG_ID, action: 'create' })
    await api('/api/sekolah.php', { id: frozenSekolahId, nama: frozenNama, spp: 250000, cabangId: CABANG_ID, action: 'create' })
    const tarifCurrent = (await page.request.get('/api/read.php?entity=sekolah').then(r => r.json())).find(s => s.id === tarifSekolahId)
    const { cabangId: _omit, ...tarifRest } = tarifCurrent
    await api('/api/sekolah.php', {
      ...tarifRest,
      id: tarifSekolahId,
      action: 'update',
      metodePembayaran: { basis: 'siswa', tarifPerPertemuan: 60000, trigger: 'per_bulan', jumlahN: null, jumlahMinggu: null, sumberDana: 'sekolah' },
    })

    for (const [i, sekolahId] of [[1, tarifSekolahId], [2, tarifSekolahId], [3, frozenSekolahId]]) {
      const id = `sw-PPD-${suffix}-${i}`
      siswaIds.push(id)
      await api('/api/siswa.php', { id, nama: `Siswa PPD ${suffix}-${i}`, sekolahId, status: 'Aktif', action: 'create' })
    }

    // ---- seed: 3 Hadir meetings for the Tarif school in PERIODE
    for (const day of ['03', '11', '19']) {
      await api('/api/absensi.php', {
        id: `abs-PPD-${suffix}-${day}`,
        cabangId: CABANG_ID,
        sekolahId: tarifSekolahId,
        tanggal: `${PERIODE}-${day}`,
        periode: PERIODE,
        trainerStatus: 'Hadir',
        siswaList: [],
      })
    }

    // ---- generate + Terbit both invoices (canonical generator path)
    for (const sekolahId of sekolahIds) {
      const gen = await api('/api/invoices-generate.php', { periode: PERIODE, uraian: `SPP PPD ${suffix}`, sekolahId })
      const invoice = (gen.generated || []).find(g => g.sekolahId === sekolahId)
      if (!invoice) throw new Error(`no invoice generated for ${sekolahId}: ${JSON.stringify(gen.skipped)}`)
      invoiceIds.push(invoice.id)
    }
    // Tarif math: 60000 x 3 meetings x 2 pupils = 360000 (not the 200000 flat).
    // Frozen math: 250000 x 1 pupil = 250000 (flat, byte-identical).

    // ---- on screen: Data Keuangan per-school rows
    await gotoApp(page)
    await openTab(page, 'Data Keuangan')
    const tarifRow = page.locator('tbody tr', { hasText: tarifNama }).first()
    const frozenRow = page.locator('tbody tr', { hasText: frozenNama }).first()
    await expect(tarifRow).toBeVisible({ timeout: 15000 })
    await expect(frozenRow).toBeVisible({ timeout: 15000 })

    await expect(tarifRow).toContainText('360.000')
    await expect(tarifRow.getByText('invoice', { exact: true })).toBeVisible()
    await expect(frozenRow).toContainText('250.000')
    await expect(frozenRow.getByText('invoice', { exact: true })).toHaveCount(0)
    await expect(frozenRow.getByText('estimasi', { exact: true })).toHaveCount(0)

    expect(pageErrors).toEqual([])
  } finally {
    await loginViaApi(page, 'superadmin')
    for (const id of invoiceIds) {
      const csrfDel = await primeCsrf(page)
      await page.request.post('/api/invoices.php', { headers: { 'X-CSRF-Token': csrfDel }, data: { id, action: 'delete' } })
    }
    for (const id of siswaIds) {
      const csrfDel = await primeCsrf(page)
      await page.request.post('/api/siswa.php', { headers: { 'X-CSRF-Token': csrfDel }, data: { id, action: 'delete' } })
    }
    for (const id of sekolahIds) {
      const csrfDel = await primeCsrf(page)
      await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrfDel }, data: { id, action: 'delete' } })
    }
  }
})
