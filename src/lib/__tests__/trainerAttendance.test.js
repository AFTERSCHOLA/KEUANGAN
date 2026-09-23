import { describe, expect, it } from 'vitest'
import { summarizeTrainerAttendance, buildTrainerMatrix } from '../trainerAttendance.js'

// TA.C.1 VERIFY (unit half): ownership + periode isolation for the
// personal summary. UI isolation is pinned separately by
// tests/trainer-attendance-summary.spec.js.
describe('summarizeTrainerAttendance (TA.C.1)', () => {
  const rows = [
    { id: 'a1', trainerId: 'trn-A', sekolahId: 'skl-1', tanggal: '2026-09-02', periode: '2026-09', status: 'Hadir' },
    { id: 'a2', trainerId: 'trn-A', sekolahId: 'skl-2', tanggal: '2026-09-03', periode: '2026-09', status: 'Izin' },
    { id: 'a3', trainerId: 'trn-A', sekolahId: 'skl-1', tanggal: '2026-08-10', periode: '2026-08', status: 'Alpa' },
    { id: 'b1', trainerId: 'trn-B', sekolahId: 'skl-1', tanggal: '2026-09-02', periode: '2026-09', status: 'Hadir' },
  ]

  it('counts only the requested trainer in the requested periode', () => {
    const out = summarizeTrainerAttendance({ absensiPengajar: rows, trainerId: 'trn-A', periode: '2026-09' })
    expect(out.total).toEqual({ Hadir: 1, Izin: 1, Alpa: 0 })
    expect(out.count).toBe(2)
    expect(out.sekolahIds.sort()).toEqual(['skl-1', 'skl-2'])
    expect(out.riwayat.map(r => r.id)).toEqual(['a2', 'a1'])
  })

  it('never leaks another trainer rows', () => {
    const out = summarizeTrainerAttendance({ absensiPengajar: rows, trainerId: 'trn-B', periode: '2026-09' })
    expect(out.count).toBe(1)
    expect(out.riwayat.every(r => r.trainerId === 'trn-B')).toBe(true)
  })

  it('periode filter switches the dataset', () => {
    const aug = summarizeTrainerAttendance({ absensiPengajar: rows, trainerId: 'trn-A', periode: '2026-08' })
    expect(aug.total).toEqual({ Hadir: 0, Izin: 0, Alpa: 1 })
  })
})

// TA.C.2 VERIFY (unit half): September-2026 matrix fixture —
// SD Tridaya shows Widia (I) + Asyifa (A) in one cell, SDN 037 Sabang
// holds several teachers on one date, empty dates stay columns, date
// order follows the periode. UI rendering is pinned separately by
// tests/trainer-attendance-recap.spec.js.
describe('buildTrainerMatrix (TA.C.2)', () => {
  const trainer = [
    { id: 'trn-widia', nama: 'Widia', tipePengajar: 'instruktur' },
    { id: 'trn-asyifa', nama: 'Asyifa', tipePengajar: 'asisten' },
    { id: 'trn-ira', nama: 'Ira', tipePengajar: 'asisten' },
  ]
  const sekolah = [
    { id: 'skl-tridaya', nama: 'SD Tridaya' },
    { id: 'skl-sabang', nama: 'SDN 037 Sabang' },
  ]
  const absensiPengajar = [
    { id: 'm1', trainerId: 'trn-widia', sekolahId: 'skl-tridaya', tanggal: '2026-09-03', periode: '2026-09', status: 'Hadir', keterangan: null },
    { id: 'm2', trainerId: 'trn-asyifa', sekolahId: 'skl-tridaya', tanggal: '2026-09-03', periode: '2026-09', status: 'Hadir', keterangan: 'EXPO' },
    { id: 'm3', trainerId: 'trn-widia', sekolahId: 'skl-sabang', tanggal: '2026-09-05', periode: '2026-09', status: 'Hadir', keterangan: null },
    { id: 'm4', trainerId: 'trn-ira', sekolahId: 'skl-sabang', tanggal: '2026-09-05', periode: '2026-09', status: 'Hadir', keterangan: null },
    { id: 'm5', trainerId: 'trn-asyifa', sekolahId: 'skl-sabang', tanggal: '2026-09-05', periode: '2026-09', status: 'Izin', keterangan: null },
    // Corrected row: original Hadir superseded by Izin — cell must show
    // Izin exactly once (R-TA4 latest-wins).
    { id: 'm6', trainerId: 'trn-widia', sekolahId: 'skl-tridaya', tanggal: '2026-09-10', periode: '2026-09', status: 'Hadir', keterangan: null },
    { id: 'm7', trainerId: 'trn-widia', sekolahId: 'skl-tridaya', tanggal: '2026-09-10', periode: '2026-09', status: 'Izin', keterangan: null, correctionOf: 'm6' },
  ]

  it('puts several teachers with I/A labels in one cell', () => {
    const { rows } = buildTrainerMatrix({ absensiPengajar, sekolah, trainer, periode: '2026-09' })
    const tridaya = rows.find(r => r.sekolahId === 'skl-tridaya')
    const cell = tridaya.cells['2026-09-03']
    expect(cell).toHaveLength(2)
    expect(cell.find(e => e.nama === 'Widia')?.label).toBe('I')
    expect(cell.find(e => e.nama === 'Asyifa')?.label).toBe('A')
    expect(cell.find(e => e.nama === 'Asyifa')?.keterangan).toBe('EXPO')
  })

  it('shows many teachers on one date at SDN 037 Sabang', () => {
    const { rows } = buildTrainerMatrix({ absensiPengajar, sekolah, trainer, periode: '2026-09' })
    const sabang = rows.find(r => r.sekolahId === 'skl-sabang')
    expect(sabang.cells['2026-09-05']).toHaveLength(3)
  })

  it('keeps empty dates as columns in periode order', () => {
    const { dates, rows } = buildTrainerMatrix({ absensiPengajar, sekolah, trainer, periode: '2026-09' })
    expect(dates).toHaveLength(30)
    expect(dates[0]).toBe('2026-09-01')
    expect(dates[29]).toBe('2026-09-30')
    const tridaya = rows.find(r => r.sekolahId === 'skl-tridaya')
    expect(tridaya.cells['2026-09-01']).toEqual([])
  })

  it('correction supersedes the original without double-counting', () => {
    const { rows } = buildTrainerMatrix({ absensiPengajar, sekolah, trainer, periode: '2026-09' })
    const tridaya = rows.find(r => r.sekolahId === 'skl-tridaya')
    expect(tridaya.cells['2026-09-10']).toHaveLength(1)
    expect(tridaya.cells['2026-09-10'][0].status).toBe('Izin')
  })
})
