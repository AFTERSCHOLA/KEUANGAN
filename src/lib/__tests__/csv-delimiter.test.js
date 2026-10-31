import { describe, expect, it } from 'vitest'
import { exportSiswaCSV, exportSekolahCSV } from '../csv.js'

// M-F8 — Excel ID expects `;` separators (`,` collapses to one column).
// Pins: BOM + `;` delimiter + quoting of values containing `;`.
// Task-2 — every export carries the `sep=;` opener line + CRLF endings
// (open-correctly on double-click); header/data row indices shift by one.
describe('CSV semicolon delimiter (Excel ID)', () => {
  async function csvText(fn) {
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
      fn()
      return await captured.text()
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
      if (hadDocument) globalThis.document = origDocument
      else delete globalThis.document
    }
  }

  it('joins header cells with semicolons (BOM kept in production blob)', async () => {
    const text = await csvText(() => exportSiswaCSV([], '2026-08'))
    // Blob.text() in the test env may drop the BOM; pin the delimiter,
    // which is the behavior change under test.
    const lines = text.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines[0]).toBe('sep=;')
    const header = lines[1]
    expect(header).toContain(';')
    expect(header.split(';')).toHaveLength(5)
  })

  it('quotes values containing semicolons instead of splitting', async () => {
    const text = await csvText(() => exportSekolahCSV(
      [{ nama: 'SD A;B', alamat: 'Jl. A', spp: 100000, trainerIds: [], jadwal: 'Senin' }],
      [],
      '2026-08',
    ))
    const lines = text.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines[0]).toBe('sep=;')
    const row = lines[2]
    expect(row).toContain('"SD A;B"')
    // 5 columns: quoted pair counts as one cell.
    expect(row).toBe('"SD A;B";Jl. A;Senin;100000;Belum Ditugaskan')
  })
})
