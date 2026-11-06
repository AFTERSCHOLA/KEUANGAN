<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

/**
 * server/tests/forgot-password.lifecycle.php
 *
 * Full lifecycle test for forgot-password.php and reset-password.php:
 * 1. Method rejection (GET -> 405)
 * 2. Validation of empty identity (422)
 * 3. Non-existent identity (404)
 * 4. User without email registered (422 with guidance to contact Superadmin)
 * 5. Inactive user lookup (404)
 * 6. Valid user with email receives reset token, 1-hour expiry, audit log, outbox email
 * 7. Reset password validation:
 *    - Empty token or password (422)
 *    - Invalid token (422)
 *    - Expired token (422, "kedaluwarsa")
 *    - Weak/short password violating password policy (422)
 * 8. Successful password reset:
 *    - Clears token hash and expiry
 *    - Clears must_change_password, login failures, lockout
 *    - Logs password_reset_completed audit event
 *    - User immediately authenticates via login.php with new password
 */

$testFailures = 0;
$testTotal = 0;

function check(bool $condition, string $message): void {
    global $testFailures, $testTotal;
    $testTotal++;
    if (!$condition) {
        $testFailures++;
        echo "  FAIL: {$message}\n";
        throw new RuntimeException($message);
    }
    echo "  OK: {$message}\n";
}

if (!extension_loaded('curl')) {
    fwrite(STDERR, "php-curl extension is required to run this test\n");
    exit(1);
}

function findFreePort(): int {
    $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if ($socket === false) {
        throw new RuntimeException("Could not allocate a free port: {$errstr}");
    }
    $name = stream_socket_get_name($socket, false);
    fclose($socket);
    $parts = explode(':', $name);
    return (int) end($parts);
}

function startBuiltinServer(string $docroot, int $port): array {
    $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open(
        sprintf('%s -S 127.0.0.1:%d -t %s', escapeshellarg(PHP_BINARY), $port, escapeshellarg($docroot)),
        $descriptors,
        $pipes
    );
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start PHP built-in server');
    }
    foreach ($pipes as $pipe) stream_set_blocking($pipe, false);
    $childPid = proc_get_status($process)['pid'] ?? 0;

    $deadline = microtime(true) + 5.0;
    $up = false;
    while (microtime(true) < $deadline) {
        $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
        if ($conn) { fclose($conn); $up = true; break; }
        usleep(100000);
    }
    if (!$up) {
        throw new RuntimeException('PHP built-in server did not become ready in time');
    }
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
    if ($response === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('curl request failed: ' . $err);
    }
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

function seedUser(PDO $pdo, array $overrides = []): array {
    $suffix = bin2hex(random_bytes(4));
    $plainPassword = 'InitPass' . random_int(100000, 999999) . '!';
    $user = array_merge([
        'id' => 'usr-pwtest-' . $suffix,
        'username' => 'pwtest.' . $suffix,
        'display_name' => 'Password Test User ' . $suffix,
        'email' => 'pwtest.' . $suffix . '@example.com',
        'role' => 'trainer',
        'cabang_id' => 'cbg-test-' . $suffix,
        'trainer_id' => 'trn-test-' . $suffix,
        'active' => 1,
        'must_change_password' => 1,
    ], $overrides);

    $stmt = $pdo->prepare(
        'INSERT INTO users (id, username, display_name, email, password_hash, role, cabang_id, trainer_id, active, must_change_password)
         VALUES (:id, :username, :display_name, :email, :password_hash, :role, :cabang_id, :trainer_id, :active, :must_change_password)'
    );
    $stmt->execute([
        ':id' => $user['id'],
        ':username' => $user['username'],
        ':display_name' => $user['display_name'],
        ':email' => $user['email'],
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

echo "=== forgot-password.lifecycle.php ===\n";

$docroot = realpath(__DIR__ . '/..');
if ($docroot === false) {
    fwrite(STDERR, "Could not resolve server docroot\n");
    exit(1);
}

$port = findFreePort();
$handle = startBuiltinServer($docroot, $port);
$base = "http://127.0.0.1:{$port}";
$pdo = database();

$seededUserIds = [];

try {
    // -------------------------------------------------------------
    // Test 1: Method rejection (GET -> 405)
    // -------------------------------------------------------------
    echo "\n--- Test 1: Method Rejection (GET -> 405) ---\n";
    $resForgotGet = httpGet("{$base}/api/auth/forgot-password.php");
    check($resForgotGet['status'] === 405, 'GET /api/auth/forgot-password.php returns 405');

    $resResetGet = httpGet("{$base}/api/auth/reset-password.php");
    check($resResetGet['status'] === 405, 'GET /api/auth/reset-password.php returns 405');

    // -------------------------------------------------------------
    // Test 2: Empty identity validation (422)
    // -------------------------------------------------------------
    echo "\n--- Test 2: Empty identity validation (422) ---\n";
    $resEmpty = httpPost("{$base}/api/auth/forgot-password.php", ['identity' => '   ']);
    check($resEmpty['status'] === 422, 'Empty identity returns 422');
    $bodyEmpty = json_decode($resEmpty['body'], true);
    check(($bodyEmpty['error'] ?? '') === 'Username atau email wajib diisi', 'Empty identity gives Indonesian error message');

    // -------------------------------------------------------------
    // Test 3: Non-existent identity returns 404
    // -------------------------------------------------------------
    echo "\n--- Test 3: Non-existent identity (404) ---\n";
    $resNotFound = httpPost("{$base}/api/auth/forgot-password.php", ['identity' => 'nonexistent_user_99999']);
    check($resNotFound['status'] === 404, 'Non-existent identity returns 404');
    $bodyNotFound = json_decode($resNotFound['body'], true);
    check(($bodyNotFound['error'] ?? '') === 'Pengguna tidak ditemukan', 'Not found returns standard Indonesian error message');

    // -------------------------------------------------------------
    // Test 4: Inactive user returns 404 (not found)
    // -------------------------------------------------------------
    echo "\n--- Test 4: Inactive user (404) ---\n";
    $inactiveUser = seedUser($pdo, ['active' => 0]);
    $seededUserIds[] = $inactiveUser['id'];
    $resInactive = httpPost("{$base}/api/auth/forgot-password.php", ['identity' => $inactiveUser['username']]);
    check($resInactive['status'] === 404, 'Inactive user returns 404');

    // -------------------------------------------------------------
    // Test 5: User without email returns 422 with guidance
    // -------------------------------------------------------------
    echo "\n--- Test 5: User without email returns 422 ---\n";
    $noEmailUser = seedUser($pdo, ['email' => null]);
    $seededUserIds[] = $noEmailUser['id'];
    $resNoEmail = httpPost("{$base}/api/auth/forgot-password.php", ['identity' => $noEmailUser['username']]);
    check($resNoEmail['status'] === 422, 'User without email returns 422');
    $bodyNoEmail = json_decode($resNoEmail['body'], true);
    check(
        ($bodyNoEmail['error'] ?? '') === 'Akun ini belum memiliki email terdaftar. Silakan hubungi Superadmin untuk mereset kata sandi.',
        'User without email returns Superadmin guidance error'
    );

    // -------------------------------------------------------------
    // Test 6: Successful forgot password request
    // -------------------------------------------------------------
    echo "\n--- Test 6: Successful forgot password request ---\n";
    $validUser = seedUser($pdo);
    $seededUserIds[] = $validUser['id'];

    // Track mail outbox size before request
    $outboxPath = __DIR__ . '/../data/mail_outbox.log';
    $outboxBefore = is_file($outboxPath) ? (string) file_get_contents($outboxPath) : '';

    $resForgot = httpPost("{$base}/api/auth/forgot-password.php", ['identity' => $validUser['username']]);
    check($resForgot['status'] === 200, 'Valid request returns 200');
    $bodyForgot = json_decode($resForgot['body'], true);
    check(($bodyForgot['ok'] ?? false) === true, 'Response contains ok: true');
    check(
        ($bodyForgot['message'] ?? '') === 'Tautan reset kata sandi telah dikirim ke email terdaftar.',
        'Response contains success message'
    );

    // Verify token hash and expiration in database
    $userRow = $pdo->query("SELECT reset_token_hash, reset_token_expires_at FROM users WHERE id = '{$validUser['id']}'")->fetch();
    check(!empty($userRow['reset_token_hash']), 'Database updated with reset_token_hash');
    check(strlen((string)$userRow['reset_token_hash']) === 64, 'Token hash is 64 hex characters (SHA-256)');
    check(!empty($userRow['reset_token_expires_at']), 'Database updated with reset_token_expires_at');
    $expiresDiff = strtotime((string)$userRow['reset_token_expires_at']) - time();
    check($expiresDiff >= 3500 && $expiresDiff <= 3650, "reset_token_expires_at is approximately 1 hour in the future ({$expiresDiff}s)");

    // Verify audit log
    $auditRow = $pdo->query("SELECT event_type, target_type, target_id FROM audit_log WHERE event_type = 'password_reset_requested' AND target_id = '{$validUser['id']}' ORDER BY id DESC LIMIT 1")->fetch();
    check(!empty($auditRow), 'auditEvent password_reset_requested recorded');

    // Verify mail dispatch (outbox log updated with reset token link)
    $outboxAfter = is_file($outboxPath) ? (string) file_get_contents($outboxPath) : '';
    $newOutboxContent = substr($outboxAfter, strlen($outboxBefore));
    check(strpos($newOutboxContent, $validUser['email']) !== false, 'Email outbox contains recipient email');
    check(strpos($newOutboxContent, 'Reset Kata Sandi - Afterschola') !== false, 'Email outbox contains reset subject');
    check(preg_match('/resetToken=([a-f0-9]{64})/', $newOutboxContent, $tokenMatches) === 1, 'Email outbox contains 64-char hex resetToken');
    $rawToken = $tokenMatches[1] ?? '';
    check(hash('sha256', $rawToken) === $userRow['reset_token_hash'], 'Extracted raw token matches stored SHA-256 hash');

    // Verify request by email works identically
    $validUser2 = seedUser($pdo);
    $seededUserIds[] = $validUser2['id'];
    $resForgotByEmail = httpPost("{$base}/api/auth/forgot-password.php", ['identity' => $validUser2['email']]);
    check($resForgotByEmail['status'] === 200, 'Requesting by email returns 200');

    // -------------------------------------------------------------
    // Test 7: Reset password validation
    // -------------------------------------------------------------
    echo "\n--- Test 7: Reset password validation ---\n";
    // 7.1 Empty token or password
    $resResetEmpty = httpPost("{$base}/api/auth/reset-password.php", ['token' => '', 'newPassword' => '']);
    check($resResetEmpty['status'] === 422, 'Empty reset params returns 422');
    $bodyResetEmpty = json_decode($resResetEmpty['body'], true);
    check(($bodyResetEmpty['error'] ?? '') === 'Token dan kata sandi baru wajib diisi', 'Empty reset params returns validation message');

    // 7.2 Invalid token
    $resInvalidToken = httpPost("{$base}/api/auth/reset-password.php", [
        'token' => 'invalid_token_1234567890abcdef',
        'newPassword' => 'NewStrongPass123!',
    ]);
    check($resInvalidToken['status'] === 422, 'Invalid token returns 422');
    $bodyInvalidToken = json_decode($resInvalidToken['body'], true);
    check(($bodyInvalidToken['error'] ?? '') === 'Token reset kata sandi tidak valid', 'Invalid token returns invalid error message');

    // 7.3 Expired token
    $pdo->prepare('UPDATE users SET reset_token_expires_at = :exp WHERE id = :id')
        ->execute([':exp' => date('Y-m-d H:i:s', time() - 300), ':id' => $validUser['id']]);
    $resExpired = httpPost("{$base}/api/auth/reset-password.php", [
        'token' => $rawToken,
        'newPassword' => 'NewStrongPass123!',
    ]);
    check($resExpired['status'] === 422, 'Expired token returns 422');
    $bodyExpired = json_decode($resExpired['body'], true);
    check(
        strpos($bodyExpired['error'] ?? '', 'kedaluwarsa') !== false,
        'Expired token returns error message containing "kedaluwarsa"'
    );

    // 7.4 Password policy violation
    // Restore valid expiration
    $pdo->prepare('UPDATE users SET reset_token_expires_at = :exp WHERE id = :id')
        ->execute([':exp' => date('Y-m-d H:i:s', time() + 3600), ':id' => $validUser['id']]);

    // Too short / no uppercase / no digit
    $resWeak = httpPost("{$base}/api/auth/reset-password.php", [
        'token' => $rawToken,
        'newPassword' => 'weak',
    ]);
    check($resWeak['status'] === 422, 'Weak password returns 422');
    $bodyWeak = json_decode($resWeak['body'], true);
    check(strpos($bodyWeak['error'] ?? '', 'minimal 12 karakter') !== false, 'Weak password triggers password policy error');

    // -------------------------------------------------------------
    // Test 8: Successful reset password lifecycle & immediate login
    // -------------------------------------------------------------
    echo "\n--- Test 8: Successful reset password lifecycle ---\n";
    $newPassword = 'NewSecretPassword2026!';
    $resSuccess = httpPost("{$base}/api/auth/reset-password.php", [
        'token' => $rawToken,
        'newPassword' => $newPassword,
    ]);
    check($resSuccess['status'] === 200, 'Valid reset returns 200');
    $bodySuccess = json_decode($resSuccess['body'], true);
    check(($bodySuccess['ok'] ?? false) === true, 'Reset response contains ok: true');
    check(
        ($bodySuccess['message'] ?? '') === 'Kata sandi berhasil diperbarui. Silakan masuk.',
        'Reset response contains success message'
    );

    // Verify database updates on user row
    $updatedUser = $pdo->query("SELECT password_hash, reset_token_hash, reset_token_expires_at, must_change_password, failed_login_count, locked_until FROM users WHERE id = '{$validUser['id']}'")->fetch();
    check(empty($updatedUser['reset_token_hash']), 'reset_token_hash cleared to NULL');
    check(empty($updatedUser['reset_token_expires_at']), 'reset_token_expires_at cleared to NULL');
    check((int)$updatedUser['must_change_password'] === 0, 'must_change_password reset to 0');
    check((int)$updatedUser['failed_login_count'] === 0, 'failed_login_count cleared to 0');
    check(empty($updatedUser['locked_until']), 'locked_until cleared to NULL');
    check(password_verify($newPassword, (string)$updatedUser['password_hash']), 'New password hash verifies against newPassword');

    // Verify audit log for reset completion
    $auditCompleted = $pdo->query("SELECT event_type, target_type, target_id FROM audit_log WHERE event_type = 'password_reset_completed' AND target_id = '{$validUser['id']}' ORDER BY id DESC LIMIT 1")->fetch();
    check(!empty($auditCompleted), 'auditEvent password_reset_completed recorded');

    // Verify token cannot be reused
    $resReuse = httpPost("{$base}/api/auth/reset-password.php", [
        'token' => $rawToken,
        'newPassword' => 'AnotherNewPass2026!',
    ]);
    check($resReuse['status'] === 422, 'Consumed token cannot be reused (returns 422)');

    // Verify immediate login with the new password
    $resLogin = httpPost("{$base}/api/auth/login.php", [
        'username' => $validUser['username'],
        'password' => $newPassword,
    ]);
    check($resLogin['status'] === 200, 'Immediate login with new password returns 200');
    $bodyLogin = json_decode($resLogin['body'], true);
    check(isset($bodyLogin['user']) && ($bodyLogin['user']['id'] ?? '') === $validUser['id'], 'Login returned valid user identity');
    check(($bodyLogin['user']['mustChangePassword'] ?? true) === false, 'mustChangePassword is false');

    echo "\nAll checks passed successfully!\n";
} finally {
    stopBuiltinServer($handle);
    if (!empty($seededUserIds)) {
        $in = implode("','", array_map('addslashes', $seededUserIds));
        $pdo->exec("DELETE FROM users WHERE id IN ('{$in}')");
        $pdo->exec("DELETE FROM audit_log WHERE target_id IN ('{$in}')");
    }
}
