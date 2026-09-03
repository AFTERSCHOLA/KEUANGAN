#!/usr/bin/env node
/**
 * HY.0.1 — npm-run wrapper around server/tests/db-reset.php.
 *
 * Spawns the XAMPP PHP binary with the db-reset script. The XAMPP
 * default path is used so the script works without the user having
 * to add PHP to PATH. Falls back to `php` on PATH if XAMPP is missing.
 */

const { spawnSync } = require('node:child_process');

const XAMPP_PHP = 'D:\\Games and Apps\\xampp\\php\\php.exe';
const SCRIPT = 'server\\tests\\db-reset.php';

const fs = require('node:fs');
const useXampp = fs.existsSync(XAMPP_PHP);
const cmd = useXampp ? XAMPP_PHP : 'php';
if (!useXampp) {
  try {
    const probe = spawnSync('php', ['--version'], { stdio: 'pipe' });
    if (probe.status !== 0) throw new Error('php --version failed');
  } catch (e) {
    console.error('db:reset: neither XAMPP PHP (D:\\Games and Apps\\xampp\\php\\php.exe) nor `php` on PATH is available.');
    process.exit(1);
  }
}

const result = spawnSync(cmd, [SCRIPT], { stdio: 'inherit' });
process.exit(result.status ?? 1);