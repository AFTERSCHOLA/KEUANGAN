<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/backupRestore.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

// 'restore' is already in authorize.php's deny-list from the start
// (G0.2/M3.1) — every role except superadmin is rejected here before any
// resource-specific check runs. No authorize.php edit needed for this one.
requireAuthorization('restore', 'backups', [], $user);

// Deliberately NOT using requestJson() — that helper enforces
// Content-Type: application/json and a 2MB body cap (bootstrap.php), and
// a full-database restore file can easily exceed 2MB for a real dataset.
// This endpoint instead expects multipart/form-data with a file field
// named 'backupFile' (a plain <input type="file">), sized against PHP's
// own upload_max_filesize/post_max_size ini directives — confirm those
// during D7.1/D7.2, cPanel's default PHP config may set them lower than
// a real backup needs.
if (!isset($_FILES['backupFile']) || $_FILES['backupFile']['error'] !== UPLOAD_ERR_OK) {
    jsonResponse(['error' => 'File backup tidak ditemukan atau gagal di-upload'], 422);
}

$raw = file_get_contents($_FILES['backupFile']['tmp_name']);
if ($raw === false) {
    jsonResponse(['error' => 'Gagal membaca file yang di-upload'], 422);
}

$snapshot = json_decode($raw, true);
if (!is_array($snapshot)) {
    jsonResponse(['error' => 'File bukan JSON yang valid'], 422);
}

$pdo = database();

try {
    $counts = restoreFromSnapshot($pdo, $snapshot, $user);
} catch (InvalidArgumentException $error) {
    jsonResponse(['error' => $error->getMessage()], 422);
} catch (Throwable $error) {
    error_log('restore.php failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal melakukan restore, tidak ada perubahan disimpan (transaksi di-rollback)'], 500);
}

jsonResponse(['ok' => true, 'counts' => $counts], 200);