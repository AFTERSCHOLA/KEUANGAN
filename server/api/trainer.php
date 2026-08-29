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
    $stmt = $pdo->prepare('SELECT cabang_id FROM trainer WHERE id = :id');
    $stmt->execute([':id' => $data['id']]);
    $existing = $stmt->fetch();
    if ($existing === false) {
        jsonResponse(['error' => 'Trainer tidak ditemukan', 'id' => $data['id']], 422);
    }
    // NULL cabang_id: recordOwnsBranch() returns false for a non-string
    // target, so an admin_cabang can never pass this check on an
    // unassigned trainer — only superadmin (bypasses authorize entirely)
    // can touch those, until the trainer is assigned a branch. Intended,
    // not a bug — same reasoning applies to update below.
    requireAuthorization('delete', 'trainer', ['cabangId' => $existing['cabang_id']], $user);

    // KNOWN GAP (same class as siswa/sekolah delete): no check for
    // sekolah.trainerIds, absensi.trainerId, or honorPayments.trainerId
    // referencing this trainer before deleting. See
    // PRODUCTION_MILESTONES.md known issues.
    $pdo->prepare('DELETE FROM trainer WHERE id = :id')->execute([':id' => $data['id']]);
    auditEvent('trainer_deleted', $user, 'trainer', $data['id'], ['cabangId' => $existing['cabang_id']]);
    jsonResponse(['ok' => true, 'id' => $data['id']], 200);
}

// --- cabangId authority depends on role (same pattern as sekolah.php) --
// Admin Cabang can only ever manage trainers in their own branch — their
// session cabangId IS the authority, never the client's. Any cabangId key
// present in the body is rejected outright, even if it happens to match.
// Superadmin has no fixed branch and must name one explicitly, validated
// against the cabang table.
if (($user['role'] ?? null) === 'admin_cabang') {
    if (array_key_exists('cabangId', $data)) {
        jsonResponse(['error' => 'cabangId tidak boleh dikirim'], 422);
    }
    $cabangId = $user['cabangId'] ?? null;
    if (!is_string($cabangId) || $cabangId === '') {
        jsonResponse(['error' => 'Sesi tidak memiliki cabang yang valid'], 422);
    }
} else {
    if (!isset($data['cabangId']) || !is_string($data['cabangId']) || trim($data['cabangId']) === '') {
        jsonResponse(['error' => 'Record membutuhkan cabangId'], 422);
    }
    $check = $pdo->prepare('SELECT 1 FROM cabang WHERE id = :id');
    $check->execute([':id' => $data['cabangId']]);
    if ($check->fetchColumn() === false) {
        jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
    }
    $cabangId = $data['cabangId'];
}

$record = $data;
$record['cabangId'] = $cabangId;

if ($action === 'create') {
    requireAuthorization('create', 'trainer', $record, $user);
    try {
        $pdo->prepare('INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
            ->execute([
                ':id' => $record['id'],
                ':cabang_id' => $cabangId,
                ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
    } catch (PDOException $error) {
        if (isDuplicate($error)) jsonResponse(['error' => 'ID sudah tersimpan', 'id' => $record['id']], 409);
        error_log('trainer.php insert failed: ' . $error->getMessage());
        jsonResponse(['error' => 'Gagal menyimpan record'], 500);
    }
    auditEvent('trainer_created', $user, 'trainer', $record['id'], ['cabangId' => $cabangId]);
    jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $cabangId], 201);
}

// --- update --------------------------------------------------------------
$stmt = $pdo->prepare('SELECT cabang_id, version FROM trainer WHERE id = :id');
$stmt->execute([':id' => $record['id']]);
$existing = $stmt->fetch();
if ($existing === false) {
    jsonResponse(['error' => 'Trainer tidak ditemukan', 'id' => $record['id']], 422);
}
requireAuthorization('update', 'trainer', ['cabangId' => $existing['cabang_id']], $user);
requireAuthorization('update', 'trainer', $record, $user);

try {
    $pdo->prepare('UPDATE trainer SET cabang_id = :cabang_id, payload = :payload, version = version + 1 WHERE id = :id')
        ->execute([
            ':id' => $record['id'],
            ':cabang_id' => $cabangId,
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
} catch (PDOException $error) {
    error_log('trainer.php update failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal memperbarui record'], 500);
}

auditEvent('trainer_updated', $user, 'trainer', $record['id'], ['cabangId' => $cabangId]);
jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $cabangId, 'version' => (int) $existing['version'] + 1], 200);