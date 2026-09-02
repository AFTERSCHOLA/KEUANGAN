<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/_master.php';

$user = requireAuthenticatedUser();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' || $method === 'PUT') {
    $data = requestJson();
    $action = $data['action'] ?? 'create';
    if (!in_array($action, ['create', 'update', 'delete'], true)) {
        jsonResponse(['error' => 'Operasi tidak didukung'], 400);
    }
    if ($action === 'delete') {
        // AUDIT_FOLLOWUP M-AF1.3 — nullify `absensi.entries[].siswaId` for
        // the deleted siswa so attendanceStats() and Rekap no longer count
        // them. Mirrors sekolah.php:31-33 KNOWN GAP pattern (server is
        // authoritative here; client is best-effort). sppPayments rows
        // survive — RD (append-only ledger, see AUDIT_PLAN).
        nullifyAbsensiSiswaId($data['id'] ?? null, $user);
        masterDelete('siswa', $user);
    }

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

    masterWrite('siswa', $user, record: $data, overrides: ['cabangId' => $newCabangId], action: $action);
} elseif ($method === 'DELETE') {
    // Same M-AF1.3 cascade on the HTTP-DELETE path: read the id from the
    // body/query, nullify absensi, then run the master delete.
    $body = requestJson();
    nullifyAbsensiSiswaId($body['id'] ?? ($_GET['id'] ?? null), $user);
    masterDelete('siswa', $user);
} else {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

/**
 * Walk the absensi table, find every record whose payload.siswaList contains
 * the given siswaId, and rewrite that entry's siswaId to null. We do this
 * in-place (UPDATE per row) because the payload is opaque JSON and the
 * siswaId is the only field we can safely nullify without losing the
 * attendance "shape" (Hadir/Tidak Hadir, etc.). No-op when the siswaId is
 * null/empty or no absensi rows reference it.
 */
function nullifyAbsensiSiswaId(?string $siswaId, array $user): void {
    if (!is_string($siswaId) || trim($siswaId) === '') return;
    $pdo = database();
    $stmt = $pdo->prepare('SELECT id, payload FROM absensi');
    $stmt->execute();
    $touched = 0;
    while ($row = $stmt->fetch()) {
        $payload = json_decode($row['payload'], true);
        if (!is_array($payload) || !isset($payload['siswaList']) || !is_array($payload['siswaList'])) continue;
        $changed = false;
        foreach ($payload['siswaList'] as &$entry) {
            if (is_array($entry) && ($entry['siswaId'] ?? null) === $siswaId) {
                $entry['siswaId'] = null;
                $changed = true;
            }
        }
        unset($entry);
        if (!$changed) continue;
        $pdo->prepare('UPDATE absensi SET payload = :payload WHERE id = :id')
            ->execute([
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':id' => $row['id'],
            ]);
        $touched++;
    }
    if ($touched > 0) {
        auditEvent('absensi_siswa_nullified', $user, 'absensi', null, [
            'siswaId' => $siswaId,
            'recordsTouched' => $touched,
        ]);
    }
}
