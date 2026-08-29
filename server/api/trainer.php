<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/_master.php';

$user = requireAuthenticatedUser();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' || $method === 'PUT') {
    $data = requestJson();

    // cabangId authority depends on role (same pattern as sekolah.php).
    // Admin Cabang can only ever manage trainers in their own branch —
    // their session cabangId IS the authority, never the client's. Any
    // cabangId key present in the body is rejected outright, even if it
    // happens to match. Superadmin has no fixed branch and must name one
    // explicitly, validated against the cabang table.
    if (($user['role'] ?? null) === 'admin_cabang') {
        if (array_key_exists('cabangId', $data)) {
            jsonResponse(['error' => 'cabangId tidak boleh dikirim'], 422);
        }
        $cabangId = $user['cabangId'] ?? null;
        if (!is_string($cabangId) || $cabangId === '') {
            jsonResponse(['error' => 'Sesi tidak memiliki cabang yang valid'], 422);
        }
    } else {
        if (!isset($data['cabangId']) || !is_string($data['cabangId']) || trim($data['cabangId']) === '') {
            jsonResponse(['error' => 'Record membutuhkan cabangId'], 422);
        }
        $check = database()->prepare('SELECT 1 FROM cabang WHERE id = :id');
        $check->execute([':id' => $data['cabangId']]);
        if ($check->fetchColumn() === false) {
            jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
        }
        $cabangId = $data['cabangId'];
    }

    masterWrite('trainer', $user, record: $data, overrides: ['cabangId' => $cabangId]);
} elseif ($method === 'DELETE') {
    masterDelete('trainer', $user);
} else {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}