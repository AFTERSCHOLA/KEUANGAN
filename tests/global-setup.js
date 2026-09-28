/**
 * HY.2.2 — globalSetup for the destructive Playwright project.
 *
 * Runs `npm run db:reset` once before any destructive spec executes so
 * the destructive project always starts from a freshly-reset
 * `afterschola_t3_test` database. Without this, the lockout at
 * `tests/auth-login-page.spec.js:290` and the data mutations in
 * `tests/stress-simulation.spec.js` bleed into the next run.
 * (Lane-2: phase567-exit-gate retired 2026-09-27; destructive set is
 * auth-login-page + stress-simulation only.)
 *
 * Note: Playwright's globalSetup runs with `process.cwd()` set to the
 * config file's directory (the repo root in this case), but npm itself
 * may inherit a different working directory when it spawns the child
 * script. Pass `cwd` explicitly to make the reset path deterministic
 * regardless of which directory Playwright chose.
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

export default async function globalSetup() {
  execFileSync('npm', ['run', 'db:reset'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
  })
}
