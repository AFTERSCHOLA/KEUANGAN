<?php
declare(strict_types=1);
require_once __DIR__ . '/../../bootstrap.php';

// AA.B.1 (D-AA2, D-AA5, D-AA6) — thin wrapper: 405 method gate ->
// cookie-session + CSRF auth (browser only, no Bearer mint) -> importable
// lib (server/auth/service-tokens.php) -> jsonResponse. Guard order:
// 405 method -> 401 auth -> 403 CSRF -> 422 body -> 403 scope -> 201/200.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
$caller = requireAuthenticatedUser();
requireCsrf();
$body = requestJson();
$action = isset($body['action']) && is_string($body['action']) ? $body['action'] : '';
if ($action === 'mint') {
    $result = serviceTokenMint($caller, $body, (string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    jsonResponse($result['body'], $result['status']);
}
if ($action === 'revoke') {
    $result = serviceTokenRevoke($caller, isset($body['prefix']) && is_string($body['prefix']) ? $body['prefix'] : '');
    jsonResponse($result['body'], $result['status']);
}
jsonResponse(['error' => 'Aksi tidak dikenal'], 422);
