import { describe, it, expect } from 'vitest'
import { invoicePeriods, invoiceTotal } from '../invoices.js'

// SBF.1 (F-SBF1; D-SBF1) — print-template shape contract. InvoiceTemplate
// normalizes both shapes via invoicePeriods()/invoiceTotal(); this spec
// pins the contract at the pure-function level (no JSX render needed):
// server canonical records carry single `periode` + items[]/grandTotal
// with no periodeList/uraian, legacy client records carry periodeList
// + single-row total. Either shape must resolve without throwing.

const serverInvoice = {
  id: 'inv-SBF1-1',
  sekolahId: 'skl-1',
  periode: '2031-02',
  nomorInvoice: 'AFS-203102-0001',
  nomor: 'AFS-203102-0001',
  tanggal: '2031-02-01',
  tanggalTerbit: '2031-02-01',
  status: 'Terbit',
  items: [
    { deskripsi: 'SPP Bulan Berjalan', jumlahSiswa: 2, hargaSatuan: 500000, total: 1000000 },
    { deskripsi: 'SPP Bulan Berjalan', jumlahSiswa: 1, hargaSatuan: 75000, total: 75000 },
  ],
  grandTotal: 1075000,
}

const legacyInvoice = {
  id: 'inv-SBF1-legacy',
  sekolahId: 'skl-1',
  mode: 'bulanan',
  periodeList: ['2026-09'],
  jumlahSiswa: 2,
  hargaSatuan: 500000,
  total: 1000000,
  uraian: 'Pembayaran SPP bulan September 2026',
  tanggalTerbit: '2026-09-01',
  status: 'Terbit',
  nomor: 'BDG-202609-0001',
}

describe('SBF.1 print shape contract', () => {
  it('server-shape resolves periods, totals, and rows without periodeList', () => {
    expect(serverInvoice.periodeList).toBeUndefined()
    expect(invoicePeriods(serverInvoice)).toEqual(['2031-02'])
    expect(invoiceTotal(serverInvoice)).toBe(1075000)
    const sumItems = serverInvoice.items.reduce((s, it) => s + it.total, 0)
    expect(sumItems).toBe(serverInvoice.grandTotal)
    expect(serverInvoice.nomor || serverInvoice.nomorInvoice).toBe('AFS-203102-0001')
  })

  it('legacy-shape still resolves its single row unchanged', () => {
    expect(invoicePeriods(legacyInvoice)).toEqual(['2026-09'])
    expect(invoiceTotal(legacyInvoice)).toBe(1000000)
  })

  it('missing periodeList never throws (the old crash)', () => {
    expect(() => invoicePeriods({})).not.toThrow()
    expect(invoicePeriods({})).toEqual([])
    expect(invoiceTotal({})).toBe(0)
  })
})
