import { describe, expect, it } from 'vitest'
import { buildDailyTimetable, dayNameForTanggal, coverMarksForRows } from '../penugasan.js'

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

  // BUG3 (D-PS4): a scoped assignment renders only its exact slots;
  // unscoped rows keep fanning out over every slot that weekday.
  it('scopes rows to the assignment triple; unscoped still fans out', () => {
    const scopedTrainers = [
      {
        id: 'trn-x', nama: 'X',
        penugasanPengajar: [
          { id: 'p1', sekolahId: 'skl-1', trainerId: 'trn-x', asistenId: null, cabangId: null, periodeMulai: '2026-01-01', periodeSelesai: null, aktif: true, hari: 'Rabu', jamMulai: '14:00', jamSelesai: '15:00' },
        ],
      },
    ]
    const rows = buildDailyTimetable({ trainers: scopedTrainers, sekolah, tanggal: '2026-09-23' })
    expect(rows.map(r => r.waktu)).toEqual(['Rabu 14:00–15:00'])
  })

  it('hari-only scope keeps the whole day; non-matching scope yields zero rows', () => {
    const hariOnly = [
      { id: 'trn-x', nama: 'X', penugasanPengajar: [{ id: 'p1', sekolahId: 'skl-1', trainerId: 'trn-x', aktif: true, periodeMulai: '2026-01-01', periodeSelesai: null, hari: 'Kamis', jamMulai: null, jamSelesai: null }] },
    ]
    expect(buildDailyTimetable({ trainers: hariOnly, sekolah, tanggal: '2026-09-24' }).map(r => r.waktu)).toEqual(['Kamis 10:00–11:00'])
    const miss = [
      { id: 'trn-x', nama: 'X', penugasanPengajar: [{ id: 'p1', sekolahId: 'skl-1', trainerId: 'trn-x', aktif: true, periodeMulai: '2026-01-01', periodeSelesai: null, hari: 'Rabu', jamMulai: '14:00', jamSelesai: '15:00' }] },
    ]
    expect(buildDailyTimetable({ trainers: miss, sekolah, tanggal: '2026-09-24' })).toEqual([])
  })

  // BUG8 (D-BUG8): cover link rides along; marks pair substitutes with
  // covered origins per school + waktu (display-only).
  it('threads coverOf and pairs Pengganti with Digantikan origins', () => {
    const trainers = [
      {
        id: 'trn-o', nama: 'Origin',
        penugasanPengajar: [
          { id: 'pgs-o', sekolahId: 'skl-1', trainerId: 'trn-o', aktif: true, periodeMulai: '2026-01-01', periodeSelesai: null },
        ],
      },
      {
        id: 'trn-s', nama: 'Sub',
        penugasanPengajar: [
          { id: 'pgs-c', sekolahId: 'skl-1', trainerId: 'trn-s', aktif: true, periodeMulai: '2026-01-01', periodeSelesai: null, coverOf: 'pgs-o' },
        ],
      },
    ]
    const rows = buildDailyTimetable({ trainers, sekolah, tanggal: '2026-09-23' })
    expect(rows).toHaveLength(4)
    const marks = coverMarksForRows(rows)
    const coverRows = rows.filter(r => marks.isCoverRow(r))
    expect(coverRows).toHaveLength(2)
    expect(coverRows.every(r => r.trainerId === 'trn-s')).toBe(true)
    const covered = rows.filter(r => marks.coveredBy(r).length > 0)
    expect(covered).toHaveLength(2)
    expect(covered.every(r => r.trainerId === 'trn-o')).toBe(true)
    expect(marks.coveredBy(covered[0])).toEqual(['trn-s'])
    // Dangling coverOf (no origin row that slot) marks nothing.
    const dangling = coverMarksForRows([{ assignmentId: 'x', coverOf: 'nope', sekolahId: 's', waktu: 'w', trainerId: 't' }])
    expect(dangling.coveredBy({ assignmentId: 'x' })).toEqual([])
  })

  // AP.A.3 (D-AP2): Waktu derives from the LIVE sekolah.jadwalList at read
  // time. Assignment rows carry no time keys at all, so a school jadwal
  // edit propagates with zero penugasan writes — this pins that contract.
  it('derives Waktu from live jadwalList, never from assignment rows', () => {
    const editedSekolah = [
      { id: 'skl-1', nama: 'SD Sim', jadwalList: [{ dayOfWeek: 'Rabu', time: '16:00', endTime: '17:30' }] },
    ]
    const rows = buildDailyTimetable({ trainers, sekolah: editedSekolah, tanggal: '2026-09-23' })
    expect(rows.map(r => r.waktu)).toEqual(['Rabu 16:00–17:30'])
    expect(trainers[0].penugasanPengajar.every(a => a.hari == null && a.jamMulai == null)).toBe(true)
  })
})
