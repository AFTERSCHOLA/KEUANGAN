<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/exportShell.php';
require_once __DIR__ . '/../lib/exportMatrix.php';

// EX.1 — Standalone attendance-matrix export document.
//
// POST {type:'rekap-pengajar', periode:'YYYY-MM', sekolahId?, settings?}
//   -> self-contained text/html matrix rendered from MySQL under the
//   caller's scope. Display-only settings travel in the body (D-IP2
//   precedent) and are never stored. Numbers are a read-only projection
//   of stored records; export never writes.
//
// Auth order mirrors invoices-doc.php:
//   405 method -> 401 auth -> 403 CSRF -> 422 body -> 404 unknown school
//   -> 403 scope -> bytes.

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

$data = requestJson();
$type = $data['type'] ?? null;
if ($type !== 'rekap-pengajar') {
    jsonResponse(['error' => 'tipe dokumen tidak didukung'], 422);
}
$periode = $data['periode'] ?? null;
if (!is_string($periode) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $periode)) {
    jsonResponse(['error' => 'periode harus format YYYY-MM'], 422);
}
$sekolahId = $data['sekolahId'] ?? null;
if ($sekolahId !== null && (!is_string($sekolahId) || trim($sekolahId) === '')) {
    jsonResponse(['error' => 'sekolahId tidak valid'], 422);
}
$sekolahId = is_string($sekolahId) ? trim($sekolahId) : null;

// --- settings snapshot: D-IP2 allowlist + caps, display-only ---------
$rawSettings = $data['settings'] ?? [];
if (!is_array($rawSettings)) jsonResponse(['error' => 'settings harus objek'], 422);
$settings = [];
foreach (['alamatUsaha', 'rekeningBank', 'rekeningNomor', 'rekeningAtasNama', 'penandatangan'] as $key) {
    $val = $rawSettings[$key] ?? null;
    if (is_string($val) && $val !== '') $settings[$key] = mb_substr($val, 0, 500);
}
foreach (['logoDataUrl' => 'logo', 'signatureDataUrl' => 'signature'] as $key => $label) {
    $val = $rawSettings[$key] ?? null;
    if (!is_string($val) || $val === '') continue;
    if (!preg_match('#^data:image/(png|jpeg|webp);base64,#', $val)) {
        jsonResponse(['error' => "$label harus gambar dataURL (png/jpeg/webp)"], 422);
    }
    if (strlen($val) > 700000) {
        jsonResponse(['error' => "$label terlalu besar (maks ~500KB)"], 422);
    }
    $settings[$key] = $val;
}

if (!roleCanReadEntity($user['role'] ?? '', 'absensiPengajar')) {
    jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
}

$pdo = database();

// --- school filter: unknown id -> 404 (before scope) -------------------
$sekolahFilter = null;
if ($sekolahId !== null) {
    $schStmt = $pdo->prepare('SELECT cabang_id, payload FROM sekolah WHERE id = :id');
    $schStmt->execute([':id' => $sekolahId]);
    $schRow = $schStmt->fetch();
    if ($schRow === false) {
        jsonResponse(['error' => 'Sekolah tidak ditemukan'], 404);
    }
    $sekolahFilter = json_decode((string) $schRow['payload'], true);
    if (!is_array($sekolahFilter)) $sekolahFilter = [];
    $sekolahFilter['id'] = $sekolahId;
    $sekolahFilter['cabangId'] = $sekolahFilter['cabangId'] ?? $schRow['cabang_id'];
}

// --- scope: branch isolation identical to the on-screen view -----------
$role = $user['role'];
$trainerId = $user['trainerId'] ?? null;
if ($role === 'admin_cabang') {
    if ($sekolahFilter !== null && ($sekolahFilter['cabangId'] ?? null) !== $user['cabangId']) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }
} elseif ($role === 'trainer') {
    if (!is_string($trainerId) || $trainerId === '') {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }
    if ($sekolahFilter !== null && !trainerAssignedToSekolah($trainerId, $sekolahId, $pdo)) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }
}

// --- rows: superadmin all, admin_cabang own branch (SQL scope, same as
// --- read.php bulk mode), trainer all rows then self-reads only --------
if ($role === 'admin_cabang') {
    $absStmt = $pdo->prepare('SELECT payload, correction_of FROM absensi_pengajar WHERE cabang_id = :c ORDER BY created_at, id');
    $absStmt->execute([':c' => $user['cabangId']]);
    $absRows = $absStmt->fetchAll();
    $schStmt = $pdo->prepare('SELECT payload FROM sekolah WHERE cabang_id = :c ORDER BY created_at, id');
    $schStmt->execute([':c' => $user['cabangId']]);
    $schRows = $schStmt->fetchAll();
    $trnStmt = $pdo->prepare('SELECT payload FROM trainer WHERE cabang_id = :c ORDER BY created_at, id');
    $trnStmt->execute([':c' => $user['cabangId']]);
    $trnRows = $trnStmt->fetchAll();
} else {
    $absRows = $pdo->query('SELECT payload, correction_of FROM absensi_pengajar ORDER BY created_at, id')->fetchAll();
    $schRows = $pdo->query('SELECT payload FROM sekolah ORDER BY created_at, id')->fetchAll();
    $trnRows = $pdo->query('SELECT payload FROM trainer ORDER BY created_at, id')->fetchAll();
}

$absensi = [];
foreach ($absRows as $row) {
    if (!is_array($row)) continue;
    $payload = json_decode((string) ($row['payload'] ?? ''), true);
    if (!is_array($payload)) continue;
    // correction_of lives in its own column (read.php idiom); the
    // payload key is the fallback for rows written without it.
    if (!isset($payload['correctionOf']) && ($row['correction_of'] ?? null) !== null) {
        $payload['correctionOf'] = $row['correction_of'];
    }
    if ($role === 'trainer' && ($payload['trainerId'] ?? null) !== $trainerId) continue;
    if ($sekolahId !== null && ($payload['sekolahId'] ?? null) !== $sekolahId) continue;
    $absensi[] = $payload;
}

if ($role === 'trainer') {
    // Self-reads only: the trainer's own record plus the schools their
    // own rows point at (same visible set as readCached, no wider).
    $sekolah = [];
    $wantedSchools = [];
    foreach ($absensi as $rec) {
        $sid = $rec['sekolahId'] ?? null;
        if (is_string($sid) && $sid !== '') $wantedSchools[$sid] = true;
    }
    foreach ($schRows as $row) {
        if (!is_array($row)) continue;
        $payload = json_decode((string) ($row['payload'] ?? ''), true);
        if (!is_array($payload) || !isset($wantedSchools[(string) ($payload['id'] ?? '')])) continue;
        $sekolah[] = $payload;
    }
    $trainer = [];
    foreach ($trnRows as $row) {
        if (!is_array($row)) continue;
        $payload = json_decode((string) ($row['payload'] ?? ''), true);
        if (is_array($payload) && ($payload['id'] ?? null) === $trainerId) $trainer[] = $payload;
    }
} else {
    $sekolah = [];
    foreach ($schRows as $row) {
        if (!is_array($row)) continue;
        $payload = json_decode((string) ($row['payload'] ?? ''), true);
        if (is_array($payload)) $sekolah[] = $payload;
    }
    $trainer = [];
    foreach ($trnRows as $row) {
        if (!is_array($row)) continue;
        $payload = json_decode((string) ($row['payload'] ?? ''), true);
        if (is_array($payload)) $trainer[] = $payload;
    }
}

$matrix = buildExportMatrix($absensi, $sekolah, $trainer, $periode);
$html = renderExportMatrix($matrix, [
    'heading' => $sekolahFilter !== null
        ? ((isset($sekolahFilter['nama']) && $sekolahFilter['nama'] !== '') ? (string) $sekolahFilter['nama'] : 'Sekolah tidak ditemukan')
        : 'Semua Sekolah',
]);
$filename = 'Rekap_Pengajar_' . $periode . '.html';

http_response_code(200);
header('Content-Type: text/html; charset=utf-8');
header('Content-Disposition: inline; filename="' . $filename . '"');
header('Content-Length: ' . strlen($html));
echo $html;
exit;
