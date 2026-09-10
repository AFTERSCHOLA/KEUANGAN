import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => {
  const store = new Map()
  return {
    get: vi.fn(async key => (store.has(key) ? store.get(key) : null)),
    set: vi.fn(async (key, value) => {
      store.set(key, value)
    }),
    del: vi.fn(async key => {
      store.delete(key)
    }),
    __store: store,
  }
})

import { del, get, set, __store as idbStore } from 'idb-keyval'
import { setCsrfToken, clearCsrfToken } from '../api.js'
import {
  SERVER_PHOTO_CACHE_PREFIX,
  deletePhotoEntry,
  fetchPhotoDataUrl,
  isServerPhotoEntry,
  loadPhotoDataUrl,
  resolvePhotoEntryKind,
  serverPhotoCacheKey,
  uploadPhotoToServer,
} from '../photoStorage.js'

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }
}

class StubFileReader {
  constructor() {
    this.result = null
    this.onload = null
    this.onerror = null
  }
  readAsDataURL(blob) {
    const mime = blob?.type || 'image/png'
    const text = typeof blob?.__stubText === 'string' ? blob.__stubText : 'stub-bytes'
    const base64 = Buffer.from(text, 'utf8').toString('base64')
    this.result = `data:${mime};base64,${base64}`
    queueMicrotask(() => this.onload?.())
  }
}

beforeEach(() => {
  idbStore.clear()
  vi.clearAllMocks()
  globalThis.fetch = vi.fn()
  globalThis.FileReader = StubFileReader
  clearCsrfToken()
  setCsrfToken('csrf-photo-test')
})

describe('RH.D.5 photo entry-shape resolution', () => {
  it('resolves empty/unknown shapes without I/O', () => {
    expect(resolvePhotoEntryKind(null)).toBe('empty')
    expect(resolvePhotoEntryKind(undefined)).toBe('empty')
    expect(resolvePhotoEntryKind('pht-1')).toBe('unknown')
    expect(resolvePhotoEntryKind([])).toBe('unknown')
    expect(resolvePhotoEntryKind({ type: 'weird' })).toBe('unknown')
    expect(resolvePhotoEntryKind({ type: 'idb', key: '' })).toBe('unknown')
    expect(resolvePhotoEntryKind({ type: 'server' })).toBe('unknown')
    expect(resolvePhotoEntryKind({ type: 'server', id: '' })).toBe('unknown')
  })

  it('resolves the three approved shapes', () => {
    expect(resolvePhotoEntryKind({ type: 'dataurl', data: 'data:x' })).toBe('dataurl')
    expect(resolvePhotoEntryKind({ type: 'idb', key: 'afterschola-photo-k' })).toBe('idb')
    expect(resolvePhotoEntryKind({ type: 'server', id: 'pht-abc' })).toBe('server')
  })

  it('isServerPhotoEntry is true only for a valid server entry', () => {
    expect(isServerPhotoEntry({ type: 'server', id: 'pht-abc' })).toBe(true)
    expect(isServerPhotoEntry({ type: 'server', id: '' })).toBe(false)
    expect(isServerPhotoEntry({ type: 'idb', key: 'k' })).toBe(false)
    expect(isServerPhotoEntry(null)).toBe(false)
  })

  it('serverPhotoCacheKey namespaces by the server photo id', () => {
    expect(serverPhotoCacheKey('pht-abc')).toBe(`${SERVER_PHOTO_CACHE_PREFIX}pht-abc`)
  })

  it('loadPhotoDataUrl returns null for empty/unknown without touching idb', async () => {
    await expect(loadPhotoDataUrl(null)).resolves.toBeNull()
    await expect(loadPhotoDataUrl({ type: 'weird' })).resolves.toBeNull()
    expect(get).not.toHaveBeenCalled()
  })

  it('loadPhotoDataUrl resolves a dataurl entry without I/O', async () => {
    await expect(loadPhotoDataUrl({ type: 'dataurl', data: 'data:image/jpeg;base64,xx' })).resolves.toBe(
      'data:image/jpeg;base64,xx',
    )
    expect(get).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('loadPhotoDataUrl serves a server entry from the idb cache without fetching', async () => {
    idbStore.set(serverPhotoCacheKey('pht-cached'), 'data:image/jpeg;base64,Y2FjaGVk')
    await expect(loadPhotoDataUrl({ type: 'server', id: 'pht-cached' })).resolves.toBe(
      'data:image/jpeg;base64,Y2FjaGVk',
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('fetchPhotoDataUrl warms the idb cache from the download endpoint', async () => {
    const blob = new Blob(['server-bytes'], { type: 'image/png' })
    blob.__stubText = 'server-bytes'
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, blob: async () => blob })
    const url = await fetchPhotoDataUrl('pht-fresh')
    expect(url).toMatch(/^data:image\/png;base64,/)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/photo-download.php?id=pht-fresh',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    expect(idbStore.get(serverPhotoCacheKey('pht-fresh'))).toBe(url)
  })

  it('uploadPhotoToServer posts FormData via apiRequest and warms the cache', async () => {
    const dataUrl = `data:image/jpeg;base64,${Buffer.from('upload-bytes', 'utf8').toString('base64')}`
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'pht-new' }, 201))
    const entry = await uploadPhotoToServer(dataUrl)
    expect(entry).toEqual({ type: 'server', id: 'pht-new' })
    const [path, options] = globalThis.fetch.mock.calls[0]
    expect(path).toBe('/api/photo-upload.php')
    expect(options.method).toBe('POST')
    expect(options.body instanceof FormData).toBe(true)
    expect(idbStore.get(serverPhotoCacheKey('pht-new'))).toBe(dataUrl)
  })

  it('deletePhotoEntry clears the server cache key without a server call', async () => {
    idbStore.set(serverPhotoCacheKey('pht-gone'), 'data:image/jpeg;base64,eA==')
    await deletePhotoEntry({ type: 'server', id: 'pht-gone' })
    expect(idbStore.has(serverPhotoCacheKey('pht-gone'))).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('deletePhotoEntry removes idb entries by key', async () => {
    idbStore.set('afterschola-photo-k1', 'data:image/jpeg;base64,eA==')
    await deletePhotoEntry({ type: 'idb', key: 'afterschola-photo-k1' })
    expect(idbStore.has('afterschola-photo-k1')).toBe(false)
  })
})
