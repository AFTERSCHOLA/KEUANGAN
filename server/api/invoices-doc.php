<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/invoiceDoc.php';

// IP.2 — Standalone invoice document (D-IP1..D-IP6).
//
// POST {id, settings?} -> self-contained text/html invoice rendered from
// MySQL (invoice + sekolah payloads, spp_payments ledger), visuals per
// invoice-template.pdf + settlement appendix. Numbers are a read-only
// projection (R-IP1); `settings` travels in the body display-only because
// no server settings endpoint exists (src/lib/store.js:641-655) and is
// never stored.
//
// Auth order mirrors photo-download.php:
//   405 method -> 401 auth -> 403 CSRF -> 422 body -> 404 unknown id
//   -> 403 scope (authorize read on invoices) -> bytes.

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

$data = requestJson();
$id = $data['id'] ?? null;
if (!is_string($id) || trim($id) === '') {
    jsonResponse(['error' => 'id wajib diisi'], 422);
}
$id = trim($id);

// --- settings snapshot: allowlist + caps, display-only -----------------
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
        jsonResponse(['error' => "$label harus dataURL gambar (png/jpeg/webp)"], 422);
    }
    if (strlen($val) > 700000) {
        jsonResponse(['error' => "$label terlalu besar (maks ~500KB)"], 422);
    }
    $settings[$key] = $val;
}

$pdo = database();

$stmt = $pdo->prepare('SELECT id, cabang_id, payload FROM invoices WHERE id = :id');
$stmt->execute([':id' => $id]);
$row = $stmt->fetch();
if ($row === false) {
    jsonResponse(['error' => 'Invoice tidak ditemukan'], 404);
}
$invoice = json_decode((string) $row['payload'], true);
if (!is_array($invoice)) {
    error_log('invoices-doc.php: invalid payload for invoice ' . $id);
    jsonResponse(['error' => 'Data invoice tidak valid'], 500);
}

// Read-scope only: superadmin any, admin_cabang own branch, trainer never
// (roleCanReadEntity excludes invoices — same as read.php). Taste #33:
// no broadening, authorize.php untouched.
if (!authorize('read', 'invoices', ['cabangId' => $row['cabang_id']], $user)) {
    jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
}

// --- sekolah: best-effort (ledger principle — invoice outlives school) --
$sekolahId = $invoice['sekolahId'] ?? null;
$sekolah = ['nama' => (string) ($invoice['sekolahNama'] ?? '(sekolah dihapus)')];
if (is_string($sekolahId) && $sekolahId !== '') {
    $schStmt = $pdo->prepare('SELECT payload FROM sekolah WHERE id = :id');
    $schStmt->execute([':id' => $sekolahId]);
    $schRow = $schStmt->fetch();
    if ($schRow !== false) {
        $decoded = json_decode((string) $schRow['payload'], true);
        if (is_array($decoded)) $sekolah = $decoded;
    }
}

// --- ledger rows for the settlement appendix (same branch, filtered in
// --- PHP by invoiceDocSettlement: invoiceId match + historical
// --- sekolahId+periode fallback, same-school only) -----------------------
$payStmt = $pdo->prepare('SELECT payload FROM spp_payments WHERE cabang_id = :c');
$payStmt->execute([':c' => $row['cabang_id']]);
$payments = [];
foreach ($payStmt->fetchAll() as $payRow) {
    $decoded = json_decode((string) $payRow['payload'], true);
    if (is_array($decoded)) $payments[] = $decoded;
}
$siswaIds = [];
if (is_string($sekolahId) && $sekolahId !== '') {
    $swStmt = $pdo->prepare('SELECT payload FROM siswa WHERE cabang_id = :c');
    $swStmt->execute([':c' => $row['cabang_id']]);
    foreach ($swStmt->fetchAll() as $swRow) {
        $decoded = json_decode((string) $swRow['payload'], true);
        if (is_array($decoded) && ($decoded['sekolahId'] ?? null) === $sekolahId && isset($decoded['id'])) {
            $siswaIds[] = $decoded['id'];
        }
    }
}
$settlement = invoiceDocSettlement($invoice, $payments, $siswaIds);

// --- images: explicit dataURL override wins, else tracked on-disk asset -
$assets = ['logoDataUrl' => null, 'signatureDataUrl' => null];
$pairs = ['logoDataUrl' => 'logo.png', 'signatureDataUrl' => 'signature.png'];
foreach ($pairs as $assetKey => $file) {
    if (!empty($settings[$assetKey])) {
        $assets[$assetKey] = $settings[$assetKey];
        continue;
    }
    // Repo dev serves public/ at root; deploy/ has invoice/ at docroot.
    $candidates = [__DIR__ . '/../../public/invoice/' . $file, __DIR__ . '/../invoice/' . $file];
    foreach ($candidates as $path) {
        if (is_file($path)) {
            $bytes = @file_get_contents($path);
            if ($bytes !== false) {
                $assets[$assetKey] = 'data:image/png;base64,' . base64_encode($bytes);
            }
            break;
        }
    }
}

$html = renderInvoiceDoc($invoice, $sekolah, $settings, $settlement, $assets);
$filename = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string) ($invoice['nomor'] ?? $invoice['nomorInvoice'] ?? 'invoice')) . '.html';

http_response_code(200);
header('Content-Type: text/html; charset=utf-8');
header('Content-Disposition: inline; filename="' . $filename . '"');
header('Content-Length: ' . strlen($html));
echo $html;
exit;
