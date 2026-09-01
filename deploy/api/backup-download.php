<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/backupRestore.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireAuthorization('manage_backup', 'backups', [], $user);

$id = $_GET['id'] ?? null;
if (!is_string($id) || trim($id) === '') {
    jsonResponse(['error' => 'id wajib diisi'], 422);
}

$pdo = database();
$stmt = $pdo->prepare('SELECT id, checksum, location FROM backups WHERE id = :id');
$stmt->execute([':id' => $id]);
$row = $stmt->fetch();
if ($row === false) {
    jsonResponse(['error' => 'Backup tidak ditemukan'], 422);
}

// `location` is stored as a bare filename (see backupRestore.php's
// createBackup()) specifically so it can't be used for path traversal —
// reject defensively anyway in case an old/manually-edited row has
// something else in it.
$filename = $row['location'];
if (strpos($filename, '/') !== false || strpos($filename, '\\') !== false || strpos($filename, '..') !== false) {
    error_log("backup-download.php: suspicious location value for backup {$row['id']}: $filename");
    jsonResponse(['error' => 'Backup tidak valid'], 500);
}

$path = backupStorageDir() . DIRECTORY_SEPARATOR . $filename;
if (!is_file($path)) {
    jsonResponse(['error' => 'File backup tidak ditemukan di disk'], 404);
}

$content = file_get_contents($path);
if ($content === false) {
    jsonResponse(['error' => 'Gagal membaca file backup'], 500);
}

// Verify integrity before serving — if the on-disk file was tampered with
// or corrupted since it was written, don't hand it out silently.
if (hash('sha256', $content) !== $row['checksum']) {
    error_log("backup-download.php: checksum mismatch for backup {$row['id']}");
    jsonResponse(['error' => 'Checksum backup tidak cocok, file mungkin rusak'], 500);
}

$pdo->prepare('UPDATE backups SET verified_at = NOW() WHERE id = :id')->execute([':id' => $row['id']]);

header('Content-Type: application/json; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $row['id'] . '.json"');
header('Content-Length: ' . strlen($content));
echo $content;
exit;