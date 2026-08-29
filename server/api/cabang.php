<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

// Must match defaultCabang().id in src/lib/constants.js (DEFAULT_CABANG_KODE
// = 'PST'). Duplicated across languages deliberately — same tradeoff as any
// other cross-language constant here — not read from a shared source.
const DEFAULT_CABANG_ID = 'cbg-PST-default';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

$data = requestJson();
$action = $data['action'] ?? 'create';
if (!in_array($action, ['create', 'update', 'delete'], true)) {
    jsonResponse(['error' => 'Operasi tidak didukung'], 400);
}

if (!isset($data['id']) || !is_string($data['id']) || trim($data['id']) === '') {
    jsonResponse(['error' => 'Record membutuhkan id'], 422);
}

$pdo = database();

// authorize.php already denies create/update/delete on resource 'cabang'
// for every non-superadmin role unconditionally (M3.1 fix: admin_cabang is
// blocked outright, and trainer's write branch never matches this
// resource at all). No cabangId-authority branching needed here like
// trainer.php/sekolah.php — this call alone makes the endpoint
// superadmin-only, regardless of $data's content.
requireAuthorization($action, 'cabang', ['id' => $data['id']], $user);

if ($action === 'delete') {
    if ($data['id'] === DEFAULT_CABANG_ID) {
        jsonResponse(['error' => 'Cabang default (seed) tidak bisa dihapus — cabang ini dipakai sebagai fallback sistem'], 422);
    }

    $check = $pdo->prepare('SELECT id, kode FROM cabang WHERE id = :id');
    $check->execute([':id' => $data['id']]);
    $existingCabang = $check->fetch();
    if ($existingCabang === false) {
        jsonResponse(['error' => 'Cabang tidak ditemukan', 'id' => $data['id']], 422);
    }

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM sekolah WHERE cabang_id = :id');
    $countStmt->execute([':id' => $data['id']]);
    $assigned = (int) $countStmt->fetchColumn();
    if ($assigned > 0) {
        jsonResponse(['error' => "Cabang ini masih memiliki $assigned sekolah. Pindahkan sekolah ke cabang lain dulu sebelum menghapus."], 422);
    }

    // KNOWN GAP (same class as trainer.php delete): trainer, siswa,
    // absensi, sppPayments, honorPayments, invoices, and settings each
    // carry their OWN cabang_id column, independent of sekolah — so a row
    // in any of those tables can still reference this branch directly even
    // once zero sekolah do. This check only mirrors BranchManager.jsx's own
    // guard (sekolah count), not full referential coverage across every
    // branch-owned table. See PRODUCTION_MILESTONES.md known issues.
    $pdo->prepare('DELETE FROM cabang WHERE id = :id')->execute([':id' => $data['id']]);
    auditEvent('cabang_deleted', $user, 'cabang', $data['id'], ['kode' => $existingCabang['kode']]);
    jsonResponse(['ok' => true, 'id' => $data['id']], 200);
}

// --- create / update: validate nama + kode, enforce unique kode --------
if (!isset($data['nama']) || !is_string($data['nama']) || trim($data['nama']) === '') {
    jsonResponse(['error' => 'Nama cabang tidak boleh kosong'], 422);
}
if (!isset($data['kode']) || !is_string($data['kode']) || trim($data['kode']) === '') {
    jsonResponse(['error' => 'Kode cabang tidak boleh kosong'], 422);
}
$kode = strtoupper(trim($data['kode']));

// Proactive check first (matches BranchManager.jsx's own UX — a specific,
// named error) — the UNIQUE KEY constraint on `kode` (schema.sql) is the
// backstop for a concurrent request racing past this check, not the
// primary guard.
$dupeStmt = $pdo->prepare('SELECT id, nama FROM cabang WHERE kode = :kode AND id != :id');
$dupeStmt->execute([':kode' => $kode, ':id' => $data['id']]);
$dupe = $dupeStmt->fetch();
if ($dupe !== false) {
    jsonResponse(['error' => "Kode \"$kode\" sudah dipakai cabang \"{$dupe['nama']}\". Pilih kode lain."], 422);
}

$record = $data;
$record['kode'] = $kode;

if ($action === 'create') {
    try {
        $pdo->prepare('INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, :payload)')
            ->execute([
                ':id' => $record['id'],
                ':kode' => $kode,
                ':nama' => $record['nama'],
                ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
    } catch (PDOException $error) {
        if (isDuplicate($error)) jsonResponse(['error' => 'ID atau kode sudah tersimpan', 'id' => $record['id']], 409);
        error_log('cabang.php insert failed: ' . $error->getMessage());
        jsonResponse(['error' => 'Gagal menyimpan record'], 500);
    }
    auditEvent('cabang_created', $user, 'cabang', $record['id'], ['kode' => $kode]);
    jsonResponse(['ok' => true, 'id' => $record['id'], 'kode' => $kode], 201);
}

// --- update --------------------------------------------------------------
$existing = $pdo->prepare('SELECT id FROM cabang WHERE id = :id');
$existing->execute([':id' => $record['id']]);
if ($existing->fetchColumn() === false) {
    jsonResponse(['error' => 'Cabang tidak ditemukan', 'id' => $record['id']], 422);
}

try {
    $pdo->prepare('UPDATE cabang SET kode = :kode, nama = :nama, payload = :payload WHERE id = :id')
        ->execute([
            ':id' => $record['id'],
            ':kode' => $kode,
            ':nama' => $record['nama'],
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
} catch (PDOException $error) {
    if (isDuplicate($error)) jsonResponse(['error' => 'Kode sudah tersimpan', 'id' => $record['id']], 409);
    error_log('cabang.php update failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal memperbarui record'], 500);
}

auditEvent('cabang_updated', $user, 'cabang', $record['id'], ['kode' => $kode]);
jsonResponse(['ok' => true, 'id' => $record['id'], 'kode' => $kode], 200);