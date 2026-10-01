<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$pdo = database();

// --- Part 1: schema.sql applies twice without destructive differences ---
$schemaSql = file_get_contents(__DIR__ . '/../schema.sql');
check($schemaSql !== false, 'Could not read schema.sql');

function tableColumns(PDO $pdo, string $table): array {
    $stmt = $pdo->query("SHOW COLUMNS FROM `{$table}`");
    return array_map(fn($row) => $row['Field'] . ':' . $row['Type'], $stmt->fetchAll());
}

function applySchema(PDO $pdo, string $sql): void {
    // Naive split on statement-terminating ";\n". Safe here because
    // schema.sql contains only CREATE TABLE DDL, no string literals
    // containing a semicolon.
    $statements = array_filter(array_map('trim', explode(";\n", $sql)));
    foreach ($statements as $statement) {
        if ($statement === '') continue;
        $pdo->exec($statement);
    }
}

$tables = ['users', 'cabang', 'audit_log', 'login_attempts', 'schema_migrations', 'absensi', 'sekolah', 'trainer', 'siswa'];

$before = [];
foreach ($tables as $table) $before[$table] = tableColumns($pdo, $table);

applySchema($pdo, $schemaSql);

$after = [];
foreach ($tables as $table) $after[$table] = tableColumns($pdo, $table);

foreach ($tables as $table) {
    check($before[$table] === $after[$table], "Applying schema.sql twice changed columns on {$table}");
}
echo "M2.1 schema idempotency check passed\n";

// --- Part 2: duplicate usernames are rejected ---
$username = 'm21-test-' . bin2hex(random_bytes(4));
$id1 = 'usr-' . bin2hex(random_bytes(8));
$id2 = 'usr-' . bin2hex(random_bytes(8));

$insert = $pdo->prepare("INSERT INTO users (id, username, display_name, password_hash, role, active, must_change_password) VALUES (:id, :username, :display_name, :password_hash, 'trainer', 1, 1)");
$insert->execute([
    ':id' => $id1,
    ':username' => $username,
    ':display_name' => 'M2.1 Test User',
    ':password_hash' => password_hash('Placeholder123', PASSWORD_DEFAULT),
]);

try {
    $insert->execute([
        ':id' => $id2,
        ':username' => $username,
        ':display_name' => 'M2.1 Test User Duplicate',
        ':password_hash' => password_hash('Placeholder123', PASSWORD_DEFAULT),
    ]);
    throw new RuntimeException('Duplicate username was accepted');
} catch (PDOException $error) {
    check($error->getCode() === '23000', 'Duplicate username failed with unexpected error: ' . $error->getMessage());
}

// Cleanup — leave the test database as we found it.
$pdo->prepare('DELETE FROM users WHERE id = :id')->execute([':id' => $id1]);

echo "M2.1 duplicate-username check passed\n";

// --- Part 3: AA.A.1 service_tokens (Hybrid-Opaque service tokens) ---
try {
    $serviceColumns = tableColumns($pdo, 'service_tokens');
} catch (PDOException $error) {
    throw new RuntimeException('service_tokens table is missing');
}
check(count($serviceColumns) > 0, 'service_tokens table has no columns');

$serviceIndexRows = $pdo->query('SHOW INDEX FROM `service_tokens`')->fetchAll();
$uniqueSingleCols = [];
foreach ($serviceIndexRows as $row) {
    if ((int) $row['Non_unique'] === 0 && $row['Key_name'] !== 'PRIMARY') {
        $uniqueSingleCols[$row['Key_name']][] = $row['Column_name'];
    }
}
$uniqueCols = [];
foreach ($uniqueSingleCols as $cols) {
    if (count($cols) === 1) $uniqueCols[] = $cols[0];
}
check(in_array('prefix', $uniqueCols, true), 'service_tokens.prefix lacks UNIQUE');
check(in_array('token_hash', $uniqueCols, true), 'service_tokens.token_hash lacks UNIQUE');

echo "AA.A.1 service_tokens unique(prefix, token_hash) check passed\n";

// Idempotency: re-applying the migration + schema changes nothing.
$serviceIndexSig = fn(array $rows): array => array_map(
    fn($row) => $row['Key_name'] . ':' . $row['Column_name'] . ':' . $row['Non_unique'] . ':' . ($row['Seq_in_index'] ?? ''),
    $rows
);
$beforeService = $serviceColumns;
$beforeServiceIndexes = $serviceIndexSig($serviceIndexRows);

$migrationSql = file_get_contents(__DIR__ . '/../migrations/2026-09-24-service-tokens.sql');
check($migrationSql !== false, 'Could not read 2026-09-24-service-tokens.sql migration');
applySchema($pdo, $migrationSql);
applySchema($pdo, $schemaSql);

$afterService = tableColumns($pdo, 'service_tokens');
$afterServiceIndexes = $serviceIndexSig($pdo->query('SHOW INDEX FROM `service_tokens`')->fetchAll());
check($beforeService === $afterService, 'Re-applying service_tokens migration changed columns');
check($beforeServiceIndexes === $afterServiceIndexes, 'Re-applying service_tokens migration changed indexes');

echo "AA.A.1 service_tokens idempotency check passed\n";