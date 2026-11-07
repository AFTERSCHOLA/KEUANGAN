import { describe, it, expect } from 'vitest'
import { invoicePaymentBreakdown, invoiceSettlement } from '../invoices.js'

describe('invoicePaymentBreakdown - Multi-stage Installment Payments', () => {
  const baseInvoice = {
    id: 'inv-installment-1',
    nomor: 'BDG-202611-0001',
    sekolahId: 'skl-1',
    periode: '2026-11',
    grandTotal: 600000,
    status: 'Terbit',
  }

  it('Step 0: Tagihan awal Rp 600.000 tanpa pembayaran -> totalAwal: 600.000, sudahDibayar: 0, sisaSaatIni: 600.000, status: Belum Lunas', () => {
    const breakdown = invoicePaymentBreakdown(baseInvoice, { sppPayments: [] })

    expect(breakdown.totalAwal).toBe(600000)
    expect(breakdown.sudahDibayar).toBe(0)
    expect(breakdown.sisaSaatIni).toBe(600000)
    expect(breakdown.credit).toBe(0)
    expect(breakdown.status).toBe('Belum Lunas')
    expect(breakdown.payments).toEqual([])
    expect(breakdown.latestPayment).toBeNull()
  })

  it('Step 1: Cicilan pertama Rp 250.000 -> totalAwal: 600.000, sudahDibayar: 250.000, sisaSaatIni: 350.000, status: Belum Lunas', () => {
    const payment1 = {
      id: 'pay-1',
      invoiceId: 'inv-installment-1',
      nominal: 250000,
      tanggalBayar: '2026-11-05',
      metode: 'Transfer',
      diterimaOleh: 'Admin Kasir',
      createdAt: '2026-11-05T10:00:00Z',
    }

    const breakdown = invoicePaymentBreakdown(baseInvoice, {
      sppPayments: [payment1],
    })

    expect(breakdown.totalAwal).toBe(600000)
    expect(breakdown.sudahDibayar).toBe(250000)
    expect(breakdown.sisaSaatIni).toBe(350000)
    expect(breakdown.credit).toBe(0)
    expect(breakdown.status).toBe('Belum Lunas')
    expect(breakdown.payments).toHaveLength(1)
    expect(breakdown.latestPayment).toEqual(payment1)
  })

  it('Step 2: Cicilan kedua Rp 200.000 -> totalAwal: 600.000, sudahDibayar: 450.000, sisaSaatIni: 150.000, status: Belum Lunas', () => {
    const payment1 = {
      id: 'pay-1',
      invoiceId: 'inv-installment-1',
      nominal: 250000,
      tanggalBayar: '2026-11-05',
      metode: 'Transfer',
      createdAt: '2026-11-05T10:00:00Z',
    }
    const payment2 = {
      id: 'pay-2',
      invoiceId: 'inv-installment-1',
      nominal: 200000,
      tanggalBayar: '2026-11-12',
      metode: 'Transfer',
      createdAt: '2026-11-12T14:30:00Z',
    }

    const breakdown = invoicePaymentBreakdown(baseInvoice, {
      sppPayments: [payment1, payment2],
    })

    expect(breakdown.totalAwal).toBe(600000)
    expect(breakdown.sudahDibayar).toBe(450000)
    expect(breakdown.sisaSaatIni).toBe(150000)
    expect(breakdown.credit).toBe(0)
    expect(breakdown.status).toBe('Belum Lunas')
    expect(breakdown.payments).toHaveLength(2)
    expect(breakdown.latestPayment).toEqual(payment2)
  })

  it('Step 3: Pelunasan akhir Rp 150.000 -> totalAwal: 600.000, sudahDibayar: 600.000, sisaSaatIni: 0, status: Lunas', () => {
    const payment1 = {
      id: 'pay-1',
      invoiceId: 'inv-installment-1',
      nominal: 250000,
      tanggalBayar: '2026-11-05',
      metode: 'Transfer',
      createdAt: '2026-11-05T10:00:00Z',
    }
    const payment2 = {
      id: 'pay-2',
      invoiceId: 'inv-installment-1',
      nominal: 200000,
      tanggalBayar: '2026-11-12',
      metode: 'Transfer',
      createdAt: '2026-11-12T14:30:00Z',
    }
    const payment3 = {
      id: 'pay-3',
      invoiceId: 'inv-installment-1',
      nominal: 150000,
      tanggalBayar: '2026-11-20',
      metode: 'Tunai',
      createdAt: '2026-11-20T09:15:00Z',
    }

    const breakdown = invoicePaymentBreakdown(baseInvoice, {
      sppPayments: [payment1, payment2, payment3],
    })

    expect(breakdown.totalAwal).toBe(600000)
    expect(breakdown.sudahDibayar).toBe(600000)
    expect(breakdown.sisaSaatIni).toBe(0)
    expect(breakdown.credit).toBe(0)
    expect(breakdown.status).toBe('Lunas')
    expect(breakdown.payments).toHaveLength(3)
    expect(breakdown.latestPayment).toEqual(payment3)
  })

  it('Overpayment scenario: total Rp 600.000, paid Rp 650.000 -> sisaSaatIni: 0, credit: 50.000, status: Lunas', () => {
    const payment1 = {
      id: 'pay-1',
      invoiceId: 'inv-installment-1',
      nominal: 300000,
      tanggalBayar: '2026-11-05',
    }
    const paymentOver = {
      id: 'pay-over',
      invoiceId: 'inv-installment-1',
      nominal: 350000,
      tanggalBayar: '2026-11-15',
    }

    const breakdown = invoicePaymentBreakdown(baseInvoice, {
      sppPayments: [payment1, paymentOver],
    })

    expect(breakdown.totalAwal).toBe(600000)
    expect(breakdown.sudahDibayar).toBe(650000)
    expect(breakdown.sisaSaatIni).toBe(0)
    expect(breakdown.credit).toBe(50000)
    expect(breakdown.status).toBe('Lunas')
    expect(breakdown.latestPayment).toEqual(paymentOver)
  })

  it('mengurutkan riwayat pembayaran berdasarkan tanggal secara kronologis ascending', () => {
    const pEarly = {
      id: 'p-early',
      invoiceId: 'inv-installment-1',
      nominal: 100000,
      tanggalBayar: '2026-11-02',
    }
    const pMid = {
      id: 'p-mid',
      invoiceId: 'inv-installment-1',
      nominal: 150000,
      tanggalBayar: '2026-11-10',
    }
    const pLate = {
      id: 'p-late',
      invoiceId: 'inv-installment-1',
      nominal: 200000,
      tanggalBayar: '2026-11-25',
    }

    // Pass in scrambled order
    const breakdown = invoicePaymentBreakdown(baseInvoice, {
      sppPayments: [pLate, pEarly, pMid],
    })

    expect(breakdown.payments.map(p => p.id)).toEqual(['p-early', 'p-mid', 'p-late'])
    expect(breakdown.latestPayment?.id).toBe('p-late')
  })

  it('mendukung invoice legacy dengan properti total (bukan grandTotal)', () => {
    const legacyInvoice = {
      id: 'inv-legacy-1',
      sekolahId: 'skl-1',
      periodeList: ['2026-11'],
      total: 600000,
      status: 'Terbit',
    }
    const pay = {
      id: 'pay-leg',
      invoiceId: 'inv-legacy-1',
      nominal: 200000,
      tanggalBayar: '2026-11-05',
    }

    const breakdown = invoicePaymentBreakdown(legacyInvoice, {
      sppPayments: [pay],
    })

    expect(breakdown.totalAwal).toBe(600000)
    expect(breakdown.sudahDibayar).toBe(200000)
    expect(breakdown.sisaSaatIni).toBe(400000)
    expect(breakdown.status).toBe('Belum Lunas')
  })

  it('mengabaikan pembayaran untuk invoice lain atau sekolah lain', () => {
    const foreignPayment = {
      id: 'pay-foreign',
      invoiceId: 'inv-other',
      nominal: 500000,
      tanggalBayar: '2026-11-05',
    }
    const myPayment = {
      id: 'pay-mine',
      invoiceId: 'inv-installment-1',
      nominal: 100000,
      tanggalBayar: '2026-11-05',
    }

    const breakdown = invoicePaymentBreakdown(baseInvoice, {
      sppPayments: [foreignPayment, myPayment],
    })

    expect(breakdown.sudahDibayar).toBe(100000)
    expect(breakdown.sisaSaatIni).toBe(500000)
    expect(breakdown.payments).toHaveLength(1)
    expect(breakdown.payments[0].id).toBe('pay-mine')
  })

  it('fallback aman ketika invoice bernilai null/undefined', () => {
    const breakdown = invoicePaymentBreakdown(null)

    expect(breakdown).toEqual({
      totalAwal: 0,
      sudahDibayar: 0,
      sisaSaatIni: 0,
      credit: 0,
      status: 'Belum Lunas',
      payments: [],
      latestPayment: null,
    })
  })
})
