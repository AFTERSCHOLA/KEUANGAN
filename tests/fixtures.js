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
  return user
}

export { expect }
