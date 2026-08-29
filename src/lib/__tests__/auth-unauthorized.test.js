import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCsrfToken } from '../api.js'
import { getCurrentUser, login } from '../auth.js'

const identity = {
  id: 'usr-expiry',
  username: 'expiry@example.test',
  displayName: 'Expiry Test',
  role: 'admin_cabang',
  cabangId: 'cbg-expiry',
  trainerId: null,
  active: true,
  mustChangePassword: false,
}

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
})

describe('M4.1 session expiry returns to login', () => {
  it('clears the current user when any later request gets a 401', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ user: identity, csrfToken: 'csrf-expiry' }))
    await login('expiry@example.test', 'whatever')
    expect(getCurrentUser()).toEqual(identity)

    const { apiRequest } = await import('../api.js')
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Sesi berakhir' }, 401))
    await expect(apiRequest('/api/sekolah.php')).rejects.toMatchObject({ status: 401 })

    expect(getCurrentUser()).toBeNull()
  })
})
