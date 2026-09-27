import { describe, expect, it } from 'vitest'
import { billingForSekolah, financialData } from '../finance.js'

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

  // EF.A.3 (F-EF3; D-EF3) — fractional semester-legacy spp (141666.67)
  // rounds once at the flat derivation; integer fixtures stay identical
  // and the per-meeting path is untouched.
  it('spp pecahan semester (141666.67) dibulatkan ke rupiah utuh; flat_legacy mirror sama; per-meeting tidak berubah', () => {
    const entities = {
      sekolah: [{ id: 'school-frac', nama: 'SD Semester Legacy', spp: 141666.67, trainerIds: [] }],
      siswa: [
        { id: 's-1', nama: 'A1', sekolahId: 'school-frac', status: 'Aktif' },
        { id: 's-2', nama: 'A2', sekolahId: 'school-frac', status: 'Aktif' },
        { id: 's-3', nama: 'A3', sekolahId: 'school-frac', status: 'Aktif' },
        { id: 's-4', nama: 'T1', sekolahId: 'school-frac', status: 'Trial' },
      ],
      trainer: [],
      absensi: [],
      honorPayments: [],
      sppPayments: [],
    }
    // 3 aktif × 141666.67 = 425000.01 mentah → 425000 bulat (Trial dikecualikan).
    const result = financialData({ ...entities, periode: '2026-08' })
    expect(result.sekolahFinance[0].targetSpp).toBe(425000)
    expect(result.potensiSpp).toBe(425000)
    expect(Number.isInteger(result.potensiSpp)).toBe(true)

    const flat = billingForSekolah(entities.sekolah[0], { absensi: [], siswa: entities.siswa, periode: '2026-08' })
    expect(flat.basis).toBe('flat_legacy')
    expect(flat.total).toBe(425000)

    const tarif = billingForSekolah(
      {
        id: 'school-frac', nama: 'SD Tarif', spp: 0,
        metodePembayaran: { basis: 'siswa', tarifPerPertemuan: 20000, trigger: 'per_pertemuan', jumlahN: null, jumlahMinggu: null, sumberDana: 'sekolah' },
      },
      {
        absensi: Array.from({ length: 5 }, (_, i) => ({ id: `a-${i}`, sekolahId: 'school-frac', periode: '2026-08', trainerStatus: 'Hadir' })),
        siswa: entities.siswa.filter(s => s.status !== 'Trial'),
        periode: '2026-08',
      },
    )
    expect(tarif.total).toBe(20000 * 5 * 3)
  })
})

// CS.C.2 (F-CS6; D-CS7) — Dashboard-last sequencing guard (not build).
// The dashboard keeps the flat Potensi source until the SPP_BILLING chain
// ships the per-meeting generator upgrade (SB.B/SB.C, D-SB10). This guard
// pins both figures on their own paths so a premature source switch fails
// loudly. Exemplar reference (COVER_SLOT_PLAN.md F-CS6): flat Potensi
// 53,535,011 (finance.js flat siswaBilling.length × spp) vs tariff-only
// ≈73,453,750 (billingForSekolah); the unit fixture below reproduces the
// same split at small scale with deliberately distinct values.
describe('dashboard-last guard — CS.C.2', () => {
  it('flat Potensi stays flat even when the tariff path diverges; switching source would fail', () => {
    const entities = {
      sekolah: [{
        id: 'school-guard', nama: 'SD Guard', spp: 100000, trainerIds: [],
        metodePembayaran: {
          basis: 'siswa', tarifPerPertemuan: 30000, trigger: 'per_pertemuan',
          jumlahN: null, jumlahMinggu: null, sumberDana: 'sekolah',
        },
      }],
      siswa: [
        { id: 'g-s1', nama: 'G1', sekolahId: 'school-guard', status: 'Aktif' },
        { id: 'g-s2', nama: 'G2', sekolahId: 'school-guard', status: 'Aktif' },
        { id: 'g-t1', nama: 'GT1', sekolahId: 'school-guard', status: 'Trial' },
      ],
      trainer: [],
      absensi: [
        { id: 'g-a1', sekolahId: 'school-guard', periode: '2026-08', trainerStatus: 'Hadir' },
        { id: 'g-a2', sekolahId: 'school-guard', periode: '2026-08', trainerStatus: 'Hadir' },
        { id: 'g-a3', sekolahId: 'school-guard', periode: '2026-08', trainerStatus: 'Hadir' },
      ],
      honorPayments: [],
      sppPayments: [],
    }
    // Flat: 2 aktif × 100000 = 200000 (Trial excluded).
    const flat = financialData({ ...entities, periode: '2026-08' })
    expect(flat.potensiSpp).toBe(200000)
    expect(flat.sekolahFinance[0].targetSpp).toBe(200000)
    // Tariff: 30000 × 3 Hadir × 2 aktif = 180000 — deliberately ≠ flat.
    const tariff = billingForSekolah(entities.sekolah[0], {
      absensi: entities.absensi, siswa: entities.siswa, periode: '2026-08',
    })
    expect(tariff.basis).toBe('siswa')
    expect(tariff.pertemuanAktual).toBe(3)
    expect(tariff.total).toBe(180000)
    expect(tariff.total).not.toBe(flat.potensiSpp)
    // Dashboard-last: financialData must still report the flat figure even
    // though the school carries a tariff config. Wiring billingForSekolah
    // into financialData (premature switch) moves potensi to 180000 and
    // breaks this guard instead of silently shipping two answers.
    const withoutTariff = financialData({
      ...entities,
      sekolah: [{ id: 'school-guard', nama: 'SD Guard', spp: 100000, trainerIds: [] }],
      periode: '2026-08',
    })
    expect(flat.potensiSpp).toBe(withoutTariff.potensiSpp)
    expect(flat.sekolahFinance).toEqual(withoutTariff.sekolahFinance)
  })
})