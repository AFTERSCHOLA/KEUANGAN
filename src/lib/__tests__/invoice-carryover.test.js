import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  carryOverLines,
  invoiceTotal,
  resolvedCarryOverLines,
  invoiceSettlement,
} from '../invoices.js'
import InvoiceTemplate from '../../features/reports/InvoiceTemplate.jsx'
import { write } from '../store.js'

const siswaFixture = [
  { id: 'sw-1', sekolahId: 'skl-1' },
  { id: 'sw-2', sekolahId: 'skl-1' },
  { id: 'sw-other', sekolahId: 'skl-other' },
]

describe('carryOverLines', () => {
  it('kurang bayar invoice sebelumnya muncul sebagai carry-over positif', () => {
    const previousInvoice = {
      id: 'inv-1',
      sekolahId: 'skl-1',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
      nomor: 'BDG-202609-0001',
      tanggalTerbit: '2026-09-01',
    }

    const nextInvoice = {
      id: 'inv-2',
      sekolahId: 'skl-1',
      periode: '2026-10',
      grandTotal: 800000,
      status: 'Terbit',
      nomor: 'BDG-202610-0002',
      tanggalTerbit: '2026-10-01',
    }

    const sppPayments = [
      {
        invoiceId: 'inv-1',
        siswaId: null,
        periode: '2026-09',
        nominal: 600000,
      },
    ]

    const result = carryOverLines(nextInvoice, {
      invoices: [previousInvoice, nextInvoice],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'carry-over',
      kind: 'outstanding',
      invoiceId: 'inv-1',
      nomorInvoiceAsal: 'BDG-202609-0001',
      amount: 400000,
    })
  })

  it('lebih bayar invoice sebelumnya muncul sebagai carry-over negatif', () => {
    const previousInvoice = {
      id: 'inv-1',
      sekolahId: 'skl-1',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
      nomor: 'BDG-202609-0001',
      tanggalTerbit: '2026-09-01',
    }

    const nextInvoice = {
      id: 'inv-2',
      sekolahId: 'skl-1',
      periode: '2026-10',
      grandTotal: 800000,
      status: 'Terbit',
      nomor: 'BDG-202610-0002',
      tanggalTerbit: '2026-10-01',
    }

    const sppPayments = [
      {
        invoiceId: 'inv-1',
        siswaId: null,
        periode: '2026-09',
        nominal: 1200000,
      },
    ]

    const result = carryOverLines(nextInvoice, {
      invoices: [previousInvoice, nextInvoice],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'carry-over',
      kind: 'credit',
      invoiceId: 'inv-1',
      nomorInvoiceAsal: 'BDG-202609-0001',
      amount: -200000,
    })
  })

  it('invoice sebelumnya yang lunas tidak menghasilkan carry-over', () => {
    const previousInvoice = {
      id: 'inv-1',
      sekolahId: 'skl-1',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
      tanggalTerbit: '2026-09-01',
    }

    const nextInvoice = {
      id: 'inv-2',
      sekolahId: 'skl-1',
      periode: '2026-10',
      grandTotal: 800000,
      status: 'Terbit',
      tanggalTerbit: '2026-10-01',
    }

    const sppPayments = [
      {
        invoiceId: 'inv-1',
        siswaId: null,
        periode: '2026-09',
        nominal: 1000000,
      },
    ]

    const result = carryOverLines(nextInvoice, {
      invoices: [previousInvoice, nextInvoice],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(result).toEqual([])
  })

  it('invoice dari sekolah lain tidak ikut menjadi sumber carry-over', () => {
    const previousOtherSchool = {
      id: 'inv-other',
      sekolahId: 'skl-other',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
      tanggalTerbit: '2026-09-01',
    }

    const nextInvoice = {
      id: 'inv-2',
      sekolahId: 'skl-1',
      periode: '2026-10',
      grandTotal: 800000,
      status: 'Terbit',
      tanggalTerbit: '2026-10-01',
    }

    const sppPayments = [
      {
        invoiceId: 'inv-other',
        siswaId: null,
        periode: '2026-09',
        nominal: 600000,
      },
    ]

    const result = carryOverLines(nextInvoice, {
      invoices: [previousOtherSchool, nextInvoice],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(result).toEqual([])
  })

  it('carry-over selalu membawa invoiceId dan nomor invoice asal', () => {
    const previousInvoice = {
      id: 'inv-1',
      sekolahId: 'skl-1',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
      nomor: 'BDG-202609-0001',
      tanggalTerbit: '2026-09-01',
    }

    const nextInvoice = {
      id: 'inv-2',
      sekolahId: 'skl-1',
      periode: '2026-10',
      grandTotal: 800000,
      status: 'Terbit',
      tanggalTerbit: '2026-10-01',
    }

    const sppPayments = [
      {
        invoiceId: 'inv-1',
        siswaId: null,
        periode: '2026-09',
        nominal: 750000,
      },
    ]

    const result = carryOverLines(nextInvoice, {
      invoices: [previousInvoice, nextInvoice],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(result).toHaveLength(1)
    expect(result[0].invoiceId).toBe('inv-1')
    expect(result[0].nomorInvoiceAsal).toBe('BDG-202609-0001')
  })

  it('hanya invoice Terbit yang boleh menjadi sumber carry-over', () => {
    const previousDraft = {
      id: 'inv-draft',
      sekolahId: 'skl-1',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Draft',
      tanggalTerbit: '2026-09-01',
    }

    const nextInvoice = {
      id: 'inv-2',
      sekolahId: 'skl-1',
      periode: '2026-10',
      grandTotal: 800000,
      status: 'Terbit',
      tanggalTerbit: '2026-10-01',
    }

    const sppPayments = [
      {
        invoiceId: 'inv-draft',
        siswaId: null,
        periode: '2026-09',
        nominal: 600000,
      },
    ]

    const result = carryOverLines(nextInvoice, {
      invoices: [previousDraft, nextInvoice],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(result).toEqual([])
  })

  it('mengambil invoice Terbit sebelumnya yang paling baru', () => {
    const olderInvoice = {
      id: 'inv-old',
      sekolahId: 'skl-1',
      periode: '2026-08',
      grandTotal: 1000000,
      status: 'Terbit',
      nomor: 'BDG-202608-0001',
      tanggalTerbit: '2026-08-01',
    }

    const latestInvoice = {
      id: 'inv-latest',
      sekolahId: 'skl-1',
      periode: '2026-09',
      grandTotal: 700000,
      status: 'Terbit',
      nomor: 'BDG-202609-0002',
      tanggalTerbit: '2026-09-01',
    }

    const nextInvoice = {
      id: 'inv-next',
      sekolahId: 'skl-1',
      periode: '2026-10',
      grandTotal: 800000,
      status: 'Terbit',
      tanggalTerbit: '2026-10-01',
    }

    const sppPayments = [
      {
        invoiceId: 'inv-old',
        siswaId: null,
        periode: '2026-08',
        nominal: 500000,
      },
      {
        invoiceId: 'inv-latest',
        siswaId: null,
        periode: '2026-09',
        nominal: 500000,
      },
    ]

    const result = carryOverLines(nextInvoice, {
      invoices: [olderInvoice, latestInvoice, nextInvoice],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(result).toHaveLength(1)
    expect(result[0].invoiceId).toBe('inv-latest')
    expect(result[0].amount).toBe(200000)
  })
})

  it('invoice Terbit tetap memiliki total yang sama saat carry-over dihitung', () => {
    const previousInvoice = {
      id: 'inv-1',
      sekolahId: 'skl-1',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
      nomor: 'BDG-202609-0001',
      tanggalTerbit: '2026-09-01',
    }

    const nextInvoice = {
      id: 'inv-2',
      sekolahId: 'skl-1',
      periode: '2026-10',
      grandTotal: 800000,
      status: 'Terbit',
      nomor: 'BDG-202610-0002',
      tanggalTerbit: '2026-10-01',
    }

    const sppPayments = [
      {
        invoiceId: 'inv-1',
        siswaId: null,
        periode: '2026-09',
        nominal: 600000,
      },
    ]

    const previousTotal = invoiceTotal(previousInvoice)
    const nextTotal = invoiceTotal(nextInvoice)

    const result = carryOverLines(nextInvoice, {
      invoices: [previousInvoice, nextInvoice],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(result[0]).toMatchObject({
      kind: 'outstanding',
      amount: 400000,
      invoiceId: 'inv-1',
    })

    // Carry-over tidak boleh mengubah total invoice yang sudah Terbit.
    expect(invoiceTotal(previousInvoice)).toBe(previousTotal)
    expect(invoiceTotal(nextInvoice)).toBe(nextTotal)
    expect(nextInvoice.grandTotal).toBe(800000)
  })

  it('carry-over tidak mengubah invoice Terbit asal maupun menyimpannya sebagai perubahan invoice', () => {
    const previousInvoice = {
      id: 'inv-1',
      sekolahId: 'skl-1',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
      nomor: 'BDG-202609-0001',
      tanggalTerbit: '2026-09-01',
    }

    const nextInvoice = {
      id: 'inv-2',
      sekolahId: 'skl-1',
      periode: '2026-10',
      grandTotal: 800000,
      status: 'Terbit',
      nomor: 'BDG-202610-0002',
      tanggalTerbit: '2026-10-01',
    }

    const beforePrevious = JSON.parse(JSON.stringify(previousInvoice))
    const beforeNext = JSON.parse(JSON.stringify(nextInvoice))

    carryOverLines(nextInvoice, {
      invoices: [previousInvoice, nextInvoice],
      sppPayments: [
        {
          invoiceId: 'inv-1',
          siswaId: null,
          periode: '2026-09',
          nominal: 600000,
        },
      ],
      siswa: siswaFixture,
    })

    expect(previousInvoice).toEqual(beforePrevious)
    expect(nextInvoice).toEqual(beforeNext)
  })

describe('resolvedCarryOverLines and dynamic reconciliation', () => {
  const previousInvoice = {
    id: 'inv-1',
    sekolahId: 'skl-1',
    periode: '2026-09',
    grandTotal: 1000000,
    status: 'Terbit',
    nomor: 'BDG-202609-0001',
    tanggalTerbit: '2026-09-01',
  }

  const nextInvoiceWithCarryOver = {
    id: 'inv-2',
    sekolahId: 'skl-1',
    periode: '2026-10',
    grandTotal: 800000,
    status: 'Terbit',
    nomor: 'BDG-202610-0002',
    tanggalTerbit: '2026-10-01',
    carryOverLines: [
      {
        type: 'carry-over',
        kind: 'outstanding',
        invoiceId: 'inv-1',
        nomorInvoiceAsal: 'BDG-202609-0001',
        description: 'Sisa tagihan invoice BDG-202609-0001',
        amount: 400000,
      },
    ],
  }

  it('returns empty array when carryOverLines is empty or not an array', () => {
    expect(resolvedCarryOverLines({})).toEqual([])
    expect(resolvedCarryOverLines({ carryOverLines: [] })).toEqual([])
    expect(resolvedCarryOverLines({ carryOverLines: null })).toEqual([])
  })

  it('when previous invoice is unsettled, returns line with activeAmount and isSettled: false', () => {
    // Only 600,000 paid towards 1,000,000 total -> 400,000 sisa
    const sppPayments = [
      {
        invoiceId: 'inv-1',
        nominal: 600000,
      },
    ]

    const resolved = resolvedCarryOverLines(nextInvoiceWithCarryOver, {
      invoices: [previousInvoice, nextInvoiceWithCarryOver],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      invoiceId: 'inv-1',
      kind: 'outstanding',
      amount: 400000,
      activeAmount: 400000,
      isSettled: false,
    })
  })

  it('when previous invoice is settled via payment, returns isSettled: true and activeAmount: 0', () => {
    // 1,000,000 fully paid towards previous invoice
    const sppPayments = [
      {
        invoiceId: 'inv-1',
        nominal: 1000000,
      },
    ]

    const resolved = resolvedCarryOverLines(nextInvoiceWithCarryOver, {
      invoices: [previousInvoice, nextInvoiceWithCarryOver],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      invoiceId: 'inv-1',
      kind: 'outstanding',
      amount: 400000,
      activeAmount: 0,
      isSettled: true,
    })
  })

  it('when previous invoice is partially settled, caps activeAmount at prevSettlement.sisa', () => {
    // Paid 800,000 towards 1,000,000 total -> sisa is 200,000 (less than carry-over line amount 400,000)
    const sppPayments = [
      {
        invoiceId: 'inv-1',
        nominal: 800000,
      },
    ]

    const resolved = resolvedCarryOverLines(nextInvoiceWithCarryOver, {
      invoices: [previousInvoice, nextInvoiceWithCarryOver],
      sppPayments,
      siswa: siswaFixture,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      invoiceId: 'inv-1',
      kind: 'outstanding',
      amount: 400000,
      activeAmount: 200000,
      isSettled: false,
    })
  })

  it('preserves line amount and isSettled: false when referenced invoice is not found', () => {
    const resolved = resolvedCarryOverLines(nextInvoiceWithCarryOver, {
      invoices: [nextInvoiceWithCarryOver], // prev invoice omitted
      sppPayments: [],
      siswa: siswaFixture,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      invoiceId: 'inv-1',
      amount: 400000,
      activeAmount: 400000,
      isSettled: false,
    })
  })

  it('resolves credit carry-over line properly', () => {
    const invWithCredit = {
      ...nextInvoiceWithCarryOver,
      carryOverLines: [
        {
          type: 'carry-over',
          kind: 'credit',
          invoiceId: 'inv-1',
          nomorInvoiceAsal: 'BDG-202609-0001',
          description: 'Kelebihan bayar invoice BDG-202609-0001',
          amount: -200000,
        },
      ],
    }

    // Previous invoice received 1,200,000 (200,000 credit)
    const sppPaymentsWithCredit = [
      {
        invoiceId: 'inv-1',
        nominal: 1200000,
      },
    ]

    const resolved = resolvedCarryOverLines(invWithCredit, {
      invoices: [previousInvoice, invWithCredit],
      sppPayments: sppPaymentsWithCredit,
      siswa: siswaFixture,
    })

    expect(resolved[0].isSettled).toBe(false)
    expect(resolved[0].activeAmount).toBe(-200000)

    // When previous invoice had no credit
    const sppPaymentsExact = [
      {
        invoiceId: 'inv-1',
        nominal: 1000000,
      },
    ]
    const resolvedNoCredit = resolvedCarryOverLines(invWithCredit, {
      invoices: [previousInvoice, invWithCredit],
      sppPayments: sppPaymentsExact,
      siswa: siswaFixture,
    })
    expect(resolvedNoCredit[0].isSettled).toBe(true)
    expect(resolvedNoCredit[0].activeAmount).toBe(0)
  })

  it('invoiceSettlement updates Invoice 2 status to Lunas only after Invoice 1 is settled', () => {
    // Invoice 2 itself is fully paid (800,000)
    const paymentInv2 = {
      invoiceId: 'inv-2',
      nominal: 800000,
    }

    // Invoice 1 is not fully paid yet (600,000 / 1,000,000)
    const partialPaymentInv1 = {
      invoiceId: 'inv-1',
      nominal: 600000,
    }

    const settlementBefore = invoiceSettlement(nextInvoiceWithCarryOver, {
      invoices: [previousInvoice, nextInvoiceWithCarryOver],
      sppPayments: [paymentInv2, partialPaymentInv1],
      siswa: siswaFixture,
    })
    expect(settlementBefore.sisa).toBe(0)
    expect(settlementBefore.status).toBe('Belum Lunas')

    // Now Invoice 1 is settled with additional payment of 400,000
    const fullPaymentInv1 = {
      invoiceId: 'inv-1',
      nominal: 400000,
    }

    const settlementAfter = invoiceSettlement(nextInvoiceWithCarryOver, {
      invoices: [previousInvoice, nextInvoiceWithCarryOver],
      sppPayments: [paymentInv2, partialPaymentInv1, fullPaymentInv1],
      siswa: siswaFixture,
    })
    expect(settlementAfter.sisa).toBe(0)
    expect(settlementAfter.status).toBe('Lunas')
  })

  it('InvoiceTemplate renders settled carry-over as line-through emerald Lunas (Rp 0)', () => {
    const sekolah = { id: 'skl-1', nama: 'SD Sukajadi', spp: 100000 }
    const invoices = [previousInvoice, nextInvoiceWithCarryOver]
    const sppPayments = [
      { invoiceId: 'inv-1', nominal: 1000000 },
      { invoiceId: 'inv-2', nominal: 800000 },
    ]
    write('invoices', invoices)
    write('sppPayments', sppPayments)
    write('siswa', siswaFixture)

    const html = renderToStaticMarkup(
      React.createElement(InvoiceTemplate, {
        invoice: nextInvoiceWithCarryOver,
        sekolah,
        invoices,
        sppPayments,
        siswa: siswaFixture,
      })
    )

    // Must show line-through emerald and Lunas (Rp 0)
    expect(html).toContain('text-emerald-600 line-through opacity-70')
    expect(html).toContain('Sisa tagihan invoice BDG-202609-0001: Lunas (Rp 0)')
    // Must not display old unsettled amber style
    expect(html).not.toContain('text-amber-600')
  })
})