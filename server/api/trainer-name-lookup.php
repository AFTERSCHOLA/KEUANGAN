<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

// ============================================================
// GET /api/trainer-name-lookup.php?ids=id1,id2,id3
//
// Konteks: PenugasanManager/PenugasanTimetable menampilkan nama asisten
// dari penugasan lintas-cabang (keputusan bisnis: asisten BOLEH dari
// cabang lain). readCached('trainer') di client di-scope per-cabang
// (isWithinScope() di store.js), jadi trainer dari cabang lain tidak
// pernah ada di cache lokal admin_cabang — nama-nya tidak bisa
// di-resolve secara lokal, muncul fallback "Trainer tidak ditemukan".
//
// Endpoint ini SENGAJA cuma balikin {id, nama} — TIDAK ada field
// sensitif lain (honor, wa, sekolahIds, cabangId) — supaya admin_cabang
// tidak bisa dipakai buat mengintip data trainer cabang lain di luar
// nama, walau mereka legitimately butuh resolve nama buat tampilan
// asisten lintas-cabang yang sudah disetujui.
// ============================================================

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();

// Trainer BUTUH ini juga: readCached('trainer') buat role trainer cuma
// balikin diri sendiri (isWithinScope() store.js), jadi trainer perlu
// resolve nama instruktur/asisten rekan kerjanya lewat endpoint ini
// saat lihat PenugasanTimetable (jadwal penugasan gabungan).
if (!in_array($user['role'] ?? null, ['admin_cabang', 'superadmin', 'trainer'], true)) {
    jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
}

$idsParam = $_GET['ids'] ?? '';
if (!is_string($idsParam) || trim($idsParam) === '') {
    jsonResponse([]);
}

$ids = array_values(array_filter(array_map('trim', explode(',', $idsParam)), static fn (string $id) => $id !== ''));
if (empty($ids)) {
    jsonResponse([]);
}

// Batas wajar per request — mencegah payload query yang tidak masuk akal.
if (count($ids) > 200) {
    jsonResponse(['error' => 'Terlalu banyak id sekaligus'], 422);
}

$pdo = database();
$placeholders = implode(',', array_fill(0, count($ids), '?'));
$stmt = $pdo->prepare("SELECT id, payload FROM trainer WHERE id IN ({$placeholders})");
$stmt->execute($ids);

$output = [];
while ($row = $stmt->fetch()) {
    $payload = json_decode($row['payload'], true);
    if (!is_array($payload)) continue;
    $output[] = [
        'id' => $row['id'],
        'nama' => $payload['nama'] ?? '(tanpa nama)',
    ];
}

jsonResponse($output);