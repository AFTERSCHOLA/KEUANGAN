import { defineConfig } from '@playwright/test'

// HY.2.1: two-project split.
//   - `default`    : the regression suite that must stay green on every PR
//   - `destructive`: specs that mutate state in a way that would poison
//                    later tests if they ran in the same project
//                    (auth lockout, phase5-7 exit gate, full-app stress sim).
//                    Runs after default via project `dependencies`, and the
//                    destructive project re-seeds the DB via globalSetup
//                    (tests/global-setup.js — see HY.2.2) so it always
//                    starts from the canonical `afterschola_t3_test` state.
export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:5173',
  },
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  projects: [
    {
      name: 'default',
      // The pre-HY.2.1 ignore of audit*-crud-*.spec.js lives in HY.3.1;
      // HY.3.1 un-ignores `tests/audit2-crud-deep.spec.js` so PM.5
      // microtasks can cite it as a real VERIFY check.
      //
      // auth-login-page.spec.js is intentionally placed in the
      // destructive project only (per HY.2.1's testMatch below). Its
      // test #5 deliberately locks the trainer account for 15 minutes;
      // running it in the default project cascades into flow-simulation,
      // honor-delete-403, and phase567-exit-gate failing with 401.
      //
      // phase567-exit-gate.spec.js and stress-simulation.spec.js are
      // also destructive-project-only: their beforeAll/globalSetup
      // fixtures WIPE the shared test DB (cleanup_phase.php DELETEs
      // every cabang row — including the canonical `cbg-test-pusat`
      // seed that later default-project tests need for sekolah/trainer
      // seeding and cabang-cache hydration). HY.5 root-cause #5
      // ("isolate the specific test that wipes the seeded branch")
      // resolved 2026-09-07: these two specs running in the default
      // project were the poisoners — every subsequent
      // "cabangId tidak ditemukan" 422 / cabang-cache timeout in a
      // full-suite run traces back to them. HY.2.1's OUTCOME ("the
      // destructive specs no longer poison the default project")
      // requires all three to be excluded here, not just
      // auth-login-page.
      testIgnore: [
        '**/auth-login-page.spec.js',
        '**/phase567-exit-gate.spec.js',
        '**/stress-simulation.spec.js',
      ],
    },
    {
      name: 'destructive',
      testMatch: [
        'tests/auth-login-page.spec.js',
        'tests/phase567-exit-gate.spec.js',
        'tests/stress-simulation.spec.js',
      ],
      // No `dependencies` here: the spec's VERIFY
      // `npx playwright test --project=destructive --workers=1` expects
      // only the destructive specs. Playwright runs projects in array
      // order when no --project flag is given, so the [default,
      // destructive] order in this file already gives us "default
      // first, destructive second" without forcing destructive-only
      // runs to also pull in default.
      globalSetup: './tests/global-setup.js',
    },
  ],
})
