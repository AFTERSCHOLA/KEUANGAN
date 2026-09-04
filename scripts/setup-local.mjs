#!/usr/bin/env node
/**
 * Universal local setup for the AdminDashboard codebase.
 *
 * Goal (one sentence): A fresh clone with Node + npm on PATH (and either
 * XAMPP installed, or PHP + MySQL on PATH) can run `npm run setup` and
 * end up with dependencies installed, the test database provisioned, and
 * a working superadmin account whose credentials are printed at the end.
 *
 * Verified by: `npm run setup` exits 0; final report block contains
 * `setup OK` plus a superadmin username and password; the listed login
 * works against POST /api/auth/login on a server started via
 * `scripts/start-php-server.bat`.
 *
 * Cross-platform: pure Node, no PowerShell/.bat assumptions. PHP binary
 * is found in this order:
 *   1. $PHP_BIN env var
 *   2. %ProgramFiles% / common XAMPP paths (D:\Games and Apps\xampp\php,
 *      D:\xampp\php, C:\xampp\php)
 *   3. `php` on PATH
 * Same chain for the mysql client.
 *
 * Does NOT assume MySQL is already running: it probes, and if the
 * connection fails, tries the XAMPP start scripts in the candidate
 * install dirs before giving up.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const isWin = process.platform === 'win32';

const XAMPP_CANDIDATES = isWin
  ? [
      'D:\\Games and Apps\\xampp',
      'D:\\xampp',
      'C:\\xampp',
    ]
  : ['/opt/lampp', '/Applications/XAMPP'];

const XAMPP_PHP = XAMPP_CANDIDATES.map(p => `${p}${isWin ? '\\php\\php.exe' : '/bin/php'}`);
const XAMPP_MYSQL = XAMPP_CANDIDATES.map(p => `${p}${isWin ? '\\mysql\\bin\\mysql.exe' : '/bin/mysql'}`);
const XAMPP_MYSQLD = XAMPP_CANDIDATES.map(p => `${p}${isWin ? '\\mysql\\bin\\mysqld.exe' : '/bin/mysqld'}`);
const XAMPP_START = XAMPP_CANDIDATES.map(p => `${p}${isWin ? '\\xampp_start.exe' : '/xampp_start'}`);
const XAMPP_MYSQL_START = XAMPP_CANDIDATES.map(p => `${p}${isWin ? '\\mysql_start.bat' : '/mysql_start'}`);

const SEED_SUPERADMIN = {
  username: 'superadmin@test.local',
  password: 'SuperTest123!X',
  displayName: 'Superadmin Test',
};

function info(msg) { console.log(`[setup] ${msg}`); }
function warn(msg) { console.warn(`[setup] WARN: ${msg}`); }
function fail(msg) { console.error(`[setup] FAIL: ${msg}`); process.exit(1); }

function which(bin) {
  const probe = spawnSync(isWin ? 'where' : 'which', [bin], { stdio: 'pipe', encoding: 'utf8' });
  if (probe.status !== 0) return null;
  const lines = probe.stdout
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    // `where` on Windows returns every match in order, including directories
    // named after the binary (e.g. `C:\...\nodejs\npm`). Skip non-executable
    // entries so the caller can `spawnSync` the real binary directly.
    .filter(p => /\.(exe|cmd|bat)$/i.test(p) || !isWin);
  return lines[0] || null;
}

function findFirstExisting(paths) {
  for (const p of paths) if (existsSync(p)) return p;
  return null;
}

function probePhp() {
  if (process.env.PHP_BIN && existsSync(process.env.PHP_BIN)) return process.env.PHP_BIN;
  const fromXampp = findFirstExisting(XAMPP_PHP);
  if (fromXampp) return fromXampp;
  const fromPath = which('php');
  if (fromPath) return fromPath;
  return null;
}

function probeMysqlClient() {
  if (process.env.MYSQL_BIN && existsSync(process.env.MYSQL_BIN)) return process.env.MYSQL_BIN;
  const fromXampp = findFirstExisting(XAMPP_MYSQL);
  if (fromXampp) return fromXampp;
  const fromPath = which(isWin ? 'mysql.exe' : 'mysql');
  if (fromPath) return fromPath;
  return null;
}

function mysqlServerReachable(mysqlBin) {
  const probe = spawnSync(mysqlBin, ['-h', '127.0.0.1', '-u', 'root', '-e', 'SELECT 1'], { stdio: 'pipe', encoding: 'utf8' });
  return probe.status === 0;
}

function tryStartMysqlServer() {
  const xamppRoot = XAMPP_CANDIDATES.find(p => existsSync(p));
  if (!xamppRoot) {
    warn('MySQL is not reachable and no XAMPP install was found in the usual locations.');
    warn('Start MySQL/MariaDB manually (or `net start mysql`) and re-run `npm run setup`.');
    return false;
  }
  const startExe = findFirstExisting(XAMPP_START);
  const startBat = findFirstExisting(XAMPP_MYSQL_START);
  const cmd = startExe || startBat;
  if (!cmd) {
    warn(`XAMPP found at ${xamppRoot} but no xampp_start.exe / mysql_start.bat.`);
    warn('Open the XAMPP control panel and start MySQL, then re-run.');
    return false;
  }
  info(`Attempting to start MySQL via ${cmd} ...`);
  const r = spawnSync(cmd, [], { stdio: 'inherit', shell: false });
  if (r.error) { warn(`Could not launch ${cmd}: ${r.error.message}`); return false; }
  // XAMPP start scripts return quickly even if the service is still warming up.
  for (let i = 0; i < 20; i++) {
    const mysqlBin = probeMysqlClient();
    if (mysqlBin && mysqlServerReachable(mysqlBin)) {
      info('MySQL is reachable after start.');
      return true;
    }
    spawnSync(isWin ? 'ping' : 'sleep', isWin ? ['-n', '2', '127.0.0.1'] : ['1'], { stdio: 'ignore' });
  }
  return false;
}

function runOrFail(cmd, args, label) {
  info(`${label} ...`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (r.error) fail(`${label}: ${r.error.message}`);
  if (r.status !== 0) fail(`${label} exited with code ${r.status}`);
  info(`${label} OK`);
}

function ensureNode() {
  const v = process.versions.node;
  const major = parseInt(v.split('.')[0], 10);
  if (Number.isNaN(major) || major < 18) fail(`Node >= 18 required, found ${v}.`);
  info(`Node ${v}`);
}

function ensureNpm() {
  // The script is launched BY npm, so npm is on PATH by construction.
  // Use `shell: true` because the `npm` shim on Windows is a .cmd file
  // and Node's `spawnSync` does not auto-resolve .cmd on its own. Without
  // the shell wrapper, paths-with-spaces (e.g. `C:\Program Files\nodejs\npm.cmd`)
  // are split by Windows before the child process can read them.
  const r = spawnSync('npm', ['--version'], { stdio: 'pipe', encoding: 'utf8', shell: isWin });
  if (r.status !== 0) fail(`npm --version failed: ${(r.stderr || r.stdout || '').trim() || 'unknown error'}`);
  info(`npm ${r.stdout.trim()}`);
}

function ensurePhp() {
  const php = probePhp();
  if (!php) {
    fail(
      'PHP not found. Install XAMPP (https://www.apachefriends.org/) or a standalone PHP 8.2+ with the pdo_mysql extension, then retry.'
    );
  }
  const r = spawnSync(php, ['-v'], { stdio: 'pipe', encoding: 'utf8' });
  if (r.status !== 0) fail(`php -v failed: ${r.stderr}`);
  info(`PHP: ${r.stdout.split('\n')[0].trim()}  (${php})`);
  const ext = spawnSync(php, ['-m'], { stdio: 'pipe', encoding: 'utf8' });
  const mods = (ext.stdout || '').toLowerCase();
  for (const need of ['pdo_mysql', 'mbstring', 'json']) {
    if (!mods.includes(need)) fail(`PHP extension missing: ${need}. Enable it in php.ini and retry.`);
  }
  return php;
}

function ensureMysql(php) {
  let client = probeMysqlClient();
  if (!client) {
    fail(
      'mysql client not found. Install XAMPP (bundles the mysql client) or the MySQL/MariaDB client tools, then retry.'
    );
  }
  info(`mysql client: ${client}`);
  if (mysqlServerReachable(client)) {
    info('MySQL is reachable on 127.0.0.1:3306.');
    return client;
  }
  warn('MySQL is not reachable on 127.0.0.1:3306.');
  if (!tryStartMysqlServer()) {
    fail(
      'Could not reach or auto-start MySQL. Start it manually (XAMPP control panel or `net start mysql`), then re-run `npm run setup`.'
    );
  }
  return client;
}

function installNodeDeps() {
  // npm ci is the canonical "fresh clone" install. Falls back to `npm install`
  // if the lockfile drifted (e.g. an offline mirror). Either path is fatal
  // on failure — the rest of the script needs node_modules.
  const npmArgs = existsSync(resolve(ROOT, 'package-lock.json'))
    ? ['ci', '--no-audit', '--no-fund']
    : (warn('package-lock.json missing; falling back to `npm install`.'), ['install', '--no-audit', '--no-fund']);
  // `shell: true` on Windows so the npm.cmd shim is invoked through the
  // shell and paths-with-spaces don't get split by the OS before the child
  // process starts. See ensureNpm() for the same rationale.
  const r = spawnSync('npm', npmArgs, { stdio: 'inherit', shell: isWin });
  if (r.error) fail(`npm: ${r.error.message}`);
  if (r.status !== 0) fail(`npm exited with code ${r.status}`);
  info('npm install OK');
}

function readServerConfig() {
  // server/config.php is the active one. The "test" db it points at is the
  // single source of truth for the local DB name this script targets.
  const cfgPath = resolve(ROOT, 'server', 'config.php');
  if (!existsSync(cfgPath)) fail(`server/config.php missing at ${cfgPath}.`);
  const text = readFile(cfgPath);
  const dsnMatch = text.match(/'dsn'\s*=>\s*'([^']+)'/);
  const userMatch = text.match(/'username'\s*=>\s*'([^']*)'/);
  const passMatch = text.match(/'password'\s*=>\s*'([^']*)'/);
  if (!dsnMatch) fail('Could not parse `dsn` from server/config.php.');
  const dsn = dsnMatch[1];
  const dbMatch = dsn.match(/dbname=([^;]+)/);
  return {
    dsn,
    dbName: dbMatch ? dbMatch[1] : null,
    username: userMatch ? userMatch[1] : 'root',
    password: passMatch ? passMatch[1] : '',
  };
}

import { readFileSync } from 'node:fs';
function readFile(p) { return readFileSync(p, 'utf8'); }

function resetTestDb(php, cfg) {
  if (!cfg.dbName) fail('Could not determine target DB name from config.php DSN.');
  if (!cfg.dbName.includes('test')) {
    fail(
      `Refusing to reset DB "${cfg.dbName}" — it does not look like a test DB. ` +
      'This setup script only targets the test database (per server/config.php convention).'
    );
  }
  runOrFail('node', ['scripts/run-db-reset.cjs'], `db:reset -> ${cfg.dbName}`);
}

function existingSuperadminCount(php, cfg) {
  const sql = "SELECT COUNT(*) AS n FROM users WHERE role = 'superadmin'";
  const script = `<?php\nrequire_once __DIR__ . '/server/bootstrap.php';\n$cfg = serverConfig();\n$pdo = new PDO($cfg['dsn'], $cfg['username'], $cfg['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);\n$row = $pdo->query(${JSON.stringify(sql)})->fetch(PDO::FETCH_ASSOC);\necho (int) $row['n'];\n`;
  const tmp = resolve(process.env.TEMP || process.env.TMPDIR || '.', `setup_probe_${Date.now()}.php`);
  require('node:fs').writeFileSync(tmp, script);
  const r = spawnSync(php, [tmp], { stdio: 'pipe', encoding: 'utf8' });
  require('node:fs').unlinkSync(tmp);
  if (r.status !== 0) fail(`Superadmin probe failed: ${r.stderr || r.stdout}`);
  return parseInt(r.stdout.trim(), 10);
}

function ensureSuperadmin(php) {
  // 1. Try the canonical seeded test superadmin (db:reset populates it).
  const cfg = readServerConfig();
  // After db:reset, the seeded test superadmin is the one and only. Detect it
  // by username rather than by re-running create-superadmin.php (which
  // hard-refuses any second superadmin and would lie to the user).
  const seed = SEED_SUPERADMIN;
  const lookup = `<?php\nrequire_once __DIR__ . '/server/bootstrap.php';\n$cfg = serverConfig();\n$pdo = new PDO($cfg['dsn'], $cfg['username'], $cfg['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);\n$stmt = $pdo->prepare('SELECT id, display_name FROM users WHERE username = :u AND role = \\'superadmin\\' LIMIT 1');\n$stmt->execute([':u' => ${JSON.stringify(seed.username)}]);\n$row = $stmt->fetch(PDO::FETCH_ASSOC);\nif (!$row) { echo 'NONE'; exit; }\nif (!password_verify(${JSON.stringify(seed.password)}, (string) (new PDO($cfg['dsn'], $cfg['username'], $cfg['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]))->query('SELECT password_hash FROM users WHERE username = ' + $pdo->quote(${JSON.stringify(seed.username)}))->fetchColumn())) { echo 'HASH_MISMATCH'; exit; }\necho 'OK:' . $row['id'];\n`;
  const tmp = resolve(process.env.TEMP || process.env.TMPDIR || '.', `setup_seed_${Date.now()}.php`);
  require('node:fs').writeFileSync(tmp, lookup);
  const r = spawnSync(php, [tmp], { stdio: 'pipe', encoding: 'utf8' });
  require('node:fs').unlinkSync(tmp);
  const out = (r.stdout || '').trim();
  if (out.startsWith('OK:')) {
    info(`Seeded test superadmin present (${seed.username}).`);
    return seed;
  }
  if (out === 'HASH_MISMATCH') {
    fail(
      `Test DB has a superadmin with username ${seed.username} but the password hash does not match the expected test password. ` +
      'Re-run `npm run db:reset` to restore the canonical seed.'
    );
  }

  // 2. db:reset did not run (or it ran but the seed user is missing).
  //    No superadmin yet — call the bootstrap script. We pass --password
  //    explicitly because create-superadmin.php's hidden-input fallback
  //    uses `stty -echo` which is unavailable on Windows / most CI shells.
  const total = existingSuperadminCount(php, cfg);
  if (total > 0) {
    // A non-seed superadmin exists. We don't know its password, so we can't
    // hand the user a usable credential. Tell them honestly and stop.
    fail(
      `A superadmin already exists in ${cfg.dbName} but it is not the canonical test seed (${seed.username}). ` +
      'Refusing to create a second one (server/bin/create-superadmin.php enforces "exactly one superadmin, ever"). ' +
      'Either run `npm run db:reset` to restore the seeded test superadmin, or look up the existing account in the DB.'
    );
  }
  const username = 'admin@local.test';
  const password = 'LocalAdmin' + Math.floor(100000 + Math.random() * 900000) + 'X';
  const displayName = 'Local Setup Admin';
  info('Bootstrapping a fresh superadmin via server/bin/create-superadmin.php ...');
  const args = [
    'server/bin/create-superadmin.php',
    '--username=' + username,
    '--display-name=' + displayName,
    '--password=' + password,
  ];
  const r2 = spawnSync(php, args, { stdio: 'inherit' });
  if (r2.status !== 0) fail(`create-superadmin.php exited ${r2.status}.`);
  return { username, password, displayName };
}

function main() {
  ensureNode();
  ensureNpm();
  const php = ensurePhp();
  const mysqlClient = ensureMysql(php);
  installNodeDeps();
  const cfg = readServerConfig();
  resetTestDb(php, cfg);
  const superadmin = ensureSuperadmin(php);

  console.log('\n========== setup OK ==========');
  console.log(`Project root:    ${ROOT}`);
  console.log(`PHP binary:      ${php}`);
  console.log(`MySQL client:    ${mysqlClient}`);
  console.log(`Test database:   ${cfg.dbName}  (from server/config.php)`);
  console.log(`Superadmin user: ${superadmin.username}`);
  console.log(`Superadmin pass: ${superadmin.password}`);
  console.log('Next steps:');
  console.log('  1. Start the API + UI:');
  console.log('       npm run dev                       (Vite, port 5173)');
  console.log('       scripts\\start-php-server.bat      (PHP built-in, port 8000)');
  console.log('  2. Visit http://localhost:5173 and log in with the superadmin above.');
  console.log('  3. To re-run from a clean slate: `npm run db:reset`.');
  console.log('================================\n');
}

main();
