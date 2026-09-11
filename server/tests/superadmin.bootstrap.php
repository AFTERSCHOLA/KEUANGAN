<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

/**
 * M2.4 verifies:
 *   - bootstrap creates a password hash (not plaintext)
 *   - a matching audit_log row is written for the bootstrap event
 *   - a second bootstrap attempt is refused (no duplicate superadmin)
 *   - the created account completes the normal login lifecycle
 *
 * create-superadmin.php enforces "exactly one superadmin, ever" as a
 * permanent system invariant, so this test cannot freely create/delete
 * throwaway superadmin rows the way M2.1-M2.3 do with regular users.
 *
 *   - No superadmin exists yet: the full VERIFY runs against a REAL first
 *     superadmin, created and left in place afterwards (this IS the
 *     intended one-time bootstrap). Credentials are printed at the end.
 *   - A superadmin already exists: only duplicate-refusal is re-verified.
 */

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

function runCli(array $args): array {
    $cmd = array_merge([PHP_BINARY, __DIR__ . '/../bin/create-superadmin.php'], $args);
    $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open($cmd, $descriptors, $pipes);
    check(is_resource($process), 'Could not start create-superadmin.php');
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);
    return ['exitCode' => $exitCode, 'stdout' => $stdout, 'stderr' => $stderr];
}

function findFreePort(): int {
    $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    check($socket !== false, "Could not allocate a free port: {$errstr}");
    $name = stream_socket_get_name($socket, false);
    fclose($socket);
    $parts = explode(':', $name);
    return (int) end($parts);
}

function httpRequest(string $method, string $url, array $headers = [], ?string $jsonBody = null): array {
    $ch = curl_init($url);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_HTTPHEADER => $headers,
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

function extractCookieValue(array $headers, string $cookieName): ?string {
    foreach ($headers as $header) {
        if (stripos($header, 'Set-Cookie:') !== 0) continue;
        if (preg_match('/' . preg_quote($cookieName, '/') . '=([^;]+)/', $header, $m) === 1) return $m[1];
    }
    return null;
}

$pdo = database();
$config = serverConfig();
$cookieName = (string) ($config['session_name'] ?? 'afterschola_session');

$existingCount = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'superadmin'")->fetchColumn();

if ($existingCount === 0) {
    echo "M2.4: no superadmin exists yet — running the full bootstrap verification.\n";

    $username = 'superadmin.' . bin2hex(random_bytes(4)) . '@dev.test';
    $displayName = 'M2.4 Bootstrap Superadmin';
    $password = 'BootstrapPass' . random_int(100000, 999999) . 'X';

    // NOTE: --password uses getopt's optional-value long option syntax
    // (password::), which only binds via the attached "--password=value"
    // form. A space-separated "--password value" would NOT bind and the
    // script would fall through to its interactive stty prompt instead.
    $result = runCli(['--username', $username, '--display-name', $displayName, '--password=' . $password]);
    check($result['exitCode'] === 0, "First bootstrap expected exit 0, got {$result['exitCode']}. stderr: {$result['stderr']}");

    $stmt = $pdo->prepare('SELECT id, password_hash, role FROM users WHERE username = :username LIMIT 1');
    $stmt->execute([':username' => $username]);
    $row = $stmt->fetch();
    check(is_array($row), 'No user row found after bootstrap');
    check($row['role'] === 'superadmin', 'Bootstrapped user does not have role superadmin');
    check($row['password_hash'] !== $password, 'Password stored in plaintext, not hashed');
    check(password_verify($password, (string) $row['password_hash']), 'Stored password_hash does not verify against the bootstrap password');
    $userId = $row['id'];
    echo "M2.4 hash-creation check passed\n";

    $auditStmt = $pdo->prepare("SELECT COUNT(*) FROM audit_log WHERE event_type = 'superadmin_bootstrap' AND target_id = :target_id");
    $auditStmt->execute([':target_id' => $userId]);
    check(((int) $auditStmt->fetchColumn()) >= 1, 'No audit_log row recorded for superadmin_bootstrap');
    echo "M2.4 audit-event check passed\n";

    // --- Part 2: refuses duplicate initial setup ---
    $second = runCli(['--username', 'second.' . bin2hex(random_bytes(4)) . '@dev.test', '--display-name', 'Should Not Be Created', '--password=AnotherPass' . random_int(100000, 999999) . 'X']);
    check($second['exitCode'] !== 0, 'Second bootstrap attempt unexpectedly succeeded');
    $countAfter = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'superadmin'")->fetchColumn();
    check($countAfter === 1, "Expected exactly 1 superadmin after duplicate attempt, found {$countAfter}");
    echo "M2.4 duplicate-refusal check passed\n";

    // --- Part 3: the account completes the login lifecycle ---
    $port = findFreePort();
    $docroot = realpath(__DIR__ . '/..');
    $process = proc_open(
        sprintf('%s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $port, escapeshellarg($docroot)),
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes
    );
    check(is_resource($process), 'Could not start built-in server for login-lifecycle check');
    $cliServerPid = proc_get_status($process)['pid'] ?? 0;
    $ready = false;
    for ($i = 0; $i < 40; $i++) {
        $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
        if ($conn) { fclose($conn); $ready = true; break; }
        usleep(100000);
    }
    check($ready, 'Built-in server did not become ready for login-lifecycle check');

    try {
        $base = "http://127.0.0.1:{$port}/api/auth";
        $login = httpRequest('POST', "{$base}/login.php", [], json_encode(['username' => $username, 'password' => $password]));
        check($login['status'] === 200, "Bootstrap account login expected 200, got {$login['status']}. body={$login['body']}");
        $loginBody = json_decode($login['body'], true);
        check(($loginBody['user']['role'] ?? null) === 'superadmin', 'Logged-in identity role is not superadmin');
        check(!array_key_exists('password', $loginBody['user']) && !array_key_exists('password_hash', $loginBody['user']), 'Login response leaked a password field');

        $sessionId = extractCookieValue($login['headers'], $cookieName);
        check($sessionId !== null, 'Login did not set a session cookie');
        $csrfToken = (string) ($loginBody['csrfToken'] ?? '');
        check($csrfToken !== '', 'Login response missing csrfToken');

        $me = httpRequest('GET', "{$base}/me.php", ["Cookie: {$cookieName}={$sessionId}"]);
        check($me['status'] === 200, "Authenticated me.php expected 200, got {$me['status']}");

        $logout = httpRequest('POST', "{$base}/logout.php", ["Cookie: {$cookieName}={$sessionId}", "X-CSRF-Token: {$csrfToken}"]);
        check($logout['status'] === 200, "Logout expected 200, got {$logout['status']}");

        $afterLogout = httpRequest('GET', "{$base}/me.php", ["Cookie: {$cookieName}={$sessionId}"]);
        check($afterLogout['status'] === 401, "Session must be invalid after logout, got {$afterLogout['status']}");
    } finally {
        // Windows-safe reaping: kill the whole process tree so no
        // orphan php.exe survives (proc_terminate alone can leave
        // the child behind on Win32).
        if (PHP_OS_FAMILY === 'Windows' && (int) $cliServerPid > 0) {
            @exec('taskkill /PID ' . (int) $cliServerPid . ' /T /F 2>NUL');
        }
        @proc_terminate($process);
        @proc_close($process);
    }
    echo "M2.4 login-lifecycle check passed\n";

    echo "\n";
    echo "M2.4: a real superadmin account now exists in this database (this is\n";
    echo "permanent by design — only one may ever be bootstrapped). Credentials\n";
    echo "for your own future use:\n";
    echo "  username: {$username}\n";
    echo "  password: {$password}\n";
    echo "\n";
} else {
    echo "M2.4: a superadmin already exists ({$existingCount} found) — skipping\n";
    echo "hash-creation and login-lifecycle checks (this test has no way to know\n";
    echo "an existing account's password). Re-verifying duplicate-refusal only.\n";

    $result = runCli(['--username', 'dup.' . bin2hex(random_bytes(4)) . '@dev.test', '--display-name', 'Should Not Be Created', '--password=AnotherPass' . random_int(100000, 999999) . 'X']);
    check($result['exitCode'] !== 0, 'Bootstrap attempt unexpectedly succeeded despite an existing superadmin');
    $countAfter = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'superadmin'")->fetchColumn();
    check($countAfter === $existingCount, "Superadmin count changed ({$existingCount} -> {$countAfter}) after a refused bootstrap attempt");
    echo "M2.4 duplicate-refusal check passed\n";
}

echo "M2.4 superadmin bootstrap check passed\n";