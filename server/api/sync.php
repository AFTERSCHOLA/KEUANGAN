<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
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
    try {
        $entity = (string) $entry['key'];
        $record = requireRecord($entry['record']);
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
