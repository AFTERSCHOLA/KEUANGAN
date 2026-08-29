<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/_master.php';

// Must match defaultCabang().id in src/lib/constants.js (DEFAULT_CABANG_KODE
// = 'PST'). Duplicated across languages deliberately — same tradeoff as any
// other cross-language constant here — not read from a shared source.
const DEFAULT_CABANG_ID = 'cbg-PST-default';

$user = requireAuthenticatedUser();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'DELETE') {
    $body = requestJson();
    $id = isset($body['id']) && is_string($body['id']) ? trim($body['id']) : trim((string) ($_GET['id'] ?? ''));
    if ($id === DEFAULT_CABANG_ID) {
        jsonResponse(['error' => 'Cabang default (seed) tidak bisa dihapus — cabang ini dipakai sebagai fallback sistem'], 422);
    }
    masterDelete('cabang', $user, isCabang: true);
} elseif ($method === 'POST' || $method === 'PUT') {
    $data = requestJson();

    if (!isset($data['id']) || !is_string($data['id']) || trim($data['id']) === '') {
        jsonResponse(['error' => 'Record membutuhkan id'], 422);
    }
    if (!isset($data['nama']) || !is_string($data['nama']) || trim($data['nama']) === '') {
        jsonResponse(['error' => 'Nama cabang tidak boleh kosong'], 422);
    }
    if (!isset($data['kode']) || !is_string($data['kode']) || trim($data['kode']) === '') {
        jsonResponse(['error' => 'Kode cabang tidak boleh kosong'], 422);
    }
    $kode = strtoupper(trim($data['kode']));

    // Proactive check first (matches BranchManager.jsx's own UX — a
    // specific, named error) — the UNIQUE KEY constraint on `kode`
    // (schema.sql) is the backstop for a concurrent request racing past
    // this check, not the primary guard.
    $dupeStmt = database()->prepare('SELECT id, nama FROM cabang WHERE kode = :kode AND id != :id');
    $dupeStmt->execute([':kode' => $kode, ':id' => $data['id']]);
    $dupe = $dupeStmt->fetch();
    if ($dupe !== false) {
        jsonResponse(['error' => "Kode \"$kode\" sudah dipakai cabang \"{$dupe['nama']}\". Pilih kode lain."], 422);
    }

    masterWrite('cabang', $user, isCabang: true, record: $data, overrides: ['kode' => $kode]);
} else {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}