import { describe, it, expect } from 'vitest'
import { invoiceSettlement } from '../invoices.js'

const baseInvoice = {
  id: 'inv-1',
  sekolahId: 'skl-1',
  periode: '2026-09',
  grandTotal: 1000000,
}

const siswaFixture = [
  { id: 'sw-1', sekolahId: 'skl-1' },
  { id: 'sw-2', sekolahId: 'skl-1' },
  { id: 'sw-other', sekolahId: 'skl-other' }, // sekolah lain — harus dikecualikan
]

describe('invoiceSettlement', () => {
  it('nol pembayaran -> Belum Lunas, sisa penuh', () => {
    const result = invoiceSettlement(baseInvoice, { sppPayments: [], siswa: siswaFixture })
    expect(result.total).toBe(1000000)
    expect(result.dibayar).toBe(0)
    expect(result.sisa).toBe(1000000)
    expect(result.credit).toBe(0)
    expect(result.status).toBe('Belum Lunas')
  })

  it('pembayaran sebagian -> Belum Lunas dengan sisa benar', () => {
    const payments = [
      { siswaId: 'sw-1', periode: '2026-09', nominal: 400000 },
    ]
    const result = invoiceSettlement(baseInvoice, { sppPayments: payments, siswa: siswaFixture })
    expect(result.dibayar).toBe(400000)
    expect(result.sisa).toBe(600000)
    expect(result.status).toBe('Belum Lunas')
  })

  it('pembayaran penuh -> Lunas, sisa 0', () => {
    const payments = [
      { siswaId: 'sw-1', periode: '2026-09', nominal: 600000 },
      { siswaId: 'sw-2', periode: '2026-09', nominal: 400000 },
    ]
    const result = invoiceSettlement(baseInvoice, { sppPayments: payments, siswa: siswaFixture })
    expect(result.dibayar).toBe(1000000)
    expect(result.sisa).toBe(0)
    expect(result.credit).toBe(0)
    expect(result.status).toBe('Lunas')
  })

  it('pembayaran berlebih -> Lunas dengan credit positif', () => {
    const payments = [
      { siswaId: 'sw-1', periode: '2026-09', nominal: 1200000 },
    ]
    const result = invoiceSettlement(baseInvoice, { sppPayments: payments, siswa: siswaFixture })
    expect(result.sisa).toBe(0)
    expect(result.credit).toBe(200000)
    expect(result.status).toBe('Lunas')
  })

  it('pembayaran dengan invoiceId cocok langsung, terlepas dari periode/siswa', () => {
    const payments = [
      { invoiceId: 'inv-1', siswaId: null, periode: '2026-08', nominal: 1000000 },
    ]
    const result = invoiceSettlement(baseInvoice, { sppPayments: payments, siswa: siswaFixture })
    expect(result.dibayar).toBe(1000000)
    expect(result.status).toBe('Lunas')
  })

  it('pembayaran siswa dari sekolah lain tidak ikut terhitung (R-SB6)', () => {
    const payments = [
      { siswaId: 'sw-other', periode: '2026-09', nominal: 1000000 },
    ]
    const result = invoiceSettlement(baseInvoice, { sppPayments: payments, siswa: siswaFixture })
    expect(result.dibayar).toBe(0)
    expect(result.status).toBe('Belum Lunas')
  })

  it('pembayaran di luar periode invoice tidak ikut terhitung', () => {
    const payments = [
      { siswaId: 'sw-1', periode: '2026-08', nominal: 500000 },
    ]
    const result = invoiceSettlement(baseInvoice, { sppPayments: payments, siswa: siswaFixture })
    expect(result.dibayar).toBe(0)
  })

  it('invoice bentuk client (total, periodeList) juga terbaca benar', () => {
    const clientInvoice = { id: 'inv-2', sekolahId: 'skl-1', periodeList: ['2026-09', '2026-10'], total: 500000 }
    const payments = [
      { siswaId: 'sw-1', periode: '2026-10', nominal: 500000 },
    ]
    const result = invoiceSettlement(clientInvoice, { sppPayments: payments, siswa: siswaFixture })
    expect(result.total).toBe(500000)
    expect(result.dibayar).toBe(500000)
    expect(result.status).toBe('Lunas')
  })
})