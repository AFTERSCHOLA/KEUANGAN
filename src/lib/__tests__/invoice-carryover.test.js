import { describe, it, expect } from 'vitest'

import {
  carryOverLines,
  invoiceTotal,
} from '../invoices.js'

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