<?php
declare(strict_types=1);

// RH.F.2 — Reconciliation CLI (F-RH7, M6.2, R-RH6).
//
// Verifies the live DB against a v4 export (the operator's browser data):
//   php server/bin/reconcile.php <v4-export.json>
//
// Compares, source vs DB: per-entity counts, per-branch tallies, ledger
// sums (spp_payments, honor_payments), invoice status mix — plus id-level
// missing/payload checks so every drift line names the entity (and id).
// Writes a sha256-signed report under private/reports/ (outside the API
// document surface) and prints a summary.
//
// Exit codes (pinned, taste #17): 0 = MATCH, 1 = DRIFT, 2 = usage/IO/DB error.
//
// Concrete picks:
//   - Source normalization reuses server/lib/v4Import.php
//     (shapeNormalize -> deriveMissingCabangIds) — the exact pipeline the
//     RH.F.1 importer persists — so derived cabangIds compare equal instead
//     of false-drifting on fields the client legitimately omits.
//   - Superset-tolerant verdict: every SOURCE id must exist in the DB with
//     an equal payload; extra DB rows (e.g. the canonical test seed
//     cbg-test-pusat + 2 trainers) are reported as NOTE extra_in_db lines,
//     never DRIFT. Production imports land on an empty DB (D-RH2), where
//     superset == equal, so the guarantee is identical there.
//   - Signature: sha256 hex over the canonical JSON of the report body —
//     the report minus its trailing signatureAlgo/signature keys, with
//     recursive key-sort (see reconcileCanonical()). The verifier recomputes
//     the same way; any byte change in the body breaks the signature.
//   - Read-only: this script never INSERTs/UPDATEs/DELETEs — it opens its
//     own PDO (not bootstrap database(), whose jsonResponse() would exit 0
//     on config failure and break the exit-code contract) and only SELECTs.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "Rekonsiliasi hanya dapat dijalankan melalui CLI.\n";
    exit(2);
}

require_once __DIR__ . '/../lib/v4Import.php';
require_once __DIR__ . '/../auth/session.php';

const RECONCILE_TABLES = [
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

function reconFail(string $message): never {
    fwrite(STDERR, $message . "\n");
    exit(2);
}

/** Recursive key-sort canonicalization for hashing and comparison. */
function reconcileCanonical(mixed $value): mixed {
    if (!is_array($value)) {
        if (is_float($value) && floor($value) === $value) return (int) $value;
        return $value;
    }
    if (v4ImportIsList($value)) return array_map('reconcileCanonical', $value);
    ksort($value, SORT_STRING);
    foreach ($value as $k => $v) $value[$k] = reconcileCanonical($v);
    return $value;
}

function reconcilePayloadsEqual(mixed $a, mixed $b): bool {
    return reconcileCanonical($a) === reconcileCanonical($b);
}

function reconcileBranchOf(array $record): string {
    $cabang = $record['cabangId'] ?? null;
    if (!is_string($cabang) || trim($cabang) === '') return '(tanpa-cabang)';
    return trim($cabang);
}

function reconcileStatusOf(array $record): string {
    $status = $record['status'] ?? null;
    if (!is_string($status) || trim($status) === '') return '(tanpa-status)';
    return trim($status);
}

function reconcileNominalOf(array $record): float {
    $nominal = $record['nominal'] ?? 0;
    return is_numeric($nominal) ? (float) $nominal : 0.0;
}

function reconcileNum(float $n): int|float {
    return floor($n) === $n ? (int) $n : $n;
}

// --- argv ---------------------------------------------------------------
if ($argc !== 2 || !is_string($argv[1]) || trim($argv[1]) === '') {
    fwrite(STDERR, "Gunakan: php server/bin/reconcile.php <v4-export.json>\n");
    exit(2);
}
$sourceArg = trim($argv[1]);
if (!is_file($sourceArg) || !is_readable($sourceArg)) {
    reconFail("File sumber tidak dapat dibaca: {$sourceArg}");
}
$raw = file_get_contents($sourceArg);
if (!is_string($raw) || $raw === '') reconFail("File sumber kosong: {$sourceArg}");
$doc = json_decode($raw, true);
if (!is_array($doc)) reconFail('File sumber bukan JSON valid: ' . json_last_error_msg());

// --- normalize the source exactly like the importer stores it ------------
$normalized = shapeNormalize($doc);
if ($normalized['shape'] === 'unknown') {
    reconFail('Format sumber tidak dikenali: butuh {version:2,data:{…}} atau {entities:{…}}');
}
[$entities] = deriveMissingCabangIds($normalized['entities']);
$sourceTotal = 0;
foreach (v4ImportEntityKeys() as $entity) $sourceTotal += count($entities[$entity] ?? []);
if ($sourceTotal === 0) reconFail('File sumber tidak memuat data');

$sourceById = [];
foreach (v4ImportEntityKeys() as $entity) {
    $sourceById[$entity] = [];
    foreach (($entities[$entity] ?? []) as $record) {
        if (!is_array($record) || !isset($record['id']) || !is_string($record['id'])) continue;
        $sourceById[$entity][$record['id']] = $record;
    }
}

// --- read the live DB (SELECT only) --------------------------------------
try {
    $config = serverConfig();
    $pdo = new PDO(
        (string) ($config['dsn'] ?? ''),
        (string) ($config['username'] ?? ''),
        (string) ($config['password'] ?? ''),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $error) {
    reconFail('BLOCKER: cannot reach database: ' . $error->getMessage());
}

$dbById = [];
$dbCounts = [];
try {
    foreach (RECONCILE_TABLES as $entity => $table) {
        $dbById[$entity] = [];
        $rows = $pdo->query("SELECT id, payload FROM {$table}")->fetchAll();
        foreach ($rows as $row) {
            $payload = json_decode((string) $row['payload'], true);
            $dbById[$entity][$row['id']] = is_array($payload) ? $payload : [];
        }
        $dbCounts[$entity] = count($dbById[$entity]);
    }
} catch (Throwable $error) {
    reconFail('BLOCKER: failed reading live tables: ' . $error->getMessage());
}

// --- compare --------------------------------------------------------------
$drifts = [];
$notes = [];

// 1. Per-entity counts + id-level checks.
$counts = [];
$matchedTotal = 0;
foreach (v4ImportEntityKeys() as $entity) {
    $sourceN = count($sourceById[$entity]);
    $matched = 0;
    foreach ($sourceById[$entity] as $id => $record) {
        if (!array_key_exists($id, $dbById[$entity])) {
            $drifts[] = "DRIFT missing:{$entity}:{$id}";
            continue;
        }
        $matched++;
        if (!reconcilePayloadsEqual($record, $dbById[$entity][$id])) {
            $drifts[] = "DRIFT field:{$entity}:{$id}";
        }
    }
    if ($matched !== $sourceN) {
        $drifts[] = "DRIFT count:{$entity} source={$sourceN} db={$matched}";
    }
    foreach ($dbById[$entity] as $id => $_row) {
        if (!array_key_exists($id, $sourceById[$entity])) {
            $notes[] = "NOTE extra_in_db:{$entity}:{$id}";
        }
    }
    $matchedTotal += $matched;
    $counts[$entity] = ['source' => $sourceN, 'db' => $dbCounts[$entity], 'matched' => $matched];
}

// 2. Per-branch tallies (cabang rows ARE branches — nothing to group).
$branchTallies = [];
foreach (v4ImportEntityKeys() as $entity) {
    if ($entity === 'cabang') continue;
    $sourceGroups = [];
    foreach ($sourceById[$entity] as $record) {
        $branch = reconcileBranchOf($record);
        $sourceGroups[$branch] = ($sourceGroups[$branch] ?? 0) + 1;
    }
    $dbGroups = [];
    foreach ($sourceById[$entity] as $id => $record) {
        if (!array_key_exists($id, $dbById[$entity])) continue;
        $branch = reconcileBranchOf($dbById[$entity][$id]);
        $dbGroups[$branch] = ($dbGroups[$branch] ?? 0) + 1;
    }
    foreach (array_unique(array_merge(array_keys($sourceGroups), array_keys($dbGroups))) as $branch) {
        $s = $sourceGroups[$branch] ?? 0;
        $d = $dbGroups[$branch] ?? 0;
        if ($s !== 0 || $d !== 0) $branchTallies[$branch][$entity] = ['source' => $s, 'matched' => $d];
        if ($s !== $d) $drifts[] = "DRIFT branch:{$entity}:{$branch} source={$s} db={$d}";
    }
}
ksort($branchTallies, SORT_STRING);

// 3. Ledger sums (global, over the matched source ids).
$ledgerSums = [];
foreach (['sppPayments', 'honorPayments'] as $entity) {
    $sourceSum = 0.0;
    foreach ($sourceById[$entity] as $record) $sourceSum += reconcileNominalOf($record);
    $dbSum = 0.0;
    foreach ($sourceById[$entity] as $id => $_record) {
        if (!array_key_exists($id, $dbById[$entity])) continue;
        $dbSum += reconcileNominalOf($dbById[$entity][$id]);
    }
    $ledgerSums[$entity] = ['source' => reconcileNum($sourceSum), 'matched' => reconcileNum($dbSum)];
    if ($sourceSum != $dbSum) {
        $table = RECONCILE_TABLES[$entity];
        $drifts[] = "DRIFT ledger:{$table} source=" . reconcileNum($sourceSum) . ' db=' . reconcileNum($dbSum);
    }
}

// 4. Invoice status mix (over the matched source ids).
$invoiceSource = [];
foreach ($sourceById['invoices'] as $record) {
    $status = reconcileStatusOf($record);
    $invoiceSource[$status] = ($invoiceSource[$status] ?? 0) + 1;
}
$invoiceDb = [];
foreach ($sourceById['invoices'] as $id => $_record) {
    if (!array_key_exists($id, $dbById['invoices'])) continue;
    $status = reconcileStatusOf($dbById['invoices'][$id]);
    $invoiceDb[$status] = ($invoiceDb[$status] ?? 0) + 1;
}
ksort($invoiceSource, SORT_STRING);
ksort($invoiceDb, SORT_STRING);
foreach (array_unique(array_merge(array_keys($invoiceSource), array_keys($invoiceDb))) as $status) {
    $s = $invoiceSource[$status] ?? 0;
    $d = $invoiceDb[$status] ?? 0;
    if ($s !== $d) $drifts[] = "DRIFT invoice_status:{$status} source={$s} db={$d}";
}

$verdict = $drifts === [] ? 'MATCH' : 'DRIFT';

// --- signed report ---------------------------------------------------------
$report = [
    'generatedAt' => gmdate('c'),
    'sourceFile' => realpath($sourceArg) ?: $sourceArg,
    'shape' => $normalized['shape'],
    'verdict' => $verdict,
    'counts' => $counts,
    'branchTallies' => $branchTallies,
    'ledgerSums' => $ledgerSums,
    'invoiceStatus' => ['source' => $invoiceSource, 'matched' => $invoiceDb],
    'drifts' => $drifts,
    'notes' => $notes,
    'warnings' => $normalized['warnings'],
];
$canonical = json_encode(reconcileCanonical($report), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (!is_string($canonical)) reconFail('BLOCKER: failed encoding the report body');
$report['signatureAlgo'] = 'sha256';
$report['signature'] = hash('sha256', $canonical);

$reportsDir = dirname(__DIR__, 2) . '/private/reports';
if (!is_dir($reportsDir) && !@mkdir($reportsDir, 0777, true) && !is_dir($reportsDir)) {
    reconFail("BLOCKER: cannot create reports dir: {$reportsDir}");
}
$stamp = date('Ymd-His');
$reportPath = "{$reportsDir}/reconcile-{$stamp}.json";
for ($n = 2; file_exists($reportPath); $n++) {
    $reportPath = "{$reportsDir}/reconcile-{$stamp}-{$n}.json";
}
if (@file_put_contents($reportPath, json_encode($report, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)) === false) {
    reconFail("BLOCKER: cannot write report: {$reportPath}");
}

// --- summary ----------------------------------------------------------------
if ($verdict === 'MATCH') {
    echo "MATCH: {$sourceTotal} source records verified across 9 entities ({$matchedTotal} matched)\n";
} else {
    echo 'DRIFT: ' . count($drifts) . " drift(s) found\n";
    foreach ($drifts as $line) echo $line . "\n";
}
echo "REPORT {$reportPath}\n";
echo 'SIGNATURE sha256:' . $report['signature'] . "\n";

exit($verdict === 'MATCH' ? 0 : 1);
