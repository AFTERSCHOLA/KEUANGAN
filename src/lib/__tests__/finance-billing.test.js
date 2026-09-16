import { describe, expect, it } from 'vitest'
import { billingForSekolah } from '../finance.js'

const periode = '2026-08'

function sekolahFlat(overrides = {}) {
  return { id: 'skl-1', nama: 'SD Flat', spp: 150000, ...overrides }
}

function sekolahMetode(metodePembayaran, overrides = {}) {
  return { id: 'skl-1', nama: 'SD Metode', spp: 0, metodePembayaran, ...overrides }
}

function siswaAktif(n, sekolahId = 'skl-1') {
  return Array.from({ length: n }, (_, i) => ({ id: `sw-${i}`, sekolahId, status: 'Aktif' }))
}

function absensiHadir(count, sekolahId = 'skl-1') {
  return Array.from({ length: count }, (_, i) => ({
    id: `abs-${i}`, sekolahId, periode, trainerStatus: 'Hadir',
  }))
}

describe('billingForSekolah — SB.A.2', () => {
  it('jatuh ke rumus flat lama saat metodePembayaran null (R-SB3)', () => {
    const sch = sekolahFlat()
    const siswa = siswaAktif(3)
    const result = billingForSekolah(sch, { absensi: absensiHadir(10), siswa, periode })
    expect(result).toEqual({ total: 3 * 150000, basis: 'flat_legacy', pertemuanAktual: null })
  })

  it('basis siswa: tarif × pertemuan_aktual × jumlah siswa (per_pertemuan)', () => {

    const sch = sekolahMetode({ basis: 'siswa', tarifPerPertemuan: 20000, trigger: 'per_pertemuan', jumlahN: null, jumlahMinggu: null, sumberDana: 'sekolah' })
    const siswa = siswaAktif(4)
    const result = billingForSekolah(sch, { absensi: absensiHadir(5), siswa, periode })
    expect(result.total).toBe(20000 * 5 * 4)
    expect(result.pertemuanAktual).toBe(5)
  })

  it('basis trainer: tarif × pertemuan_aktual saja, TIDAK dikali siswa', () => {
    const sch = sekolahMetode({ basis: 'trainer', tarifPerPertemuan: 100000, trigger: 'per_bulan', jumlahN: null, jumlahMinggu: null, sumberDana: 'sekolah' })
    const siswa = siswaAktif(10) // jumlah siswa banyak, harus tidak berpengaruh
    const result = billingForSekolah(sch, { absensi: absensiHadir(6), siswa, periode })
    expect(result.total).toBe(100000 * 6)
  })

  it('trigger per_n_pertemuan / per_siklus_minggu tidak mengubah rumus per-periode (hanya metadata jadwal)', () => {
    const base = { basis: 'siswa', tarifPerPertemuan: 15000, sumberDana: 'sekolah' }
    const siswa = siswaAktif(2)
    const absensi = absensiHadir(4)

    const perN = billingForSekolah(sekolahMetode({ ...base, trigger: 'per_n_pertemuan', jumlahN: 4, jumlahMinggu: null }), { absensi, siswa, periode })
    const perSiklus = billingForSekolah(sekolahMetode({ ...base, trigger: 'per_siklus_minggu', jumlahN: null, jumlahMinggu: 12 }), { absensi, siswa, periode })
    const perBulan = billingForSekolah(sekolahMetode({ ...base, trigger: 'per_bulan', jumlahN: null, jumlahMinggu: null }), { absensi, siswa, periode })

    expect(perN.total).toBe(perSiklus.total)
    expect(perSiklus.total).toBe(perBulan.total)
    expect(perN.total).toBe(15000 * 4 * 2)
  })

  it('D-SB13: Izin/Alpa tidak menagih; hanya Hadir dihitung', () => {
    const sch = sekolahMetode({ basis: 'siswa', tarifPerPertemuan: 10000, trigger: 'per_pertemuan', jumlahN: null, jumlahMinggu: null, sumberDana: 'sekolah' })
    const siswa = siswaAktif(1)
    const absensi = [

      { id: 'a1', sekolahId: 'skl-1', periode, trainerStatus: 'Hadir' },
      { id: 'a2', sekolahId: 'skl-1', periode, trainerStatus: 'Izin' },
      { id: 'a3', sekolahId: 'skl-1', periode, trainerStatus: 'Alpa' },
    ]
    const result = billingForSekolah(sch, { absensi, siswa, periode })
    expect(result.pertemuanAktual).toBe(1)
    expect(result.total).toBe(10000 * 1 * 1)
  })

  it('D-SB13: sesi pengganti = record Hadir baru, ikut menagih normal', () => {
    const sch = sekolahMetode({ basis: 'trainer', tarifPerPertemuan: 50000, trigger: 'per_pertemuan', jumlahN: null, jumlahMinggu: null, sumberDana: 'sekolah' })
    const absensi = [
      { id: 'a1', sekolahId: 'skl-1', periode, trainerStatus: 'Izin' }, // sesi asli, tidak hadir
      { id: 'a2', sekolahId: 'skl-1', periode, trainerStatus: 'Hadir' }, // record pengganti baru
    ]
    const result = billingForSekolah(sch, { absensi, siswa: [], periode })
    expect(result.pertemuanAktual).toBe(1)
    expect(result.total).toBe(50000)
  })

  it('siswa Trial tidak masuk hitungan basis siswa', () => {
    const sch = sekolahMetode({ basis: 'siswa', tarifPerPertemuan: 10000, trigger: 'per_pertemuan', jumlahN: null, jumlahMinggu: null, sumberDana: 'sekolah' })
    const siswa = [
      { id: 'sw-1', sekolahId: 'skl-1', status: 'Aktif' },
      { id: 'sw-2', sekolahId: 'skl-1', status: 'Trial' },
    ]
    const result = billingForSekolah(sch, { absensi: absensiHadir(2), siswa, periode })
    expect(result.total).toBe(10000 * 2 * 1) // hanya 1 siswa non-Trial
  })

  it('mengabaikan absensi sekolah lain', () => {
    const sch = sekolahMetode({ basis: 'trainer', tarifPerPertemuan: 10000, trigger: 'per_pertemuan', jumlahN: null, jumlahMinggu: null, sumberDana: 'sekolah' })

    const absensi = [...absensiHadir(3, 'skl-1'), ...absensiHadir(99, 'skl-lain')]
    const result = billingForSekolah(sch, { absensi, siswa: [], periode })
    expect(result.pertemuanAktual).toBe(3)
  })
})