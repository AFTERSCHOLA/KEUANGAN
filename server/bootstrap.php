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
    $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");   // <-- baris baru
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
        // migrations table not present yet (e.g. half-applied schema.sql).
        // The schema.sql ships `migrations`, so this branch is unreachable on
        // any properly bootstrapped DB; bail out silently rather than
        // crashing every API call.
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
            // Naive statement split: schema.sql and the migrations shipped
            // here use ";\n" as a terminator and contain no string
            // literals carrying one. If a future migration needs a literal
            // semicolon it must either stay as a single statement or be
            // restructured to use a delimiter override. CRLF is normalized
            // to LF first so the split (and the per-statement SQL) stays
            // byte-identical regardless of the checkout's autocrlf state —
            // a CRLF file would otherwise leave a trailing "\r" glued to
            // the next statement (D9.2's migration is the first
            // multi-statement file to depend on this).
            $statements = array_filter(array_map('trim', explode(";\n", str_replace("\r\n", "\n", $sql))));
            foreach ($statements as $statement) {
                if ($statement === '') continue;
                $pdo->exec($statement);
                // Capture the most-recently-touched table's row count for
                // the migrations audit row — best-effort, not all migrations
                // need it (audit_log inserts skip), but `siswa` UPDATEs leave
                // a useful trace in the migrations table for M-AF5.4.
                if (preg_match('/\b(UPDATE|INSERT INTO|DELETE FROM)\s+`?([A-Za-z_]+)`?/i', $statement, $m)) {
                    $tbl = $m[2];
                    try {
                        $rowCounts[$tbl] = (int) $pdo->query("SELECT COUNT(*) FROM `{$tbl}`")->fetchColumn();
                    } catch (PDOException $ignore) {
                        // table may not exist for every migration; ignore.
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
            $pdo->commit();
            $appliedVersions[] = $version;
        } catch (Throwable $error) {
            $pdo->rollBack();
            // Don't cache `applied=true` on failure — next call retries.
            return;
        }
    }
    $applied = true;
}

function entityConfig(string $entity): array {
    $config = [
        'absensi' => ['table' => 'absensi', 'path' => 'absensi.php'],
        'sppPayments' => ['table' => 'spp_payments', 'path' => 'sppPayments.php'],
        'honorPayments' => ['table' => 'honor_payments', 'path' => 'honorPayments.php'],
        
        'settings' => ['table' => 'settings', 'path' => 'settings.php'],
        'invoices' => ['table' => 'invoices', 'path' => 'invoices.php'],
        'sekolah' => ['table' => 'sekolah', 'path' => 'sekolah.php'],
        'trainer' => ['table' => 'trainer', 'path' => 'trainer.php'],
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