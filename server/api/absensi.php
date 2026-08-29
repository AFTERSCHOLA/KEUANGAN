<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

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

// --- existing 'write' path below, unchanged ---
// Structural validation (422) before authorization (403) — a malformed
// record shouldn't leak whether it would've been in-scope or not.
$record = requireRecord($data);
requireAuthorization('write', 'absensi', $record, $user);
insertLedger('absensi', $record);

