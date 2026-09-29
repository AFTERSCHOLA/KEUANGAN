<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../auth/authorize.php';

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
    $pdo->exec("DELETE FROM trainer WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM siswa WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM sekolah WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM absensi WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM spp_payments WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM honor_payments WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM audit_log WHERE cabang_id IN ('$branchA', '$branchB') OR actor_user_id IN ('usr-test-admA', 'usr-test-admB', 'usr-test-super')"); // <-- baris baru
    $pdo->exec("DELETE FROM users WHERE username IN ('test_admin_a', 'test_admin_b', 'test_super')");
    $pdo->exec("DELETE FROM settings WHERE id LIKE 'set-test-%'");
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

$sekolahA = 'skl-TEST-A';
$sekolahB = 'skl-TEST-B';
$pdo->prepare("INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang_id, '{}')")
    ->execute([':id' => $sekolahA, ':cabang_id' => $branchA]);
$pdo->prepare("INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang_id, '{}')")
    ->execute([':id' => $sekolahB, ':cabang_id' => $branchB]);

// --- spawn dev server -----------------------------------------------------
// Uses PHP_BINARY (the running interpreter) so no PATH discovery is needed,
// a free port so a leftover server from a killed run can never squat it,
// and a shutdown-function reaper with taskkill /T so no orphan php.exe
// survives on Windows (proc_terminate alone leaves the child behind).
function findFreePortM33(): int {
    $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if ($socket === false) {
        fwrite(STDERR, "Could not allocate a free port: {$errstr}\n");
        exit(1);
    }
    $name = stream_socket_get_name($socket, false);
    fclose($socket);
    $parts = explode(':', (string) $name);
    return (int) end($parts);
}

$docroot = realpath(__DIR__ . '/../..');
$port = findFreePortM33();
$base = "http://127.0.0.1:$port";
$serverStdout = tempnam(sys_get_temp_dir(), 'm33_stdout_');
$serverStderr = tempnam(sys_get_temp_dir(), 'm33_stderr_');
$server = proc_open(
    sprintf('%s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $port, escapeshellarg($docroot)),
    [1 => ['file', $serverStdout, 'w'], 2 => ['file', $serverStderr, 'w']],
    $pipes
);
$serverPid = is_resource($server) ? (proc_get_status($server)['pid'] ?? 0) : 0;

function stopM33Server(): void {
    global $server, $serverPid;
    if (isset($server) && is_resource($server)) {
        // Windows-safe reaping: kill the whole process tree so no
        // orphan php.exe survives an interrupt (proc_terminate alone
        // can leave the child behind on Win32).
        if (PHP_OS_FAMILY === 'Windows' && (int) $serverPid > 0) {
            @exec('taskkill /PID ' . (int) $serverPid . ' /T /F 2>NUL');
        }
        @proc_terminate($server);
        @proc_close($server);
    }
    $server = null;
}
register_shutdown_function('stopM33Server');

// Poll for the server to actually accept connections instead of a blind
// sleep — if a leftover process from a prior interrupted run is still
// bound to $port, this fails loudly here instead of hanging later deep
// inside a test.
//
// Windows quirk: proc_get_status() can transiently report 'running' =
// false for a freshly-spawned `php -S` while the child is still
// binding the socket (PHP bug #77568 family). The connection probe is
// the real readiness signal; use it as the gate. We still consult
// proc_get_status once the probe succeeds to fail loudly if the
// process really did exit.
$serverReady = false;
for ($i = 0; $i < 20; $i++) {
    usleep(200000);
    $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
    if ($conn) {
        fclose($conn);
        $serverReady = true;
        break;
    }
}
if (!$serverReady) {
    $status = proc_get_status($server);
    fwrite(STDERR, "Server on port $port never became reachable after 4s. proc_get_status running=" . ($status['running'] ? 'true' : 'false') . " exitcode=" . ($status['exitcode'] ?? 'n/a') . "\n");
    fwrite(STDERR, "--- dev server stderr ---\n" . implode('', array_slice(file($serverStderr) ?: [], -20)) . "\n");
    fwrite(STDERR, "--- dev server stdout ---\n" . implode('', array_slice(file($serverStdout) ?: [], -20)) . "\n");
    stopM33Server();
    exit(1);
}
$status = proc_get_status($server);
if (!$status['running'] && ($status['exitcode'] ?? 0) !== 0) {
    fwrite(STDERR, "php -S died with non-zero exit after binding port. Check stderr above.\n");
    stopM33Server();
    exit(1);
}

function req(
    string $method,
    string $url,
    ?array $body = null,
    ?string $cookie = null,
    ?string $csrfToken = null,
    ?string $cookieJar = null
): array {
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];

    if ($csrfToken !== null) {
        $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 10,
    ]);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    }

    if ($cookieJar !== null) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieJar);
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

// --- absensi.php: verify action (separate from write/insertLedger) ---
echo "\n--- absensi.php (verify) ---\n";
$absVerify = ['id' => $absA['id'], 'action' => 'verify'];

[$status] = req('POST', "$base/server/api/absensi.php", $absVerify);
check('anonymous verify -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", $absVerify, $cookieAdminA);
check('verify without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", $absVerify, $cookieAdminB, csrfFor($base, $cookieAdminB, 'admin_b'));
check('admin B verifying branch A record -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", ['action' => 'verify'], $cookieAdminA, $csrfAdminA);
check('verify without id -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", ['id' => 'abs-missing-' . uniqid(), 'action' => 'verify'], $cookieAdminA, $csrfAdminA);
check('verifying non-existent record -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/absensi.php", $absVerify, $cookieAdminA, $csrfAdminA);
check('admin A verifying own-branch record -> 200', $status === 200, "got $status");
check('response statusVerifikasi.by is server-derived role', ($body['statusVerifikasi']['by'] ?? null) === 'admin_cabang', json_encode($body));
check('response statusVerifikasi.at looks like an ISO timestamp', is_string($body['statusVerifikasi']['at'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/', $body['statusVerifikasi']['at']), json_encode($body));

// Client cannot forge who verified or when — a caller-supplied
// statusVerifikasi in the request body must be ignored, not trusted.
[$status, $body] = req('POST', "$base/server/api/absensi.php", $absVerify + ['statusVerifikasi' => ['by' => 'superadmin', 'at' => '2000-01-01T00:00:00Z']], $cookieAdminA, $csrfAdminA);
check('client-supplied statusVerifikasi is ignored, not trusted', $status === 200 && ($body['statusVerifikasi']['by'] ?? null) === 'admin_cabang', json_encode($body));

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

// --- honorPayments.php: contract moved by AP.D.1 (D-AP7) ---
// admin_cabang appends/corrects OWN branch (201, trailed); cross-branch
// stays 403. The old blanket-403 leg is superseded by the AP.D.1 block
// below; anonymous still 401, superadmin still 201.
echo "\n--- honorPayments.php (AP.D.1 contract) ---\n";
$honorA = ['id' => 'pay-test-' . uniqid(), 'cabangId' => $branchA, 'trainerId' => 'trn-x', 'nominal' => 50000];

[$status] = req('POST', "$base/server/api/honorPayments.php", $honorA);
check('anonymous POST -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/honorPayments.php", $honorA, $cookieSuper, $csrfSuper);
check('superadmin writing -> 201', $status === 201, "got $status");

// --- AP.D.1: admin_cabang own-branch honor write (D-AP7) ---
echo "\n--- honorPayments.php (AP.D.1 admin_cabang own-branch write) ---\n";
$honorAdmin = ['id' => 'pay-apd-' . uniqid(), 'cabangId' => $branchA, 'trainerId' => 'trn-x', 'nominal' => 25000];

[$status] = req('POST', "$base/server/api/honorPayments.php", $honorAdmin, $cookieAdminA, $csrfAdminA);
check('admin_cabang appending own branch -> 201', $status === 201, "got $status");

$honorCross = ['id' => 'pay-apd-' . uniqid(), 'cabangId' => $branchB, 'trainerId' => 'trn-x', 'nominal' => 25000];
[$status] = req('POST', "$base/server/api/honorPayments.php", $honorCross, $cookieAdminA, $csrfAdminA);
check('admin_cabang appending other branch -> 403', $status === 403, "got $status");

$honorCorr = ['id' => 'pay-apd-' . uniqid(), 'cabangId' => $branchA, 'trainerId' => 'trn-x', 'nominal' => 0];
[$status] = req('POST', "$base/server/api/honorPayments.php", ['record' => $honorCorr, 'correctionOf' => $honorAdmin['id'], 'action' => 'correct'], $cookieAdminA, $csrfAdminA);
check('admin_cabang correcting own branch -> 201', $status === 201, "got $status");

// --- siswa.php: cabangId always server-derived from sekolahId --------
echo "\n--- siswa.php ---\n";
$swA = ['id' => 'sw-test-' . uniqid(), 'sekolahId' => $sekolahA, 'nama' => 'Siswa Test A'];

[$status] = req('POST', "$base/server/api/siswa.php", $swA);
check('anonymous POST -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", $swA, $cookieAdminA);
check('authenticated POST without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", ['id' => 'sw-cross-' . uniqid(), 'sekolahId' => $sekolahB], $cookieAdminA, $csrfAdminA);
check('admin A creating student at branch B school -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", ['id' => 'sw-noskl-' . uniqid()], $cookieAdminA, $csrfAdminA);
check('missing sekolahId -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", $swA + ['cabangId' => $branchA], $cookieAdminA, $csrfAdminA);
check('client-supplied cabangId rejected -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/siswa.php", $swA, $cookieAdminA, $csrfAdminA);
check('admin A creating student at own-branch school -> 201', $status === 201, "got $status");
check('response cabangId matches school\'s branch (server-derived)', ($body['cabangId'] ?? null) === $branchA, json_encode($body));

[$status] = req('POST', "$base/server/api/siswa.php", $swA, $cookieAdminA, $csrfAdminA);
check('duplicate id -> 409', $status === 409, "got $status");

echo "\n--- siswa.php (update) ---\n";
$swUpdate = ['id' => $swA['id'], 'action' => 'update', 'version' => 1, 'sekolahId' => $sekolahA, 'nama' => 'Siswa Test A (updated)'];

[$status] = req('POST', "$base/server/api/siswa.php", $swUpdate);
check('anonymous update -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", $swUpdate, $cookieAdminA);
check('update without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", $swUpdate + ['cabangId' => $branchA], $cookieAdminA, $csrfAdminA);
check('update with client-supplied cabangId -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", $swUpdate, $cookieAdminB, csrfFor($base, $cookieAdminB, 'admin_b'));
check('admin B updating branch A student -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", ['id' => $swA['id'], 'action' => 'update', 'sekolahId' => $sekolahB, 'nama' => 'moved'], $cookieAdminA, $csrfAdminA);
check('admin A "moving" own student to branch B school -> 403', $status === 403, "got $status");

[$status, $body] = req('POST', "$base/server/api/siswa.php", $swUpdate, $cookieAdminA, $csrfAdminA);
check('admin A updating own-branch student -> 200', $status === 200, "got $status");
check('version incremented to 2', ($body['version'] ?? null) === 2, json_encode($body));

[$status] = req('POST', "$base/server/api/siswa.php", ['id' => 'sw-missing-' . uniqid(), 'action' => 'update', 'sekolahId' => $sekolahA], $cookieAdminA, $csrfAdminA);
check('updating non-existent student -> 422', $status === 422, "got $status");

echo "\n--- siswa.php (delete) ---\n";
$swDelete = ['id' => $swA['id'], 'action' => 'delete'];

[$status] = req('POST', "$base/server/api/siswa.php", $swDelete);
check('anonymous delete -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", $swDelete, $cookieAdminA);
check('delete without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", ['id' => 'sw-missing-' . uniqid(), 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('deleting non-existent student -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", $swDelete, $cookieAdminB, csrfFor($base, $cookieAdminB, 'admin_b'));
check('admin B deleting branch A student -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", $swDelete, $cookieAdminA, $csrfAdminA);
check('admin A deleting own-branch student -> 200', $status === 200, "got $status");

[$status] = req('POST', "$base/server/api/siswa.php", $swDelete, $cookieAdminA, $csrfAdminA);
check('deleting already-deleted student -> 422 (confirms hard delete happened)', $status === 422, "got $status");

// --- sekolah.php: cabangId forced from session (admin_cabang) or ------
// explicit+validated (superadmin) -- never trusted as-is from admin_cabang
echo "\n--- sekolah.php (create) ---\n";
$sklNew = ['id' => 'skl-new-' . uniqid(), 'nama' => 'Sekolah Baru A'];

[$status] = req('POST', "$base/server/api/sekolah.php", $sklNew);
check('anonymous create -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/sekolah.php", $sklNew, $cookieAdminA);
check('create without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/sekolah.php", $sklNew + ['cabangId' => $branchA], $cookieAdminA, $csrfAdminA);
check('admin_cabang sending cabangId (even matching own) -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/sekolah.php", $sklNew, $cookieAdminA, $csrfAdminA);
check('admin A creating school (cabangId forced from session) -> 201', $status === 201, "got $status");
check('cabangId forced to admin A\'s own branch', ($body['cabangId'] ?? null) === $branchA, json_encode($body));

[$status] = req('POST', "$base/server/api/sekolah.php", $sklNew, $cookieAdminA, $csrfAdminA);
check('duplicate id -> 409', $status === 409, "got $status");

$sklSuperNoCabang = ['id' => 'skl-super-' . uniqid(), 'nama' => 'Sekolah Superadmin'];
[$status] = req('POST', "$base/server/api/sekolah.php", $sklSuperNoCabang, $cookieSuper, $csrfSuper);
check('superadmin without cabangId -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/sekolah.php", $sklSuperNoCabang + ['cabangId' => 'cbg-does-not-exist'], $cookieSuper, $csrfSuper);
check('superadmin with unknown cabangId -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/sekolah.php", $sklSuperNoCabang + ['cabangId' => $branchB], $cookieSuper, $csrfSuper);
check('superadmin explicitly targeting branch B -> 201', $status === 201, "got $status");
check('cabangId matches explicit target', ($body['cabangId'] ?? null) === $branchB, json_encode($body));

echo "\n--- sekolah.php (update) ---\n";
$sklUpdate = ['id' => $sklNew['id'], 'action' => 'update', 'nama' => 'Sekolah Baru A (updated)'];

[$status] = req('POST', "$base/server/api/sekolah.php", $sklUpdate, $cookieAdminB, csrfFor($base, $cookieAdminB, 'admin_b'));
check('admin B updating branch A school -> 403', $status === 403, "got $status");

[$status, $body] = req('POST', "$base/server/api/sekolah.php", $sklUpdate, $cookieAdminA, $csrfAdminA);
check('admin A updating own-branch school -> 200', $status === 200, "got $status");
check('version incremented to 2', ($body['version'] ?? null) === 2, json_encode($body));

echo "\n--- sekolah.php (delete) ---\n";
[$status] = req('POST', "$base/server/api/sekolah.php", ['id' => $sklNew['id'], 'action' => 'delete'], $cookieAdminB, csrfFor($base, $cookieAdminB, 'admin_b'));
check('admin B deleting branch A school -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/sekolah.php", ['id' => $sklNew['id'], 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('admin A deleting own-branch school -> 200', $status === 200, "got $status");

[$status] = req('POST', "$base/server/api/sekolah.php", ['id' => $sklNew['id'], 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('deleting already-deleted school -> 422', $status === 422, "got $status");

// --- trainer.php: same cabangId authority pattern as sekolah.php ------
echo "\n--- trainer.php (create) ---\n";
$trnNew = ['id' => 'trn-new-' . uniqid(), 'nama' => 'Trainer Baru A'];

[$status] = req('POST', "$base/server/api/trainer.php", $trnNew);
check('anonymous create -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/trainer.php", $trnNew, $cookieAdminA);
check('create without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/trainer.php", $trnNew + ['cabangId' => $branchA], $cookieAdminA, $csrfAdminA);
check('admin_cabang sending cabangId (even matching own) -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/trainer.php", $trnNew, $cookieAdminA, $csrfAdminA);
check('admin A creating trainer (cabangId forced from session) -> 201', $status === 201, "got $status");
check('cabangId forced to admin A\'s own branch', ($body['cabangId'] ?? null) === $branchA, json_encode($body));

[$status] = req('POST', "$base/server/api/trainer.php", $trnNew, $cookieAdminA, $csrfAdminA);
check('duplicate id -> 409', $status === 409, "got $status");

echo "\n--- trainer.php (update) ---\n";
$trnUpdate = ['id' => $trnNew['id'], 'action' => 'update', 'version' => 1, 'nama' => 'Trainer Baru A (updated)'];

[$status] = req('POST', "$base/server/api/trainer.php", $trnUpdate, $cookieAdminB, csrfFor($base, $cookieAdminB, 'admin_b'));
check('admin B updating branch A trainer -> 403', $status === 403, "got $status");

[$status, $body] = req('POST', "$base/server/api/trainer.php", $trnUpdate, $cookieAdminA, $csrfAdminA);
check('admin A updating own-branch trainer -> 200', $status === 200, "got $status");
check('version incremented to 2', ($body['version'] ?? null) === 2, json_encode($body));

// Edge case specific to trainer: cabang_id is nullable in schema (unlike
// sekolah/siswa). An unassigned trainer must be untouchable by ANY
// admin_cabang — only superadmin (bypasses authorize()) can manage it,
// until it's given a branch.
$trnOrphan = 'trn-orphan-' . uniqid();
$pdo->prepare('INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, NULL, \'{}\')')->execute([':id' => $trnOrphan]);

[$status] = req('POST', "$base/server/api/trainer.php", ['id' => $trnOrphan, 'action' => 'update', 'nama' => 'x'], $cookieAdminA, $csrfAdminA);
check('admin A updating unassigned (NULL cabang_id) trainer -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/trainer.php", ['id' => $trnOrphan, 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('admin A deleting unassigned (NULL cabang_id) trainer -> 403', $status === 403, "got $status");

$pdo->exec("DELETE FROM trainer WHERE id = '$trnOrphan'");

// ============================================================
// CS.A.2 (F-CS1; D-CS1) — link-add slot picks on trainer.php.
// Optional `slotPicks` narrows auto-create to picked slots; absent
// preserves AP.A.1 (one unscoped row); malformed 422s; the key never
// lands in trainer.payload (Part 2 R8).
// ============================================================
echo "\n--- trainer.php (CS.A.2 slotPicks) ---\n";
$csaSch = 'skl-csa2-' . uniqid();
$pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')->execute([
    ':id' => $csaSch,
    ':cabang_id' => $branchA,
    ':payload' => json_encode([
        'id' => $csaSch,
        'cabangId' => $branchA,
        'jadwalList' => [['dayOfWeek' => 'Senin', 'time' => '09:00', 'endTime' => '10:00']],
    ], JSON_UNESCAPED_UNICODE),
]);
$csaTrn = static function (PDO $pdo, string $base, string $cookie, string $csrf, string $branchA): array {
    $t = ['id' => 'trn-csa2-' . uniqid(), 'nama' => 'Trainer CSA2'];
    [$status] = req('POST', "$base/server/api/trainer.php", $t, $cookie, $csrf);
    check('CS.A.2 fixture trainer created -> 201', $status === 201, "got $status");
    return $t;
};
$csaPayload = static function (PDO $pdo, string $id): array {
    $stmt = $pdo->prepare('SELECT payload FROM trainer WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    $decoded = is_array($row) ? json_decode((string) $row['payload'], true) : null;
    return is_array($decoded) ? $decoded : [];
};

$trnSemua = $csaTrn($pdo, $base, $cookieAdminA, $csrfAdminA, $branchA);
[$status] = req('POST', "$base/server/api/trainer.php", [
    'action' => 'update', 'id' => $trnSemua['id'], 'version' => 1, 'nama' => $trnSemua['nama'],
    'sekolahIds' => [$csaSch], 'slotPicks' => [$csaSch => [null]],
], $cookieAdminA, $csrfAdminA);
check('CS.A.2 Semua-slot pick links one unscoped row -> 200', $status === 200, "got $status");
$rowsSemua = $csaPayload($pdo, $trnSemua['id'])['penugasanPengajar'] ?? null;
check(
    'CS.A.2 Semua-slot row is unscoped',
    is_array($rowsSemua) && count($rowsSemua) === 1 && ($rowsSemua[0]['hari'] ?? null) === null,
    json_encode($rowsSemua)
);
check(
    'CS.A.2 slotPicks never lands in trainer.payload (R8)',
    !array_key_exists('slotPicks', $csaPayload($pdo, $trnSemua['id'])),
    'slotPicks persisted'
);

$trnScoped = $csaTrn($pdo, $base, $cookieAdminA, $csrfAdminA, $branchA);
[$status] = req('POST', "$base/server/api/trainer.php", [
    'action' => 'update', 'id' => $trnScoped['id'], 'version' => 1, 'nama' => $trnScoped['nama'],
    'sekolahIds' => [$csaSch],
    'slotPicks' => [$csaSch => [['hari' => 'Senin', 'jamMulai' => '09:00', 'jamSelesai' => '10:00']]],
], $cookieAdminA, $csrfAdminA);
check('CS.A.2 scoped pick links one scoped row -> 200', $status === 200, "got $status");
$rowsScoped = $csaPayload($pdo, $trnScoped['id'])['penugasanPengajar'] ?? null;
check(
    'CS.A.2 scoped row carries the picked triple',
    is_array($rowsScoped) && count($rowsScoped) === 1
        && ($rowsScoped[0]['hari'] ?? null) === 'Senin'
        && ($rowsScoped[0]['jamMulai'] ?? null) === '09:00'
        && ($rowsScoped[0]['jamSelesai'] ?? null) === '10:00',
    json_encode($rowsScoped)
);

$trnLegacy = $csaTrn($pdo, $base, $cookieAdminA, $csrfAdminA, $branchA);
[$status] = req('POST', "$base/server/api/trainer.php", [
    'action' => 'update', 'id' => $trnLegacy['id'], 'version' => 1, 'nama' => $trnLegacy['nama'],
    'sekolahIds' => [$csaSch],
    'slotPicks' => [$csaSch => [['hari' => 'Senin', 'jamMulai' => '09:00', 'jamSelesai' => '11:00']]],
], $cookieAdminA, $csrfAdminA);
check('CS.A.2 out-of-vocabulary pick rejected -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/trainer.php", [
    'action' => 'update', 'id' => $trnLegacy['id'], 'version' => 1, 'nama' => $trnLegacy['nama'],
    'sekolahIds' => [$csaSch], 'slotPicks' => 'bogus',
], $cookieAdminA, $csrfAdminA);
check('CS.A.2 malformed slotPicks rejected -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/trainer.php", [
    'action' => 'update', 'id' => $trnLegacy['id'], 'version' => 1, 'nama' => $trnLegacy['nama'],
    'sekolahIds' => [$csaSch],
], $cookieAdminA, $csrfAdminA);
check('CS.A.2 no picks preserves AP.A.1 unscoped row -> 200', $status === 200, "got $status");
$rowsLegacy = $csaPayload($pdo, $trnLegacy['id'])['penugasanPengajar'] ?? null;
check(
    'CS.A.2 legacy row shape byte-identical (no hari key)',
    is_array($rowsLegacy) && count($rowsLegacy) === 1 && !array_key_exists('hari', $rowsLegacy[0]),
    json_encode($rowsLegacy)
);

$pdo->exec("DELETE FROM trainer WHERE id IN ('{$trnSemua['id']}', '{$trnScoped['id']}', '{$trnLegacy['id']}')");
$pdo->exec("DELETE FROM sekolah WHERE id = '$csaSch'");

echo "\n--- trainer.php (delete) ---\n";
[$status] = req('POST', "$base/server/api/trainer.php", ['id' => $trnNew['id'], 'action' => 'delete'], $cookieAdminB, csrfFor($base, $cookieAdminB, 'admin_b'));
check('admin B deleting branch A trainer -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/trainer.php", ['id' => $trnNew['id'], 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('admin A deleting own-branch trainer -> 200', $status === 200, "got $status");

[$status] = req('POST', "$base/server/api/trainer.php", ['id' => $trnNew['id'], 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('deleting already-deleted trainer -> 422', $status === 422, "got $status");

// --- trainer.php: superadmin restrictions (WA thread 1/9/2026 final) --
// superadmin: read + update only, never create/delete trainer.
// admin_cabang: full CRUD, cabangId always server-derived from session.
echo "\n--- trainer.php (superadmin restrictions) ---\n";

// ============================================================
// TA.A.3 — assignment scope
// ============================================================

// Seed trainer fixtures for TA.A.3 assignment-scope tests.
$trnA = ['id' => 'trn-ta-a-' . uniqid(), 'nama' => 'Trainer TA A'];
$trnB = ['id' => 'trn-ta-b-' . uniqid(), 'nama' => 'Trainer TA B'];

[$status, $body] = req(
    'POST',
    "$base/server/api/trainer.php",
    $trnA,
    $cookieAdminA,
    $csrfAdminA
);

check(
    'admin A creating trainer A for assignment-scope tests -> 201',
    $status === 201,
    "got $status"
);

[$status, $body] = req(
    'POST',
    "$base/server/api/trainer.php",
    $trnB,
    $cookieAdminA,
    $csrfAdminA
);

check(
    'admin A creating trainer B for assignment-scope tests -> 201',
    $status === 201,
    "got $status"
);

// Create login identity for trainer A used by TA.A.3 assignment-scope tests.
$trainerUserId = 'usr-ta-a-' . uniqid();
$trainerPasswordHash = password_hash('test_trainer_a', PASSWORD_DEFAULT);

$pdo->prepare(
    'DELETE FROM users WHERE username = :username'
)->execute([
    ':username' => 'test_trainer_a',
]);

$stmt = $pdo->prepare(
    'INSERT INTO users
        (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password)
     VALUES
        (:id, :username, :display_name, :password_hash, :role, :cabang_id, :trainer_id, 1, 0)'
);

$stmt->execute([
    ':id' => $trainerUserId,
    ':username' => 'test_trainer_a',
    ':display_name' => 'Trainer TA A',
    ':password_hash' => $trainerPasswordHash,
    ':role' => 'trainer',
    ':cabang_id' => $branchA,
    ':trainer_id' => $trnA['id'],
]);

// Login as trainer A so read.php can exercise trainer assignment scope.
$cookieTrainerA = tempnam(sys_get_temp_dir(), 'cookie_trainer_a_');

[$status, $body] = req(
    'POST',
    "$base/server/api/auth/login.php",
    [
        'username' => 'test_trainer_a',
        'password' => 'test_trainer_a',
    ],
    null,
    null,
    $cookieTrainerA
);

check(
    'login as test_trainer_a',
    $status === 200,
    "got $status"
);

// --- absensi.php (update + certify, DC.B.1): queue-drop needs a server
// path for edits/verify-stamps/certify-stamps that the INSERT-only write
// path 409s and sync.php silently skipped (alreadyApplied) ---
echo "\n--- absensi.php (update + certify, DC.B.1) ---\n";
$dcbSchool = 'skl-dcb-' . uniqid();
$pdo->prepare(
    'INSERT INTO sekolah (id, cabang_id, payload)
     VALUES (:id, :cabang_id, :payload)'
)->execute([
    ':id' => $dcbSchool,
    ':cabang_id' => $branchA,
    ':payload' => json_encode(['id' => $dcbSchool, 'cabangId' => $branchA, 'nama' => 'SD DCB Sim'], JSON_UNESCAPED_UNICODE),
]);
$dcbAbs = [
    'id' => 'abs-dcb-' . uniqid(),
    'cabangId' => $branchA,
    'sekolahId' => $dcbSchool,
    'trainerId' => $trnA['id'],
    'tanggal' => '2026-09-04',
    'periode' => '2026-09',
    'trainerStatus' => 'Hadir',
    'siswaList' => [],
    'catatan' => 'awal',
];
[$status] = req('POST', "$base/server/api/absensi.php", $dcbAbs, $cookieAdminA, $csrfAdminA);
check('DC.B.1 seed legacy absensi row -> 201', $status === 201, "got $status");

$dcbUpd = array_merge($dcbAbs, ['action' => 'update', 'catatan' => 'ralat']);
[$status] = req('POST', "$base/server/api/absensi.php", $dcbUpd);
check('anonymous update -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", $dcbUpd, $cookieAdminB, csrfFor($base, $cookieAdminB, 'admin_b'));
check('admin B updating branch A record -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/absensi.php", ['id' => 'abs-missing-' . uniqid(), 'cabangId' => $branchA, 'action' => 'update'], $cookieAdminA, $csrfAdminA);
check('updating non-existent record -> 422', $status === 422, "got $status");

$dcbBad = $dcbUpd;
unset($dcbBad['sekolahId']);
[$status] = req('POST', "$base/server/api/absensi.php", $dcbBad, $cookieAdminA, $csrfAdminA);
check('update dropping required sekolahId -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/absensi.php", $dcbUpd, $cookieAdminA, $csrfAdminA);
check('admin A updating own-branch record -> 200', $status === 200, "got $status");
$dcbRow = $pdo->query("SELECT payload FROM absensi WHERE id = '" . $dcbAbs['id'] . "'")->fetch();
check('updated catatan persisted server-side', json_decode($dcbRow['payload'], true)['catatan'] === 'ralat', substr(json_encode($dcbRow), 0, 160));

$csrfTrainerAHere = csrfFor($base, $cookieTrainerA, 'trainer_a');
$dcbCert = ['id' => $dcbAbs['id'], 'action' => 'certify'];
[$status] = req('POST', "$base/server/api/absensi.php", $dcbCert);
check('anonymous certify -> 401', $status === 401, "got $status");

[$status, $body] = req('POST', "$base/server/api/absensi.php", $dcbCert, $cookieTrainerA, $csrfTrainerAHere);
check('trainer A certifying own row -> 200', $status === 200, "got $status");
check('response konfirmasiTrainer looks like a server ISO timestamp', is_string($body['konfirmasiTrainer'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/', $body['konfirmasiTrainer']), json_encode($body));

[$status, $body] = req('POST', "$base/server/api/absensi.php", $dcbCert + ['konfirmasiTrainer' => '2000-01-01T00:00:00Z'], $cookieTrainerA, $csrfTrainerAHere);
check('client-supplied konfirmasiTrainer is ignored, not trusted', $status === 200 && ($body['konfirmasiTrainer'] ?? null) !== '2000-01-01T00:00:00Z', json_encode($body));

$dcbAbsB = array_merge($dcbAbs, ['id' => 'abs-dcb-' . uniqid(), 'trainerId' => $trnB['id']]);
[$status] = req('POST', "$base/server/api/absensi.php", $dcbAbsB, $cookieAdminA, $csrfAdminA);
check('DC.B.1 seed second row for trainer B -> 201', $status === 201, "got $status");
[$status] = req('POST', "$base/server/api/absensi.php", ['id' => $dcbAbsB['id'], 'action' => 'certify'], $cookieTrainerA, $csrfTrainerAHere);
check('trainer A certifying trainer B row -> 403', $status === 403, "got $status");

echo "\n--- TA.A.3 assignment scope ---\n";

// Trainer A hanya boleh membaca sekolah yang assignment-nya
// mencantumkan dirinya sebagai trainerId/asistenId.
$assignmentSchoolA = 'skl-ta-a-' . uniqid();
$assignmentSchoolB = 'skl-ta-b-' . uniqid();

$pdo->prepare(
    'INSERT INTO sekolah (id, cabang_id, payload)
     VALUES (:id, :cabang_id, :payload)'
)->execute([
    ':id' => $assignmentSchoolA,
    ':cabang_id' => $branchA,
    ':payload' => json_encode([
        'id' => $assignmentSchoolA,
        'cabangId' => $branchA,
        // penugasanPengajar TIDAK disimpan di sekolah — sengaja dihapus
        // dari sini supaya test membuktikan read.php baca dari trainer,
        // bukan diam-diam lolos gara-gara data dobel di kedua tempat.
    ], JSON_UNESCAPED_UNICODE),
]);

$pdo->prepare(
    'INSERT INTO sekolah (id, cabang_id, payload)
     VALUES (:id, :cabang_id, :payload)'
)->execute([
    ':id' => $assignmentSchoolB,
    ':cabang_id' => $branchA,
    ':payload' => json_encode([
        'id' => $assignmentSchoolB,
        'cabangId' => $branchA,
        // penugasanPengajar TIDAK disimpan di sekolah — sengaja dihapus
        // dari sini supaya test membuktikan read.php baca dari trainer,
        // bukan diam-diam lolos gara-gara data dobel di kedua tempat.
    ], JSON_UNESCAPED_UNICODE),
]);

$assignmentA = [
    'id' => 'assign-ta3-a-' . uniqid(),
    'sekolahId' => $assignmentSchoolA,
    'trainerId' => $trnA['id'],
    'asistenId' => null,
];

$assignmentB = [
    'id' => 'assign-ta3-b-' . uniqid(),
    'sekolahId' => $assignmentSchoolB,
    'trainerId' => $trnB['id'],
    'asistenId' => null,
];

// Simpan assignment ke payload trainer A/B.
$trainerPayloadA = [
    'id' => $trnA['id'],
    'cabangId' => $branchA,
    'penugasanPengajar' => [$assignmentA],
];

$trainerPayloadB = [
    'id' => $trnB['id'],
    'cabangId' => $branchA,
    'penugasanPengajar' => [$assignmentB],
];

$pdo->prepare(
    'UPDATE trainer SET payload = :payload WHERE id = :id'
)->execute([
    ':payload' => json_encode($trainerPayloadA, JSON_UNESCAPED_UNICODE),
    ':id' => $trnA['id'],
]);

$pdo->prepare(
    'UPDATE trainer SET payload = :payload WHERE id = :id'
)->execute([
    ':payload' => json_encode($trainerPayloadB, JSON_UNESCAPED_UNICODE),
    ':id' => $trnB['id'],
]);

[$status, $body] = req(
    'GET',
    "$base/server/api/read.php?entity=sekolah",
    null,
    $cookieTrainerA
);

check(
    'trainer A read sekolah -> 200',
    $status === 200,
    "got $status"
);

check(
    'trainer A sees assigned school',
    is_array($body)
        && count(array_filter(
            $body,
            static fn ($row) => ($row['id'] ?? null) === $assignmentSchoolA
        )) === 1,
    json_encode($body)
);

check(
    'trainer A does NOT see another trainer assignment',
    is_array($body)
        && count(array_filter(
            $body,
            static fn ($row) => ($row['id'] ?? null) === $assignmentSchoolB
        )) === 0,
    json_encode($body)
);

// Bypass attempt: client cannot simply claim trainer B's ID.
// authorize() must use the authenticated trainerId.
check(
    'trainer A cannot bypass assignment with another trainer ID',
    !authorize(
        'read',
        'sekolah',
        [
            'id' => $assignmentSchoolB,
            '_assignmentTrainerIds' => [$trnB['id']],
        ],
        [
            'role' => 'trainer',
            'trainerId' => $trnA['id'],
        ]
    ),
    'trainer A was incorrectly granted trainer B assignment'
);

// Superadmin still sees everything.
[$status, $body] = req(
    'GET',
    "$base/server/api/read.php?entity=sekolah",
    null,
    $cookieSuper
);

check(
    'superadmin sees all assignment schools',
    $status === 200
        && is_array($body)
        && count(array_filter(
            $body,
            static fn ($row) => in_array(
                $row['id'] ?? null,
                [$assignmentSchoolA, $assignmentSchoolB],
                true
            )
        )) === 2,
    json_encode($body)
);

// Seed a dedicated trainer via admin_cabang (legit path) so superadmin
// tests don't interfere with any other version chain in this file.
$trnSuperTarget = ['id' => 'trn-super-' . uniqid(), 'nama' => 'Trainer Super Target'];
[$status] = req('POST', "$base/server/api/trainer.php", $trnSuperTarget, $cookieAdminA, $csrfAdminA);
check('admin A creating trainer for superadmin tests -> 201', $status === 201, "got $status");

[$status] = req('POST', "$base/server/api/trainer.php", ['id' => 'trn-superblock-' . uniqid(), 'nama' => 'x'], $cookieSuper, $csrfSuper);
check('superadmin creating trainer -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/trainer.php", ['id' => $trnSuperTarget['id'], 'action' => 'update', 'version' => 1, 'cabangId' => $branchA, 'nama' => 'x'], $cookieSuper, $csrfSuper);
check('superadmin update sending cabangId -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/trainer.php", ['id' => $trnSuperTarget['id'], 'action' => 'update', 'version' => 1, 'nama' => 'Trainer Super Target (updated)'], $cookieSuper, $csrfSuper);
check('superadmin updating trainer -> 200', $status === 200, "got $status");
check('cabangId unchanged after superadmin update', ($body['cabangId'] ?? null) === $branchA, json_encode($body));

[$status] = req('POST', "$base/server/api/trainer.php", ['id' => $trnSuperTarget['id'], 'action' => 'delete'], $cookieSuper, $csrfSuper);
check('superadmin deleting trainer -> 403', $status === 403, "got $status");

// Cleanup via admin_cabang, which IS allowed to delete.
[$status] = req('POST', "$base/server/api/trainer.php", ['id' => $trnSuperTarget['id'], 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('admin A deleting the superadmin-test trainer (cleanup) -> 200', $status === 200, "got $status");


// ============================================================
// TA.B.2 — self-attendance write (R-TA6, R-TA8)
// ============================================================
echo "\n--- absensiPengajar.php (TA.B.2 self-attendance) ---\n";

$b2SekolahValid = 'skl-tb2-valid-' . uniqid();
$b2SekolahOutOfScope = 'skl-tb2-oos-' . uniqid();

$pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $b2SekolahValid,
    ':c' => $branchA,
    ':p' => json_encode(['id' => $b2SekolahValid, 'cabangId' => $branchA], JSON_UNESCAPED_UNICODE),
]);
$pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $b2SekolahOutOfScope,
    ':c' => $branchA,
    ':p' => json_encode(['id' => $b2SekolahOutOfScope, 'cabangId' => $branchA], JSON_UNESCAPED_UNICODE),
]);

$assignmentB2 = [
    'id' => 'assign-tb2-' . uniqid(),
    'sekolahId' => $b2SekolahValid,
    'trainerId' => $trnA['id'],
    'asistenId' => null,
    'aktif' => true,
    'periodeMulai' => '2026-01-01',
    'periodeSelesai' => '2026-12-31',
];

$trainerPayloadA_b2 = [
    'id' => $trnA['id'],
    'cabangId' => $branchA,
    'penugasanPengajar' => [$assignmentA, $assignmentB2],
];

$pdo->prepare('UPDATE trainer SET payload = :payload WHERE id = :id')->execute([
    ':payload' => json_encode($trainerPayloadA_b2, JSON_UNESCAPED_UNICODE),
    ':id' => $trnA['id'],
]);

$csrfTrainerA = csrfFor($base, $cookieTrainerA, 'trainer_a');

$absPengajarValid = [
    'id' => 'absp-tb2-' . uniqid(),
    'trainerId' => $trnA['id'],
    'sekolahId' => $b2SekolahValid,
    'tanggal' => '2026-06-15',
    'status' => 'Hadir',
    'cabangId' => $branchA,
];
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $absPengajarValid, $cookieTrainerA, $csrfTrainerA);
check('trainer A create absensiPengajar for self, valid sekolah+tanggal -> 201', $status === 201, "got $status");

$absPengajarOtherTrainer = [
    'id' => 'absp-tb2-otr-' . uniqid(),
    'trainerId' => $trnB['id'],
    'sekolahId' => $b2SekolahValid,
    'tanggal' => '2026-06-15',
    'status' => 'Hadir',
    'cabangId' => $branchA,
];
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $absPengajarOtherTrainer, $cookieTrainerA, $csrfTrainerA);
check('trainer A create absensiPengajar for trainer B -> 403', $status === 403, "got $status");

$absPengajarWrongSchool = [
    'id' => 'absp-tb2-oos-' . uniqid(),
    'trainerId' => $trnA['id'],
    'sekolahId' => $b2SekolahOutOfScope,
    'tanggal' => '2026-06-15',
    'status' => 'Hadir',
    'cabangId' => $branchA,
];
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $absPengajarWrongSchool, $cookieTrainerA, $csrfTrainerA);
check('trainer A create absensiPengajar for out-of-assignment sekolah -> 403', $status === 403, "got $status");

$absPengajarWrongDate = [
    'id' => 'absp-tb2-oor-' . uniqid(),
    'trainerId' => $trnA['id'],
    'sekolahId' => $b2SekolahValid,
    'tanggal' => '2025-01-01',
    'status' => 'Hadir',
    'cabangId' => $branchA,
];
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $absPengajarWrongDate, $cookieTrainerA, $csrfTrainerA);
check('trainer A create absensiPengajar outside active assignment date range -> 403', $status === 403, "got $status");


// ============================================================
// CS.B.1 — cover link (F-CS2; D-CS2): the cover row is the difference
// between 403 and 201 for the same business event (Q1a).
// ============================================================
echo "\n--- absensiPengajar.php (CS.B.1 cover link) ---\n";
$csbSch = 'skl-csb1-' . uniqid();
$pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $csbSch,
    ':c' => $branchA,
    ':p' => json_encode(['id' => $csbSch, 'cabangId' => $branchA], JSON_UNESCAPED_UNICODE),
]);
$csbOriginTrn = 'trn-csb1-origin-' . uniqid();
$csbOriginAssign = 'pgs-csb1-' . uniqid();
$pdo->prepare('INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $csbOriginTrn,
    ':c' => $branchA,
    ':p' => json_encode([
        'id' => $csbOriginTrn, 'cabangId' => $branchA,
        'penugasanPengajar' => [[
            'id' => $csbOriginAssign, 'sekolahId' => $csbSch, 'trainerId' => $csbOriginTrn,
            'asistenId' => null, 'aktif' => true,
            'periodeMulai' => '2026-01-01', 'periodeSelesai' => null,
        ]],
    ], JSON_UNESCAPED_UNICODE),
]);
// Snapshot trainer A's payload so the injected cover row below can be
// removed again — later blocks must see the TA.B.2 assignment state.
$csbTrnAStmt = $pdo->prepare('SELECT payload FROM trainer WHERE id = :id');
$csbTrnAStmt->execute([':id' => $trnA['id']]);
$csbTrnASnapshot = (string) $csbTrnAStmt->fetchColumn();

$csbCoverWrite = [
    'id' => 'absp-csb1-' . uniqid(),
    'trainerId' => $trnA['id'],
    'sekolahId' => $csbSch,
    'tanggal' => '2026-06-15',
    'status' => 'Hadir',
    'cabangId' => $branchA,
];
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $csbCoverWrite, $cookieTrainerA, $csrfTrainerA);
check('CS.B.1 substitute without cover link -> 403 (control)', $status === 403, "got $status");

$csbTrnAPayload = json_decode($csbTrnASnapshot, true);
$csbTrnAPayload['penugasanPengajar'][] = [
    'id' => 'pgs-csb1-cover-' . uniqid(),
    'sekolahId' => $csbSch, 'trainerId' => $trnA['id'],
    'asistenId' => null, 'coverOf' => $csbOriginAssign,
    'aktif' => true, 'periodeMulai' => '2026-01-01', 'periodeSelesai' => null,
];
$pdo->prepare('UPDATE trainer SET payload = :p WHERE id = :id')->execute([
    ':p' => json_encode($csbTrnAPayload, JSON_UNESCAPED_UNICODE), ':id' => $trnA['id'],
]);
$csbCoverWrite['id'] = 'absp-csb1-' . uniqid();
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $csbCoverWrite, $cookieTrainerA, $csrfTrainerA);
check('CS.B.1 same write with cover link -> 201 (Q1a: school bills, substitute paid)', $status === 201, "got $status");

// Dangling link fails closed even when the row exists.
$csbTrnAPayload['penugasanPengajar'][count($csbTrnAPayload['penugasanPengajar']) - 1]['coverOf'] = 'pgs-does-not-exist';
$pdo->prepare('UPDATE trainer SET payload = :p WHERE id = :id')->execute([
    ':p' => json_encode($csbTrnAPayload, JSON_UNESCAPED_UNICODE), ':id' => $trnA['id'],
]);
$csbCoverWrite['id'] = 'absp-csb1-' . uniqid();
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $csbCoverWrite, $cookieTrainerA, $csrfTrainerA);
check('CS.B.1 dangling coverOf -> 403 (no link, no pay)', $status === 403, "got $status");

$pdo->prepare('UPDATE trainer SET payload = :p WHERE id = :id')->execute([':p' => $csbTrnASnapshot, ':id' => $trnA['id']]);
$pdo->exec("DELETE FROM absensi_pengajar WHERE id LIKE 'absp-csb1-%'");
$pdo->exec("DELETE FROM trainer WHERE id = '$csbOriginTrn'");
$pdo->exec("DELETE FROM sekolah WHERE id = '$csbSch'");


// ============================================================
// CS.B.2 — external assistants (F-CS5; D-CS5) + per-session role.
// ============================================================
echo "\n--- eksternal.php (CS.B.2 external person) ---\n";
$extNew = ['id' => 'ext-csb2-' . uniqid(), 'nama' => 'Asisten Eksternal Sim', 'sekolahId' => $b2SekolahValid];

[$status] = req('POST', "$base/server/api/eksternal.php", $extNew, $cookieTrainerA, $csrfTrainerA);
check('CS.B.2 trainer creating external person -> 403 (reference-only)', $status === 403, "got $status");

[$status, $extBody] = req('POST', "$base/server/api/eksternal.php", $extNew, $cookieAdminA, $csrfAdminA);
check('CS.B.2 admin_cabang creating own-branch external -> 201', $status === 201, "got $status");
check('CS.B.2 cabangId forced to own branch', ($extBody['cabangId'] ?? null) === $branchA, json_encode($extBody));
$extId = $extNew['id'];

[$status] = req('POST', "$base/server/api/eksternal.php", $extNew + ['cabangId' => $branchA], $cookieAdminA, $csrfAdminA);
check('CS.B.2 admin_cabang sending cabangId -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/eksternal.php", ['id' => 'ext-csb2-' . uniqid(), 'sekolahId' => $b2SekolahValid], $cookieAdminA, $csrfAdminA);
check('CS.B.2 external without nama -> 422', $status === 422, "got $status");

echo "\n--- absensiPengajar.php (CS.B.2 external attendance + peran) ---\n";
$extWriteBase = [
    'trainerId' => $extId,
    'sekolahId' => $b2SekolahValid,
    'tanggal' => '2026-06-15',
    'status' => 'Hadir',
    'cabangId' => $branchA,
    'peran' => 'A',
];
[$status] = req('POST', "$base/server/api/absensiPengajar.php", ['id' => 'absp-csb2-' . uniqid()] + $extWriteBase, $cookieTrainerA, $csrfTrainerA);
check('CS.B.2 external row without dicatatOleh -> 422 (recorder fails hard)', $status === 422, "got $status");

[$status, $forgedBody] = req('POST', "$base/server/api/absensiPengajar.php", ['id' => 'absp-csb2-' . uniqid()] + $extWriteBase + ['dicatatOleh' => 'usr-someone-else'], $cookieTrainerA, $csrfTrainerA);
check('CS.B.2 external row with forged recorder -> 422 (identity pinned at the shape gate, before scope)', $status === 422 && str_contains(json_encode($forgedBody), 'dicatatOleh'), "got $status " . json_encode($forgedBody));

$extRowId = 'absp-csb2-' . uniqid();
[$status] = req('POST', "$base/server/api/absensiPengajar.php", ['id' => $extRowId] + $extWriteBase + ['dicatatOleh' => $trainerUserId], $cookieTrainerA, $csrfTrainerA);
check('CS.B.2 external row with dicatatOleh=self in own scope -> 201', $status === 201, "got $status");
$extStored = $pdo->prepare('SELECT payload FROM absensi_pengajar WHERE id = :id');
$extStored->execute([':id' => $extRowId]);
$extPayload = json_decode((string) $extStored->fetchColumn(), true);
check('CS.B.2 stored row carries peran + dicatatOleh through', ($extPayload['peran'] ?? null) === 'A' && ($extPayload['dicatatOleh'] ?? null) === $trainerUserId, json_encode($extPayload));

$extAdminRowId = 'absp-csb2-' . uniqid();
[$status] = req('POST', "$base/server/api/absensiPengajar.php", ['id' => $extAdminRowId] + $extWriteBase + ['dicatatOleh' => 'usr-test-admA'], $cookieAdminA, $csrfAdminA);
check('CS.B.2 admin_cabang recording external in own branch -> 201', $status === 201, "got $status");

[$status] = req('POST', "$base/server/api/absensiPengajar.php", ['id' => 'absp-csb2-' . uniqid(), 'trainerId' => $trnA['id'], 'sekolahId' => $b2SekolahValid, 'tanggal' => '2026-06-15', 'status' => 'Hadir', 'cabangId' => $branchA, 'peran' => 'X'], $cookieTrainerA, $csrfTrainerA);
check('CS.B.2 out-of-enum peran -> 422', $status === 422, "got $status");

$pdo->exec("DELETE FROM absensi_pengajar WHERE id LIKE 'absp-csb2-%'");
$pdo->exec("DELETE FROM eksternal WHERE id = '$extId'");


// ============================================================
// TA.B.4 — admin correction (R-TA4, append + correction_of pattern)
// ============================================================
echo "\n--- absensiPengajar.php (TA.B.4 correction) ---\n";

$b4OriginalId = 'absp-tb4-orig-' . uniqid();
$pdo->prepare('INSERT INTO absensi_pengajar (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $b4OriginalId,
    ':c' => $branchA,
    ':p' => json_encode([
        'id' => $b4OriginalId, 'trainerId' => $trnA['id'], 'sekolahId' => $b2SekolahValid,
        'tanggal' => '2026-06-10', 'status' => 'Izin', 'cabangId' => $branchA,
    ], JSON_UNESCAPED_UNICODE),
]);

$b4CorrectPayloadA = [
    'action' => 'correct',
    'correctionOf' => $b4OriginalId,
    'record' => [
        'id' => 'absp-tb4-corr-' . uniqid(),
        'trainerId' => $trnA['id'], 'sekolahId' => $b2SekolahValid,
        'tanggal' => '2026-06-10', 'status' => 'Hadir', 'cabangId' => $branchA,
    ],
];
[$status, $body] = req('POST', "$base/server/api/absensiPengajar.php", $b4CorrectPayloadA, $cookieAdminA, $csrfAdminA);
check('admin_cabang correcting own-branch absensiPengajar record -> 201', $status === 201, "got $status");

$stmt = $pdo->prepare('SELECT correction_of, payload FROM absensi_pengajar WHERE id = :id');
$stmt->execute([':id' => $b4CorrectPayloadA['record']['id']]);
$b4Stored = $stmt->fetch();
check('correction_of stored and matches original record id', $b4Stored && $b4Stored['correction_of'] === $b4OriginalId, json_encode($b4Stored));
$b4StoredPayload = $b4Stored ? json_decode($b4Stored['payload'], true) : null;
check('corrected record carries new status', ($b4StoredPayload['status'] ?? null) === 'Hadir', json_encode($b4StoredPayload));

$b4CorrectPayloadCross = [
    'action' => 'correct',
    'correctionOf' => $b4OriginalId,
    'record' => [
        'id' => 'absp-tb4-corr-' . uniqid(),
        'trainerId' => $trnA['id'], 'sekolahId' => $b2SekolahValid,
        'tanggal' => '2026-06-10', 'status' => 'Hadir', 'cabangId' => $branchA,
    ],
];
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $b4CorrectPayloadCross, $cookieAdminB, csrfFor($base, $cookieAdminB, 'admin_b'));
check('admin_cabang B correcting branch-A absensiPengajar record -> 403', $status === 403, "got $status");

$b4CorrectPayloadSuper = [
    'action' => 'correct',
    'correctionOf' => $b4OriginalId,
    'record' => [
        'id' => 'absp-tb4-corr-' . uniqid(),
        'trainerId' => $trnA['id'], 'sekolahId' => $b2SekolahValid,
        'tanggal' => '2026-06-10', 'status' => 'Izin', 'cabangId' => $branchA,
    ],
];
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $b4CorrectPayloadSuper, $cookieSuper, $csrfSuper);
check('superadmin correcting absensiPengajar record from any branch -> 201', $status === 201, "got $status");

$b4CorrectPayloadTrainer = [
    'action' => 'correct',
    'correctionOf' => $b4OriginalId,
    'record' => [
        'id' => 'absp-tb4-corr-' . uniqid(),
        'trainerId' => $trnA['id'], 'sekolahId' => $b2SekolahValid,
        'tanggal' => '2026-06-10', 'status' => 'Hadir', 'cabangId' => $branchA,
    ],
];
[$status] = req('POST', "$base/server/api/absensiPengajar.php", $b4CorrectPayloadTrainer, $cookieTrainerA, $csrfTrainerA);
check('trainer using action=correct is rejected -> 403', $status === 403, "got $status");

// T2.E.2 (F1) — correct-path forged-third-id must 422
// (server/validation/entities.php:551-553): external row recorded by the
// trainer, admin corrects carrying a dicatatOleh that is neither self nor
// the preserved original recorder.
$b4ExtForged = 'ext-tb4f-' . uniqid();
$pdo->prepare('INSERT INTO eksternal (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $b4ExtForged,
    ':c' => $branchA,
    ':p' => json_encode([
        'id' => $b4ExtForged, 'nama' => 'Asisten Eksternal TB4F',
        'sekolahId' => $b2SekolahValid, 'cabangId' => $branchA,
    ], JSON_UNESCAPED_UNICODE),
]);
$b4ExtOrigId = 'absp-tb4f-orig-' . uniqid();
$pdo->prepare('INSERT INTO absensi_pengajar (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $b4ExtOrigId,
    ':c' => $branchA,
    ':p' => json_encode([
        'id' => $b4ExtOrigId, 'trainerId' => $b4ExtForged, 'sekolahId' => $b2SekolahValid,
        'tanggal' => '2026-06-10', 'status' => 'Izin', 'cabangId' => $branchA,
        'dicatatOleh' => $trainerUserId,
    ], JSON_UNESCAPED_UNICODE),
]);
$b4ForgedCorrect = [
    'action' => 'correct',
    'correctionOf' => $b4ExtOrigId,
    'record' => [
        'id' => 'absp-tb4f-corr-' . uniqid(),
        'trainerId' => $b4ExtForged, 'sekolahId' => $b2SekolahValid,
        'tanggal' => '2026-06-10', 'status' => 'Hadir', 'cabangId' => $branchA,
        'dicatatOleh' => 'usr-someone-else',
    ],
];
[$status, $b4ForgedBody] = req('POST', "$base/server/api/absensiPengajar.php", $b4ForgedCorrect, $cookieAdminA, $csrfAdminA);
check('correct-path external correction with forged third-id recorder -> 422 (preserved recorder gate)', $status === 422 && str_contains(json_encode($b4ForgedBody), 'dicatatOleh'), "got $status " . json_encode($b4ForgedBody));
$pdo->exec("DELETE FROM absensi_pengajar WHERE id LIKE 'absp-tb4f-%'");
$pdo->exec("DELETE FROM eksternal WHERE id = '$b4ExtForged'");

$row = auditRow($pdo, 'absensiPengajar_recorded', $b4CorrectPayloadA['record']['id']);
check('absensiPengajar correction audit row exists', $row !== false);
check('correction audit metadata carries correctionOf', $row && (json_decode((string) $row['metadata'], true)['correctionOf'] ?? null) === $b4OriginalId, json_encode($row));

// --- cabang.php: superadmin-only CRUD -----------------------------------
echo "\n--- cabang.php (create) ---\n";
$cbgNew = ['id' => 'cbg-new-' . uniqid(), 'nama' => 'Cabang Baru', 'kode' => 'NEW' . substr(uniqid(), -4)];

[$status] = req('POST', "$base/server/api/cabang.php", $cbgNew);
check('anonymous create -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", $cbgNew, $cookieAdminA);
check('create without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", $cbgNew, $cookieAdminA, $csrfAdminA);
check('admin_cabang creating branch -> 403 (superadmin-only)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", ['id' => 'cbg-noname-' . uniqid(), 'kode' => 'XXX'], $cookieSuper, $csrfSuper);
check('missing nama -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", ['id' => 'cbg-nokode-' . uniqid(), 'nama' => 'Tanpa Kode'], $cookieSuper, $csrfSuper);
check('missing kode -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", ['id' => 'cbg-dupe-' . uniqid(), 'nama' => 'Coba Duplikat', 'kode' => 'TSTA'], $cookieSuper, $csrfSuper);
check('duplicate kode (matches branch A) -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/cabang.php", $cbgNew, $cookieSuper, $csrfSuper);
check('superadmin creating branch -> 201', $status === 201, "got $status");
check('kode normalized to uppercase', ($body['kode'] ?? null) === strtoupper($cbgNew['kode']), json_encode($body));

[$status] = req('POST', "$base/server/api/cabang.php", $cbgNew, $cookieSuper, $csrfSuper);
check('duplicate id -> 409', $status === 409, "got $status");

echo "\n--- cabang.php (update) ---\n";
$cbgUpdate = ['id' => $cbgNew['id'], 'action' => 'update', 'version' => 1, 'nama' => 'Cabang Baru (updated)', 'kode' => $cbgNew['kode']];

[$status] = req('POST', "$base/server/api/cabang.php", $cbgUpdate, $cookieAdminA, $csrfAdminA);
check('admin_cabang updating branch -> 403 (superadmin-only)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", array_merge($cbgUpdate, ['kode' => 'TSTB']), $cookieSuper, $csrfSuper);
check('update to a kode already used by another branch -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/cabang.php", $cbgUpdate, $cookieSuper, $csrfSuper);
check('superadmin updating branch -> 200', $status === 200, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", ['id' => 'cbg-missing-' . uniqid(), 'action' => 'update', 'nama' => 'x', 'kode' => 'YYY' . substr(uniqid(), -4)], $cookieSuper, $csrfSuper);
check('updating non-existent branch -> 422', $status === 422, "got $status");

echo "\n--- cabang.php (delete) ---\n";
[$status] = req('POST', "$base/server/api/cabang.php", ['id' => $cbgNew['id'], 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('admin_cabang deleting branch -> 403 (superadmin-only)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", ['id' => 'cbg-PST-default', 'action' => 'delete'], $cookieSuper, $csrfSuper);
check('deleting default seed branch -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", ['id' => $branchA, 'action' => 'delete'], $cookieSuper, $csrfSuper);
check('deleting branch A while sekolahA still assigned -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", ['id' => $cbgNew['id'], 'action' => 'delete'], $cookieSuper, $csrfSuper);
check('superadmin deleting empty branch -> 200', $status === 200, "got $status");

[$status] = req('POST', "$base/server/api/cabang.php", ['id' => $cbgNew['id'], 'action' => 'delete'], $cookieSuper, $csrfSuper);
check('deleting already-deleted branch -> 422', $status === 422, "got $status");

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

// --- settings.php + read.php (?entity=settings): superadmin-only ------
echo "\n--- settings.php ---\n";
$setNew = ['id' => 'set-test-' . uniqid(), 'value' => 'foo'];

[$status] = req('POST', "$base/server/api/settings.php", $setNew);
check('anonymous create -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/settings.php", $setNew, $cookieAdminA);
check('create without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/settings.php", $setNew, $cookieAdminA, $csrfAdminA);
check('admin_cabang creating setting -> 403 (superadmin-only)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/settings.php", $setNew + ['cabangId' => 'cbg-does-not-exist'], $cookieSuper, $csrfSuper);
check('superadmin with unknown cabangId -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/settings.php", $setNew, $cookieSuper, $csrfSuper);
check('superadmin creating setting -> 201', $status === 201, "got $status");
check('cabangId null (global setting)', array_key_exists('cabangId', $body) && $body['cabangId'] === null, json_encode($body));

[$status] = req('POST', "$base/server/api/settings.php", $setNew, $cookieSuper, $csrfSuper);
check('duplicate id -> 409', $status === 409, "got $status");

echo "\n--- settings.php (update) ---\n";
$setUpdate = ['id' => $setNew['id'], 'action' => 'update', 'value' => 'bar'];

[$status] = req('POST', "$base/server/api/settings.php", $setUpdate, $cookieAdminA, $csrfAdminA);
check('admin_cabang updating setting -> 403 (superadmin-only)', $status === 403, "got $status");

[$status, $body] = req('POST', "$base/server/api/settings.php", $setUpdate, $cookieSuper, $csrfSuper);
check('superadmin updating setting -> 200', $status === 200, "got $status");
check('version incremented to 2', ($body['version'] ?? null) === 2, json_encode($body));

[$status] = req('POST', "$base/server/api/settings.php", ['id' => 'set-missing-' . uniqid(), 'action' => 'update', 'value' => 'x'], $cookieSuper, $csrfSuper);
check('updating non-existent setting -> 422', $status === 422, "got $status");

echo "\n--- read.php (?entity=settings) ---\n";
[$status] = req('GET', "$base/server/api/read.php?entity=settings");
check('anonymous GET settings -> 401', $status === 401, "got $status");

[$status] = req('GET', "$base/server/api/read.php?entity=settings", null, $cookieAdminA);
check('admin_cabang GET ?entity=settings -> 403', $status === 403, "got $status");

[$status, $body] = req('GET', "$base/server/api/read.php?entity=settings", null, $cookieSuper);
check('superadmin GET ?entity=settings -> 200', $status === 200, "got $status");
check('created setting appears in list', is_array($body) && count(array_filter($body, static fn ($r) => ($r['id'] ?? null) === $setNew['id'])) === 1, json_encode($body));

[$status, $body] = req('GET', "$base/server/api/read.php", null, $cookieAdminA);
check('admin_cabang bulk read -> settings key present but empty', $status === 200 && ($body['settings'] ?? null) === [], json_encode($body['settings'] ?? null));
echo "\n--- settings.php (delete) ---\n";
[$status] = req('POST', "$base/server/api/settings.php", ['id' => $setNew['id'], 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('admin_cabang deleting setting -> 403 (superadmin-only)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/settings.php", ['id' => $setNew['id'], 'action' => 'delete'], $cookieSuper, $csrfSuper);
check('superadmin deleting setting -> 200', $status === 200, "got $status");

[$status] = req('POST', "$base/server/api/settings.php", ['id' => $setNew['id'], 'action' => 'delete'], $cookieSuper, $csrfSuper);
check('deleting already-deleted setting -> 422', $status === 422, "got $status");

// --- invoices.php: admin_cabang read-only, superadmin writes ---------
echo "\n--- invoices.php ---\n";
$invNew = ['id' => 'inv-test-' . uniqid(), 'total' => 500000];

[$status] = req('POST', "$base/server/api/invoices.php", $invNew);
check('anonymous create -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/invoices.php", $invNew, $cookieAdminA);
check('create without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/invoices.php", $invNew + ['cabangId' => $branchA], $cookieAdminA, $csrfAdminA);
check('admin_cabang creating invoice -> 403 (read-only per matrix)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/invoices.php", $invNew, $cookieSuper, $csrfSuper);
check('superadmin missing cabangId -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/invoices.php", $invNew + ['cabangId' => 'cbg-does-not-exist'], $cookieSuper, $csrfSuper);
check('superadmin with unknown cabangId -> 422', $status === 422, "got $status");

[$status, $body] = req('POST', "$base/server/api/invoices.php", $invNew + ['cabangId' => $branchA], $cookieSuper, $csrfSuper);
check('superadmin creating invoice for branch A -> 201', $status === 201, "got $status");

[$status] = req('POST', "$base/server/api/invoices.php", $invNew + ['cabangId' => $branchA], $cookieSuper, $csrfSuper);
check('duplicate id -> 409', $status === 409, "got $status");

echo "\n--- invoices.php (update/delete) ---\n";
$invUpdate = ['id' => $invNew['id'], 'action' => 'update', 'cabangId' => $branchA, 'total' => 750000];
[$status] = req('POST', "$base/server/api/invoices.php", $invUpdate, $cookieAdminA, $csrfAdminA);
check('admin_cabang updating invoice -> 403 (read-only per matrix)', $status === 403, "got $status");

[$status, $body] = req('POST', "$base/server/api/invoices.php", $invUpdate, $cookieSuper, $csrfSuper);
check('superadmin updating invoice -> 200', $status === 200, "got $status");

[$status] = req('POST', "$base/server/api/invoices.php", ['id' => $invNew['id'], 'action' => 'delete'], $cookieAdminA, $csrfAdminA);
check('admin_cabang deleting invoice -> 403 (read-only per matrix)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/invoices.php", ['id' => $invNew['id'], 'action' => 'delete'], $cookieSuper, $csrfSuper);
check('superadmin deleting invoice -> 200', $status === 200, "got $status");

echo "\n--- read.php (?entity=invoices) ---\n";
$invRead = 'inv-read-' . uniqid();
$pdo->prepare("INSERT INTO invoices (id, cabang_id, payload) VALUES (:id, :c, :p)")->execute([
    ':id' => $invRead,
    ':c' => $branchA,
    ':p' => json_encode(['id' => $invRead, 'cabangId' => $branchA]),
]);

[$status, $body] = req('GET', "$base/server/api/read.php?entity=invoices", null, $cookieAdminA);
check('admin_cabang GET ?entity=invoices -> 200 (read-only, not blocked)', $status === 200, "got $status");
check('admin A sees own-branch invoice', is_array($body) && count(array_filter($body, static fn ($r) => ($r['id'] ?? null) === $invRead)) === 1, json_encode($body));

[$status, $body] = req('GET', "$base/server/api/read.php?entity=invoices", null, $cookieAdminB);
check('admin B does NOT see branch A invoice', is_array($body) && count(array_filter($body, static fn ($r) => ($r['id'] ?? null) === $invRead)) === 0, json_encode($body));

$pdo->exec("DELETE FROM invoices WHERE id = '$invRead'");

// swA (used earlier) was already hard-deleted by the siswa.php (delete)
// section — seed a fresh active siswa so sekolahA has something to bill.
$swForInvoice = 'sw-invgen-' . uniqid();
$pdo->prepare("INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :c, :p)")->execute([
    ':id' => $swForInvoice,
    ':c' => $branchA,
    ':p' => json_encode(['id' => $swForInvoice, 'sekolahId' => $sekolahA, 'status' => 'Aktif', 'nama' => 'Siswa Invoice Test'], JSON_UNESCAPED_UNICODE),
]);

echo "\n--- invoices-generate.php ---\n";
$genPeriode = '2032-01'; // far-future, guaranteed clean

[$status] = req('POST', "$base/server/api/invoices-generate.php", ['periode' => $genPeriode, 'uraian' => 'SPP Test']);
check('anonymous generate -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/invoices-generate.php", ['periode' => $genPeriode, 'uraian' => 'SPP Test'], $cookieAdminA);
check('generate without CSRF token -> 403', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/invoices-generate.php", ['periode' => $genPeriode, 'uraian' => 'SPP Test'], $cookieAdminA, $csrfAdminA);
check('admin_cabang generate -> 403 (superadmin-only)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/invoices-generate.php", ['periode' => 'bukan-periode', 'uraian' => 'SPP Test'], $cookieSuper, $csrfSuper);
check('superadmin malformed periode -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/invoices-generate.php", ['periode' => $genPeriode, 'uraian' => '  '], $cookieSuper, $csrfSuper);
check('superadmin blank uraian -> 422', $status === 422, "got $status");

[$status] = req('POST', "$base/server/api/invoices-generate.php", ['periode' => $genPeriode, 'uraian' => 'SPP Test', 'cabangId' => 'cbg-does-not-exist'], $cookieSuper, $csrfSuper);
check('superadmin unknown cabangId filter -> 422', $status === 422, "got $status");

[$status, $genBody] = req('POST', "$base/server/api/invoices-generate.php", ['periode' => $genPeriode, 'uraian' => 'SPP Test', 'cabangId' => $branchA], $cookieSuper, $csrfSuper);
check('superadmin generate for branch A -> 200', $status === 200, "got $status");
check('response has generatedCount/skippedCount', isset($genBody['generatedCount'], $genBody['skippedCount']), json_encode($genBody));
check('generatedCount is 1 (sekolahA has 1 active siswa now)', ($genBody['generatedCount'] ?? null) === 1, json_encode($genBody));

// --- backup-create.php / backup-list.php / backup-download.php --------
echo "\n--- backup-create.php ---\n";
[$status] = req('POST', "$base/server/api/backup-create.php");
check('anonymous create -> 401', $status === 401, "got $status");

[$status] = req('POST', "$base/server/api/backup-create.php", null, $cookieAdminA, $csrfAdminA);
check('admin_cabang creating backup -> 403 (superadmin-only)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/backup-create.php", null, $cookieSuper);
check('superadmin without CSRF token -> 403', $status === 403, "got $status");

$ch = curl_init("$base/server/api/backup-create.php");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => 'POST',
    CURLOPT_HTTPHEADER => ['X-CSRF-Token: ' . $csrfSuper],
    CURLOPT_COOKIEFILE => $cookieSuper,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 15,
]);
$backupRaw = curl_exec($ch);
$backupStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
check('superadmin creating backup -> 200', $backupStatus === 200, "got $backupStatus");
$backupJson = json_decode((string) $backupRaw, true);
check('backup response has entities key', is_array($backupJson) && isset($backupJson['entities']), json_encode(array_keys((array) $backupJson)));
check('backup entities include cabang key', is_array($backupJson['entities'] ?? null) && array_key_exists('cabang', $backupJson['entities']), 'missing cabang key');

$backupRow = $pdo->query('SELECT id, checksum FROM backups ORDER BY created_at DESC LIMIT 1')->fetch();
check('backups table row created', $backupRow !== false);
$backupId = $backupRow['id'] ?? null;
check('backup checksum matches downloaded content', $backupId && hash('sha256', $backupRaw) === $backupRow['checksum'], 'mismatch');

$row = auditRow($pdo, 'backup_created', (string) $backupId);
check('backup_created audit row exists', $row !== false);
check('backup_created actor_role is superadmin', $row && $row['actor_role'] === 'superadmin', json_encode($row));

echo "\n--- backup-list.php ---\n";
[$status] = req('GET', "$base/server/api/backup-list.php");
check('anonymous list -> 401', $status === 401, "got $status");

[$status] = req('GET', "$base/server/api/backup-list.php", null, $cookieAdminA);
check('admin_cabang list -> 403 (superadmin-only)', $status === 403, "got $status");

[$status, $body] = req('GET', "$base/server/api/backup-list.php", null, $cookieSuper);
check('superadmin list -> 200', $status === 200, "got $status");
check('created backup appears in list', is_array($body['backups'] ?? null) && count(array_filter($body['backups'], static fn ($r) => ($r['id'] ?? null) === $backupId)) === 1, json_encode($body));

echo "\n--- backup-download.php ---\n";
[$status] = req('GET', "$base/server/api/backup-download.php?id=$backupId");
check('anonymous download -> 401', $status === 401, "got $status");

[$status] = req('GET', "$base/server/api/backup-download.php?id=$backupId", null, $cookieAdminA);
check('admin_cabang download -> 403 (superadmin-only)', $status === 403, "got $status");

[$status] = req('GET', "$base/server/api/backup-download.php", null, $cookieSuper);
check('superadmin download without id -> 422', $status === 422, "got $status");

[$status] = req('GET', "$base/server/api/backup-download.php?id=bkp-does-not-exist", null, $cookieSuper);
check('superadmin download unknown id -> 422', $status === 422, "got $status");

$ch = curl_init("$base/server/api/backup-download.php?id=$backupId");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_COOKIEFILE => $cookieSuper,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 15,
]);
$downloadRaw = curl_exec($ch);
$downloadStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
check('superadmin download -> 200', $downloadStatus === 200, "got $downloadStatus");
check('downloaded content matches original backup', $downloadRaw === $backupRaw, 'content mismatch');

// --- audit_log: M3.5 ---------------------------------------------------
echo "\n--- audit_log ---\n";

function auditRow(PDO $pdo, string $eventType, string $targetId): array|false {
    $stmt = $pdo->prepare('SELECT * FROM audit_log WHERE event_type = :et AND target_id = :tid ORDER BY id DESC LIMIT 1');
    $stmt->execute([':et' => $eventType, ':tid' => $targetId]);
    return $stmt->fetch();
}

$row = auditRow($pdo, 'cabang_created', $cbgNew['id']);
check('cabang_created audit row exists', $row !== false);
check('cabang_created actor is superadmin', $row && $row['actor_role'] === 'superadmin', json_encode($row));

$row = auditRow($pdo, 'cabang_deleted', $cbgNew['id']);
check('cabang_deleted audit row exists', $row !== false);

$row = auditRow($pdo, 'trainer_created', $trnNew['id']);
check('trainer_created audit row exists', $row !== false);
check('trainer_created actor_role is admin_cabang', $row && $row['actor_role'] === 'admin_cabang', json_encode($row));
check("trainer_created cabang_id matches branch A (actor's own)", $row && $row['cabang_id'] === $branchA, json_encode($row));
if ($row) {
    check('audit metadata contains no password/token fields', stripos((string) $row['metadata'], 'password') === false && stripos((string) $row['metadata'], 'token') === false, (string) $row['metadata']);
}

$row = auditRow($pdo, 'trainer_deleted', $trnNew['id']);
check('trainer_deleted audit row exists', $row !== false);

$row = auditRow($pdo, 'sekolah_created', $sklNew['id']);
check('sekolah_created audit row exists', $row !== false);

$row = auditRow($pdo, 'siswa_created', $swA['id']);
check('siswa_created audit row exists', $row !== false);

$row = auditRow($pdo, 'absensi_recorded', $absA['id']);
check('absensi_recorded audit row exists', $row !== false);

$row = auditRow($pdo, 'sppPayments_recorded', $sppA['id']);
check('sppPayments_recorded audit row exists', $row !== false);

$row = auditRow($pdo, 'absensi_verified', $absA['id']);
check('absensi_verified audit row exists', $row !== false);
check('absensi_verified actor_role is admin_cabang', $row && $row['actor_role'] === 'admin_cabang', json_encode($row));
check('absensi_verified cabang_id matches branch A', $row && $row['cabang_id'] === $branchA, json_encode($row));

$row = auditRow($pdo, 'honorPayments_recorded', $honorA['id']);
check('honorPayments_recorded audit row exists', $row !== false);
check('honorPayments_recorded actor is superadmin (only writer)', $row && $row['actor_role'] === 'superadmin', json_encode($row));

// AP.D.1 — admin-created + corrected rows are trailed with actor + branch.
$row = auditRow($pdo, 'honorPayments_recorded', $honorAdmin['id']);
check('admin-created honor audit row exists', $row !== false);
check('admin-created honor actor_role is admin_cabang', $row && $row['actor_role'] === 'admin_cabang', json_encode($row));
check('admin-created honor cabang_id matches branch A', $row && $row['cabang_id'] === $branchA, json_encode($row));
$row = auditRow($pdo, 'honorPayments_recorded', $honorCorr['id']);
check('admin-corrected honor audit row exists', $row !== false);
check('admin-corrected honor metadata carries correctionOf', $row && (json_decode((string) $row['metadata'], true)['correctionOf'] ?? null) === $honorAdmin['id'], json_encode($row));

$row = auditRow($pdo, 'settings_created', $setNew['id']);
check('settings_created audit row exists', $row !== false);
check('settings_created actor_role is superadmin', $row && $row['actor_role'] === 'superadmin', json_encode($row));

$row = auditRow($pdo, 'settings_deleted', $setNew['id']);
check('settings_deleted audit row exists', $row !== false);

$row = auditRow($pdo, 'invoices_created', $invNew['id']);
check('invoices_created audit row exists', $row !== false);

// sync.php writes through its own inline insert (not insertLedger()), so
// this confirms that path is audited too, tagged distinctly via metadata.
$syncedAbsId = $batch['entries'][0]['record']['id'];
$row = auditRow($pdo, 'absensi_recorded', $syncedAbsId);
check('sync-path absensi_recorded audit row exists', $row !== false);
if ($row) {
    $metadata = json_decode((string) $row['metadata'], true);
    check('sync-path metadata tagged via=sync', ($metadata['via'] ?? null) === 'sync', json_encode($metadata));
}

$genInvoiceId = $genBody['generated'][0]['id'] ?? null;
$viaGenerate = $genInvoiceId ? auditRow($pdo, 'invoices_created', $genInvoiceId) : false;
check('HTTP-triggered generate audit row exists', $viaGenerate !== false, json_encode($genBody));
if ($viaGenerate) {
    check('HTTP-triggered generate audit actor_role is superadmin (not "system")', $viaGenerate['actor_role'] === 'superadmin', json_encode($viaGenerate));
    $viaMetadata = json_decode((string) $viaGenerate['metadata'], true);
    check('HTTP-triggered generate audit metadata tagged via=generate', ($viaMetadata['via'] ?? null) === 'generate', json_encode($viaMetadata));
}

// --- restore.php: DESTRUCTIVE — must run LAST, after every other test --
// This wipes cabang/sekolah/trainer/siswa/absensi/sppPayments/
// honorPayments/invoices/settings entirely (see restoreFromSnapshot()).
// Placing this earlier would break every subsequent test that depends on
// branchA/branchB/sekolahA/sekolahB fixtures.
echo "\n--- restore.php ---\n";

function reqUpload(string $url, string $fieldName, string $content, string $filename, ?string $cookie = null, ?string $csrfToken = null): array {
    $tmpFile = tempnam(sys_get_temp_dir(), 'restore_test_');
    file_put_contents($tmpFile, $content);
    $ch = curl_init($url);
    $headers = [];
    if ($csrfToken !== null) $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => [$fieldName => new CURLFile($tmpFile, 'application/json', $filename)],
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($cookie) curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    @unlink($tmpFile);
    return [$status, json_decode((string) $raw, true)];
}

$validSnapshot = json_encode([
    'generatedAt' => date('c'),
    'entities' => [
        'cabang' => [['id' => 'cbg-RESTORE-test', 'kode' => 'RST', 'nama' => 'Cabang Restore Test']],
        'sekolah' => [], 'trainer' => [], 'siswa' => [], 'absensi' => [],
        'sppPayments' => [], 'honorPayments' => [], 'invoices' => [], 'settings' => [],
    ],
]);

[$status] = reqUpload("$base/server/api/restore.php", 'backupFile', $validSnapshot, 'test.json');
check('anonymous restore -> 401', $status === 401, "got $status");

[$status] = reqUpload("$base/server/api/restore.php", 'backupFile', $validSnapshot, 'test.json', $cookieAdminA, $csrfAdminA);
check('admin_cabang restore -> 403 (superadmin-only)', $status === 403, "got $status");

[$status] = req('POST', "$base/server/api/restore.php", [], $cookieSuper, $csrfSuper);
check('superadmin restore without file -> 422', $status === 422, "got $status");

[$status] = reqUpload("$base/server/api/restore.php", 'backupFile', 'not valid json{{{', 'test.json', $cookieSuper, $csrfSuper);
check('superadmin restore malformed JSON -> 422', $status === 422, "got $status");

[$status] = reqUpload("$base/server/api/restore.php", 'backupFile', json_encode(['entities' => ['cabang' => []]]), 'test.json', $cookieSuper, $csrfSuper);
check('superadmin restore missing entity keys -> 422', $status === 422, "got $status");

[$status, $body] = reqUpload("$base/server/api/restore.php", 'backupFile', $validSnapshot, 'test.json', $cookieSuper, $csrfSuper);
check('superadmin restore valid snapshot -> 200', $status === 200, "got $status");
check('counts.cabang is 1', ($body['counts']['cabang'] ?? null) === 1, json_encode($body));
check('counts.sekolah is 0', ($body['counts']['sekolah'] ?? null) === 0, json_encode($body));

$restoredCabang = $pdo->query("SELECT id FROM cabang WHERE id = 'cbg-RESTORE-test'")->fetch();
check('restored cabang row exists in DB', $restoredCabang !== false);

$oldBranchCheck = $pdo->prepare('SELECT 1 FROM cabang WHERE id = :id');
$oldBranchCheck->execute([':id' => $branchA]);
check('original branchA wiped by restore (confirms hard replace, not merge)', $oldBranchCheck->fetchColumn() === false);

$stmt = $pdo->prepare("SELECT * FROM audit_log WHERE event_type = 'data_restored' ORDER BY id DESC LIMIT 1");
$stmt->execute();
$row = $stmt->fetch();
check('data_restored audit row exists', $row !== false);
check('data_restored actor_role is superadmin', $row && $row['actor_role'] === 'superadmin', json_encode($row));

$pdo->exec("DELETE FROM cabang WHERE id = 'cbg-RESTORE-test'");
// cleanupFixtures() right after this will try to delete branchA/branchB
// rows that no longer exist post-restore — harmless no-ops.


// --- cleanup -----------------------------------------------------------
cleanupFixtures($pdo, $branchA, $branchB);
stopM33Server();
@unlink($cookieAdminA);
@unlink($cookieAdminB);
@unlink($cookieSuper);

echo "\n$total checks, $failures failed\n";
exit($failures > 0 ? 1 : 0);