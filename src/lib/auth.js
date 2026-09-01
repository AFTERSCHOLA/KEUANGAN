import { apiRequest, clearCsrfToken, getCsrfToken, setCsrfToken, setUnauthorizedHandler } from './api.js'
import { normalizeRole } from './role.js'

export const SAFE_IDENTITY_FIELDS = [
  'id',
  'username',
  'displayName',
  'role',
  'cabangId',
  'trainerId',
  'active',
  'mustChangePassword',
]

let currentUser = null
const listeners = new Set()

function notify() {
  listeners.forEach(listener => listener(currentUser))
}

// M4.1 — dipanggil oleh api.js setiap ada 401 di tengah pemakaian app
// (bukan saat login gagal / bootstrap awal, keduanya sudah menandai
// requestnya dengan skipUnauthorizedHandler: true di bawah). Ini yang
// bikin sesi habis otomatis "kembali ke login" tanpa komponen manapun
// perlu tahu soal HTTP status.
function handleUnauthorized() {
  currentUser = null
  clearCsrfToken()
  notify()
}
setUnauthorizedHandler(handleUnauthorized)

export function isProductionAuthRequired() {
  return import.meta.env.PROD || import.meta.env.VITE_AUTH_MODE === 'production'
}

export function getCurrentUser() {
  return currentUser
}

// M-AUTH.3: a read-only accessor other modules (store, role context) can
// use to learn who the logged-in user is, WITHOUT re-reading localStorage
// (which the old role-picker flow used to claim role/cabang/trainer from
// without credentials). Returns the same allowlisted shape produced by
// normalizeSafeIdentity(), or null when there's no authenticated session.
export function getSafeIdentityContext() {
  return currentUser
}

export function subscribeAuth(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function normalizeSafeIdentity(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Identitas tidak valid')
  }
  for (const field of SAFE_IDENTITY_FIELDS) {
    if (raw[field] === undefined) {
      throw new Error(`Identitas tidak valid: ${field} hilang`)
    }
  }
  for (const key of Object.keys(raw)) {
    if (!SAFE_IDENTITY_FIELDS.includes(key)) {
      throw new Error(`Identitas tidak valid: kolom ${key} tidak diizinkan`)
    }
  }
  if (typeof raw.id !== 'string' || !raw.id.trim()) {
    throw new Error('Identitas tidak valid: id tidak valid')
  }
  if (typeof raw.username !== 'string' || !raw.username.trim()) {
    throw new Error('Identitas tidak valid: username tidak valid')
  }
  if (typeof raw.displayName !== 'string' || !raw.displayName.trim()) {
    throw new Error('Identitas tidak valid: displayName tidak valid')
  }
  if (normalizeRole(raw.role) === null) {
    throw new Error('Peran tidak valid')
  }
  if (typeof raw.active !== 'boolean') {
    throw new Error('Identitas tidak valid: active harus boolean')
  }
  if (typeof raw.mustChangePassword !== 'boolean') {
    throw new Error('Identitas tidak valid: mustChangePassword harus boolean')
  }
  return { ...raw, role: normalizeRole(raw.role) }
}

export async function bootstrapAuth() {
  if (!isProductionAuthRequired()) return null
  try {
    // skipUnauthorizedHandler: true — belum pernah login itu kondisi
    // normal saat bootstrap awal, bukan "sesi habis".
    const result = await apiRequest('/api/auth/me.php', { method: 'GET', skipCsrf: true, skipUnauthorizedHandler: true })
    currentUser = normalizeSafeIdentity(result.user)
    await getCsrfToken()
  } catch (error) {
    currentUser = null
    clearCsrfToken()
    // notify() di sini juga (bukan cuma di jalur sukses di bawah) —
    // kalau error BUKAN 401 (network mati, 500, dst) dan kita rethrow di
    // bawah, listener tetap harus tahu currentUser sudah direset SEBELUM
    // exception itu propagate ke pemanggil. Tanpa ini, UI bisa nyangkut
    // nampilin state lama padahal currentUser internal sudah null.
    notify()
    if (error.status !== 401) throw error
    return currentUser
  }
  notify()
  return currentUser
}

export async function login(username, password) {
  const result = await apiRequest('/api/auth/login.php', {
    method: 'POST',
    skipCsrf: true,
    // skipUnauthorizedHandler: true — 401 di sini berarti kredensial
    // salah (user memang sedang di form login), bukan sesi habis.
    skipUnauthorizedHandler: true,
    body: { username, password },
  })
  if (!result || typeof result !== 'object' || !result.user) {
    currentUser = null
    clearCsrfToken()
    notify()
    throw new Error('Identitas tidak valid')
  }
  currentUser = normalizeSafeIdentity(result.user)
  setCsrfToken(result.csrfToken)
  notify()
  return currentUser
}

export async function logout() {
  // M4.1 fix: bersihkan state lokal DULU, baru beritahu server.
  // Kalau request logout ke server gagal (network/sesi sudah habis
  // duluan), user tetap dianggap logout di client — tidak "keliatan
  // masih login" menunggu response yang mungkin tidak pernah datang.
  const hadUser = Boolean(currentUser)
  currentUser = null
  clearCsrfToken()
  notify()
  if (hadUser) {
    try {
      await apiRequest('/api/auth/logout.php', { method: 'POST', skipUnauthorizedHandler: true })
    } catch {
      // Best-effort — state lokal sudah bersih di atas.
    }
  }
}

export async function changePassword(currentPassword, newPassword) {
  const result = await apiRequest('/api/auth/change-password.php', {
    method: 'POST',
    body: { currentPassword, newPassword },
  })
  currentUser = normalizeSafeIdentity(result.user)
  setCsrfToken(result.csrfToken)
  notify()
  return currentUser
}