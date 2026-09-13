import { del, get, set } from 'idb-keyval'
import { apiRequest } from './api.js'

export const PHOTO_MAX_BYTES = 500 * 1024
const DB_KEY_PREFIX = 'afterschola-photo-'
const LOCALSTORAGE_WARN_BYTES = 4 * 1024 * 1024

// RH.D.5 — server tier (F-RH5, PRODUCTION_PLAN §8). Entries shaped
// {type:'server', id} point at a photo_uploads row; the bytes are cached
// in idb under SERVER_PHOTO_CACHE_PREFIX + id so repeat renders stay
// offline-capable. Offline/anonymous captures stay {type:'idb'} (photo
// outbox deferred, RELEASE_HYGIENE_PLAN §13).
export const SERVER_PHOTO_CACHE_PREFIX = 'afterschola-photo-server-'

export function serverPhotoCacheKey(id) {
  return `${SERVER_PHOTO_CACHE_PREFIX}${id}`
}

// Pure entry-shape resolution (unit-tested): no I/O, so vitest can pin
// the contract without idb/fetch. 'empty' covers null/undefined;
// 'unknown' covers malformed shapes the loaders must refuse.
export function resolvePhotoEntryKind(entry) {
  if (!entry) return 'empty'
  if (typeof entry !== 'object' || Array.isArray(entry)) return 'unknown'
  if (entry.type === 'dataurl') return 'dataurl'
  if (entry.type === 'idb') return (typeof entry.key === 'string' && entry.key !== '') ? 'idb' : 'unknown'
  if (entry.type === 'server') return (typeof entry.id === 'string' && entry.id !== '') ? 'server' : 'unknown'
  return 'unknown'
}

export function isServerPhotoEntry(entry) {
  return resolvePhotoEntryKind(entry) === 'server'
}

function dataUrlToUploadFile(dataUrl) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('Foto tidak valid')
  const header = dataUrl.slice(0, comma)
  const base64 = dataUrl.slice(comma + 1)
  const mimeMatch = header.match(/^data:([^;,]+)?(;base64)?$/)
  const mime = ((mimeMatch && mimeMatch[1]) || 'image/jpeg').toLowerCase()
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  let binary = ''
  try {
    binary = atob(base64)
  } catch {
    throw new Error('Foto tidak valid')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { blob: new Blob([bytes], { type: mime }), filename: `photo.${extension}` }
}

// Uploads an already-compressed dataUrl to the server tier via the
// existing apiRequest (FormData passes through without a JSON envelope;
// CSRF handled by api.js). Warms the idb cache on success so the entry
// renders instantly on this device too. Throws on offline/401/403/422 —
// callers fall back to the idb-only entry.
export async function uploadPhotoToServer(dataUrl, { cabangId } = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) throw new Error('Foto tidak valid')
  const { blob, filename } = dataUrlToUploadFile(dataUrl)
  const form = new FormData()
  form.append('photo', blob, filename)
  // Server authority: admin_cabang/trainer must NOT send cabangId (422);
  // superadmin must send it — PhotoSlot never supplies it (no API change),
  // so superadmin uploads stay idb-only by falling back on the 422 below.
  if (typeof cabangId === 'string' && cabangId.trim() !== '') form.append('cabangId', cabangId.trim())
  const body = await apiRequest('/api/photo-upload.php', { method: 'POST', body: form })
  const id = body?.id
  if (typeof id !== 'string' || id === '') throw new Error('Gagal menyimpan foto ke server')
  const entry = { type: 'server', id }
  try {
    await set(serverPhotoCacheKey(id), dataUrl)
  } catch {
    // Cache warming is best-effort; the server row is authoritative.
  }
  return entry
}

// LP.B.3 — global-logo upload (F-LP1, F-LP2; D-LP2, D-LP4; R-LP4, taste #11).
// Same FormData-through-apiRequest shape as uploadPhotoToServer, but posts
// to the cabang-less logo-upload.php so a superadmin session (which has no
// branch context) can persist the global logo. The logo endpoint accepts
// the `photo` field as an alias, so the FormData shape stays byte-identical
// to the branch-photo path. Warms the idb cache on success. Throws on
// offline/401/403/422 — callers fall back to the idb-only entry silently
// (R-LP5 boundary).
export async function uploadLogoToServer(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) throw new Error('Foto tidak valid')
  const { blob, filename } = dataUrlToUploadFile(dataUrl)
  const form = new FormData()
  form.append('photo', blob, filename)
  const body = await apiRequest('/api/logo-upload.php', { method: 'POST', body: form })
  const id = body?.id
  if (typeof id !== 'string' || id === '') throw new Error('Gagal menyimpan logo ke server')
  const entry = { type: 'server', id }
  try {
    await set(serverPhotoCacheKey(id), dataUrl)
  } catch {
    // Cache warming is best-effort; the server row is authoritative.
  }
  return entry
}

// LP.B.3 — current-logo reference fetcher (F-LP3; D-LP2, D-LP4).
// GET with cookie-session auth only (no CSRF — same as read.php and
// photo-download.php). Any authenticated role may read the current id;
// the full settings payload stays superadmin-only (D-LP3). Throws on
// offline/401/404-no-logo — callers treat that as "no portable logo".
export async function fetchLogoCurrent() {
  const body = await apiRequest('/api/logo-current.php', { method: 'GET' })
  const id = body?.id
  if (typeof id !== 'string' || id === '') throw new Error('Logo belum diunggah')
  return { id, updatedAt: body?.updatedAt ?? null }
}

// Fetches the authoritative bytes for a server photo id through the
// scope-checked download endpoint (GET, cookie session — same as
// backup-download/read.php, no CSRF). Warms the idb cache on success.
export async function fetchPhotoDataUrl(id) {
  if (typeof id !== 'string' || id.trim() === '') throw new Error('ID foto tidak valid')
  const cleanId = id.trim()
  const response = await fetch(`/api/photo-download.php?id=${encodeURIComponent(cleanId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'image/*,*/*' },
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sesi habis, silakan login kembali')
    if (response.status === 403) throw new Error('Akses foto ditolak')
    if (response.status === 404) throw new Error('Foto tidak ditemukan')
    throw new Error(`Gagal memuat foto (${response.status})`)
  }
  const blob = await response.blob()
  if (!blob || blob.size === 0) throw new Error('Foto tidak valid')
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal memuat foto'))
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) throw new Error('Foto tidak valid')
  try {
    await set(serverPhotoCacheKey(cleanId), dataUrl)
  } catch {
    // Cache warming is best-effort.
  }
  return dataUrl
}

// LP.B.3 — logo-bytes fetcher (F-LP3; D-LP2, D-LP4; taste #11).
// Verbatim mirror of fetchPhotoDataUrl except the endpoint: the logo is
// branding (not minor PII), so any authenticated role may stream it via
// logo-download.php while branch photos stay scope-checked (D-RH9).
// Warms the idb cache on success under the same serverPhotoCacheKey.
export async function fetchLogoDataUrl(id) {
  if (typeof id !== 'string' || id.trim() === '') throw new Error('ID logo tidak valid')
  const cleanId = id.trim()
  const response = await fetch(`/api/logo-download.php?id=${encodeURIComponent(cleanId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'image/*,*/*' },
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sesi habis, silakan login kembali')
    if (response.status === 403) throw new Error('Akses logo ditolak')
    if (response.status === 404) throw new Error('Logo tidak ditemukan')
    throw new Error(`Gagal memuat logo (${response.status})`)
  }
  const blob = await response.blob()
  if (!blob || blob.size === 0) throw new Error('Logo tidak valid')
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal memuat logo'))
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) throw new Error('Logo tidak valid')
  try {
    await set(serverPhotoCacheKey(cleanId), dataUrl)
  } catch {
    // Cache warming is best-effort.
  }
  return dataUrl
}

export function dataUrlSizeBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || ''
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
}

function imageDataUrl(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Gagal memuat gambar'))
      img.onload = () => {
        let { width, height } = img
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width))
            width = maxDimension
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height))
            height = maxDimension
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('Browser tidak mendukung pemrosesan gambar'))
          return
        }
        context.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export async function compressImage(file, { maxBytes = PHOTO_MAX_BYTES } = {}) {
  let maxDimension = 1600
  let quality = 0.8
  let result = ''
  for (let attempt = 0; attempt < 8; attempt++) {
    result = await imageDataUrl(file, maxDimension, quality)
    if (dataUrlSizeBytes(result) <= maxBytes) return result
    if (quality > 0.4) quality -= 0.1
    else maxDimension = Math.max(320, Math.round(maxDimension * 0.75))
  }
  if (dataUrlSizeBytes(result) > maxBytes) throw new Error('Foto terlalu besar setelah kompresi')
  return result
}

export async function storePhoto(dataUrl, keyPrefix) {
  const size = dataUrlSizeBytes(dataUrl)
  if (size > PHOTO_MAX_BYTES) throw new Error('Foto melebihi batas 500 KB')
  const key = `${DB_KEY_PREFIX}${keyPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await set(key, dataUrl)
  return { type: 'idb', key, size }
}

export async function loadPhotoDataUrl(entry) {
  if (!entry) return null
  if (entry.type === 'dataurl') return entry.data || null
  if (entry.type === 'idb') return (await get(entry.key)) || null
  if (entry.type === 'server') {
    if (typeof entry.id !== 'string' || entry.id === '') return null
    const cacheKey = serverPhotoCacheKey(entry.id)
    try {
      const cached = await get(cacheKey)
      if (typeof cached === 'string' && cached.startsWith('data:')) return cached
    } catch {
      // Cache read failure falls through to the network fetch below.
    }
    // LP.B.3 — the logo tier shares the {type:'server', id} shape (D-LP4).
    // Global-logo ids (lgo-…, see logo-upload.php) resolve through
    // logo-download.php; branch-photo ids (pht-…) keep the scope-checked
    // photo-download.php path untouched (R-LP4).
    const fetchServerBytes = entry.id.startsWith('lgo-') ? fetchLogoDataUrl : fetchPhotoDataUrl
    try {
      return await fetchServerBytes(entry.id)
    } catch {
      try {
        const cached = await get(cacheKey)
        if (typeof cached === 'string' && cached.startsWith('data:')) return cached
      } catch {
        // Offline with no cache — no bytes to render.
      }
      return null
    }
  }
  return null
}

export async function deletePhotoEntry(entry) {
  if (!entry) return
  if (entry?.type === 'idb' && typeof entry.key === 'string' && entry.key !== '') {
    await del(entry.key)
    return
  }
  // Server rows have no delete endpoint — clearing the local idb cache is
  // the full client-side removal (the server row stays as branch evidence).
  if (entry?.type === 'server' && typeof entry.id === 'string' && entry.id !== '') {
    try {
      await del(serverPhotoCacheKey(entry.id))
    } catch {
      // Best-effort cache clear.
    }
  }
}

export function localStorageUsageBytes() {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('afterschola_v4')) total += key.length + (localStorage.getItem(key) || '').length
  }
  return total
}

export const LOCALSTORAGE_WARN_THRESHOLD = LOCALSTORAGE_WARN_BYTES
