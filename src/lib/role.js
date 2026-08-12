const ROLE_KEY = 'afterschola_v4_role'

/**
 * Stub role — TIDAK ADA auth beneran (D5: no auth work now). Cuma dipakai
 * buat gating tampilan tombol verify/edit/delete di UI. Ganti ke sistem
 * auth beneran nanti pas fase Hostinger+login.
 */
export function getRole() {
  return localStorage.getItem(ROLE_KEY) || 'admin' // 'admin' | 'head-trainer' | 'trainer'
}

export function setRole(role) {
  localStorage.setItem(ROLE_KEY, role)
}

export function canVerify(role) {
  return role === 'admin' || role === 'head-trainer'
}