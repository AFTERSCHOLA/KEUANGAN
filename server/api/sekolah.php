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

    // M-AF5.7 — cascade cleanup. Surfaces referenced by the deleted sekolah
    // become FK-nulls rather than SQL-broken references or invisible
    // application-level orphans:
    //   * trainer.sekolahIds[]  — strip the id (application-level array)
    //   * siswa.sekolahId       — null inside the JSON payload (no SQL column)
    //   * invoices.sekolahId    — null inside the JSON payload (no SQL column)
    // All three UPDATEs are reference-preserving (only the FK field is
    // touched) and idempotent (the WHERE predicate skips rows that already
    // lost the reference). Per taste #35 we emit one audit event per
    // touched table only when rows were actually modified — no spurious
    // events on a second invocation.
    cascadeNullifySekolahReferences($data['id'], $user);

    $pdo->prepare('DELETE FROM sekolah WHERE id = :id')->execute([':id' => $data['id']]);
    auditEvent('sekolah_deleted', $user, 'sekolah', $data['id'], ['cabangId' => $existing['cabang_id']]);
    jsonResponse(['ok' => true, 'id' => $data['id']], 200);
}

/**
 * Walk the three tables whose payload stores a reference to this sekolah,
 * nullify the reference, and emit one audit event per touched table. The
 * helper is a no-op when the id is blank or none of the tables reference
 * it — making it safe to call repeatedly on the same id.
 */
function cascadeNullifySekolahReferences(string $sekolahId, array $user): void {
    if (trim($sekolahId) === '') return;
    $pdo = database();
    $sekolahIdEsc = $sekolahId;

    // ---- trainer.sekolahIds[] (application-level array, no SQL column).
    // JSON_SEARCH returns the JSON path of the matching element when one is
    // present, NULL otherwise — so a second pass over already-cleaned rows
    // short-circuits in the UPDATE itself (zero rows touched).
    $trainerTouched = 0;
    try {
        $rows = $pdo->prepare('SELECT id, payload FROM trainer WHERE JSON_SEARCH(payload, \'one\', :id, NULL, \'$.sekolahIds\') IS NOT NULL');
        $rows->execute([':id' => $sekolahIdEsc]);
        $upd = $pdo->prepare('UPDATE trainer SET payload = :payload WHERE id = :id');
        while ($row = $rows->fetch()) {
            $payload = json_decode((string) $row['payload'], true);
            if (!is_array($payload) || !isset($payload['sekolahIds']) || !is_array($payload['sekolahIds'])) continue;
            $filtered = array_values(array_filter($payload['sekolahIds'], static fn($v) => $v !== $sekolahIdEsc));
            if (count($filtered) === count($payload['sekolahIds'])) continue;
            $payload['sekolahIds'] = $filtered;
            $upd->execute([
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':id' => $row['id'],
            ]);
            $trainerTouched++;
        }
    } catch (Throwable $e) {
        // best-effort, mirroring users.php:230-249 — don't fail the delete
        error_log('cascadeNullifySekolahReferences(trainer) failed: ' . $e->getMessage());
    }
    if ($trainerTouched > 0) {
        auditEvent('trainer_sekolah_nullified', $user, 'trainer', null, [
            'sekolahId' => $sekolahIdEsc,
            'recordsTouched' => $trainerTouched,
        ]);
    }

    // ---- siswa.sekolahId (JSON payload field).
    $siswaTouched = 0;
    try {
        $stmt = $pdo->prepare('SELECT id, payload FROM siswa WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, \'$.sekolahId\')) = :id');
        $stmt->execute([':id' => $sekolahIdEsc]);
        $upd = $pdo->prepare('UPDATE siswa SET payload = :payload WHERE id = :id');
        while ($row = $stmt->fetch()) {
            $payload = json_decode((string) $row['payload'], true);
            if (!is_array($payload)) continue;
            $payload['sekolahId'] = null;
            $upd->execute([
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':id' => $row['id'],
            ]);
            $siswaTouched++;
        }
    } catch (Throwable $e) {
        error_log('cascadeNullifySekolahReferences(siswa) failed: ' . $e->getMessage());
    }
    if ($siswaTouched > 0) {
        auditEvent('siswa_sekolah_nullified', $user, 'siswa', null, [
            'sekolahId' => $sekolahIdEsc,
            'recordsTouched' => $siswaTouched,
        ]);
    }

    // ---- invoices.sekolahId (JSON payload field; ledger, append-only — we
    // do NOT hard-delete invoice rows, just null the FK reference so the
    // row's historical/audit value is preserved while the orphan FK is
    // cleared. Mirrors the RD append-only contract (PRODUCTION_PLAN.md:107).
    $invoiceTouched = 0;
    try {
        $stmt = $pdo->prepare('SELECT id, payload FROM invoices WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, \'$.sekolahId\')) = :id');
        $stmt->execute([':id' => $sekolahIdEsc]);
        $upd = $pdo->prepare('UPDATE invoices SET payload = :payload WHERE id = :id');
        while ($row = $stmt->fetch()) {
            $payload = json_decode((string) $row['payload'], true);
            if (!is_array($payload)) continue;
            $payload['sekolahId'] = null;
            $upd->execute([
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':id' => $row['id'],
            ]);
            $invoiceTouched++;
        }
    } catch (Throwable $e) {
        error_log('cascadeNullifySekolahReferences(invoices) failed: ' . $e->getMessage());
    }
    if ($invoiceTouched > 0) {
        auditEvent('invoices_sekolah_nullified', $user, 'invoices', null, [
            'sekolahId' => $sekolahIdEsc,
            'recordsTouched' => $invoiceTouched,
        ]);
    }
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