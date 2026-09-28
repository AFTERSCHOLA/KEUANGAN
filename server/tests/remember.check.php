<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

/**
 * D-RM1–D-RM5 contract: opt-in persistent login over real HTTP (the same
 * reason login.lifecycle.php (M2.3) exists — Set-Cookie headers only
 * appear on a genuine response cycle).
 *
 * Covers every VERIFY item for the remember-me gate:
 *   - plain login                 -> no remember cookie, no token row
 *   - remember login              -> persistent HttpOnly cookie + hashed row
 *   - restore                     -> remember-only jar authenticates (me.php 200)
 *   - rotation                    -> presented hash consumed, fresh cookie minted
 *   - replay                      -> consumed token is 401
 *   - tampered/unknown token      -> 401, no identity leak
 *   - expired token               -> 401 + row pruned
 *   - logout                      -> token row gone, cookie cleared, restore dead
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

/** @return array{0:resource,1:array<int,resource>,2:int} */
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

/** @return list<string> */
function setCookieHeaders(array $headers): array {
    return array_values(array_filter($headers, static fn ($h) => stripos($h, 'Set-Cookie:') === 0));
}

function extractCookieValue(array $headers, string $cookieName): ?string {
    foreach (setCookieHeaders($headers) as $header) {
        if (preg_match('/' . preg_quote($cookieName, '/') . '=([^;]*)/', $header, $m) === 1) return $m[1];
    }
    return null;
}

function cookieHeaderLine(string $name, string $value): string {
    return "Cookie: {$name}={$value}";
}

// --- Boot a real server pointed at server/ (the API document root) ---
$docroot = realpath(__DIR__ . '/..');
check($docroot !== false, 'Could not resolve server/ document root');
$port = findFreePort();
$handle = startBuiltinServer($docroot, $port);
$base = "http://127.0.0.1:{$port}";

$pdo = database();
$config = serverConfig();
$sessionName = (string) ($config['session_name'] ?? 'afterschola_session');
$rememberName = 'afterschola_remember';

$suffix = bin2hex(random_bytes(4));
$userId = 'usr-rm-' . $suffix;
$username = 'rm.user.' . $suffix . '@dev.test';
$plainPassword = 'CorrectHorse' . random_int(100000, 999999) . 'X';

try {
    $pdo->prepare(
        "INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password)
         VALUES (:id, :username, :display_name, :password_hash, 'trainer', :cabang_id, :trainer_id, 1, 0)"
    )->execute([
        ':id' => $userId,
        ':username' => $username,
        ':display_name' => 'RM Test User ' . $suffix,
        ':password_hash' => password_hash($plainPassword, PASSWORD_DEFAULT),
        ':cabang_id' => 'cbg-rm-' . $suffix,
        ':trainer_id' => 'trn-rm-' . $suffix,
    ]);

    $tokenRows = static function () use ($pdo, $userId): array {
        $stmt = $pdo->prepare('SELECT token_hash, expires_at FROM remember_tokens WHERE user_id = :uid');
        $stmt->execute([':uid' => $userId]);
        return $stmt->fetchAll();
    };

    // ================= Part 1: plain login mints nothing =================
    $plain = httpPost("{$base}/api/auth/login.php", ['username' => $username, 'password' => $plainPassword]);
    check($plain['status'] === 200, "Plain login expected 200, got {$plain['status']}");
    check(extractCookieValue($plain['headers'], $rememberName) === null, 'Plain login must not set a remember cookie');
    check(count($tokenRows()) === 0, 'Plain login must not create a token row');
    echo "RM plain-login check passed\n";

    // ================= Part 2: remember login mints cookie + row =================
    $login = httpPost("{$base}/api/auth/login.php", ['username' => $username, 'password' => $plainPassword, 'remember' => true]);
    check($login['status'] === 200, "Remember login expected 200, got {$login['status']}");
    $raw = extractCookieValue($login['headers'], $rememberName);
    check(is_string($raw) && $raw !== '', 'Remember login must set a remember cookie');
    $rememberHeaders = array_values(array_filter(setCookieHeaders($login['headers']), static fn ($h) => stripos($h, $rememberName . '=') !== false));
    check(count($rememberHeaders) > 0 && stripos($rememberHeaders[0], 'HttpOnly') !== false, 'Remember cookie must be HttpOnly');
    check(count($rememberHeaders) > 0 && stripos($rememberHeaders[0], 'expires=') !== false, 'Remember cookie must be persistent (Expires)');
    check(stripos($login['body'], $plainPassword) === false, 'Login response leaked the password');
    $rows = $tokenRows();
    check(count($rows) === 1, 'Remember login must create exactly one token row');
    check($rows[0]['token_hash'] === hash('sha256', $raw), 'Stored token must be the SHA-256 hash, never the raw value');
    check(strtotime((string) $rows[0]['expires_at']) > time() + 29 * 24 * 3600, 'Token expiry must be ~30 days out');
    echo "RM issue check passed\n";

    // ================= Part 3: restore (reuse) + aged rotation =================
    // Age-gated rotation (D-RM2): a fresh token is reused as-is so
    // concurrent bootstraps both succeed; only an old token rotates.
    $sessionCookie = extractCookieValue($login['headers'], $sessionName);
    check(is_string($sessionCookie) && $sessionCookie !== '', 'Login must still set the session cookie');
    $me = httpGet("{$base}/api/auth/me.php", [cookieHeaderLine($rememberName, $raw)]);
    check($me['status'] === 200, "Remember-only restore expected 200, got {$me['status']}: " . substr($me['body'], 0, 160));
    $meBody = json_decode($me['body'], true);
    check(is_array($meBody) && ($meBody['user']['username'] ?? null) === $username, 'Restored identity must match the token owner');
    check(extractCookieValue($me['headers'], $rememberName) === null, 'Fresh-token restore must NOT rotate (reuse)');
    check(count($tokenRows()) === 1, 'Fresh-token restore must keep the single row');
    // Concurrent-restore simulation: same fresh token twice more.
    $me2 = httpGet("{$base}/api/auth/me.php", [cookieHeaderLine($rememberName, $raw)]);
    $me3 = httpGet("{$base}/api/auth/me.php", [cookieHeaderLine($rememberName, $raw)]);
    check($me2['status'] === 200 && $me3['status'] === 200, 'Concurrent restores must both succeed');
    // Age the row past the window, then restore rotates.
    $pdo->prepare('UPDATE remember_tokens SET created_at = DATE_SUB(created_at, INTERVAL 2 HOUR) WHERE user_id = :u')
        ->execute([':u' => $userId]);
    $meOld = httpGet("{$base}/api/auth/me.php", [cookieHeaderLine($rememberName, $raw)]);
    check($meOld['status'] === 200, "Aged restore expected 200, got {$meOld['status']}");
    $rotated = extractCookieValue($meOld['headers'], $rememberName);
    check(is_string($rotated) && $rotated !== '' && $rotated !== $raw, 'Aged restore must rotate the token (fresh cookie)');
    $rowsAfter = $tokenRows();
    check(count($rowsAfter) === 1 && $rowsAfter[0]['token_hash'] === hash('sha256', $rotated), 'Consumed hash must be replaced by the rotated hash');
    echo "RM restore + rotation check passed\n";

    // ================= Part 4: replay + tamper =================
    $replay = httpGet("{$base}/api/auth/me.php", [cookieHeaderLine($rememberName, $raw)]);
    check($replay['status'] === 401, "Rotated-out token replay expected 401, got {$replay['status']}");
    $tampered = httpGet("{$base}/api/auth/me.php", [cookieHeaderLine($rememberName, 'tampered-' . $raw)]);
    check($tampered['status'] === 401, "Tampered token expected 401, got {$tampered['status']}");
    check(stripos($tampered['body'], $username) === false, 'Tampered-token response must not leak identity');
    echo "RM replay + tamper check passed\n";

    // ================= Part 5: expiry prunes =================
    // Single-clock rule (see session.php): seed the past timestamp from
    // PHP, never MySQL NOW() — the two clocks can disagree by hours.
    $pastHour = date('Y-m-d H:i:s', time() - 3600);
    $pdo->prepare('INSERT INTO remember_tokens (token_hash, user_id, expires_at) VALUES (:h, :u, :exp)')
        ->execute([':h' => hash('sha256', 'expired-probe-' . $suffix), ':u' => $userId, ':exp' => $pastHour]);
    $expired = httpGet("{$base}/api/auth/me.php", [cookieHeaderLine($rememberName, 'expired-probe-' . $suffix)]);
    check($expired['status'] === 401, "Expired token expected 401, got {$expired['status']}");
    $left = $pdo->prepare('SELECT COUNT(*) FROM remember_tokens WHERE token_hash = :h');
    $left->execute([':h' => hash('sha256', 'expired-probe-' . $suffix)]);
    check((int) $left->fetchColumn() === 0, 'Expired token row must be pruned on presentation');
    echo "RM expiry check passed\n";

    // ================= Part 6: logout revokes =================
    $loginBody = json_decode($login['body'], true);
    check(is_array($loginBody) && isset($loginBody['csrfToken']), 'Login body must carry a CSRF token');
    // Browser-faithful: logout carries BOTH cookies (session + remember).
    $logout = httpRequest('POST', "{$base}/api/auth/logout.php", [
        cookieHeaderLine($sessionName, (string) $sessionCookie) . '; ' . $rememberName . '=' . $rotated,
        'X-CSRF-Token: ' . $loginBody['csrfToken'],
    ]);
    check($logout['status'] === 200, "Logout expected 200, got {$logout['status']}");
    check(count($tokenRows()) === 0, 'Logout must delete the remember token row');
    $afterLogout = httpGet("{$base}/api/auth/me.php", [cookieHeaderLine($rememberName, (string) $rotated)]);
    check($afterLogout['status'] === 401, "Post-logout restore expected 401, got {$afterLogout['status']}");
    echo "RM logout-revoke check passed\n";

    echo "remember.check.php: all checks passed\n";
} finally {
    $pdo->prepare('DELETE FROM remember_tokens WHERE user_id = :u')->execute([':u' => $userId]);
    $pdo->prepare('DELETE FROM users WHERE id = :id')->execute([':id' => $userId]);
    stopBuiltinServer($handle);
}
