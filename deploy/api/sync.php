<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

// 401 — anonymous callers get nothing synced at all.
$user = requireAuthenticatedUser();

$body = requestJson();
$entries = $body['entries'] ?? [];
if (!is_array($entries)) jsonResponse(['error' => 'entries harus berupa array'], 422);

$pdo = database();
$synced = [];
$alreadyApplied = [];
$failed = [];
foreach ($entries as $entry) {
    if (!is_array($entry) || !isset($entry['key'], $entry['record']) || !is_array($entry['record'])) {
        $failed[] = ['id' => is_array($entry) ? ($entry['id'] ?? null) : null, 'error' => 'Entry tidak valid'];
        continue;
    }

    $entity = (string) $entry['key'];
    $record = $entry['record'];

    // sync.php only ever writes to these 3 tables (see entityConfig()).
    // Other entities are valid per authorize()'s broader entity list (e.g.
    // 'sekolah' — synced only client-side until M3.4) but calling
    // entityConfig() on them below would jsonResponse(400) and kill the
    // WHOLE batch, not just this entry. Reject as a per-entry failure first.
    if (!in_array($entity, ['absensi', 'sppPayments', 'honorPayments'], true)) {
        $failed[] = ['id' => $record['id'] ?? null, 'entity' => $entity, 'error' => 'Entity tidak didukung'];
        continue;
    }

    // Per-entry authorization — deliberately NOT requireAuthorization(),
    // which exits the whole request on the first denied entry. One
    // cross-scope entry in an otherwise-legitimate batch should only fail
    // that entry, same as a duplicate ID does below — not abort every
    // other entry the caller was allowed to sync.
    if (!authorize('write', $entity, $record, $user)) {
        $failed[] = ['id' => $record['id'] ?? null, 'entity' => $entity, 'error' => 'Akses tidak diizinkan'];
        continue;
    }

    try {
        $record = requireRecord($record);
        $config = entityConfig($entity);
        $pdo->beginTransaction();
        $sql = "INSERT INTO {$config['table']} (id, cabang_id, " . ($entity === 'honorPayments' ? 'correction_of, ' : '') . "payload) VALUES (:id, :cabang_id, " . ($entity === 'honorPayments' ? ':correction_of, ' : '') . ":payload)";
        $params = [
            ':id' => $record['id'],
            ':cabang_id' => recordBranchId($record),
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];
        if ($entity === 'honorPayments') $params[':correction_of'] = $entry['correctionOf'] ?? null;
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $pdo->commit();
        $synced[] = ['id' => $record['id'], 'entity' => $entity];
        auditEvent($entity . '_recorded', $user, $entity, $record['id'], array_filter([
            'cabangId' => recordBranchId($record),
            'via' => 'sync',
        ]));
    } catch (PDOException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if (isDuplicate($error)) {
            $alreadyApplied[] = ['id' => $entry['record']['id'] ?? null, 'entity' => $entry['key'] ?? null];
        } else {
            $failed[] = ['id' => $entry['record']['id'] ?? null, 'error' => 'Gagal menyimpan record'];
        }
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $failed[] = ['id' => $entry['record']['id'] ?? null, 'error' => $error->getMessage()];
    }
}
jsonResponse(['synced' => $synced, 'alreadyApplied' => $alreadyApplied, 'failed' => $failed]);