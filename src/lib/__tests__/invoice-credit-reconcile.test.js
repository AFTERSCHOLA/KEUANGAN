import { describe, it, expect } from 'vitest'
import {
  invoiceSettlement,
  invoiceTotalYangHarusDibayar,
  totalYangHarusDibayar,
  carryOverLines,
} from '../invoices.js'

describe('invoice credit carry-over reconciliation and phantom credit guard', () => {
  it('reconciles invoice covered entirely by carry-over credit (Rp 500.000 total, Rp 500.000 credit) -> Lunas, sisa 0, totalYangHarusDibayar 0', () => {
    const invoice = {
      id: 'inv-curr-1',
      sekolahId: 'sch-1',
      grandTotal: 500000,
      status: 'Terbit',
      carryOverLines: [
        {
          type: 'carry-over',
          kind: 'credit',
          invoiceId: 'inv-prev-1',
          description: 'Kelebihan bayar invoice sebelumnya',
          amount: -500000,
          activeAmount: -500000,
          isSettled: false,
        },
      ],
    }

    const settlement = invoiceSettlement(invoice, {
      sppPayments: [],
      invoices: [],
    })

    expect(settlement.total).toBe(500000)
    expect(settlement.creditApplied).toBe(500000)
    expect(settlement.dibayar).toBe(0)
    expect(settlement.sisa).toBe(0)
    expect(settlement.credit).toBe(0)
    expect(settlement.status).toBe('Lunas')

    const totalDue = invoiceTotalYangHarusDibayar(invoice, {
      sppPayments: [],
      invoices: [],
    })
    expect(totalDue).toBe(0)
  })

  it('reconciles invoice with partial credit and partial cash payment (Rp 500.000 total, Rp 200.000 credit, Rp 200.000 cash) -> Belum Lunas, sisa 100.000, totalYangHarusDibayar 100.000', () => {
    const invoice = {
      id: 'inv-curr-2',
      sekolahId: 'sch-1',
      grandTotal: 500000,
      status: 'Terbit',
      carryOverLines: [
        {
          type: 'carry-over',
          kind: 'credit',
          invoiceId: 'inv-prev-2',
          description: 'Kelebihan bayar invoice sebelumnya',
          amount: -200000,
          activeAmount: -200000,
          isSettled: false,
        },
      ],
    }

    const sppPayments = [
      {
        id: 'pay-curr-2',
        invoiceId: 'inv-curr-2',
        nominal: 200000,
      },
    ]

    const settlement = invoiceSettlement(invoice, {
      sppPayments,
      invoices: [],
    })

    expect(settlement.total).toBe(500000)
    expect(settlement.creditApplied).toBe(200000)
    expect(settlement.dibayar).toBe(200000)
    expect(settlement.sisa).toBe(100000)
    expect(settlement.status).toBe('Belum Lunas')

    const totalDue = invoiceTotalYangHarusDibayar(invoice, {
      sppPayments,
      invoices: [],
    })
    expect(totalDue).toBe(100000)
  })

  it('reconciles invoice with partial credit and exact balance cash payment (Rp 500.000 total, Rp 200.000 credit, Rp 300.000 cash) -> Lunas, sisa 0, totalYangHarusDibayar 0', () => {
    const invoice = {
      id: 'inv-curr-3',
      sekolahId: 'sch-1',
      grandTotal: 500000,
      status: 'Terbit',
      carryOverLines: [
        {
          type: 'carry-over',
          kind: 'credit',
          invoiceId: 'inv-prev-3',
          description: 'Kelebihan bayar invoice sebelumnya',
          amount: -200000,
          activeAmount: -200000,
          isSettled: false,
        },
      ],
    }

    const sppPayments = [
      {
        id: 'pay-curr-3',
        invoiceId: 'inv-curr-3',
        nominal: 300000,
      },
    ]

    const settlement = invoiceSettlement(invoice, {
      sppPayments,
      invoices: [],
    })

    expect(settlement.total).toBe(500000)
    expect(settlement.creditApplied).toBe(200000)
    expect(settlement.dibayar).toBe(300000)
    expect(settlement.sisa).toBe(0)
    expect(settlement.status).toBe('Lunas')

    const totalDue = invoiceTotalYangHarusDibayar(invoice, {
      sppPayments,
      invoices: [],
    })
    expect(totalDue).toBe(0)
  })

  it('carryOverLines guard: does NOT emit credit line when previous invoice has grandTotal: 0 / total: 0 (phantom credit guard)', () => {
    const currentInvoice = {
      id: 'inv-curr-guard',
      sekolahId: 'sch-1',
      grandTotal: 500000,
      status: 'Draft',
    }

    const previousZeroInvoice = {
      id: 'inv-prev-zero',
      nomor: 'INV-000',
      sekolahId: 'sch-1',
      grandTotal: 0,
      total: 0,
      status: 'Terbit',
      createdAt: '2026-08-01',
    }

    // Payment on zero-item invoice
    const sppPayments = [
      {
        id: 'pay-zero',
        invoiceId: 'inv-prev-zero',
        nominal: 300000,
      },
    ]

    const lines = carryOverLines(currentInvoice, {
      invoices: [previousZeroInvoice],
      sppPayments,
    })

    // Must NOT emit a phantom credit line!
    expect(lines.find(l => l.kind === 'credit')).toBeUndefined()
    expect(lines).toEqual([])
  })

  it('carryOverLines: emits credit line when previous invoice has positive total and legitimate overpayment', () => {
    const currentInvoice = {
      id: 'inv-curr-real',
      sekolahId: 'sch-1',
      grandTotal: 500000,
      status: 'Draft',
    }

    const previousInvoice = {
      id: 'inv-prev-real',
      nomor: 'INV-100',
      sekolahId: 'sch-1',
      grandTotal: 500000,
      status: 'Terbit',
      createdAt: '2026-08-01',
    }

    const sppPayments = [
      {
        id: 'pay-real',
        invoiceId: 'inv-prev-real',
        nominal: 700000,
      },
    ]

    const lines = carryOverLines(currentInvoice, {
      invoices: [previousInvoice],
      sppPayments,
    })

    const creditLine = lines.find(l => l.kind === 'credit')
    expect(creditLine).toBeDefined()
    expect(creditLine.amount).toBe(-200000)
    expect(creditLine.invoiceId).toBe('inv-prev-real')
  })

  it('keeps status Belum Lunas if invoice has active outstanding debt carry-over even if credit covers current total', () => {
    const invoice = {
      id: 'inv-curr-debt',
      sekolahId: 'sch-1',
      grandTotal: 500000,
      status: 'Terbit',
      carryOverLines: [
        {
          type: 'carry-over',
          kind: 'credit',
          invoiceId: 'inv-prev-c',
          description: 'Kelebihan bayar',
          amount: -500000,
          activeAmount: -500000,
          isSettled: false,
        },
        {
          type: 'carry-over',
          kind: 'outstanding',
          invoiceId: 'inv-prev-d',
          description: 'Sisa tagihan bulan lalu',
          amount: 150000,
          activeAmount: 150000,
          isSettled: false,
        },
      ],
    }

    const settlement = invoiceSettlement(invoice, {
      sppPayments: [],
      invoices: [],
    })

    // Sisa on current invoice is 0 due to creditApplied
    expect(settlement.sisa).toBe(0)
    expect(settlement.creditApplied).toBe(500000)
    // But overall invoice status is Belum Lunas because debt carry-over is active!
    expect(settlement.status).toBe('Belum Lunas')

    // totalYangHarusDibayar includes the active carry-over debt
    const totalDue = invoiceTotalYangHarusDibayar(invoice, {
      sppPayments: [],
      invoices: [],
    })
    expect(totalDue).toBe(150000)
  })
})
