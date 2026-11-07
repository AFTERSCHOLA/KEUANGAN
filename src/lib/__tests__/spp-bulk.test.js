import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../auth.js', () => ({
  getSafeIdentityContext: () => ({ role: 'superadmin', active: true }),
}))

import {
  bulkSettlePreview,
  sumberPelunasan,
  tarifEfektifSiswa,
  computeSppLunas,
  recomputeAllSppLunas,
} from '../sppPayments.js'
import { write, readCached } from '../store.js'

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

describe('computeSppLunas with school invoices', () => {
  it('marks periods as true when school invoice is settled (Lunas)', () => {
    const student = { id: 'sw-1', sekolahId: 'skl-S', status: 'Aktif' }
    const inv = {
      id: 'inv-10',
      sekolahId: 'skl-S',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
    }
    const schoolPayment = {
      id: 'p-sch',
      invoiceId: 'inv-10',
      sekolahId: 'skl-S',
      periode: '2026-09',
      nominal: 1000000,
    }

    const lunasMap = computeSppLunas(student.id, [schoolPayment], TARIF, {
      sekolahId: 'skl-S',
      invoices: [inv],
      siswa: [student],
    })

    expect(lunasMap['2026-09']).toBe(true)
  })

  it('does not mark period as true if invoice is not settled or not Terbit', () => {
    const student = { id: 'sw-1', sekolahId: 'skl-S', status: 'Aktif' }
    const draftInv = {
      id: 'inv-draft',
      sekolahId: 'skl-S',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Draft',
    }
    const unpaidInv = {
      id: 'inv-unpaid',
      sekolahId: 'skl-S',
      periode: '2026-10',
      grandTotal: 1000000,
      status: 'Terbit',
    }
    const payment = {
      id: 'p-1',
      invoiceId: 'inv-draft',
      nominal: 1000000,
    }

    const lunasMap = computeSppLunas(student.id, [payment], TARIF, {
      sekolahId: 'skl-S',
      invoices: [draftInv, unpaidInv],
      siswa: [student],
    })

    expect(lunasMap['2026-09']).toBeUndefined()
    expect(lunasMap['2026-10']).toBeUndefined()
  })

  it('combines direct student payments with settled school invoice periods', () => {
    const student = { id: 'sw-1', sekolahId: 'skl-S', status: 'Aktif' }
    const inv = {
      id: 'inv-10',
      sekolahId: 'skl-S',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
    }
    const schoolPayment = {
      id: 'p-sch',
      invoiceId: 'inv-10',
      sekolahId: 'skl-S',
      periode: '2026-09',
      nominal: 1000000,
    }
    const directPayment = {
      id: 'p-direct',
      siswaId: 'sw-1',
      periode: '2026-08',
      nominal: 500000,
    }

    const lunasMap = computeSppLunas(student.id, [directPayment, schoolPayment], 500000, {
      sekolahId: 'skl-S',
      invoices: [inv],
      siswa: [student],
    })

    expect(lunasMap['2026-08']).toBe(true)
    expect(lunasMap['2026-09']).toBe(true)
  })

  it('marks multi-period invoices as true when settled', () => {
    const student = { id: 'sw-1', sekolahId: 'skl-S', status: 'Aktif' }
    const inv = {
      id: 'inv-multi',
      sekolahId: 'skl-S',
      periodeList: ['2026-09', '2026-10'],
      grandTotal: 2000000,
      status: 'Terbit',
    }
    const schoolPayment = {
      id: 'p-multi',
      invoiceId: 'inv-multi',
      sekolahId: 'skl-S',
      nominal: 2000000,
    }

    const lunasMap = computeSppLunas(student.id, [schoolPayment], TARIF, {
      sekolahId: 'skl-S',
      invoices: [inv],
      siswa: [student],
    })

    expect(lunasMap['2026-09']).toBe(true)
    expect(lunasMap['2026-10']).toBe(true)
  })
})

describe('recomputeAllSppLunas with school invoices', () => {
  beforeEach(() => {
    const values = new Map()
    globalThis.localStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, val) => values.set(key, String(val)),
      removeItem: key => values.delete(key),
      clear: () => values.clear(),
      key: i => [...values.keys()][i] ?? null,
      get length() { return values.size },
    }
  })

  it('recomputes all students sppLunas including settled invoices from cache', () => {
    const sekolahList = [{ id: 'skl-S', nama: 'Sekolah S', spp: 500000 }]
    const siswaList = [
      { id: 'sw-1', sekolahId: 'skl-S', status: 'Aktif', sppLunas: {} },
      { id: 'sw-2', sekolahId: 'skl-S', status: 'Aktif', sppLunas: {} },
    ]
    const invoices = [{
      id: 'inv-10',
      sekolahId: 'skl-S',
      periode: '2026-09',
      grandTotal: 1000000,
      status: 'Terbit',
    }]
    const sppPayments = [{
      id: 'pay-1',
      invoiceId: 'inv-10',
      sekolahId: 'skl-S',
      periode: '2026-09',
      nominal: 1000000,
    }]

    write('sekolah', sekolahList)
    write('siswa', siswaList)
    write('invoices', invoices)
    write('sppPayments', sppPayments)

    const count = recomputeAllSppLunas()
    expect(count).toBe(2)

    const updatedSiswa = readCached('siswa')
    expect(updatedSiswa[0].sppLunas['2026-09']).toBe(true)
    expect(updatedSiswa[1].sppLunas['2026-09']).toBe(true)
  })
})

describe('StudentList settlement logic and rendering rules', () => {
  it('marks student as Lunas, non-tunggakan, and includes school invoice payment in history', async () => {
    const sekolahId = 'sch-abc'
    const student = { id: 'sw-101', sekolahId, status: 'Aktif' }
    const invoice = {
      id: 'inv-sept',
      sekolahId,
      periode: '2026-09',
      grandTotal: 3000000,
      status: 'Terbit',
    }
    const schoolPayment = {
      id: 'pay-sch-sept',
      invoiceId: 'inv-sept',
      sekolahId,
      periode: '2026-09',
      nominal: 3000000,
      metode: 'Transfer',
      sumberDana: 'sekolah',
      siswaId: null,
    }

    const { invoiceSettlement, invoicePeriods } = await import('../invoices.js')

    const invoices = [invoice]
    const sppPayments = [schoolPayment]
    const siswa = [student]

    const schoolInvoiceSettlementIndex = new Map()
    for (const inv of invoices) {
      if (!inv || !inv.sekolahId || inv.status !== 'Terbit') continue
      const settlement = invoiceSettlement(inv, { sppPayments, siswa, invoices })
      for (const p of invoicePeriods(inv)) {
        const key = `${inv.sekolahId}|${p}`
        if (!schoolInvoiceSettlementIndex.has(key) || settlement.status === 'Lunas') {
          schoolInvoiceSettlementIndex.set(key, settlement)
        }
      }
    }

    expect(schoolInvoiceSettlementIndex.get('sch-abc|2026-09')?.status).toBe('Lunas')

    const sppPaidIndexed = (s, periode) => {
      if (s.sppLunas?.[periode] === true) return true
      if (schoolInvoiceSettlementIndex.get(`${s.sekolahId}|${periode}`)?.status === 'Lunas') return true
      return false
    }

    expect(sppPaidIndexed(student, '2026-09')).toBe(true)

    const getPillLabel = (s, periode) => {
      if (s.status === 'Trial') return 'Trial — Belum Ditagih'
      if (sppPaidIndexed(s, periode)) return 'Lunas'
      return 'Belum Bayar'
    }
    expect(getPillLabel(student, '2026-09')).toBe('Lunas')

    const viewedPeriode = '2026-09'
    const studentHistory = []
    for (const p of sppPayments) {
      if (!p || p.periode !== viewedPeriode) continue
      if (p.siswaId === student.id) {
        studentHistory.push({ ...p, displaySumber: p.invoiceId ? 'Sekolah (Invoice)' : undefined })
      } else if (!p.siswaId && p.sekolahId === student.sekolahId) {
        studentHistory.push({ ...p, displaySumber: 'Sekolah (Invoice)' })
      }
    }

    expect(studentHistory).toHaveLength(1)
    expect(studentHistory[0].id).toBe('pay-sch-sept')
    expect(studentHistory[0].displaySumber).toBe('Sekolah (Invoice)')
  })
})
