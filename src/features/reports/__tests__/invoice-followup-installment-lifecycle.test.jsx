import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import InvoiceModal, {
  appendInvoiceFollowUp,
  InvoiceFollowUpSection,
} from '../InvoiceModal.jsx'
import InvoiceTemplate from '../InvoiceTemplate.jsx'
import { invoiceSettlement, invoicePaymentBreakdown } from '../../../lib/invoices.js'
import { newSppPayment } from '../../../lib/sppPayments.js'
import { formatRupiah } from '../../../lib/format.js'
import * as store from '../../../lib/store.js'

vi.mock('../../../components/Modal.jsx', () => ({
  default: ({ open, children }) => (open ? <div data-testid="modal">{children}</div> : null),
}))

vi.mock('../../../components/ConfirmDialog.jsx', () => ({
  default: () => null,
}))

vi.mock('../../../lib/store.js', () => ({
  readCached: vi.fn(),
  usePeriod: vi.fn(() => ({ selectedYear: 2026 })),
  read: vi.fn().mockResolvedValue([]),
  getRoleContext: vi.fn(() => ({ role: 'superadmin' })),
  writeRemote: vi.fn().mockResolvedValue({ status: 'ok' }),
  getSettings: vi.fn(() => ({
    alamatUsaha: 'Bandung',
    rekeningBank: 'BCA',
    rekeningNomor: '1234567890',
    rekeningAtasNama: 'PT AfterSchola Edukasi',
    penandatangan: 'Direktur Utama',
  })),
}))

describe('Invoice Follow-Up Multi-Stage Installment Lifecycle (PDF Page 3 & 4)', () => {
  const mockSekolah = {
    id: 'skl-lifecycle-1',
    nama: 'SD Bintang Terang',
    cabangId: 'cbg-bdg',
    spp: 500000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(store.getRoleContext).mockReturnValue({ role: 'superadmin' })
  })

  it('executes full 6-step lifecycle: 500k -> 200k paid -> 100k paid -> 200k paid -> Lunas & Kasus Selesai with print copy clarification', () => {
    // -------------------------------------------------------------------------
    // Step 1: Invoice Rp 500.000 terbit -> status Belum Lunas, sisa Rp 500.000
    // -------------------------------------------------------------------------
    let currentInvoice = {
      id: 'inv-lc-100',
      nomor: 'BDG-202611-0010',
      nomorInvoice: 'BDG-202611-0010',
      sekolahId: 'skl-lifecycle-1',
      cabangId: 'cbg-bdg',
      periode: '2026-11',
      tanggal: '2026-11-01',
      tanggalTerbit: '2026-11-01',
      status: 'Terbit',
      grandTotal: 500000,
      items: [
        { deskripsi: 'Ekskul Robotik November 2026', jumlahSiswa: 1, hargaSatuan: 500000, total: 500000 },
      ],
      followUps: [],
    }
    let sppPayments = []

    let settlement = invoiceSettlement(currentInvoice, { sppPayments, siswa: [] })
    expect(settlement.total).toBe(500000)
    expect(settlement.dibayar).toBe(0)
    expect(settlement.sisa).toBe(500000)
    expect(settlement.status).toBe('Belum Lunas')

    // Mock store readCached for initial state
    vi.mocked(store.readCached).mockImplementation((key) => {
      if (key === 'invoices') return [currentInvoice]
      if (key === 'sppPayments') return sppPayments
      if (key === 'sekolah') return [mockSekolah]
      return []
    })

    let modalHtml = renderToStaticMarkup(
      <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
    )
    expect(modalHtml).toContain('Belum Lunas')
    expect(modalHtml).toContain('>Follow-up<')
    expect(modalHtml).not.toContain('Kasus Selesai')
    expect(modalHtml).not.toContain('Follow-up: Cicilan')
    expect(modalHtml).not.toContain('Follow-up: Lunas')

    // Print template at Step 1 (unpaid) does NOT contain remaining balance clarification
    let printHtml = renderToStaticMarkup(
      <InvoiceTemplate
        invoice={currentInvoice}
        sekolah={mockSekolah}
        settings={store.getSettings()}
        onBack={() => {}}
      />
    )
    expect(printHtml).not.toContain('Lembar Sisa Tagihan (Bukan Faktur Baru)')
    expect(printHtml).not.toContain('Lembar Sisa Tagihan (Bukan Tagihan Baru)')

    // -------------------------------------------------------------------------
    // Step 2: Follow-up with payment Rp 200.000 -> sisa Rp 300.000, Belum Lunas,
    // badge Cicilan, Follow-up button remains open
    // -------------------------------------------------------------------------
    const fu1 = {
      penerima: 'Ibu Ratna (Bendahara)',
      wa: '6281234567890',
      tanggalKirim: '2026-11-03',
      tanggalFollowUp: '2026-11-05',
      nominal: 200000,
      catatan: 'Cicilan termin 1 via transfer',
    }
    const updatedFuStep2 = appendInvoiceFollowUp(currentInvoice, fu1)
    currentInvoice = {
      ...currentInvoice,
      followUp: updatedFuStep2[updatedFuStep2.length - 1],
      followUps: updatedFuStep2,
    }
    const pay1 = newSppPayment({
      id: 'pay-lc-1',
      siswaId: null,
      sekolahId: 'skl-lifecycle-1',
      cabangId: 'cbg-bdg',
      invoiceId: 'inv-lc-100',
      nominal: 200000,
      periode: '2026-11',
      tanggalBayar: '2026-11-05',
      metode: 'Transfer',
      diterimaOleh: 'Ibu Ratna',
      sumberDana: 'sekolah',
      catatan: 'Cicilan termin 1',
    })
    sppPayments = [pay1]

    settlement = invoiceSettlement(currentInvoice, { sppPayments, siswa: [] })
    expect(settlement.total).toBe(500000)
    expect(settlement.dibayar).toBe(200000)
    expect(settlement.sisa).toBe(300000)
    expect(settlement.status).toBe('Belum Lunas')

    vi.mocked(store.readCached).mockImplementation((key) => {
      if (key === 'invoices') return [currentInvoice]
      if (key === 'sppPayments') return sppPayments
      if (key === 'sekolah') return [mockSekolah]
      return []
    })

    modalHtml = renderToStaticMarkup(
      <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
    )
    expect(modalHtml).toContain(`Follow-up: Cicilan (Sisa ${formatRupiah(300000)})`)
    expect(modalHtml).toContain('bg-sky-100 text-sky-700')
    expect(modalHtml).toContain('>Follow-up<')
    expect(modalHtml).not.toContain('Kasus Selesai')

    // Print template at Step 2 MUST render the clarification copy
    printHtml = renderToStaticMarkup(
      <InvoiceTemplate
        invoice={currentInvoice}
        sekolah={mockSekolah}
        settings={store.getSettings()}
        onBack={() => {}}
      />
    )
    expect(printHtml).toContain('Lembar Sisa Tagihan (Bukan Faktur Baru) — Mengacu pada Invoice #BDG-202611-0010')
    expect(printHtml).toContain('Lembar Sisa Tagihan (Bukan Tagihan Baru) — Mengacu pada Nomor Faktur: #BDG-202611-0010')
    expect(printHtml).toContain(formatRupiah(200000))
    expect(printHtml).toContain(formatRupiah(300000))

    // -------------------------------------------------------------------------
    // Step 3: Follow-up with payment Rp 100.000 -> sisa Rp 200.000, Belum Lunas
    // -------------------------------------------------------------------------
    const fu2 = {
      penerima: 'Pak Ahmad (Kepsek)',
      wa: '6289876543210',
      tanggalKirim: '2026-11-10',
      tanggalFollowUp: '2026-11-12',
      nominal: 100000,
      catatan: 'Cicilan termin 2',
    }
    const updatedFuStep3 = appendInvoiceFollowUp(currentInvoice, fu2)
    currentInvoice = {
      ...currentInvoice,
      followUp: updatedFuStep3[updatedFuStep3.length - 1],
      followUps: updatedFuStep3,
    }
    const pay2 = newSppPayment({
      id: 'pay-lc-2',
      siswaId: null,
      sekolahId: 'skl-lifecycle-1',
      cabangId: 'cbg-bdg',
      invoiceId: 'inv-lc-100',
      nominal: 100000,
      periode: '2026-11',
      tanggalBayar: '2026-11-12',
      metode: 'Transfer',
      diterimaOleh: 'Pak Ahmad',
      sumberDana: 'sekolah',
      catatan: 'Cicilan termin 2',
    })
    sppPayments = [pay1, pay2]

    settlement = invoiceSettlement(currentInvoice, { sppPayments, siswa: [] })
    expect(settlement.total).toBe(500000)
    expect(settlement.dibayar).toBe(300000)
    expect(settlement.sisa).toBe(200000)
    expect(settlement.status).toBe('Belum Lunas')

    vi.mocked(store.readCached).mockImplementation((key) => {
      if (key === 'invoices') return [currentInvoice]
      if (key === 'sppPayments') return sppPayments
      if (key === 'sekolah') return [mockSekolah]
      return []
    })

    modalHtml = renderToStaticMarkup(
      <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
    )
    expect(modalHtml).toContain(`Follow-up: Cicilan (Sisa ${formatRupiah(200000)})`)
    expect(modalHtml).toContain('>Follow-up<')
    expect(modalHtml).not.toContain('Kasus Selesai')

    // -------------------------------------------------------------------------
    // Step 4: Follow-up with payment Rp 200.000 -> sisa Rp 0, status transitions to Lunas
    // -------------------------------------------------------------------------
    const fu3 = {
      penerima: 'Ibu Ratna (Bendahara)',
      wa: '6281234567890',
      tanggalKirim: '2026-11-20',
      tanggalFollowUp: '2026-11-22',
      nominal: 200000,
      catatan: 'Pelunasan sisa termin',
    }
    const updatedFuStep4 = appendInvoiceFollowUp(currentInvoice, fu3)
    currentInvoice = {
      ...currentInvoice,
      followUp: updatedFuStep4[updatedFuStep4.length - 1],
      followUps: updatedFuStep4,
    }
    const pay3 = newSppPayment({
      id: 'pay-lc-3',
      siswaId: null,
      sekolahId: 'skl-lifecycle-1',
      cabangId: 'cbg-bdg',
      invoiceId: 'inv-lc-100',
      nominal: 200000,
      periode: '2026-11',
      tanggalBayar: '2026-11-22',
      metode: 'Transfer',
      diterimaOleh: 'Ibu Ratna',
      sumberDana: 'sekolah',
      catatan: 'Pelunasan sisa termin',
    })
    sppPayments = [pay1, pay2, pay3]

    settlement = invoiceSettlement(currentInvoice, { sppPayments, siswa: [] })
    expect(settlement.total).toBe(500000)
    expect(settlement.dibayar).toBe(500000)
    expect(settlement.sisa).toBe(0)
    expect(settlement.status).toBe('Lunas')

    // -------------------------------------------------------------------------
    // Step 5: Case Closed: Follow-up action closed, badge is Follow-up: Lunas
    // -------------------------------------------------------------------------
    vi.mocked(store.readCached).mockImplementation((key) => {
      if (key === 'invoices') return [currentInvoice]
      if (key === 'sppPayments') return sppPayments
      if (key === 'sekolah') return [mockSekolah]
      return []
    })

    modalHtml = renderToStaticMarkup(
      <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
    )
    expect(modalHtml).toContain('Follow-up: Lunas')
    expect(modalHtml).toContain('bg-emerald-100 text-emerald-700')
    expect(modalHtml).toContain('Kasus Selesai')
    expect(modalHtml).not.toContain('>Follow-up<')

    // Print template at Step 5 (Lunas) does NOT contain remaining balance notices
    printHtml = renderToStaticMarkup(
      <InvoiceTemplate
        invoice={currentInvoice}
        sekolah={mockSekolah}
        settings={store.getSettings()}
        onBack={() => {}}
      />
    )
    expect(printHtml).not.toContain('Lembar Sisa Tagihan (Bukan Faktur Baru)')
    expect(printHtml).not.toContain('Lembar Sisa Tagihan (Bukan Tagihan Baru)')
    expect(printHtml).toContain('Lunas')

    // -------------------------------------------------------------------------
    // Step 6: Verify payment history lists all 3 payments, and follow-up
    // accordion lists all 3 follow-ups without loss
    // -------------------------------------------------------------------------
    expect(currentInvoice.followUps).toHaveLength(3)
    expect(currentInvoice.followUps[0].nominal).toBe(200000)
    expect(currentInvoice.followUps[1].nominal).toBe(100000)
    expect(currentInvoice.followUps[2].nominal).toBe(200000)

    // Verify accordion rendering of all 3 follow-ups
    const breakdown = invoicePaymentBreakdown(currentInvoice, { sppPayments, siswa: [] })
    const accordionHtml = renderToStaticMarkup(
      <InvoiceFollowUpSection
        inv={currentInvoice}
        breakdown={breakdown}
        expandedCards={{}}
        onToggleCard={() => {}}
        fuForm={{}}
        onFormChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />
    )
    expect(accordionHtml).toContain('Riwayat Follow-up (3)')
    expect(accordionHtml).toContain('Ibu Ratna (Bendahara)')
    expect(accordionHtml).toContain('Pak Ahmad (Kepsek)')
    expect(accordionHtml).toContain(formatRupiah(200000))
    expect(accordionHtml).toContain(formatRupiah(100000))

    // Verify modal includes payment history summary
    expect(modalHtml).toContain('Riwayat pembayaran (3)')
  })
})
