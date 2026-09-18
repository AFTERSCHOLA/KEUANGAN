import { describe, expect, it } from 'vitest'
import { financialData } from '../finance.js'

// TEAM_FEEDBACK G5.1 (D5; FINDS F6) — overpay floors at zero with a visible
// credit line. labaRugi (cash basis, D1) is unchanged.
const PERIODE = '2026-08'

function sppFixture({ sppTarif, payments }) {
  return {
    sekolah: [{ id: 'sch-1', nama: 'SD Overpay', spp: sppTarif, trainerIds: [] }],
    siswa: [{ id: 'sw-1', nama: 'Siswa', sekolahId: 'sch-1', status: 'Aktif' }],
    trainer: [],
    absensi: [],
    honorPayments: [],
    sppPayments: payments.map((nominal, i) => ({ id: `spp-${i}`, siswaId: 'sw-1', periode: PERIODE, nominal })),
    periode: PERIODE,
  }
}

function honorFixture({ honor, sessions, payments }) {
  return {
    sekolah: [],
    siswa: [],
    trainer: [{ id: 'trn-1', nama: 'Trainer', honor, sekolahIds: [] }],
    absensi: Array.from({ length: sessions }, (_, i) => ({
      id: `abs-${i}`, periode: PERIODE, sekolahId: 'sch-x', trainerId: 'trn-1', trainerStatus: 'Hadir', siswaList: [],
    })),
    honorPayments: payments.map((nominal, i) => ({ id: `pay-${i}`, trainerId: 'trn-1', periode: PERIODE, nominal })),
    sppPayments: [],
    periode: PERIODE,
  }
}

describe('finance overpay guards (G5.1)', () => {
  it('potensi 1jt with pemasukan 1,2jt yields belumTertagih 0 plus lebihBayarSpp 200rb', () => {
    const result = financialData(sppFixture({ sppTarif: 1000000, payments: [1200000] }))
    expect(result.potensiSpp).toBe(1000000)
    expect(result.pemasukanSpp).toBe(1200000)
    expect(result.belumTertagih).toBe(0)
    expect(result.lebihBayarSpp).toBe(200000)
    // Cash profit still counts the cash that arrived.
    expect(result.labaRugi).toBe(1200000)
  })

  it('beban 500rb with dibayar 600rb yields sisaHonor 0 plus lebihBayarHonor 100rb', () => {
    const result = financialData(honorFixture({ honor: 500000, sessions: 1, payments: [600000] }))
    const t = result.trainerFinance[0]
    expect(t.bebanHonor).toBe(500000)
    expect(t.dibayar).toBe(600000)
    expect(t.sisaHonor).toBe(0)
    expect(t.lebihBayarHonor).toBe(100000)
    expect(result.sisaKewajiban).toBe(0)
    expect(result.lebihBayarHonor).toBe(100000)
  })

  it('exact-pay and underpay cases are unchanged with zero credit', () => {
    const exact = financialData(honorFixture({ honor: 500000, sessions: 1, payments: [500000] }))
    expect(exact.trainerFinance[0].sisaHonor).toBe(0)
    expect(exact.trainerFinance[0].lebihBayarHonor).toBe(0)
    expect(exact.sisaKewajiban).toBe(0)
    expect(exact.lebihBayarHonor).toBe(0)

    const under = financialData(honorFixture({ honor: 500000, sessions: 1, payments: [200000] }))
    expect(under.trainerFinance[0].sisaHonor).toBe(300000)
    expect(under.trainerFinance[0].lebihBayarHonor).toBe(0)
    expect(under.sisaKewajiban).toBe(300000)

    const sppUnder = financialData(sppFixture({ sppTarif: 1000000, payments: [400000] }))
    expect(sppUnder.belumTertagih).toBe(600000)
    expect(sppUnder.lebihBayarSpp).toBe(0)
  })
})
