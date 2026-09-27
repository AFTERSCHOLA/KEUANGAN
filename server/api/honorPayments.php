<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

$data = requestJson();
$action = $data['action'] ?? 'append';

// DC.B.2 (F-DC2; D-DC1) — queue dropped: the client writes via writeRemote,
// which sends action=create for fresh ids. A create here IS an append
// (fresh generateId, never a resend of an existing row); action=update
// stays 400 because payments are append-only (corrections use 'correct').
if ($action === 'create') $action = 'append';

if ($action === 'correct') {
    $record = $data['record'] ?? null;
    $correctionOf = $data['correctionOf'] ?? null;
    if (!is_array($record) || !is_string($correctionOf) || $correctionOf === '') {
        jsonResponse(['error' => 'Koreksi membutuhkan record dan correctionOf'], 422);
    }
    $record = requireRecord($record);
    // Generic 'write' action: authorize.php already denies admin_cabang on
    // honorPayments create/update/delete/write, and trainer's write branch
    // only ever allows resource 'absensi' — so this is effectively
    // Superadmin-only, matching PRODUCTION_PLAN.md section 5 ("Superadmin:
    // Full; only writer").
    requireAuthorization('write', 'honorPayments', $record, $user);
    insertLedger('honorPayments', $record, $correctionOf);
}

if ($action !== 'append') jsonResponse(['error' => 'Operasi tidak didukung'], 400);

$record = requireRecord($data);
requireAuthorization('write', 'honorPayments', $record, $user);
insertLedger('honorPayments', $record);