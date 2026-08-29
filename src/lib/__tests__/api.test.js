import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, clearCsrfToken, setUnauthorizedHandler } from '../api.js'

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
  clearCsrfToken()
  setUnauthorizedHandler(null)
})

describe('M4.1 unauthorized handler', () => {
  it('invokes the handler on a bare 401', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
    await expect(apiRequest('/api/protected')).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not invoke the handler when skipUnauthorizedHandler is set', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'bad credentials' }, 401))
    await expect(
      apiRequest('/api/auth/login.php', { skipCsrf: true, skipUnauthorizedHandler: true })
    ).rejects.toMatchObject({ status: 401 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not invoke the handler on 403 (that is a feedback case, not expiry)', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403))
    await expect(apiRequest('/api/protected')).rejects.toMatchObject({ status: 403 })
    expect(handler).not.toHaveBeenCalled()
  })
})
