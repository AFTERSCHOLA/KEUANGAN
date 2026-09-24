import { describe, expect, it } from 'vitest'
import { newPenugasanRow, validateRowDates } from '../penugasan.js'

// PG.A.1 narrow check: pure constructors only (no store/API).
describe('penugasan helpers (PG.A.1)', () => {
  it('defaults to aktif=true, mulai=today, selesai=null', () => {
    const row = newPenugasanRow({ sekolahId: 'skl-1', trainerId: 'trn-1' })
    expect(row.sekolahId).toBe('skl-1')
    expect(row.trainerId).toBe('trn-1')
    expect(row.asistenId).toBeNull()
    expect(row.aktif).toBe(true)
    expect(row.periodeSelesai).toBeNull()
    expect(typeof row.periodeMulai).toBe('string')
    expect(row.periodeMulai).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(validateRowDates(row)).toBeNull()
  })

  it('rejects missing sekolah/trainer and inverted range with pinned copy', () => {
    expect(validateRowDates({ sekolahId: '', trainerId: 'trn-1', periodeMulai: '2026-09-24' })).toBe('Sekolah wajib dipilih.')
    expect(validateRowDates({ sekolahId: 'skl-1', trainerId: '', periodeMulai: '2026-09-24' })).toBe('Instruktur wajib dipilih.')
    expect(validateRowDates({ sekolahId: 'skl-1', trainerId: 'trn-1', periodeMulai: '' })).toBe('Tanggal mulai wajib diisi.')
    expect(validateRowDates({ sekolahId: 'skl-1', trainerId: 'trn-1', periodeMulai: '2026-09-10', periodeSelesai: '2026-09-01' })).toBe('Tanggal selesai harus setelah tanggal mulai.')
  })
})
