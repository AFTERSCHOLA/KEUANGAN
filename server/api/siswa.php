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

// cabangId is never trusted from the client for any action — see
// PRODUCTION_MILESTONES.md "siswa.cabangId — server derive, LOCKED".
if (array_key_exists('cabangId', $data)) {
    jsonResponse(['error' => 'cabangId tidak boleh dikirim — diturunkan otomatis dari sekolahId'], 422);
}
if (!isset($data['id']) || !is_string($data['id']) || trim($data['id']) === '') {
    jsonResponse(['error' => 'Record membutuhkan id'], 422);
}

$pdo = database();

if ($action === 'delete') {
    // Delete only needs id + ownership of the record's CURRENT branch —
    // there's no sekolahId/new-branch to derive here.
    // Matrix decision (locked): Admin Cabang may delete siswa scoped to
    // their own branch — same scope rule as create/update, no separate
    // carve-out. authorize.php already covers this generically.
    //
    // KNOWN GAP, not addressed here: no check for existing sppPayments /
    // absensi references to this siswa id before deleting. A hard delete
    // can leave those records pointing at an id that no longer exists.
    // See constants.js assertReferences() for where this matters during
    // migration/reconciliation (M6.1/M6.2).
    $stmt = $pdo->prepare('SELECT cabang_id FROM siswa WHERE id = :id');
    $stmt->execute([':id' => $data['id']]);
    $existing = $stmt->fetch();
    if ($existing === false) {
        jsonResponse(['error' => 'Siswa tidak ditemukan', 'id' => $data['id']], 422);
    }
    requireAuthorization('delete', 'siswa', ['cabangId' => $existing['cabang_id']], $user);

    $pdo->prepare('DELETE FROM siswa WHERE id = :id')->execute([':id' => $data['id']]);
    auditEvent('siswa_deleted', $user, 'siswa', $data['id'], ['cabangId' => $existing['cabang_id']]);
    jsonResponse(['ok' => true, 'id' => $data['id']], 200);
}

// --- create / update: both require sekolahId, both derive cabangId ---
if (!isset($data['sekolahId']) || !is_string($data['sekolahId']) || trim($data['sekolahId']) === '') {
    jsonResponse(['error' => 'Record membutuhkan sekolahId'], 422);
}
$stmt = $pdo->prepare('SELECT cabang_id FROM sekolah WHERE id = :id');
$stmt->execute([':id' => $data['sekolahId']]);
$newCabangId = $stmt->fetchColumn();
if ($newCabangId === false) {
    jsonResponse(['error' => 'sekolahId tidak ditemukan'], 422);
}

// Enrich BEFORE authorize() — recordOwnsBranch('siswa', $data, $user) reads
// $data['cabangId'], so it must see the server-derived value, never the
// client's raw body.
$record = $data;
$record['cabangId'] = $newCabangId;

if ($action === 'create') {
    requireAuthorization('create', 'siswa', $record, $user);
    try {
        $pdo->prepare('INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
            ->execute([
                ':id' => $record['id'],
                ':cabang_id' => $newCabangId,
                ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
    } catch (PDOException $error) {
        if (isDuplicate($error)) jsonResponse(['error' => 'ID sudah tersimpan', 'id' => $record['id']], 409);
        error_log('siswa.php insert failed: ' . $error->getMessage());
        jsonResponse(['error' => 'Gagal menyimpan record'], 500);
    }
    auditEvent('siswa_created', $user, 'siswa', $record['id'], ['cabangId' => $newCabangId]);
    jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $newCabangId], 201);
}

// --- update ------------------------------------------------------------
// Fetch the EXISTING record's branch first — authorization must check
// against where the record actually lives right now, not just where the
// client wants to move it to. This is what stops an admin_cabang from
// touching a student that already belongs to another branch.
$stmt = $pdo->prepare('SELECT cabang_id, version FROM siswa WHERE id = :id');
$stmt->execute([':id' => $record['id']]);
$existing = $stmt->fetch();
if ($existing === false) {
    jsonResponse(['error' => 'Siswa tidak ditemukan', 'id' => $record['id']], 422);
}
requireAuthorization('update', 'siswa', ['cabangId' => $existing['cabang_id']], $user);

// Second check, against the NEW (post-update) branch — this is what
// stops sekolahId from being used to "move" a student into a branch the
// caller doesn't own. For a scope-locked admin_cabang this collapses to
// "the new school's branch must equal their own branch", so a genuine
// cross-branch transfer isn't reachable through this endpoint at all —
// that needs a Superadmin action.
requireAuthorization('update', 'siswa', $record, $user);

// NOTE (M5.3 will extend this): no stale-version rejection yet — this
// unconditionally bumps version on every update. Optimistic-concurrency
// / conflict detection (comparing a client-sent expected version against
// the current one, returning 409 on mismatch) is explicitly scoped to
// M5.3 (Define outbox conflicts), which depends on this milestone.
try {
    $pdo->prepare('UPDATE siswa SET cabang_id = :cabang_id, payload = :payload, version = version + 1 WHERE id = :id')
        ->execute([
            ':id' => $record['id'],
            ':cabang_id' => $newCabangId,
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
} catch (PDOException $error) {
    error_log('siswa.php update failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal memperbarui record'], 500);
}

auditEvent('siswa_updated', $user, 'siswa', $record['id'], ['cabangId' => $newCabangId]);
jsonResponse(['ok' => true, 'id' => $record['id'], 'cabangId' => $newCabangId, 'version' => (int) $existing['version'] + 1], 200);