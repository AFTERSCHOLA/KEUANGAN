import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest, clearCsrfToken } from '../api.js'
import { getCurrentUser, login, normalizeSafeIdentity } from '../auth.js'

const identity = {
  id: 'usr-contract',
  username: 'contract@example.test',
  displayName: 'Contract Test',
  role: 'trainer',
  cabangId: 'cbg-contract',
  trainerId: 'trn-contract',
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

describe('G0.2 client identity contract', () => {
  it('accepts exactly the safe canonical identity shape', () => {
    expect(normalizeSafeIdentity(identity)).toEqual(identity)
    expect(Object.keys(normalizeSafeIdentity(identity)).sort()).toEqual([
      'active', 'cabangId', 'displayName', 'id', 'mustChangePassword', 'role', 'trainerId', 'username',
    ])
  })

  it('rejects legacy, unknown, and sensitive identity claims', () => {
    for (const role of ['admin', 'head-trainer', 'client', 'unknown']) {
      expect(() => normalizeSafeIdentity({ ...identity, role })).toThrow()
    }
    expect(() => normalizeSafeIdentity({ ...identity, password: 'secret' })).toThrow()
    expect(() => normalizeSafeIdentity({ ...identity, password_hash: 'secret' })).toThrow()
  })

  it('preserves auth status codes and same-origin credentials', async () => {
    for (const status of [401, 403, 409, 422]) {
      fetch.mockResolvedValueOnce(jsonResponse({ error: `status-${status}` }, status))
      await expect(apiRequest('/api/contract')).rejects.toMatchObject({ name: 'ApiError', status })
    }
    const request = fetch.mock.calls[0][1]
    expect(request.credentials).toBe('same-origin')
    expect(request.headers.get('Accept')).toBe('application/json')
    expect(new ApiError('error', 409, {}).status).toBe(409)
  })

  it('keeps authenticated identity and CSRF state out of localStorage', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ user: identity, csrfToken: 'csrf-contract' }))
    await login('contract@example.test', 'not-stored')
    expect(getCurrentUser()).toEqual(identity)
    expect(localStorage.length).toBe(0)
  })

  it('tightens login() against a malformed success body', async () => {
    fetch.mockResolvedValueOnce(jsonResponse(null))
    await expect(login('contract@example.test', 'not-stored')).rejects.toThrow('Identitas tidak valid')
    expect(getCurrentUser()).toBeNull()

    fetch.mockResolvedValueOnce(jsonResponse({ csrfToken: 'csrf-no-user' }))
    await expect(login('contract@example.test', 'not-stored')).rejects.toThrow('Identitas tidak valid')
    expect(getCurrentUser()).toBeNull()
  })
})
