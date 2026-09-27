import { describe, expect, it } from 'vitest'
import { summarizeTrainerAttendance, buildTrainerMatrix, formatMatrixCell } from '../trainerAttendance.js'
import { newAbsensiPengajar, newEksternal } from '../constants.js'

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

// CS.B.2 (F-CS4/F-CS5; D-CS3/D-CS5) — role-on-row + external-recorder.
// One person holds peran I in one session row and peran A in another
// with no type change; an external without a login has a Present row
// carrying who recorded it. Matrix labels read the row first.
describe('per-session role + external recorder (CS.B.2)', () => {
  const trainer = [
    { id: 'trn-vazira', nama: 'Vazira', tipePengajar: 'instruktur' },
  ]
  const sekolah = [{ id: 'skl-1', nama: 'Sekolah Satu' }]

  it('Vazira-style I-then-A rows label independently of a later tipePengajar flip', () => {
    const absensiPengajar = [
      newAbsensiPengajar({ id: 'v1', trainerId: 'trn-vazira', sekolahId: 'skl-1', tanggal: '2026-09-03', status: 'Hadir', cabangId: 'cbg-1', peran: 'I' }),
      newAbsensiPengajar({ id: 'v2', trainerId: 'trn-vazira', sekolahId: 'skl-1', tanggal: '2026-09-05', status: 'Hadir', cabangId: 'cbg-1', peran: 'A' }),
    ]
    // Later type flip to asisten must not rewrite stored history.
    const flipped = [{ id: 'trn-vazira', nama: 'Vazira', tipePengajar: 'asisten' }]
    const { rows } = buildTrainerMatrix({ absensiPengajar, sekolah, trainer: flipped, periode: '2026-09' })
    const school = rows.find(r => r.sekolahId === 'skl-1')
    expect(school.cells['2026-09-03'][0].label).toBe('I')
    expect(school.cells['2026-09-05'][0].label).toBe('A')
  })

  it('rows without peran keep the legacy live-type labels byte-identically', () => {
    const absensiPengajar = [
      newAbsensiPengajar({ id: 'l1', trainerId: 'trn-vazira', sekolahId: 'skl-1', tanggal: '2026-09-03', status: 'Hadir', cabangId: 'cbg-1' }),
    ]
    const { rows } = buildTrainerMatrix({ absensiPengajar, sekolah, trainer, periode: '2026-09' })
    expect(rows.find(r => r.sekolahId === 'skl-1').cells['2026-09-03'][0].label).toBe('I')
  })

  it('external factory row carries dicatatOleh; internal rows carry none', () => {
    const ext = newEksternal({ sekolahId: 'skl-1', nama: 'Budi Sim', cabangId: 'cbg-1' })
    expect(ext.id).toMatch(/^ext-/)
    const row = newAbsensiPengajar({
      trainerId: ext.id, sekolahId: 'skl-1', tanggal: '2026-09-03',
      status: 'Hadir', cabangId: 'cbg-1', peran: 'A', dicatatOleh: 'usr-recorder-1',
    })
    expect(row.peran).toBe('A')
    expect(row.dicatatOleh).toBe('usr-recorder-1')
    const internal = newAbsensiPengajar({
      trainerId: 'trn-vazira', sekolahId: 'skl-1', tanggal: '2026-09-03',
      status: 'Hadir', cabangId: 'cbg-1', peran: 'I',
    })
    expect(internal.dicatatOleh).toBeNull()
  })
})

// AP.C.2 (D-AP5) — cell format pins: Hadir bare, status joins after the
// dash, keterangan last. Mirrors docs/exemplar/ABSENSI TRAINER.xlsx
// `Nama (I)/(A)` default.
describe('formatMatrixCell (AP.C.2)', () => {
  it('renders Hadir bare', () => {
    expect(formatMatrixCell({ nama: 'Widia', label: 'I', status: 'Hadir', keterangan: null })).toBe('Widia (I)')
  })

  it('renders Hadir + keterangan after the dash', () => {
    expect(formatMatrixCell({ nama: 'Asyifa', label: 'A', status: 'Hadir', keterangan: 'EXPO' })).toBe('Asyifa (A) — EXPO')
  })

  it('renders Izin after the dash', () => {
    expect(formatMatrixCell({ nama: 'Asyifa', label: 'A', status: 'Izin', keterangan: null })).toBe('Asyifa (A) — Izin')
  })

  it('renders status before keterangan when both present', () => {
    expect(formatMatrixCell({ nama: 'Asyifa', label: 'A', status: 'Izin', keterangan: 'Acara keluarga' })).toBe('Asyifa (A) — Izin, Acara keluarga')
  })
})
