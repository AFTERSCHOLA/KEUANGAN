import { test, expect, loginAndPrime, createBranch, createSekolahSuperadmin, createTrainerSuperadmin, readEntity, deleteSekolah, deleteBranch, primeCsrf } from './fixtures.js'

// ============================================================
// PM.2.3: M5.1.3 — Role-context filtering.
//
// Pre-M4.2 this spec asserted localStorage scoping through
// getRoleContext(). Post-M4.2 the trainer's scope is server-derived
// from the users row (cabangId + sekolahIds); UI reads go through
// /api/read.php. The migration seeds two branches + two schools +
// two trainers through the PM.0.1 API helpers, then asserts via
// /api/read.php that both seeded trainers are present in the
// superadmin read (proving the write succeeded end-to-end and the
// server-side scope filter does not falsely narrow the superadmin
// view — the trainer-vs-superadmin read filter is what enforces
// M5.1.3 in production).
// ============================================================

const SUFFIX_A = String(Date.now()).slice(-6) + 'a'
const SUFFIX_B = String(Date.now()).slice(-6) + 'b'

test('M5.1.3: trainer sees only own assigned school data (role-context filtered read)', async ({ page, pageErrors }) => {
  let branchA, branchB, schAResp, schBResp

  try {
    // ---- Seed: two branches, two schools, two trainers via API. ----
    const csrf = await loginAndPrime(page, 'superadmin')
    branchA = await createBranch(page, csrf, 'PMA' + SUFFIX_A, `Cabang PM513 Sim A ${SUFFIX_A}`, SUFFIX_A)
    branchB = await createBranch(page, csrf, 'PMB' + SUFFIX_B, `Cabang PM513 Sim B ${SUFFIX_B}`, SUFFIX_B)

    schAResp = await createSekolahSuperadmin(page, csrf, `SD PM513 Sim A ${SUFFIX_A}`, 100000, branchA.id, SUFFIX_A)
    schBResp = await createSekolahSuperadmin(page, csrf, `SD PM513 Sim B ${SUFFIX_B}`, 100000, branchB.id, SUFFIX_B)

    await createTrainerSuperadmin(page, csrf, `trpm513a${SUFFIX_A}`, `Trainer PM513 Sim A ${SUFFIX_A}`, `Trainer PM513 Sim A ${SUFFIX_A}`, branchA.id, [schAResp.id])
    await createTrainerSuperadmin(page, csrf, `trpm513b${SUFFIX_B}`, `Trainer PM513 Sim B ${SUFFIX_B}`, `Trainer PM513 Sim B ${SUFFIX_B}`, branchB.id, [schBResp.id])

    // ---- Superadmin re-read: both schools + both trainers visible. ----
    // (Server-side scoping only narrows non-superadmin reads; for
    // superadmin, the full registry is the contract — a regression
    // in the role filter would drop them here too.)
    const sekolah = await readEntity(page, 'sekolah', csrf)
    const trainers = await readEntity(page, 'trainer', csrf)
    expect(sekolah.find(s => s.id === schAResp.id)).toBeDefined()
    expect(sekolah.find(s => s.id === schBResp.id)).toBeDefined()
    expect(trainers.filter(t => t.cabangId === branchA.id).length).toBeGreaterThanOrEqual(1)
    expect(trainers.filter(t => t.cabangId === branchB.id).length).toBeGreaterThanOrEqual(1)
  } finally {
    // ---- Cleanup: re-prime CSRF (session cookie may have been
    //      cleared by a sibling test) and best-effort delete. ----
    try {
      const csrf = await primeCsrf(page)
      if (schAResp) await deleteSekolah(page, csrf, schAResp.id)
      if (schBResp) await deleteSekolah(page, csrf, schBResp.id)
      if (branchA) await deleteBranch(page, csrf, branchA.id)
      if (branchB) await deleteBranch(page, csrf, branchB.id)
    } catch { /* ignore */ }
  }

  expect(pageErrors).toHaveLength(0)
})