<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

// ============================================================
// GET /api/spp-status.php?periode=YYYY-MM
//
// Bug context: dashboard trainer menampilkan "Belum Bayar" untuk siswa
// yang di dashboard superadmin/admin_cabang sudah "Lunas". Root cause:
// status Lunas/Belum Lunas dihitung PURELY di client (invoiceSettlement()
// di src/lib/invoices.js) dari data `invoices` + `sppPayments`. Trainer
// tidak pernah punya akses ke entity `invoices` (roleCanReadEntity() di
// authorize.php sengaja tidak mencantumkannya untuk role trainer), jadi
// array invoices di sisi trainer selalu kosong -> findIssuedInvoiceForPeriod()
// selalu null -> invoiceSettlement() tidak pernah jalan -> status selalu
// fallback "Belum Bayar", walau sppPayments-nya sendiri sudah lengkap.
//
// Fix: endpoint ini menghitung status settlement itu SEKALI di server
// (port persis dari invoiceTotal/matchedPaymentsForInvoice/
// invoiceSettlement di invoices.js) dan hanya mengembalikan HASIL
// AKHIRNYA (status/dibayar/total/sisa) per siswa untuk periode yang
// diminta. Trainer tetap TIDAK mendapat akses ke baris invoice mentah
// (nomor invoice, uraian, carryOverLines, dll) — hanya derived status,
// dibatasi ke siswa/sekolah yang memang sudah boleh mereka lihat lewat
// entity=siswa. Kalau logic settlement di invoices.js berubah, port di
// sini WAJIB ikut diubah supaya tidak drift lagi.
// ============================================================

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();

$periode = $_GET['periode'] ?? null;
if (!is_string($periode) || !preg_match('/^\d{4}-\d{2}$/', $periode)) {
    jsonResponse(['error' => 'periode harus format YYYY-MM'], 422);
}

$role = $user['role'] ?? null;
if (!in_array($role, ['superadmin', 'admin_cabang', 'trainer'], true)) {
    jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
}

$pdo = database();

// entityConfig() dipakai (bukan nama tabel hardcode) supaya endpoint ini
// tetap konsisten kalau mapping entity->table di entityConfig() berubah
// — sama pola yang dipakai read.php.
$sekolahTable = entityConfig('sekolah')['table'];
$siswaTable = entityConfig('siswa')['table'];
$invoicesTable = entityConfig('invoices')['table'];
$sppPaymentsTable = entityConfig('sppPayments')['table'];

// ------------------------------------------------------------
// 1. Scope sekolahId yang boleh dilihat caller — persis pola scoping
//    per-role yang sudah ada di read.php, supaya endpoint ini tidak
//    pernah membocorkan status siswa/sekolah yang caller sendiri tidak
//    boleh baca lewat entity=siswa.
// ------------------------------------------------------------
$sekolahRows = $pdo->query("SELECT payload FROM {$sekolahTable} ORDER BY created_at, id")->fetchAll();
$sekolahCabangId = [];   // sekolahId -> cabangId
$sekolahTrainerIds = []; // sekolahId -> trainerIds[]
foreach ($sekolahRows as $row) {
    $sch = json_decode($row['payload'], true);
    if (is_array($sch) && isset($sch['id'])) {
        $sekolahCabangId[$sch['id']] = $sch['cabangId'] ?? null;
        $sekolahTrainerIds[$sch['id']] = $sch['trainerIds'] ?? [];
    }
}

$allowedSekolahIds = null; // null = semua sekolah (superadmin)
if ($role === 'admin_cabang') {
    $cabangId = $user['cabangId'] ?? null;
    if (!is_string($cabangId) || $cabangId === '') {
        jsonResponse([]);
    }
    $allowedSekolahIds = array_keys(array_filter(
        $sekolahCabangId,
        static fn ($cid) => $cid === $cabangId
    ));
} elseif ($role === 'trainer') {
    $trainerId = $user['trainerId'] ?? null;
    if (!is_string($trainerId) || $trainerId === '') {
        jsonResponse([]);
    }
    $allowedSekolahIds = array_keys(array_filter(
        $sekolahTrainerIds,
        static fn ($ids) => in_array($trainerId, $ids, true)
    ));
}

// ------------------------------------------------------------
// 2. siswa dalam scope
// ------------------------------------------------------------
$siswaRows = $pdo->query("SELECT payload FROM {$siswaTable} ORDER BY created_at, id")->fetchAll();
$siswaList = [];
foreach ($siswaRows as $row) {
    $sw = json_decode($row['payload'], true);
    if (!is_array($sw) || !isset($sw['id'])) continue;
    if ($allowedSekolahIds !== null && !in_array($sw['sekolahId'] ?? null, $allowedSekolahIds, true)) continue;
    $siswaList[] = $sw;
}

if (empty($siswaList)) {
    jsonResponse([]);
}

$sekolahIdsNeeded = array_values(array_unique(array_map(
    static fn (array $s) => $s['sekolahId'] ?? null,
    $siswaList
)));

// ------------------------------------------------------------
// 3. invoices + sppPayments dibaca LANGSUNG dari DB di sini, di luar
//    roleCanReadEntity() — endpoint ini TIDAK PERNAH mengembalikan baris
//    invoice mentah ke client, hanya status hasil hitungan. Trainer jadi
//    dapat HASIL komputasi yang sama seperti yang dilihat admin, tanpa
//    diberi akses baca ke entity invoices itu sendiri.
// ------------------------------------------------------------
$invoiceRows = $pdo->query("SELECT payload FROM {$invoicesTable} ORDER BY created_at, id")->fetchAll();
$invoicesBySekolah = []; // sekolahId -> [invoice Terbit yang cover $periode, ...]
foreach ($invoiceRows as $row) {
    $inv = json_decode($row['payload'], true);
    if (!is_array($inv) || ($inv['status'] ?? null) !== 'Terbit') continue;

    $sid = $inv['sekolahId'] ?? null;
    if ($sid === null || !in_array($sid, $sekolahIdsNeeded, true)) continue;

    // Port invoicePeriods() dari invoices.js: dukung dua bentuk invoice
    // (client legacy periodeList[] vs server periode tunggal).
    $periods = [];
    if (!empty($inv['periodeList']) && is_array($inv['periodeList'])) {
        $periods = $inv['periodeList'];
    } elseif (!empty($inv['periode'])) {
        $periods = [$inv['periode']];
    }
    if (!in_array($periode, $periods, true)) continue;

    $invoicesBySekolah[$sid][] = $inv;
}

$paymentRows = $pdo->query("SELECT payload FROM {$sppPaymentsTable} ORDER BY created_at, id")->fetchAll();
$payments = [];
foreach ($paymentRows as $row) {
    $p = json_decode($row['payload'], true);
    if (is_array($p)) $payments[] = $p;
}

$siswaIdsBySekolah = [];
foreach ($siswaList as $sw) {
    $siswaIdsBySekolah[$sw['sekolahId'] ?? ''][] = $sw['id'];
}

// ------------------------------------------------------------
// 4. Port persis dari src/lib/invoices.js — invoiceTotal(),
//    matchedPaymentsForInvoice(), invoiceSettlement(). JANGAN diubah
//    sendiri-sendiri dari versi JS-nya; kalau rule settlement di sana
//    berubah, ubah juga di sini.
// ------------------------------------------------------------
function invoiceTotalPhp(array $invoice): float
{
    if (isset($invoice['grandTotal']) && is_numeric($invoice['grandTotal'])) return (float) $invoice['grandTotal'];
    if (isset($invoice['total']) && is_numeric($invoice['total'])) return (float) $invoice['total'];
    return 0.0;
}

function matchedPaymentsForInvoicePhp(array $invoice, array $payments, array $siswaIdsForSekolah, string $periode): array
{
    $sekolahId = $invoice['sekolahId'] ?? null;
    return array_values(array_filter($payments, static function (array $p) use ($invoice, $sekolahId, $siswaIdsForSekolah, $periode): bool {
        // 1. Pembayaran baru: langsung terhubung ke invoice.
        if (!empty($p['invoiceId'])) {
            return $p['invoiceId'] === $invoice['id'];
        }
        // 2. Pembayaran level sekolah: rekonsiliasi terhadap sekolah, bukan per siswa.
        if (!empty($p['sekolahId'])) {
            return $p['sekolahId'] === $sekolahId && ($p['periode'] ?? null) === $periode;
        }
        // 3. Backward-compat: pembayaran lama, cocokkan lewat siswa + periode.
        return in_array($p['siswaId'] ?? null, $siswaIdsForSekolah, true)
            && ($p['periode'] ?? null) === $periode;
    }));
}

function invoiceSettlementPhp(array $invoice, array $payments, array $siswaIdsForSekolah, string $periode): array
{
    $matched = matchedPaymentsForInvoicePhp($invoice, $payments, $siswaIdsForSekolah, $periode);
    $dibayar = array_reduce($matched, static fn ($sum, $p) => $sum + (float) ($p['nominal'] ?? 0), 0.0);
    $total = invoiceTotalPhp($invoice);
    $sisa = max(0.0, $total - $dibayar);

    return [
        'total' => $total,
        'dibayar' => $dibayar,
        'sisa' => $sisa,
        'status' => $sisa <= 0 ? 'Lunas' : 'Belum Lunas',
    ];
}

// ------------------------------------------------------------
// 5. SPP ditagih di level sekolah (D-SB8 di invoices.js), jadi satu
//    status per sekolah untuk periode ini, lalu diterapkan ke semua
//    siswa di sekolah tsb. Kalau belum ada invoice Terbit untuk periode
//    ini sama sekali, statusnya "Belum Ditagih" — bukan "Belum Lunas",
//    supaya beda jelas antara "belum sempat ditagih" vs "sudah ditagih
//    tapi belum lunas".
// ------------------------------------------------------------
$statusBySekolah = [];
foreach ($sekolahIdsNeeded as $sid) {
    $siswaIdsForSekolah = $siswaIdsBySekolah[$sid] ?? [];
    $candidateInvoices = $invoicesBySekolah[$sid] ?? [];

    if (empty($candidateInvoices)) {
        $statusBySekolah[$sid] = ['status' => 'Belum Ditagih', 'dibayar' => 0.0, 'total' => 0.0, 'sisa' => 0.0];
        continue;
    }

    // findIssuedInvoiceForPeriod() di JS pakai Array.find() -> match
    // pertama pada urutan array invoices. Kita fetch dengan ORDER BY
    // created_at, id yang sama seperti read.php supaya urutannya konsisten.
    $invoice = $candidateInvoices[0];
    $statusBySekolah[$sid] = invoiceSettlementPhp($invoice, $payments, $siswaIdsForSekolah, $periode);
}

// ------------------------------------------------------------
// 6. Output: derived status per siswa saja — tidak ada satu pun field
//    invoice mentah (nomor, uraian, carryOverLines) yang ikut terkirim.
// ------------------------------------------------------------
$output = [];
foreach ($siswaList as $sw) {
    $sid = $sw['sekolahId'] ?? null;
    $settlement = $statusBySekolah[$sid] ?? ['status' => 'Belum Ditagih', 'dibayar' => 0.0, 'total' => 0.0, 'sisa' => 0.0];

    $output[] = [
        'siswaId' => $sw['id'],
        'sekolahId' => $sid,
        'periode' => $periode,
        'status' => $settlement['status'],
        'dibayar' => $settlement['dibayar'],
        'total' => $settlement['total'],
        'sisa' => $settlement['sisa'],
    ];
}

jsonResponse($output);