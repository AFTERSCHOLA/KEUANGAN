import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import InvoiceModal, {
  InvoiceFollowUpSection,
} from '../InvoiceModal.jsx'
import InvoiceTemplate from '../InvoiceTemplate.jsx'
import * as store from '../../../lib/store.js'

vi.mock('../../../components/Modal.jsx', () => ({
  default: ({ open, children }) => (open ? <div data-testid="modal">{children}</div> : null),
}))

vi.mock('../../../components/ConfirmDialog.jsx', () => ({
  default: () => null,
}))

vi.mock('../../../lib/store.js', () => ({
  readCached: vi.fn((key) => {
    if (key === 'siswa') return []
    if (key === 'sppPayments') return []
    if (key === 'sekolah') return []
    if (key === 'cabang') return []
    if (key === 'invoices') return []
    return []
  }),
  usePeriod: vi.fn(() => ({ selectedYear: 2026 })),
  read: vi.fn().mockResolvedValue([]),
  getRoleContext: vi.fn(() => ({ role: 'superadmin' })),
  writeRemote: vi.fn().mockResolvedValue({ status: 'ok' }),
  getSettings: vi.fn(() => ({
    alamatUsaha: 'Bandung',
    rekeningBank: 'BCA',
    rekeningNomor: '1234567890',
    rekeningAtasNama: 'PT Edukasi',
    penandatangan: 'Direktur',
  })),
}))

describe('Invoice Follow-Up Multi-Level Output', () => {
  const mockSekolah = {
    id: 'skl-test-1',
    nama: 'SD Bintang Kejora',
    cabangId: 'cbg-bandung',
    spp: 500000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(store.getRoleContext).mockReturnValue({ role: 'superadmin' })
  })

  describe('InvoiceModal - Invoice Card Follow-up Badges', () => {
    it('renders "Follow-up: Menunggu Pembayaran" badge when latestFu.nominal is 0', () => {
      const unpaidFuInvoice = {
        id: 'inv-fu-1',
        nomor: 'BDG-202611-0001',
        sekolahId: 'skl-test-1',
        cabangId: 'cbg-bandung',
        grandTotal: 1000000,
        status: 'Terbit',
        followUps: [
          {
            id: 'fu-1',
            penerima: 'Ibu Guru',
            tanggalFollowUp: '2026-11-10',
            nominal: 0,
            catatan: 'Menunggu rapat komite',
          },
        ],
      }

      vi.mocked(store.readCached).mockImplementation((key) => {
        if (key === 'invoices') return [unpaidFuInvoice]
        return []
      })

      const html = renderToStaticMarkup(
        <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
      )

      expect(html).toContain('Follow-up: Menunggu Pembayaran')
      expect(html).toContain('bg-amber-100 text-amber-700')
    })

    it('renders "Follow-up: Terbayar" badge when latestFu.nominal > 0', () => {
      const paidFuInvoice = {
        id: 'inv-fu-2',
        nomor: 'BDG-202611-0002',
        sekolahId: 'skl-test-1',
        cabangId: 'cbg-bandung',
        grandTotal: 1000000,
        status: 'Terbit',
        followUps: [
          {
            id: 'fu-1',
            penerima: 'Ibu Guru',
            tanggalFollowUp: '2026-11-05',
            nominal: 0,
          },
          {
            id: 'fu-2',
            penerima: 'Pak Bendahara',
            tanggalFollowUp: '2026-11-12',
            nominal: 1000000,
            catatan: 'Sudah ditransfer lunas',
          },
        ],
      }

      vi.mocked(store.readCached).mockImplementation((key) => {
        if (key === 'invoices') return [paidFuInvoice]
        return []
      })

      const html = renderToStaticMarkup(
        <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
      )

      expect(html).toContain('Follow-up: Terbayar')
      expect(html).toContain('bg-emerald-100 text-emerald-700')
    })
  })

  describe('InvoiceFollowUpSection - Accordion Items Status Chips', () => {
    it('renders "Menunggu Pembayaran" chip for nominal 0 and "Terbayar" chip for nominal > 0', () => {
      const invoice = {
        id: 'inv-fu-accordion',
        nomor: 'BDG-202611-0003',
        grandTotal: 1500000,
        followUps: [
          {
            id: 'fu-a',
            penerima: 'Ibu Ratna',
            tanggalKirim: '2026-11-01',
            tanggalFollowUp: '2026-11-05',
            nominal: 0,
          },
          {
            id: 'fu-b',
            penerima: 'Pak Joko',
            tanggalKirim: '2026-11-06',
            tanggalFollowUp: '2026-11-08',
            nominal: 500000,
          },
        ],
      }

      const html = renderToStaticMarkup(
        <InvoiceFollowUpSection
          inv={invoice}
          expandedCards={{}}
          onToggleCard={() => {}}
          fuForm={{
            penerima: '',
            wa: '',
            tanggalKirim: '',
            tanggalFollowUp: '',
            nominal: 0,
            buktiBayar: null,
            catatan: '',
          }}
          onFormChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
          saving={false}
        />
      )

      expect(html).toContain('Menunggu Pembayaran')
      expect(html).toContain('bg-amber-100 text-amber-700')
      expect(html).toContain('Terbayar')
      expect(html).toContain('bg-emerald-100 text-emerald-700')
    })
  })

  describe('InvoiceTemplate - Catatan Pembayaran Follow-Up Note', () => {
    it('renders follow-up note in Catatan Pembayaran when unpaid invoice has follow-up with note', () => {
      const unpaidInvoice = {
        id: 'inv-tpl-1',
        nomor: 'BDG-202611-0010',
        sekolahId: 'skl-test-1',
        status: 'Terbit',
        grandTotal: 1000000,
        items: [{ deskripsi: 'SPP', jumlahSiswa: 2, hargaSatuan: 500000, total: 1000000 }],
        followUps: [
          {
            id: 'fu-tpl-1',
            tanggalFollowUp: '2026-11-15',
            catatan: 'Janji bayar pertengahan bulan',
            nominal: 0,
          },
        ],
      }

      const html = renderToStaticMarkup(
        <InvoiceTemplate
          invoice={unpaidInvoice}
          sekolah={mockSekolah}
          onBack={() => {}}
          invoices={[unpaidInvoice]}
          sppPayments={[]}
          siswa={[]}
        />
      )

      expect(html).toContain('Catatan Pembayaran:')
      expect(html).toContain('Follow-up [2026-11-15]: Janji bayar pertengahan bulan')
    })

    it('renders fallback text "Menunggu konfirmasi pembayaran" when unpaid invoice has commitment date but empty note', () => {
      const unpaidInvoice = {
        id: 'inv-tpl-2',
        nomor: 'BDG-202611-0011',
        sekolahId: 'skl-test-1',
        status: 'Terbit',
        grandTotal: 1000000,
        items: [{ deskripsi: 'SPP', jumlahSiswa: 2, hargaSatuan: 500000, total: 1000000 }],
        followUps: [
          {
            id: 'fu-tpl-2',
            tanggalFollowUp: '2026-11-20',
            catatan: '',
            nominal: 0,
          },
        ],
      }

      const html = renderToStaticMarkup(
        <InvoiceTemplate
          invoice={unpaidInvoice}
          sekolah={mockSekolah}
          onBack={() => {}}
          invoices={[unpaidInvoice]}
          sppPayments={[]}
          siswa={[]}
        />
      )

      expect(html).toContain('Follow-up [2026-11-20]: Menunggu konfirmasi pembayaran')
    })

    it('does not render follow-up note in Catatan Pembayaran when invoice is already Lunas', () => {
      const lunasInvoice = {
        id: 'inv-tpl-3',
        nomor: 'BDG-202611-0012',
        sekolahId: 'skl-test-1',
        status: 'Terbit',
        grandTotal: 500000,
        items: [{ deskripsi: 'SPP', jumlahSiswa: 1, hargaSatuan: 500000, total: 500000 }],
        followUps: [
          {
            id: 'fu-tpl-3',
            tanggalFollowUp: '2026-11-05',
            catatan: 'Janji bayar',
            nominal: 500000,
          },
        ],
      }

      const payment = {
        id: 'pay-1',
        invoiceId: 'inv-tpl-3',
        nominal: 500000,
      }

      const html = renderToStaticMarkup(
        <InvoiceTemplate
          invoice={lunasInvoice}
          sekolah={mockSekolah}
          onBack={() => {}}
          invoices={[lunasInvoice]}
          sppPayments={[payment]}
          siswa={[]}
        />
      )

      expect(html).not.toContain('Follow-up [2026-11-05]')
    })
  })
})
