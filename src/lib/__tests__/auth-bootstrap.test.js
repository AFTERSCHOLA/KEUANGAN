import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCsrfToken } from '../api.js'
import { bootstrapAuth, getCurrentUser } from '../auth.js'

const identity = {
  id: 'usr-bootstrap',
  username: 'bootstrap@example.test',
  displayName: 'Bootstrap Test',
  role: 'admin_cabang',
  cabangId: 'cbg-bootstrap',
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
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }

  globalThis.fetch = vi.fn()
  clearCsrfToken()
})

describe('M4.1 auth bootstrap', () => {
  it('restores the authenticated identity and fetches a fresh CSRF token', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ user: identity }))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'csrf-bootstrap' }))

    const user = await bootstrapAuth()

    expect(user).toEqual(identity)
    expect(getCurrentUser()).toEqual(identity)

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/auth/me.php',
      expect.objectContaining({
        method: 'GET',
        skipCsrf: true,
        skipUnauthorizedHandler: true,
        credentials: 'same-origin',
      }),
    )

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/auth/csrf.php',
      expect.objectContaining({
        method: 'GET',
        skipCsrf: true,
      }),
    )
  })

  it('treats an unauthenticated 401 during bootstrap as logged out', async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({ error: 'Sesi tidak ditemukan' }, 401),
    )

    await expect(bootstrapAuth()).resolves.toBeNull()
    expect(getCurrentUser()).toBeNull()

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not invoke the global unauthorized handler during bootstrap 401', async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({ error: 'Sesi tidak ditemukan' }, 401),
    )

    await bootstrapAuth()

    expect(getCurrentUser()).toBeNull()
  })
})