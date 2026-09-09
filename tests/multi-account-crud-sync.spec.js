import {
  test, expect, loginViaApi, TEST_USERS,
  primeCsrf, loginAndPrime, logout, readEntity,
  createBranch, deleteBranch, createSekolahSuperadmin, deleteSekolah, createTrainerSuperadmin,
} from './fixtures.js'

// ============================================================
// MULTI_ACCOUNT_SYNC M-MAS4.1 — multi-role CRUD sync E2E
//
// Proves: every CRUD write the client makes reaches the database via
// writeRemote()/deleteRemote(), the server echoes it back on the next
// read, and branch isolation is enforced by the server's role-scoped
// SQL read filter. Exercises the new prepareWritePayload sanitization
// (sekolah/trainer/users strip cabangId for admin_cabang) plus the
// migrated cabang create/update/delete paths.
//
// Design note (taste #61): server-side authorization/validation is the
// authoritative contract for branch isolation. Rather than spin up two
// freshly-created admin_cabang sessions (which would force the spec
// to thread the server-minted initialPassword through re-login), we
// drive the writes through the superadmin session and probe the
// server-side filter by reading /api/read.php with the seeded
// admin.cabang@test.local session (branch cbg-test-pusat). That
// admin's read scope is fixed; whatever they can or cannot see defines
// the contract for every admin_cabang in the system.
//
// Prerequisites:
//   - PHP dev server running on http://127.0.0.1:8000 with server/
//     as the document root.
//   - MySQL seeded per the m1-scope-shell-navigation.spec.js seed
//     script (superadmin@test.local + admin.cabang@test.local +
//     trainer@test.local).
//
// Cleanup: test branches are namespaced with "Sim-" / "Simulasi-" and
// deleted at the end via the new deleteRemote('cabang', id) path
// (M-MAS2.2). Any leftover test sekolah/trainer/siswa in those
// branches remain in the DB for manual review — they are intentionally
// not deleted by the spec to keep the delete cascade out of scope
// (taste #13).
// ============================================================

const APP = 'http://localhost:5173'
const PREFIX_A = 'SIMA'
const PREFIX_B = 'SIMB'
const SUFFIX = String(Date.now()).slice(-6)

// API helpers (primeCsrf, loginAndPrime, logout, readEntity, createBranch,
// deleteBranch, createSekolahSuperadmin, deleteSekolah, createTrainerSuperadmin)
// are imported from ./fixtures.js — see PM.0.1.

test.describe('MULTI_ACCOUNT_SYNC M-MAS4.1 — multi-role CRUD sync', () => {
  test('CRUD writes feed back across sessions and branch isolation holds on re-read', async ({ page, pageErrors }) => {
    const branchACode = `${PREFIX_A}${SUFFIX}`
    const branchBCode = `${PREFIX_B}${SUFFIX}`

    let branchAId = null
    let branchBId = null
    let schAId = null
    let schBId = null

    try {
      // ---- Phase 1: superadmin creates two branches + a sekolah in each. ----
      let csrf = await loginAndPrime(page, 'superadmin')

      const aBranch = await createBranch(page, csrf, branchACode, `Cabang Simulasi A ${SUFFIX}`, SUFFIX)
      branchAId = aBranch.id
      const bBranch = await createBranch(page, csrf, branchBCode, `Cabang Simulasi B ${SUFFIX}`, SUFFIX)
      branchBId = bBranch.id

      const schA = await createSekolahSuperadmin(page, csrf, `Sekolah Simulasi A ${SUFFIX}`, 150000, branchAId, SUFFIX)
      schAId = schA.id
      const schB = await createSekolahSuperadmin(page, csrf, `Sekolah Simulasi B ${SUFFIX}`, 150000, branchBId, SUFFIX)
      schBId = schB.id

      // ---- Phase 2: superadmin re-reads sekolah — both must be visible. ----
      const sekolahAsRoot = await readEntity(page, 'sekolah', csrf)
      expect(sekolahAsRoot.find(s => s.id === schAId)).toBeDefined()
      expect(sekolahAsRoot.find(s => s.id === schBId)).toBeDefined()

      // ---- Phase 3: superadmin creates a trainer-with-account bound to branch A.
      // prepareWritePayload lets superadmin send cabangId through unchanged. ----
      const trainerAResp = await createTrainerSuperadmin(
        page,
        csrf,
        `trainer.sim.a.${SUFFIX}`,
        `Trainer Sim A ${SUFFIX}`,
        `Trainer Simulasi A ${SUFFIX}`,
        branchAId,
        [schAId],
      )
      const trainerAId = trainerAResp.trainer.id

      // ---- Phase 3b (HY.1.1): inverse write landed.
      // The sekolah's payload.trainerIds must include trainerAId after the
      // createTrainerSuperadmin call. If this fails, the call site's
      // sekolahIds did not match what the server minted — see the JSDoc on
      // createTrainerSuperadmin in tests/fixtures.js.
      const sekolahAfterInverse = await readEntity(page, 'sekolah', csrf)
      const schAAfter = sekolahAfterInverse.find(s => s.id === schAId)
      expect(schAAfter).toBeDefined()
      expect(schAAfter.trainerIds || []).toContain(trainerAId)

      // ---- Phase 4: trainer record is visible on the next read. ----
      const trainerAsRoot = await readEntity(page, 'trainer', csrf)
      expect(trainerAsRoot.find(t => t.id === trainerAId)).toBeDefined()
      expect(trainerAsRoot.find(t => t.id === trainerAId).cabangId).toBe(branchAId)

      await logout(page)
      await page.context().clearCookies()

      // ---- Phase 5: admin.cabang@test.local re-reads — branch isolation.
      // The seeded admin is bound to cbg-test-pusat (their own branch).
      // The two Sim-* branches must NOT be visible. ----
      csrf = await loginAndPrime(page, 'adminCabang')

      const sekolahAsAdmin = await readEntity(page, 'sekolah', csrf)
      expect(sekolahAsAdmin.find(s => s.id === schAId)).toBeUndefined()
      expect(sekolahAsAdmin.find(s => s.id === schBId)).toBeUndefined()

      const trainerAsAdmin = await readEntity(page, 'trainer', csrf)
      expect(trainerAsAdmin.find(t => t.id === trainerAId)).toBeUndefined()

      const cabangAsAdmin = await readEntity(page, 'cabang', csrf)
      expect(cabangAsAdmin.find(c => c.id === branchAId)).toBeUndefined()
      expect(cabangAsAdmin.find(c => c.id === branchBId)).toBeUndefined()

      // ---- Phase 6: admin_cabang cannot smuggle a client-supplied cabangId.
      // sekolah.php:46-49 rejects the request outright with 422 if admin_cabang
      // sends a cabangId in the body — the session branch IS the authority.
      // prepareWritePayload strips it client-side as well, but we exercise the
      // server-side rule here as the authoritative contract (taste #61). ----
      const dupeRes = await page.request.post('/api/sekolah.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          action: 'create',
          id: `sch-cross-${SUFFIX}`,
          nama: `Sekolah Cross-Branch ${SUFFIX}`,
          spp: 100000,
          cabangId: branchAId,
        },
      })
      expect(dupeRes.status()).toBe(422)

      // After a clean (no-client-cabangId) write, the admin_cabang's sekolah
      // lands in their own branch (cbg-test-pusat), not in branchA/B.
      const cleanRes = await page.request.post('/api/sekolah.php', {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          action: 'create',
          id: `sch-adminclean-${SUFFIX}`,
          nama: `Sekolah Admin-Clean ${SUFFIX}`,
          spp: 100000,
        },
      })
      expect(cleanRes.ok()).toBe(true)
      const cleanBody = await cleanRes.json()
      const cleanSchoolId = cleanBody.id
      expect(cleanBody.cabangId).not.toBe(branchAId)
      expect(cleanBody.cabangId).not.toBe(branchBId)

      // The admin's own read must contain the new sekolah, but NOT Sim-* ones.
      const sekolahAsAdminAfter = await readEntity(page, 'sekolah', csrf)
      expect(sekolahAsAdminAfter.find(s => s.id === cleanSchoolId)).toBeDefined()
      expect(sekolahAsAdminAfter.find(s => s.id === schAId)).toBeUndefined()
      expect(sekolahAsAdminAfter.find(s => s.id === schBId)).toBeUndefined()

      await deleteSekolah(page, csrf, cleanSchoolId)

      await logout(page)
      await page.context().clearCookies()

      // ---- Phase 7: superadmin re-reads — clean school gone, Sim-* intact. ----
      csrf = await loginAndPrime(page, 'superadmin')
      const sekolahAsRootFinal = await readEntity(page, 'sekolah', csrf)
      expect(sekolahAsRootFinal.find(s => s.id === schAId)).toBeDefined()
      expect(sekolahAsRootFinal.find(s => s.id === schBId)).toBeDefined()
      expect(sekolahAsRootFinal.find(s => s.id === cleanSchoolId)).toBeUndefined()

      expect(pageErrors).toHaveLength(0)
    } finally {
      // Cleanup: superadmin deletes test sekolah + test branches (the
      // deleteRemote('cabang', id) path from M-MAS2.2).
      await page.context().clearCookies()
      try {
        const cleanupCsrf = await loginAndPrime(page, 'superadmin')
        if (schAId) await deleteSekolah(page, cleanupCsrf, schAId).catch(() => {})
        if (schBId) await deleteSekolah(page, cleanupCsrf, schBId).catch(() => {})
        if (branchAId) await deleteBranch(page, cleanupCsrf, branchAId)
        if (branchBId) await deleteBranch(page, cleanupCsrf, branchBId)
      } catch {}
    }
  })
})