<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/_master.php';
 
$user = requireAuthenticatedUser();
$method = $_SERVER['REQUEST_METHOD'];
 
if ($method === 'POST' || $method === 'PUT') {
    $data = requestJson();
 
    // cabangId is never trusted from the client for any action — see
    // PRODUCTION_MILESTONES.md "siswa.cabangId — server derive, LOCKED".
    if (array_key_exists('cabangId', $data)) {
        jsonResponse(['error' => 'cabangId tidak boleh dikirim — diturunkan otomatis dari sekolahId'], 422);
    }
    if (!isset($data['sekolahId']) || !is_string($data['sekolahId']) || trim($data['sekolahId']) === '') {
        jsonResponse(['error' => 'Record membutuhkan sekolahId'], 422);
    }
 
    $stmt = database()->prepare('SELECT cabang_id FROM sekolah WHERE id = :id');
    $stmt->execute([':id' => $data['sekolahId']]);
    $newCabangId = $stmt->fetchColumn();
    if ($newCabangId === false) {
        jsonResponse(['error' => 'sekolahId tidak ditemukan'], 422);
    }
 
    masterWrite('siswa', $user, record: $data, overrides: ['cabangId' => $newCabangId]);
} elseif ($method === 'DELETE') {
    masterDelete('siswa', $user);
} else {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}
 