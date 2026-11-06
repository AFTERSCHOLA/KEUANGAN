<?php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

$body = requestJson();
$token = isset($body['token']) && is_string($body['token']) ? trim($body['token']) : '';
$newPassword = isset($body['newPassword']) && is_string($body['newPassword']) ? $body['newPassword'] : '';

if ($token === '' || $newPassword === '') {
    jsonResponse(['error' => 'Token dan kata sandi baru wajib diisi'], 422);
}

$hash = hash('sha256', $token);
$pdo = database();
$stmt = $pdo->prepare('SELECT id, username, reset_token_expires_at FROM users WHERE active = 1 AND reset_token_hash = :hash LIMIT 1');
$stmt->execute([':hash' => $hash]);
$user = $stmt->fetch();

if (!$user) {
    jsonResponse(['error' => 'Token reset kata sandi tidak valid'], 422);
}

if (empty($user['reset_token_expires_at']) || strtotime((string)$user['reset_token_expires_at']) <= time()) {
    jsonResponse(['error' => 'Permintaan reset kata sandi sudah kedaluwarsa. Silakan ajukan ulang.'], 422);
}

requirePasswordPolicy($newPassword);

$update = $pdo->prepare('UPDATE users SET password_hash = :pwd, reset_token_hash = NULL, reset_token_expires_at = NULL, must_change_password = 0, failed_login_count = 0, locked_until = NULL WHERE id = :id');
$update->execute([
    ':pwd' => password_hash($newPassword, PASSWORD_DEFAULT),
    ':id' => $user['id'],
]);

clearLoginFailures(loginAttemptKey((string)$user['username']));
auditEvent('password_reset_completed', null, 'user', (string)$user['id']);

jsonResponse([
    'ok' => true,
    'message' => 'Kata sandi berhasil diperbarui. Silakan masuk.',
]);
