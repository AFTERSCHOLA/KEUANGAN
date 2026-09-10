<?php
/**
 * HY.0.1 — db:reset entry point.
 *
 * Drops + recreates the `afterschola_t3_test` database from
 * server/schema.sql and re-seeds the four canonical test users, the
 * `cbg-test-pusat` branch, and the two trainer rows the trainer users
 * reference (D9.2) to a known canonical state. Idempotent: safe to
 * run repeatedly. Exits non-zero on any failure and prints the failing
 * step so the npm script surfaces the cause.
 *
 * Hard-coded DB name (per HYGIENE_MILESTONES.md HY.0.1 RULES):
 * never connects to a non-test database.
 *
 * Usage:  php server/tests/db-reset.php
 *         npm run db:reset
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

const RESET_DB_NAME = 'afterschola_t3_test';
const SEED_BRANCH_ID = 'cbg-test-pusat';
const SEED_BRANCH_KODE = 'PST';
const SEED_BRANCH_NAMA = 'Cabang Pusat';

$start = microtime(true);

function resetFail(string $step, string $detail = ''): never {
    fwrite(STDERR, "db:reset FAIL at step: {$step}");
    if ($detail !== '') fwrite(STDERR, " | {$detail}");
    fwrite(STDERR, PHP_EOL);
    exit(1);
}

// ---------------------------------------------------------------------------
// Step 1: locate MySQL/MariaDB client binary (XAMPP default, then PATH).
// ---------------------------------------------------------------------------
$xamppMysql = 'D:\\Games and Apps\\xampp\\mysql\\bin\\mysql.exe';
$mysqlBin = null;
if (PHP_OS_FAMILY === 'Windows' && is_file($xamppMysql)) {
    $mysqlBin = $xamppMysql;
} else {
    $candidate = trim((string) shell_exec('command -v mysql 2>NUL'));
    if ($candidate !== '' && is_file($candidate)) $mysqlBin = $candidate;
}
if ($mysqlBin === null) {
    resetFail('locate mysql client', 'XAMPP mysql.exe not at default path and `mysql` not on PATH');
}

function runMysql(string $mysqlBin, string $sql, ?string $db = null): array {
    // Use a temp file for multi-statement SQL — escaping through -e is fragile.
    $tmp = tempnam(sys_get_temp_dir(), 'dbrst_');
    file_put_contents($tmp, $sql);
    $fullCmd = sprintf('"%s" -h 127.0.0.1 -u root %s < %s', $mysqlBin, $db !== null ? escapeshellarg($db) : '', escapeshellarg($tmp));
    $stdout = [];
    $exit = 0;
    exec($fullCmd . ' 2>&1', $stdout, $exit);
    @unlink($tmp);
    return ['exit' => $exit, 'output' => implode("\n", $stdout)];
}

$schemaPath = realpath(__DIR__ . '/../schema.sql');
if ($schemaPath === false || !is_file($schemaPath)) {
    resetFail('locate schema.sql', __DIR__ . '/../schema.sql missing');
}

// ---------------------------------------------------------------------------
// Step 2: drop + recreate the test database.
// ---------------------------------------------------------------------------
$dropOut = runMysql($mysqlBin, 'DROP DATABASE IF EXISTS ' . RESET_DB_NAME);
if ($dropOut['exit'] !== 0) resetFail('DROP DATABASE', $dropOut['output']);
$createOut = runMysql($mysqlBin, 'CREATE DATABASE ' . RESET_DB_NAME . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
if ($createOut['exit'] !== 0) resetFail('CREATE DATABASE', $createOut['output']);

// ---------------------------------------------------------------------------
// Step 3: apply schema.sql.
// ---------------------------------------------------------------------------
$applyCmd = sprintf('"%s" -h 127.0.0.1 -u root %s < %s', $mysqlBin, escapeshellarg(RESET_DB_NAME), escapeshellarg($schemaPath));
$applyOut = [];
$applyExit = 0;
exec($applyCmd . ' 2>&1', $applyOut, $applyExit);
if ($applyExit !== 0) resetFail('apply schema.sql', implode("\n", $applyOut));

// ---------------------------------------------------------------------------
// Step 4: seed the canonical test users + the cbg-test-pusat branch.
//
// Open a fresh PDO connection scoped to the just-recreated database.
// We deliberately do NOT use the bootstrap.php `database()` helper here:
// that helper caches a static PDO instance from the very first call, so
// dropping + recreating the DB underneath it leaves the cached connection
// pointing at a defunct schema. The verification SELECT at the bottom
// would then see zero rows in the fresh DB.
// ---------------------------------------------------------------------------
$config = serverConfig();
$dsn = (string) ($config['dsn'] ?? '');
if ($dsn === '' || !str_contains($dsn, RESET_DB_NAME)) {
    resetFail('config DSN check', 'server/config.php does not point at ' . RESET_DB_NAME . ' — refusing to proceed');
}

try {
    $pdo = new PDO($dsn, (string) ($config['username'] ?? 'root'), (string) ($config['password'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
    ]);
} catch (PDOException $e) {
    resetFail('open PDO to test DB', $e->getMessage());
}

$seedUsers = [
    [
        'id' => 'usr-superadmin-test',
        'username' => 'superadmin@test.local',
        'display_name' => 'Superadmin Test',
        'password' => 'SuperTest123!X',
        'role' => 'superadmin',
        'cabang_id' => null,
        'trainer_id' => null,
        'must_change_password' => 0,
    ],
    [
        'id' => 'usr-admin-cabang-test',
        'username' => 'admin.cabang@test.local',
        'display_name' => 'Admin Cabang Test',
        'password' => 'CabangTest123!X',
        'role' => 'admin_cabang',
        'cabang_id' => SEED_BRANCH_ID,
        'trainer_id' => null,
        'must_change_password' => 0,
    ],
    [
        'id' => 'usr-trainer-test',
        'username' => 'trainer@test.local',
        'display_name' => 'Trainer Test',
        'password' => 'TrainerTest123!X',
        'role' => 'trainer',
        'cabang_id' => SEED_BRANCH_ID,
        'trainer_id' => 'trn-test-1',
        'must_change_password' => 0,
    ],
    [
        'id' => 'usr-trainer-must-test',
        'username' => 'trainer.must@test.local',
        'display_name' => 'Trainer Must Change',
        'password' => 'MustChange123!X',
        'role' => 'trainer',
        'cabang_id' => SEED_BRANCH_ID,
        'trainer_id' => 'trn-test-2',
        'must_change_password' => 1,
    ],
];

$insertUser = $pdo->prepare(
    'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, must_change_password, active) '
  . 'VALUES (:id, :username, :display_name, :password_hash, :role, :cabang_id, :trainer_id, :must_change_password, 1)'
);

foreach ($seedUsers as $u) {
    $hash = password_hash($u['password'], PASSWORD_DEFAULT);
    try {
        $insertUser->execute([
            ':id' => $u['id'],
            ':username' => $u['username'],
            ':display_name' => $u['display_name'],
            ':password_hash' => $hash,
            ':role' => $u['role'],
            ':cabang_id' => $u['cabang_id'],
            ':trainer_id' => $u['trainer_id'],
            ':must_change_password' => $u['must_change_password'],
        ]);
    } catch (PDOException $e) {
        resetFail('insert user ' . $u['username'], $e->getMessage());
    }
}

// ---------------------------------------------------------------------------
// D9.2 — seed the trainer rows the two trainer users reference.
//
// usr-trainer-test points at trn-test-1 and usr-trainer-must-test at
// trn-test-2 (see $seedUsers). Before D9.2 the seed created the users
// without their trainer rows, leaving users.trainer_id dangling — the
// exact orphan shape the 2026-09-10-cascade-orphan-cleanup.sql
// migration exists to clean up, and runMigrations() would deactivate
// both canonical trainer logins on the first database() call after a
// reset (runMigrations auto-applies every pending migrations/*.sql on
// the first database() hit). The canonical seed must satisfy the same
// referential invariant D9.2 enforces on production data, so the seed
// rows ship here — mirroring server/tests/_manual_seed_fixtures.php
// upsertTrainer(), which always paired trn-test-1 with a trainer row.
// Payload shape matches _manual_seed_fixtures.php's trainer record.
// ---------------------------------------------------------------------------
$seedTrainers = [
    [
        'id' => 'trn-test-1',
        'nama' => 'Trainer Test Satu',
    ],
    [
        'id' => 'trn-test-2',
        'nama' => 'Trainer Test Dua',
    ],
];

$insertTrainer = $pdo->prepare(
    'INSERT INTO trainer (id, cabang_id, version, payload) VALUES (:id, :cabang_id, 1, :payload)'
);

foreach ($seedTrainers as $t) {
    $trainerPayload = json_encode([
        'id' => $t['id'],
        'nama' => $t['nama'],
        'wa' => '628123456789',
        'jadwal' => 'Senin',
        'honor' => 50000,
        'sekolahIds' => [],
        'cabangId' => SEED_BRANCH_ID,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    try {
        $insertTrainer->execute([
            ':id' => $t['id'],
            ':cabang_id' => SEED_BRANCH_ID,
            ':payload' => $trainerPayload,
        ]);
    } catch (PDOException $e) {
        resetFail('insert trainer ' . $t['id'], $e->getMessage());
    }
}

$branchPayload = json_encode([
    // 'id' must be inside the payload too, not just the SQL column —
    // /api/read.php returns the payload verbatim and every client
    // consumer keys off record.id (SchoolList cabang select,
    // BranchManager, isWithinScope). API-created rows always carry
    // id in the payload (masterWrite encodes the full record), so
    // the seed must match that contract or superadmin sekolah
    // creation 422s with "Cabang tidak valid".
    'id' => SEED_BRANCH_ID,
    'kode' => SEED_BRANCH_KODE,
    'nama' => SEED_BRANCH_NAMA,
    'active' => true,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

$insertBranch = $pdo->prepare(
    'INSERT INTO cabang (id, kode, nama, active, version, payload) VALUES (:id, :kode, :nama, 1, 1, :payload)'
);
try {
    $insertBranch->execute([
        ':id' => SEED_BRANCH_ID,
        ':kode' => SEED_BRANCH_KODE,
        ':nama' => SEED_BRANCH_NAMA,
        ':payload' => $branchPayload,
    ]);
} catch (PDOException $e) {
    resetFail('insert cabang ' . SEED_BRANCH_ID, $e->getMessage());
}

// Record a single migration entry so the migrations table reflects that the
// canonical schema was applied. schema_migrations is left empty — the
// production migration runner (server/tests/schema.migration.php) is the
// authority for that table.
try {
    $pdo->prepare(
        'INSERT INTO migrations (version, source_checksum) VALUES (:version, :checksum)'
    )->execute([
        ':version' => 'baseline-test-seed',
        ':checksum' => substr(sha1_file($schemaPath) ?: '', 0, 40),
    ]);
} catch (PDOException $e) {
    resetFail('insert migration row', $e->getMessage());
}

// ---------------------------------------------------------------------------
// Step 5: verify the canonical state matches the HY.0.1 VERIFY counts.
// `trainer` is verified separately below (D9.2 seeds the 2 rows the
// canonical trainer users reference — it is no longer expected-empty).
// ---------------------------------------------------------------------------
$userCount = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE username LIKE '%test.local'")->fetchColumn();
$branchCount = (int) $pdo->query("SELECT COUNT(*) FROM cabang WHERE id = '" . SEED_BRANCH_ID . "'")->fetchColumn();
$dataTableCounts = [];
foreach (['absensi','audit_log','backups','honor_payments','invoices','login_attempts','photo_uploads','sekolah','settings','siswa','spp_payments','sync_log'] as $t) {
    $dataTableCounts[$t] = (int) $pdo->query("SELECT COUNT(*) FROM {$t}")->fetchColumn();
}
$trainerCount = (int) $pdo->query("SELECT COUNT(*) FROM trainer")->fetchColumn();
$trainerDangling = (int) $pdo->query(
    "SELECT COUNT(*) FROM users WHERE active = 1 AND trainer_id IS NOT NULL AND trainer_id NOT IN (SELECT id FROM trainer)"
)->fetchColumn();

$elapsed = round(microtime(true) - $start, 2);

if ($userCount !== 4) {
    resetFail('verify users count', "expected 4 *.test.local users, got {$userCount}");
}
if ($branchCount !== 1) {
    resetFail('verify branch count', "expected 1 cbg-test-pusat row, got {$branchCount}");
}
foreach ($dataTableCounts as $t => $n) {
    if ($n !== 0) resetFail("verify empty table {$t}", "expected 0 rows, got {$n}");
}
if ($trainerCount !== 2) {
    resetFail('verify trainer count', "expected 2 seeded trainer rows (trn-test-1, trn-test-2), got {$trainerCount}");
}
if ($trainerDangling !== 0) {
    resetFail('verify trainer references', "expected 0 active users with a dangling trainer_id, got {$trainerDangling}");
}

echo "db:reset OK in {$elapsed}s\n";
echo "  users (%.test.local): {$userCount}\n";
echo "  cabang (cbg-test-pusat): {$branchCount}\n";
foreach ($dataTableCounts as $t => $n) {
    echo "  {$t}: {$n}\n";
}
echo "  trainer (seeded): {$trainerCount} (0 dangling refs)\n";
exit(0);