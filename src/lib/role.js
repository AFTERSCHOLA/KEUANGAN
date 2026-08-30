import { getSafeIdentityContext } from './auth.js'

const ROLE_KEY = 'afterschola_v4_role'
export const CANONICAL_ROLES = ['superadmin', 'admin_cabang', 'trainer']

export function normalizeRole(role) {
  return CANONICAL_ROLES.includes(role) ? role : null
}

// M-AUTH.3: role is now server-derived. localStorage is no longer a
// trust source for identity. The kept ROLE_KEY/UI_STATE_KEY references
// below are vestigial — they're not read by anything that matters, but
// keeping the helpers around means existing imports stay valid while
// we route everyone to the safe identity path.
export function getRole() {
  const identity = getSafeIdentityContext()
  return identity?.active ? normalizeRole(identity.role) : null
}

export function setRole(role) {
  // M-AUTH.3: writing role to localStorage is no longer supported. The
  // server is the only authority. This throws on purpose so any caller
  // still trying to set a role client-side fails loudly instead of
  // silently re-introducing the soft-picker flow.
  throw new Error('Peran tidak dapat diatur dari klien lagi. Masuk dengan kredensial.')
}

export function canVerify(role) {
  return role === 'admin_cabang' || role === 'superadmin'
}
