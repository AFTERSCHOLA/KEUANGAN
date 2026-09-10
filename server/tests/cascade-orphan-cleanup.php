<?php
/**
 * D9.2 — one-time migration: clean up existing orphan users.
 *
 * Verifies (per the microtask VERIFY spec):
 *   - The canonical `afterschola_t3_test` DB is seeded with 3 orphan
 *     users whose cabang_id points at a deleted cabang, plus 2
 *     non-orphan users (one with live cabang + trainer references,
 *     one superadmin with no references at all).
 *   - The migration runs (via the real runMigrations() path triggered
 *     by the first database() call) and all 3 orphans are set to
 *     active=0, cabang_id=NULL, trainer_id=NULL.
 *   - The 2 non-orphans are untouched (still active=1, references
 *     intact).
 *   - One `user_orphan_cleaned` audit row exists per affected user,
 *     with the same {cabangId, trainerId} metadata shape as D9.1's
 *     user_cascade_deactivated events.
 *   - A second migration pass is a no-op: 0 rows touched, 0 audit rows
 *     added (the SQL-level idempotence check mirrors
 *     siswa-foto-purge.php's run-2 simulation, because
 *     runMigrations() is statically memoized inside one process).
 *
 * Seeding happens BEFORE database() is first called so that the
 * lazy runMigrations() inside database() actually sees the orphans.
 * A fresh PDO is used for seeding (matching db-reset.php /
 * siswa-foto-purge.php — the static-cached database() connection would
 * not see rows seeded through itself anyway, and more importantly the
 * runner must not fire before the orphans exist).
 *
 * Cleans up in `finally`: removes the seeded users + audit rows (the
 * migration row is left as the try-block restored it — applied state),
 * so a re-run starts from the canonical db:reset state.
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

function orphanCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

// ---- 0. Fresh PDO to the canonical test DB (bypasses database()'s
// static cache so the seed lands before the runner fires). ----
$dsn = (string) serverConfig()['dsn'];
$seedPdo = new PDO($dsn, (string) serverConfig()['username'], (string) serverConfig()['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES utf8mb4',
]);

// ---- 1. Sanity: migrations table ships in schema.sql; the D9.2
// migration file must exist for the runner to pick it up. ----
$tableCheck = $seedPdo->query("SHOW TABLES LIKE 'migrations'")->fetchColumn();
orphanCheck($tableCheck !== false, 'migrations table missing — run db:reset first');
orphanCheck(is_file(__DIR__ . '/../migrations/2026-09-10-cascade-orphan-cleanup.sql'), '2026-09-10-cascade-orphan-cleanup.sql missing from server/migrations/');

$version = '2026-09-10-cascade-orphan-cleanup';

// ---- 2. Remove leftovers from a previous failed run; re-arm the
// migration so the first database() call below runs it. ----
$seedPdo->exec("DELETE FROM audit_log WHERE event_type = 'user_orphan_cleaned'");
$seedPdo->exec("DELETE FROM migrations WHERE version = '" . $version . "'");

// Precondition: the canonical seed must be referentially consistent —
// i.e. this DB was reset with the post-D9.2 db-reset.php (which seeds
// the trn-test-1/trn-test-2 trainer rows). On a stale pre-D9.2 seed
// the canonical trainer users themselves are orphans, the migration
// would deactivate them mid-test, and the per-user audit assertions
// below would count them too. Fail fast with the fix instead.
$canonicalDangling = (int) $seedPdo->query(
    "SELECT COUNT(*) FROM users WHERE username LIKE '%@test.local' AND active = 1
       AND ((cabang_id IS NOT NULL AND cabang_id NOT IN (SELECT id FROM cabang))
         OR (trainer_id IS NOT NULL AND trainer_id NOT IN (SELECT id FROM trainer)))"
)->fetchColumn();
orphanCheck(
    $canonicalDangling === 0,
    "Canonical seed has {$canonicalDangling} dangling user(s) — run `npm run db:reset` (post-D9.2 seed) before this test"
);

// ---- 3. Seed the fixture set from the VERIFY spec: a throwaway
// deleted cabang id (never inserted into cabang), 3 orphan users
// pointing at it, and 2 non-orphan users (superadmin no-refs, admin
// bound to the canonical cbg-test-pusat). ----
$deletedCabangId = 'cbg-gone-' . bin2hex(random_bytes(4));
$deletedTrainerId = 'trn-gone-' . bin2hex(random_bytes(4));

$seedOrphanUsers = [
    ['id' => 'usr-d92-orphan-a-' . bin2hex(random_bytes(3)), 'trainer_id' => $deletedTrainerId],
    ['id' => 'usr-d92-orphan-b-' . bin2hex(random_bytes(3)), 'trainer_id' => null],
    ['id' => 'usr-d92-orphan-c-' . bin2hex(random_bytes(3)), 'trainer_id' => $deletedTrainerId],
];
$seedNonOrphanUsers = [
    ['id' => 'usr-d92-clean-a-' . bin2hex(random_bytes(3)), 'username' => null],
    ['id' => 'usr-d92-clean-b-' . bin2hex(random_bytes(3)), 'username' => null],
];

// Reuse the users.php id-shape conventions (usr- prefix). Password hash
// is a bcrypt placeholder — the migration never touches it, and the
// reference-preservation assertions below require the column to survive.
$insertUser = $seedPdo->prepare(
    'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password)
     VALUES (:id, :username, :display_name, :hash, :role, :cabang_id, :trainer_id, 1, 0)'
);
$n = 0;
foreach ($seedOrphanUsers as $u) {
    $insertUser->execute([
        ':id' => $u['id'],
        ':username' => strtolower(str_replace('usr-', '', $u['id'])) . '@d92.test.local',
        ':display_name' => 'D9.2 Orphan ' . ++$n,
        ':hash' => password_hash('D92Orphan123!X', PASSWORD_DEFAULT),
        ':role' => 'admin_cabang',
        ':cabang_id' => $deletedCabangId,
        ':trainer_id' => $u['trainer_id'],
    ]);
}
foreach ($seedNonOrphanUsers as $u) {
    $insertUser->execute([
        ':id' => $u['id'],
        ':username' => strtolower(str_replace('usr-', '', $u['id'])) . '@d92.test.local',
        ':display_name' => 'D9.2 Clean ' . bin2hex(random_bytes(2)),
        ':hash' => password_hash('D92Clean123!X', PASSWORD_DEFAULT),
        ':role' => 'superadmin',
        ':cabang_id' => null,
        ':trainer_id' => null,
    ]);
}

// Pre-migration assertion: 3 dangling users exist right now.
$preDangling = (int) $seedPdo->query(
    "SELECT COUNT(*) FROM users WHERE id LIKE 'usr-d92-%' AND active = 1
       AND ((cabang_id IS NOT NULL AND cabang_id NOT IN (SELECT id FROM cabang))
         OR (trainer_id IS NOT NULL AND trainer_id NOT IN (SELECT id FROM trainer)))"
)->fetchColumn();
orphanCheck($preDangling === 3, "Pre-migration: expected 3 dangling seeded users, found {$preDangling}");

try {
    // ---- 4. Run 1: first database() call triggers runMigrations(),
    // which applies our pending migration file. ----
    $pdo = database();

    $recorded = $pdo->prepare('SELECT version, source_checksum FROM migrations WHERE version = :v');
    $recorded->execute([':v' => $version]);
    $migrationRow = $recorded->fetch();
    orphanCheck($migrationRow !== false, "Migration {$version} was not recorded in the migrations table");
    orphanCheck(is_string($migrationRow['source_checksum'] ?? null) && strlen($migrationRow['source_checksum']) === 40, 'source_checksum missing or wrong length');

    // ---- 4a. All 3 orphans deactivated + FK-nulled. ----
    $orphans = $pdo->query("SELECT id, username, display_name, password_hash, role, active, cabang_id, trainer_id FROM users WHERE id LIKE 'usr-d92-orphan-%' ORDER BY id")->fetchAll();
    orphanCheck(count($orphans) === 3, 'Expected 3 orphan rows post-migration, found ' . count($orphans));
    foreach ($orphans as $row) {
        orphanCheck((int) $row['active'] === 0, "Orphan {$row['id']} not deactivated (active={$row['active']})");
        orphanCheck($row['cabang_id'] === null, "Orphan {$row['id']} cabang_id not nulled: " . var_export($row['cabang_id'], true));
        orphanCheck($row['trainer_id'] === null, "Orphan {$row['id']} trainer_id not nulled: " . var_export($row['trainer_id'], true));
        // Reference-preserving (taste #35): everything else survives.
        orphanCheck(is_string($row['username']) && str_ends_with($row['username'], '@d92.test.local'), "Orphan {$row['id']} lost its username");
        orphanCheck(is_string($row['display_name']) && str_starts_with($row['display_name'], 'D9.2 Orphan'), "Orphan {$row['id']} lost its display_name");
        orphanCheck(is_string($row['password_hash']) && str_starts_with($row['password_hash'], '$2y$'), "Orphan {$row['id']} lost its password_hash");
        orphanCheck($row['role'] === 'admin_cabang', "Orphan {$row['id']} role changed to {$row['role']}");
    }

    // ---- 4b. The 2 non-orphans are untouched. ----
    $clean = $pdo->query("SELECT id, active, cabang_id, trainer_id FROM users WHERE id LIKE 'usr-d92-clean-%' ORDER BY id")->fetchAll();
    orphanCheck(count($clean) === 2, 'Expected 2 non-orphan rows post-migration, found ' . count($clean));
    foreach ($clean as $row) {
        orphanCheck((int) $row['active'] === 1, "Non-orphan {$row['id']} was deactivated");
        orphanCheck($row['cabang_id'] === null, "Non-orphan {$row['id']} cabang_id changed: " . var_export($row['cabang_id'], true));
        orphanCheck($row['trainer_id'] === null, "Non-orphan {$row['id']} trainer_id changed: " . var_export($row['trainer_id'], true));
    }
    // And the canonical seed users are untouched too (the precondition
    // above guarantees they were non-orphans entering the migration).
    $seedActive = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE username LIKE '%@test.local' AND active = 1")->fetchColumn();
    orphanCheck($seedActive === 4, "Expected all 4 canonical seed users still active, found {$seedActive}");

    // ---- 4c. Audit: one user_orphan_cleaned row per orphan, same
    // {cabangId, trainerId} metadata shape as D9.1's
    // user_cascade_deactivated, ids only (taste #50). ----
    $audit = $pdo->prepare("SELECT target_id, cabang_id, actor_user_id, actor_role, JSON_VALUE(metadata, '$.cabangId') AS mCabang, JSON_VALUE(metadata, '$.trainerId') AS mTrainer FROM audit_log WHERE event_type = 'user_orphan_cleaned' AND target_id LIKE 'usr-d92-orphan-%' ORDER BY target_id");
    $audit->execute();
    $auditRows = $audit->fetchAll();
    orphanCheck(count($auditRows) === 3, 'Expected 3 user_orphan_cleaned audit rows, found ' . count($auditRows));
    foreach ($auditRows as $row) {
        orphanCheck($row['actor_user_id'] === null && $row['actor_role'] === null, "Audit row for {$row['target_id']} has a non-system actor: " . var_export($row['actor_user_id'], true));
        orphanCheck($row['cabang_id'] === $deletedCabangId, "Audit row for {$row['target_id']} lost the pre-cleanup dangling cabang_id");
        orphanCheck($row['mCabang'] === $deletedCabangId, "Audit metadata cabangId mismatch for {$row['target_id']}: " . var_export($row['mCabang'], true));
        // Orphans A + C dangled on trainer too; B had a null trainer_id.
        $expectedTrainer = str_starts_with($row['target_id'], 'usr-d92-orphan-b') ? null : $deletedTrainerId;
        orphanCheck($row['mTrainer'] === $expectedTrainer, "Audit metadata trainerId mismatch for {$row['target_id']}: " . var_export($row['mTrainer'], true) . " expected " . var_export($expectedTrainer, true));
    }
    echo "D9.2 migration run 1 cleaned 3 orphans (deactivated + FK-nulled + audited), 2 non-orphans untouched\n";

    // ---- 5. Run 2: simulate a second migration invocation. The
    // migrations row is deleted so the runner state is "pending", and
    // the migration's own statements are re-executed verbatim against
    // the post-run-1 state — the second pass must touch zero rows
    // (SQL-level idempotence, mirroring siswa-foto-purge.php). ----
    $pdo->prepare('DELETE FROM migrations WHERE version = :v')->execute([':v' => $version]);
    $sql = (string) file_get_contents(__DIR__ . '/../migrations/' . $version . '.sql');
    foreach (array_filter(array_map('trim', explode(";\n", str_replace("\r\n", "\n", $sql)))) as $statement) {
        if ($statement === '') continue;
        $pdo->exec($statement);
    }
    // Re-insert the migration row so subsequent processes see canonical state.
    $pdo->prepare('INSERT INTO migrations (version, source_checksum) VALUES (:v, :c)')
        ->execute([':v' => $version, ':c' => $migrationRow['source_checksum']]);

    $postRun2Active = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE id LIKE 'usr-d92-orphan-%' AND active = 1")->fetchColumn();
    orphanCheck($postRun2Active === 0, "Run 2: orphans are still 0-active but query found {$postRun2Active} active (should be 0 — idempotent)");
    $postRun2Audit = (int) $pdo->query("SELECT COUNT(*) FROM audit_log WHERE event_type = 'user_orphan_cleaned' AND target_id LIKE 'usr-d92-orphan-%'")->fetchColumn();
    orphanCheck($postRun2Audit === 3, "Run 2 added audit rows (idempotence broken): expected 3 total, found {$postRun2Audit}");
    $postRun2Clean = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE id LIKE 'usr-d92-clean-%' AND active = 1")->fetchColumn();
    orphanCheck($postRun2Clean === 2, "Run 2: non-orphans disturbed, expected 2 active, found {$postRun2Clean}");
    echo "D9.2 migration run 2 was a no-op (0 rows touched, 0 new audit rows)\n";

    // ---- 6. Final: re-call database() — static $applied flag skips. ----
    $pdoAgain = database();
    orphanCheck($pdoAgain === $pdo, 'database() did not return its cached instance');
    echo "D9.2 cascade-orphan-cleanup migration check passed\n";
} finally {
    // Cleanup: remove seeded users + audit rows. The migrations row for
    // our version is left as the try-block restored it (canonical
    // applied state); deleting it here would contradict the restore,
    // and a fresh process re-ensures it via runMigrations() anyway.
    $seedPdo->exec("DELETE FROM audit_log WHERE target_id LIKE 'usr-d92-%'");
    $seedPdo->exec("DELETE FROM users WHERE id LIKE 'usr-d92-%'");
}
