<?php
declare(strict_types=1);

// ============================================================
// RH.F.2 — reconciliation CLI verification (F-RH7, M6.2 VERIFY)
//
// Proves the microtask VERIFY clause end-to-end against the live DB:
//   matching fixture -> exit 0 + MATCH + signed report file written
//   seeded drift (one spp row deleted) -> exit 1 naming the drift
//   invoice status flip -> exit 1 naming invoice_status
//
// Idiom mirrors server/tests/v4.import.php (check() reporting, BLOCKER
// handling per taste #56, throwaway `-rct-` ids cleaned LAST per taste
// #55). The fixture is inserted post-derivation (shapeNormalize ->
// deriveMissingCabangIds), exactly what the RH.F.1 importer persists,
// while reconcile.php receives the pre-derivation client shape — so the
// MATCH probe also proves derivation parity. The canonical seed
// (cbg-test-pusat + 2 trainers) stays untouched: reconcile is
// superset-tolerant by contract, and the MATCH probe asserts the seed
// surfaces as NOTE extra_in_db lines, never DRIFT.
// ============================================================

$failures = 0;
$total = 0;
function check(string $label, bool $condition, string $detail = ''): void {
    global $failures, $total;
    $total++;
    if ($condition) {
        echo "  OK   $label\n";
    } else {
        $failures++;
        echo "  FAIL $label" . ($detail !== '' ? " — $detail" : '') . "\n";
    }
}

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/v4Import.php';

$config = serverConfig();
$dsn = (string) ($config['dsn'] ?? '');
if (!str_contains($dsn, 'test')) {
    fwrite(STDERR, "BLOCKER: refusing to seed a non-test database (dsn=$dsn)\n");
    exit(1);
}
try {
    $pdo = new PDO($dsn, (string) ($config['username'] ?? 'root'), (string) ($config['password'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (Throwable $error) {
    fwrite(STDERR, 'BLOCKER: cannot reach test database: ' . $error->getMessage() . "\n");
    exit(1);
}

const RCT_TABLES = [
    'cabang' => 'cabang',
    'sekolah' => 'sekolah',
    'trainer' => 'trainer',
    'siswa' => 'siswa',
    'absensi' => 'absensi',
    'sppPayments' => 'spp_payments',
    'honorPayments' => 'honor_payments',
    'invoices' => 'invoices',
    'settings' => 'settings',
];

function cleanupRctFixtures(PDO $pdo): void {
    foreach (RCT_TABLES as $table) {
        try {
            $pdo->exec("DELETE FROM {$table} WHERE id LIKE '%-rct-%'");
        } catch (Throwable $ignore) {
        }
    }
}

/** Mirror of reconcileCanonical() — the documented signature contract. */
function rctCanonical(mixed $value): mixed {
    if (!is_array($value)) {
        if (is_float($value) && floor($value) === $value) return (int) $value;
        return $value;
    }
    $isList = $value === [] || array_keys($value) === range(0, count($value) - 1);
    if ($isList) return array_map('rctCanonical', $value);
    ksort($value, SORT_STRING);
    foreach ($value as $k => $v) $value[$k] = rctCanonical($v);
    return $value;
}

function rctVerifySignature(array $report): bool {
    $sig = $report['signature'] ?? null;
    $algo = $report['signatureAlgo'] ?? null;
    if (!is_string($sig) || $algo !== 'sha256' || !preg_match('/^[0-9a-f]{64}$/', $sig)) return false;
    $body = $report;
    unset($body['signature'], $body['signatureAlgo']);
    $canonical = json_encode(rctCanonical($body), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return is_string($canonical) && hash_equals($sig, hash('sha256', $canonical));
}

function runReconcile(string $sourceFile): array {
    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../bin/reconcile.php')
        . ' ' . escapeshellarg($sourceFile) . ' 2>&1';
    $lines = [];
    $exit = 0;
    exec($cmd, $lines, $exit);
    return [$exit, implode("\n", $lines)];
}

function rctReportPath(string $output): ?string {
    if (preg_match('/^REPORT (.+\.json)\s*$/m', $output, $m)) return trim($m[1]);
    return null;
}

/** Column mapping mirrors v4-import.php v4InsertRecord(). */
function rctInsert(PDO $pdo, string $entity, array $record): void {
    $id = (string) $record['id'];
    $payload = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($entity === 'cabang') {
        $pdo->prepare('INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, :payload)')
            ->execute([':id' => $id, ':kode' => trim((string) ($record['kode'] ?? '')), ':nama' => (string) ($record['nama'] ?? ''), ':payload' => $payload]);
        return;
    }
    if ($entity === 'honorPayments') {
        $pdo->prepare('INSERT INTO honor_payments (id, cabang_id, correction_of, payload) VALUES (:id, :cabang_id, :correction_of, :payload)')
            ->execute([':id' => $id, ':cabang_id' => $record['cabangId'] ?? null, ':correction_of' => $record['correctionOf'] ?? null, ':payload' => $payload]);
        return;
    }
    $table = RCT_TABLES[$entity];
    $pdo->prepare("INSERT INTO {$table} (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)")
        ->execute([':id' => $id, ':cabang_id' => $record['cabangId'] ?? null, ':payload' => $payload]);
}

// Pre-derivation client shape (siswa/absensi/invoices/spp/honor carry no
// cabangId — the importer derives them; explicit settings id avoids the
// shared settings-global row owned by the v4.import.php suite).
$sourceData = [
    'cabang' => [['id' => 'cbg-rct-1', 'kode' => 'RCT', 'nama' => 'Cabang Reconcile Test']],
    'sekolah' => [[
        'id' => 'skl-rct-1', 'nama' => 'Sekolah Reconcile Test', 'alamat' => 'Jl RCT No 1',
        'cabangId' => 'cbg-rct-1', 'spp' => 150000, 'trainerIds' => ['trn-rct-1'], 'jadwalList' => [],
    ]],
    'trainer' => [[
        'id' => 'trn-rct-1', 'nama' => 'Trainer Reconcile', 'wa' => '628000000011',
        'jadwal' => 'Senin', 'sekolahIds' => ['skl-rct-1'], 'honor' => 50000, 'cabangId' => 'cbg-rct-1',
    ]],
    'siswa' => [[
        'id' => 'sw-rct-1', 'nama' => 'Siswa Reconcile', 'wa' => '628000000012', 'kelas' => 'A',
        'sekolahId' => 'skl-rct-1', 'sekolahNama' => 'Sekolah Reconcile Test', 'status' => 'Aktif', 'sppLunas' => [],
    ]],
    'absensi' => [[
        'id' => 'abs-rct-1', 'tanggal' => '2026-09-01', 'periode' => '2026-09',
        'sekolahId' => 'skl-rct-1', 'trainerId' => 'trn-rct-1', 'trainerNama' => 'Trainer Reconcile',
        'trainerStatus' => 'Hadir', 'siswaList' => [['siswaId' => 'sw-rct-1', 'status' => 'Hadir']], 'sesiKe' => 1,
    ]],
    'honorPayments' => [[
        'id' => 'pay-rct-1', 'trainerId' => 'trn-rct-1', 'periode' => '2026-09',
        'nominal' => 50000, 'tanggalBayar' => '2026-09-03',
    ]],
    'sppPayments' => [[
        'id' => 'spp-rct-1', 'siswaId' => 'sw-rct-1', 'periode' => '2026-09',
        'nominal' => 150000, 'tanggalBayar' => '2026-09-02', 'metode' => 'Tunai', 'diterimaOleh' => 'Admin',
    ]],
    'invoices' => [[
        'id' => 'inv-rct-1', 'sekolahId' => 'skl-rct-1', 'mode' => 'bulanan', 'periodeList' => ['2026-09'],
        'jumlahSiswa' => 1, 'hargaSatuan' => 150000, 'jumlahPertemuan' => 4, 'total' => 150000,
        'tanggalTerbit' => '2026-09-01', 'status' => 'Draft',
    ]],
    'settings' => [['id' => 'set-rct-1', 'title' => 'RCT', 'logoUrl' => '']],
];

$tmpSource = tempnam(sys_get_temp_dir(), 'rct_src_') . '.json';
$generatedReports = [];

try {
    cleanupRctFixtures($pdo); // previous interrupted run

    // Persist what the importer would persist: derived records.
    $derivedPair = deriveMissingCabangIds($sourceData);
    $derived = $derivedPair[0];
    $derivedById = [];
    foreach (v4ImportEntityKeys() as $entity) {
        foreach (($derived[$entity] ?? []) as $record) {
            if (is_array($record) && isset($record['id'])) {
                $derivedById[$entity][$record['id']] = $record;
                rctInsert($pdo, $entity, $record);
            }
        }
    }
    file_put_contents($tmpSource, json_encode(
        ['version' => 2, 'exportedAt' => '2026-09-10T00:00:00.000Z', 'data' => $sourceData],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    ));

    // --- probe 1: MATCH ------------------------------------------------
    echo "\n--- matching fixture ---\n";
    [$exit, $output] = runReconcile($tmpSource);
    check('matching fixture -> exit 0', $exit === 0, "exit=$exit out=$output");
    check('matching fixture prints MATCH', str_contains($output, 'MATCH'), $output);
    $reportPath = rctReportPath($output);
    check('report path printed', $reportPath !== null, $output);
    if ($reportPath !== null) $generatedReports[] = $reportPath;
    $report = $reportPath !== null && is_file($reportPath) ? json_decode((string) file_get_contents($reportPath), true) : null;
    check('report file written + valid JSON', is_array($report), (string) $reportPath);
    check('report verdict MATCH + zero drifts', is_array($report) && ($report['verdict'] ?? null) === 'MATCH' && ($report['drifts'] ?? null) === [], json_encode($report['drifts'] ?? null));
    check('sha256 signature verifies over the body', is_array($report) && rctVerifySignature($report));
    $countsOk = is_array($report);
    if (is_array($report)) {
        foreach (v4ImportEntityKeys() as $entity) {
            $c = $report['counts'][$entity] ?? null;
            if (!is_array($c) || ($c['source'] ?? null) !== 1 || ($c['matched'] ?? null) !== 1) { $countsOk = false; break; }
        }
    }
    check('per-entity counts source=1 matched=1 (all 9)', $countsOk, json_encode($report['counts'] ?? null));
    check(
        'ledger sums + invoice mix match the fixture',
        is_array($report) && ($report['ledgerSums']['sppPayments']['source'] ?? null) === 150000
            && ($report['ledgerSums']['honorPayments']['source'] ?? null) === 50000
            && ($report['invoiceStatus']['source'] ?? null) === ['Draft' => 1],
        json_encode(['ledger' => $report['ledgerSums'] ?? null, 'invoices' => $report['invoiceStatus'] ?? null])
    );
    $hasExtraNote = false;
    foreach ((is_array($report) ? ($report['notes'] ?? []) : []) as $note) {
        if (str_starts_with((string) $note, 'NOTE extra_in_db:')) { $hasExtraNote = true; break; }
    }
    check('canonical seed tolerated as NOTE extra_in_db (never DRIFT)', $hasExtraNote, json_encode($report['notes'] ?? null));

    // --- probe 2: seeded drift (one spp row deleted) --------------------
    echo "\n--- seeded drift: spp row deleted ---\n";
    $pdo->exec("DELETE FROM spp_payments WHERE id = 'spp-rct-1'");
    [$exit, $output] = runReconcile($tmpSource);
    check('drifted fixture -> exit 1', $exit === 1, "exit=$exit out=$output");
    check('drift output names sppPayments', str_contains($output, 'sppPayments'), $output);
    check('drift names the deleted row', str_contains($output, 'DRIFT missing:sppPayments:spp-rct-1'), $output);
    check('drift names the ledger sum', str_contains($output, 'DRIFT ledger:spp_payments'), $output);
    $reportPath = rctReportPath($output);
    if ($reportPath !== null) $generatedReports[] = $reportPath;
    $driftReport = $reportPath !== null && is_file($reportPath) ? json_decode((string) file_get_contents($reportPath), true) : null;
    check('drift report verdict DRIFT + signature verifies', is_array($driftReport) && ($driftReport['verdict'] ?? null) === 'DRIFT' && rctVerifySignature($driftReport));

    // --- probe 3: invoice status mix --------------------------------------
    echo "\n--- seeded drift: invoice status flip ---\n";
    rctInsert($pdo, 'sppPayments', $derivedById['sppPayments']['spp-rct-1']); // restore probe-2 row
    $invRow = $pdo->query("SELECT payload FROM invoices WHERE id = 'inv-rct-1'")->fetch();
    $invPayload = is_array($invRow) ? json_decode((string) $invRow['payload'], true) : null;
    $invPayload['status'] = 'Lunas';
    $pdo->prepare('UPDATE invoices SET payload = :payload WHERE id = :id')
        ->execute([':payload' => json_encode($invPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => 'inv-rct-1']);
    [$exit, $output] = runReconcile($tmpSource);
    check('status-flipped fixture -> exit 1', $exit === 1, "exit=$exit out=$output");
    check('drift names the invoice row', str_contains($output, 'DRIFT field:invoices:inv-rct-1'), $output);
    check('drift names the status mix', str_contains($output, 'DRIFT invoice_status:'), $output);
    $reportPath = rctReportPath($output);
    if ($reportPath !== null) $generatedReports[] = $reportPath;
    $statusReport = $reportPath !== null && is_file($reportPath) ? json_decode((string) file_get_contents($reportPath), true) : null;
    check('status report verdict DRIFT + signature verifies', is_array($statusReport) && ($statusReport['verdict'] ?? null) === 'DRIFT' && rctVerifySignature($statusReport));
} finally {
    // Destructive cleanup LAST (taste #55): fixture rows, temp source,
    // and the reports this run generated.
    try {
        cleanupRctFixtures($pdo);
    } catch (Throwable $error) {
        fwrite(STDERR, 'cleanup warning: ' . $error->getMessage() . "\n");
    }
    foreach ($generatedReports as $path) {
        if (is_string($path)) @unlink($path);
    }
    @unlink($tmpSource);
}

echo "\n$total checks, $failures failed\n";
exit($failures > 0 ? 1 : 0);
