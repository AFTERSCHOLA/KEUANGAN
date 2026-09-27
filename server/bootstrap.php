<?php
declare(strict_types=1);

/**
 * Minimal dotenv loader (RH.A.2, no new dependency).
 *
 * Precedence: real environment variables > `.env` file > built-in defaults
 * in `server/config.php`. A key already present in the real environment
 * (getenv/$_ENV/$_SERVER) is never overridden by the file.
 *
 * Format: `KEY=VALUE` lines, `#` full-line comments, optional surrounding
 * single/double quotes stripped from the value. Unreadable/missing files
 * parse as empty (no crash); malformed lines are skipped.
 */
function parseEnvFile(string $path): array {
    $lines = @file($path, FILE_IGNORE_NEW_LINES);
    if ($lines === false) return [];
    $out = [];
    foreach ($lines as $line) {
        $trimmed = ltrim(trim($line), "\xEF\xBB\xBF");
        if ($trimmed === '' || $trimmed[0] === '#') continue;
        $eq = strpos($trimmed, '=');
        if ($eq === false) continue;
        $key = trim(substr($trimmed, 0, $eq));
        $value = trim(substr($trimmed, $eq + 1));
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key)) continue;
        $len = strlen($value);
        if ($len >= 2 && (($value[0] === '"' && $value[$len - 1] === '"') || ($value[0] === "'" && $value[$len - 1] === "'"))) {
            $value = substr($value, 1, -1);
        } else {
            $hashPos = strpos($value, ' #');
            if ($hashPos !== false) $value = trim(substr($value, 0, $hashPos));
        }
        $out[$key] = $value;
    }
    return $out;
}

function loadEnvFile(): void {
    $candidates = [__DIR__ . '/.env', dirname(__DIR__) . '/.env'];
    foreach ($candidates as $candidate) {
        if (!is_file($candidate) || !is_readable($candidate)) continue;
        foreach (parseEnvFile($candidate) as $key => $value) {
            if (getenv($key) !== false || isset($_ENV[$key]) || isset($_SERVER[$key])) continue;
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
        return;
    }
}

loadEnvFile();

require_once __DIR__ . '/auth/session.php';
require_once __DIR__ . '/auth/authorize.php';

function securityHeaders(): void {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('X-Frame-Options: DENY');
    header('Content-Security-Policy: default-src \'self\'; img-src \'self\' data: blob: https:; style-src \'self\' \'unsafe-inline\'; script-src \'self\'; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'self\'; form-action \'self\'');
    if (serverConfig()['session_secure'] === true) {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
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
    $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    runMigrations($pdo);
    return $pdo;
}

/**
 * Apply any pending `server/migrations/*.sql` files in lexical order.
 *
 * Discovery: the migrations directory ships next to `schema.sql`; each file
 * is a self-contained SQL script (idempotent per taste #35). Files whose
 * basename (sans `.sql`) is already present in the `migrations` table are
 * skipped — that table is the canonical record of what has been applied,
 * seeded by `server/tests/db-reset.php` with `baseline-test-seed` so the
 * fresh test database starts at "everything else is pending" and a single
 * run brings it up to date.
 *
 * Each file is wrapped in a transaction; if the script throws, the version
 * row is not written and a later retry will re-run the file. The
 * `source_checksum` column lets future tooling flag a migration whose source
 * has drifted from what was originally applied.
 */
function runMigrations(PDO $pdo): void {
    static $applied = false;
    if ($applied) return;
    $dir = __DIR__ . '/migrations';
    if (!is_dir($dir)) { $applied = true; return; }

    $files = glob($dir . '/*.sql');
    if ($files === false || count($files) === 0) { $applied = true; return; }
    sort($files, SORT_STRING);

    $appliedVersions = [];
    try {
        $appliedVersions = array_column($pdo->query('SELECT version FROM migrations')->fetchAll(), 'version');
    } catch (PDOException $error) {
        $applied = true;
        return;
    }

    foreach ($files as $file) {
        $version = basename($file, '.sql');
        if (in_array($version, $appliedVersions, true)) continue;
        $sql = file_get_contents($file);
        if (!is_string($sql) || $sql === '') continue;

        $pdo->beginTransaction();
        try {
            $rowCounts = [];
            $statements = array_filter(array_map('trim', explode(";\n", str_replace("\r\n", "\n", $sql))));
            foreach ($statements as $statement) {
                if ($statement === '') continue;
                $pdo->exec($statement);
                if (preg_match('/\b(UPDATE|INSERT INTO|DELETE FROM)\s+`?([A-Za-z_]+)`?/i', $statement, $m)) {
                    $tbl = $m[2];
                    try {
                        $rowCounts[$tbl] = (int) $pdo->query("SELECT COUNT(*) FROM `{$tbl}`")->fetchColumn();
                    } catch (PDOException $ignore) {
                    }
                }
            }
            $checksum = substr(sha1($sql), 0, 40);
            $pdo->prepare('INSERT INTO migrations (version, source_checksum, row_counts) VALUES (:version, :checksum, :row_counts)')
                ->execute([
                    ':version' => $version,
                    ':checksum' => $checksum,
                    ':row_counts' => $rowCounts ? json_encode($rowCounts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                ]);
            if ($pdo->inTransaction()) $pdo->commit();
            $appliedVersions[] = $version;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            return;
        }
    }
    $applied = true;
}

/**
 * TA.B.4 — 'hasCorrectionOf' flag drives insertLedger()'s per-entity SQL
 * shape below. Previously hardcoded to `$entity === 'honorPayments'`;
 * generalized so any ledger entity whose table carries a correction_of
 * column (currently honorPayments and absensiPengajar) gets the same
 * insert-new-with-correction-pointer path without adding another
 * special-cased entity name inside insertLedger() itself.
 */
function entityConfig(string $entity): array {
    $config = [
        'absensi' => ['table' => 'absensi', 'path' => 'absensi.php'],
        'absensiPengajar' => ['table' => 'absensi_pengajar', 'path' => 'absensiPengajar.php', 'hasCorrectionOf' => true],
        'sppPayments' => ['table' => 'spp_payments', 'path' => 'sppPayments.php'],
        'honorPayments' => ['table' => 'honor_payments', 'path' => 'honorPayments.php', 'hasCorrectionOf' => true],

        'settings' => ['table' => 'settings', 'path' => 'settings.php'],
        'invoices' => ['table' => 'invoices', 'path' => 'invoices.php'],
        'sekolah' => ['table' => 'sekolah', 'path' => 'sekolah.php'],
        'trainer' => ['table' => 'trainer', 'path' => 'trainer.php'],
        // CS.B.2 (D-CS5) — minimal external-assistant person record.
        'eksternal' => ['table' => 'eksternal', 'path' => 'eksternal.php'],
        'siswa' => ['table' => 'siswa', 'path' => 'siswa.php'],
        'cabang' => ['table' => 'cabang', 'path' => 'cabang.php'],

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
    $hasCorrectionOf = $config['hasCorrectionOf'] ?? false;
    $sql = "INSERT INTO {$config['table']} (id, cabang_id, " . ($hasCorrectionOf ? 'correction_of, ' : '') . "payload) VALUES (:id, :cabang_id, " . ($hasCorrectionOf ? ':correction_of, ' : '') . ":payload)";
    try {
        $stmt = $pdo->prepare($sql);
        $params = [
            ':id' => $record['id'],
            ':cabang_id' => recordBranchId($record),
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];
        if ($hasCorrectionOf) $params[':correction_of'] = $correctionOf;
        $stmt->execute($params);
    } catch (PDOException $error) {
        if (isDuplicate($error)) jsonResponse(['error' => 'ID sudah tersimpan', 'id' => $record['id']], 409);
        jsonResponse(['error' => 'Gagal menyimpan record'], 500);
    }
    auditEvent($entity . '_recorded', sessionUser(), $entity, $record['id'], array_filter([
        'cabangId' => recordBranchId($record),
        'correctionOf' => $correctionOf,
    ]));
    jsonResponse(['ok' => true, 'id' => $record['id']], 201);
}