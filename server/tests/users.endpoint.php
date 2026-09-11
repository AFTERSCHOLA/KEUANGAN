<?php
declare(strict_types=1);

// ============================================================
// M-U1 — Users endpoint tests
// Verifies USER_PROVISIONING.md D2/D3/D8/D9:
//   - superadmin can create admin_cabang + trainer (with login)
//   - admin_cabang can create trainer in own branch, NOT other branch, NOT admin
//   - trainer role cannot use this endpoint at all
//   - duplicate username -> 422 friendly
//   - missing CSRF -> 403
//   - transactional rollback: trainer + user are atomic
//   - audit events written
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

// --- fixtures ---------------------------------------------------------
$branchA = 'cbg-USER-A';
$branchB = 'cbg-USER-B';

function cleanupUsersFixtures(PDO $pdo, string $branchA, string $branchB): void {
    $pdo->exec("DELETE FROM trainer WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM sekolah WHERE cabang_id IN ('$branchA', '$branchB')");
    $pdo->exec("DELETE FROM users WHERE username IN ('test_admin_a', 'test_admin_b', 'test_super', 'test_new_admin', 'test_new_trainer', 'test_new_trainer_b')");
    $pdo->exec("DELETE FROM audit_log WHERE actor_user_id IN ('usr-test-admA', 'usr-test-admB', 'usr-test-super') OR target_id IN ('usr-test-admA', 'usr-test-admB', 'usr-test-super')");
    $pdo->exec("DELETE FROM cabang WHERE id IN ('$branchA', '$branchB')");
}

cleanupUsersFixtures($pdo, $branchA, $branchB);

$pdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, '{}')")
    ->execute([':id' => $branchA, ':kode' => 'USRA', ':nama' => 'Users Test Branch A']);
$pdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, '{}')")
    ->execute([':id' => $branchB, ':kode' => 'USRB', ':nama' => 'Users Test Branch B']);

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

// --- spawn dev server --------------------------------------------------
// Uses PHP_BINARY (the running interpreter) so no PATH discovery is needed,
// a free port so a leftover server from a killed run can never squat it,
// and a shutdown-function reaper with taskkill /T so no orphan php.exe
// survives on Windows (proc_terminate alone leaves the child behind).
function findFreePortU1(): int {
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
$port = findFreePortU1();
$base = "http://127.0.0.1:$port";
$serverStdout = tempnam(sys_get_temp_dir(), 'u1_stdout_');
$serverStderr = tempnam(sys_get_temp_dir(), 'u1_stderr_');
$server = proc_open(
    sprintf('%s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $port, escapeshellarg($docroot)),
    [1 => ['file', $serverStdout, 'w'], 2 => ['file', $serverStderr, 'w']],
    $pipes
);
$serverPid = is_resource($server) ? (proc_get_status($server)['pid'] ?? 0) : 0;

function stopU1Server(): void {
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
register_shutdown_function('stopU1Server');

$serverReady = false;
for ($i = 0; $i < 20; $i++) {
    usleep(200000);
    $status = proc_get_status($server);
    if (!$status['running']) {
        fwrite(STDERR, "php -S exited immediately — port $port is probably in use.\n");
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
    stopU1Server();
    exit(1);
}

function reqU(string $method, string $url, ?array $body = null, ?string $cookie = null, ?string $csrfToken = null): array {
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    if ($csrfToken !== null) $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
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
        exit(1);
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, json_decode((string) $raw, true)];
}

function loginAsU(string $base, string $username, string $cookieFile): void {
    [$status] = reqU('POST', "$base/server/api/auth/login.php", ['username' => $username, 'password' => 'Test1234!'], $cookieFile);
    if ($status !== 200) {
        fwrite(STDERR, "login as $username failed (status=$status)\n");
        exit(1);
    }
}

function csrfForU(string $base, string $cookieFile, string $label): string {
    [$status, $body] = reqU('GET', "$base/server/api/auth/csrf.php", null, $cookieFile);
    if ($status !== 200 || !isset($body['csrfToken'])) {
        fwrite(STDERR, "Failed to fetch CSRF token for $label (status=$status)\n");
        exit(1);
    }
    return $body['csrfToken'];
}

$cookieAdminA = tempnam(sys_get_temp_dir(), 'u1_a_');
$cookieAdminB = tempnam(sys_get_temp_dir(), 'u1_b_');
$cookieSuper  = tempnam(sys_get_temp_dir(), 'u1_s_');

loginAsU($base, 'test_admin_a', $cookieAdminA);
loginAsU($base, 'test_admin_b', $cookieAdminB);
loginAsU($base, 'test_super', $cookieSuper);

$csrfAdminA = csrfForU($base, $cookieAdminA, 'admin_a');
$csrfAdminB = csrfForU($base, $cookieAdminB, 'admin_b');
$csrfSuper  = csrfForU($base, $cookieSuper, 'super');

// --- tests -------------------------------------------------------------

echo "\n--- users.php: 401 / 403 (CSRF) / 405 ---\n";

[$status] = reqU('POST', "$base/server/api/users.php", ['role' => 'trainer', 'username' => 'foo', 'displayName' => 'Foo', 'cabangId' => $branchA]);
check('anonymous POST -> 401', $status === 401, "got $status");

[$status] = reqU('POST', "$base/server/api/users.php", ['role' => 'trainer', 'username' => 'foo', 'displayName' => 'Foo', 'cabangId' => $branchA], $cookieSuper);
check('superadmin without CSRF -> 403', $status === 403, "got $status");

[$status] = reqU('GET', "$base/server/api/users.php", null, $cookieSuper);
check('GET -> 405', $status === 405, "got $status");

echo "\n--- users.php: superadmin creates Branch Admin ---\n";

[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'admin_cabang',
    'username' => 'test_new_admin',
    'displayName' => 'New Admin Test',
    'cabangId' => $branchA,
], $cookieSuper, $csrfSuper);

check('superadmin creates admin_cabang -> 201', $status === 201, "got $status body=" . json_encode($body));
check('initialPassword present in response', isset($body['initialPassword']) && is_string($body['initialPassword']) && strlen($body['initialPassword']) >= 12, 'initialPassword missing or short');
check('user.role == admin_cabang', isset($body['user']['role']) && $body['user']['role'] === 'admin_cabang');
check('user.cabangId == branchA', isset($body['user']['cabangId']) && $body['user']['cabangId'] === $branchA);
check('user.mustChangePassword == true', isset($body['user']['mustChangePassword']) && $body['user']['mustChangePassword'] === true);
check('user.trainerId == null', isset($body['user']) && array_key_exists('trainerId', $body['user']) && $body['user']['trainerId'] === null);

$row = $pdo->prepare('SELECT id, role, cabang_id, active, must_change_password FROM users WHERE username = ?');
$row->execute(['test_new_admin']);
$created = $row->fetch();
check('admin_cabang row persisted in DB', $created !== false);
check('admin_cabang row.cabang_id == branchA', $created !== false && $created['cabang_id'] === $branchA);
check('admin_cabang row.must_change_password == 1', $created !== false && (int) $created['must_change_password'] === 1);

echo "\n--- users.php: superadmin creates Trainer (transactional) ---\n";

[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'trainer',
    'username' => 'test_new_trainer',
    'displayName' => 'New Trainer',
    'cabangId' => $branchA,
    'trainer' => [
        'nama' => 'Budi Santoso',
        'wa' => '6281234567890',
        'jadwal' => 'Senin-Rabu 16:00',
        'honor' => 150000,
        'sekolahIds' => [],
    ],
], $cookieSuper, $csrfSuper);

check('superadmin creates trainer -> 201', $status === 201, "got $status body=" . json_encode($body));
$trainerRowId = $body['trainer']['id'] ?? null;
check('trainer.id returned', is_string($trainerRowId) && $trainerRowId !== '');
check('trainer.id starts with trn-', is_string($trainerRowId) && str_starts_with($trainerRowId, 'trn-'));
check('user.trainerId == trainer.id', isset($body['user']['trainerId']) && $body['user']['trainerId'] === $trainerRowId);

$row = $pdo->prepare('SELECT COUNT(*) AS c FROM trainer WHERE id = ?');
$row->execute([$trainerRowId]);
check('trainer row exists', (int) $row->fetch()['c'] === 1);

$row = $pdo->prepare('SELECT role, cabang_id, trainer_id FROM users WHERE username = ?');
$row->execute(['test_new_trainer']);
$trainerUser = $row->fetch();
check('users.trainer_id FK set', $trainerUser !== false && $trainerUser['trainer_id'] === $trainerRowId);
check('users.role == trainer', $trainerUser !== false && $trainerUser['role'] === 'trainer');

echo "\n--- users.php: duplicate username -> 422 + trainer rollback ---\n";

// Seed a real trainer first via the same payload structure, then attempt to
// create a user account with the same username but for the trainer whose
// name we then blank. Easier path: try to create a trainer with a username
// that's already taken by test_new_trainer, and check both that the trainer
// row was NOT left behind and that we got a friendly 422.
$trainerCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM trainer WHERE cabang_id = '$branchA'")->fetchColumn();

[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'trainer',
    'username' => 'test_new_trainer',  // duplicate
    'displayName' => 'Should Fail',
    'cabangId' => $branchA,
    'trainer' => [
        'nama' => 'Should Roll Back',
    ],
], $cookieSuper, $csrfSuper);

check('duplicate username -> 422', $status === 422, "got $status");
check('error message mentions username', isset($body['error']) && stripos((string) $body['error'], 'username') !== false, 'error=' . json_encode($body));

$trainerCountAfter = (int) $pdo->query("SELECT COUNT(*) FROM trainer WHERE cabang_id = '$branchA'")->fetchColumn();
check('no orphan trainer row left behind', $trainerCountAfter === $trainerCountBefore, "before=$trainerCountBefore after=$trainerCountAfter");

echo "\n--- users.php: admin_cabang can create trainer in own branch ---\n";

// Post-1fcaf79 contract: the session is the branch authority — an
// admin_cabang must NOT send cabangId (422 if present); the server derives
// the branch from the session. The assertion below proves the derivation
// by checking the created row lands in admin B's own branch.
[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'trainer',
    'username' => 'test_new_trainer_b',
    'displayName' => 'Trainer By Admin B',
    'trainer' => ['nama' => 'Trainer B'],
], $cookieAdminB, $csrfAdminB);

check('admin_cabang B creates trainer in own branch -> 201', $status === 201, "got $status body=" . json_encode($body));
check('trainer derived into admin B branch', isset($body['user']['cabangId']) && $body['user']['cabangId'] === $branchB, 'body=' . json_encode($body));

echo "\n--- users.php: admin_cabang CANNOT create admin_cabang ---\n";

[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'admin_cabang',
    'username' => 'test_should_fail',
    'displayName' => 'Should Fail',
    'cabangId' => $branchA,
], $cookieAdminA, $csrfAdminA);

check('admin_cabang tries to create admin_cabang -> 403', $status === 403, "got $status body=" . json_encode($body));

echo "\n--- users.php: admin_cabang CANNOT create trainer in other branch ---\n";

// Post-1fcaf79 contract: a client-supplied cabangId from an admin_cabang is
// rejected outright (422) before authorization runs, so cross-branch creation
// is structurally inexpressible. The tamper attempt below must 422; the
// follow-up without cabangId proves the session branch (A) is what sticks.
[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'trainer',
    'username' => 'test_cross_branch',
    'displayName' => 'Cross Branch',
    'cabangId' => $branchB,  // admin A's session, but branch B
    'trainer' => ['nama' => 'Should Fail'],
], $cookieAdminA, $csrfAdminA);

check('admin_cabang A sending foreign cabangId -> 422', $status === 422 && isset($body['error']) && stripos((string) $body['error'], 'cabangId') !== false, "got $status body=" . json_encode($body));

[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'trainer',
    'username' => 'test_cross_branch2',
    'displayName' => 'Cross Branch Session-Bound',
    'trainer' => ['nama' => 'Session Bound'],
], $cookieAdminA, $csrfAdminA);

check('admin_cabang A without cabangId -> 201 in session branch', $status === 201 && isset($body['user']['cabangId']) && $body['user']['cabangId'] === $branchA, "got $status body=" . json_encode($body));

echo "\n--- users.php: trainer role cannot use endpoint ---\n";

// Seed a trainer-role user and log them in
seedUser($pdo, 'usr-test-trainer1', 'test_trainer1', 'trainer', $branchA);
$pdo->prepare('UPDATE users SET trainer_id = ? WHERE id = ?')->execute([$trainerRowId, 'usr-test-trainer1']);
$cookieTrainer = tempnam(sys_get_temp_dir(), 'u1_t_');
loginAsU($base, 'test_trainer1', $cookieTrainer);
$csrfTrainer = csrfForU($base, $cookieTrainer, 'trainer');

[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'trainer',
    'username' => 'test_trainer_create',
    'displayName' => 'Trainer Trying To Create',
    'cabangId' => $branchA,
    'trainer' => ['nama' => 'X'],
], $cookieTrainer, $csrfTrainer);

check('trainer role POST -> 403', $status === 403, "got $status body=" . json_encode($body));

echo "\n--- users.php: superadmin cannot create user with non-existent cabang ---\n";

[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'admin_cabang',
    'username' => 'test_orphan',
    'displayName' => 'Orphan',
    'cabangId' => 'cbg-NONEXISTENT',
], $cookieSuper, $csrfSuper);

check('superadmin with bad cabangId -> 422', $status === 422, "got $status body=" . json_encode($body));

echo "\n--- users.php: invalid username -> 422 ---\n";

[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'trainer',
    'username' => 'no spaces allowed',
    'displayName' => 'X',
    'cabangId' => $branchA,
    'trainer' => ['nama' => 'X'],
], $cookieSuper, $csrfSuper);

check('invalid username chars -> 422', $status === 422, "got $status body=" . json_encode($body));

echo "\n--- users.php: empty nama trainer -> 422 ---\n";

[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'create',
    'role' => 'trainer',
    'username' => 'test_emptynama',
    'displayName' => 'X',
    'cabangId' => $branchA,
    'trainer' => ['nama' => ''],
], $cookieSuper, $csrfSuper);

check('empty trainer nama -> 422', $status === 422, "got $status body=" . json_encode($body));

echo "\n--- users.php: reset_password returns new initial password ---\n";

$csrfSuper2 = csrfForU($base, $cookieSuper, 'super-refresh');
[$status, $body] = reqU('POST', "$base/server/api/users.php", [
    'action' => 'reset_password',
    'id' => 'usr-test-trainer1',
], $cookieSuper, $csrfSuper2);

check('reset_password -> 200', $status === 200, "got $status body=" . json_encode($body));
check('reset_password returns new initialPassword', isset($body['initialPassword']) && is_string($body['initialPassword']));

$row = $pdo->prepare('SELECT must_change_password FROM users WHERE id = ?');
$row->execute(['usr-test-trainer1']);
$reset = $row->fetch();
check('after reset, must_change_password == 1', $reset !== false && (int) $reset['must_change_password'] === 1);

echo "\n--- audit events written ---\n";

$row = $pdo->prepare("SELECT COUNT(*) AS c FROM audit_log WHERE event_type IN ('user_created','trainer_created') AND actor_user_id = 'usr-test-super'");
$row->execute();
$auditCount = (int) $row->fetch()['c'];
check('audit_log has user_created + trainer_created events from superadmin', $auditCount >= 2, "count=$auditCount");

// --- cleanup -----------------------------------------------------------

stopU1Server();
cleanupUsersFixtures($pdo, $branchA, $branchB);

echo "\n=== summary: $total checks, $failures failures ===\n";
exit($failures === 0 ? 0 : 1);