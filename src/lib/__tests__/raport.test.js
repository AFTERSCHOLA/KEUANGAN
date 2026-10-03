import { describe, expect, it } from 'vitest'
import {
  RAPORT_ASPECT_KEYS,
  RAPORT_SEMESTER,
  RAPORT_TINGKAT,
  buildRaportSnapshot,
  raportRataRata,
  raportTotal,
} from '../raport.js'
import { newRaport, newSiswa } from '../constants.js'

const NILAI_EXEMPLAR = { helpingTeam: 90, computationalThinking: 88, problemSolving: 89, creativity: 90 }

describe('raport domain', () => {
  it('menjumlah 4 aspek exemplar menjadi 357', () => {
    expect(raportTotal({ helpingTeam: 90, computationalThinking: 88, problemSolving: 89, creativity: 90 })).toBe(357)
  })

  it('rata-rata 357/4 adalah 89.25', () => {
    expect(raportRataRata({ helpingTeam: 90, computationalThinking: 88, problemSolving: 89, creativity: 90 })).toBe(89.25)
  })

  it('aspek null dihitung 0 hanya untuk preview', () => {
    const kosong = { helpingTeam: null, computationalThinking: null, problemSolving: null, creativity: null }
    expect(raportTotal(kosong)).toBe(0)
    expect(raportRataRata(kosong)).toBe(0)
    expect(raportTotal(NILAI_EXEMPLAR)).toBe(357)
  })

  it('konstanta memakai nilai verbatim kontrak Task 5/6/7', () => {
    expect(RAPORT_ASPECT_KEYS).toEqual(['helpingTeam', 'computationalThinking', 'problemSolving', 'creativity'])
    expect(RAPORT_TINGKAT).toEqual(['Beginner', 'Intermediate'])
    expect(RAPORT_SEMESTER).toEqual(['Ganjil', 'Genap'])
  })

  it('buildRaportSnapshot mengunci nilai saat ini', () => {
    const siswa = newSiswa('sek-1', 'SD 1', 'PST')
    siswa.tingkat = 'Beginner'
    siswa.mapel = 'Scratch 3'
    const snapshot = buildRaportSnapshot(siswa)
    expect(snapshot).toEqual({ tingkatSnapshot: 'Beginner', mapelSnapshot: 'Scratch 3', sekolahId: 'sek-1' })
    siswa.tingkat = 'Intermediate'
    siswa.mapel = 'Python/VsCode'
    expect(snapshot.tingkatSnapshot).toBe('Beginner')
    expect(snapshot.mapelSnapshot).toBe('Scratch 3')
  })

  it("newRaport default status 'Draft' dan 4 kunci nilai null", () => {
    const siswa = newSiswa('sek-1', 'SD 1', 'PST')
    siswa.tingkat = 'Beginner'
    siswa.mapel = 'Scratch 3'
    const raport = newRaport(siswa, 'Ganjil', 2026, 'PST')
    expect(raport.status).toBe('Draft')
    expect(raport.nilai).toEqual({
      helpingTeam: null,
      computationalThinking: null,
      problemSolving: null,
      creativity: null,
    })
    expect(raport.grade).toBe('')
    expect(raport.catatan).toBe('')
    expect(raport.siswaId).toBe(siswa.id)
    expect(raport.semester).toBe('Ganjil')
    expect(raport.tahunAjaran).toBe(2026)
    expect(raport.tingkatSnapshot).toBe('Beginner')
    expect(raport.mapelSnapshot).toBe('Scratch 3')
    expect(raport.sekolahId).toBe('sek-1')
    expect(raport.total).toBe(0)
    expect(raport.rataRata).toBe(0)
    expect(raport.id).toMatch(/^rpt-PST-/)
  })

  it('newSiswa membawa field tingkat dan mapel bawaan kosong', () => {
    const siswa = newSiswa('sek-1', 'SD 1', 'PST')
    expect(siswa.tingkat).toBe('')
    expect(siswa.mapel).toBe('')
  })
})
