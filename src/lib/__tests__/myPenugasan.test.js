import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMyPenugasan, visibleSekolahOnDate } from '../myPenugasan.js'

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }
}

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

// SF.2 VERIFY (unit): host-row fixture mirrors the Alifah shape from
// SF.1 (rows live on the host record, 2026-07-01..null open-ended,
// peran A) — Sim-suffixed ids keep the fixture distinct from seed data.
const HOST_ROWS_SIM = [
  { sekolahId: 'skl-tridaya-sim', periodeMulai: '2026-07-01', periodeSelesai: null, aktif: true, peran: 'A' },
  { sekolahId: 'skl-sains-albiruni-sim', periodeMulai: '2026-07-01', periodeSelesai: null, aktif: true, peran: 'A' },
]

describe('visibleSekolahOnDate (SF.2)', () => {
  it('covered date shows both host rows on 2026-11-02', () => {
    expect(visibleSekolahOnDate(HOST_ROWS_SIM, '2026-11-02')).toEqual([
      'skl-tridaya-sim',
      'skl-sains-albiruni-sim',
    ])
  })

  it('uncovered date hides a row starting after tanggal (periodeMulai 2026-11-03)', () => {
    const rows = [
      { sekolahId: 'skl-tridaya-sim', periodeMulai: '2026-11-03', periodeSelesai: null, aktif: true, peran: 'A' },
    ]
    expect(visibleSekolahOnDate(rows, '2026-11-02')).toEqual([])
  })

  it('inactive row (aktif=false) stays hidden even when dates cover tanggal', () => {
    const rows = [
      { sekolahId: 'skl-tridaya-sim', periodeMulai: '2026-07-01', periodeSelesai: null, aktif: false, peran: 'A' },
    ]
    expect(visibleSekolahOnDate(rows, '2026-11-02')).toEqual([])
  })

  it('empty-string periodeSelesai stays open-ended (visible)', () => {
    const rows = [
      { sekolahId: 'skl-tridaya-sim', periodeMulai: '2026-07-01', periodeSelesai: '', aktif: true, peran: 'A' },
    ]
    expect(visibleSekolahOnDate(rows, '2026-11-02')).toEqual(['skl-tridaya-sim'])
  })

  it('ended row (periodeSelesai before tanggal) stays hidden', () => {
    const rows = [
      { sekolahId: 'skl-tridaya-sim', periodeMulai: '2026-07-01', periodeSelesai: '2026-10-31', aktif: true, peran: 'A' },
    ]
    expect(visibleSekolahOnDate(rows, '2026-11-02')).toEqual([])
  })
})

describe('fetchMyPenugasan (SF.2)', () => {
  it('returns the server array verbatim on success', async () => {
    fetch.mockResolvedValueOnce(jsonResponse(HOST_ROWS_SIM, 200))
    await expect(fetchMyPenugasan()).resolves.toEqual(HOST_ROWS_SIM)
    expect(fetch.mock.calls[0][0]).toBe('/api/myPenugasan.php')
  })

  it('returns [] on 403 (admin lane) without throwing', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Akses tidak diizinkan' }, 403))
    await expect(fetchMyPenugasan()).resolves.toEqual([])
  })

  it('returns [] on 401 (anonymous) without throwing', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
    await expect(fetchMyPenugasan()).resolves.toEqual([])
  })

  it('returns [] on malformed (non-array) body', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ rows: [] }, 200))
    await expect(fetchMyPenugasan()).resolves.toEqual([])
  })
})
