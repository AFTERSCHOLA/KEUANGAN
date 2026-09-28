<?php
declare(strict_types=1);
require_once __DIR__ . '/../../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
$user = requireAuthenticatedUser();
requireCsrf();
auditEvent('logout', $user, 'user', (string) $user['id']);
// D-RM5 — explicit logout revokes persistence: the remember cookie (if
// any) resurrects nothing afterwards. Read the cookie before the session
// teardown below.
revokeRememberToken();
invalidateSession();
jsonResponse(['ok' => true]);
