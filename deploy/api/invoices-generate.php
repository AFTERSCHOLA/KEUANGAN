<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/invoiceGenerator.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

// Same-shaped guard as invoices.php: authorize.php's resource-specific
// block rejects create/update/delete/write on 'invoices' for admin_cabang
// before any data-dependent check runs, and superadmin bypasses everything
// at the top of authorize(). The empty data array is fine here — this is
// a bulk operation, not tied to one record's branch up front.
requireAuthorization('create', 'invoices', [], $user);

$data = requestJson();
$periode = $data['periode'] ?? null;
$uraian = $data['uraian'] ?? null;
$cabangIdFilter = $data['cabangId'] ?? null; // optional: null = all branches

if (!is_string($periode) || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
    jsonResponse(['error' => 'periode harus format YYYY-MM'], 422);
}
if (!is_string($uraian) || trim($uraian) === '') {
    jsonResponse(['error' => 'uraian tidak boleh kosong'], 422);
}
if ($cabangIdFilter !== null) {
    if (!is_string($cabangIdFilter) || trim($cabangIdFilter) === '') {
        jsonResponse(['error' => 'cabangId tidak valid'], 422);
    }
    $pdo = database();
    $check = $pdo->prepare('SELECT 1 FROM cabang WHERE id = :id');
    $check->execute([':id' => $cabangIdFilter]);
    if ($check->fetchColumn() === false) {
        jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
    }
}

$pdo = database();

try {
    $result = generateInvoicesForPeriod($pdo, $periode, $uraian, $user, $cabangIdFilter);
} catch (InvalidArgumentException $error) {
    jsonResponse(['error' => $error->getMessage()], 422);
}

jsonResponse([
    'ok' => true,
    'generatedCount' => count($result['generated']),
    'skippedCount' => count($result['skipped']),
    'generated' => $result['generated'],
    'skipped' => $result['skipped'],
], 200);