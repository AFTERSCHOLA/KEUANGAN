import { describe, expect, it } from 'vitest'
import { newPenugasanRow, validateRowDates, trainerIdsForSekolahOnDate } from '../penugasan.js'

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

// PG.C.1 narrow check: sekolah→trainer direction (companion to the
// trainer→sekolah direction already pinned by TrainerAttendanceForm.jsx's
// inline validSekolahForDate). Pure helper, no store/API — same style as
// PG.A.1 above. Fixes D-SB13: AttendanceForm.jsx's dropdown previously
// read the legacy sekolah.trainerIds field, which no assignment flow
// writes to, leaving the dropdown empty for every school whose trainers
// were only ever assigned via Penugasan Pengajar.
describe('trainerIdsForSekolahOnDate (PG.C.1)', () => {
  const trainers = [
    {
      id: 'trn-x', nama: 'X',
      penugasanPengajar: [
        { id: 'p1', sekolahId: 'skl-1', trainerId: 'trn-x', asistenId: 'trn-y', periodeMulai: '2026-01-01', periodeSelesai: null, aktif: true },
      ],
    },
    { id: 'trn-y', nama: 'Y', penugasanPengajar: [] },
    {
      id: 'trn-z', nama: 'Z',
      penugasanPengajar: [
        { id: 'p2', sekolahId: 'skl-1', trainerId: 'trn-z', periodeMulai: '2026-01-01', periodeSelesai: '2025-12-31', aktif: true },
      ],
    },
  ]

  it('collects trainerId + asistenId union for the sekolah+tanggal, ignores out-of-range', () => {
    const ids = trainerIdsForSekolahOnDate(trainers, 'skl-1', '2026-09-23')
    expect(ids.has('trn-x')).toBe(true)
    expect(ids.has('trn-y')).toBe(true)
    expect(ids.has('trn-z')).toBe(false) // periodeSelesai sudah lewat
  })

  it('empty sekolahId or no matching assignment -> empty set', () => {
    expect(trainerIdsForSekolahOnDate(trainers, '', '2026-09-23').size).toBe(0)
    expect(trainerIdsForSekolahOnDate(trainers, 'skl-nonexistent', '2026-09-23').size).toBe(0)
  })

  it('asistenIds (2nd assistant) counted in union', () => {
    const t = [{ id: 'trn-a', penugasanPengajar: [
      { id: 'p3', sekolahId: 'skl-2', trainerId: 'trn-a', asistenIds: ['trn-b'], periodeMulai: '2026-01-01', periodeSelesai: null, aktif: true },
    ] }]
    expect(trainerIdsForSekolahOnDate(t, 'skl-2', '2026-09-23').has('trn-b')).toBe(true)
  })

  it('inactive assignment (aktif: false) excluded even when dates match', () => {
    const t = [{ id: 'trn-c', penugasanPengajar: [
      { id: 'p4', sekolahId: 'skl-3', trainerId: 'trn-c', periodeMulai: '2026-01-01', periodeSelesai: null, aktif: false },
    ] }]
    expect(trainerIdsForSekolahOnDate(t, 'skl-3', '2026-09-23').size).toBe(0)
  })
})