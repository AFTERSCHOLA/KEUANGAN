import { apiRequest } from './api.js'
import { isAssignmentActiveOnDate } from './penugasan.js'

// SF.2 (D2/R1/R2) — client fetch for the trainer-only myPenugasan lane
// (server/api/myPenugasan.php). Returns the caller's own assignment rows
// [{ sekolahId, periodeMulai, periodeSelesai, aktif, peran }] for
// in-memory per-session use — never written to the afterschola_v4_*
// localStorage trainer key (D2, to avoid widening the cached PII surface).
// Empty array on 401 (anonymous)/403 (admin lane, per plan §4) or on a
// malformed (non-array) body; other failures rethrow.
export async function fetchMyPenugasan() {
  let body
  try {
    body = await apiRequest('/api/myPenugasan.php', { method: 'GET' })
  } catch (error) {
    const status = error && typeof error === 'object' ? error.status : undefined
    if (status === 401 || status === 403) return []
    throw error
  }
  return Array.isArray(body) ? body : []
}

// SF.2 (R2) — date predicate over myPenugasan rows. Reuses
// isAssignmentActiveOnDate per row (no fork): aktif must be true and
// tanggal must fall inside periodeMulai..periodeSelesai verbatim, with
// null or empty-string periodeSelesai staying open-ended (SF.1).
// Returns the distinct sekolahId list visible on tanggal, in row order.
export function visibleSekolahOnDate(rows, tanggal) {
  if (!Array.isArray(rows)) return []
  const out = []
  const seen = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    if (typeof row.sekolahId !== 'string' || row.sekolahId === '') continue
    if (!isAssignmentActiveOnDate(row, tanggal)) continue
    if (seen.has(row.sekolahId)) continue
    seen.add(row.sekolahId)
    out.push(row.sekolahId)
  }
  return out
}
