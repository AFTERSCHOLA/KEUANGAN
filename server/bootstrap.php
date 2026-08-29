<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/session.php';
require_once __DIR__ . '/auth/authorize.php';

function securityHeaders(): void {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('X-Frame-Options: DENY');
    header('Content-Security-Policy: default-src \'self\'; img-src \'self\' data: blob: https:; style-src \'self\' \'unsafe-inline\'; script-src \'self\'; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'self\'; form-action \'self\'');
}

securityHeaders();

function jsonResponse(mixed $body, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestJson(): array {
    if (($_SERVER['CONTENT_TYPE'] ?? '') !== '' && stripos((string) $_SERVER['CONTENT_TYPE'], 'application/json') !== 0) {
        jsonResponse(['error' => 'Content-Type harus application/json'], 422);
    }
    if (isset($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > 2 * 1024 * 1024) {
        jsonResponse(['error' => 'Payload terlalu besar'], 422);
    }
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    if (!is_array($data)) jsonResponse(['error' => 'JSON tidak valid'], 422);
    return $data;
}

function database(): PDO {
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $config = serverConfig();
    if (!isset($config['dsn'], $config['username'], $config['password'])) jsonResponse(['error' => 'Konfigurasi database tidak lengkap'], 500);
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
    if (!isset($data['cabangId']) || !is_string($data['cabangId']) || trim($data['cabangId']) === '') {
        jsonResponse(['error' => 'Record membutuhkan cabangId'], 422);
    }
    return $data;
}

function recordBranchId(array $record): string {
    return trim((string) $record['cabangId']);
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
    // sessionUser() (not requireAuthenticatedUser()) — insertLedger() is
    // only ever reached after the caller's own requireAuthorization()
    // already succeeded, so a valid session is guaranteed here; this
    // avoids a redundant second 401 short-circuit inside a helper that
    // should only ever be recording, not gatekeeping.
    auditEvent($entity . '_recorded', sessionUser(), $entity, $record['id'], array_filter([
        'cabangId' => recordBranchId($record),
        'correctionOf' => $correctionOf,
    ]));
    jsonResponse(['ok' => true, 'id' => $record['id']], 201);
}