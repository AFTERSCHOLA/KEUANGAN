import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import InvoiceModal, {
  normalizeInvoiceFollowUps,
  InvoiceFollowUpSection,
  appendInvoiceFollowUp,
} from '../InvoiceModal.jsx'
import * as store from '../../../lib/store.js'

// Mock Modal to render children directly for static testing
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

describe('Invoice Follow-Up Schema & UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('normalizeInvoiceFollowUps', () => {
    it('returns empty array when invoice has no follow-up data', () => {
      expect(normalizeInvoiceFollowUps(null)).toEqual([])
      expect(normalizeInvoiceFollowUps({})).toEqual([])
      expect(normalizeInvoiceFollowUps({ followUp: null })).toEqual([])
    })

    it('normalizes legacy single followUp object to array', () => {
      const legacyInv = {
        id: 'inv-101',
        createdAt: '2026-10-01T10:00:00Z',
        followUp: {
          penerima: 'Ibu Ratna',
          wa: '6281234567890',
          tanggalKirim: '2026-10-02',
          tanggalFollowUp: '2026-10-09',
          catatan: 'Menunggu konfirmasi kepala sekolah',
        },
      }

      const normalized = normalizeInvoiceFollowUps(legacyInv)
      expect(normalized).toHaveLength(1)
      expect(normalized[0]).toMatchObject({
        id: 'fu-legacy',
        createdAt: '2026-10-02',
        penerima: 'Ibu Ratna',
        wa: '6281234567890',
        tanggalKirim: '2026-10-02',
        tanggalFollowUp: '2026-10-09',
        catatan: 'Menunggu konfirmasi kepala sekolah',
      })
    })

    it('returns followUps array unchanged when already present', () => {
      const modernInv = {
        id: 'inv-102',
        followUps: [
          { id: 'fu-1', penerima: 'Pak Ahmad', wa: '628111', nominal: 500000 },
          { id: 'fu-2', penerima: 'Bu Dewi', wa: '628222', nominal: 300000 },
        ],
      }

      const normalized = normalizeInvoiceFollowUps(modernInv)
      expect(normalized).toHaveLength(2)
      expect(normalized[0].penerima).toBe('Pak Ahmad')
      expect(normalized[1].penerima).toBe('Bu Dewi')
    })
  })

  describe('appendInvoiceFollowUp helper', () => {
    it('appends a new follow-up without overwriting earlier entries', () => {
      const inv = {
        id: 'inv-201',
        followUps: [
          {
            id: 'fu-1',
            createdAt: '2026-10-01T08:00:00Z',
            penerima: 'Pak Ahmad',
            wa: '628111111111',
            nominal: 500000,
            catatan: 'Tahap 1 DP',
          },
        ],
      }

      const newEntry = {
        penerima: 'Bu Siti',
        wa: '628222222222',
        tanggalKirim: '2026-10-15',
        tanggalFollowUp: '2026-10-20',
        nominal: 750000,
        buktiBayar: 'data:image/png;base64,mockpngdata',
        catatan: 'Pelunasan termin 2',
      }

      const result = appendInvoiceFollowUp(inv, newEntry)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('fu-1')
      expect(result[0].penerima).toBe('Pak Ahmad')
      expect(result[1].penerima).toBe('Bu Siti')
      expect(result[1].nominal).toBe(750000)
      expect(result[1].buktiBayar).toBe('data:image/png;base64,mockpngdata')
      expect(result[1].id).toMatch(/^fu-/)
      expect(result[1].createdAt).toBeDefined()
    })

    it('migrates legacy followUp and appends new entry', () => {
      const inv = {
        id: 'inv-202',
        followUp: {
          penerima: 'Legacy Contact',
          wa: '628333333333',
          catatan: 'Old note',
        },
      }

      const newEntry = {
        penerima: 'New Contact',
        wa: '628444444444',
        nominal: 1000000,
        catatan: 'New note',
      }

      const result = appendInvoiceFollowUp(inv, newEntry)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('fu-legacy')
      expect(result[0].penerima).toBe('Legacy Contact')
      expect(result[1].penerima).toBe('New Contact')
    })
  })

  describe('Folded Accordion UI Rendering', () => {
    const mockInvoice = {
      id: 'inv-301',
      cabangId: 'cbg-bandung',
      sekolahId: 'skl-1',
      nomor: 'BDG-202610-0001',
      grandTotal: 1500000,
      status: 'Terbit',
      followUps: [
        {
          id: 'fu-card-1',
          createdAt: '2026-10-05T09:00:00Z',
          penerima: 'Ibu Dian (Bendahara)',
          wa: '6281298765432',
          tanggalKirim: '2026-10-05',
          tanggalFollowUp: '2026-10-12',
          nominal: 500000,
          buktiBayar: 'data:image/png;base64,thumb1',
          catatan: 'Transfer tahap 1 diterima',
        },
        {
          id: 'fu-card-2',
          createdAt: '2026-10-15T11:00:00Z',
          penerima: 'Pak Bambang (Kepsek)',
          wa: '6281311223344',
          tanggalKirim: '2026-10-15',
          tanggalFollowUp: '2026-10-22',
          nominal: 1000000,
          buktiBayar: null,
          catatan: 'Pelunasan sisa tagihan via tunai',
        },
      ],
    }

    it('renders accordion header with total count of follow-ups', () => {
      const html = renderToStaticMarkup(
        <InvoiceFollowUpSection
          inv={mockInvoice}
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

      expect(html).toContain('Riwayat Follow-up (2)')
      expect(html).toContain('Ibu Dian (Bendahara)')
      expect(html).toContain('Pak Bambang (Kepsek)')
      expect(html).toContain('6281298765432')
      expect(html).toContain('6281311223344')
      expect(html).toContain('500.000')
      expect(html).toContain('1.000.000')
      // Receipt badge indicator on card 1
      expect(html).toContain('Bukti')
    })

    it('expanding a card displays full notes and receipt thumbnail', () => {
      const html = renderToStaticMarkup(
        <InvoiceFollowUpSection
          inv={mockInvoice}
          expandedCards={{ 'fu-card-1': true }}
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

      // Card 1 expanded content
      expect(html).toContain('Transfer tahap 1 diterima')
      expect(html).toContain('data:image/png;base64,thumb1')
      expect(html).toContain('2026-10-05')
      expect(html).toContain('2026-10-12')
    })

    it('renders the form below accordion to log new follow-up', () => {
      const html = renderToStaticMarkup(
        <InvoiceFollowUpSection
          inv={mockInvoice}
          expandedCards={{}}
          onToggleCard={() => {}}
          fuForm={{
            penerima: 'Pak Hendra',
            wa: '0812345678',
            tanggalKirim: '2026-10-25',
            tanggalFollowUp: '2026-10-30',
            nominal: 250000,
            buktiBayar: null,
            catatan: 'Follow up ketiga',
          }}
          onFormChange={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
          saving={false}
        />
      )

      expect(html).toContain('Penerima')
      expect(html).toContain('No WA')
      expect(html).toContain('Tgl kirim')
      expect(html).toContain('Tgl follow-up')
      expect(html).toContain('Nominal Pembayaran')
      expect(html).toContain('Upload Bukti Bayar')
      expect(html).toContain('Catatan')
      expect(html).toContain('Simpan Follow-up')
      expect(html).toContain('Batal')
    })
  })

  describe('Role Authorization for Follow-Up in InvoiceModal', () => {
    const mockSekolah = { id: 'skl-bdg-1', nama: 'SD Bintang Bandung', cabangId: 'cbg-bandung' }

    it('allows superadmin to see Follow-up button', () => {
      vi.mocked(store.getRoleContext).mockReturnValue({ role: 'superadmin' })
      vi.mocked(store.readCached).mockImplementation((key) => {
        if (key === 'invoices') return [{ id: 'inv-1', sekolahId: 'skl-bdg-1', status: 'Terbit', grandTotal: 500000 }]
        return []
      })

      const html = renderToStaticMarkup(
        <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
      )

      expect(html).toContain('Follow-up')
    })

    it('allows admin_cabang to see Follow-up button for own branch school', () => {
      vi.mocked(store.getRoleContext).mockReturnValue({ role: 'admin_cabang', cabangId: 'cbg-bandung' })
      vi.mocked(store.readCached).mockImplementation((key) => {
        if (key === 'invoices') return [{ id: 'inv-1', sekolahId: 'skl-bdg-1', status: 'Terbit', grandTotal: 500000 }]
        return []
      })

      const html = renderToStaticMarkup(
        <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
      )

      expect(html).toContain('Follow-up')
    })

    it('hides Follow-up button for admin_cabang of different branch', () => {
      vi.mocked(store.getRoleContext).mockReturnValue({ role: 'admin_cabang', cabangId: 'cbg-jakarta' })
      vi.mocked(store.readCached).mockImplementation((key) => {
        if (key === 'invoices') return [{ id: 'inv-1', sekolahId: 'skl-bdg-1', status: 'Terbit', grandTotal: 500000 }]
        return []
      })

      const html = renderToStaticMarkup(
        <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
      )

      expect(html).not.toContain('Follow-up')
    })

    it('hides Follow-up button for trainer', () => {
      vi.mocked(store.getRoleContext).mockReturnValue({ role: 'trainer', trainerId: 'trn-1' })
      vi.mocked(store.readCached).mockImplementation((key) => {
        if (key === 'invoices') return [{ id: 'inv-1', sekolahId: 'skl-bdg-1', status: 'Terbit', grandTotal: 500000 }]
        return []
      })

      const html = renderToStaticMarkup(
        <InvoiceModal open={true} onClose={() => {}} sekolah={mockSekolah} onPrint={() => {}} />
      )

      expect(html).not.toContain('Follow-up')
    })
  })
})
