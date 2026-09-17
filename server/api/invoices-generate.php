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
$sekolahIdFilter = $data['sekolahId'] ?? null; // SB.C.2 — optional: generate for exactly 1 sekolah (InvoiceModal path)

if (!is_string($periode) || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
    jsonResponse(['error' => 'periode harus format YYYY-MM'], 422);
}
if (!is_string($uraian) || trim($uraian) === '') {
    jsonResponse(['error' => 'uraian tidak boleh kosong'], 422);
}

$pdo = database();

if ($cabangIdFilter !== null) {
    if (!is_string($cabangIdFilter) || trim($cabangIdFilter) === '') {
        jsonResponse(['error' => 'cabangId tidak valid'], 422);
    }
    $check = $pdo->prepare('SELECT 1 FROM cabang WHERE id = :id');
    $check->execute([':id' => $cabangIdFilter]);
    if ($check->fetchColumn() === false) {
        jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
    }
}

if ($sekolahIdFilter !== null) {
    if (!is_string($sekolahIdFilter) || trim($sekolahIdFilter) === '') {
        jsonResponse(['error' => 'sekolahId tidak valid'], 422);
    }
    $checkS = $pdo->prepare('SELECT cabang_id FROM sekolah WHERE id = :id');
    $checkS->execute([':id' => $sekolahIdFilter]);
    $sekolahCabangId = $checkS->fetchColumn();
    if ($sekolahCabangId === false) {
        jsonResponse(['error' => 'sekolahId tidak ditemukan'], 422);
    }
    // If both filters were sent, they must agree — otherwise the caller
    // is asking for a sekolah outside the cabang it also specified.
    if ($cabangIdFilter !== null && $sekolahCabangId !== $cabangIdFilter) {
        jsonResponse(['error' => 'sekolahId tidak berada di cabangId yang diminta'], 422);
    }
}

// SB.C.2 / R-SB6 — carryOverLines dihitung client-side (invoiceSettlement()
// di src/lib/invoices.js), tapi server WAJIB validasi keras setiap
// invoiceId yang direferensikan benar-benar milik sekolahId yang sama.
// Pelanggaran referensi gagal keras (422), bukan silently dropped.
$carryOverLinesInput = $data['carryOverLines'] ?? [];
$validatedCarryOverLines = [];
if (!empty($carryOverLinesInput)) {
    if (!is_array($carryOverLinesInput)) {
        jsonResponse(['error' => 'carryOverLines harus array'], 422);
    }
    if ($sekolahIdFilter === null) {
        jsonResponse(['error' => 'carryOverLines hanya boleh dikirim bersama sekolahId'], 422);
    }
    foreach ($carryOverLinesInput as $line) {
        if (!is_array($line) || !isset($line['invoiceId'], $line['amount'], $line['kind'])) {
            jsonResponse(['error' => 'carryOverLines: setiap baris butuh invoiceId, amount, kind'], 422);
        }
        $refStmt = $pdo->prepare(
            "SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sekolahId')) AS sid FROM invoices WHERE id = :id"
        );
        $refStmt->execute([':id' => $line['invoiceId']]);
        $refSekolahId = $refStmt->fetchColumn();
        if ($refSekolahId === false) {
            jsonResponse(['error' => 'carryOverLines: invoiceId tidak ditemukan', 'invoiceId' => $line['invoiceId']], 422);
        }
        if ($refSekolahId !== $sekolahIdFilter) {
            jsonResponse(['error' => 'carryOverLines: invoice asal harus dari sekolah yang sama (R-SB6)', 'invoiceId' => $line['invoiceId']], 422);
        }
        $validatedCarryOverLines[] = [
            'type' => 'carry-over',
            'kind' => (string) $line['kind'],
            'invoiceId' => (string) $line['invoiceId'],
            'nomorInvoiceAsal' => $line['nomorInvoiceAsal'] ?? null,
            'description' => (string) ($line['description'] ?? ''),
            'amount' => (float) $line['amount'],
        ];
    }
}

try {
    $result = generateInvoicesForPeriod(
        $pdo,
        $periode,
        $uraian,
        $user,
        $cabangIdFilter,
        $sekolahIdFilter,
        $validatedCarryOverLines
    );
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