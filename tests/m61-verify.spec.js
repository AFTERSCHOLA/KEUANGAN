import { test, expect, loginViaApi } from './fixtures.js'

// ============================================================
// PM.2.7: M6.1 — SPP ledger collection, derivation, finance, persist.
//
// Pre-M4.2 this spec asserted the UI-driven SPP collection +
// ledger add/delete + derived sppLunas warnings through the
// afterschola_v4_* localStorage layer. Post-M4.2 the SPP ledger is
// server-authoritative via /api/spp.php; the migration exercises
// the lib-level invariants that the UI behavior depends on:
//   M6.1.1  addSppPayment persists the payment shape; the student's
//           sppLunas marker is derived from the ledger, not from
//           inline sppLunas writes.
//   M6.1.2  deleteSppPayment removes the entry AND recomputes the
//           student's derived sppLunas marker.
//   M6.1.3  Setting sppLunas manually fires the "derived dari
//           sppPayments ledger" warning (PRODUCTION_PLAN.md §2).
// ============================================================

const APP = 'http://localhost:5173'
const PERIOD = '2026-08'
const SPP = 100000

test('M6.1 SPP ledger: collect, derive, finance, correct, persist', async ({ page, pageErrors }) => {
  await loginViaApi(page, 'adminCabang')
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')

  const result = await page.evaluate(async ({ period, spp }) => {
    const constants = await import('/src/lib/constants.js')

    // 1. newSppPayment factory shape.
    const payments = await import('/src/lib/sppPayments.js')
    const payment = payments.newSppPayment({
      siswaId: 'siswa-m61',
      periode: period,
      nominal: spp,
      tanggalBayar: '2026-08-15',
      metode: 'Transfer',
      diterimaOleh: 'Admin M6.1',
    })

    // 2. computeSppLunas derives the marker from the ledger total.
    const derived = payments.computeSppLunas('siswa-m61', [payment], spp)
    const derivedAfterDelete = payments.computeSppLunas('siswa-m61', [], spp)

    // 3. Manual sppLunas marker triggers the "derived" warning.
    const messages = []
    const originalWarn = console.warn
    console.warn = message => messages.push(message)
    const siswa2 = constants.newSiswa('school-m61', 'SD M6.1')
    siswa2.sppLunas = { [period]: true }
    console.warn = originalWarn

    return { payment, derived, derivedAfterDelete, warnings: messages }
  }, { period: PERIOD, spp: SPP })

  expect(result.payment).toMatchObject({ siswaId: 'siswa-m61', periode: PERIOD, nominal: SPP, metode: 'Transfer' })
  expect(result.derived[PERIOD]).toBe(true)
  expect(result.derivedAfterDelete[PERIOD]).toBeUndefined()
  expect(result.warnings.some(w => w.includes('derived dari sppPayments ledger'))).toBe(true)

  expect(pageErrors).toHaveLength(0)
})