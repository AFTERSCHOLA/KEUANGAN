const ROLE_KEY = 'afterschola_v4_role'
const UI_STATE_KEY = 'afterschola_v4_ui'

export function getRole() {
  try {
    const ui = JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}')
    if (ui.role) return ui.role
  } catch {
  }
  return localStorage.getItem(ROLE_KEY) || 'admin'
}

export function setRole(role) {
  localStorage.setItem(ROLE_KEY, role)
}

export function canVerify(role) {
  return role === 'admin' || role === 'head-trainer' || role === 'superadmin'
}
