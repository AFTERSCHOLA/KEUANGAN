import { test as base, expect, request } from '@playwright/test'

// Suite-wide pageerror collector: auto-installed on every test, writing into a
// fresh per-test array (replaces the dead window.__playwrightConsoleErrors hook).
// Tests read their own array by destructuring `pageErrors` from the fixture.
export const test = base.extend({
  pageErrors: [async ({ page }, use) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await use(errors)
  }, { auto: true }],
})

// M-AUTH.5: helper that performs a real credential login against the PHP
// server reachable through Vite's `/api` proxy, then copies the resulting
// session cookie + CSRF token into the browser context so App.jsx's
// bootstrapAuth() can find a live session on the next navigation.
//
// Why real, not mocked: the production plan's whole point is that role /
// branch / trainer identity is server-derived. Mocking the auth endpoint
// would silently re-introduce the very failure mode the change is meant
// to prevent — a test passing on mocked auth tells you nothing about
// whether the credential flow actually works end-to-end. Real auth also
// means the tests stay in sync with safeIdentity() / authorize() schema
// changes, because both sides read the same `users` row.
//
// The test database (server/config.php) carries these seeded users:
//   superadmin@test.local      / SuperTest123!X      (superadmin)
//   admin.cabang@test.local    / CabangTest123!X     (admin_cabang, cbg-test-pusat)
//   trainer@test.local         / TrainerTest123!X    (trainer, trainerId=trn-test-1)
//   trainer.must@test.local    / MustChange123!X     (trainer, mustChangePassword=1)
//
// The PHP dev server must be running on http://127.0.0.1:8000 with
// server/ as its document root (see README gate T3 and the
// docs/PRODUCTION_GATE_CONFIRMATION_MILESTONES.md T3 evidence for how
// the team starts it during a test run).
export const TEST_USERS = {
  superadmin: { username: 'superadmin@test.local', password: 'SuperTest123!X' },
  adminCabang: { username: 'admin.cabang@test.local', password: 'CabangTest123!X' },
  trainer: { username: 'trainer@test.local', password: 'TrainerTest123!X' },
  trainerMustChange: { username: 'trainer.must@test.local', password: 'MustChange123!X' },
}

// We have to navigate to a page under the dev server's origin before
// the browser will accept cookies for that origin. The simplest path
// is to do the login through `page.request` (which carries the dev
// server's origin by virtue of having been used in a page.goto), then
// `page.context().addCookies` to install the session into the browser
// before the actual app navigation.
export async function loginViaApi(page, role, options = {}) {
  const credentials = options.credentials || TEST_USERS[role]
  if (!credentials) throw new Error(`Unknown test role: ${role}`)

  // Prime the browser context with a real navigation so the APIRequestContext
  // and the browser context share the same origin cookie jar. Without this,
  // the first `page.request.post('/api/...')` in a fresh test attaches
  // cookies to a synthetic origin that the subsequent `page.goto(APP)`
  // never sees, and bootstrapAuth() then gets 401 on /api/auth/me.php.
  if (!page.url() || !page.url().startsWith('http://localhost:5173')) {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  }

  // Prime the origin so the APIRequestContext shares cookies with the
  // browser context. A request through page.request against the
  // proxied /api/auth/login.php stores the Set-Cookie on this origin.
  const loginResponse = await page.request.post('/api/auth/login.php', {
    data: { username: credentials.username, password: credentials.password },
    headers: { 'Content-Type': 'application/json' },
  })
  if (loginResponse.status() !== 200) {
    const body = await loginResponse.text()
    throw new Error(`loginViaApi(${role}) failed: ${loginResponse.status()} ${body}`)
  }
  const { user } = await loginResponse.json()

  console.log('[loginViaApi] logged in as:', user.username, user.role)

  // Defensive copy: explicitly install the session cookie into the browser
  // context. Playwright's `page.request` shares its cookie jar with the
  // browser context, but that sharing is sensitive to the request having
  // a real origin attached. Copying the value back through addCookies()
  // makes the cookie visible to every subsequent `page.goto(APP)` no
  // matter how the request-context / browser-context handoff played out.
  const setCookie = loginResponse.headers()['set-cookie']
  if (setCookie) {
    const match = setCookie.match(/afterschola_session=([^;]+)/)
    if (match) {
      await page.context().addCookies([{
        name: 'afterschola_session',
        value: match[1],
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      }])
    }
  }
  return user
}

// ============================================================
// Shared API helpers (PM.0.1)
//
// Extracted from tests/multi-account-crud-sync.spec.js so every spec
// seeds/reads entities through the same set of helpers. The helpers
// all hit the real PHP backend via Vite's /api proxy — no localStorage
// shortcut, no mock — so the suite exercises the production code path
// (taste #61: server-side authorization is the authoritative contract).
//
// Per-spec test data uses a `SIM-` / `Simulasi-` prefix in nama/kode
// and a runtime SUFFIX so concurrent runs don't collide and cleanup
// can be surgical. The helpers that mint ids (createBranch /
// createSekolahSuperadmin) accept an explicit `suffix` arg so specs
// that need two records in one run (e.g. branch A and branch B) can
// share a single suffix and land at predictable ids; specs that mint
// one record at a time can pass `String(Date.now()).slice(-6)` and
// not share suffix state with anyone.
// ============================================================

const APP = 'http://localhost:5173'

export async function primeCsrf(page) {
  const cookies = await page.context().cookies()
  console.log('[primeCsrf] cookies present:', cookies.map(c => c.name))
  const res = await page.request.get('/api/auth/csrf.php')
  if (!res.ok()) throw new Error(`csrf prime failed: ${res.status()}`)
  const body = await res.json()
  return body.csrfToken
}

export async function loginAndPrime(page, role) {
  await loginViaApi(page, role)
  await page.goto(APP)
  await page.waitForLoadState('domcontentloaded')
  return primeCsrf(page)
}

export async function logout(page) {
  await page.request.post('/api/auth/logout.php')
}

export async function readEntity(page, entity, csrf) {
  const res = await page.request.get(`/api/read.php?entity=${entity}`, {
    headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
  })
  if (!res.ok()) throw new Error(`readEntity(${entity}) failed: ${res.status()}`)
  const body = await res.json()
  // /api/read.php?entity=X returns a bare array (not wrapped). /api/read.php
  // without ?entity returns an object map of all entities.
  if (Array.isArray(body)) return body
  return body[entity] || []
}

export async function createBranch(page, csrf, kode, nama, suffix) {
  const id = `cbg-${kode}-${suffix}`
  const res = await page.request.post('/api/cabang.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'create', id, kode, nama },
  })
  const body = await res.json()
  if (!res.ok()) throw new Error(`createBranch(${kode}) failed: ${res.status()} ${JSON.stringify(body)}`)
  return body
}

export async function deleteBranch(page, csrf, id) {
  const res = await page.request.post('/api/cabang.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id, action: 'delete' },
  })
  if (!res.ok() && res.status() !== 422) {
    const body = await res.json()
    throw new Error(`deleteBranch(${id}) failed: ${res.status()} ${JSON.stringify(body)}`)
  }
}

/**
 * Create a sekolah record through `/api/sekolah.php` as the superadmin.
 *
 * ID contract (HY.1.1): the helper mints `sch-{cabangIdWithoutCbg}-{suffix}`
 * and returns `{ id, body }`. Callers MUST consume `resp.id` for any
 * subsequent operation that needs to reference the sekolah — never hand-write
 * the id. Hand-written ids were the root cause of the 2026-09-03 PM.1.3
 * inverse-write orphan: the server's trainer/sekolah link logic uses the
 * sekolah id as a key, so a caller-supplied id that did not match the
 * minted one left `sekolah.payload.trainerIds` empty even when the trainer
 * record's `sekolahIds` contained the right value.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} csrf
 * @param {string} nama
 * @param {number} spp
 * @param {string} cabangId
 * @param {string} suffix
 * @returns {Promise<{ id: string, body: any }>}
 */
export async function createSekolahSuperadmin(page, csrf, nama, spp, cabangId, suffix) {
  const id = `sch-${cabangId.replace('cbg-', '')}-${suffix}`
  const res = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { action: 'create', id, nama, spp, cabangId },
  })
  const body = await res.json()
  if (!res.ok()) throw new Error(`createSekolah(${nama}) failed: ${res.status()} ${JSON.stringify(body)}`)
  return { id, body }
}

export async function deleteSekolah(page, csrf, id) {
  const res = await page.request.post('/api/sekolah.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: { id, action: 'delete' },
  })
  if (!res.ok() && res.status() !== 422) {
    const body = await res.json()
    throw new Error(`deleteSekolah(${id}) failed: ${res.status()} ${JSON.stringify(body)}`)
  }
}

/**
 * Create a trainer record (with login account) through `/api/users.php` as
 * the superadmin. Note: per the privilege matrix (`src/features/trainers/
 * TrainerList.jsx:37` + `docs/AUDIT_FINDINGS_2026-09-02.md:78-83`),
 * superadmin cannot create trainers via the UI — they can only edit
 * existing records. This helper bypasses the UI gate and posts directly
 * to the API. Use the helper only for seed-data setup; UI-driven trainer
 * creation must go through admin_cabang.
 *
 * ID contract (HY.1.1): `sekolahIds` MUST come from a prior
 * `createSekolahSuperadmin` call's `resp.id` (or another trainer's id the
 * server already knows about). Hand-written ids like `sch-test-...`
 * here do not match the helper's minted ids, leaving the inverse write
 * (`server/api/users.php:229-241`) unable to populate
 * `sekolah.payload.trainerIds`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} csrf
 * @param {string} username
 * @param {string} displayName
 * @param {string} nama
 * @param {string} cabangId
 * @param {string[]} [sekolahIds]
 * @returns {Promise<any>}
 */
export async function createTrainerSuperadmin(page, csrf, username, displayName, nama, cabangId, sekolahIds = []) {
  const res = await page.request.post('/api/users.php', {
    headers: { 'X-CSRF-Token': csrf },
    data: {
      action: 'create',
      role: 'trainer',
      username,
      displayName,
      cabangId,
      trainer: { nama, wa: '08123456789', jadwal: 'Senin', honor: 50000, sekolahIds },
    },
  })
  const body = await res.json()
  if (!res.ok()) throw new Error(`createTrainerWithAccount(${username}) failed: ${res.status()} ${JSON.stringify(body)}`)
  return body
}

export { expect }
