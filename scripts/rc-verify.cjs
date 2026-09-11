#!/usr/bin/env node
/**
 * scripts/rc-verify.cjs — RH.G.1 release-candidate battery (F-RH8, D-RH11).
 *
 * One command proves the release candidate. Ordered steps, early exit on
 * first failure. Each step prints its command + one decisive result line.
 * Taste #28: a timed-out/capped step NEVER claims pass — it prints CAPPED
 * and exits non-zero with the remaining steps listed as not-run.
 *
 * Concrete picks (taste #17 — spec admits multiple valid designs):
 *   - PHP binary: XAMPP path when present, else `php` on PATH (mirrors
 *     scripts/run-db-reset.cjs so the battery works without PATH edits).
 *   - PHP battery: the 17 contract scripts under server/tests/ in plan
 *     order (identity, session, login, schema, policy, entity, api,
 *     invoice, superadmin, endpoint protection, users endpoint, cascade
 *     family x3, photo, v4 import, reconcile). Excluded: db-reset.php
 *     (setup, run as part of step 4), _cleanup_sim_data.php (dry-run
 *     helper), _manual_seed_fixtures.php (seed helper), *.json fixtures.
 *   - Playwright named set (D-RH11: verified-green, NOT the full suite
 *     whose 16 failures are owned by RELEASE_HYGIENE_PLAN §13):
 *       core: r3-verify, multi-account-crud-sync, cascade-users-deactivated,
 *         cascade-cleanup
 *       A2.5 batch: sekolah-foto-picker, settings-logo-picker,
 *         sekolah-jadwal-list (SCOPE_EXPANSION_MILESTONES A2.5 closure)
 *       RH.D.5 + RH.F.3 (DEPENDS): photo-server-roundtrip, v4-import
 *       PM.5 batch: audit2-crud-deep (gate acceptance) + the 12 PM.5.11-5.22
 *         specs (modal-positioning, trainer-honor-input, salin-feedback,
 *         antrean-toggle-label, sidebar-collapse-overflow, sidebar-sticky,
 *         trainer-scroll-perf, scrollbar-thin, select-chevron-margin,
 *         spp-font-size, siswa-row-button-anchor, siswa-row-numbering)
 *       auth scope: ki1-trainer-cabangid, m51-verify, m512-verify,
 *         m513-verify (default-project; auth-login-page stays
 *         destructive-project-only per playwright.config.js and is excluded)
 *
 * Steps (RELEASE_HYGIENE_PLAN §12):
 *   1. php -l every server PHP file (recursive)
 *   2. PHP battery (server/tests/*.php incl. photo, v4, reconcile)
 *   3. npm test (vitest)
 *   4. npm run db:reset + focused Playwright named set (--project=default)
 *   5. npm run build + assert zero dist/assets/*.map
 *   6. npm run build:deploy (parity hard gate) + php -l deploy PHP
 *   7. node scripts/secret-scan.cjs
 *
 * Exit 0 = all seven steps OK. Any failure/CAPPED exits non-zero naming
 * the step and command; later steps are reported as NOT-RUN.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server');
const DEPLOY = path.join(ROOT, 'deploy');
const DIST_ASSETS = path.join(ROOT, 'dist', 'assets');

const XAMPP_PHP = 'D:\\Games and Apps\\xampp\\php\\php.exe';
const PHP = fs.existsSync(XAMPP_PHP) ? XAMPP_PHP : 'php';

// Step 2 order pins plan §12 parenthetical (identity .. reconcile).
const PHP_BATTERY = [
  'server/tests/identity.contract.php',
  'server/tests/session.bootstrap.php',
  'server/tests/login.lifecycle.php',
  'server/tests/schema.migration.php',
  'server/tests/authorize.policy.php',
  'server/tests/entity.validation.php',
  'server/tests/api.integration.php',
  'server/tests/invoice.generation.php',
  'server/tests/superadmin.bootstrap.php',
  'server/tests/endpoint.protection.php',
  'server/tests/users.endpoint.php',
  'server/tests/cascade-cleanup.php',
  'server/tests/cascade-orphan-cleanup.php',
  'server/tests/siswa-foto-purge.php',
  'server/tests/photo.endpoint.php',
  'server/tests/v4.import.php',
  'server/tests/reconcile.check.php',
];

const PLAYWRIGHT_SPECS = [
  'tests/r3-verify.spec.js',
  'tests/multi-account-crud-sync.spec.js',
  'tests/cascade-users-deactivated.spec.js',
  'tests/cascade-cleanup.spec.js',
  'tests/sekolah-foto-picker.spec.js',
  'tests/settings-logo-picker.spec.js',
  'tests/sekolah-jadwal-list.spec.js',
  'tests/photo-server-roundtrip.spec.js',
  'tests/v4-import.spec.js',
  'tests/audit2-crud-deep.spec.js',
  'tests/modal-positioning.spec.js',
  'tests/trainer-honor-input.spec.js',
  'tests/salin-feedback.spec.js',
  'tests/antrean-toggle-label.spec.js',
  'tests/sidebar-collapse-overflow.spec.js',
  'tests/sidebar-sticky.spec.js',
  'tests/trainer-scroll-perf.spec.js',
  'tests/scrollbar-thin.spec.js',
  'tests/select-chevron-margin.spec.js',
  'tests/spp-font-size.spec.js',
  'tests/siswa-row-button-anchor.spec.js',
  'tests/siswa-row-numbering.spec.js',
  'tests/ki1-trainer-cabangid.spec.js',
  'tests/m51-verify.spec.js',
  'tests/m512-verify.spec.js',
  'tests/m513-verify.spec.js',
];

const STEP_TIMEOUTS = {
  1: 120000,
  2: 600000,
  3: 300000,
  4: 1500000,
  5: 600000,
  6: 600000,
  7: 120000,
};

const results = [];

function log(msg) {
  process.stdout.write(msg + '\n');
}

function fail(step, command, detail) {
  process.stderr.write(`[rc-verify ${step}/7] FAIL: ${command} -> ${detail}\n`);
  const remaining = [];
  for (let n = step + 1; n <= 7; n++) remaining.push(n);
  if (remaining.length) {
    process.stderr.write(`[rc-verify] NOT-RUN steps: ${remaining.join(', ')} (early exit on failure)\n`);
  }
  process.exit(1);
}

function capped(step, command, ms) {
  // Taste #28: never claim pass when capped — report honestly.
  process.stderr.write(
    `[rc-verify ${step}/7] CAPPED: ${command} -> no result within ${Math.round(ms / 1000)}s; NOT claiming pass\n`
  );
  const remaining = [];
  for (let n = step + 1; n <= 7; n++) remaining.push(n);
  if (remaining.length) {
    process.stderr.write(`[rc-verify] NOT-RUN steps: ${remaining.join(', ')} (capped at step ${step})\n`);
  }
  process.exit(2);
}

/** Run a command with inherited stdio; return status. Handles timeout honestly. */
function run(step, command, args, timeoutMs) {
  log(`[rc-verify ${step}/7] command: ${command} ${args.join(' ')}`);
  // Windows: an absolute binary path with spaces (e.g. the XAMPP PHP path)
  // must be quoted when shell:true, otherwise cmd.exe splits it at the
  // first space ("'D:\Games' is not recognized ..."). Quote once here so
  // every caller (PHP battery, npm, npx, node) is covered.
  const shellCmd =
    command.includes(' ') && !command.startsWith('"')
      ? `"${command}"`
      : command;
  const r = spawnSync(shellCmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    timeout: timeoutMs,
  });
  if (r.error) {
    if (r.error.code === 'ETIMEDOUT') capped(step, `${command} ${args.join(' ')}`, timeoutMs);
    fail(step, `${command} ${args.join(' ')}`, `spawn error: ${r.error.message}`);
  }
  if (typeof r.signal !== 'undefined' && r.signal !== null) {
    fail(step, `${command} ${args.join(' ')}`, `terminated by signal ${r.signal}`);
  }
  return r.status ?? 1;
}

function collectPhpFiles(dir) {
  const out = [];
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.php')) out.push(full);
    }
  }
  walk(dir);
  return out.sort();
}

function step1LintServer() {
  const files = collectPhpFiles(SERVER);
  log(`[rc-verify 1/7] command: ${PHP} -l <each of ${files.length} files under server/>`);
  if (files.length === 0) fail(1, 'php -l server/', 'no PHP files found under server/');
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const r = spawnSync(PHP, ['-l', abs], { cwd: ROOT, stdio: 'pipe', shell: false, timeout: 30000 });
    const out = (r.stdout ? r.stdout.toString() : '') + (r.stderr ? r.stderr.toString() : '');
    if (r.error || (r.status ?? 1) !== 0) {
      if (r.error && r.error.code === 'ETIMEDOUT') capped(1, `php -l ${rel}`, 30000);
      process.stderr.write(out);
      fail(1, `php -l ${rel}`, 'syntax error (see output above)');
    }
  }
  const msg = `LINT OK (${files.length} server files)`;
  log(`[rc-verify 1/7] OK: php -l server/ -> ${msg}`);
  results.push(msg);
}

function step2PhpBattery() {
  log(`[rc-verify 2/7] command: ${PHP} <each of ${PHP_BATTERY.length} server/tests files in order>`);
  for (const rel of PHP_BATTERY) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) fail(2, `${PHP} ${rel}`, 'battery file missing on disk');
    const status = run(2, PHP, [rel], 300000);
    if (status !== 0) fail(2, `${PHP} ${rel}`, `exit ${status}`);
    log(`[rc-verify 2/7]   ok: ${rel}`);
    // D9.2 record (PRODUCTION_MILESTONES.md): endpoint.protection.php's
    // restore-test legitimately wipes the cabang table, leaving the
    // canonical trainer users dangling; cascade-orphan-cleanup.php's
    // fail-fast precondition demands the canonical post-D9.2 seed.
    // Re-establish it here so the battery is order-stable.
    if (rel === 'server/tests/endpoint.protection.php') {
      const rs = run(2, 'npm', ['run', 'db:reset'], 120000);
      if (rs !== 0) fail(2, 'npm run db:reset (post-endpoint.protection re-seed)', `exit ${rs}`);
      log('[rc-verify 2/7]   ok: db:reset re-seed after endpoint.protection');
    }
  }
  const msg = `PHP BATTERY OK (${PHP_BATTERY.length} scripts)`;
  log(`[rc-verify 2/7] OK: php server/tests battery -> ${msg}`);
  results.push(msg);
}

function step3Vitest() {
  const status = run(3, 'npm', ['test'], STEP_TIMEOUTS[3]);
  if (status !== 0) fail(3, 'npm test', `exit ${status}`);
  const msg = 'VITEST OK (npm test exit 0)';
  log(`[rc-verify 3/7] OK: npm test -> ${msg}`);
  results.push(msg);
}

function step4Playwright() {
  let status = run(4, 'npm', ['run', 'db:reset'], 120000);
  if (status !== 0) fail(4, 'npm run db:reset', `exit ${status}`);
  // --retries 1: the 13-minute loaded run flakes login-first specs
  // (login page after a successful API login; green in isolation).
  // Retried passes are still reported as flaky by Playwright, never
  // silently absorbed — this only absorbs machine-load races, and the
  // retry count stays visible in the output tail below.
  const args = ['playwright', 'test', ...PLAYWRIGHT_SPECS, '--project=default', '--workers=1', '--retries', '1'];
  status = run(4, 'npx', args, STEP_TIMEOUTS[4]);
  if (status !== 0) fail(4, `npx ${args.join(' ')}`, `exit ${status}`);
  const msg = `PLAYWRIGHT OK (${PLAYWRIGHT_SPECS.length} named specs, default project)`;
  log(`[rc-verify 4/7] OK: db:reset + playwright named set -> ${msg}`);
  results.push(msg);
}

function step5Build() {
  const status = run(5, 'npm', ['run', 'build'], STEP_TIMEOUTS[5]);
  if (status !== 0) fail(5, 'npm run build', `exit ${status}`);
  let maps = [];
  try {
    const entries = fs.readdirSync(DIST_ASSETS);
    maps = entries.filter((f) => f.endsWith('.map'));
  } catch (err) {
    fail(5, 'read dist/assets', `cannot list dist/assets: ${err.message}`);
  }
  if (maps.length !== 0) {
    fail(5, 'assert zero dist/assets/*.map', `found ${maps.length}: ${maps.slice(0, 5).join(', ')}`);
  }
  const msg = 'BUILD OK (zero dist/assets/*.map)';
  log(`[rc-verify 5/7] OK: npm run build -> ${msg}`);
  results.push(msg);
}

function step6Deploy() {
  const status = run(6, 'npm', ['run', 'build:deploy'], STEP_TIMEOUTS[6]);
  if (status !== 0) fail(6, 'npm run build:deploy', `exit ${status} (parity hard gate)`);
  // §12 step 1 parenthetical: lint deploy/ after build.
  const deployPhp = [
    ...collectPhpFiles(path.join(DEPLOY, 'api')),
    ...collectPhpFiles(path.join(DEPLOY, 'auth')),
    ...collectPhpFiles(path.join(DEPLOY, 'bin')),
    ...collectPhpFiles(path.join(DEPLOY, 'lib')),
  ];
  const bootstrap = path.join(DEPLOY, 'bootstrap.php');
  if (fs.existsSync(bootstrap)) deployPhp.push(bootstrap);
  for (const abs of deployPhp) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const r = spawnSync(PHP, ['-l', abs], { cwd: ROOT, stdio: 'pipe', shell: false, timeout: 30000 });
    if (r.error || (r.status ?? 1) !== 0) {
      if (r.error && r.error.code === 'ETIMEDOUT') capped(6, `php -l ${rel}`, 30000);
      process.stderr.write((r.stdout ? r.stdout.toString() : '') + (r.stderr ? r.stderr.toString() : ''));
      fail(6, `php -l ${rel}`, 'syntax error in built deploy file');
    }
  }
  const msg = `DEPLOY OK (parity clean, ${deployPhp.length} deploy PHP files linted)`;
  log(`[rc-verify 6/7] OK: npm run build:deploy -> ${msg}`);
  results.push(msg);
}

function step7SecretScan() {
  const status = run(7, 'node', ['scripts/secret-scan.cjs'], STEP_TIMEOUTS[7]);
  if (status !== 0) fail(7, 'node scripts/secret-scan.cjs', `exit ${status}`);
  const msg = 'SECRET-SCAN OK (no tracked credentials or password literals)';
  log(`[rc-verify 7/7] OK: node scripts/secret-scan.cjs -> ${msg}`);
  results.push(msg);
}

function main() {
  log('[rc-verify] RH.G.1 release-candidate battery (7 ordered steps, early exit; capped steps never claim pass).');
  step1LintServer();
  step2PhpBattery();
  step3Vitest();
  step4Playwright();
  step5Build();
  step6Deploy();
  step7SecretScan();
  log('[rc-verify] ALL 7 STEPS OK:');
  results.forEach((r, i) => log(`[rc-verify ${i + 1}/7] RESULT: ${r}`));
}

main();
