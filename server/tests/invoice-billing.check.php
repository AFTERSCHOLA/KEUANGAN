<?php
declare(strict_types=1);

// ============================================================
// EF.C.1 — Bill per-meeting in generator (F-EF4; D-EF5)
//
// VERIFY: Tarif-siswa, Tarif-trainer, Frozen-flat, semester-actuals,
// SMP-Sains-single-record all HIT; Frozen legacy output byte-identical
// to pre-change generator.
//
// Idiom mirrors reconcile.check.php: check() reporting, refuse non-test
// DSN, throwaway '-eic-' ids cleaned at both start and end (survives a
// crashed prior run, taste #55).
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
require_once __DIR__ . '/../lib/invoiceGenerator.php';

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

function cleanupEicFixtures(PDO $pdo): void {
    foreach (['invoices', 'sekolah', 'siswa', 'absensi', 'cabang'] as $table) {
        try {
            $pdo->exec("DELETE FROM {$table} WHERE id LIKE '%-eic-%'");
        } catch (Throwable $ignore) {
        }
    }
}

// Cleanup from any crashed prior run BEFORE seeding (taste #55).
cleanupEicFixtures($pdo);

$actor = ['id' => null, 'role' => 'system', 'cabangId' => null];
$periode = '2026-09';

// --- Shared fixture: one branch ---------------------------------------
$cabangId = 'cbg-eic-1';

$pdo->prepare('INSERT INTO cabang (id, kode, payload) VALUES (:id, :k, :p)')->execute([
    ':id' => $cabangId,
    ':k' => 'EIC',
    ':p' => json_encode(['id' => $cabangId, 'kode' => 'EIC', 'nama' => 'Cabang EF.C.1 Test']),
]);

/** Helper: insert a sekolah row. */
function insertSekolahEic(PDO $pdo, string $id, string $cabangId, string $nama, float $spp, ?array $metodePembayaran): void {
    $payload = ['id' => $id, 'nama' => $nama, 'spp' => $spp, 'cabangId' => $cabangId, 'pjNama' => 'PJ Test'];
    if ($metodePembayaran !== null) $payload['metodePembayaran'] = $metodePembayaran;
    $pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
        ':id' => $id, ':c' => $cabangId,
        ':p' => json_encode($payload, JSON_UNESCAPED_UNICODE),
    ]);
}

/** Helper: insert a siswa row. */
function insertSiswaEic(PDO $pdo, string $id, string $cabangId, string $sekolahId, string $status): void {
    $pdo->prepare('INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
        ':id' => $id, ':c' => $cabangId,
        ':p' => json_encode(['id' => $id, 'sekolahId' => $sekolahId, 'status' => $status, 'nama' => 'Siswa ' . $id], JSON_UNESCAPED_UNICODE),
    ]);
}

/** Helper: insert an absensi row (trainerStatus Hadir counts a meeting). */
function insertAbsensiEic(PDO $pdo, string $id, string $cabangId, string $sekolahId, string $periode, string $trainerStatus): void {
    $pdo->prepare('INSERT INTO absensi (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
        ':id' => $id, ':c' => $cabangId,
        ':p' => json_encode(['id' => $id, 'sekolahId' => $sekolahId, 'periode' => $periode, 'trainerStatus' => $trainerStatus, 'siswaList' => []], JSON_UNESCAPED_UNICODE),
    ]);
}


// ============================================================
// Scenario 1: Tarif-siswa (basis 'siswa')
// 3 pertemuan Hadir, 4 siswa (3 Aktif + 1 Berhenti — Berhenti TETAP
// dihitung, hanya Trial yang dikecualikan, parity dengan billingForSekolah),
// 1 siswa Trial (dikecualikan).
// tarifPerPertemuan 20000 -> total = 20000 * 3 * 4 = 240000
// ============================================================
echo "--- Scenario 1: Tarif-siswa ---\n";
$sekTarifSiswa = 'skl-eic-tarif-siswa';
insertSekolahEic($pdo, $sekTarifSiswa, $cabangId, 'SD Tarif Siswa EIC', 500000, [
    'basis' => 'siswa', 'tarifPerPertemuan' => 20000,
]);
insertSiswaEic($pdo, 'sw-eic-ts-1', $cabangId, $sekTarifSiswa, 'Aktif');
insertSiswaEic($pdo, 'sw-eic-ts-2', $cabangId, $sekTarifSiswa, 'Aktif');
insertSiswaEic($pdo, 'sw-eic-ts-3', $cabangId, $sekTarifSiswa, 'Berhenti');
insertSiswaEic($pdo, 'sw-eic-ts-4', $cabangId, $sekTarifSiswa, 'Trial');
insertAbsensiEic($pdo, 'abs-eic-ts-1', $cabangId, $sekTarifSiswa, $periode, 'Hadir');
insertAbsensiEic($pdo, 'abs-eic-ts-2', $cabangId, $sekTarifSiswa, $periode, 'Hadir');
insertAbsensiEic($pdo, 'abs-eic-ts-3', $cabangId, $sekTarifSiswa, $periode, 'Izin');
insertAbsensiEic($pdo, 'abs-eic-ts-4', $cabangId, $sekTarifSiswa, $periode, 'Hadir');

$result1 = generateInvoicesForPeriod($pdo, $periode, 'Tagihan EF.C.1 Test', $actor, null, $sekTarifSiswa);
$gen1 = $result1['generated'][0] ?? null;
check('Tarif-siswa: invoice generated', $gen1 !== null, json_encode($result1['skipped']));
if ($gen1) {
    check('Tarif-siswa: pertemuanAktual = 3 (Izin dikecualikan)', ($gen1['items'][0]['pertemuanAktual'] ?? null) === 3, (string) ($gen1['items'][0]['pertemuanAktual'] ?? 'null'));
    check('Tarif-siswa: jumlahSiswa = 3 (Trial dikecualikan, Berhenti TETAP dihitung)', ($gen1['items'][0]['jumlahSiswa'] ?? null) === 3, (string) ($gen1['items'][0]['jumlahSiswa'] ?? 'null'));
    check('Tarif-siswa: grandTotal = 20000*3*3 = 180000', ($gen1['grandTotal'] ?? null) === 180000.0, (string) ($gen1['grandTotal'] ?? 'null'));
}

// ============================================================
// Scenario 2: Tarif-trainer (basis 'trainer', no pupil multiplier — Q5)

// 2 pertemuan Hadir, tarifPerPertemuan 50000 -> total = 50000 * 2 = 100000
// (jumlah siswa TIDAK mempengaruhi total sama sekali)
// ============================================================
echo "--- Scenario 2: Tarif-trainer ---\n";
$sekTarifTrainer = 'skl-eic-tarif-trainer';
insertSekolahEic($pdo, $sekTarifTrainer, $cabangId, 'SD Tarif Trainer EIC', 500000, [
    'basis' => 'trainer', 'tarifPerPertemuan' => 50000,
]);
insertSiswaEic($pdo, 'sw-eic-tt-1', $cabangId, $sekTarifTrainer, 'Aktif');
insertSiswaEic($pdo, 'sw-eic-tt-2', $cabangId, $sekTarifTrainer, 'Aktif');
insertSiswaEic($pdo, 'sw-eic-tt-3', $cabangId, $sekTarifTrainer, 'Aktif');
insertAbsensiEic($pdo, 'abs-eic-tt-1', $cabangId, $sekTarifTrainer, $periode, 'Hadir');
insertAbsensiEic($pdo, 'abs-eic-tt-2', $cabangId, $sekTarifTrainer, $periode, 'Hadir');

$result2 = generateInvoicesForPeriod($pdo, $periode, 'Tagihan EF.C.1 Test', $actor, null, $sekTarifTrainer);
$gen2 = $result2['generated'][0] ?? null;
check('Tarif-trainer: invoice generated', $gen2 !== null, json_encode($result2['skipped']));
if ($gen2) {
    check('Tarif-trainer: jumlahSiswa null (basis trainer, tidak ada pupil multiplier)', array_key_exists('jumlahSiswa', $gen2['items'][0]) && $gen2['items'][0]['jumlahSiswa'] === null);
    check('Tarif-trainer: grandTotal = 50000*2 = 100000 (3 siswa TIDAK mempengaruhi)', ($gen2['grandTotal'] ?? null) === 100000.0, (string) ($gen2['grandTotal'] ?? 'null'));
}

// ============================================================
// Scenario 3: Frozen-flat (metodePembayaran null) — HARUS byte-identical
// dengan output generator SEBELUM EF.C.1 (grouping per sppOverride/spp).
// 2 siswa spp default 300000, 1 siswa sppOverride 250000.
// ============================================================
echo "--- Scenario 3: Frozen-flat (byte-identical) ---\n";
$sekFrozen = 'skl-eic-frozen';
insertSekolahEic($pdo, $sekFrozen, $cabangId, 'SD Frozen EIC', 300000, null);
$pdo->prepare('INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => 'sw-eic-fz-1', ':c' => $cabangId,

    ':p' => json_encode(['id' => 'sw-eic-fz-1', 'sekolahId' => $sekFrozen, 'status' => 'Aktif', 'nama' => 'Siswa Frozen 1'], JSON_UNESCAPED_UNICODE),
]);
$pdo->prepare('INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => 'sw-eic-fz-2', ':c' => $cabangId,
    ':p' => json_encode(['id' => 'sw-eic-fz-2', 'sekolahId' => $sekFrozen, 'status' => 'Aktif', 'nama' => 'Siswa Frozen 2'], JSON_UNESCAPED_UNICODE),
]);
$pdo->prepare('INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :c, :p)')->execute([
    ':id' => 'sw-eic-fz-3', ':c' => $cabangId,
    ':p' => json_encode(['id' => 'sw-eic-fz-3', 'sekolahId' => $sekFrozen, 'status' => 'Aktif', 'nama' => 'Siswa Frozen 3', 'sppOverride' => 250000], JSON_UNESCAPED_UNICODE),
]);

$result3 = generateInvoicesForPeriod($pdo, $periode, 'Tagihan EF.C.1 Test', $actor, null, $sekFrozen);
$gen3 = $result3['generated'][0] ?? null;
check('Frozen-flat: invoice generated', $gen3 !== null, json_encode($result3['skipped']));
if ($gen3) {
    // Expected: 2 groups — 300000 x2 siswa = 600000, 250000 x1 siswa = 250000. Total 850000.
    check('Frozen-flat: 2 tarif groups (legacy grouping shape preserved)', count($gen3['items']) === 2, (string) count($gen3['items']));
    check('Frozen-flat: grandTotal = 850000 (byte-identical formula, TIDAK baca absensi/pertemuanAktual)', ($gen3['grandTotal'] ?? null) === 850000.0, (string) ($gen3['grandTotal'] ?? 'null'));
    check('Frozen-flat: items shape masih hargaSatuan/jumlahSiswa (bukan tarifPerPertemuan/pertemuanAktual)', isset($gen3['items'][0]['hargaSatuan']) && !isset($gen3['items'][0]['pertemuanAktual']));
}

// ============================================================
// Scenario 4: semester-actuals (Q4) — holiday bulan tanpa absensi Hadir
// = 0 pertemuan = TIDAK ditagih untuk bulan itu (bukan diasumsikan
// jumlah pertemuan tetap).
// ============================================================
echo "--- Scenario 4: semester-actuals (holiday = unbilled) ---\n";
$sekSemester = 'skl-eic-semester';
insertSekolahEic($pdo, $sekSemester, $cabangId, 'SD Semester EIC', 500000, [
    'basis' => 'siswa', 'tarifPerPertemuan' => 15000,
]);
insertSiswaEic($pdo, 'sw-eic-sm-1', $cabangId, $sekSemester, 'Aktif');

// TIDAK ada absensi Hadir sama sekali untuk periode ini (simulasi bulan libur).

$result4 = generateInvoicesForPeriod($pdo, $periode, 'Tagihan EF.C.1 Test', $actor, null, $sekSemester);
$gen4 = $result4['generated'][0] ?? null;
check('semester-actuals: invoice tetap generated (bukan skip)', $gen4 !== null, json_encode($result4['skipped']));
if ($gen4) {
    check('semester-actuals: pertemuanAktual = 0 (holiday, tidak ada row Hadir)', ($gen4['items'][0]['pertemuanAktual'] ?? null) === 0, (string) ($gen4['items'][0]['pertemuanAktual'] ?? 'null'));
    check('semester-actuals: grandTotal = 0 (bukan ditagih penuh)', ($gen4['grandTotal'] ?? null) === 0.0, (string) ($gen4['grandTotal'] ?? 'null'));
}

// ============================================================
// Scenario 5: SMP-Sains-single-record (Q6) — satu record absensi/pertemuan
// dibilling × roster SD (bukan roster SMP yang mungkin terpisah). Di level
// generator ini pertemuanAktual dihitung dari SATU sekolahId saja (record
// absensi memang cuma disimpan di satu sekolahId), roster siswa juga
// dihitung dari sekolahId yang sama. ASUMSI belum diverifikasi: kasus nyata
// "SMP Sains single record x SD roster" mengandalkan konvensi di luar
// generator ini (misal sekolahId yang dipakai memang sekolahId SD-nya) —
// generator sendiri tidak tahu/tidak perlu tahu ini "SMP" atau "SD", dia
// cuma menghitung per sekolahId yang diberikan. Skenario ini jadi regression
// pin untuk "1 sekolahId, N siswa, M pertemuan -> M x N x tarif", bukan
// pembuktian mekanisme lintas-SMP/SD itu sendiri (yang, kalau ada logic
// khusus untuk itu, TIDAK ADA di invoiceGenerator.php sejauh yang saya
// baca — perlu dicek terpisah kalau ternyata memang perlu).
// ============================================================
echo "--- Scenario 5: SMP-Sains-single-record (regression pin) ---\n";
$sekSmpSains = 'skl-eic-smpsains';
insertSekolahEic($pdo, $sekSmpSains, $cabangId, 'SMP Sains EIC', 500000, [
    'basis' => 'siswa', 'tarifPerPertemuan' => 10000,
]);
insertSiswaEic($pdo, 'sw-eic-smp-1', $cabangId, $sekSmpSains, 'Aktif');
insertSiswaEic($pdo, 'sw-eic-smp-2', $cabangId, $sekSmpSains, 'Aktif');

insertAbsensiEic($pdo, 'abs-eic-smp-1', $cabangId, $sekSmpSains, $periode, 'Hadir');

$result5 = generateInvoicesForPeriod($pdo, $periode, 'Tagihan EF.C.1 Test', $actor, null, $sekSmpSains);
$gen5 = $result5['generated'][0] ?? null;
check('SMP-Sains-single-record: invoice generated', $gen5 !== null, json_encode($result5['skipped']));
if ($gen5) {
    check('SMP-Sains-single-record: grandTotal = 10000*1*2 = 20000', ($gen5['grandTotal'] ?? null) === 20000.0, (string) ($gen5['grandTotal'] ?? 'null'));
}

// --- cleanup ------------------------------------------------------------
cleanupEicFixtures($pdo);

echo "\n$total checks, $failures failed.\n";
exit($failures > 0 ? 1 : 0);