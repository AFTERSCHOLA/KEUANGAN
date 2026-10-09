#!/usr/bin/env node
/**
 * scripts/run-contract-battery.cjs — test:server contract battery.
 *
 * Runs the corrected 18-file PHP contract battery under server/tests/ in
 * order. PHP binary: XAMPP path when present, else `php` on PATH (mirrors
 * scripts/run-db-reset.cjs so the battery works without PATH edits).
 *
 * Corrected for disk drift vs scripts/rc-verify.cjs PHP_BATTERY order:
 * rc-verify lists invoice.generation.php which is MISSING on disk; disk
 * has invoice-billing.check.php + invoice-doc.check.php instead.
 * Destructive helpers are excluded: db-reset.php, _cleanup_sim_data.php,
 * _manual_seed_fixtures.php. Newer checks not in the proven battery stay
 * as follow-up (never auto-discovered).
 *
 * Exit 0 iff all listed checks pass; non-zero names the failing script
 * with the remaining scripts listed as NOT-RUN.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const XAMPP_PHP = 'D:\\Games and Apps\\xampp\\php\\php.exe';

const useXampp = fs.existsSync(XAMPP_PHP);
const cmd = useXampp ? XAMPP_PHP : 'php';
if (!useXampp) {
  try {
    const probe = spawnSync('php', ['--version'], { stdio: 'pipe' });
    if (probe.status !== 0) throw new Error('php --version failed');
  } catch (e) {
    console.error('test:server: neither XAMPP PHP (D:\\Games and Apps\\xampp\\php\\php.exe) nor `php` on PATH is available.');
    process.exit(1);
  }
}

const BATTERY = [
  'server/tests/identity.contract.php',
  'server/tests/session.bootstrap.php',
  'server/tests/login.lifecycle.php',
  'server/tests/schema.migration.php',
  'server/tests/authorize.policy.php',
  'server/tests/entity.validation.php',
  'server/tests/api.integration.php',
  'server/tests/invoice-billing.check.php',
  'server/tests/invoice-doc.check.php',
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

function lastLine(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines[lines.length - 1] : '';
}

function notRun(fromIndex) {
  const remaining = BATTERY.slice(fromIndex);
  if (remaining.length > 0) {
    process.stderr.write(`NOT-RUN: ${remaining.join(', ')}\n`);
  }
}

for (let i = 0; i < BATTERY.length; i++) {
  const rel = BATTERY[i];
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    process.stderr.write(`FAIL: ${rel} -> battery file missing on disk\n`);
    notRun(i + 1);
    process.exit(1);
  }
  const r = spawnSync(cmd, [rel], { cwd: ROOT, stdio: 'pipe' });
  const stdout = r.stdout ? r.stdout.toString() : '';
  const stderr = r.stderr ? r.stderr.toString() : '';
  if (r.error || (r.status ?? 1) !== 0) {
    const tail = lastLine(stdout + '\n' + stderr);
    process.stderr.write(`FAIL: ${rel} -> exit ${r.error ? `spawn error: ${r.error.message}` : (r.status ?? 1)}${tail ? ` | ${tail}` : ''}\n`);
    if (stdout) process.stderr.write(stdout.slice(-2000) + (stdout.endsWith('\n') ? '' : '\n'));
    if (stderr) process.stderr.write(stderr.slice(-2000) + (stderr.endsWith('\n') ? '' : '\n'));
    notRun(i + 1);
    process.exit(1);
  }
  const tail = lastLine(stdout);
  process.stdout.write(`OK: ${rel}${tail ? ` -> ${tail}` : ''}\n`);
  if (rel === 'server/tests/endpoint.protection.php') {
    const rs = spawnSync('npm', ['run', 'db:reset'], { cwd: ROOT, stdio: 'inherit', shell: true });
    if (rs.error || (rs.status ?? 1) !== 0) {
      process.stderr.write(`FAIL: npm run db:reset (post-endpoint.protection re-seed) -> exit ${rs.error ? `spawn error: ${rs.error.message}` : (rs.status ?? 1)}\n`);
      notRun(i + 1);
      process.exit(1);
    }
    process.stdout.write('OK: npm run db:reset re-seed after endpoint.protection\n');
  }
}

process.stdout.write(`test:server: ALL ${BATTERY.length} OK\n`);
