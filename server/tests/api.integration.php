<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

$pdo = database();
$record = [
    'id' => 'abs-integration-' . bin2hex(random_bytes(4)),
    'tanggal' => '2026-08-20',
    'sekolahId' => 'skl-test',
    'trainerId' => 'trn-test',
    'siswaList' => [],
];

$stmt = $pdo->prepare('INSERT INTO absensi (id, payload) VALUES (:id, :payload)');
$stmt->execute([
    ':id' => $record['id'],
    ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
]);

try {
    $stmt->execute([
        ':id' => $record['id'],
        ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    throw new RuntimeException('Duplicate ID was accepted');
} catch (PDOException $error) {
    if (!isDuplicate($error)) throw $error;
}

$count = (int) $pdo->query("SELECT COUNT(*) FROM absensi WHERE id = " . $pdo->quote($record['id']))->fetchColumn();
if ($count !== 1) throw new RuntimeException('Expected exactly one row after duplicate POST');
echo "M7.2.2 duplicate-ID check passed\n";
