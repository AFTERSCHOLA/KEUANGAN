<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/invoiceGenerator.php';

/**
 * Tests generateInvoicesForPeriod() directly (in-process, not over HTTP —
 * this is a pure PDO function shared by the manual-trigger path and the
 * cron entry point, neither of which goes through requireAuthorization()).
 * A separate, smaller CLI-level check at the bottom covers
 * generate-invoices.php's own settings guard, which lives outside the
 * shared function.
 */

$failures = 0;
$total = 0;
function igCheck(string $label, bool $condition, string $detail = ''): void {
    global $failures, $total;
    $total++;
    if ($condition) { echo "  OK   $label\n"; }
    else { $failures++; echo "  FAIL $label" . ($detail !== '' ? " — $detail" : '') . "\n"; }
}

$pdo = database();
$cabangId = 'cbg-IGTEST-' . bin2hex(random_bytes(4));
$periode = '2031-01'; // far-future periode, guaranteed not already invoiced by any other run

function cleanupInvoiceFixtures(PDO $pdo, string $cabangId): void {
    $pdo->prepare('DELETE FROM invoices WHERE cabang_id = :c')->execute([':c' => $cabangId]);
    $pdo->prepare('DELETE FROM siswa WHERE cabang_id = :c')->execute([':c' => $cabangId]);
    $pdo->prepare('DELETE FROM sekolah WHERE cabang_id = :c')->execute([':c' => $cabangId]);
    $pdo->prepare("DELETE FROM audit_log WHERE cabang_id = :c AND event_type LIKE 'invoices_%'")->execute([':c' => $cabangId]);
    $pdo->prepare('DELETE FROM cabang WHERE id = :c')->execute([':c' => $cabangId]);
}
cleanupInvoiceFixtures($pdo, $cabangId); // in case a previous run died mid-way

$pdo->prepare("INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, 'IGT', 'IG Test Branch', '{}')")
    ->execute([':id' => $cabangId]);

// Sekolah 1: has active siswa, mixed tariffs (1 default, 1 override) -> 2 items.
$sekolah1 = 'skl-IGTEST-1-' . bin2hex(random_bytes(4));
$pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $sekolah1, ':c' => $cabangId,
    ':p' => json_encode(['id' => $sekolah1, 'cabangId' => $cabangId, 'nama' => 'SD Test 1', 'spp' => 100000, 'pjNama' => 'Kepsek 1'], JSON_UNESCAPED_UNICODE),
]);

// Sekolah 2: zero active siswa (all Trial/Berhenti) -> must be skipped.
$sekolah2 = 'skl-IGTEST-2-' . bin2hex(random_bytes(4));
$pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => $sekolah2, ':c' => $cabangId,
    ':p' => json_encode(['id' => $sekolah2, 'cabangId' => $cabangId, 'nama' => 'SD Test 2', 'spp' => 80000], JSON_UNESCAPED_UNICODE),
]);

function seedSiswaFixture(PDO $pdo, string $cabangId, string $sekolahId, string $status, ?float $sppOverride = null): void {
    $id = 'sw-IGTEST-' . bin2hex(random_bytes(4));
    $payload = ['id' => $id, 'sekolahId' => $sekolahId, 'status' => $status, 'nama' => 'Siswa Test'];
    if ($sppOverride !== null) $payload['sppOverride'] = $sppOverride;
    $pdo->prepare('INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
        ':id' => $id, ':c' => $cabangId, ':p' => json_encode($payload, JSON_UNESCAPED_UNICODE),
    ]);
}

seedSiswaFixture($pdo, $cabangId, $sekolah1, 'Aktif');                 // default tarif 100000
seedSiswaFixture($pdo, $cabangId, $sekolah1, 'Aktif');                 // default tarif 100000
seedSiswaFixture($pdo, $cabangId, $sekolah1, 'Aktif', 75000.0);        // override tarif
seedSiswaFixture($pdo, $cabangId, $sekolah1, 'Trial');                 // NOT Aktif — must be excluded
seedSiswaFixture($pdo, $cabangId, $sekolah2, 'Berhenti');              // sekolah2 has zero Aktif siswa

try {
    $actor = ['id' => null, 'role' => 'system', 'cabangId' => null];
    $result = generateInvoicesForPeriod($pdo, $periode, 'SPP Bulan Berjalan', $actor, $cabangId);

    // ================= sekolah1: generated with grouped tariffs =================
    $gen1 = null;
    foreach ($result['generated'] as $r) if ($r['sekolahId'] === $sekolah1) $gen1 = $r;
    igCheck('sekolah1 invoice generated', $gen1 !== null, json_encode($result));
    if ($gen1) {
        igCheck('sekolah1 has 2 tariff groups (100000 x2, 75000 x1)', count($gen1['items']) === 2, json_encode($gen1['items']));
        igCheck('sekolah1 grandTotal = 275000', abs($gen1['grandTotal'] - 275000.0) < 0.01, (string) $gen1['grandTotal']);
        igCheck('nomorInvoice format AFS-YYYYMM-NNNN', preg_match('/^AFS-203101-\d{4}$/', $gen1['nomorInvoice']) === 1, $gen1['nomorInvoice']);
        $defaultGroup = null;
        foreach ($gen1['items'] as $item) if (abs($item['hargaSatuan'] - 100000.0) < 0.01) $defaultGroup = $item;
        igCheck('default-tarif group has jumlahSiswa=2 (Trial student excluded)', $defaultGroup && $defaultGroup['jumlahSiswa'] === 2, json_encode($defaultGroup));
    }

    // ================= sekolah2: skipped, zero active siswa =================
    $skip2 = null;
    foreach ($result['skipped'] as $s) if ($s['sekolahId'] === $sekolah2) $skip2 = $s;
    igCheck('sekolah2 skipped (no_active_siswa)', $skip2 && $skip2['reason'] === 'no_active_siswa', json_encode($skip2));

    // ================= row actually persisted =================
    $row = $pdo->prepare('SELECT payload FROM invoices WHERE id = :id');
    $row->execute([':id' => $gen1['id'] ?? '']);
    $persisted = $row->fetch();
    igCheck('generated invoice actually persisted in invoices table', $persisted !== false);

    // ================= audit event, tagged via=generate =================
    $auditStmt = $pdo->prepare("SELECT * FROM audit_log WHERE event_type = 'invoices_created' AND target_id = :tid ORDER BY id DESC LIMIT 1");
    $auditStmt->execute([':tid' => $gen1['id'] ?? '']);
    $auditRow = $auditStmt->fetch();
    igCheck('invoices_created audit row exists for generated invoice', $auditRow !== false);
    if ($auditRow) {
        igCheck('audit actor_role is system', $auditRow['actor_role'] === 'system', json_encode($auditRow));
        $metadata = json_decode((string) $auditRow['metadata'], true);
        igCheck('audit metadata tagged via=generate', ($metadata['via'] ?? null) === 'generate', json_encode($metadata));
    }

    // ================= idempotent re-run: same periode -> skip, no double-bill =================
    $second = generateInvoicesForPeriod($pdo, $periode, 'SPP Bulan Berjalan', $actor, $cabangId);
    $skipAgain = null;
    foreach ($second['skipped'] as $s) if ($s['sekolahId'] === $sekolah1) $skipAgain = $s;
    igCheck('re-running same periode skips sekolah1 (already_generated)', $skipAgain && $skipAgain['reason'] === 'already_generated', json_encode($skipAgain));

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM invoices WHERE cabang_id = :c');
    $countStmt->execute([':c' => $cabangId]);
    igCheck('exactly 1 invoice exists for sekolah1+periode after re-run (no duplicate)', ((int) $countStmt->fetchColumn()) === 1, (string) $countStmt->fetchColumn());

    // ================= validation guards =================
    try {
        generateInvoicesForPeriod($pdo, 'not-a-periode', 'x', $actor, $cabangId);
        igCheck('malformed periode throws InvalidArgumentException', false, 'no exception thrown');
    } catch (InvalidArgumentException $e) {
        igCheck('malformed periode throws InvalidArgumentException', true);
    }

    try {
        generateInvoicesForPeriod($pdo, '2031-02', '   ', $actor, $cabangId);
        igCheck('blank uraian throws InvalidArgumentException', false, 'no exception thrown');
    } catch (InvalidArgumentException $e) {
        igCheck('blank uraian throws InvalidArgumentException', true);
    }
} finally {
    cleanupInvoiceFixtures($pdo, $cabangId);
}

// ================= CLI entry point: missing settings guard =================
echo "\n--- generate-invoices.php (CLI) ---\n";
$pdo->prepare("DELETE FROM settings WHERE id = 'invoice-uraian-current'")->execute();
$existingUraian = null; // will restore after, in case a real one existed

$cmd = [PHP_BINARY, __DIR__ . '/../bin/generate-invoices.php'];
$process = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
fclose($pipes[1]); fclose($pipes[2]);
$exitCode = proc_close($process);
igCheck('CLI exits 1 when invoice-uraian-current setting is missing', $exitCode === 1, "exit=$exitCode stderr=$stderr");
igCheck('CLI stderr explains the missing setting', str_contains($stderr, 'invoice-uraian-current'), $stderr);

echo "\n$total checks, $failures failed\n";
exit($failures > 0 ? 1 : 0);