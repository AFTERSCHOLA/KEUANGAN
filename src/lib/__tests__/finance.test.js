import { describe, expect, it } from 'vitest'
import { financialData } from '../finance.js'

describe('financialData', () => {
  const entities = {
    sekolah: [
      { id: 'school-pst', nama: 'SD Pusat', spp: 100000, trainerIds: ['trainer-1'] },
      { id: 'school-bdg', nama: 'SD Bandung', spp: 150000, trainerIds: ['trainer-2'] },
    ],
    siswa: [
      { id: 'student-1', nama: 'Aktif Pusat', sekolahId: 'school-pst', status: 'Aktif' },
      { id: 'student-2', nama: 'Trial Pusat', sekolahId: 'school-pst', status: 'Trial' },
      { id: 'student-3', nama: 'Aktif Bandung', sekolahId: 'school-bdg', status: 'Aktif' },
    ],
    trainer: [
      { id: 'trainer-1', nama: 'Budi', honor: 50000, sekolahIds: ['school-pst'] },
      { id: 'trainer-2', nama: 'Dewi', honor: 75000, sekolahIds: ['school-bdg'] },
    ],
    absensi: [
      {
        id: 'attendance-1', periode: '2026-08', sekolahId: 'school-pst', trainerId: 'trainer-1', trainerStatus: 'Hadir',
        siswaList: [{ siswaId: 'student-1', status: 'Hadir' }, { siswaId: 'student-2', status: 'Hadir' }],
      },
      {
        id: 'attendance-2', periode: '2026-08', sekolahId: 'school-bdg', trainerId: 'trainer-2', trainerStatus: 'Hadir',
        siswaList: [{ siswaId: 'student-3', status: 'Hadir' }],
      },
      {
        id: 'attendance-3', periode: '2026-07', sekolahId: 'school-pst', trainerId: 'trainer-1', trainerStatus: 'Hadir',
        siswaList: [{ siswaId: 'student-1', status: 'Hadir' }],
      },
    ],
    honorPayments: [
      { id: 'payment-1', trainerId: 'trainer-1', periode: '2026-08', nominal: 20000 },
      { id: 'payment-2', trainerId: 'trainer-2', periode: '2026-08', nominal: '25000' },
    ],
    sppPayments: [
      { id: 'spp-1', siswaId: 'student-1', periode: '2026-08', nominal: 60000 },
      { id: 'spp-2', siswaId: 'student-1', periode: '2026-08', nominal: 40000 },
      { id: 'spp-3', siswaId: 'student-3', periode: '2026-08', nominal: 150000 },
    ],
  }

  it('returns every financial output from a known cash-basis fixture', () => {
    const result = financialData({ ...entities, periode: '2026-08' })

    expect(result.periode).toBe('2026-08')
    expect(result.potensiSpp).toBe(250000)
    expect(result.pemasukanSpp).toBe(250000)
    expect(result.totalBebanHonor).toBe(125000)
    expect(result.totalHonorDibayar).toBe(45000)
    expect(result.labaRugi).toBe(205000)
    expect(result.belumTertagih).toBe(0)
    expect(result.sisaKewajiban).toBe(80000)
    expect(result.sekolahFinance).toHaveLength(2)
    expect(result.trainerFinance).toHaveLength(2)
  })

  it('excludes trial students from billing while retaining them in school counts', () => {
    const result = financialData({ ...entities, periode: '2026-08' })

    expect(result.sekolahFinance[0].siswaCount).toBe(2)
    expect(result.sekolahFinance[0].targetSpp).toBe(100000)
    expect(result.sekolahFinance[0].realisasiSpp).toBe(100000)
  })

  it('keeps attendance period and cash payment periods separate', () => {
    const result = financialData({ ...entities, periode: '2026-08' })

    expect(result.sekolahFinance[0].trainerKehadiran).toBe(1)
    expect(result.sekolahFinance[0].bebanHonor).toBe(50000)
    expect(result.trainerFinance[0].hadirSesi).toBe(1)
    expect(result.trainerFinance[0].dibayar).toBe(20000)
    expect(result.trainerFinance[0].sisaHonor).toBe(30000)
    expect(result.trainerFinance[1].hadirSesi).toBe(1)
    expect(result.trainerFinance[1].dibayar).toBe(25000)
    expect(result.trainerFinance[1].sekolahNama).toBe('SD Bandung')
  })
})
