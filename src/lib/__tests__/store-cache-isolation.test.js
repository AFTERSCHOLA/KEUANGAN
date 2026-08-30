import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// M-AUTH.3: anonymous readers/writers must not be able to pull from or
// write into the protected local cache. We re-import the store fresh
// per scenario so the auth context (an in-memory `currentUser` in
// src/lib/auth.js) can be set without leakage between cases.
const authModulePath = '../auth.js'
const storeModulePath = '../store.js'

function setIdentity(identity) {
  // Replace the auth module's exported functions with a stub so the
  // store sees whatever identity we want for this case. The store
  // imports `getSafeIdentityContext` by binding, so vi.mock() on the
  // module is the only way to swap that binding per test.
  vi.doMock(authModulePath, () => ({
    getSafeIdentityContext: () => identity,
  }))
}

async function freshStore() {
  // Reset module registry so the new doMock takes effect.
  vi.resetModules()
  return import(storeModulePath)
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
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {} }
  globalThis.fetch = vi.fn()
  vi.doUnmock(authModulePath)
})

afterEach(() => {
  vi.doUnmock(authModulePath)
  vi.resetModules()
})

describe('M-AUTH.3 cache isolation for anonymous callers', () => {
  it('readCached returns [] for every protected entity when no identity is set', async () => {
    // Pre-seed localStorage with records that would previously have been
    // returned to the caller regardless of authentication.
    localStorage.setItem('afterschola_v4_sekolah', JSON.stringify([{ id: 'skl-1', nama: 'SD Test', cabangId: 'cbg-1' }]))
    localStorage.setItem('afterschola_v4_siswa', JSON.stringify([{ id: 'sw-1', nama: 'Andi', sekolahId: 'skl-1' }]))
    localStorage.setItem('afterschola_v4_absensi', JSON.stringify([{ id: 'abs-1', sekolahId: 'skl-1', trainerId: 'trn-1' }]))

    setIdentity(null)
    const store = await freshStore()

    expect(store.readCached('sekolah')).toEqual([])
    expect(store.readCached('siswa')).toEqual([])
    expect(store.readCached('absensi')).toEqual([])
    expect(store.readCached('trainer')).toEqual([])
    expect(store.readCached('cabang')).toEqual([])
  })

  it('upsert is a no-op when no identity is set, even with a valid record', async () => {
    setIdentity(null)
    const store = await freshStore()

    store.upsert('sekolah', { id: 'skl-anon', nama: 'Anon', cabangId: 'cbg-1' })

    expect(store.readRaw('sekolah')).toEqual([])
  })

  it('write is a no-op when no identity is set', async () => {
    setIdentity(null)
    const store = await freshStore()

    store.write('siswa', [{ id: 'sw-anon', nama: 'Anon', sekolahId: 'skl-1' }])

    expect(store.readRaw('siswa')).toEqual([])
  })

  it('getRoleContext() returns null role for any non-canonical identity', async () => {
    setIdentity({ id: 'usr-x', role: 'admin', cabangId: null, trainerId: null, active: true, mustChangePassword: false })
    const store = await freshStore()
    expect(store.getRoleContext()).toEqual({ role: null, trainerId: null, cabangId: null })
  })

  it('superadmin identity unlocks the cache, admin_cabang remains branch-scoped', async () => {
    localStorage.setItem('afterschola_v4_sekolah', JSON.stringify([
      { id: 'skl-1', nama: 'Cabang A', cabangId: 'cbg-A' },
      { id: 'skl-2', nama: 'Cabang B', cabangId: 'cbg-B' },
    ]))

    setIdentity({ id: 'usr-cabang', role: 'admin_cabang', cabangId: 'cbg-A', trainerId: null, active: true, mustChangePassword: false })
    const storeCabang = await freshStore()
    expect(storeCabang.readCached('sekolah').map(s => s.id)).toEqual(['skl-1'])

    setIdentity({ id: 'usr-pusat', role: 'superadmin', cabangId: null, trainerId: null, active: true, mustChangePassword: false })
    const storePusat = await freshStore()
    expect(storePusat.readCached('sekolah').map(s => s.id).sort()).toEqual(['skl-1', 'skl-2'])
  })
})
