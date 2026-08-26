<?php
declare(strict_types=1);
require_once __DIR__ . '/../../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
$user = requireAuthenticatedUser();
requireCsrf();
auditEvent('logout', $user, 'user', (string) $user['id']);
invalidateSession();
jsonResponse(['ok' => true]);
