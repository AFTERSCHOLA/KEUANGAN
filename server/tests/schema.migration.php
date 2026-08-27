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