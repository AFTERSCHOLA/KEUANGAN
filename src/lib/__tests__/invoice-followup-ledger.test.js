import { describe, it, expect } from 'vitest'
import { invoiceSettlement, carryOverLines } from '../invoices.js'
import { financialData } from '../finance.js'
import { newSppPayment } from '../sppPayments.js'

describe('Invoice Follow-Up Payment Ledger Integration', () => {
  const invoice1 = {
    id: 'inv-1',
    nomor: 'INV/202609/001',
    sekolahId: 'skl-1',
    cabangId: 'cbg-1',
    periode: '2026-09',
    grandTotal: 5000000,
    status: 'Terbit',
    createdAt: '2026-09-01T08:00:00Z',
  }

  const invoice2 = {
    id: 'inv-2',
    nomor: 'INV/202610/001',
    sekolahId: 'skl-1',
    cabangId: 'cbg-1',
    periode: '2026-10',
    grandTotal: 5000000,
    status: 'Terbit',
    createdAt: '2026-10-01T08:00:00Z',
  }

  const schoolFollowUpPayment = {
    id: 'spp-fu-1',
    siswaId: null,
    sekolahId: 'skl-1',
    cabangId: 'cbg-1',
    invoiceId: 'inv-1',
    nominal: 2000000,
    periode: '2026-09',
    tanggalBayar: '2026-09-10',
    metode: 'Transfer',
    diterimaOleh: 'Admin',
    sumberDana: 'sekolah',
    catatan: 'Pembayaran via follow-up',
    buktiBayar: 'https://example.com/receipt.jpg',
  }

  describe('newSppPayment helper for school follow-up payments', () => {
    it('creates a school-level payment record matching follow-up specifications', () => {
      const payment = newSppPayment({
        siswaId: null,
        sekolahId: invoice1.sekolahId,
        cabangId: invoice1.cabangId,
        invoiceId: invoice1.id,
        nominal: 2000000,
        periode: invoice1.periode,
        tanggalBayar: '2026-09-10',
        metode: 'Transfer',
        diterimaOleh: 'Admin',
        sumberDana: 'sekolah',
        catatan: 'Pembayaran via follow-up',
        buktiBayar: 'https://example.com/receipt.jpg',
      })

      expect(payment.siswaId).toBeNull()
      expect(payment.sekolahId).toBe('skl-1')
      expect(payment.cabangId).toBe('cbg-1')
      expect(payment.invoiceId).toBe('inv-1')
      expect(payment.nominal).toBe(2000000)
      expect(payment.periode).toBe('2026-09')
      expect(payment.tanggalBayar).toBe('2026-09-10')
      expect(payment.metode).toBe('Transfer')
      expect(payment.diterimaOleh).toBe('Admin')
      expect(payment.sumberDana).toBe('sekolah')
      expect(payment.catatan).toBe('Pembayaran via follow-up')
      expect(payment.buktiBayar).toBe('https://example.com/receipt.jpg')
      expect(payment.bukti).toBe('https://example.com/receipt.jpg')
    })
  })

  describe('invoiceSettlement with school-level follow-up payments', () => {
    it('derives settlement.dibayar = 2000000 and settlement.sisa = 3000000 for Rp 5,000,000 invoice with Rp 2,000,000 payment', () => {
      const settlement = invoiceSettlement(invoice1, {
        sppPayments: [schoolFollowUpPayment],
        siswa: [],
      })

      expect(settlement.total).toBe(5000000)
      expect(settlement.dibayar).toBe(2000000)
      expect(settlement.sisa).toBe(3000000)
      expect(settlement.status).toBe('Belum Lunas')
    })

    it('derives settlement.status = Lunas when full amount is paid via follow-up', () => {
      const fullPayment = {
        ...schoolFollowUpPayment,
        id: 'spp-fu-full',
        nominal: 5000000,
      }
      const settlement = invoiceSettlement(invoice1, {
        sppPayments: [fullPayment],
        siswa: [],
      })

      expect(settlement.total).toBe(5000000)
      expect(settlement.dibayar).toBe(5000000)
      expect(settlement.sisa).toBe(0)
      expect(settlement.status).toBe('Lunas')
    })
  })

  describe('carryOverLines on subsequent invoice with leftover unpaid balance', () => {
    it('generates an outstanding carry-over line of Rp 3,000,000 on subsequent invoice', () => {
      const carryLines = carryOverLines(invoice2, {
        invoices: [invoice1, invoice2],
        sppPayments: [schoolFollowUpPayment],
        siswa: [],
      })

      expect(carryLines).toHaveLength(1)
      expect(carryLines[0]).toMatchObject({
        type: 'carry-over',
        kind: 'outstanding',
        invoiceId: 'inv-1',
        nomorInvoiceAsal: 'INV/202609/001',
        amount: 3000000,
      })
    })
  })

  describe('financialData cash revenue integration', () => {
    const sekolahFixture = [
      { id: 'skl-1', nama: 'SD Sukajadi', spp: 100000, trainerIds: ['trn-1'] },
    ]
    const siswaFixture = [
      { id: 'sw-1', nama: 'Siswa 1', sekolahId: 'skl-1', status: 'Aktif' },
    ]

    it('includes school-level follow-up payments in realisasiSpp and pemasukanSpp for matching period', () => {
      const result = financialData({
        sekolah: sekolahFixture,
        siswa: siswaFixture,
        trainer: [],
        absensi: [],
        honorPayments: [],
        sppPayments: [schoolFollowUpPayment],
        periode: '2026-09',
      })

      expect(result.sekolahFinance[0].realisasiSpp).toBe(2000000)
      expect(result.pemasukanSpp).toBe(2000000)
    })

    it('combines student payments and school follow-up payments without double counting', () => {
      const studentPayment = {
        id: 'spp-sw-1',
        siswaId: 'sw-1',
        sekolahId: 'skl-1',
        periode: '2026-09',
        nominal: 100000,
        sumberDana: 'ortu',
      }

      const result = financialData({
        sekolah: sekolahFixture,
        siswa: siswaFixture,
        trainer: [],
        absensi: [],
        honorPayments: [],
        sppPayments: [studentPayment, schoolFollowUpPayment],
        periode: '2026-09',
      })

      // 100,000 from student + 2,000,000 from school follow-up = 2,100,000
      expect(result.sekolahFinance[0].realisasiSpp).toBe(2100000)
      expect(result.pemasukanSpp).toBe(2100000)
    })

    it('excludes school-level payments from different periods', () => {
      const result = financialData({
        sekolah: sekolahFixture,
        siswa: siswaFixture,
        trainer: [],
        absensi: [],
        honorPayments: [],
        sppPayments: [schoolFollowUpPayment],
        periode: '2026-10', // Different period than payment (2026-09)
      })

      expect(result.sekolahFinance[0].realisasiSpp).toBe(0)
      expect(result.pemasukanSpp).toBe(0)
    })
  })
})
