import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setCsrfToken, clearCsrfToken } from '../api.js'
import { deleteRemote } from '../store.js'

// INV.1 (D-INV1) — the invoice-has-payments 422 is a business refusal, not
// a bug: deleteRemote surfaces it as {status:'guarded'} (same shape as
// 403/'forbidden') so InvoiceModal renders the pinned guard copy.
// Mirrors the fetch-mock idiom of store-write.test.js (taste #11).

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

describe('INV.1 deleteRemote invoice guard', () => {
  it('maps the invoice-has-payments 422 to guarded instead of throwing', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Invoice sudah memiliki pembayaran dan tidak dapat dihapus' }, 422))
    const result = await deleteRemote('invoices', 'inv-1')
    expect(result).toEqual({ status: 'guarded', message: 'Invoice sudah memiliki pembayaran dan tidak dapat dihapus' })
  })

  it('still throws other invoice 422s (e.g. unknown id)', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Invoice tidak ditemukan', id: 'inv-x' }, 422))
    await expect(deleteRemote('invoices', 'inv-x')).rejects.toMatchObject({ status: 422 })
  })

  it('still throws non-invoice 422s (scope guard)', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Record membutuhkan id' }, 422))
    await expect(deleteRemote('sekolah', 'sch-1')).rejects.toMatchObject({ status: 422 })
  })
})
