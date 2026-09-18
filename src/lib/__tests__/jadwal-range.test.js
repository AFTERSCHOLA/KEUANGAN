import { describe, expect, it } from 'vitest'
import { formatJadwalList } from '../format.js'
import { newJadwalEntry } from '../constants.js'

// TEAM_FEEDBACK G3.1 (D2; FINDS F2) — jadwal endTime shape + formatter.
// New entries default to Senin 14:00–15:00; legacy {day,time} entries
// without endTime display as a one-hour range (R6, no bulk rewrite).
describe('jadwal range (G3.1)', () => {
  it('new entry defaults to Senin 14:00–15:00', () => {
    expect(newJadwalEntry()).toEqual({ dayOfWeek: 'Senin', time: '14:00', endTime: '15:00' })
    expect(formatJadwalList([newJadwalEntry()])).toBe('Senin 14:00–15:00')
  })

  it("legacy {dayOfWeek:'Senin', time:'14:00'} formats 'Senin 14:00–15:00'", () => {
    expect(formatJadwalList([{ dayOfWeek: 'Senin', time: '14:00' }])).toBe('Senin 14:00–15:00')
  })

  it('explicit endTime is rendered verbatim and entries join in order', () => {
    expect(
      formatJadwalList([
        { dayOfWeek: 'Senin', time: '14:00', endTime: '15:30' },
        { dayOfWeek: 'Rabu', time: '09:00', endTime: '10:00' },
      ])
    ).toBe('Senin 14:00–15:30, Rabu 09:00–10:00')
  })

  it('returns empty string for empty/non-array input', () => {
    expect(formatJadwalList([])).toBe('')
    expect(formatJadwalList(null)).toBe('')
  })
})
