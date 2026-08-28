<?php
declare(strict_types=1);

// ============================================================
// M3.3 — Protect existing endpoints
// Verifies the VERIFY line: anonymous 401, cross-scope 403, duplicate 409,
// malformed 422, and valid same-scope writes, across read.php, absensi.php,
// sppPayments.php, honorPayments.php, sync.php.
//
// CSRF is now wired into all 5 endpoints (session.php's requireCsrf/
// csrfToken, api/auth/csrf.php as the token-fetch endpoint). Every
// authenticated POST call below that's expected to reach body/authorization
// checks fetches a token via csrfFor() first and sends it as
// X-CSRF-Token. Anonymous calls intentionally send no token — they're
// expected to fail at the 401 stage, before CSRF is ever checked.
//
// Confirmed check order per endpoint: 405 method -> 401 auth -> 403 CSRF ->
// 422 body validation -> 403 authorization/scope.
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

$config = require __DIR__ . '/../config.php';
if (!is_array($config)) {
    fwrite(STDERR, "config.php tidak me-return array\n");
    exit(1);
}
$pdo = new PDO($config['dsn'], $config['username'], $config['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

// --- seed fixtures: 2 branches, 1 admin per branch, 1 superadmin -------
$branchA = 'cbg-TEST-A';
$branchB = 'cbg-TEST-B';

function cleanupFixtures(PDO $pdo, string $branchA, string $branchB): void {
    $pdo->exec("DELETE FROM absensi WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM spp_payments WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM honor_payments WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM users WHERE username IN ('test_admin_a', 'test_admin_b', 'test_super')");
    $pdo->exec("DELETE FROM cabang WHERE id IN ('$branchA', '$branchB')");
}

cleanupFixtures($pdo, $branchA, $branchB); // in case a previous run died mid-way

$pdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, '{}')")
    ->execute([':id' => $branchA, ':kode' => 'TSTA', ':nama' => 'Test Branch A']);
$pdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, '{}')")
    ->execute([':id' => $branchB, ':kode' => 'TSTB', ':nama' => 'Test Branch B']);

function seedUser(PDO $pdo, string $id, string $username, string $role, ?string $cabangId): void {
    $pdo->prepare(
        'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, active, must_change_password)
         VALUES (:id, :u, :d, :p, :r, :c, 1, 0)'
    )->execute([
        ':id' => $id, ':u' => $username, ':d' => $username,
        ':p' => password_hash('Test1234!', PASSWORD_DEFAULT),
        ':r' => $role, ':c' => $cabangId,
    ]);
}

seedUser($pdo, 'usr-test-admA', 'test_admin_a', 'admin_cabang', $branchA);
seedUser($pdo, 'usr-test-admB', 'test_admin_b', 'admin_cabang', $branchB);
seedUser($pdo, 'usr-test-super', 'test_super', 'superadmin', null);

// --- spawn dev server -----------------------------------------------------
$docroot = realpath(__DIR__ . '/../..');
$port = 8199;
$base = "http://127.0.0.1:$port";
$serverStdout = tempnam(sys_get_temp_dir(), 'm33_stdout_');
$serverStderr = tempnam(sys_get_temp_dir(), 'm33_stderr_');
$server = proc_open(
    'php -S 127.0.0.1:' . $port . ' -t ' . escapeshellarg($docroot),
    [1 => ['file', $serverStdout, 'w'], 2 => ['file', $serverStderr, 'w']],
    $pipes
);

// Poll for the server to actually accept connections instead of a blind
// sleep — if a leftover process from a prior interrupted run is still
// bound to $port, this fails loudly here instead of hanging later deep
// inside a test.
$serverReady = false;
for ($i = 0; $i < 20; $i++) {
    usleep(200000);
    $status = proc_get_status($server);
    if (!$status['running']) {
        fwrite(STDERR, "php -S exited immediately — port $port is probably already in use by a leftover process.\n");
        fwrite(STDERR, "Check with: netstat -ano | grep $port\n");
        exit(1);
    }
    $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
    if ($conn) {
        fclose($conn);
        $serverReady = true;
        break;
    }
}
if (!$serverReady) {
    fwrite(STDERR, "Server on port $port never became reachable after 4s.\n");
    proc_terminate($server);
    exit(1);
}

function req(string $method, string $url, ?array $body = null, ?string $cookie = null, ?string $csrfToken = null): array {
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    if ($csrfToken !== null) $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        // Fail fast instead of hanging forever if the server (or a
        // leftover zombie process still bound to the port from a prior
        // interrupted run) never responds.
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 10,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    }
    $raw = curl_exec($ch);
    if ($raw === false) {
        global $serverStdout, $serverStderr;
        fwrite(STDERR, "Request $method $url failed/timed out: " . curl_error($ch) . "\n");
        fwrite(STDERR, "--- dev server stderr (tail) ---\n");
        fwrite(STDERR, implode('', array_slice(file($serverStderr) ?: [], -30)) . "\n");
        fwrite(STDERR, "--- dev server stdout (tail) ---\n");
        fwrite(STDERR, implode('', array_slice(file($serverStdout) ?: [], -30)) . "\n");
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, json_decode((string) $raw, true)];
}

function loginAs(string $base, string $username, string $cookieFile): void {
    [$status, $body] = req('POST', "$base/server/api/auth/login.php", ['username' => $username, 'password' => 'Test1234!'], $cookieFile);
    check("login as $username", $status === 200, 'status=' . $status . ' body=' . json_encode($body));
}

// Fetches a fresh CSRF token bound to this cookie jar's session, via the
// GET /server/api/auth/csrf.php endpoint. Exits hard on failure — every
// authenticated POST test below depends on this succeeding first.
function csrfFor(string $base, string $cookieFile, string $label): string {
    [$status, $body] = req('GET', "$base/server/api/auth/csrf.php", null, $cookieFile);
    if ($status !== 200 || !isset($body['csrfToken']) || !is_string($body['csrfToken'])) {
        fwrite(STDERR, "Failed to fetch CSRF token for $label (status=$status, body=" . json_encode($body) . ")\n");
        exit(1);
    }
    return $body['csrfToken'];
}

$cookieAdminA = tempnam(sys_get_temp_dir(), 'm33_a_');
$cookieAdminB = tempnam(sys_get_temp_dir(), 'm33_b_');
$cookieSuper  = tempnam(sys_get_temp_dir(), 'm33_s_');

loginAs($base, 'test_admin_a', $cookieAdminA);
loginAs($base, 'test_admin_b', $cookieAdminB);
loginAs($base, 'test_super', $cookieSuper);

$csrfAdminA = csrfFor($base, $cookieAdminA, 'admin_a');
$csrfSuper  = csrfFor($base, $cookieSuper, 'super');

// --- read.php --------------------------------------------------------
echo "\n--- read.php ---\n";
[$status] = req('GET', "$base/server/api/read.php");
check('anonymous GET -> 401', $status === 401, "got $status");

[$status, $body] = req('GET', "$base/server/api/read.php", null, $cookieAdminA);
check('admin_cabang A GET -> 200', $status === 200, "got $status");

// --- absensi.php: 401 / 403 (CSRF) / 403 (scope) / 201 / 409 / 422 ---
echo "\n--- absensi.php ---\n";
$absA = ['id' => 'abs-test-' . uniqid(), 'cabangId' => $branchA, 'tanggal' => '2026-01-01'];
$absB = ['id' => 'abs-test-' . uniqid(), 'cabangId' => $branchB, 'tanggal' => '2026-01-01'];

[$status] = req('POST', "$base/server/api/absensi.php", $absA);
check('anonymous POST -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", $absA, $cookieAdminA);
check('authenticated POST without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", $absB, $cookieAdminA, $csrfAdminA);
check('admin A writing branch B record -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", $absA, $cookieAdminA, $csrfAdminA);
check('admin A writing own branch record -> 201', $status === 201, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", $absA, $cookieAdminA, $csrfAdminA);
check('duplicate id -> 409', $status === 409, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", ['id' => 'abs-malformed-' . uniqid()], $cookieAdminA, $csrfAdminA);
check('missing cabangId -> 422', $status === 422, "got $status");

// --- sppPayments.php: same shape --------------------------------------
echo "\n--- sppPayments.php ---\n";
$sppA = ['id' => 'spp-test-' . uniqid(), 'cabangId' => $branchA, 'nominal' => 100000];

[$status] = req('POST', "$base/server/api/sppPayments.php", $sppA);
check('anonymous POST -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/sppPayments.php", ['id' => 'spp-cross-' . uniqid(), 'cabangId' => $branchB], $cookieAdminA, $csrfAdminA);
check('admin A writing branch B record -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/sppPayments.php", $sppA, $cookieAdminA, $csrfAdminA);
check('admin A writing own branch record -> 201', $status === 201, "got $status");

[$status] = req('POST', "$base/server/api/sppPayments.php", $sppA, $cookieAdminA, $csrfAdminA);
check('duplicate id -> 409', $status === 409, "got $status");

// --- honorPayments.php: admin_cabang must be BLOCKED (read-only) -----
echo "\n--- honorPayments.php (admin_cabang read-only per matrix) ---\n";
$honorA = ['id' => 'pay-test-' . uniqid(), 'cabangId' => $branchA, 'trainerId' => 'trn-x', 'nominal' => 50000];

[$status] = req('POST', "$base/server/api/honorPayments.php", $honorA);
check('anonymous POST -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/honorPayments.php", $honorA, $cookieAdminA, $csrfAdminA);
check('admin_cabang writing own branch -> 403 (read-only per matrix)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/honorPayments.php", $honorA, $cookieSuper, $csrfSuper);
check('superadmin writing -> 201', $status === 201, "got $status");

// --- sync.php: batch, per-entry authorization -------------------------
echo "\n--- sync.php ---\n";
[$status] = req('POST', "$base/server/api/sync.php", ['entries' => []]);
check('anonymous POST -> 401', $status === 401, "got $status");

$batch = [
    'entries' => [
        ['key' => 'absensi', 'record' => ['id' => 'abs-sync-' . uniqid(), 'cabangId' => $branchA, 'tanggal' => '2026-01-02']],
        ['key' => 'absensi', 'record' => ['id' => 'abs-sync-cross-' . uniqid(), 'cabangId' => $branchB, 'tanggal' => '2026-01-02']],
    ],
];
[$status, $body] = req('POST', "$base/server/api/sync.php", $batch, $cookieAdminA, $csrfAdminA);
check('batch as admin A -> 200 (per-entry result, not global reject)', $status === 200, "got $status");
check('same-branch entry -> synced', count($body['synced'] ?? []) === 1, json_encode($body));
check('cross-branch entry -> failed, not silently written', count($body['failed'] ?? []) === 1, json_encode($body));

// --- cleanup -----------------------------------------------------------
cleanupFixtures($pdo, $branchA, $branchB);
proc_terminate($server);
@unlink($cookieAdminA);
@unlink($cookieAdminB);
@unlink($cookieSuper);

echo "\n$total checks, $failures failed\n";
exit($failures > 0 ? 1 : 0);