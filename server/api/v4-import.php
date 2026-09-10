<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/v4Import.php';

// RH.F.1 — v4 importer endpoint (F-RH7, R-RH5, D-RH2/D-RH3/D-RH10).
//
// The operator's browser holds the real v4 (localStorage-era) data; the
// cPanel production DB is empty/schema-only. This endpoint is the one-shot
// migration path: superadmin pastes/uploads the browser export and it lands
// atomically, or not at all.
//
// Auth order mirrors backup-create.php / photo-upload.php:
//   405 method -> 401 auth -> 403 CSRF -> 403 manage_backup (deny-listed in
//   authorize.php, so no authorize.php edit is needed — same note as
//   restore.php) -> 422 validation -> 409 conflicts.
//
// Concrete picks:
//   - JSON envelope via requestJson() (same idiom as every other JSON
//     endpoint; its 2 MB cap applies — a real export larger than that is a
//     follow-up slice, not this one; restore.php's multipart path stays
//     the large-file route for server snapshots).
//   - `dryRun:true` returns the report with zero writes of any kind — no
//     transaction AND no audit row — so "DB counts unchanged" holds
//     literally, including audit_log. Commits audit AFTER the transaction
//     commits (masterDelete pattern), so a rolled-back import never leaves
//     a misleading v4_imported row.
//   - Commit inserts in parent-first order (cabang, sekolah, trainer,
//     siswa, absensi, sppPayments, honorPayments, invoices, settings).
//     No FK constraints exist in schema.sql, so the order is for reader
//     clarity, not for the engine. Records are stored verbatim (payload =
//     the normalized record); cabang kode is trimmed, not re-cased.
//   - dryRun -> 200; commit success -> 201; reference/required failures ->
//     422 with the per-error report; any duplicate id (within the file or
//     against live rows, including a kode race caught by the UNIQUE key) ->
//     409 with zero rows written.

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

// 'manage_backup' is already in authorize()'s deny-list (like 'restore') —
// every role except superadmin is rejected here before any import logic.
requireAuthorization('manage_backup', 'backups', [], $user);

$body = requestJson();
$dryRun = ($body['dryRun'] ?? false) === true;
unset($body['dryRun']);

$normalized = shapeNormalize($body);
$shape = $normalized['shape'];
$warnings = $normalized['warnings'];

$derivedPair = deriveMissingCabangIds($normalized['entities']);
$entities = $derivedPair[0];
$derived = $derivedPair[1];

$validation = validateReferences($entities);
$errors = $validation['errors'];
$fileConflicts = $validation['conflicts'];

$countsPreview = [];
foreach (v4ImportEntityKeys() as $entity) {
    $countsPreview[$entity] = is_array($entities[$entity] ?? null) ? count($entities[$entity]) : 0;
}
$totalPreview = array_sum($countsPreview);

if ($shape === 'unknown') {
    $report = buildReport($entities, $errors, $derived, $fileConflicts, $shape);
    $report['warnings'] = $warnings;
    jsonResponse(['error' => 'Format impor tidak dikenali: butuh {version:2,data:{…}} atau {entities:{…}}', 'report' => $report], 422);
}

if ($totalPreview === 0) {
    $report = buildReport($entities, $errors, $derived, $fileConflicts, $shape);
    $report['warnings'] = $warnings;
    jsonResponse(['error' => 'File impor tidak memuat data', 'report' => $report], 422);
}

if ($errors !== []) {
    $report = buildReport($entities, $errors, $derived, $fileConflicts, $shape);
    $report['warnings'] = $warnings;
    jsonResponse(['error' => 'Impor dibatalkan: ada referensi yang tidak valid', 'report' => $report], 422);
}

if ($fileConflicts !== []) {
    $report = buildReport($entities, $errors, $derived, $fileConflicts, $shape);
    $report['warnings'] = $warnings;
    jsonResponse(['error' => 'Impor dibatalkan: ada id duplikat dalam file', 'conflicts' => $fileConflicts, 'report' => $report], 409);
}

$pdo = database();

// Duplicate-against-live check BEFORE opening a transaction, so the common
// re-import path 409s without ever starting (and ending) a write txn.
$dbConflicts = v4FindLiveConflicts($pdo, $entities);
if ($dbConflicts !== []) {
    $report = buildReport($entities, $errors, $derived, $dbConflicts, $shape);
    $report['warnings'] = $warnings;
    jsonResponse(['error' => 'Impor dibatalkan: id sudah tersimpan', 'conflicts' => $dbConflicts, 'report' => $report], 409);
}

$report = buildReport($entities, $errors, $derived, [], $shape);
$report['warnings'] = $warnings;

if ($dryRun) {
    jsonResponse(['ok' => true, 'dryRun' => true, 'report' => $report], 200);
}

try {
    $pdo->beginTransaction();
    foreach (v4ImportEntityKeys() as $entity) {
        foreach ($entities[$entity] as $record) {
            if (!is_array($record)) continue;
            v4InsertRecord($pdo, $entity, $record);
        }
    }
    $pdo->commit();
} catch (PDOException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (isDuplicate($error)) {
        jsonResponse(['error' => 'Impor dibatalkan: id sudah tersimpan, tidak ada baris yang ditulis', 'report' => $report], 409);
    }
    error_log('v4-import.php commit failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal melakukan impor, tidak ada perubahan disimpan (transaksi di-rollback)'], 500);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('v4-import.php commit failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal melakukan impor, tidak ada perubahan disimpan (transaksi di-rollback)'], 500);
}

auditEvent('v4_imported', $user, 'v4_import', null, ['counts' => $report['counts'], 'dryRun' => false]);

jsonResponse(['ok' => true, 'dryRun' => false, 'counts' => $report['counts'], 'report' => $report], 201);

/**
 * Collect ids per entity that already exist in the live tables.
 *
 * @return list<array{entity:string,id:string,message:string}>
 */
function v4FindLiveConflicts(PDO $pdo, array $entities): array {
    $conflicts = [];
    foreach (v4ImportEntityKeys() as $entity) {
        $ids = [];
        foreach (($entities[$entity] ?? []) as $record) {
            if (is_array($record) && isset($record['id']) && is_string($record['id']) && trim($record['id']) !== '') {
                $ids[] = $record['id'];
            }
        }
        if ($ids === []) continue;
        $table = v4ImportTableFor($entity);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT id FROM {$table} WHERE id IN ({$placeholders})");
        $stmt->execute($ids);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $existingId) {
            $conflicts[] = ['entity' => $entity, 'id' => (string) $existingId, 'message' => "{$entity}: id '{$existingId}' sudah tersimpan"];
        }
    }
    return $conflicts;
}

function v4InsertRecord(PDO $pdo, string $entity, array $record): void {
    $id = (string) $record['id'];
    $payload = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($entity === 'cabang') {
        $pdo->prepare('INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, :payload)')
            ->execute([
                ':id' => $id,
                ':kode' => trim((string) ($record['kode'] ?? '')),
                ':nama' => (string) ($record['nama'] ?? ''),
                ':payload' => $payload,
            ]);
        return;
    }
    if ($entity === 'honorPayments') {
        $pdo->prepare('INSERT INTO honor_payments (id, cabang_id, correction_of, payload) VALUES (:id, :cabang_id, :correction_of, :payload)')
            ->execute([
                ':id' => $id,
                ':cabang_id' => $record['cabangId'] ?? null,
                ':correction_of' => $record['correctionOf'] ?? null,
                ':payload' => $payload,
            ]);
        return;
    }
    $table = v4ImportTableFor($entity);
    $pdo->prepare("INSERT INTO {$table} (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)")
        ->execute([
            ':id' => $id,
            ':cabang_id' => $record['cabangId'] ?? null,
            ':payload' => $payload,
        ]);
}
