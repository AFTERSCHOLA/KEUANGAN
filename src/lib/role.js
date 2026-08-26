const ROLE_KEY = 'afterschola_v4_role'
const UI_STATE_KEY = 'afterschola_v4_ui'
export const CANONICAL_ROLES = ['superadmin', 'admin_cabang', 'trainer']

export function normalizeRole(role) {
  return CANONICAL_ROLES.includes(role) ? role : null
}

export function getRole() {
  try {
    const ui = JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}')
    return normalizeRole(ui.role)
  } catch {
    return null
  }
}

export function setRole(role) {
  const normalized = normalizeRole(role)
  if (!normalized) throw new Error('Peran tidak valid')
  localStorage.setItem(ROLE_KEY, normalized)
}

export function canVerify(role) {
  return role === 'admin_cabang' || role === 'superadmin'
}
