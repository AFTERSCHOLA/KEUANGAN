<?php
declare(strict_types=1);

function jsonResponse(mixed $body, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestJson(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    if (!is_array($data)) jsonResponse(['error' => 'JSON tidak valid'], 400);
    return $data;
}

function database(): PDO {
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $configFile = __DIR__ . '/config.php';
    if (!is_file($configFile)) jsonResponse(['error' => 'Konfigurasi server belum tersedia'], 500);
    $config = require $configFile;
    $pdo = new PDO($config['dsn'], $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function entityConfig(string $entity): array {
    $config = [
        'absensi' => ['table' => 'absensi', 'path' => 'absensi.php'],
        'sppPayments' => ['table' => 'spp_payments', 'path' => 'sppPayments.php'],
        'honorPayments' => ['table' => 'honor_payments', 'path' => 'honorPayments.php'],
    ];
    if (!isset($config[$entity])) jsonResponse(['error' => 'Entity tidak didukung'], 400);
    return $config[$entity];
}

function requireRecord(array $data): array {
    if (!isset($data['id']) || !is_string($data['id']) || trim($data['id']) === '') {
        jsonResponse(['error' => 'Record membutuhkan id'], 422);
    }
    return $data;
}

function recordBranchId(array $record): ?string {
    return isset($record['cabangId']) && is_string($record['cabangId']) ? $record['cabangId'] : null;
}

function isDuplicate(PDOException $error): bool {
    return $error->getCode() === '23000';
}

function insertLedger(string $entity, array $record, ?string $correctionOf = null): never {
    $record = requireRecord($record);
    $config = entityConfig($entity);
    $pdo = database();
    $sql = "INSERT INTO {$config['table']} (id, cabang_id, " . ($entity === 'honorPayments' ? 'correction_of, ' : '') . "payload) VALUES (:id, :cabang_id, " . ($entity === 'honorPayments' ? ':correction_of, ' : '') . ":payload)";
    try {
        $stmt = $pdo->prepare($sql);
        $params = [
            ':id' => $record['id'],
            ':cabang_id' => recordBranchId($record),
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];
        if ($entity === 'honorPayments') $params[':correction_of'] = $correctionOf;
        $stmt->execute($params);
    } catch (PDOException $error) {
        if (isDuplicate($error)) jsonResponse(['error' => 'ID sudah tersimpan', 'id' => $record['id']], 409);
        jsonResponse(['error' => 'Gagal menyimpan record'], 500);
    }
    jsonResponse(['ok' => true, 'id' => $record['id']], 201);
}
