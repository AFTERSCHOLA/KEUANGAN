<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

/**
 * M2.3 verifies the full login lifecycle over real HTTP (login.php,
 * logout.php, csrf.php), for the same reason session.bootstrap.php (M2.2)
 * does: jsonResponse() exits the script and session cookies only appear on
 * a genuine response cycle, so in-process function calls cannot observe
 * status codes or Set-Cookie headers.
 *
 * Covers every VERIFY item for M2.3:
 *   - wrong password                -> 401, generic message
 *   - inactive user                 -> 401, even with the correct password
 *   - lockout                       -> 6th attempt blocked even with correct password
 *   - fixation resistance           -> session id changes on successful login
 *   - password non-leakage          -> no password/password_hash in any response body
 *   - CSRF failure                  -> state-changing request without/with wrong token is rejected
 *   - logout invalidation           -> session no longer authenticates after logout
 */

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

check(extension_loaded('curl'), 'php-curl extension is required to run this test');

function findFreePort(): int {
    $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    check($socket !== false, "Could not allocate a free port: {$errstr}");
    $name = stream_socket_get_name($socket, false);
    fclose($socket);
    $parts = explode(':', $name);
    return (int) end($parts);
}

/** @return array{0:resource,1:array<int,resource>} */
function startBuiltinServer(string $docroot, int $port): array {
    $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open(
        sprintf('%s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $port, escapeshellarg($docroot)),
        $descriptors,
        $pipes
    );
    check(is_resource($process), 'Could not start PHP built-in server');
    foreach ($pipes as $pipe) stream_set_blocking($pipe, false);
    $childPid = proc_get_status($process)['pid'] ?? 0;

    $deadline = microtime(true) + 5.0;
    $up = false;
    while (microtime(true) < $deadline) {
        $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
        if ($conn) { fclose($conn); $up = true; break; }
        usleep(100000);
    }
    check($up, 'PHP built-in server did not become ready in time');
    return [$process, $pipes, $childPid];
}

function stopBuiltinServer(array $handle): void {
    [$process, $pipes] = $handle;
    $childPid = $handle[2] ?? 0;
    foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
    if (is_resource($process)) {
        // Windows-safe reaping: kill the whole process tree so no
        // orphan php.exe survives (proc_terminate alone can leave
        // the child behind on Win32).
        if (PHP_OS_FAMILY === 'Windows' && (int) $childPid > 0) {
            @exec('taskkill /PID ' . (int) $childPid . ' /T /F 2>NUL');
        }
        @proc_terminate($process);
        @proc_close($process);
    }
}

/** @return array{status:int, headers:array<int,string>, body:string} */
function httpRequest(string $method, string $url, array $extraHeaders = [], ?string $jsonBody = null): array {
    $ch = curl_init($url);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_HTTPHEADER => $extraHeaders,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_CUSTOMREQUEST => $method,
    ];
    if ($jsonBody !== null) {
        $options[CURLOPT_POSTFIELDS] = $jsonBody;
        $options[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json';
    }
    curl_setopt_array($ch, $options);
    $response = curl_exec($ch);
    check($response !== false, 'curl request failed: ' . curl_error($ch));
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $rawHeaders = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    $headers = array_values(array_filter(array_map('trim', explode("\r\n", $rawHeaders))));
    return ['status' => $status, 'headers' => $headers, 'body' => $body];
}

function httpGet(string $url, array $extraHeaders = []): array {
    return httpRequest('GET', $url, $extraHeaders);
}

function httpPost(string $url, array $data, array $extraHeaders = []): array {
    return httpRequest('POST', $url, $extraHeaders, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

/** @param array<int,string> $headers */
function extractCookieValue(array $headers, string $cookieName): ?string {
    foreach ($headers as $header) {
        if (stripos($header, 'Set-Cookie:') !== 0) continue;
        if (preg_match('/' . preg_quote($cookieName, '/') . '=([^;]+)/', $header, $m) === 1) return $m[1];
    }
    return null;
}

function bodyLeaksSecret(string $body, string $secret): bool {
    return $secret !== '' && stripos($body, $secret) !== false;
}

function seedUser(PDO $pdo, array $overrides = []): array {
    $suffix = bin2hex(random_bytes(4));
    $plainPassword = 'CorrectHorse' . random_int(100000, 999999) . 'X';
    $user = array_merge([
        'id' => 'usr-m23-' . $suffix,
        'username' => 'm23.user.' . $suffix . '@dev.test',
        'display_name' => 'M2.3 Test User ' . $suffix,
        'role' => 'trainer',
        'cabang_id' => 'cbg-m23-' . $suffix,
        'trainer_id' => 'trn-m23-' . $suffix,
        'active' => 1,
        'must_change_password' => 0,
    ], $overrides);

    $stmt = $pdo->prepare(
        'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password)
         VALUES (:id, :username, :display_name, :password_hash, :role, :cabang_id, :trainer_id, :active, :must_change_password)'
    );
    $stmt->execute([
        ':id' => $user['id'],
        ':username' => $user['username'],
        ':display_name' => $user['display_name'],
        ':password_hash' => password_hash($plainPassword, PASSWORD_DEFAULT),
        ':role' => $user['role'],
        ':cabang_id' => $user['cabang_id'],
        ':trainer_id' => $user['trainer_id'],
        ':active' => $user['active'],
        ':must_change_password' => $user['must_change_password'],
    ]);

    $user['plainPassword'] = $plainPassword;
    return $user;
}

function deleteUser(PDO $pdo, string $id): void {
    $pdo->prepare('DELETE FROM users WHERE id = :id')->execute([':id' => $id]);
}

// --- Boot a real server pointed at server/ (the API document root) ---
$docroot = realpath(__DIR__ . '/..');
check($docroot !== false, 'Could not resolve server/ document root');
$port = findFreePort();
$handle = startBuiltinServer($docroot, $port);
$base = "http://127.0.0.1:{$port}";

$pdo = database();
$config = serverConfig();
$cookieName = (string) ($config['session_name'] ?? 'afterschola_session');

$seededUserIds = [];

try {
    // ================= Part 1: wrong password =================
    $user1 = seedUser($pdo);
    $seededUserIds[] = $user1['id'];

    $wrong = httpPost("{$base}/api/auth/login.php", ['username' => $user1['username'], 'password' => $user1['plainPassword'] . '-wrong']);
    check($wrong['status'] === 401, "Wrong password expected 401, got {$wrong['status']}");
    $wrongBody = json_decode($wrong['body'], true);
    check(is_array($wrongBody) && isset($wrongBody['error']) && !isset($wrongBody['user']), 'Wrong-password response leaked identity or missing error field');
    check(!bodyLeaksSecret($wrong['body'], $user1['plainPassword']), 'Wrong-password response leaked the real password');
    echo "M2.3 wrong-password check passed\n";

    // ================= Part 2: inactive user =================
    $user2 = seedUser($pdo, ['active' => 0]);
    $seededUserIds[] = $user2['id'];

    $inactive = httpPost("{$base}/api/auth/login.php", ['username' => $user2['username'], 'password' => $user2['plainPassword']]);
    check($inactive['status'] === 401, "Inactive user with correct password expected 401, got {$inactive['status']}");
    $inactiveBody = json_decode($inactive['body'], true);
    check(is_array($inactiveBody) && isset($inactiveBody['error']) && !isset($inactiveBody['user']), 'Inactive-user response leaked identity or missing error field');
    echo "M2.3 inactive-user check passed\n";

    // ================= Part 3: lockout after repeated failures =================
    $user3 = seedUser($pdo);
    $seededUserIds[] = $user3['id'];

    for ($i = 0; $i < 5; $i++) {
        $attempt = httpPost("{$base}/api/auth/login.php", ['username' => $user3['username'], 'password' => $user3['plainPassword'] . '-wrong']);
        check($attempt['status'] === 401, "Lockout warm-up attempt " . ($i + 1) . " expected 401, got {$attempt['status']}");
    }
    // The 6th attempt uses the CORRECT password but must still be blocked by the lockout window.
    $lockedAttempt = httpPost("{$base}/api/auth/login.php", ['username' => $user3['username'], 'password' => $user3['plainPassword']]);
    check($lockedAttempt['status'] === 401, "Locked-out account with correct password expected 401, got {$lockedAttempt['status']}");
    $lockedBody = json_decode($lockedAttempt['body'], true);
    check(is_array($lockedBody) && !isset($lockedBody['user']), 'Locked-out login unexpectedly returned an authenticated identity');
    echo "M2.3 lockout check passed\n";

    // ================= Part 4: fixation resistance =================
    $user4 = seedUser($pdo);
    $seededUserIds[] = $user4['id'];

    // Establish a pre-authentication session id, as an attacker fixing a
    // victim's session would.
    $preAuth = httpGet("{$base}/api/auth/me.php");
    check($preAuth['status'] === 401, "Pre-auth /api/auth/me.php expected 401, got {$preAuth['status']}");
    $preAuthId = extractCookieValue($preAuth['headers'], $cookieName);
    check($preAuthId !== null, 'Could not capture pre-authentication session id');

    // Log in while presenting that pre-existing session cookie.
    $loginResp = httpPost(
        "{$base}/api/auth/login.php",
        ['username' => $user4['username'], 'password' => $user4['plainPassword']],
        ["Cookie: {$cookieName}={$preAuthId}"]
    );
    check($loginResp['status'] === 200, "Valid login expected 200, got {$loginResp['status']}");
    $postAuthId = extractCookieValue($loginResp['headers'], $cookieName);
    check($postAuthId !== null, 'Login response did not rotate/issue a session cookie');
    check($postAuthId !== $preAuthId, 'Session id did not change after login — fixation risk');

    // The old, pre-auth session id must not have been silently authenticated.
    $oldIdStillAnon = httpGet("{$base}/api/auth/me.php", ["Cookie: {$cookieName}={$preAuthId}"]);
    check($oldIdStillAnon['status'] === 401, "Pre-auth session id must remain unauthenticated after login, got {$oldIdStillAnon['status']}");
    echo "M2.3 fixation-resistance check passed\n";

    // ================= Part 5: password non-leakage (across all captured bodies) =================
    $loginBody = json_decode($loginResp['body'], true);
    check(is_array($loginBody) && isset($loginBody['user'], $loginBody['csrfToken']), 'Successful login response missing expected fields');
    check(!array_key_exists('password', $loginBody['user']) && !array_key_exists('password_hash', $loginBody['user']), 'Login response leaked a password field');
    foreach ([$wrong['body'], $inactive['body'], $lockedAttempt['body'], $loginResp['body']] as $capturedBody) {
        check(stripos($capturedBody, 'password_hash') === false, 'A response body leaked the password_hash field name/value');
    }
    check(!bodyLeaksSecret($loginResp['body'], $user4['plainPassword']), 'Successful login response leaked the plaintext password');
    echo "M2.3 password-non-leakage check passed\n";

    // ================= Part 6: CSRF failure =================
    $csrfToken = (string) $loginBody['csrfToken'];
    $sessionCookieHeader = "Cookie: {$cookieName}={$postAuthId}";

    $noToken = httpPost("{$base}/api/auth/logout.php", [], [$sessionCookieHeader]);
    check($noToken['status'] === 403, "Logout without CSRF token expected 403, got {$noToken['status']}");

    $wrongToken = httpPost("{$base}/api/auth/logout.php", [], [$sessionCookieHeader, 'X-CSRF-Token: not-the-real-token']);
    check($wrongToken['status'] === 403, "Logout with wrong CSRF token expected 403, got {$wrongToken['status']}");
    echo "M2.3 csrf-failure check passed\n";

    // ================= Part 7: logout invalidation =================
    $goodLogout = httpPost("{$base}/api/auth/logout.php", [], [$sessionCookieHeader, "X-CSRF-Token: {$csrfToken}"]);
    check($goodLogout['status'] === 200, "Logout with correct CSRF token expected 200, got {$goodLogout['status']}");

    $afterLogout = httpGet("{$base}/api/auth/me.php", [$sessionCookieHeader]);
    check($afterLogout['status'] === 401, "Session must be rejected after logout, got {$afterLogout['status']}");
    echo "M2.3 logout-invalidation check passed\n";
} finally {
    stopBuiltinServer($handle);
    foreach ($seededUserIds as $id) deleteUser($pdo, $id);
}

echo "M2.3 login lifecycle check passed\n";
