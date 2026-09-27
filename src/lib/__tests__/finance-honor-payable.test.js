import { describe, it, expect } from 'vitest'
import { financialData, honorForPengajarRow, PERAN_ASISTEN_HONOR } from '../finance.js'

// ============================================================
// EF.B.1 — Derive honor payable (F-EF5; D-EF4)
//
// Ini test regresi PIN, bukan implementasi baru — honorForPengajarRow()
// (CS.C.1) dan trainerFinance.bebanHonor (TA.C.3) di finance.js SUDAH
// mengimplementasikan payable role-first sebelum EF.B.1 dimulai. File
// ini mem-pin 4 skenario dari VERIFY EF.B.1 secara eksplisit supaya
// perubahan tak sengaja di masa depan ketahuan lewat test gagal, bukan
// cuma "kelihatan jalan" di UI.
// ============================================================

describe('EF.B.1: honor payable — honorForPengajarRow (unit)', () => {
  it('Senior-I: trainer dengan honor tinggi (I/legacy) dapat honor penuh dari trainer.honor', () => {
    const trainer = [{ id: 'trn-senior', nama: 'Senior', honor: 100000 }]
    const row = { trainerId: 'trn-senior', peran: 'I' }
    expect(honorForPengajarRow(row, trainer)).toBe(100000)
  })

  it('same-person-A: trainer yang sama, saat berperan A di sesi ini, dapat flat 50k (bukan trainer.honor miliknya)', () => {
    const trainer = [{ id: 'trn-senior', nama: 'Senior', honor: 100000 }]
    const row = { trainerId: 'trn-senior', peran: 'A' }
    expect(honorForPengajarRow(row, trainer)).toBe(PERAN_ASISTEN_HONOR)
    expect(honorForPengajarRow(row, trainer)).toBe(50000)
  })

  it('external-A: baris tanpa trainer record (asisten eksternal) tetap dapat flat 50k', () => {
    const trainer = [{ id: 'trn-lain', nama: 'Lain', honor: 75000 }]
    const row = { trainerId: 'trn-external-tanpa-akun', peran: 'A' }
    expect(honorForPengajarRow(row, trainer)).toBe(PERAN_ASISTEN_HONOR)

  })

  it('legacy-no-peran: baris tanpa field peran (data lama) tetap pakai trainer.honor, tidak berubah', () => {
    const trainer = [{ id: 'trn-legacy', nama: 'Legacy', honor: 60000 }]
    const row = { trainerId: 'trn-legacy' } // tidak ada field peran sama sekali
    expect(honorForPengajarRow(row, trainer)).toBe(60000)
  })

  it('external-I: baris peran I tanpa trainer record (tidak seharusnya terjadi di praktik) fails closed ke 0', () => {
    const trainer = [{ id: 'trn-lain', nama: 'Lain', honor: 75000 }]
    const row = { trainerId: 'trn-external-tanpa-akun', peran: 'I' }
    expect(honorForPengajarRow(row, trainer)).toBe(0)
  })
})

describe('EF.B.1: honor payable — financialData integrasi (labaRugi invariance, D1)', () => {
  const periode = '2026-09'

  const trainer = [
    { id: 'trn-senior', nama: 'Senior', honor: 100000, sekolahIds: ['skl-a'] },
  ]
  const sekolah = [
    { id: 'skl-a', nama: 'Sekolah A', spp: 500000, trainerIds: ['trn-senior'] },
  ]
  const siswa = []
  const sppPayments = []

  it('trainerFinance menampilkan bebanHonor (payable) sesuai peran per sesi', () => {
    const absensiPengajar = [
      { id: 'r1', periode, trainerId: 'trn-senior', sekolahId: 'skl-a', status: 'Hadir', peran: 'I' },
      { id: 'r2', periode, trainerId: 'trn-senior', sekolahId: 'skl-a', status: 'Hadir', peran: 'A' },
    ]

    const result = financialData({ sekolah, siswa, trainer, absensi: [], honorPayments: [], sppPayments, periode, absensiPengajar })
    const tf = result.trainerFinance.find(t => t.id === 'trn-senior')
    // 1 sesi sebagai I (100000) + 1 sesi sebagai A (50000) = 150000
    expect(tf.bebanHonor).toBe(150000)
  })

  it('D1 invariance: labaRugi TIDAK berubah baik dengan maupun tanpa memo bebanHonor/sisaKewajiban dihitung', () => {
    const absensiPengajar = [
      { id: 'r1', periode, trainerId: 'trn-senior', sekolahId: 'skl-a', status: 'Hadir', peran: 'I' },
    ]
    const honorPayments = [
      { trainerId: 'trn-senior', periode, nominal: 100000 },
    ]

    const withPengajar = financialData({ sekolah, siswa, trainer, absensi: [], honorPayments, sppPayments, periode, absensiPengajar })
    const withoutPengajar = financialData({ sekolah, siswa, trainer, absensi: [], honorPayments, sppPayments, periode, absensiPengajar: null })

    // labaRugi = pemasukanSpp - totalHonorDibayar SAJA (cash basis).
    // totalHonorDibayar dua-duanya berasal dari honorPayments yang sama,
    // jadi labaRugi harus identik terlepas dari bebanHonor/payable yang
    // dihitung di jalur pengajarStats.
    expect(withPengajar.labaRugi).toBe(withoutPengajar.labaRugi)
    expect(withPengajar.totalHonorDibayar).toBe(withoutPengajar.totalHonorDibayar)
  })

  it('legacy-no-peran regression: sekolah tanpa absensiPengajar (null) tetap pakai jalur lama, byte-identical', () => {
    const absensi = [
      { sekolahId: 'skl-a', periode, trainerId: 'trn-senior', trainerStatus: 'Hadir', siswaList: [] },
    ]
    const result = financialData({ sekolah, siswa, trainer, absensi, honorPayments: [], sppPayments, periode, absensiPengajar: null })
    const tf = result.trainerFinance.find(t => t.id === 'trn-senior')
    // jalur legacy: hadirSesi * t.honor = 1 * 100000

    expect(tf.bebanHonor).toBe(100000)
  })
})