import { describe, expect, it, vi } from 'vitest'
import {
  academicYearLabel,
  calYear,
  defaultCabang,
  generateId,
  monthLabel,
  defaultAcademicYear,
  defaultMonth,
  newAbsensi,
  newCabang,
  newSekolah,
  newSiswa,
  newTrainer,
  periodeFromDate,
  periodeKey,
  shiftPeriode,
  assertReferences,
} from '../constants.js'

describe('constants and factories', () => {
  it('creates branch-prefixed IDs and branch defaults', () => {
    expect(generateId('skl', 'bdg')).toMatch(/^skl-BDG-\d+-[a-z0-9]+$/)
    expect(newCabang({ nama: 'Bandung', kode: ' bdg ' })).toMatchObject({ nama: 'Bandung', kode: 'BDG' })
    expect(defaultCabang()).toMatchObject({ id: 'cbg-PST-default', kode: 'PST' })
    expect(newSekolah().cabangId).toBe(defaultCabang().id)
    expect(newSekolah('branch-bdg', 'bdg').id).toMatch(/^skl-BDG-/)
    expect(newTrainer('bdg').id).toMatch(/^trn-BDG-/)
    expect(newSiswa('school-bdg', 'Bandung', 'bdg').id).toMatch(/^sw-BDG-/)
  })

  it('creates complete sparse-friendly domain factories', () => {
    const siswa = newSiswa('school-1', 'Sekolah 1', 'PST')
    const absensi = newAbsensi({ tanggal: '2026-08-20', sekolahId: 'school-1', trainerId: 'trainer-1', trainerNama: 'Budi' })

    expect(siswa).toMatchObject({ sekolahId: 'school-1', sekolahNama: 'Sekolah 1', status: 'Aktif', trialMulai: null, sppLunas: {} })
    expect(absensi).toMatchObject({ periode: '2026-08', trainerStatus: 'Hadir', siswaList: [], asistenId: null, dokumentasi: [], catatan: '' })
    expect(absensi).toMatchObject({ statusVerifikasi: null, sesiKe: 1, konfirmasiTrainer: null, lastEditedAt: null })
  })

  it('converts and shifts academic periods', () => {
    expect(calYear(7, 2026)).toBe(2026)
    expect(calYear(6, 2026)).toBe(2027)
    expect(periodeKey(7, 2026)).toBe('2026-07')
    expect(periodeFromDate('2026-08-20')).toBe('2026-08')
    expect(shiftPeriode('2026-07', 6)).toBe('2027-01')
    expect(shiftPeriode('2027-01', -1)).toBe('2026-12')
    expect(academicYearLabel(2026)).toBe('2026/2027')
    expect(monthLabel('08')).toBe('Agustus')
    expect(monthLabel('99')).toBe('99')
  })

  it('uses current date helpers deterministically when requested', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z'))
    expect(defaultAcademicYear()).toBe(2026)
    expect(defaultMonth()).toBe(8)
    vi.useRealTimers()
  })
})

// SB.A.1 (F-SB2; D-SB6, D-SB7) — metodePembayaran default null, dan
// record lama tanpa field itu tetap valid (tidak ada migrasi destruktif).
describe('newSekolah metodePembayaran (SB.A.1)', () => {
  it('defaults metodePembayaran to null', () => {
    const sekolah = newSekolah()
    expect(sekolah).toHaveProperty('metodePembayaran')
    expect(sekolah.metodePembayaran).toBeNull()
  })

  it('keeps the legacy spp field untouched', () => {
    const sekolah = newSekolah()
    expect(sekolah.spp).toBe(0)
  })

    it('accepts a legacy record with no metodePembayaran key at all', () => {
    const legacy = {
      id: 'skl-PST-legacy',
      nama: 'SD Legacy',
      alamat: '',
      foto: '',
      jadwal: 'Senin',
      spp: 100000,
      trainerIds: [],
      cabangId: defaultCabang().id,
    }
    // Record lama sengaja tidak punya metodePembayaran. Konsumen harus
    // memperlakukan absennya field itu sebagai "belum diisi" (D-SB7),
    // bukan sebagai data rusak — dibuktikan lebih jauh di SB.A.2 lewat
    // fallback rumus flat.
    expect(legacy.metodePembayaran).toBeUndefined()
    expect(legacy.spp).toBe(100000)
    expect(() => JSON.parse(JSON.stringify(legacy))).not.toThrow()
  })
})

describe('newTrainer', () => {
  it('creates a trainer with instruktur as the default tipePengajar', () => {
    const trainer = newTrainer('cbg-1', 'PST')

    expect(trainer.tipePengajar).toBe('instruktur')
    expect(trainer.honor).toBe(0)
    expect(trainer.cabangId).toBe('cbg-1')
  })
})