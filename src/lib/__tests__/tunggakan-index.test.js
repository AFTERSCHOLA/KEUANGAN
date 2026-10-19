import { describe, expect, it } from 'vitest'
import {
  buildSppTotalIndex,
  sppTotalFromIndex,
  countSiswaBySekolahId,
} from '../tunggakan.js'

// Perf slice: Data Siswa renders sppPayments.filter() per row (StudentList
// sppTotalOf/sppPaidForPeriode) and Data Sekolah renders
// readCached('siswa').filter per card. These pure index builders let both
// tabs precompute once via useMemo and do O(1) lookups per row.
describe('tunggakan index helpers (perf slice)', () => {
  it('builds a per-siswa+periode total index', () => {
    const payments = [
      { siswaId: 's1', periode: '2026-08', nominal: 60000 },
      { siswaId: 's1', periode: '2026-08', nominal: 40000 },
      { siswaId: 's1', periode: '2026-09', nominal: 10000 },
      { siswaId: 's2', periode: '2026-08', nominal: 50000 },
    ]
    const idx = buildSppTotalIndex(payments)
    expect(sppTotalFromIndex(idx, 's1', '2026-08')).toBe(100000)
    expect(sppTotalFromIndex(idx, 's1', '2026-09')).toBe(10000)
    expect(sppTotalFromIndex(idx, 's2', '2026-08')).toBe(50000)
    expect(sppTotalFromIndex(idx, 's2', '2026-09')).toBe(0)
    expect(sppTotalFromIndex(idx, 'missing', '2026-08')).toBe(0)
  })

  it('counts siswa per sekolahId in one pass', () => {
    const siswa = [
      { id: 'a', sekolahId: 'skl-1' },
      { id: 'b', sekolahId: 'skl-1' },
      { id: 'c', sekolahId: 'skl-2' },
      { id: 'd' },
    ]
    const counts = countSiswaBySekolahId(siswa)
    expect(counts.get('skl-1')).toBe(2)
    expect(counts.get('skl-2')).toBe(1)
    expect(counts.get('skl-missing') ?? 0).toBe(0)
  })
})
