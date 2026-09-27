import { test, expect, loginViaApi, primeCsrf } from './fixtures.js'

// ============================================================
// F12 (user-directed 2026-09-27) — invoice follow-up outreach.
//
// VERIFY: superadmin records penerima + WA + send/follow-up dates +
// note on a Terbit invoice via the Riwayat editor; the line renders and
// survives a full reload (server-persisted, not local). Billing math
// never reads followUp (code-level invariant, see InvoiceModal.jsx).
// Hermetic: unique school/student per run; finally deletes invoice,
// student, then school (cascade handles the rest, M-AF5.7).
// ============================================================

const APP = 'http://localhost:5173'
const CABANG_ID = 'cbg-test-pusat'
const PERIODE = new Date().toISOString().slice(0, 7)

async function fillByLabelText(page, scope, labelText, value) {
  const label = scope.locator('label', { hasText: labelText }).first()
  const input = label.locator('xpath=following-sibling::input[1]')
  await input.fill('')
  await input.fill(value)
}

async function openTab(page, label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
}

test('F12: follow-up outreach persists on the invoice and renders', async ({ page, pageErrors }) => {
  const suffix = String(Date.now()).slice(-6)
  const namaSekolah = `SD F12 Sim ${suffix}`
  const sekolahId = `skl-F12-${suffix}`
  const siswaId = `sw-F12-${suffix}`
  const penerima = `Penerima F12 ${suffix}`
  let invoiceId = null

  await loginViaApi(page, 'superadmin')
  async function api(path, data) {
    const csrf = await primeCsrf(page)
    const res = await page.request.post(path, { headers: { 'X-CSRF-Token': csrf }, data })
    if (!res.ok()) throw new Error(`POST ${path} failed: ${res.status()} ${await res.text()}`)
    return res.json()
  }

  try {
    await api('/api/sekolah.php', { id: sekolahId, nama: namaSekolah, spp: 250000, cabangId: CABANG_ID, action: 'create' })
    await api('/api/siswa.php', { id: siswaId, nama: `Siswa F12 ${suffix}`, sekolahId, status: 'Aktif', action: 'create' })
    const gen = await api('/api/invoices-generate.php', { periode: PERIODE, uraian: `SPP F12 ${suffix}`, sekolahId })
    const invoice = (gen.generated || []).find(g => g.sekolahId === sekolahId)
    if (!invoice) throw new Error(`no invoice generated: ${JSON.stringify(gen.skipped)}`)
    invoiceId = invoice.id

    await page.goto(APP)
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Data Sekolah')
    const card = page.locator('.grid > div', { hasText: namaSekolah }).first()
    await card.getByTitle('Kelola Invoice').click()
    await expect(page.getByText(`Invoice — ${namaSekolah}`)).toBeVisible()

    const row = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
    await expect(row.getByText('Belum Lunas')).toBeVisible({ timeout: 20000 })
    await row.getByRole('button', { name: 'Follow-up', exact: true }).click()
    await fillByLabelText(page, row, 'Penerima', penerima)
    await fillByLabelText(page, row, 'No WA', '08123456789')
    await fillByLabelText(page, row, 'Tgl kirim', `${PERIODE}-05`)
    await fillByLabelText(page, row, 'Tgl follow-up', `${PERIODE}-12`)
    await fillByLabelText(page, row, 'Catatan', `Catatan F12 ${suffix}`)
    await row.getByRole('button', { name: 'Simpan Follow-up', exact: true }).click()

    await expect(row.getByText(penerima)).toBeVisible({ timeout: 15000 })
    await expect(row.getByText('628123456789')).toBeVisible()

    // Persistence: full reload, reopen, line still there from the server.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await openTab(page, 'Data Sekolah')
    const reopenCard = page.locator('.grid > div', { hasText: namaSekolah }).first()
    await reopenCard.getByTitle('Kelola Invoice').click()
    const reopened = page.getByText('Riwayat Invoice').locator('..').locator('.space-y-2 > div').first()
    await expect(reopened.getByText(penerima)).toBeVisible({ timeout: 20000 })
    await expect(reopened.getByText('628123456789')).toBeVisible()

    expect(pageErrors).toEqual([])
  } finally {
    await loginViaApi(page, 'superadmin')
    if (invoiceId) {
      const csrf = await primeCsrf(page)
      await page.request.post('/api/invoices.php', { headers: { 'X-CSRF-Token': csrf }, data: { id: invoiceId, action: 'delete' } })
    }
    const csrf2 = await primeCsrf(page)
    await page.request.post('/api/siswa.php', { headers: { 'X-CSRF-Token': csrf2 }, data: { id: siswaId, action: 'delete' } })
    const csrf3 = await primeCsrf(page)
    await page.request.post('/api/sekolah.php', { headers: { 'X-CSRF-Token': csrf3 }, data: { id: sekolahId, action: 'delete' } })
  }
})
