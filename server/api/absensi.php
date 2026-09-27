<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../validation/entities.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

// 401 first (who are you), then CSRF (403 — proves this came from our own
// app, not a forged cross-site request) — both before we touch the body
// or the database at all.
$user = requireAuthenticatedUser();
requireCsrf();

$data = requestJson();
$pdo = database();      

if (($data['action'] ?? 'write') === 'verify') {
    $id = $data['id'] ?? null;
    if (!is_string($id) || trim($id) === '') jsonResponse(['error' => 'Record membutuhkan id'], 422);

    $stmt = $pdo->prepare('SELECT cabang_id, payload FROM absensi WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if ($row === false) jsonResponse(['error' => 'Absensi tidak ditemukan', 'id' => $id], 422);

    $payload = json_decode($row['payload'], true) ?: [];
    $payload['cabangId'] = $payload['cabangId'] ?? $row['cabang_id'];
    requireAuthorization('verify', 'absensi', $payload, $user);

    // Server stamps 'by'/'at' from session — never trusts a client-supplied
    // statusVerifikasi, so the audit trail can't be spoofed with a fake
    // verifier identity or timestamp.
    $payload['statusVerifikasi'] = ['by' => $user['role'], 'at' => gmdate('Y-m-d\TH:i:s\Z')];

    $pdo->prepare('UPDATE absensi SET payload = :payload WHERE id = :id')
        ->execute([':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $id]);

    auditEvent('absensi_verified', $user, 'absensi', $id, ['cabangId' => $payload['cabangId']]);
    jsonResponse(['ok' => true, 'id' => $id, 'statusVerifikasi' => $payload['statusVerifikasi']], 200);
}

// DC.B.1 (F-DC2; D-DC1) — 'update' action: full-record replace for edits
// made through AttendanceForm (editingRecord keeps its id, which the
// insert-only 'write' path 409s). Branch is read from the stored row, not
// trusted from the client; shape re-validated; audited. Trainers have no
// 'update' lane (authorize.php → 403); they certify via 'certify' below.
if (($data['action'] ?? 'write') === 'update') {
    $record = requireRecord($data);

    $stmt = $pdo->prepare('SELECT cabang_id FROM absensi WHERE id = :id');
    $stmt->execute([':id' => $record['id']]);
    $row = $stmt->fetch();
    if ($row === false) jsonResponse(['error' => 'Absensi tidak ditemukan', 'id' => $record['id']], 422);

    requireAuthorization('update', 'absensi', ['cabangId' => $row['cabang_id']], $user);
    $record['cabangId'] = $record['cabangId'] ?? $row['cabang_id'];
    requireAuthorization('update', 'absensi', $record, $user);

    $errors = validateAbsensi($record, $pdo);
    if ($errors !== []) jsonResponse(['error' => 'Validasi gagal', 'details' => $errors], 422);
    unset($record['action']);

    $pdo->prepare('UPDATE absensi SET payload = :payload WHERE id = :id')
        ->execute([':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $record['id']]);

    auditEvent('absensi_updated', $user, 'absensi', $record['id'], ['cabangId' => $record['cabangId']]);
    jsonResponse(['ok' => true, 'id' => $record['id']], 200);
}

// DC.B.1 (F-DC2; D-DC1) — 'certify' action: trainer self-certification
// (TrainerHistory "Saya nyatakan …"). Mirrors 'verify': the server stamps
// konfirmasiTrainer from its own clock so a client cannot spoof the
// timestamp; the authorize.php trainer 'certify' lane (own trainerId
// only) gates scope.
if (($data['action'] ?? 'write') === 'certify') {
    $id = $data['id'] ?? null;
    if (!is_string($id) || trim($id) === '') jsonResponse(['error' => 'Record membutuhkan id'], 422);

    $stmt = $pdo->prepare('SELECT cabang_id, payload FROM absensi WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if ($row === false) jsonResponse(['error' => 'Absensi tidak ditemukan', 'id' => $id], 422);

    $payload = json_decode($row['payload'], true) ?: [];
    $payload['cabangId'] = $payload['cabangId'] ?? $row['cabang_id'];
    requireAuthorization('certify', 'absensi', $payload, $user);

    $payload['konfirmasiTrainer'] = gmdate('Y-m-d\TH:i:s\Z');

    $pdo->prepare('UPDATE absensi SET payload = :payload WHERE id = :id')
        ->execute([':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $id]);

    auditEvent('absensi_certified', $user, 'absensi', $id, ['cabangId' => $payload['cabangId']]);
    jsonResponse(['ok' => true, 'id' => $id, 'konfirmasiTrainer' => $payload['konfirmasiTrainer']], 200);
}

// --- existing 'write' path below, unchanged ---
// Structural validation (422) before authorization (403) — a malformed
// record shouldn't leak whether it would've been in-scope or not.
$record = requireRecord($data);
requireAuthorization('write', 'absensi', $record, $user);
insertLedger('absensi', $record);

