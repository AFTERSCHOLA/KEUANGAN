<?php
declare(strict_types=1);

// ============================================================
// SF.1 — myPenugasan contract (docs/TRAINER_SELF_SCOPE_FIX_*).
// Trainer-only assignment index lane: an asisten whose rows live on
// the host trainer's record gets her own rows with zero host PII;
// admin_cabang/superadmin get 403; anonymous gets 401.
//
// Idiom mirrors server/tests/endpoint.protection.php: real dev server
// (php -S) + curl + fixture seed/cleanup. Exit 0 + PASS line on green,
// exit 1 on any failure. Dependency-free (no phpunit).
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

// --- fixtures: Widia (host) holds Alifah's (asisten) rows ------------
$branch = 'cbg-SF1';
$schTridaya = 'skl-sf1-tridaya';
$schAlbiruni = 'skl-sf1-albiruni';
$schDecoy = 'skl-sf1-decoy';
$trnWidia = 'trn-sf1-widia';
$trnAlifah = 'trn-sf1-alifah';
$trnOther = 'trn-sf1-other';

function cleanupSF1(PDO $pdo, string $branch, string $trnWidia, string $trnAlifah, string $trnOther): void {
    $pdo->exec("DELETE FROM trainer WHERE id IN ('$trnWidia', '$trnAlifah', '$trnOther')");
    $pdo->exec("DELETE FROM sekolah WHERE cabang_id = '$branch'");
    $pdo->exec("DELETE FROM audit_log WHERE actor_user_id IN ('usr-sf1-alifah', 'usr-sf1-admin', 'usr-sf1-super')");
    $pdo->exec("DELETE FROM users WHERE username IN ('test_trainer_sf1', 'test_admin_sf1', 'test_super_sf1')");
    $pdo->exec("DELETE FROM cabang WHERE id = '$branch'");
}

cleanupSF1($pdo, $branch, $trnWidia, $trnAlifah, $trnOther); // previous run may have died mid-way

$pdo->prepare('INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, :p)')->execute([
    ':id' => $branch, ':kode' => 'SFT1', ':nama' => 'Cabang SF1',
    ':p' => json_encode(['id' => $branch, 'kode' => 'SFT1', 'nama' => 'Cabang SF1'], JSON_UNESCAPED_UNICODE),
]);
foreach ([$schTridaya, $schAlbiruni, $schDecoy] as $schId) {
    $pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
        ':id' => $schId, ':c' => $branch,
        ':p' => json_encode(['id' => $schId, 'cabangId' => $branch], JSON_UNESCAPED_UNICODE),
    ]);
}

// Host payload deliberately carries host PII (nama/noWa/honor) — the
// lane must never let any of it reach the trainer client.
$hostPayload = [
    'id' => $trnWidia, 'cabangId' => $branch,
    'nama' => 'Widia Host SF1', 'noWa' => '081-LEAK-ME', 'honor' => 999999,
    'penugasanPengajar' => [
        [
            'id' => 'pgs-sf1-1', 'sekolahId' => $schTridaya,
            'trainerId' => $trnWidia, 'asistenId' => $trnAlifah,
            'aktif' => true, 'periodeMulai' => '2026-07-01', 'periodeSelesai' => null,
        ],
        [
            // 2nd-assistant slot (asistenIds[1]) + empty-string end date.
            'id' => 'pgs-sf1-2', 'sekolahId' => $schAlbiruni,
            'trainerId' => $trnWidia, 'asistenId' => null,
            'asistenIds' => [$trnOther, $trnAlifah],
            'aktif' => true, 'periodeMulai' => '2026-07-01', 'periodeSelesai' => '',
        ],
        [
            // Decoy: Alifah is nowhere on this row — must stay invisible.
            'id' => 'pgs-sf1-decoy', 'sekolahId' => $schDecoy,
            'trainerId' => $trnWidia, 'asistenId' => $trnOther,
            'aktif' => true, 'periodeMulai' => '2026-07-01', 'periodeSelesai' => null,
        ],
    ],
];
$pdo->prepare('INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $trnWidia, ':c' => $branch, ':p' => json_encode($hostPayload, JSON_UNESCAPED_UNICODE),
]);
foreach ([$trnAlifah => 'Alifah Asisten SF1', $trnOther => 'Other Trainer SF1'] as $tid => $tname) {
    $pdo->prepare('INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
        ':id' => $tid, ':c' => $branch,
        ':p' => json_encode(['id' => $tid, 'cabangId' => $branch, 'nama' => $tname], JSON_UNESCAPED_UNICODE),
    ]);
}

function seedUserSF1(PDO $pdo, string $id, string $username, string $role, ?string $trainerId, ?string $branch): void {
    $pdo->prepare(
        'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password)
         VALUES (:id, :u, :d, :p, :r, :c, :t, 1, 0)'
    )->execute([
        ':id' => $id, ':u' => $username, ':d' => $username,
        ':p' => password_hash('Test1234!', PASSWORD_DEFAULT),
        ':r' => $role, ':c' => $branch, ':t' => $trainerId,
    ]);
}
seedUserSF1($pdo, 'usr-sf1-alifah', 'test_trainer_sf1', 'trainer', $trnAlifah, $branch);
seedUserSF1($pdo, 'usr-sf1-admin', 'test_admin_sf1', 'admin_cabang', null, $branch);
seedUserSF1($pdo, 'usr-sf1-super', 'test_super_sf1', 'superadmin', null, null);

// --- spawn dev server (endpoint.protection.php idiom) ------------------
function findFreePortSF1(): int {
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
$port = findFreePortSF1();
$base = "http://127.0.0.1:$port";
$serverStdout = tempnam(sys_get_temp_dir(), 'sf1_stdout_');
$serverStderr = tempnam(sys_get_temp_dir(), 'sf1_stderr_');
$server = proc_open(
    sprintf('%s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $port, escapeshellarg($docroot)),
    [1 => ['file', $serverStdout, 'w'], 2 => ['file', $serverStderr, 'w']],
    $pipes
);
$serverPid = is_resource($server) ? (proc_get_status($server)['pid'] ?? 0) : 0;

function stopSF1Server(): void {
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
register_shutdown_function('stopSF1Server');

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
    fwrite(STDERR, "Server on port $port never became reachable\n");
    stopSF1Server();
    exit(1);
}

function reqSF1(string $method, string $url, ?array $body = null, ?string $cookie = null, ?string $cookieJar = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 10,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    if ($cookie) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookie);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookie);
    }
    if ($cookieJar !== null) curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieJar);
    $raw = curl_exec($ch);
    if ($raw === false) {
        fwrite(STDERR, "Request $method $url failed: " . curl_error($ch) . "\n");
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, json_decode((string) $raw, true)];
}

function loginSF1(string $base, string $username, string $cookieFile): void {
    [$status, $body] = reqSF1('POST', "$base/server/api/auth/login.php", ['username' => $username, 'password' => 'Test1234!'], null, $cookieFile);
    check("login as $username", $status === 200, 'status=' . $status . ' body=' . json_encode($body));
}

$cookieAlifah = tempnam(sys_get_temp_dir(), 'sf1_alifah_');
$cookieAdmin = tempnam(sys_get_temp_dir(), 'sf1_admin_');
$cookieSuper = tempnam(sys_get_temp_dir(), 'sf1_super_');
loginSF1($base, 'test_trainer_sf1', $cookieAlifah);
loginSF1($base, 'test_admin_sf1', $cookieAdmin);
loginSF1($base, 'test_super_sf1', $cookieSuper);

// --- (a) asisten gets her 2 host rows, peran A, zero PII -------------
echo "\n--- myPenugasan.php (asisten own rows) ---\n";
[$status, $body] = reqSF1('GET', "$base/server/api/myPenugasan.php", null, $cookieAlifah);
check('asisten GET -> 200', $status === 200, "got $status " . json_encode($body));

$rows = is_array($body) ? array_values($body) : [];
check('asisten sees exactly her 2 host rows', count($rows) === 2, json_encode($body));

$bySekolah = [];
foreach ($rows as $r) {
    if (is_array($r) && isset($r['sekolahId'])) $bySekolah[$r['sekolahId']] = $r;
}
check('covers tridaya + albiruni, not the decoy school',
    isset($bySekolah[$schTridaya], $bySekolah[$schAlbiruni]) && !isset($bySekolah[$schDecoy]),
    json_encode(array_keys($bySekolah)));

$allowedKeys = ['sekolahId', 'periodeMulai', 'periodeSelesai', 'aktif', 'peran'];
$piiLeak = false;
$peranOk = true;
foreach ($rows as $r) {
    if (!is_array($r)) { $piiLeak = true; continue; }
    if (array_keys($r) !== $allowedKeys) $piiLeak = true;
    if (($r['peran'] ?? null) !== 'A') $peranOk = false;
}
check('both rows carry peran A', $peranOk, json_encode($body));
check('rows carry exactly the 5 whitelisted keys (0 PII fields)', !$piiLeak, json_encode($body));
check('response leaks no host PII values',
    !str_contains(json_encode($body), 'Widia') && !str_contains(json_encode($body), 'LEAK-ME') && !str_contains(json_encode($body), '999999'),
    substr(json_encode($body), 0, 300));
check('null periodeSelesai stays null (tridaya)',
    array_key_exists('periodeSelesai', $bySekolah[$schTridaya] ?? []) && $bySekolah[$schTridaya]['periodeSelesai'] === null,
    json_encode($bySekolah[$schTridaya] ?? null));
check('empty-string periodeSelesai stays "" (albiruni)',
    array_key_exists('periodeSelesai', $bySekolah[$schAlbiruni] ?? []) && ($bySekolah[$schAlbiruni]['periodeSelesai'] ?? null) === '',
    json_encode($bySekolah[$schAlbiruni] ?? null));

// --- peran is per-row: trainerId match on the same person -> 'I' ------
$flip = $hostPayload;
$flip['penugasanPengajar'][0]['trainerId'] = $trnAlifah;
$flip['penugasanPengajar'][0]['asistenId'] = null;
$pdo->prepare('UPDATE trainer SET payload = :p WHERE id = :id')->execute([
    ':p' => json_encode($flip, JSON_UNESCAPED_UNICODE), ':id' => $trnWidia,
]);
[$status, $body2] = reqSF1('GET', "$base/server/api/myPenugasan.php", null, $cookieAlifah);
$bySekolah2 = [];
foreach ((array) $body2 as $r) {
    if (is_array($r) && isset($r['sekolahId'])) $bySekolah2[$r['sekolahId']] = $r;
}
check('per-row peran: trainerId row -> I, asisten row stays A',
    ($bySekolah2[$schTridaya]['peran'] ?? null) === 'I' && ($bySekolah2[$schAlbiruni]['peran'] ?? null) === 'A',
    json_encode($body2));

// --- (b) admin_cabang / superadmin get 403 ----------------------------
echo "\n--- myPenugasan.php (role gate) ---\n";
[$status] = reqSF1('GET', "$base/server/api/myPenugasan.php", null, $cookieAdmin);
check('admin_cabang GET -> 403', $status === 403, "got $status");
[$status] = reqSF1('GET', "$base/server/api/myPenugasan.php", null, $cookieSuper);
check('superadmin GET -> 403', $status === 403, "got $status");

// --- (c) unauthenticated gets 401; non-GET gets 405 -------------------
echo "\n--- myPenugasan.php (auth + method gate) ---\n";
[$status] = reqSF1('GET', "$base/server/api/myPenugasan.php");
check('anonymous GET -> 401', $status === 401, "got $status");
[$status] = reqSF1('POST', "$base/server/api/myPenugasan.php", []);
check('POST -> 405', $status === 405, "got $status");

// --- cleanup -----------------------------------------------------------
cleanupSF1($pdo, $branch, $trnWidia, $trnAlifah, $trnOther);
stopSF1Server();
@unlink($cookieAlifah);
@unlink($cookieAdmin);
@unlink($cookieSuper);
@unlink($serverStdout);
@unlink($serverStderr);

echo "\n$total checks, $failures failed\n";
if ($failures === 0) echo "SF.1 myPenugasan returns own rows only, 0 PII fields\n";
exit($failures > 0 ? 1 : 0);
