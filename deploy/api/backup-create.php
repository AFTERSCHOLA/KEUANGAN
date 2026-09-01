<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/backupRestore.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

// 'manage_backup' needs to be added to authorize.php's deny-list (same
// shape as 'manage_settings') — see the required authorize.php edit noted
// alongside this file.
requireAuthorization('manage_backup', 'backups', [], $user);

$pdo = database();

try {
    $backup = createBackup($pdo, $user);
} catch (Throwable $error) {
    error_log('backup-create.php failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal membuat backup'], 500);
}

// Stream the JSON as a download in the same request that created it —
// matches the UI's single "Unduh Backup" button. The file also stays on
// disk (tracked in `backups`) so it can be re-downloaded later via
// backup-download.php without regenerating.
header('Content-Type: application/json; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $backup['id'] . '.json"');
header('Content-Length: ' . strlen($backup['json']));
echo $backup['json'];
exit;