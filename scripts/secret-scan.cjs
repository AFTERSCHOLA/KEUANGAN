#!/usr/bin/env node
/**
 * scripts/secret-scan.cjs — RH.A.3 regression guard for F-RH1/F-RH2 (R-RH1).
 *
 * Zero dependencies (node builtins only). Part of `rc:verify`, no npm script entry.
 *
 * Checks:
 *   (a) `git ls-files` contains no deploy/config.php, no .env file, no mirror artifacts.
 *   (b) No tracked config-shaped file carries a non-placeholder password literal
 *       (non-'replace_me', non-empty value; .env.example placeholders skipped).
 *   (c) When deploy/ exists on disk, deploy/.gitignore includes config.php.
 *
 * Exit 0 = clean. Exit 1 = prints the named file list to stderr.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DEPLOY_DIR = path.join(ROOT, 'deploy');
const DEPLOY_GITIGNORE = path.join(DEPLOY_DIR, '.gitignore');

// (a) Mirror artifacts that must never be tracked (RH.A.1 VERIFY set + lib/ + generated dotenv).
const MIRROR_PREFIXES = ['deploy/api/', 'deploy/auth/', 'deploy/bin/', 'deploy/lib/'];
const MIRROR_EXACT = new Set([
  'deploy/config.php',
  'deploy/bootstrap.php',
  'deploy/config.example.php',
  'deploy/schema.sql',
  'deploy/.htaccess',
  'deploy/.env',
  'deploy/.env.example',
]);

function isEnvFile(basename) {
  // (a) is the exact secret file only: basename `.env` (e.g. `.env`, `deploy/.env`).
  // Tracked `.env.example` (paste-ready placeholder) and `.env.development`
  // (Vite mode flag, no secrets) are intentional and must NOT fail the scan.
  return basename === '.env';
}

function checkTrackedFiles(tracked) {
  const bad = [];
  for (const f of tracked) {
    const posix = f.split(path.sep).join('/');
    const base = posix.split('/').pop();
    if (posix === 'deploy/config.php' || MIRROR_EXACT.has(posix)) {
      bad.push(`${posix} (tracked credential/mirror artifact)`);
      continue;
    }
    if (base === '.env' || isEnvFile(base)) {
      bad.push(`${posix} (tracked .env file)`);
      continue;
    }
    if (MIRROR_PREFIXES.some((p) => posix === p.slice(0, -1) || posix.startsWith(p))) {
      bad.push(`${posix} (tracked deploy mirror artifact)`);
    }
  }
  return bad;
}

function isConfigShaped(posix) {
  // (b) scans DB-credential carriers only: dotenv files and PHP config files.
  // Docs (*.md, e.g. docs/CONFIG.md placeholders) and test/user-password
  // fixtures (server/tests/*.php) are NOT config-shaped and are excluded,
  // otherwise the cleaned tree could never be green.
  const base = posix.split('/').pop();
  const lower = base.toLowerCase();
  if (lower === '.env' || lower === '.env.development') return true;
  if (lower === '.env.example' || lower.endsWith('.env.example')) return false;
  if (path.extname(lower).toLowerCase() === '.md') return false;
  return lower.includes('config') && path.extname(lower).toLowerCase() === '.php';
}

function isPlaceholderValue(v) {
  const t = v.trim();
  if (t === '') return true;
  if (t.toLowerCase() === 'replace_me') return true;
  // Docs/runbook placeholders such as <cpanel_db_password> are not secrets.
  if (t.startsWith('<') && t.endsWith('>')) return true;
  return false;
}

function readTrackedContent(posix) {
  const abs = path.join(ROOT, posix);
  try {
    const buf = fs.readFileSync(abs);
    if (buf.includes(0)) return null; // binary
    return buf.toString('utf8');
  } catch {
    // Staged-but-missing on disk (e.g. `git add -f` probe in odd states):
    // fall back to the index copy so the probe is still caught.
    try {
      return execFileSync('git', ['show', `:${posix}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      return null;
    }
  }
}

function scanPasswordLiterals(tracked) {
  const bad = [];
  const assocRe = /['"]((?:db_)?password|(?:db_)?pass|passwd|pwd)['"]\s*=>\s*['"]([^'"]*)['"]/gi;
  const assignRe = /\$\w*(?:password|passwd|pwd|db_pass)\w*\s*=\s*['"]([^'"]*)['"]/gi;
  const envDefaultRe = /\$env\s*\(\s*['"]APP_DB_PASS['"]\s*,\s*['"]([^'"]*)['"]\s*\)/gi;
  const defineRe = /define\s*\(\s*['"](?:DB_PASSWORD|DB_PASS|APP_DB_PASS)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/gi;
  const jsonDoubleRe = /"(?:db_)?password"\s*:\s*"([^"]*)"/gi;
  const dotenvRe = /^\s*(?:APP_DB_PASS|DB_PASS|DB_PASSWORD|MYSQL_PASSWORD|PASSWORD|PASS|APP_PASSWORD|DB_PWD)\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s#\r\n]+))/gim;

  for (const f of tracked) {
    const posix = f.split(path.sep).join('/');
    const base = posix.split('/').pop();
    if (base === '.env.example' || base.endsWith('.env.example')) continue; // skip placeholders
    if (!isConfigShaped(posix)) continue;
    const content = readTrackedContent(posix);
    if (content == null) continue;
    const hits = [];
    const collect = (re, groupIdx) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(content)) !== null) {
        const v = (m[groupIdx] ?? '').trim();
        if (v !== '' && !isPlaceholderValue(v)) hits.push(`${re.source.slice(0, 24)}…='${v.slice(0, 24)}'`);
      }
    };
    // For assocRe the value is group 2; others group 1 (dotenv: first non-undefined of 1/2/3).
    assocRe.lastIndex = 0;
    {
      let m;
      while ((m = assocRe.exec(content)) !== null) {
        const v = (m[2] ?? '').trim();
        if (v !== '' && !isPlaceholderValue(v)) hits.push(`assoc '${m[1]}'='${v.slice(0, 24)}'`);
      }
    }
    collect(assignRe, 1);
    collect(envDefaultRe, 1);
    collect(defineRe, 1);
    collect(jsonDoubleRe, 1);
    dotenvRe.lastIndex = 0;
    {
      let m;
      while ((m = dotenvRe.exec(content)) !== null) {
        const v = (m[1] ?? m[2] ?? m[3] ?? '').trim();
        if (v !== '' && !isPlaceholderValue(v)) hits.push(`dotenv '${v.slice(0, 24)}'`);
      }
    }
    if (hits.length > 0) bad.push(`${posix} (password literal: ${hits[0]})`);
  }
  return bad;
}

function checkDeployGitignore() {
  try {
    const st = fs.statSync(DEPLOY_DIR);
    if (!st.isDirectory()) return [];
  } catch {
    return []; // deploy/ absent -> nothing to check
  }
  let content;
  try {
    content = fs.readFileSync(DEPLOY_GITIGNORE, 'utf8');
  } catch {
    return ['deploy/.gitignore (missing while deploy/ exists — must ignore config.php)'];
  }
  if (!content.includes('config.php')) {
    return ['deploy/.gitignore (must include config.php)'];
  }
  return [];
}

function main() {
  let tracked;
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'buffer' });
    tracked = out.toString('utf8').split('\0').filter(Boolean);
  } catch (err) {
    process.stderr.write(`SECRET-SCAN FAIL: cannot list tracked files (git ls-files failed): ${err.message}\n`);
    process.exit(1);
  }

  const failures = [
    ...checkTrackedFiles(tracked),
    ...scanPasswordLiterals(tracked),
    ...checkDeployGitignore(),
  ];

  if (failures.length > 0) {
    process.stderr.write('SECRET-SCAN FAIL: credential-shaped tracked files or password literals found:\n');
    for (const f of failures) process.stderr.write(`  - ${f}\n`);
    process.exit(1);
  }
  process.stdout.write('SECRET-SCAN OK: no tracked credentials or password literals.\n');
}

main();
