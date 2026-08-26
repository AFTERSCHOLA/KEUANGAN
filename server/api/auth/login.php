<?php
declare(strict_types=1);
require_once __DIR__ . '/../../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
$body = requestJson();
$username = isset($body['username']) && is_string($body['username']) ? trim($body['username']) : '';
$password = isset($body['password']) && is_string($body['password']) ? $body['password'] : '';
if ($username === '' || $password === '') jsonResponse(['error' => 'Nama pengguna atau kata sandi salah'], 401);

$key = loginAttemptKey($username);
if (loginLocked($key)) jsonResponse(['error' => 'Nama pengguna atau kata sandi salah'], 401);

$stmt = database()->prepare('SELECT id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password, failed_login_count FROM users WHERE username = :username LIMIT 1');
$stmt->execute([':username' => $username]);
$row = $stmt->fetch();
$valid = is_array($row)
    && (bool) $row['active']
    && in_array($row['role'], ['superadmin', 'admin_cabang', 'trainer'], true)
    && password_verify($password, (string) $row['password_hash']);

if (!$valid) {
    registerLoginFailure($key);
    auditEvent('login_failed', null, 'user', null, ['usernameProvided' => $username !== '']);
    jsonResponse(['error' => 'Nama pengguna atau kata sandi salah'], 401);
}

clearLoginFailures($key);
$identity = [
    'id' => $row['id'],
    'username' => $row['username'],
    'displayName' => $row['display_name'],
    'role' => $row['role'],
    'cabangId' => $row['cabang_id'],
    'trainerId' => $row['trainer_id'],
    'active' => (bool) $row['active'],
    'mustChangePassword' => (bool) $row['must_change_password'],
];
$pdo = database();
$update = $pdo->prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = :id');
$update->execute([':id' => $row['id']]);
$identity = loginSession($identity);
auditEvent('login_succeeded', $identity, 'user', (string) $row['id']);
jsonResponse(['user' => $identity, 'csrfToken' => csrfToken()]);
