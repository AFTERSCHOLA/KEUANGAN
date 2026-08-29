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

// Central 401 handling (api.js interceptor) — any apiRequest() call that
// hits a 401 anywhere in the app, not just bootstrapAuth's own initial
// check, resets auth state the same way. Registered once at module load.
setUnauthorizedHandler(() => {
  currentUser = null
  clearCsrfToken()
  notify()
})

export function isProductionAuthRequired() {
  return import.meta.env.PROD || import.meta.env.VITE_AUTH_MODE === 'production'
}

export function getCurrentUser() {
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
    // skipUnauthorizedHandler: this IS the "am I logged in" check itself —
    // a 401 here is the expected "not logged in yet" case, already handled
    // right below. Without this flag, the global interceptor would also
    // fire and call notify() a second time for the same state change.
    const result = await apiRequest('/api/auth/me.php', { method: 'GET', skipCsrf: true, skipUnauthorizedHandler: true })
    currentUser = normalizeSafeIdentity(result.user)
    await getCsrfToken()
  } catch (error) {
    currentUser = null
    clearCsrfToken()
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
    body: { username, password },
  })
  currentUser = normalizeSafeIdentity(result.user)
  setCsrfToken(result.csrfToken)
  notify()
  return currentUser
}

export async function logout() {
  const hadUser = currentUser !== null
  // Clear local state regardless of whether the server call below
  // succeeds — logout is a client-side intent the UI should always honor
  // immediately. A failed request (network down, server unreachable)
  // shouldn't leave the user stuck looking "logged in" after they asked
  // to log out; the server session will still expire on its own via
  // idle/absolute timeout even if this particular request never lands.
  currentUser = null
  clearCsrfToken()
  notify()
  if (hadUser) {
    try {
      await apiRequest('/api/auth/logout.php', { method: 'POST', skipUnauthorizedHandler: true })
    } catch (error) {
      // Already logged out client-side above; nothing further to roll
      // back. Surface the failure for callers that want to show a toast
      // ("logged out locally, but couldn't reach the server") without
      // blocking the logout itself.
      throw error
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