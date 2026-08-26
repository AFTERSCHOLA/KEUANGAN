<?php
declare(strict_types=1);
require_once __DIR__ . '/../../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
$user = requireAuthenticatedUser();
requireCsrf();
$body = requestJson();
$currentPassword = isset($body['currentPassword']) && is_string($body['currentPassword']) ? $body['currentPassword'] : '';
$newPassword = isset($body['newPassword']) && is_string($body['newPassword']) ? $body['newPassword'] : '';
if ($currentPassword === '' || $newPassword === '') jsonResponse(['error' => 'Kata sandi lama dan baru wajib diisi'], 422);

$stmt = database()->prepare('SELECT password_hash FROM users WHERE id = :id AND active = 1 LIMIT 1');
$stmt->execute([':id' => $user['id']]);
$hash = $stmt->fetchColumn();
if (!is_string($hash) || !password_verify($currentPassword, $hash)) jsonResponse(['error' => 'Kata sandi lama salah'], 401);
requirePasswordPolicy($newPassword);

$update = database()->prepare('UPDATE users SET password_hash = :password_hash, must_change_password = 0, failed_login_count = 0, locked_until = NULL WHERE id = :id');
$update->execute([':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT), ':id' => $user['id']]);
$user['mustChangePassword'] = false;
$identity = loginSession($user);
auditEvent('password_changed', $identity, 'user', (string) $user['id']);
jsonResponse(['user' => $identity, 'csrfToken' => csrfToken()]);
