import { describe, expect, it } from 'vitest'
import { filterEntitiesByBranch } from '../branchScope.js'

describe('filterEntitiesByBranch', () => {
  it('keeps only records reachable from schools in the selected branch', () => {
    const entities = {
      cabang: [{ id: 'pst' }, { id: 'bdg' }],
      sekolah: [
        { id: 'school-pst', cabangId: 'pst' },
        { id: 'school-bdg', cabangId: 'bdg' },
      ],
      siswa: [
        { id: 'student-pst', sekolahId: 'school-pst' },
        { id: 'student-bdg', sekolahId: 'school-bdg' },
      ],
      trainer: [
        { id: 'trainer-pst', sekolahIds: ['school-pst'] },
        { id: 'trainer-bdg', sekolahIds: ['school-bdg'] },
      ],
      absensi: [
        { id: 'attendance-pst', sekolahId: 'school-pst' },
        { id: 'attendance-bdg', sekolahId: 'school-bdg' },
      ],
      honorPayments: [
        { id: 'payment-pst', trainerId: 'trainer-pst' },
        { id: 'payment-bdg', trainerId: 'trainer-bdg' },
      ],
      sppPayments: [
        { id: 'spp-pst', siswaId: 'student-pst' },
        { id: 'spp-bdg', siswaId: 'student-bdg' },
      ],
      invoices: [
        { id: 'invoice-pst', sekolahId: 'school-pst' },
        { id: 'invoice-bdg', sekolahId: 'school-bdg' },
      ],
    }

    const result = filterEntitiesByBranch(entities, 'bdg')

    expect(result.sekolah.map(s => s.id)).toEqual(['school-bdg'])
    expect(result.siswa.map(s => s.id)).toEqual(['student-bdg'])
    expect(result.trainer.map(t => t.id)).toEqual(['trainer-bdg'])
    expect(result.absensi.map(a => a.id)).toEqual(['attendance-bdg'])
    expect(result.honorPayments.map(p => p.id)).toEqual(['payment-bdg'])
    expect(result.sppPayments.map(p => p.id)).toEqual(['spp-bdg'])
    expect(result.invoices.map(i => i.id)).toEqual(['invoice-bdg'])
  })

  it('returns the original aggregate when no branch is selected', () => {
    const entities = { sekolah: [{ id: 'school-1' }], siswa: [], trainer: [], absensi: [], honorPayments: [], sppPayments: [], invoices: [] }

    expect(filterEntitiesByBranch(entities, '')).toBe(entities)
  })
})
