import { describe, expect, it } from 'vitest'
import { CANONICAL_ROLES, normalizeRole } from '../role.js'

// G0.2 identity contract (client boundary): only canonical server roles are
// valid; every legacy/unknown role claim must be rejected, never coerced into
// an authorization fallback. See PRODUCTION_PLAN.md §3.
describe('G0.2 role normalization contract', () => {
  const LEGACY_ROLES = ['admin', 'head-trainer', 'client', 'head_trainer', 'Admin', 'ADMIN_CABANG', 'super-admin']

  it('accepts exactly the three canonical roles', () => {
    expect(CANONICAL_ROLES).toEqual(['superadmin', 'admin_cabang', 'trainer'])
    for (const role of CANONICAL_ROLES) expect(normalizeRole(role)).toBe(role)
  })

  it('rejects legacy and unknown role claims', () => {
    for (const role of LEGACY_ROLES) expect(normalizeRole(role)).toBeNull()
  })

  it('rejects non-string and empty claims', () => {
    for (const claim of [null, undefined, 1, true, {}, [], '', '   ']) {
      expect(normalizeRole(claim)).toBeNull()
    }
  })
})
