import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import InvoiceModal, {
  InvoiceInstallmentForm,
  validateInstallmentPayment,
  saveInstallmentPayment,
} from '../InvoiceModal.jsx'
import * as store from '../../../lib/store.js'
import * as sppPaymentsModule from '../../../lib/sppPayments.js'
import { formatRupiah } from '../../../lib/format.js'

// Mock Modal to render children directly for unit tests
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
}))

vi.mock('../../../lib/sppPayments.js', async () => {
  const actual = await vi.importActual('../../../lib/sppPayments.js')
  return {
    ...actual,
    addSppPayment: vi.fn().mockResolvedValue({ status: 'ok', payment: { id: 'spp-test-1' } }),
    recomputeAllSppLunas: vi.fn(),
  }
})

describe('Invoice Installment Payment UI & Handler', () => {
  const mockSekolah = {
    id: 'skl-test-1',
    nama: 'SD Bintang Kejora',
    cabangId: 'cbg-bandung',
    spp: 500000,
  }

  const baseUnpaidInvoice = {
    id: 'inv-unpaid-1',
    nomor: 'BDG-202611-0001',
    sekolahId: 'skl-test-1',
    cabangId: 'cbg-bandung',
    periode: '2026-11',
    grandTotal: 600000,
    status: 'Terbit',
  }

  const baseLunasInvoice = {
    id: 'inv-lunas-1',
    nomor: 'BDG-202611-0002',
    sekolahId: 'skl-test-1',
    cabangId: 'cbg-bandung',
    periode: '2026-11',
    grandTotal: 600000,
    status: 'Terbit',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(store.getRoleContext).mockReturnValue({ role: 'superadmin' })
  })

  describe('Invoice list "Catat Pembayaran" button visibility', () => {
    it('renders the "Catat Pembayaran" button for an unpaid invoice', () => {
      vi.mocked(store.readCached).mockImplementation((key) => {
        if (key === 'invoices') return [baseUnpaidInvoice]
        if (key === 'sppPayments') return []
        if (key === 'sekolah') return [mockSekolah]
        return []
      })

      const html = renderToStaticMarkup(
        <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
      )

      expect(html).toContain('Catat Pembayaran')
      expect(html).not.toContain('Invoice ini sudah lunas')
    })

    it('does NOT show "Catat Pembayaran" (or disables it) when invoice is Lunas ("Invoice ini sudah lunas")', () => {
      const fullPayment = {
        id: 'pay-full',
        invoiceId: 'inv-lunas-1',
        nominal: 600000,
        tanggalBayar: '2026-11-05',
        sumberDana: 'sekolah',
      }

      vi.mocked(store.readCached).mockImplementation((key) => {
        if (key === 'invoices') return [baseLunasInvoice]
        if (key === 'sppPayments') return [fullPayment]
        if (key === 'sekolah') return [mockSekolah]
        return []
      })

      const html = renderToStaticMarkup(
        <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
      )

      expect(html).not.toContain('>Catat Pembayaran</button>')
      expect(html).toContain('Invoice ini sudah lunas')
    })
  })

  describe('InvoiceInstallmentForm component rendering & breakdown', () => {
    const mockBreakdown = {
      totalAwal: 600000,
      sudahDibayar: 250000,
      sisaSaatIni: 350000,
      credit: 0,
      status: 'Belum Lunas',
      payments: [
        { id: 'p-1', nominal: 250000, tanggalBayar: '2026-11-02', metode: 'Transfer' },
      ],
      latestPayment: { id: 'p-1', nominal: 250000, tanggalBayar: '2026-11-02' },
    }

    const defaultForm = {
      nominal: 0,
      metode: 'Transfer',
      tanggalBayar: '2026-11-08',
      diterimaOleh: 'Bendahara Sekolah',
      buktiBayar: null,
      catatan: '',
      uploadError: null,
    }

    it('renders invoice number, total tagihan awal, sudah dibayar sebelumnya, and sisa tagihan saat ini', () => {
      const html = renderToStaticMarkup(
        <InvoiceInstallmentForm
          inv={baseUnpaidInvoice}
          breakdown={mockBreakdown}
          form={defaultForm}
          onChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      )

      expect(html).toContain('BDG-202611-0001')
      expect(html).toContain('Total tagihan awal')
      expect(html.replace(/\s/g, ' ')).toContain(formatRupiah(600000).replace(/\s/g, ' '))
      expect(html).toContain('Sudah dibayar sebelumnya')
      expect(html.replace(/\s/g, ' ')).toContain(formatRupiah(250000).replace(/\s/g, ' '))
      expect(html).toContain('Sisa tagihan saat ini')
      expect(html.replace(/\s/g, ' ')).toContain(formatRupiah(350000).replace(/\s/g, ' '))
    })

    it('renders input "Jumlah yang dibayarkan sekarang" and all required fields', () => {
      const html = renderToStaticMarkup(
        <InvoiceInstallmentForm
          inv={baseUnpaidInvoice}
          breakdown={mockBreakdown}
          form={defaultForm}
          onChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      )

      expect(html).toContain('Jumlah yang dibayarkan sekarang')
      expect(html).toContain('Metode pembayaran')
      expect(html).toContain('Tanggal pembayaran')
      expect(html).toContain('Diterima oleh')
      expect(html).toContain('Upload bukti bayar')
      expect(html).toContain('Catatan')
      expect(html).toContain('Simpan Pembayaran')
      expect(html).toContain('Batal')
    })

    it('updates "Sisa tagihan setelah pembayaran" dynamically based on nominal input', () => {
      // Step A: nominal = 0 -> Sisa setelah pembayaran = 350.000
      const htmlZero = renderToStaticMarkup(
        <InvoiceInstallmentForm
          inv={baseUnpaidInvoice}
          breakdown={mockBreakdown}
          form={{ ...defaultForm, nominal: 0 }}
          onChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      )
      expect(htmlZero).toContain('Sisa tagihan setelah pembayaran')
      expect(htmlZero.replace(/\s/g, ' ')).toContain(formatRupiah(350000).replace(/\s/g, ' '))

      // Step B: nominal = 200.000 -> Sisa setelah pembayaran = 150.000
      const htmlPartial = renderToStaticMarkup(
        <InvoiceInstallmentForm
          inv={baseUnpaidInvoice}
          breakdown={mockBreakdown}
          form={{ ...defaultForm, nominal: 200000 }}
          onChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      )
      expect(htmlPartial.replace(/\s/g, ' ')).toContain(formatRupiah(150000).replace(/\s/g, ' '))

      // Step C: nominal = 350.000 -> Pelunasan persis -> Sisa = Rp 0
      const htmlFull = renderToStaticMarkup(
        <InvoiceInstallmentForm
          inv={baseUnpaidInvoice}
          breakdown={mockBreakdown}
          form={{ ...defaultForm, nominal: 350000 }}
          onChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      )
      expect(htmlFull.replace(/\s/g, ' ')).toContain(formatRupiah(0).replace(/\s/g, ' '))
      expect(htmlFull).toContain('Pembayaran ini akan melunasi invoice')

      // Step D: nominal = 400.000 -> Overpayment -> Sisa = Rp 0, Lebih bayar: Rp 50.000
      const htmlOver = renderToStaticMarkup(
        <InvoiceInstallmentForm
          inv={baseUnpaidInvoice}
          breakdown={mockBreakdown}
          form={{ ...defaultForm, nominal: 400000 }}
          onChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      )
      expect(htmlOver.replace(/\s/g, ' ')).toContain(formatRupiah(0).replace(/\s/g, ' '))
      expect(htmlOver).toContain('Lebih bayar')
      expect(htmlOver.replace(/\s/g, ' ')).toContain(formatRupiah(50000).replace(/\s/g, ' '))
    })

    it('renders receipt preview and handles upload error display', () => {
      const htmlWithReceipt = renderToStaticMarkup(
        <InvoiceInstallmentForm
          inv={baseUnpaidInvoice}
          breakdown={mockBreakdown}
          form={{
            ...defaultForm,
            buktiBayar: 'data:image/png;base64,mockreceiptimg',
            uploadError: 'File terlalu besar',
          }}
          onChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
        />
      )

      expect(htmlWithReceipt).toContain('data:image/png;base64,mockreceiptimg')
      expect(htmlWithReceipt).toContain('Hapus Bukti')
      expect(htmlWithReceipt).toContain('File terlalu besar')
    })
  })

  describe('Validation: validateInstallmentPayment', () => {
    it('validates nominal > 0', () => {
      expect(validateInstallmentPayment({ nominal: 0, metode: 'Transfer', tanggalBayar: '2026-11-08', diterimaOleh: 'Kasir' })).toMatch(/lebih dari 0/i)
      expect(validateInstallmentPayment({ nominal: -50000, metode: 'Transfer', tanggalBayar: '2026-11-08', diterimaOleh: 'Kasir' })).toMatch(/lebih dari 0/i)
      expect(validateInstallmentPayment({ nominal: '', metode: 'Transfer', tanggalBayar: '2026-11-08', diterimaOleh: 'Kasir' })).toMatch(/lebih dari 0/i)
    })

    it('validates required fields: metode, tanggalBayar, diterimaOleh', () => {
      expect(validateInstallmentPayment({ nominal: 100000, metode: '', tanggalBayar: '2026-11-08', diterimaOleh: 'Kasir' })).toMatch(/metode/i)
      expect(validateInstallmentPayment({ nominal: 100000, metode: 'Transfer', tanggalBayar: '', diterimaOleh: 'Kasir' })).toMatch(/tanggal/i)
      expect(validateInstallmentPayment({ nominal: 100000, metode: 'Transfer', tanggalBayar: '2026-11-08', diterimaOleh: '   ' })).toMatch(/diterima oleh/i)
    })

    it('returns null when all inputs are valid', () => {
      expect(validateInstallmentPayment({
        nominal: 250000,
        metode: 'Tunai',
        tanggalBayar: '2026-11-08',
        diterimaOleh: 'Pak Budi',
      })).toBeNull()
    })
  })

  describe('Submission handler: saveInstallmentPayment', () => {
    it('calls addSppPayment() with correct invoiceId, nominal, sekolahId, sumberDana: "sekolah", metode, tanggalBayar', async () => {
      const form = {
        nominal: 200000,
        metode: 'Transfer',
        tanggalBayar: '2026-11-08',
        diterimaOleh: 'Ibu Ratna (Bendahara)',
        buktiBayar: 'data:image/png;base64,sampleproof',
        catatan: 'Cicilan termin 2',
      }

      const result = await saveInstallmentPayment(baseUnpaidInvoice, form, {
        sekolahAll: [mockSekolah],
        cabangAll: [{ id: 'cbg-bandung', kode: 'BDG' }],
      })

      expect(result.ok).toBe(true)
      expect(sppPaymentsModule.addSppPayment).toHaveBeenCalledTimes(1)
      const callArg = vi.mocked(sppPaymentsModule.addSppPayment).mock.calls[0][0]

      expect(callArg).toMatchObject({
        siswaId: null,
        sekolahId: 'skl-test-1',
        invoiceId: 'inv-unpaid-1',
        nominal: 200000,
        metode: 'Transfer',
        tanggalBayar: '2026-11-08',
        diterimaOleh: 'Ibu Ratna (Bendahara)',
        sumberDana: 'sekolah',
        buktiBayar: 'data:image/png;base64,sampleproof',
        catatan: 'Cicilan termin 2',
      })

      expect(store.read).toHaveBeenCalledWith('sppPayments')
      expect(sppPaymentsModule.recomputeAllSppLunas).toHaveBeenCalled()
      expect(store.read).toHaveBeenCalledWith('invoices')
    })

    it('returns validation error without calling addSppPayment when nominal is 0', async () => {
      const form = {
        nominal: 0,
        metode: 'Transfer',
        tanggalBayar: '2026-11-08',
        diterimaOleh: 'Kasir',
      }

      const result = await saveInstallmentPayment(baseUnpaidInvoice, form, {
        sekolahAll: [mockSekolah],
        cabangAll: [],
      })

      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/lebih dari 0/i)
      expect(sppPaymentsModule.addSppPayment).not.toHaveBeenCalled()
    })
  })
})
