import { apiRequest, clearCsrfToken, getCsrfToken, setCsrfToken } from './api.js'
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
    const result = await apiRequest('/api/auth/me.php', { method: 'GET', skipCsrf: true })
    currentUser = normalizeSafeIdentity(result.user)
    await getCsrfToken()
  } catch (error) {
    currentUser = null
    clearCsrfToken()
    if (error.status !== 401) throw error
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
  if (currentUser) await apiRequest('/api/auth/logout.php', { method: 'POST' })
  currentUser = null
  clearCsrfToken()
  notify()
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
