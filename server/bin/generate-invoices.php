<?php
declare(strict_types=1);

// Run via cPanel cron, e.g. monthly on day 1:
//   php /home/USER/path/to/server/bin/generate-invoices.php
//
// No HTTP session exists here, so requireAuthenticatedUser()/requireCsrf()
// are never called — but bootstrap.php itself IS safe to require from CLI:
// its only top-level (non-function) code is securityHeaders(), which just
// calls header() a few times. Under the CLI SAPI, header() silently no-ops
// (there's no HTTP response to attach headers to), so this doesn't error
// or need special-casing. Requiring bootstrap.php gives us database()
// (which memoizes the PDO connection — reusing that instead of opening a
// second raw connection here), auditEvent(), jsonResponse(), etc. all in
// one shot instead of hand-picking individual files.
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/invoiceGenerator.php';

$pdo = database();

// Periode = current month, "YYYY-MM".
$periode = date('Y-m');

// Uraian comes from settings, id 'invoice-uraian-current' — superadmin is
// expected to keep this up to date via settings.php before each period's
// billing run. If it's missing, this is a hard stop, not a silent
// fallback: generating invoices with no description text (or stale text
// no one confirmed) is worse than not generating at all for this run.
$stmt = $pdo->prepare('SELECT payload FROM settings WHERE id = :id');
$stmt->execute([':id' => 'invoice-uraian-current']);
$row = $stmt->fetch();
if ($row === false) {
    fwrite(STDERR, "settings 'invoice-uraian-current' belum pernah diisi — batal generate.\n");
    exit(1);
}
$settingsPayload = json_decode($row['payload'], true);
$uraian = is_array($settingsPayload) ? ($settingsPayload['value'] ?? null) : null;
if (!is_string($uraian) || trim($uraian) === '') {
    fwrite(STDERR, "settings 'invoice-uraian-current' ada tapi field 'value' kosong/tidak valid — batal generate.\n");
    exit(1);
}

$systemActor = ['id' => null, 'role' => 'system', 'cabangId' => null];

try {
    $result = generateInvoicesForPeriod($pdo, $periode, $uraian, $systemActor, null);
} catch (InvalidArgumentException $error) {
    fwrite(STDERR, 'Gagal generate: ' . $error->getMessage() . "\n");
    exit(1);
}

echo "Periode: $periode\n";
echo 'Generated: ' . count($result['generated']) . "\n";
echo 'Skipped: ' . count($result['skipped']) . "\n";
foreach ($result['skipped'] as $s) {
    echo "  - {$s['sekolahId']}: {$s['reason']}\n";
}

exit(0);