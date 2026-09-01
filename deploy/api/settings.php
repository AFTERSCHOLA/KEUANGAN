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
    $stmt = $pdo->prepare('SELECT cabang_id FROM settings WHERE id = :id');
    $stmt->execute([':id' => $data['id']]);
    $existing = $stmt->fetch();
    if ($existing === false) {
        jsonResponse(['error' => 'Setting tidak ditemukan', 'id' => $data['id']], 422);
    }
    // 'manage_settings' is in authorize()'s deny-list — every role except
    // superadmin is rejected before any resource logic runs, mirroring how
    // 'manage_branch' gates cabang.php. This is a second, independent lock
    // on top of roleCanReadEntity()'s 'settings' exclusion, not a
    // replacement for it.
    requireAuthorization('manage_settings', 'settings', ['cabangId' => $existing['cabang_id']], $user);

    $pdo->prepare('DELETE FROM settings WHERE id = :id')->execute([':id' => $data['id']]);
    auditEvent('settings_deleted', $user, 'settings', $data['id'], ['cabangId' => $existing['cabang_id']]);
    jsonResponse(['ok' => true, 'id' => $data['id']], 200);
}

// --- cabangId: optional, NOT an authorization boundary here ---------------
// Unlike sekolah.php/siswa.php, 'settings' isn't branch-scoped for access
// control — only superadmin can ever reach past requireAuthorization()
// below, regardless of cabangId. This field is kept purely for a possible
// future per-branch setting; when present it's validated for referential
// integrity only (must point at a real cabang), never used to widen or
// narrow who's allowed to write.
if (array_key_exists('cabangId', $data) && $data['cabangId'] !== null) {
    if (!is_string($data['cabangId']) || trim($data['cabangId']) === '') {
        jsonResponse(['error' => 'cabangId tidak valid'], 422);
    }
    $check = $pdo->prepare('SELECT 1 FROM cabang WHERE id = :id');
    $check->execute([':id' => $data['cabangId']]);
    if ($check->fetchColumn() === false) {
        jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
    }
    $cabangId = $data['cabangId'];
} else {
    $cabangId = null;
}

$record = $data;
$record['cabangId'] = $cabangId;

if ($action === 'create') {
    requireAuthorization('manage_settings', 'settings', $record, $user);
    try {
        $pdo->prepare('INSERT INTO settings (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
            ->execute([
                ':id' => $record['id'],
                ':cabang_id' => $cabangId,
                ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
    } catch (PDOException $error) {
        if (isDuplicate($error)) jsonResponse(['error' => 'ID sudah tersimpan', 'id' => $record['id']], 409);
        error_log('settings.php insert failed: ' . $error->getMessage());
        jsonResponse(['error' => 'Gagal menyimpan record'], 500);
    }
    auditEvent('settings_created', $user, 'settings', $record['id'], ['cabangId' => $cabangId]);
    jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $cabangId], 201);
}

// --- update -----------------------------------------------------------
// Fetch the EXISTING record first, same reasoning as sekolah.php/siswa.php:
// authorization checks the record's current state, not just the incoming
// body. For settings this collapses to "must be superadmin" either way,
// but keeping the two-check shape avoids this file silently drifting from
// the established pattern if settings ever becomes branch-scoped later.
$stmt = $pdo->prepare('SELECT cabang_id, version FROM settings WHERE id = :id');
$stmt->execute([':id' => $record['id']]);
$existing = $stmt->fetch();
if ($existing === false) {
    jsonResponse(['error' => 'Setting tidak ditemukan', 'id' => $record['id']], 422);
}
requireAuthorization('manage_settings', 'settings', ['cabangId' => $existing['cabang_id']], $user);
requireAuthorization('manage_settings', 'settings', $record, $user);

try {
    $pdo->prepare('UPDATE settings SET cabang_id = :cabang_id, payload = :payload, version = version + 1 WHERE id = :id')
        ->execute([
            ':id' => $record['id'],
            ':cabang_id' => $cabangId,
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
} catch (PDOException $error) {
    error_log('settings.php update failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal memperbarui record'], 500);
}

auditEvent('settings_updated', $user, 'settings', $record['id'], ['cabangId' => $cabangId]);
jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $cabangId, 'version' => (int) $existing['version'] + 1], 200);