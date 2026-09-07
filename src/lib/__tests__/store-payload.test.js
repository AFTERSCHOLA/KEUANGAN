import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCsrfToken, setCsrfToken } from '../api.js'
import { login } from '../auth.js'
import { prepareWritePayload, writeRemote } from '../store.js'

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }
}

function installStorage() {
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

beforeEach(() => {
  installStorage()
  globalThis.fetch = vi.fn()
  clearCsrfToken()
  setCsrfToken('test-csrf')
})

afterEach(() => {
  clearCsrfToken()
})

const ctx = {
  superadmin: { role: 'superadmin', trainerId: null, cabangId: null },
  adminCabang: { role: 'admin_cabang', trainerId: null, cabangId: 'cbg-self' },
  trainer: { role: 'trainer', trainerId: 'trn-self', cabangId: null },
}

describe('M-MAS1.1 prepareWritePayload', () => {
  it('returns cabang payloads unchanged for both roles', () => {
    const payload = { id: 'cbg-PST', kode: 'PST', nama: 'Pusat' }
    expect(prepareWritePayload('cabang', payload, ctx.superadmin)).toEqual(payload)
    expect(prepareWritePayload('cabang', payload, ctx.adminCabang)).toEqual(payload)
  })

  it('strips cabangId from sekolah payloads for admin_cabang, keeps it for superadmin', () => {
    const payload = { id: 'sch-1', nama: 'SDK A', cabangId: 'cbg-other' }
    expect(prepareWritePayload('sekolah', payload, ctx.superadmin)).toEqual(payload)
    expect(prepareWritePayload('sekolah', payload, ctx.adminCabang)).not.toHaveProperty('cabangId')
  })

  it('strips cabangId from trainer payloads for every role (server forbids body cabangId)', () => {
    // trainer.php:51-53 rejects a body-supplied cabangId for EVERY role
    // (admin_cabang: forced from own session; superadmin: branch moves are
    // not allowed through this endpoint — WA thread 1/9/2026 policy). The
    // stale pre-A2.5 expectation ("keeps it for superadmin") was aligned
    // to the authoritative server contract in e5bb162 (taste #61).
    const payload = { id: 'trn-1', nama: 'Budi', cabangId: 'cbg-other' }
    expect(prepareWritePayload('trainer', payload, ctx.superadmin)).not.toHaveProperty('cabangId')
    expect(prepareWritePayload('trainer', payload, ctx.adminCabang)).not.toHaveProperty('cabangId')
    expect(prepareWritePayload('trainer', payload, ctx.trainer)).not.toHaveProperty('cabangId')
  })

  it('always strips cabangId from siswa payloads regardless of role', () => {
    const payload = { id: 'sw-1', nama: 'Andi', sekolahId: 'sch-1', cabangId: 'cbg-other' }
    expect(prepareWritePayload('siswa', payload, ctx.superadmin)).not.toHaveProperty('cabangId')
    expect(prepareWritePayload('siswa', payload, ctx.adminCabang)).not.toHaveProperty('cabangId')
  })

  it('strips cabangId from users payloads only for admin_cabang', () => {
    const payload = {
      action: 'create',
      role: 'trainer',
      username: 'budi',
      displayName: 'Budi',
      cabangId: 'cbg-other',
    }
    expect(prepareWritePayload('users', payload, ctx.superadmin)).toEqual(payload)
    expect(prepareWritePayload('users', payload, ctx.adminCabang)).not.toHaveProperty('cabangId')
  })

  it('keeps cabangId on ledger payloads (absensi / sppPayments / honorPayments)', () => {
    const spp = { id: 'spp-1', siswaId: 'sw-1', cabangId: 'cbg-self' }
    const honor = { id: 'hr-1', trainerId: 'trn-1', cabangId: 'cbg-self' }
    const absensi = { id: 'ab-1', sekolahId: 'sch-1', cabangId: 'cbg-self' }
    expect(prepareWritePayload('sppPayments', spp, ctx.adminCabang)).toEqual(spp)
    expect(prepareWritePayload('honorPayments', honor, ctx.adminCabang)).toEqual(honor)
    expect(prepareWritePayload('absensi', absensi, ctx.adminCabang)).toEqual(absensi)
  })

  it('does not mutate the caller-supplied record', () => {
    const payload = { id: 'sch-1', nama: 'SDK A', cabangId: 'cbg-other' }
    const before = JSON.stringify(payload)
    prepareWritePayload('sekolah', payload, ctx.adminCabang)
    expect(JSON.stringify(payload)).toBe(before)
  })

  it('treats a null/undefined ctx as no-op (superadmin-style passthrough)', () => {
    const payload = { id: 'sch-1', nama: 'SDK A', cabangId: 'cbg-other' }
    expect(prepareWritePayload('sekolah', payload, null)).toEqual(payload)
    expect(prepareWritePayload('sekolah', payload, { role: null })).toEqual(payload)
  })
})

describe('M-MAS1.1 writeRemote routes through prepareWritePayload', () => {
  function fakeAuth(role, cabangId = null) {
    return { user: {
      id: 'usr-test',
      username: 'tester',
      displayName: 'Tester',
      role,
      cabangId,
      trainerId: role === 'trainer' ? 'trn-self' : null,
      active: true,
      mustChangePassword: false,
    }, csrfToken: 'csrf-test' }
  }

  it('omits cabangId from the sekolah POST body for admin_cabang', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(fakeAuth('admin_cabang', 'cbg-self')))
      .mockResolvedValueOnce(jsonResponse({ ok: true, id: 'sch-1', version: 1 }, 200))
    await login('tester', 'pw')
    const result = await writeRemote('sekolah', { id: 'sch-1', nama: 'SDK A', cabangId: 'cbg-other' })
    expect(result.status).toBe('ok')
    const [, init] = fetch.mock.calls[1]
    const body = JSON.parse(init.body)
    expect(body).not.toHaveProperty('cabangId')
    expect(body.nama).toBe('SDK A')
    expect(body.action).toBe('create')
  })

  it('keeps cabangId in the sekolah POST body for superadmin', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(fakeAuth('superadmin', null)))
      .mockResolvedValueOnce(jsonResponse({ ok: true, id: 'sch-1', version: 1 }, 200))
    await login('root', 'pw')
    await writeRemote('sekolah', { id: 'sch-1', nama: 'SDK A', cabangId: 'cbg-pusat' })
    const [, init] = fetch.mock.calls[1]
    const body = JSON.parse(init.body)
    expect(body.cabangId).toBe('cbg-pusat')
  })

  it('omits cabangId from siswa POST body for any role (server derives it)', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse(fakeAuth('superadmin', null)))
      .mockResolvedValueOnce(jsonResponse({ ok: true, id: 'sw-1', version: 1 }, 200))
    await login('root', 'pw')
    await writeRemote('siswa', { id: 'sw-1', nama: 'Andi', sekolahId: 'sch-1', cabangId: 'cbg-pusat' })
    const [, init] = fetch.mock.calls[1]
    const body = JSON.parse(init.body)
    expect(body).not.toHaveProperty('cabangId')
    expect(body.sekolahId).toBe('sch-1')
  })
})