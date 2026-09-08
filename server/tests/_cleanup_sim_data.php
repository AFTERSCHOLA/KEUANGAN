<?php
declare(strict_types=1);

// server/tests/_cleanup_sim_data.php
//
// Removes test data whose payload.nama contains a marker substring
// (default "Sim", matching the SIM-*/Simulasi- prefix convention used by
// tests/fixtures.js and the *-verify.spec.js suite). Run this periodically
// (or after a heavy Playwright session) to stop selectors like
// `div.filter({hasText}).first()` from hitting strict-mode violations
// against accumulated rows from prior runs.
//
// SAFETY: this script is DRY-RUN BY DEFAULT. It only prints what it would
// delete. Pass --execute to actually run the deletes. There are NO
// FOREIGN KEY constraints in schema.sql (verified 2026-09-07), so the
// database will NOT reject an out-of-order delete — it will silently
// leave orphaned payload references (e.g. absensi.payload.sekolahId
// pointing at a sekolah row that no longer exists) instead of erroring.
// The delete order below is deliberate and must not be reordered:
//   spp_payments, honor_payments  (leaf — reference siswa/trainer)
//   absensi                       (leaf — references sekolah/trainer)
//   siswa                         (references sekolah)
//   sekolah                       (root)
//   trainer                       (root)
//
// Usage:
//   php server/tests/_cleanup_sim_data.php                  # dry run, pattern "Sim"
//   php server/tests/_cleanup_sim_data.php --execute         # actually delete
//   php server/tests/_cleanup_sim_data.php --pattern=Simulasi --execute

require_once __DIR__ . '/../bootstrap.php';

$args = $argv ?? [];
$execute = in_array('--execute', $args, true);
$pattern = 'Sim';
foreach ($args as $arg) {
    if (str_starts_with($arg, '--pattern=')) {
        $pattern = substr($arg, strlen('--pattern='));
    }
}
if (trim($pattern) === '') {
    fwrite(STDERR, "--pattern tidak boleh kosong (mencegah DELETE tanpa filter).\n");
    exit(1);
}

$pdo = database();
$like = '%' . $pattern . '%';

function fetchIds(PDO $pdo, string $table, string $like): array
{
    $stmt = $pdo->prepare(
        "SELECT id FROM {$table} WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '\$.nama')) LIKE :like"
    );
    $stmt->execute([':like' => $like]);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function fetchDependentIds(PDO $pdo, string $table, string $jsonField, array $parentIds): array
{
    if (count($parentIds) === 0) return [];
    $placeholders = implode(',', array_fill(0, count($parentIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT id FROM {$table} WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '\$.{$jsonField}')) IN ({$placeholders})"
    );
    $stmt->execute($parentIds);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function deleteByIds(PDO $pdo, string $table, array $ids): int
{
    if (count($ids) === 0) return 0;
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("DELETE FROM {$table} WHERE id IN ({$placeholders})");
    $stmt->execute($ids);
    return $stmt->rowCount();
}

// --- Step 1: find root entities matching the pattern by their own nama ---
$sekolahIds = fetchIds($pdo, 'sekolah', $like);
$trainerIds = fetchIds($pdo, 'trainer', $like);

// --- Step 2: siswa matching by own nama OR belonging to a matched sekolah ---
$siswaByNama = fetchIds($pdo, 'siswa', $like);
$siswaBySekolah = fetchDependentIds($pdo, 'siswa', 'sekolahId', $sekolahIds);
$siswaIds = array_values(array_unique(array_merge($siswaByNama, $siswaBySekolah)));

// --- Step 3: leaf entities referencing the above by id (not by nama) ---
$absensiBySekolah = fetchDependentIds($pdo, 'absensi', 'sekolahId', $sekolahIds);
$absensiByTrainer = fetchDependentIds($pdo, 'absensi', 'trainerId', $trainerIds);
$absensiIds = array_values(array_unique(array_merge($absensiBySekolah, $absensiByTrainer)));

$sppIds = fetchDependentIds($pdo, 'spp_payments', 'siswaId', $siswaIds);
$honorIds = fetchDependentIds($pdo, 'honor_payments', 'trainerId', $trainerIds);

echo "Pattern: \"{$pattern}\" (matched against payload.nama)\n";
echo "Would delete:\n";
echo '  spp_payments:   ' . count($sppIds) . "\n";
echo '  honor_payments: ' . count($honorIds) . "\n";
echo '  absensi:        ' . count($absensiIds) . "\n";
echo '  siswa:          ' . count($siswaIds) . "\n";
echo '  sekolah:        ' . count($sekolahIds) . "\n";
echo '  trainer:        ' . count($trainerIds) . "\n";

if (!$execute) {
    echo "\nDRY RUN — nothing deleted. Re-run with --execute to apply.\n";
    exit(0);
}

$pdo->beginTransaction();
try {
    $deleted = [
        'spp_payments' => deleteByIds($pdo, 'spp_payments', $sppIds),
        'honor_payments' => deleteByIds($pdo, 'honor_payments', $honorIds),
        'absensi' => deleteByIds($pdo, 'absensi', $absensiIds),
        'siswa' => deleteByIds($pdo, 'siswa', $siswaIds),
        'sekolah' => deleteByIds($pdo, 'sekolah', $sekolahIds),
        'trainer' => deleteByIds($pdo, 'trainer', $trainerIds),
    ];
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, 'Cleanup failed, rolled back: ' . $e->getMessage() . "\n");
    exit(1);
}

echo "\nDeleted:\n";
foreach ($deleted as $table => $count) {
    echo "  {$table}: {$count}\n";
}
exit(0);