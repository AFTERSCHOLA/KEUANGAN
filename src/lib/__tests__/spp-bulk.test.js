import { describe, it, expect } from 'vitest'

import {
  bulkSettlePreview,
  sumberPelunasan,
  tarifEfektifSiswa,
} from '../sppPayments.js'

const TARIF = 500000
const sekolah = [{ id: 'skl-S', nama: 'Sekolah S', spp: TARIF }]
const invoice = { id: 'inv-1', sekolahId: 'skl-S', periode: '2026-09', grandTotal: 5000000, status: 'Terbit' }

// A lunas via orang tua; B/C belum bayar.
const siswaABC = [
  { id: 'sw-A', sekolahId: 'skl-S', status: 'Aktif' },
  { id: 'sw-B', sekolahId: 'skl-S', status: 'Aktif' },
  { id: 'sw-C', sekolahId: 'skl-S', status: 'Aktif' },
]
const parentA = [{ id: 'p-A', siswaId: 'sw-A', sekolahId: 'skl-S', periode: '2026-09', nominal: 500000, tanggalBayar: '2026-09-05', sumberDana: 'ortu' }]

describe('bulkSettlePreview (D-BR1 skip-settled mint)', () => {
  it('hanya B dan C yang di-mint; A yang dibayar ortu dilewati', () => {
    const { cells, rows } = bulkSettlePreview(invoice, { siswa: siswaABC, sekolah, sppPayments: parentA })
    expect(cells.length).toBe(3)
    expect(rows.map(r => r.siswaId).sort()).toEqual(['sw-B', 'sw-C'])
    rows.forEach(r => {
      expect(r.nominal).toBe(500000)
      expect(r.invoiceId).toBe('inv-1')
      expect(r.sekolahId).toBe('skl-S')
      expect(r.periode).toBe('2026-09')
      expect(r.sumberDana).toBe('sekolah')
    })
  })

  it('sumberPelunasan(A) tetap ortu; B/C belum lunas -> null', () => {
    expect(sumberPelunasan({ siswaId: 'sw-A', periode: '2026-09', payments: parentA, tarif: TARIF })).toBe('ortu')
    expect(sumberPelunasan({ siswaId: 'sw-B', periode: '2026-09', payments: parentA, tarif: TARIF })).toBeNull()
  })

  it('preview kedua setelah mint diterapkan menulis 0 baris (idempoten)', () => {
    const first = bulkSettlePreview(invoice, { siswa: siswaABC, sekolah, sppPayments: parentA })
    const applied = [...parentA, ...first.rows.map((r, i) => ({ ...r, id: `p-bulk-${i}`, tanggalBayar: '2026-09-20' }))]
    const second = bulkSettlePreview(invoice, { siswa: siswaABC, sekolah, sppPayments: applied })
    expect(second.rows.length).toBe(0)
    expect(sumberPelunasan({ siswaId: 'sw-B', periode: '2026-09', payments: applied, tarif: TARIF })).toBe('sekolah')
    // A tidak tersentuh: ledger-nya tetap hanya baris ortu.
    expect(sumberPelunasan({ siswaId: 'sw-A', periode: '2026-09', payments: applied, tarif: TARIF })).toBe('ortu')
  })

  it('parsial ortu 200rb -> sisa 300rb sekolah; sumber yang menggenapkan menang', () => {
    const siswaD = [{ id: 'sw-D', sekolahId: 'skl-S', status: 'Aktif' }]
    const partial = [{ id: 'p-D', siswaId: 'sw-D', sekolahId: 'skl-S', periode: '2026-09', nominal: 200000, tanggalBayar: '2026-09-05', sumberDana: 'ortu' }]
    const { rows } = bulkSettlePreview(invoice, { siswa: siswaD, sekolah, sppPayments: partial })
    expect(rows.length).toBe(1)
    expect(rows[0].nominal).toBe(300000)
    const applied = [...partial, { ...rows[0], id: 'p-D-bulk', tanggalBayar: '2026-09-20' }]
    expect(sumberPelunasan({ siswaId: 'sw-D', periode: '2026-09', payments: applied, tarif: TARIF })).toBe('sekolah')
  })

  it('siswa Trial dan sekolah lain dikecualikan', () => {
    const siswa = [
      ...siswaABC,
      { id: 'sw-T', sekolahId: 'skl-S', status: 'Trial' },
      { id: 'sw-X', sekolahId: 'skl-OTHER', status: 'Aktif' },
    ]
    const { cells } = bulkSettlePreview(invoice, { siswa, sekolah: [...sekolah, { id: 'skl-OTHER', spp: TARIF }], sppPayments: parentA })
    expect(cells.map(c => c.siswaId).sort()).toEqual(['sw-A', 'sw-B', 'sw-C'])
  })

  it('baris invoice-level telanjang tidak melunasi sel per-siswa (perilaku D-BR1 yang di-pin)', () => {
    const bare = [{ id: 'p-bare', invoiceId: 'inv-1', siswaId: null, sekolahId: 'skl-S', periode: '2026-09', nominal: 5000000 }]
    const { rows } = bulkSettlePreview(invoice, { siswa: siswaABC, sekolah, sppPayments: bare })
    expect(rows.length).toBe(3)
  })

  it('invoice multi-periode -> sel per periode', () => {
    const sem = { id: 'inv-S', sekolahId: 'skl-S', periodeList: ['2026-09', '2026-10'], status: 'Terbit' }
    const { cells, rows } = bulkSettlePreview(sem, { siswa: [{ id: 'sw-B', sekolahId: 'skl-S', status: 'Aktif' }], sekolah, sppPayments: [] })
    expect(cells.length).toBe(2)
    expect(rows.map(r => r.periode).sort()).toEqual(['2026-09', '2026-10'])
  })

  it('invoice tanpa sekolah/periode -> preview kosong (fails closed)', () => {
    expect(bulkSettlePreview({ id: 'x' }, { siswa: siswaABC, sekolah, sppPayments: [] })).toEqual({ cells: [], rows: [] })
    expect(bulkSettlePreview(invoice, { siswa: siswaABC, sekolah: [], sppPayments: [] })).toEqual({ cells: [], rows: [] })
  })

  it('tarifEfektifSiswa: sppOverride numerik menang atas spp sekolah', () => {
    expect(tarifEfektifSiswa({ sppOverride: 300000 }, { spp: 500000 })).toBe(300000)
    expect(tarifEfektifSiswa({}, { spp: 500000 })).toBe(500000)
    expect(tarifEfektifSiswa({}, {})).toBe(0)
  })
})
