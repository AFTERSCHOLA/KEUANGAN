<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

/**
 * M2.2 verifies three things that only exist on a real HTTP response, not on
 * an in-process function call:
 *   - an anonymous request to /api/auth/me.php returns 401 with no identity
 *   - the session cookie carries HttpOnly, SameSite=Lax, and a Secure flag
 *     that matches the active session_secure configuration
 *   - a session that has aged past the idle/absolute limits is rejected
 *     (401), not silently treated as valid
 *
 * jsonResponse() ends the script with exit, and cookie headers are only
 * emitted on a real session_start() response cycle, so this test boots PHP's
 * built-in web server against server/ as document root and drives it over
 * loopback with curl, the same way a browser would.
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
function httpGet(string $url, array $extraHeaders = []): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_HTTPHEADER => $extraHeaders,
        CURLOPT_TIMEOUT => 5,
    ]);
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

/** @param array<int,string> $headers */
function setCookieHeaders(array $headers): array {
    return array_values(array_filter($headers, fn($h) => stripos($h, 'Set-Cookie:') === 0));
}

/**
 * Writes $_SESSION data for an existing session id using PHP's own session
 * machinery (in a throwaway child process), instead of hand-serializing the
 * session file. This stays correct regardless of which session serialize
 * handler is configured.
 */
function seedExpiredSession(string $cookieName, string $sessionId, int $startedAt): void {
    $code = <<<'PHP'
session_name($argv[1]);
session_id($argv[2]);
session_start();
$_SESSION['afterschola_started_at'] = (int) $argv[3];
$_SESSION['afterschola_activity_at'] = (int) $argv[3];
$_SESSION['afterschola_user'] = [
    'id' => 'usr-m22-expired',
    'username' => 'm22.expired@dev.test',
    'displayName' => 'M2.2 Expired QA',
    'role' => 'trainer',
    'cabangId' => 'cbg-m22-test',
    'trainerId' => 'trn-m22-test',
    'active' => true,
    'mustChangePassword' => false,
];
session_write_close();
PHP;
    $cmd = sprintf(
        '%s -r %s -- %s %s %s',
        escapeshellarg(PHP_BINARY),
        escapeshellarg($code),
        escapeshellarg($cookieName),
        escapeshellarg($sessionId),
        escapeshellarg((string) $startedAt)
    );
    exec($cmd, $output, $exitCode);
    check($exitCode === 0, 'Failed to seed expired session state: ' . implode("\n", $output));
}

// --- Boot a real server pointed at server/ (the API document root) ---
$docroot = realpath(__DIR__ . '/..');
check($docroot !== false, 'Could not resolve server/ document root');
$port = findFreePort();
$handle = startBuiltinServer($docroot, $port);

try {
    $config = serverConfig();
    $expectedSecure = (bool) ($config['session_secure'] ?? productionMode());
    $expectedCookieName = (string) ($config['session_name'] ?? 'afterschola_session');

    // --- Part 1: anonymous request to /api/auth/me.php returns 401, no identity leaked ---
    $anon = httpGet("http://127.0.0.1:{$port}/api/auth/me.php");
    check($anon['status'] === 401, "Anonymous /api/auth/me.php expected 401, got {$anon['status']}");
    $anonBody = json_decode($anon['body'], true);
    check(is_array($anonBody) && isset($anonBody['error']) && !isset($anonBody['user']), 'Anonymous response leaked identity or is missing an error field');
    echo "M2.2 anonymous-401 check passed\n";

    // --- Part 2: session cookie carries HttpOnly, SameSite=Lax, and the configured Secure flag ---
    $cookies = setCookieHeaders($anon['headers']);
    check(count($cookies) > 0, 'No Set-Cookie header present on session bootstrap');
    $sessionCookie = null;
    foreach ($cookies as $cookie) {
        if (stripos($cookie, $expectedCookieName . '=') !== false) { $sessionCookie = $cookie; break; }
    }
    check($sessionCookie !== null, "No Set-Cookie header found for session name '{$expectedCookieName}'");
    check(stripos($sessionCookie, 'HttpOnly') !== false, 'Session cookie missing HttpOnly flag');
    check(stripos($sessionCookie, 'SameSite=Lax') !== false, 'Session cookie missing SameSite=Lax flag');
    if ($expectedSecure) {
        check(stripos($sessionCookie, 'Secure') !== false, 'Session cookie missing Secure flag while session_secure=true');
    } else {
        check(stripos($sessionCookie, 'Secure') === false, 'Session cookie unexpectedly marked Secure while session_secure=false');
    }
    check(preg_match('/' . preg_quote($expectedCookieName, '/') . '=([^;]+)/', $sessionCookie, $m) === 1, 'Could not parse session cookie value');
    $cookieValue = $m[1];
    echo 'M2.2 cookie-flags check passed (Secure=' . ($expectedSecure ? 'true' : 'false') . ", per session_secure config)\n";

    // --- Part 3: an aged-out session is rejected with 401, not treated as valid ---
    $expiredStartedAt = time() - (SESSION_ABSOLUTE_SECONDS + 60);
    seedExpiredSession($expectedCookieName, $cookieValue, $expiredStartedAt);

    $expired = httpGet("http://127.0.0.1:{$port}/api/auth/me.php", ["Cookie: {$expectedCookieName}={$cookieValue}"]);
    check($expired['status'] === 401, "Expired-session /api/auth/me.php expected 401, got {$expired['status']}");
    $expiredBody = json_decode($expired['body'], true);
    check(is_array($expiredBody) && isset($expiredBody['error']) && !isset($expiredBody['user']), 'Expired-session response leaked identity or is missing an error field');
    echo "M2.2 expired-session-401 check passed\n";
} finally {
    stopBuiltinServer($handle);
}

echo "M2.2 session bootstrap check passed\n";
