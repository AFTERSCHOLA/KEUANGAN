import { describe, expect, it } from 'vitest'
import { financialData, honorForPengajarRow, pengajarHonorStats } from '../finance.js'

// TA.C.3 VERIFY (TRAINER_ATTENDANCE_MILESTONES.md TA.C.3):
// -> trainer senior honor 100000 × 2 Hadir = 200000;
// -> trainer baru honor 75000 × 2 Hadir = 150000;
// -> asisten honor 50000 × 2 Hadir = 100000;
// -> Izin/Alpa = 0; no hardcode nominal;
// -> per-trainer isolation; honorPayments regression path untouched.
describe('TA.C.3 honor from absensiPengajar', () => {
  const trainer = [
    { id: 'trn-senior', nama: 'Senior', honor: 100000, tipePengajar: 'instruktur', sekolahIds: ['skl-1'] },
    { id: 'trn-baru', nama: 'Baru', honor: 75000, tipePengajar: 'instruktur', sekolahIds: ['skl-1'] },
    { id: 'trn-asisten', nama: 'Asisten', honor: 50000, tipePengajar: 'asisten', sekolahIds: ['skl-1'] },
  ]
  const sekolah = [{ id: 'skl-1', nama: 'SD TAC3', spp: 0, trainerIds: [] }]
  const absensiPengajar = [
    { id: 'h1', trainerId: 'trn-senior', sekolahId: 'skl-1', tanggal: '2026-09-02', periode: '2026-09', status: 'Hadir' },
    { id: 'h2', trainerId: 'trn-senior', sekolahId: 'skl-1', tanggal: '2026-09-03', periode: '2026-09', status: 'Hadir' },
    { id: 'h3', trainerId: 'trn-baru', sekolahId: 'skl-1', tanggal: '2026-09-02', periode: '2026-09', status: 'Hadir' },
    { id: 'h4', trainerId: 'trn-baru', sekolahId: 'skl-1', tanggal: '2026-09-03', periode: '2026-09', status: 'Hadir' },
    { id: 'h5', trainerId: 'trn-asisten', sekolahId: 'skl-1', tanggal: '2026-09-02', periode: '2026-09', status: 'Hadir' },
    { id: 'h6', trainerId: 'trn-asisten', sekolahId: 'skl-1', tanggal: '2026-09-03', periode: '2026-09', status: 'Hadir' },
    { id: 'h7', trainerId: 'trn-senior', sekolahId: 'skl-1', tanggal: '2026-09-04', periode: '2026-09', status: 'Izin' },
    { id: 'h8', trainerId: 'trn-baru', sekolahId: 'skl-1', tanggal: '2026-09-04', periode: '2026-09', status: 'Alpa' },
    { id: 'h9', trainerId: 'trn-asisten', sekolahId: 'skl-1', tanggal: '2026-09-04', periode: '2026-09', status: 'Hadir', keterangan: 'EXPO' },
  ]
  const base = { sekolah, siswa: [], trainer, absensi: [], honorPayments: [], sppPayments: [], periode: '2026-09' }

  it('computes Hadir × trainer.honor per person with no hardcoded nominal', () => {
    const out = financialData({ ...base, absensiPengajar })
    const byId = Object.fromEntries(out.trainerFinance.map(t => [t.id, t]))
    expect(byId['trn-senior'].bebanHonor).toBe(200000)
    expect(byId['trn-baru'].bebanHonor).toBe(150000)
    // 2 Hadir + 1 Hadir-EXPO (keterangan never changes nominal, PLAN §9).
    expect(byId['trn-asisten'].bebanHonor).toBe(150000)
    expect(out.totalBebanHonor).toBe(500000)
  })

  it('Izin/Alpa yield zero and never leak across trainers', () => {
    const stats = pengajarHonorStats(absensiPengajar, '2026-09')
    expect(stats.hadirByTrainer).toEqual({ 'trn-senior': 2, 'trn-baru': 2, 'trn-asisten': 3 })
    const out = financialData({ ...base, absensiPengajar })
    expect(out.trainerFinance.find(t => t.id === 'trn-senior').hadirSesi).toBe(2)
  })

  it('legacy path is byte-identical when absensiPengajar is absent (R-TA12)', () => {
    const legacyAbsensi = [
      { id: 'l1', sekolahId: 'skl-1', trainerId: 'trn-senior', trainerStatus: 'Hadir', periode: '2026-09', siswaList: [] },
    ]
    const out = financialData({ ...base, absensi: legacyAbsensi })
    expect(out.trainerFinance.find(t => t.id === 'trn-senior').bebanHonor).toBe(100000)
    expect(out.trainerFinance.find(t => t.id === 'trn-baru').bebanHonor).toBe(0)
  })

  it('honorPayments stay the payment source (no double-counting)', () => {
    const out = financialData({
      ...base,
      absensiPengajar,
      honorPayments: [{ id: 'p1', trainerId: 'trn-senior', periode: '2026-09', nominal: 100000 }],
    })
    const senior = out.trainerFinance.find(t => t.id === 'trn-senior')
    expect(senior.bebanHonor).toBe(200000)
    expect(senior.dibayar).toBe(100000)
    expect(senior.sisaHonor).toBe(100000)
  })

  // EF.A.2 (F-EF2; D-EF2) — pin: keterangan is free text, never parsed.
  // Same status with different remarks must price identically; a future
  // `keterangan.includes(...)` branch breaks this test instead of silently
  // changing pay. No app-code edit in this microtask.
  it('keterangan text never changes pricing: Hadir+any-text prices full, Izin/Alpa+any-text prices 0', () => {
    const texts = ['EXPO', 'Pengganti', 'Acara keluarga', '', null]
    const rows = texts.flatMap((keterangan, i) => ([
      {
        id: `q-hadir-${i}`, trainerId: 'trn-senior', sekolahId: 'skl-1',
        tanggal: `2026-09-${String(10 + i).padStart(2, '0')}`, periode: '2026-09',
        status: 'Hadir', ...(keterangan === null ? {} : { keterangan }),
      },
      {
        id: `q-absen-${i}`, trainerId: 'trn-baru', sekolahId: 'skl-1',
        tanggal: `2026-09-${String(10 + i).padStart(2, '0')}`, periode: '2026-09',
        status: i % 2 ? 'Alpa' : 'Izin', keterangan: keterangan ?? 'EXPO',
      },
    ]))
    const stats = pengajarHonorStats(rows, '2026-09')
    expect(stats.hadirByTrainer).toEqual({ 'trn-senior': texts.length })
    const out = financialData({ ...base, absensiPengajar: rows })
    const byId = Object.fromEntries(out.trainerFinance.map(t => [t.id, t]))
    expect(byId['trn-senior'].bebanHonor).toBe(texts.length * 100000)
    expect(byId['trn-baru'].bebanHonor).toBe(0)
    expect(byId['trn-baru'].hadirSesi).toBe(0)
  })
})

// CS.C.1 (F-CS4; D-CS3, D-CS6) — role-first honor.
// I-row at tier, A-row flat 50k (same person prices differently),
// external-A 50k, legacy-no-peran per-person unchanged, memo-only
// (labaRugi untouched).
describe('CS.C.1 role-first honor (COVER_SLOT)', () => {
  const trainer = [
    { id: 'trn-senior', nama: 'Senior', honor: 100000, tipePengajar: 'instruktur', sekolahIds: ['skl-1'] },
    { id: 'trn-baru', nama: 'Baru', honor: 75000, tipePengajar: 'instruktur', sekolahIds: ['skl-1'] },
  ]
  const sekolah = [{ id: 'skl-1', nama: 'SD CS.C.1', spp: 0, trainerIds: [] }]
  const baseCs = { sekolah, siswa: [], trainer, absensi: [], honorPayments: [], sppPayments: [], periode: '2026-09' }

  it('I-row at Senior prices 100k, A-row by the same person prices 50k', () => {
    const rows = [
      { id: 'cs-i1', trainerId: 'trn-senior', sekolahId: 'skl-1', tanggal: '2026-09-02', periode: '2026-09', status: 'Hadir', peran: 'I' },
      { id: 'cs-a1', trainerId: 'trn-senior', sekolahId: 'skl-1', tanggal: '2026-09-03', periode: '2026-09', status: 'Hadir', peran: 'A' },
      { id: 'cs-i2', trainerId: 'trn-baru', sekolahId: 'skl-1', tanggal: '2026-09-02', periode: '2026-09', status: 'Hadir', peran: 'I' },
    ]
    expect(honorForPengajarRow(rows[0], trainer)).toBe(100000)
    expect(honorForPengajarRow(rows[1], trainer)).toBe(50000)
    expect(honorForPengajarRow(rows[2], trainer)).toBe(75000)
    const out = financialData({ ...baseCs, absensiPengajar: rows })
    const byId = Object.fromEntries(out.trainerFinance.map(t => [t.id, t]))
    expect(byId['trn-senior'].hadirSesi).toBe(2)
    expect(byId['trn-senior'].bebanHonor).toBe(150000)
    expect(byId['trn-baru'].bebanHonor).toBe(75000)
    expect(out.totalBebanHonor).toBe(225000)
    expect(out.sekolahFinance[0].bebanHonor).toBe(225000)
  })

  it('external-A prices 50k in school/total beban with no trainerFinance entry', () => {
    const rows = [
      { id: 'cs-ext-a1', trainerId: 'ext-budi-1', sekolahId: 'skl-1', tanggal: '2026-09-04', periode: '2026-09', status: 'Hadir', peran: 'A', dicatatOleh: 'usr-recorder-1' },
    ]
    expect(honorForPengajarRow(rows[0], trainer)).toBe(50000)
    const out = financialData({ ...baseCs, absensiPengajar: rows })
    expect(out.sekolahFinance[0].bebanHonor).toBe(50000)
    expect(out.sekolahFinance[0].trainerKehadiran).toBe(1)
    expect(out.totalBebanHonor).toBe(50000)
    expect(out.trainerFinance.find(t => t.id === 'trn-senior').bebanHonor).toBe(0)
    // Memo-only: external beban never enters cash labaRugi (D1).
    expect(out.labaRugi).toBe(0)
  })

  it('legacy row without peran prices per-person honor unchanged', () => {
    const rows = [
      { id: 'cs-leg1', trainerId: 'trn-senior', sekolahId: 'skl-1', tanggal: '2026-09-05', periode: '2026-09', status: 'Hadir' },
      { id: 'cs-leg2', trainerId: 'trn-baru', sekolahId: 'skl-1', tanggal: '2026-09-05', periode: '2026-09', status: 'Hadir' },
    ]
    expect(honorForPengajarRow(rows[0], trainer)).toBe(100000)
    expect(honorForPengajarRow(rows[1], trainer)).toBe(75000)
    const out = financialData({ ...baseCs, absensiPengajar: rows })
    const byId = Object.fromEntries(out.trainerFinance.map(t => [t.id, t]))
    expect(byId['trn-senior'].bebanHonor).toBe(100000)
    expect(byId['trn-baru'].bebanHonor).toBe(75000)
    expect(out.totalBebanHonor).toBe(175000)
  })

  it('peran on Izin/Alpa still prices 0 (only Hadir bills)', () => {
    const rows = [
      { id: 'cs-x1', trainerId: 'trn-senior', sekolahId: 'skl-1', tanggal: '2026-09-06', periode: '2026-09', status: 'Izin', peran: 'A' },
      { id: 'cs-x2', trainerId: 'trn-senior', sekolahId: 'skl-1', tanggal: '2026-09-07', periode: '2026-09', status: 'Alpa', peran: 'I' },
    ]
    const out = financialData({ ...baseCs, absensiPengajar: rows })
    expect(out.trainerFinance.find(t => t.id === 'trn-senior').bebanHonor).toBe(0)
    expect(out.totalBebanHonor).toBe(0)
  })
})

// D-SB14 — trainerNama/sekolahNama display labels must derive from the
// SAME absensiPengajar hadir records that drive sesiHadir/bebanHonor,
// falling back to legacy trainerIds/sekolahIds only when there is no
// attendance history yet. Fixes the bug where "Kehadiran Mengajar: 1
// Sesi" / "Beban Honor: Rp 50.000" appeared next to "Belum Ditugaskan"
// because the label and the numbers read from two different sources.
describe('D-SB14 trainerNama/sekolahNama label derivation', () => {
  it('derives both labels from absensiPengajar hadir records, ignoring stale/empty legacy fields', () => {
    const sekolah = [{ id: 'skl-1', nama: 'SDN Test', spp: 0, trainerIds: [] }]
    const siswa = []
    const trainer = [{ id: 'trn-1', nama: 'Trainer Satu', honor: 50000, sekolahIds: [] }]
    const absensiPengajar = [
      { id: 'ap-1', sekolahId: 'skl-1', trainerId: 'trn-1', periode: '2026-10', status: 'Hadir', peran: 'I' },
    ]
    const data = financialData({ sekolah, siswa, trainer, absensi: [], absensiPengajar, honorPayments: [], sppPayments: [], periode: '2026-10' })
    expect(data.sekolahFinance[0].trainerNama).toBe('Trainer Satu')
    expect(data.trainerFinance[0].sekolahNama).toBe('SDN Test')
  })

  it('falls back to legacy trainerIds/sekolahIds when there are no hadir records that periode', () => {
    const sekolah = [{ id: 'skl-2', nama: 'SDN Lain', spp: 0, trainerIds: ['trn-2'] }]
    const siswa = []
    const trainer = [{ id: 'trn-2', nama: 'Trainer Dua', honor: 50000, sekolahIds: ['skl-2'] }]
    const data = financialData({ sekolah, siswa, trainer, absensi: [], absensiPengajar: [], honorPayments: [], sppPayments: [], periode: '2026-10' })
    expect(data.sekolahFinance[0].trainerNama).toBe('Trainer Dua')
    expect(data.trainerFinance[0].sekolahNama).toBe('SDN Lain')
  })

  it('shows "Belum Ditugaskan"/"Tidak ditugaskan" when neither hadir records nor legacy fields exist', () => {
    const sekolah = [{ id: 'skl-3', nama: 'SDN Kosong', spp: 0 }]
    const trainer = [{ id: 'trn-3', nama: 'Trainer Tiga', honor: 50000 }]
    const data = financialData({ sekolah, siswa: [], trainer, absensi: [], absensiPengajar: [], honorPayments: [], sppPayments: [], periode: '2026-10' })
    expect(data.sekolahFinance[0].trainerNama).toBe('Belum Ditugaskan')
    expect(data.trainerFinance[0].sekolahNama).toBe('Tidak ditugaskan')
  })
})