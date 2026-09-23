import { describe, expect, it } from 'vitest'
import { financialData, pengajarHonorStats } from '../finance.js'

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
})
