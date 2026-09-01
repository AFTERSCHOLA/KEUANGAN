<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireAuthorization('manage_backup', 'backups', [], $user);

$pdo = database();
$rows = $pdo->query('SELECT id, checksum, created_by, created_at, verified_at FROM backups ORDER BY created_at DESC')->fetchAll();

jsonResponse(['backups' => $rows], 200);