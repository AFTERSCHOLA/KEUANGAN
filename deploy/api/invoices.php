<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

$data = requestJson();
$action = $data['action'] ?? 'create';
if (!in_array($action, ['create', 'update', 'delete'], true)) {
    jsonResponse(['error' => 'Operasi tidak didukung'], 400);
}

if (!isset($data['id']) || !is_string($data['id']) || trim($data['id']) === '') {
    jsonResponse(['error' => 'Record membutuhkan id'], 422);
}

$pdo = database();

if ($action === 'delete') {
    $stmt = $pdo->prepare('SELECT cabang_id FROM invoices WHERE id = :id');
    $stmt->execute([':id' => $data['id']]);
    $existing = $stmt->fetch();
    if ($existing === false) {
        jsonResponse(['error' => 'Invoice tidak ditemukan', 'id' => $data['id']], 422);
    }
    // authorize.php's resource-specific block already rejects create/
    // update/delete/write on 'invoices' for admin_cabang outright (matrix:
    // read-only, "View/print own branch") — plain 'delete' is enough here,
    // no special action name needed like settings.php's 'manage_settings'.
    requireAuthorization('delete', 'invoices', ['cabangId' => $existing['cabang_id']], $user);

    $pdo->prepare('DELETE FROM invoices WHERE id = :id')->execute([':id' => $data['id']]);
    auditEvent('invoices_deleted', $user, 'invoices', $data['id'], ['cabangId' => $existing['cabang_id']]);
    jsonResponse(['ok' => true, 'id' => $data['id']], 200);
}

// --- cabangId: always explicit + validated --------------------------
// Unlike sekolah.php/trainer.php, admin_cabang never reaches this far —
// authorize.php denies create/update/delete/write on 'invoices' for that
// role before any scope check runs, so there's no "derive from session"
// branch to write. Only superadmin can ever get here, and cabang_id is
// NOT NULL on this table (unlike settings), so cabangId is always
// required and validated against the cabang table — same shape as
// sekolah.php's superadmin path.
if (!isset($data['cabangId']) || !is_string($data['cabangId']) || trim($data['cabangId']) === '') {
    jsonResponse(['error' => 'Record membutuhkan cabangId'], 422);
}
$check = $pdo->prepare('SELECT 1 FROM cabang WHERE id = :id');
$check->execute([':id' => $data['cabangId']]);
if ($check->fetchColumn() === false) {
    jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
}
$cabangId = $data['cabangId'];

$record = $data;
$record['cabangId'] = $cabangId;

if ($action === 'create') {
    requireAuthorization('create', 'invoices', $record, $user);
    try {
        $pdo->prepare('INSERT INTO invoices (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
            ->execute([
                ':id' => $record['id'],
                ':cabang_id' => $cabangId,
                ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
    } catch (PDOException $error) {
        if (isDuplicate($error)) jsonResponse(['error' => 'ID sudah tersimpan', 'id' => $record['id']], 409);
        error_log('invoices.php insert failed: ' . $error->getMessage());
        jsonResponse(['error' => 'Gagal menyimpan record'], 500);
    }
    auditEvent('invoices_created', $user, 'invoices', $record['id'], ['cabangId' => $cabangId]);
    jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $cabangId], 201);
}

// --- update -------------------------------------------------------------
$stmt = $pdo->prepare('SELECT cabang_id, version FROM invoices WHERE id = :id');
$stmt->execute([':id' => $record['id']]);
$existing = $stmt->fetch();
if ($existing === false) {
    jsonResponse(['error' => 'Invoice tidak ditemukan', 'id' => $record['id']], 422);
}
requireAuthorization('update', 'invoices', ['cabangId' => $existing['cabang_id']], $user);
requireAuthorization('update', 'invoices', $record, $user);

try {
    $pdo->prepare('UPDATE invoices SET cabang_id = :cabang_id, payload = :payload, version = version + 1 WHERE id = :id')
        ->execute([
            ':id' => $record['id'],
            ':cabang_id' => $cabangId,
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
} catch (PDOException $error) {
    error_log('invoices.php update failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal memperbarui record'], 500);
}

auditEvent('invoices_updated', $user, 'invoices', $record['id'], ['cabangId' => $cabangId]);
jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $cabangId, 'version' => (int) $existing['version'] + 1], 200);