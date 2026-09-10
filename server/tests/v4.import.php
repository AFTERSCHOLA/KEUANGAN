<?php
declare(strict_types=1);

// ============================================================
// RH.F.1 — v4 importer verification suite (F-RH7, D-RH10 VERIFY)
//
// Proves the microtask VERIFY clause end-to-end over HTTP:
//   broken fixture  -> 422 + per-error report, zero rows written
//   valid fixture   -> commit writes all rows, counts match fixture
//   same valid again -> 409, zero new rows, counts unchanged
//   dryRun          -> 200 report-only, DB counts unchanged
// Plus: anonymous 401, admin_cabang 403, missing-CSRF 403, the server
// snapshot {entities:{…}} shape, within-fixture duplicate 409, ledger
// sums preserved, and the v4_imported audit row.
//
// Idiom mirrors server/tests/photo.endpoint.php (self-booting PHP dev
// server on a scratch port, login-via-API + CSRF header, per-check
// reporting, Windows-safe reaping, taste #56 no fabrication).
// Destructive cleanup runs LAST (taste #55): fixture rows in all 9
// tables + v4_imported audit rows, then server reaping + temp jars.
// ============================================================

$failures = 0;
$total = 0;
function check(string $label, bool $condition, string $detail = ''): void {
    global $failures, $total;
    $total++;
    if ($condition) {
        echo "  OK   $label\n";
    } else {
        $failures++;
        echo "  FAIL $label" . ($detail !== '' ? " — $detail" : '') . "\n";
    }
}

if (!extension_loaded('curl')) {
    fwrite(STDERR, "php-curl extension is required to run this test\n");
    exit(1);
}

$fixturesPath = __DIR__ . '/v4-import.fixtures.json';
$fixturesRaw = @file_get_contents($fixturesPath);
$fixtures = is_string($fixturesRaw) ? json_decode($fixturesRaw, true) : null;
if (!is_array($fixtures) || !isset($fixtures['valid'], $fixtures['brokenReferences'], $fixtures['duplicateIds'])) {
    fwrite(STDERR, "BLOCKER: cannot load valid/brokenReferences/duplicateIds from v4-import.fixtures.json\n");
    exit(1);
}

$config = require __DIR__ . '/../config.php';
if (!is_array($config)) {
    fwrite(STDERR, "config.php tidak me-return array\n");
    exit(1);
}
try {
    $pdo = new PDO($config['dsn'], $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (Throwable $error) {
    // taste #56: blocker stated, nothing fabricated.
    fwrite(STDERR, 'BLOCKER: cannot reach test database: ' . $error->getMessage() . "\n");
    exit(1);
}

const V4_TABLES = [
    'cabang' => 'cabang',
    'sekolah' => 'sekolah',
    'trainer' => 'trainer',
    'siswa' => 'siswa',
    'absensi' => 'absensi',
    'sppPayments' => 'spp_payments',
    'honorPayments' => 'honor_payments',
    'invoices' => 'invoices',
    'settings' => 'settings',
];

/** Full 9-table row counts (the "DB counts" the VERIFY clause pins). */
function v4TableCounts(PDO $pdo): array {
    $counts = [];
    foreach (V4_TABLES as $table) {
        $counts[$table] = (int) $pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
    }
    return $counts;
}

/** How many rows carry this test's fixture ids (0 = clean). */
function v4FixtureRows(PDO $pdo): int {
    $n = 0;
    foreach (V4_TABLES as $table) {
        $n += (int) $pdo->query(
            "SELECT COUNT(*) FROM {$table} WHERE id LIKE '%-v4t-%' OR id = 'settings-global'"
        )->fetchColumn();
    }
    return $n;
}

function cleanupV4Fixtures(PDO $pdo): void {
    foreach (V4_TABLES as $table) {
        try {
            $pdo->exec("DELETE FROM {$table} WHERE id LIKE '%-v4t-%' OR id = 'settings-global'");
        } catch (Throwable $ignore) {
            // Table missing mid-migration: cleanup is best-effort.
        }
    }
    try {
        $pdo->exec("DELETE FROM audit_log WHERE event_type = 'v4_imported'");
    } catch (Throwable $ignore) {
    }
}

cleanupV4Fixtures($pdo); // previous interrupted run
$baseline = v4TableCounts($pdo);

// --- self-booting dev server on a scratch port (photo.endpoint idiom) ---
function findV4TestPort(): int {
    $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if ($socket === false) {
        fwrite(STDERR, "BLOCKER: cannot allocate a free port: $errstr\n");
        exit(1);
    }
    $name = stream_socket_get_name($socket, false);
    fclose($socket);
    $parts = explode(':', (string) $name);
    return (int) end($parts);
}

$docroot = realpath(__DIR__ . '/../..');
if ($docroot === false) {
    fwrite(STDERR, "BLOCKER: cannot resolve repo-root docroot\n");
    exit(1);
}
$port = findV4TestPort();
$base = "http://127.0.0.1:$port";
$serverStdout = tempnam(sys_get_temp_dir(), 'v4_stdout_');
$serverStderr = tempnam(sys_get_temp_dir(), 'v4_stderr_');
$server = proc_open(
    sprintf('%s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $port, escapeshellarg($docroot)),
    [1 => ['file', $serverStdout, 'w'], 2 => ['file', $serverStderr, 'w']],
    $pipes
);
if (!is_resource($server)) {
    fwrite(STDERR, "BLOCKER: proc_open for php -S failed\n");
    exit(1);
}
$serverPid = proc_get_status($server)['pid'] ?? 0;

function stopV4Server(): void {
    global $server, $serverPid;
    if (isset($server) && is_resource($server)) {
        if (PHP_OS_FAMILY === 'Windows' && (int) $serverPid > 0) {
            @exec('taskkill /PID ' . (int) $serverPid . ' /T /F 2>NUL');
        }
        @proc_terminate($server);
        @proc_close($server);
    }
    $server = null;
}
register_shutdown_function('stopV4Server');

$serverReady = false;
for ($i = 0; $i < 25; $i++) {
    usleep(200000);
    $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
    if ($conn) {
        fclose($conn);
        $serverReady = true;
        break;
    }
}
if (!$serverReady) {
    fwrite(STDERR, "BLOCKER: dev server on port $port never became reachable after 5s.\n");
    fwrite(STDERR, "--- dev server stderr (tail) ---\n" . implode('', array_slice(file($serverStderr) ?: [], -20)) . "\n");
    stopV4Server();
    exit(1);
}

// --- HTTP helpers -------------------------------------------------------
function postV4(string $base, array $body, ?string $cookie, ?string $csrfToken): array {
    $ch = curl_init("$base/server/api/v4-import.php");
    $headers = ['Content-Type: application/json'];
    if ($csrfToken !== null) $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    }
    $raw = curl_exec($ch);
    if ($raw === false) {
        fwrite(STDERR, 'BLOCKER: v4-import request failed: ' . curl_error($ch) . "\n");
        curl_close($ch);
        stopV4Server();
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, json_decode((string) $raw, true)];
}

function reqJsonV4(string $method, string $url, ?array $body, ?string $cookie): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    }
    $raw = curl_exec($ch);
    if ($raw === false) {
        fwrite(STDERR, "BLOCKER: request $method $url failed: " . curl_error($ch) . "\n");
        curl_close($ch);
        stopV4Server();
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, json_decode((string) $raw, true)];
}

function loginAsV4(string $base, string $username, string $password, string $cookieFile): void {
    [$status, $body] = reqJsonV4('POST', "$base/server/api/auth/login.php", ['username' => $username, 'password' => $password], $cookieFile);
    if ($status !== 200) {
        fwrite(STDERR, "BLOCKER: login as $username failed (status=$status body=" . json_encode($body) . ") — run npm run db:reset first\n");
        stopV4Server();
        exit(1);
    }
}

function csrfForV4(string $base, string $cookieFile, string $label): string {
    [$status, $body] = reqJsonV4('GET', "$base/server/api/auth/csrf.php", null, $cookieFile);
    if ($status !== 200 || !isset($body['csrfToken']) || !is_string($body['csrfToken'])) {
        fwrite(STDERR, "BLOCKER: CSRF fetch for $label failed (status=$status body=" . json_encode($body) . ")\n");
        stopV4Server();
        exit(1);
    }
    return $body['csrfToken'];
}

$cookieSuper = tempnam(sys_get_temp_dir(), 'v4_sup_');
$cookieCabang = tempnam(sys_get_temp_dir(), 'v4_cab_');

try {
    check('fixture leftovers cleaned before start', v4FixtureRows($pdo) === 0, 'rows=' . v4FixtureRows($pdo));

    loginAsV4($base, 'superadmin@test.local', 'SuperTest123!X', $cookieSuper);
    loginAsV4($base, 'admin.cabang@test.local', 'CabangTest123!X', $cookieCabang);
    $csrfSuper = csrfForV4($base, $cookieSuper, 'superadmin');
    $csrfCabang = csrfForV4($base, $cookieCabang, 'admin_cabang');

    $valid = $fixtures['valid'];
    $broken = $fixtures['brokenReferences'];
    $duplicate = $fixtures['duplicateIds'];

    // --- auth gates ------------------------------------------------------
    echo "\n--- auth gates ---\n";
    [$status] = postV4($base, $valid, null, null);
    check('anonymous import -> 401', $status === 401, "got $status");

    [$status] = postV4($base, $valid, $cookieCabang, $csrfCabang);
    check('admin_cabang import -> 403 (superadmin-only)', $status === 403, "got $status");

    [$status] = postV4($base, $valid, $cookieSuper, null);
    check('superadmin without CSRF token -> 403', $status === 403, "got $status");

    check('gated attempts wrote zero rows', v4FixtureRows($pdo) === 0);

    // --- snapshot shape accepted (dryRun, so zero writes) -----------------
    echo "\n--- snapshot shape ---\n";
    $snapshotDoc = ['entities' => $valid['data'], 'dryRun' => true];
    [$status, $body] = postV4($base, $snapshotDoc, $cookieSuper, $csrfSuper);
    check('snapshot {entities} dryRun -> 200', $status === 200, "got $status body=" . json_encode($body));
    check('snapshot report ok', is_array($body) && ($body['report']['ok'] ?? false) === true, json_encode($body['report'] ?? null));
    check('snapshot dryRun wrote zero rows', v4TableCounts($pdo) === $baseline && v4FixtureRows($pdo) === 0);

    // --- broken fixture: 422 + per-error report, zero rows ----------------
    echo "\n--- broken references ---\n";
    $before = v4TableCounts($pdo);
    [$status, $body] = postV4($base, $broken, $cookieSuper, $csrfSuper);
    check('broken commit -> 422', $status === 422, "got $status body=" . json_encode($body));
    $reportErrors = is_array($body) ? ($body['report']['errors'] ?? null) : null;
    check('broken report carries per-error list (>=3)', is_array($reportErrors) && count($reportErrors) >= 3, json_encode($reportErrors));
    $fields = is_array($reportErrors) ? array_map(static fn ($e) => ($e['entity'] ?? '?') . '.' . ($e['field'] ?? '?'), $reportErrors) : [];
    check(
        'broken errors name the hard edges',
        in_array('siswa.sekolahId', $fields, true) && in_array('trainer.sekolahIds', $fields, true),
        json_encode($fields)
    );
    check('broken commit wrote zero rows', v4TableCounts($pdo) === $before && v4FixtureRows($pdo) === 0);

    // --- valid dryRun: report-only, counts match, zero writes --------------
    echo "\n--- valid dryRun ---\n";
    $before = v4TableCounts($pdo);
    [$status, $body] = postV4($base, array_merge($valid, ['dryRun' => true]), $cookieSuper, $csrfSuper);
    check('valid dryRun -> 200', $status === 200, "got $status");
    $report = is_array($body) ? ($body['report'] ?? null) : null;
    $expectedCounts = ['cabang' => 1, 'sekolah' => 1, 'trainer' => 1, 'siswa' => 1, 'absensi' => 1, 'honorPayments' => 1, 'sppPayments' => 1, 'invoices' => 1, 'settings' => 1];
    check('dryRun report counts match fixture', is_array($report) && ($report['counts'] ?? null) === $expectedCounts, json_encode($report['counts'] ?? null));
    $derivedEntities = is_array($report) ? array_values(array_unique(array_column($report['derivedCabangIds'] ?? [], 'entity'))) : [];
    sort($derivedEntities);
    check('dryRun report lists derived cabangIds (siswa/absensi/invoices/spp/honor)', $derivedEntities === ['absensi', 'honorPayments', 'invoices', 'siswa', 'sppPayments'], json_encode($derivedEntities));
    check('dryRun wrote zero rows (DB counts unchanged)', v4TableCounts($pdo) === $before && v4FixtureRows($pdo) === 0);

    // --- valid commit: all rows land ---------------------------------------
    echo "\n--- valid commit ---\n";
    [$status, $body] = postV4($base, $valid, $cookieSuper, $csrfSuper);
    check('valid commit -> 201', $status === 201, "got $status body=" . json_encode($body));
    check('commit counts match fixture', is_array($body) && ($body['counts'] ?? null) === $expectedCounts, json_encode($body['counts'] ?? null));
    $after = v4TableCounts($pdo);
    $deltasOk = true;
    foreach (V4_TABLES as $table) {
        if ($after[$table] !== $baseline[$table] + 1) $deltasOk = false;
    }
    check('every table gained exactly one row', $deltasOk, json_encode(['before' => $baseline, 'after' => $after]));

    $siswaRow = $pdo->query("SELECT cabang_id, payload FROM siswa WHERE id = 'sw-v4t-1'")->fetch();
    check('siswa row present', $siswaRow !== false);
    check('siswa cabang_id derived from sekolah', $siswaRow !== false && $siswaRow['cabang_id'] === 'cbg-v4t-1', json_encode($siswaRow['cabang_id'] ?? null));
    $siswaPayload = $siswaRow !== false ? json_decode((string) $siswaRow['payload'], true) : null;
    check('siswa payload carries derived cabangId', is_array($siswaPayload) && ($siswaPayload['cabangId'] ?? null) === 'cbg-v4t-1');

    $settingsRow = $pdo->query("SELECT id FROM settings WHERE id = 'settings-global'")->fetch();
    check('id-less settings object synthesized to settings-global', $settingsRow !== false);

    // Ledger sums preserved (fixture nominals land verbatim).
    $sppSum = 0;
    foreach ($pdo->query("SELECT payload FROM spp_payments WHERE id LIKE 'spp-v4t-%'")->fetchAll() as $row) {
        $payload = json_decode((string) $row['payload'], true);
        $sppSum += (int) ($payload['nominal'] ?? 0);
    }
    $honorSum = 0;
    foreach ($pdo->query("SELECT payload FROM honor_payments WHERE id LIKE 'pay-v4t-%'")->fetchAll() as $row) {
        $payload = json_decode((string) $row['payload'], true);
        $honorSum += (int) ($payload['nominal'] ?? 0);
    }
    check('spp ledger sum preserved (150000)', $sppSum === 150000, "got $sppSum");
    check('honor ledger sum preserved (50000)', $honorSum === 50000, "got $honorSum");

    // --- same valid again: 409, zero new rows -------------------------------
    echo "\n--- re-import conflict ---\n";
    $before = v4TableCounts($pdo);
    [$status, $body] = postV4($base, $valid, $cookieSuper, $csrfSuper);
    check('second import of same data -> 409', $status === 409, "got $status body=" . json_encode($body));
    check('409 names the conflicting ids', is_array($body) && isset($body['conflicts']) && count($body['conflicts']) > 0, json_encode($body['conflicts'] ?? null));
    check('409 wrote zero new rows (counts unchanged)', v4TableCounts($pdo) === $before);

    // --- within-fixture duplicates: 409, zero rows --------------------------
    echo "\n--- duplicate ids in file ---\n";
    $before = v4TableCounts($pdo);
    [$status, $body] = postV4($base, $duplicate, $cookieSuper, $csrfSuper);
    check('duplicate-ids fixture -> 409', $status === 409, "got $status body=" . json_encode($body));
    $dupRows = (int) $pdo->query("SELECT COUNT(*) FROM siswa WHERE id = 'sw-v4t-dup'")->fetchColumn()
        + (int) $pdo->query("SELECT COUNT(*) FROM cabang WHERE id = 'cbg-v4t-dup'")->fetchColumn();
    check('duplicate fixture wrote zero rows', $dupRows === 0 && v4TableCounts($pdo) === $before, "dupRows=$dupRows");

    // --- audit trail ---------------------------------------------------------
    echo "\n--- audit ---\n";
    $audit = $pdo->query("SELECT actor_role, metadata FROM audit_log WHERE event_type = 'v4_imported' ORDER BY id DESC LIMIT 1")->fetch();
    check('v4_imported audit row present', $audit !== false);
    $meta = $audit !== false ? json_decode((string) $audit['metadata'], true) : null;
    check('audit metadata carries counts + dryRun=false', is_array($meta) && ($meta['counts'] ?? null) === $expectedCounts && ($meta['dryRun'] ?? null) === false, json_encode($meta));
    check('audit actor is superadmin', $audit !== false && ($audit['actor_role'] ?? null) === 'superadmin');
} finally {
    // Destructive cleanup LAST (taste #55): fixture rows + import audit
    // rows first, then reap the dev server and temp jars.
    try {
        cleanupV4Fixtures($pdo);
    } catch (Throwable $error) {
        fwrite(STDERR, 'cleanup warning: ' . $error->getMessage() . "\n");
    }
    stopV4Server();
    foreach ([$cookieSuper, $cookieCabang] as $jar) {
        if (is_string($jar)) @unlink($jar);
    }
    if (is_string($serverStdout)) @unlink($serverStdout);
    if (is_string($serverStderr)) @unlink($serverStderr);
}

echo "\n$total checks, $failures failed\n";
exit($failures > 0 ? 1 : 0);
