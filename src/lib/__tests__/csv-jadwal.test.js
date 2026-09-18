import { describe, expect, it } from 'vitest'
import { exportSekolahCSV } from '../csv.js'

// TEAM_FEEDBACK follow-up — exportSekolahCSV writes the formatted range
// (same string the cards show), same columns. Legacy rows without
// jadwalList fall back to s.jadwal.
describe('exportSekolahCSV jadwal cell', () => {
  async function csvText(sekolah) {
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    const hadDocument = 'document' in globalThis
    const origDocument = globalThis.document
    let captured = null
    URL.createObjectURL = (b) => { captured = b; return 'blob:stub' }
    URL.revokeObjectURL = () => {}
    globalThis.document = {
      createElement: () => ({ setAttribute() {}, click() {} }),
      body: { appendChild() {}, removeChild() {} },
    }
    try {
      exportSekolahCSV(sekolah, [], '2026-08')
      return await captured.text()
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
      if (hadDocument) globalThis.document = origDocument
      else delete globalThis.document
    }
  }

  it('writes the formatted range for jadwalList rows', async () => {
    const text = await csvText([
      {
        nama: 'SD Range', alamat: 'Jl. A', spp: 100000, trainerIds: [],
        jadwal: '', jadwalList: [{ dayOfWeek: 'Senin', time: '14:00', endTime: '15:00' }],
      },
    ])
    expect(text).toContain('Senin 14:00–15:00')
  })

  it('falls back to legacy s.jadwal when jadwalList is empty/missing', async () => {
    const text = await csvText([
      { nama: 'SD Legacy', alamat: 'Jl. B', spp: 50000, trainerIds: [], jadwal: 'Senin', jadwalList: [] },
      { nama: 'SD Kuno', alamat: 'Jl. C', spp: 50000, trainerIds: [], jadwal: 'Rabu' },
    ])
    expect(text).toContain('Senin')
    expect(text).toContain('Rabu')
  })
})
