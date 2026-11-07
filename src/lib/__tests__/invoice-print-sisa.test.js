import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import InvoiceTemplate from '../../features/reports/InvoiceTemplate.jsx'
import { formatRupiah } from '../format.js'

describe('InvoiceTemplate - Sisa Tagihan & Carry-Over Audit Breakdown', () => {
  const mockSekolah = {
    id: 'skl-test-sisa',
    nama: 'SD Lentera Harapan',
    cabangId: 'cbg-bandung',
    spp: 500000,
  }

  describe('Case A: Invoice carries over an earlier invoice with installment audit trail', () => {
    it('renders the complete audit trail when carrying over an earlier invoice with installment payments', () => {
      const prevInvoice = {
        id: 'inv-prev-001',
        nomor: 'AFS-202607-0001',
        nomorInvoice: 'AFS-202607-0001',
        sekolahId: 'skl-test-sisa',
        periode: '2026-07',
        tanggalTerbit: '2026-07-01',
        grandTotal: 600000,
        status: 'Terbit',
        items: [
          { deskripsi: 'SPP Coding Juli 2026', jumlahSiswa: 1, hargaSatuan: 600000, total: 600000 }
        ],
      }

      const sppPayments = [
        {
          id: 'pay-001',
          invoiceId: 'inv-prev-001',
          sekolahId: 'skl-test-sisa',
          nominal: 250000,
          tanggalBayar: '2026-07-10',
          metode: 'Transfer',
        },
        {
          id: 'pay-002',
          invoiceId: 'inv-prev-001',
          sekolahId: 'skl-test-sisa',
          nominal: 200000,
          tanggalBayar: '2026-07-20',
          metode: 'Transfer',
        },
      ]

      const currentInvoice = {
        id: 'inv-curr-001',
        nomor: 'AFS-202608-0001',
        nomorInvoice: 'AFS-202608-0001',
        sekolahId: 'skl-test-sisa',
        periode: '2026-08',
        tanggalTerbit: '2026-08-01',
        grandTotal: 0,
        status: 'Terbit',
        items: [
          { deskripsi: 'Sesi Agustus (Libur / Penyesuaian)', jumlahSiswa: 0, hargaSatuan: 0, total: 0 }
        ],
        carryOverLines: [
          {
            type: 'carry-over',
            kind: 'outstanding',
            invoiceId: 'inv-prev-001',
            description: 'Sisa tagihan invoice AFS-202607-0001',
            amount: 350000,
            activeAmount: 150000,
            isSettled: false,
          }
        ],
      }

      const html = renderToStaticMarkup(
        React.createElement(InvoiceTemplate, {
          invoice: currentInvoice,
          sekolah: mockSekolah,
          invoices: [prevInvoice, currentInvoice],
          sppPayments,
        })
      )

      // Verifies the audit trail slots
      expect(html).toContain('Total tagihan awal')
      expect(html).toContain(formatRupiah(600000))

      expect(html).toContain('Sudah dibayar sebelumnya')
      expect(html).toContain(formatRupiah(250000))

      // Pembayaran saat ini (or Pembayaran terakhir)
      expect(html).toMatch(/Pembayaran saat ini|Pembayaran terakhir/)
      expect(html).toContain(formatRupiah(200000))

      expect(html).toContain('Sisa tagihan')
      expect(html).toContain(formatRupiah(150000))

      // Explanatory note referencing previous invoice number and cumulative paid amount
      expect(html).toContain('Keterangan')
      expect(html).toContain('AFS-202607-0001')
      expect(html).toContain(formatRupiah(450000))
    })

    it('renders audit trail when carry-over line has attached pre-computed breakdown properties', () => {
      const currentInvoice = {
        id: 'inv-curr-props',
        nomor: 'AFS-202608-0099',
        sekolahId: 'skl-test-sisa',
        periode: '2026-08',
        tanggalTerbit: '2026-08-01',
        grandTotal: 0,
        status: 'Terbit',
        items: [],
        carryOverLines: [
          {
            type: 'carry-over',
            kind: 'outstanding',
            invoiceId: 'inv-prev-standalone',
            description: 'Sisa tagihan invoice AFS-202607-0001',
            amount: 350000,
            activeAmount: 150000,
            isSettled: false,
            prevNomor: 'AFS-202607-0001',
            prevTotal: 600000,
            prevPaidPrev: 250000,
            prevPaidCurrent: 200000,
            prevPaid: 450000,
            prevSisa: 150000,
          }
        ],
      }

      const html = renderToStaticMarkup(
        React.createElement(InvoiceTemplate, {
          invoice: currentInvoice,
          sekolah: mockSekolah,
          invoices: [currentInvoice],
          sppPayments: [],
        })
      )

      expect(html).toContain('Total tagihan awal')
      expect(html).toContain(formatRupiah(600000))
      expect(html).toContain('Sudah dibayar sebelumnya')
      expect(html).toContain(formatRupiah(250000))
      expect(html).toMatch(/Pembayaran saat ini|Pembayaran terakhir/)
      expect(html).toContain(formatRupiah(200000))
      expect(html).toContain('Sisa tagihan')
      expect(html).toContain(formatRupiah(150000))
      expect(html).toContain('AFS-202607-0001')
      expect(html).toContain(formatRupiah(450000))
    })
  })

  describe('Case B: Invoice with multiple installment payments directly on it', () => {
    it('renders audit trail for multi-stage installment payments on the current invoice', () => {
      const invoice = {
        id: 'inv-direct-installments',
        nomor: 'AFS-202608-0002',
        nomorInvoice: 'AFS-202608-0002',
        sekolahId: 'skl-test-sisa',
        periode: '2026-08',
        tanggalTerbit: '2026-08-01',
        grandTotal: 600000,
        status: 'Terbit',
        items: [
          { deskripsi: 'SPP Coding Agustus 2026', jumlahSiswa: 1, hargaSatuan: 600000, total: 600000 }
        ],
      }

      const sppPayments = [
        {
          id: 'pay-d1',
          invoiceId: 'inv-direct-installments',
          sekolahId: 'skl-test-sisa',
          nominal: 250000,
          tanggalBayar: '2026-08-05',
          metode: 'Transfer',
        },
        {
          id: 'pay-d2',
          invoiceId: 'inv-direct-installments',
          sekolahId: 'skl-test-sisa',
          nominal: 200000,
          tanggalBayar: '2026-08-15',
          metode: 'Transfer',
        },
      ]

      const html = renderToStaticMarkup(
        React.createElement(InvoiceTemplate, {
          invoice,
          sekolah: mockSekolah,
          invoices: [invoice],
          sppPayments,
        })
      )

      expect(html).toContain('Total tagihan awal')
      expect(html).toContain(formatRupiah(600000))
      expect(html).toContain('Sudah dibayar sebelumnya')
      expect(html).toContain(formatRupiah(250000))
      expect(html).toMatch(/Pembayaran saat ini|Pembayaran terakhir/)
      expect(html).toContain(formatRupiah(200000))
      expect(html).toContain('Sisa tagihan')
      expect(html).toContain(formatRupiah(150000))
    })
  })
})
