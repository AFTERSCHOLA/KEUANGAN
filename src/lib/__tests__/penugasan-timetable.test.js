import { describe, expect, it } from 'vitest'
import { buildDailyTimetable, dayNameForTanggal } from '../penugasan.js'

// PG.B.1 narrow check: pure join only (no store/API).
describe('buildDailyTimetable (PG.B.1)', () => {
  const trainers = [
    {
      id: 'trn-x', nama: 'X',
      penugasanPengajar: [
        { id: 'p1', sekolahId: 'skl-1', trainerId: 'trn-x', asistenId: 'trn-y', cabangId: null, periodeMulai: '2026-01-01', periodeSelesai: null, aktif: true },
        { id: 'p2', sekolahId: 'skl-1', trainerId: 'trn-x', asistenId: null, cabangId: null, periodeMulai: '2026-01-01', periodeSelesai: null, aktif: false },
      ],
    },
    { id: 'trn-y', nama: 'Y', penugasanPengajar: [] },
  ]
  const sekolah = [
    {
      id: 'skl-1', nama: 'SD Sim',
      jadwalList: [
        { dayOfWeek: 'Rabu', time: '14:00', endTime: '15:00' },
        { dayOfWeek: 'Rabu', time: '16:00', endTime: '17:00' },
        { dayOfWeek: 'Kamis', time: '10:00', endTime: '11:00' },
      ],
    },
  ]

  it('parses weekday locally (2026-09-23 = Rabu)', () => {
    expect(dayNameForTanggal('2026-09-23')).toBe('Rabu')
    expect(dayNameForTanggal('').length).toBe(0)
    expect(dayNameForTanggal('bukan-tanggal').length).toBe(0)
  })

  it('expands one active assignment x matching slots (inactive ignored)', () => {
    const rows = buildDailyTimetable({ trainers, sekolah, tanggal: '2026-09-23' })
    expect(rows.map(r => r.waktu)).toEqual(['Rabu 14:00–15:00', 'Rabu 16:00–17:00'])
    expect(rows[0]).toMatchObject({ sekolahNama: 'SD Sim', trainerId: 'trn-x', asistenId: 'trn-y', hari: 'Rabu' })
  })

  it('hides Wednesday rows on Thursday, shows Thursday slot instead', () => {
    const rows = buildDailyTimetable({ trainers, sekolah, tanggal: '2026-09-24' })
    expect(rows.map(r => r.waktu)).toEqual(['Kamis 10:00–11:00'])
  })

  it('returns [] outside the active range or without slots that weekday', () => {
    expect(buildDailyTimetable({ trainers, sekolah, tanggal: '2025-12-31' })).toEqual([])
    const noSlotDay = buildDailyTimetable({ trainers, sekolah, tanggal: '2026-09-26' })
    expect(noSlotDay).toEqual([])
  })
})
