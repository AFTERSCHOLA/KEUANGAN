<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

// ============================================================
// Manual seed for tests/fixtures.js TEST_USERS.
// Run this once (or whenever the test DB is wiped) to populate the
// 4 users + supporting cabang/trainer rows that loginViaApi() expects.
// This is NOT part of the original team's seed script (that one only
// exists on a teammate's machine) — this is a reconstruction based on
// the credentials documented in tests/fixtures.js.
// ============================================================

$pdo = database();

function upsertCabang(PDO $pdo, string $id, string $kode, string $nama): void {
    $stmt = $pdo->prepare('SELECT 1 FROM cabang WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if ($stmt->fetchColumn() !== false) {
        echo "cabang $id already exists, skipping\n";
        return;
    }
    $pdo->prepare("INSERT INTO cabang (id, kode, nama, version, payload) VALUES (:id, :kode, :nama, 1, :payload)")
        ->execute([
            ':id' => $id,
            ':kode' => $kode,
            ':nama' => $nama,
            ':payload' => json_encode(['id' => $id, 'kode' => $kode, 'nama' => $nama], JSON_UNESCAPED_UNICODE),
        ]);
    echo "cabang $id created\n";
}

function upsertTrainer(PDO $pdo, string $id, string $cabangId, string $nama): void {
    $stmt = $pdo->prepare('SELECT 1 FROM trainer WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if ($stmt->fetchColumn() !== false) {
        echo "trainer $id already exists, skipping\n";
        return;
    }
    $record = ['id' => $id, 'nama' => $nama, 'wa' => '628123456789', 'jadwal' => 'Senin', 'honor' => 50000, 'sekolahIds' => [], 'cabangId' => $cabangId];
    $pdo->prepare("INSERT INTO trainer (id, cabang_id, version, payload) VALUES (:id, :cabang_id, 1, :payload)")
        ->execute([
            ':id' => $id,
            ':cabang_id' => $cabangId,
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE),
        ]);
    echo "trainer $id created\n";
}

function upsertUser(PDO $pdo, string $id, string $username, string $displayName, string $password, string $role, ?string $cabangId, ?string $trainerId, bool $mustChangePassword = false): void {
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = :u');
    $stmt->execute([':u' => $username]);
    $existing = $stmt->fetchColumn();

    $hash = password_hash($password, PASSWORD_DEFAULT);

    if ($existing !== false) {
        // Update the password hash + role/scope so re-running this script
        // after a partial DB wipe still leaves credentials matching fixtures.js.
        $pdo->prepare('UPDATE users SET password_hash = :h, display_name = :d, role = :r, cabang_id = :c, trainer_id = :t, active = 1, must_change_password = :m WHERE username = :u')
            ->execute([
                ':h' => $hash, ':d' => $displayName, ':r' => $role,
                ':c' => $cabangId, ':t' => $trainerId, ':m' => $mustChangePassword ? 1 : 0,
                ':u' => $username,
            ]);
        echo "user $username updated\n";
        return;
    }

    $pdo->prepare(
        'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password)
         VALUES (:id, :u, :d, :h, :r, :c, :t, 1, :m)'
    )->execute([
        ':id' => $id, ':u' => $username, ':d' => $displayName, ':h' => $hash,
        ':r' => $role, ':c' => $cabangId, ':t' => $trainerId, ':m' => $mustChangePassword ? 1 : 0,
    ]);
    echo "user $username created\n";
}

// --- Supporting records ---
upsertCabang($pdo, 'cbg-test-pusat', 'TSP', 'Cabang Test Pusat');
upsertTrainer($pdo, 'trn-test-1', 'cbg-test-pusat', 'Trainer Test Satu');

// --- The 4 users fixtures.js expects ---
upsertUser($pdo, 'usr-test-superadmin', 'superadmin@test.local', 'Superadmin Test', 'SuperTest123!X', 'superadmin', null, null);
upsertUser($pdo, 'usr-test-admincabang', 'admin.cabang@test.local', 'Admin Cabang Test', 'CabangTest123!X', 'admin_cabang', 'cbg-test-pusat', null);
upsertUser($pdo, 'usr-test-trainer', 'trainer@test.local', 'Trainer Test', 'TrainerTest123!X', 'trainer', null, 'trn-test-1');
upsertUser($pdo, 'usr-test-trainer-mustchange', 'trainer.must@test.local', 'Trainer Must Change', 'MustChange123!X', 'trainer', null, 'trn-test-1', mustChangePassword: true);

echo "\nDone. Run this again any time the test DB is reset.\n";