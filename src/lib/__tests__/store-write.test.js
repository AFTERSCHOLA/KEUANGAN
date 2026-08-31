import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setCsrfToken, clearCsrfToken } from '../api.js'
import { writeRemote } from '../store.js'

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }
}

beforeEach(() => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
  globalThis.fetch = vi.fn()
  clearCsrfToken()
  setCsrfToken('test-csrf')
})

describe('M4.1 writeRemote', () => {
  it('returns ok with the bumped version on success', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'trn-1', version: 2 }, 200))
    const result = await writeRemote('trainer', { id: 'trn-1', version: 1, nama: 'Budi' })
    // USER_PROVISIONING.md D4 — callers may read response-only fields like
    // initialPassword from result.body, so writeRemote surfaces the full
    // server body alongside the structured status/id/version.
    expect(result.status).toBe('ok')
    expect(result.id).toBe('trn-1')
    expect(result.version).toBe(2)
    expect(result.body).toEqual({ ok: true, id: 'trn-1', version: 2 })
  })

  it('stays conflicted on 409 instead of throwing or overwriting', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      error: 'Konflik versi — record sudah diubah pihak lain',
      currentVersion: 3,
      current: { id: 'trn-1', nama: 'Sudah diubah orang lain' },
    }, 409))
    const result = await writeRemote('trainer', { id: 'trn-1', version: 1, nama: 'Budi' })
    expect(result.status).toBe('conflict')
    expect(result.currentVersion).toBe(3)
    expect(result.current).toEqual({ id: 'trn-1', nama: 'Sudah diubah orang lain' })
  })

  it('reports forbidden on 403 instead of throwing', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Akses tidak diizinkan' }, 403))
    const result = await writeRemote('trainer', { id: 'trn-1', version: 1 })
    expect(result).toEqual({ status: 'forbidden', message: 'Akses tidak diizinkan' })
  })

  it('still throws for unexpected server errors', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Server error' }, 500))
    await expect(writeRemote('trainer', { id: 'trn-1', version: 1 })).rejects.toMatchObject({ status: 500 })
  })

  it('rejects entities without a registered write endpoint', async () => {
    await expect(writeRemote('unknownEntity', { id: 'x' })).rejects.toThrow(/endpoint/)
  })
})
