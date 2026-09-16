import { describe, expect, it } from 'vitest'
import { financialData } from '../finance.js'

// SB.A.3 (F-SB1; D-SB7) — regression guard: financialData() tidak boleh
// bergeser sedikit pun untuk data produksi (sekolah tanpa metodePembayaran)
// setelah SB.A.2 menambahkan billingForSekolah() sebagai fungsi berdiri
// sendiri. financialData() SENGAJA belum menyambungkannya (lihat header
// finance.js) — test ini adalah tripwire kalau nanti ada yang keliru
// menyambungkannya tanpa melalui gate SB.B/SB.C yang semestinya.
//
// Fixture identik dengan finance.test.js (bentuk data produksi, bukan
// kasus sintetis baru) per RULES milestone SB.A.3.

function buildEntities() {
  return {
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
}

const CHECKED_FIELDS = ['potensiSpp', 'pemasukanSpp', 'belumTertagih', 'totalBebanHonor', 'labaRugi']

describe('finance regression guard — SB.A.3', () => {
  it('legacy fixture (tanpa metodePembayaran) tetap menghasilkan angka yang sama seperti sebelum SB.A.2', () => {
    const entities = buildEntities()
    const result = financialData({ ...entities, periode: '2026-08' })

    // Angka ini persis sama dengan assertion di finance.test.js (fixture
    // sebelum SB.A ada) — kalau salah satu bergeser, ada regresi.
    expect(result.potensiSpp).toBe(250000)

    expect(result.pemasukanSpp).toBe(250000)
    expect(result.belumTertagih).toBe(0)
    expect(result.totalBebanHonor).toBe(125000)
    expect(result.labaRugi).toBe(205000)
  })

  it('menambahkan metodePembayaran pada sekolah TIDAK mengubah satu pun output financialData()', () => {
    const before = buildEntities()
    const resultBefore = financialData({ ...before, periode: '2026-08' })

    const after = buildEntities()
    // Nilai yang SENGAJA jauh berbeda dari rumus flat lama — kalau
    // financialData() diam-diam membaca field ini, angka pasti bergeser.
    after.sekolah[0].metodePembayaran = {
      basis: 'trainer',
      tarifPerPertemuan: 999999,
      trigger: 'per_pertemuan',
      jumlahN: null,
      jumlahMinggu: null,
      sumberDana: 'sekolah',
    }
    const resultAfter = financialData({ ...after, periode: '2026-08' })

    for (const field of CHECKED_FIELDS) {
      expect(resultAfter[field]).toBe(resultBefore[field])
    }
    expect(resultAfter.sekolahFinance).toEqual(resultBefore.sekolahFinance)
    expect(resultAfter.trainerFinance).toEqual(resultBefore.trainerFinance)
  })

  it('menambahkan metodePembayaran pada SEMUA sekolah tetap tidak mengubah apa pun', () => {
    const before = buildEntities()

    const resultBefore = financialData({ ...before, periode: '2026-08' })

    const after = buildEntities()
    after.sekolah = after.sekolah.map(sch => ({
      ...sch,
      metodePembayaran: {
        basis: 'siswa',
        tarifPerPertemuan: 1,
        trigger: 'per_bulan',
        jumlahN: null,
        jumlahMinggu: null,
        sumberDana: 'ortu',
      },
    }))
    const resultAfter = financialData({ ...after, periode: '2026-08' })

    for (const field of CHECKED_FIELDS) {
      expect(resultAfter[field]).toBe(resultBefore[field])
    }
  })
})