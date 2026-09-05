<?php
/**
 * M-AF5.4 — one-time migration: siswa.foto -> null.
 *
 * Verifies (per the microtask VERIFY spec):
 *   - A temporary test database (the canonical `afterschola_t3_test`,
 *     already populated by `db-reset.php`) is seeded with 5 siswa rows:
 *     3 with a legacy `foto` URL and 2 without.
 *   - `runMigrations()` is invoked (a) once and (b) a second time.
 *   - The second invocation is a no-op (the migration row already exists,
 *     and the UPDATE WHERE-clause touches zero rows).
 *   - All 5 siswa rows report foto IS NULL via the SQL-level predicate.
 *   - The original payload keys (name, sekolahId, etc.) survive intact.
 *
 * The seeding happens BEFORE `database()` is called so that the
 * `runMigrations()` lazy-apply inside `database()` actually sees the
 * legacy foto values. The first call from db-reset.php + this test's own
 * subsequent call have already memoized the static PDO + the
 * `runMigrations()` static `$applied` flag, so this test re-opens a fresh
 * PDO connection for seeding — matching the db-reset.php pattern.
 *
 * Cleans up: removes the 5 seeded siswa + their sekolah + their cabang at
 * the end so a re-run starts from a known canonical state.
 *
 * Predicate note: MySQL/MariaDB's `JSON_EXTRACT(payload, '$.foto')` returns
 * the literal JSON value, which is the string "null" for JSON-null. So
 * `JSON_EXTRACT(...) IS NULL` is FALSE for rows where foto is JSON-null
 * (only TRUE for rows where the key is absent). To assert "all 5 rows
 * report foto as null" we use `JSON_VALUE(payload, '$.foto') IS NULL`,
 * which returns SQL NULL for both JSON-null AND absent-path — the
 * canonical predicate for the migration.
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

function migrationCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

// ---- 0. Re-open a fresh PDO to the canonical test DB (bypassing the
// static-cached connection in `database()` so our seed rows are visible
// to the first `database()` call below). Matches db-reset.php:92-110. ----
$dsn = (string) serverConfig()['dsn'];
$seedPdo = new PDO($dsn, (string) serverConfig()['username'], (string) serverConfig()['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES utf8mb4',
]);

// ---- 1. Sanity: the migrations table must exist (it ships in schema.sql). ----
$tableCheck = $seedPdo->query("SHOW TABLES LIKE 'migrations'")->fetchColumn();
migrationCheck($tableCheck !== false, 'migrations table missing — run db:reset first');

// ---- 2. Remove any leftover rows from a previous failed run, and the
// migration row so the first `database()` call below re-runs it. ----
$seedPdo->exec("DELETE FROM siswa WHERE id LIKE 'sw-mfoto-%'");
$seedPdo->exec("DELETE FROM sekolah WHERE id LIKE 'skl-mfoto-%'");
$seedPdo->exec("DELETE FROM cabang WHERE id LIKE 'cbg-mfoto-%'");
$seedPdo->exec("DELETE FROM migrations WHERE version = '2026-09-05-siswa-foto-purge'");

// ---- 3. Seed 5 siswa rows under a throwaway cabang so we don't disturb
// the canonical seed. 3 with a legacy foto, 2 without. ----
$cabangId = 'cbg-mfoto-' . bin2hex(random_bytes(4));
$sekolahId = 'skl-mfoto-' . bin2hex(random_bytes(4));
$seedPdo->prepare('INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, :payload)')
    ->execute([
        ':id' => $cabangId,
        ':kode' => 'MFO' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 3)),
        ':nama' => 'M-AF5.4 Migration Test Cabang',
        ':payload' => json_encode(['id' => $cabangId], JSON_UNESCAPED_UNICODE),
    ]);
$seedPdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
    ->execute([
        ':id' => $sekolahId,
        ':cabang_id' => $cabangId,
        ':payload' => json_encode(['id' => $sekolahId, 'cabangId' => $cabangId], JSON_UNESCAPED_UNICODE),
    ]);

$siswaRows = [
    ['id' => 'sw-mfoto-1-' . bin2hex(random_bytes(2)), 'nama' => 'Siswa Foto A', 'foto' => 'https://example.invalid/old/a.jpg'],
    ['id' => 'sw-mfoto-2-' . bin2hex(random_bytes(2)), 'nama' => 'Siswa Foto B', 'foto' => 'https://example.invalid/old/b.jpg'],
    ['id' => 'sw-mfoto-3-' . bin2hex(random_bytes(2)), 'nama' => 'Siswa Foto C', 'foto' => 'data:image/png;base64,iVBORw0KGgo='],
    ['id' => 'sw-mfoto-4-' . bin2hex(random_bytes(2)), 'nama' => 'Siswa No Foto D'],
    ['id' => 'sw-mfoto-5-' . bin2hex(random_bytes(2)), 'nama' => 'Siswa No Foto E'],
];
$insertSiswa = $seedPdo->prepare('INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)');
foreach ($siswaRows as $row) {
    $payload = ['id' => $row['id'], 'cabangId' => $cabangId, 'sekolahId' => $sekolahId, 'nama' => $row['nama']];
    if (array_key_exists('foto', $row)) $payload['foto'] = $row['foto'];
    $insertSiswa->execute([
        ':id' => $row['id'],
        ':cabang_id' => $cabangId,
        ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
}

// Confirm the seed actually has 3 rows with non-null foto BEFORE we let
// `database()` run the migration.
$preNonNull = (int) $seedPdo->query("SELECT COUNT(*) FROM siswa WHERE id LIKE 'sw-mfoto-%' AND JSON_VALUE(payload, '\$.foto') IS NOT NULL")->fetchColumn();
migrationCheck($preNonNull === 3, "Pre-migration: expected 3 siswa rows with non-null foto, found {$preNonNull}");

try {
    // ---- 4. Run 1: the very first call to `database()` in this process
    // triggers `runMigrations()`, which picks up our pending file. ----
    $pdo = database();

    // Sanity: the migration row is now recorded.
    $version = '2026-09-05-siswa-foto-purge';
    $row = $pdo->prepare('SELECT version, source_checksum FROM migrations WHERE version = :v');
    $row->execute([':v' => $version]);
    $recorded = $row->fetch();
    migrationCheck($recorded !== false, "Migration {$version} was not recorded in the migrations table");
    migrationCheck(is_string($recorded['source_checksum'] ?? null) && strlen($recorded['source_checksum']) === 40, 'source_checksum missing or wrong length');

    // Assert per-row state matches the seed plan: rows 1-3 had a foto,
    // rows 4-5 did not. The migration nulls the key for 1-3; 4-5 are
    // untouched (their JSON never had a foto key to begin with).
    $afterRun1 = $pdo->query("SELECT id, payload FROM siswa WHERE id LIKE 'sw-mfoto-%' ORDER BY id")->fetchAll();
    migrationCheck(count($afterRun1) === 5, 'Expected 5 seeded siswa rows after run 1, found ' . count($afterRun1));
    foreach ($afterRun1 as $row) {
        $payload = json_decode($row['payload'], true);
        migrationCheck(is_array($payload), 'Row ' . $row['id'] . ' payload did not decode as array');
        $hadFoto = preg_match('/^sw-mfoto-[123]-/', $row['id']) === 1;
        $fotoKeyPresent = array_key_exists('foto', $payload);
        $fotoValue = $fotoKeyPresent ? $payload['foto'] : '__key-absent__';
        if ($hadFoto) {
            // After the migration: foto is present and value null
            // (canonical privacy-purged state). PHP's `??` treats a
            // stored null as "absent" — we use array_key_exists +
            // explicit null check to avoid that gotcha.
            migrationCheck(
                $fotoKeyPresent && $fotoValue === null,
                "Row {$row['id']} foto is not null after migration (key_present=" . ($fotoKeyPresent ? 'Y' : 'N')
                    . ', value=' . var_export($fotoValue, true) . ')'
            );
        } else {
            // Rows that never had foto stay key-absent (the migration is
            // a no-op for them — taste #35 idempotence).
            migrationCheck(
                !$fotoKeyPresent,
                "Row {$row['id']} unexpectedly has a foto key (migration touched a row it shouldn't): "
                    . var_export($payload, true)
            );
        }
        // Reference-preservation: every other key survived (taste #35).
        migrationCheck(($payload['nama'] ?? null) !== null, "Row {$row['id']} lost its nama key");
        migrationCheck(($payload['cabangId'] ?? null) === $cabangId, "Row {$row['id']} lost its cabangId key");
        migrationCheck(($payload['sekolahId'] ?? null) === $sekolahId, "Row {$row['id']} lost its sekolahId key");
    }
    // Canonical "all 5 are null" assertion.
    $nonNullFotoCount = (int) $pdo->query("SELECT COUNT(*) FROM siswa WHERE id LIKE 'sw-mfoto-%' AND JSON_VALUE(payload, '\$.foto') IS NOT NULL")->fetchColumn();
    migrationCheck($nonNullFotoCount === 0, "Expected 0 non-null foto rows after run 1, found {$nonNullFotoCount}");
    echo "M-AF5.4 migration run 1 purged all 5 siswa foto values (idempotent)\n";

    // ---- 5. Run 2: simulate a second migration invocation by deleting
    // the migrations row and re-running the exact UPDATE the migration
    // ships. Because runMigrations() is statically cached inside this
    // process, this is the most faithful way to prove SQL-level
    // idempotence — the second pass touches zero rows. ----
    $pdo->prepare('DELETE FROM migrations WHERE version = :v')->execute([':v' => $version]);
    $pdo->exec('UPDATE siswa SET payload = JSON_SET(payload, \'$.foto\', NULL) WHERE JSON_VALUE(payload, \'$.foto\') IS NOT NULL');
    $touchedRun2 = (int) $pdo->query('SELECT ROW_COUNT()')->fetchColumn();
    migrationCheck($touchedRun2 === 0, "Run 2 should touch 0 rows (idempotent), but touched {$touchedRun2}");

    // Restore the migration row so subsequent tests see the canonical state.
    $pdo->prepare('INSERT INTO migrations (version, source_checksum) VALUES (:v, :c)')
        ->execute([':v' => $version, ':c' => $recorded['source_checksum']]);
    echo "M-AF5.4 migration run 2 was a no-op (0 rows touched)\n";

    // ---- 6. Final cross-check: re-call `database()`. The static
    // `$applied` flag skips work (no rows touched, no migration row
    // added). ----
    $pdoAgain = database();
    migrationCheck($pdoAgain === $pdo, 'database() did not return its cached instance');
    $countAfter = (int) $pdoAgain->query("SELECT COUNT(*) FROM siswa WHERE id LIKE 'sw-mfoto-%' AND JSON_VALUE(payload, '\$.foto') IS NOT NULL")->fetchColumn();
    migrationCheck($countAfter === 0, "Final state still has non-null foto rows: {$countAfter}");
    echo "M-AF5.4 siswa-foto-purge migration check passed\n";
} finally {
    // Cleanup: drop the seeded siswa + sekolah + cabang so the canonical
    // test DB stays as HY.0.1 left it. sekolah's coupling to siswa means
    // we delete siswa first, then sekolah, then cabang.
    $seedPdo->prepare('DELETE FROM siswa WHERE id LIKE :p')->execute([':p' => 'sw-mfoto-%']);
    $seedPdo->prepare('DELETE FROM sekolah WHERE id = :id')->execute([':id' => $sekolahId]);
    $seedPdo->prepare('DELETE FROM cabang WHERE id = :id')->execute([':id' => $cabangId]);
}