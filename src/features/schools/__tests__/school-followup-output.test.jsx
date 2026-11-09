import { describe, expect, it, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SchoolList from '../SchoolList.jsx'
import * as store from '../../../lib/store.js'

vi.mock('../../../components/Modal.jsx', () => ({
  default: () => null,
}))

vi.mock('../../../components/ConfirmDialog.jsx', () => ({
  default: () => null,
}))

vi.mock('../../../components/AlertDialog.jsx', () => ({
  default: () => null,
}))

vi.mock('../../../components/PhotoSlot.jsx', () => ({
  default: () => <div data-testid="photo-slot" />,
}))

vi.mock('../../reports/InvoiceModal.jsx', () => ({
  default: () => null,
}))

vi.mock('../../reports/InvoiceTemplate.jsx', () => ({
  default: () => null,
}))

vi.mock('../../../lib/store.js', () => ({
  readCached: vi.fn((key) => {
    if (key === 'sekolah') return []
    if (key === 'cabang') return [{ id: 'cbg-bandung', nama: 'Bandung', kode: 'BDG' }]
    if (key === 'siswa') return []
    if (key === 'invoices') return []
    return []
  }),
  write: vi.fn(),
  upsert: vi.fn(),
  getRoleContext: vi.fn(() => ({ role: 'superadmin' })),
  writeRemote: vi.fn().mockResolvedValue({ status: 'ok' }),
  deleteRemote: vi.fn().mockResolvedValue({ status: 'ok' }),
  pullRemote: vi.fn().mockResolvedValue([]),
  subscribeStore: vi.fn(() => () => {}),
}))

describe('SchoolList - School Card Follow-Up Status Output', () => {
  const mockSekolahA = {
    id: 'skl-a',
    nama: 'SD Negeri Harapan',
    cabangId: 'cbg-bandung',
    status: 'Aktif',
    alamat: 'Jl. Merdeka No. 1',
    spp: 500000,
  }

  const mockSekolahB = {
    id: 'skl-b',
    nama: 'SMP Bina Bangsa',
    cabangId: 'cbg-bandung',
    status: 'Aktif',
    alamat: 'Jl. Asia Afrika No. 2',
    spp: 600000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(store.getRoleContext).mockReturnValue({ role: 'superadmin' })
  })

  it('renders "Follow-up: <date> (Menunggu Pembayaran)" when school has an invoice with unpaid follow-up', () => {
    const invoices = [
      {
        id: 'inv-1',
        sekolahId: 'skl-a',
        nomor: 'BDG-202611-0001',
        status: 'Terbit',
        grandTotal: 1000000,
        followUps: [
          {
            id: 'fu-1',
            penerima: 'Kepala Sekolah',
            tanggalFollowUp: '2026-11-20',
            nominal: 0,
            catatan: 'Menunggu pencairan BOS',
          },
        ],
      },
    ]

    vi.mocked(store.readCached).mockImplementation((key) => {
      if (key === 'sekolah') return [mockSekolahA]
      if (key === 'cabang') return [{ id: 'cbg-bandung', nama: 'Bandung', kode: 'BDG' }]
      if (key === 'invoices') return invoices
      return []
    })

    const html = renderToStaticMarkup(<SchoolList />)

    expect(html).toContain('Follow-up: 2026-11-20 (Menunggu Pembayaran)')
    expect(html).toContain('bg-amber-100 text-amber-700')
  })

  it('renders "Follow-up: <date> (Cicilan)" when school invoice has partial payment', () => {
    const invoices = [
      {
        id: 'inv-2',
        sekolahId: 'skl-b',
        nomor: 'BDG-202611-0002',
        status: 'Terbit',
        grandTotal: 1200000,
        followUps: [
          {
            id: 'fu-1',
            penerima: 'Bendahara',
            tanggalFollowUp: '2026-11-05',
            nominal: 0,
          },
          {
            id: 'fu-2',
            penerima: 'Bendahara',
            tanggalFollowUp: '2026-11-15',
            nominal: 500000,
            catatan: 'Cicilan pertama',
          },
        ],
      },
    ]

    vi.mocked(store.readCached).mockImplementation((key) => {
      if (key === 'sekolah') return [mockSekolahB]
      if (key === 'cabang') return [{ id: 'cbg-bandung', nama: 'Bandung', kode: 'BDG' }]
      if (key === 'invoices') return invoices
      if (key === 'sppPayments') return [{ id: 'pay-1', invoiceId: 'inv-2', nominal: 500000, sekolahId: 'skl-b' }]
      return []
    })

    const html = renderToStaticMarkup(<SchoolList />)

    expect(html).toContain('Follow-up: 2026-11-15 (Cicilan)')
    expect(html).toContain('bg-sky-100 text-sky-700')
  })

  it('renders "Follow-up: <date> (Lunas)" when school invoice is fully settled', () => {
    const invoices = [
      {
        id: 'inv-2',
        sekolahId: 'skl-b',
        nomor: 'BDG-202611-0002',
        status: 'Terbit',
        grandTotal: 1200000,
        followUps: [
          {
            id: 'fu-1',
            penerima: 'Bendahara',
            tanggalFollowUp: '2026-11-05',
            nominal: 0,
          },
          {
            id: 'fu-2',
            penerima: 'Bendahara',
            tanggalFollowUp: '2026-11-15',
            nominal: 1200000,
            catatan: 'Sudah lunas ditransfer',
          },
        ],
      },
    ]

    vi.mocked(store.readCached).mockImplementation((key) => {
      if (key === 'sekolah') return [mockSekolahB]
      if (key === 'cabang') return [{ id: 'cbg-bandung', nama: 'Bandung', kode: 'BDG' }]
      if (key === 'invoices') return invoices
      if (key === 'sppPayments') return [{ id: 'pay-2', invoiceId: 'inv-2', nominal: 1200000, sekolahId: 'skl-b' }]
      return []
    })

    const html = renderToStaticMarkup(<SchoolList />)

    expect(html).toContain('Follow-up: 2026-11-15 (Lunas)')
    expect(html).toContain('bg-emerald-100 text-emerald-700')
  })

  it('does not render follow-up chip when school has no invoices or no follow-up history', () => {
    vi.mocked(store.readCached).mockImplementation((key) => {
      if (key === 'sekolah') return [mockSekolahA]
      if (key === 'cabang') return [{ id: 'cbg-bandung', nama: 'Bandung', kode: 'BDG' }]
      if (key === 'invoices') return []
      return []
    })

    const html = renderToStaticMarkup(<SchoolList />)

    expect(html).not.toContain('Follow-up:')
  })
})
