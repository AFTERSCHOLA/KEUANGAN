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
      testIgnore: ['**/auth-login-page.spec.js'],
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
