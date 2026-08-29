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
    $stmt = $pdo->prepare('SELECT cabang_id FROM sekolah WHERE id = :id');
    $stmt->execute([':id' => $data['id']]);
    $existing = $stmt->fetch();
    if ($existing === false) {
        jsonResponse(['error' => 'Sekolah tidak ditemukan', 'id' => $data['id']], 422);
    }
    requireAuthorization('delete', 'sekolah', ['cabangId' => $existing['cabang_id']], $user);

    // KNOWN GAP (same class as siswa delete): no check for trainer.sekolahIds,
    // siswa.sekolahId, or invoices.sekolahId referencing this school before
    // deleting. See PRODUCTION_MILESTONES.md known issues.
    $pdo->prepare('DELETE FROM sekolah WHERE id = :id')->execute([':id' => $data['id']]);
    auditEvent('sekolah_deleted', $user, 'sekolah', $data['id'], ['cabangId' => $existing['cabang_id']]);
    jsonResponse(['ok' => true, 'id' => $data['id']], 200);
}

// --- cabangId authority depends on role ---------------------------------
// Admin Cabang can only ever manage schools in their own branch — their
// session cabangId IS the authority, never the client's. Consistent with
// siswa.php: any cabangId key present in the body is rejected outright,
// not silently accepted even if it happens to match.
// Superadmin has no fixed branch, so they must name one explicitly,
// validated against the cabang table.
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
    requireAuthorization('create', 'sekolah', $record, $user);
    try {
        $pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
            ->execute([
                ':id' => $record['id'],
                ':cabang_id' => $cabangId,
                ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
    } catch (PDOException $error) {
        if (isDuplicate($error)) jsonResponse(['error' => 'ID sudah tersimpan', 'id' => $record['id']], 409);
        error_log('sekolah.php insert failed: ' . $error->getMessage());
        jsonResponse(['error' => 'Gagal menyimpan record'], 500);
    }
    auditEvent('sekolah_created', $user, 'sekolah', $record['id'], ['cabangId' => $cabangId]);
    jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $cabangId], 201);
}

// --- update --------------------------------------------------------------
// Fetch the EXISTING record's branch first — same reasoning as siswa.php:
// authorization must check where the record actually lives right now.
$stmt = $pdo->prepare('SELECT cabang_id, version FROM sekolah WHERE id = :id');
$stmt->execute([':id' => $record['id']]);
$existing = $stmt->fetch();
if ($existing === false) {
    jsonResponse(['error' => 'Sekolah tidak ditemukan', 'id' => $record['id']], 422);
}
requireAuthorization('update', 'sekolah', ['cabangId' => $existing['cabang_id']], $user);
requireAuthorization('update', 'sekolah', $record, $user);

try {
    $pdo->prepare('UPDATE sekolah SET cabang_id = :cabang_id, payload = :payload, version = version + 1 WHERE id = :id')
        ->execute([
            ':id' => $record['id'],
            ':cabang_id' => $cabangId,
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
} catch (PDOException $error) {
    error_log('sekolah.php update failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal memperbarui record'], 500);
}

auditEvent('sekolah_updated', $user, 'sekolah', $record['id'], ['cabangId' => $cabangId]);
jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $cabangId, 'version' => (int) $existing['version'] + 1], 200);