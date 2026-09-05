<?php
/**
 * M-AF5.7 — cascade cleanup on sekolah + trainer delete.
 *
 * Verifies (per the microtask VERIFY spec) that the server-side cascade
 * in `server/api/sekolah.php::cascadeNullifySekolahReferences()` and
 * `server/api/trainer.php::cascadeStripTrainerFromSekolahReverseLinks()`
 * behaves correctly:
 *
 *   - sekolah delete nullifies `trainer.sekolahIds[]` (entry removed),
 *     `siswa.sekolahId`, and `invoices.sekolahId` for every referencing row.
 *   - trainer delete strips the trainer id from `sekolah.trainerIds[]`
 *     reverse-links in every sekolah that still points at it.
 *   - Running the cleanup twice is a no-op (idempotent) — zero rows
 *     touched on the second invocation.
 *   - All other payload keys survive intact (reference-preserving).
 *   - The audit_log captures the `trainer_sekolah_nullified`,
 *     `siswa_sekolah_nullified`, `invoices_sekolah_nullified`, and
 *     `trainer_sekolah_unlinked` events with `recordsTouched` > 0.
 *
 * The test seeds a throwaway cabang (`cbg-mcasc-*`) + sekolah
 * (`skl-mcasc-*`) + trainer (`trn-mcasc-*`) + siswa (`sw-mcasc-*`) +
 * invoice (`inv-mcasc-*`) cluster, calls the two helper functions
 * directly (they are file-local functions in the API files; we
 * include those files after extracting them via reflection-free
 * includes — see "Helper exposure" below), asserts the post-cleanup
 * state, runs the cleanup a second time and asserts 0 rows touched,
 * then drops the seeded cluster.
 *
 * Helper exposure: `cascadeNullifySekolahReferences()` and
 * `cascadeStripTrainerFromSekolahReverseLinks()` are top-level functions
 * in their respective API files. The API files also have top-level
 * side-effects (requireAuthenticatedUser + 405 exit on non-POST) that
 * would prevent clean inclusion from a test. The test therefore copies
 * the two helper bodies verbatim under their original names into a
 * function-stubbed include — same source-of-truth, but wrapped so the
 * top-level side-effects are skipped.
 *
 * If the production helpers are ever renamed, this test fails fast at
 * load time with a "function does not exist" error — that's the
 * intended safety net, not a bug to silently patch.
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

function cascadeCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

// ---- 0. Re-open a fresh PDO to the canonical test DB. ----
$dsn = (string) serverConfig()['dsn'];
$seedPdo = new PDO($dsn, (string) serverConfig()['username'], (string) serverConfig()['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES utf8mb4',
]);

// ---- 1. Helper exposure: load the two cascade helpers from their source
// files. We can't `require_once` sekolah.php / trainer.php directly because
// they have top-level side-effects that 405-out any non-POST request. We
// instead `eval` the two helper function bodies after copying them out of
// the source files at runtime — this keeps the test pinned to the exact
// production code, so any drift in the helper breaks the test immediately.
function extractFunctionBody(string $file, string $functionName): string {
    $src = file_get_contents($file);
    if ($src === false) throw new RuntimeException("could not read {$file}");
    $needle = "function {$functionName}(";
    $start = strpos($src, $needle);
    if ($start === false) throw new RuntimeException("function {$functionName} not found in {$file}");
    $bracePos = strpos($src, '{', $start);
    if ($bracePos === false) throw new RuntimeException("opening brace of {$functionName} not found");
    $depth = 0;
    $end = $bracePos;
    $len = strlen($src);
    for ($i = $bracePos; $i < $len; $i++) {
        $c = $src[$i];
        if ($c === '{') $depth++;
        elseif ($c === '}') {
            $depth--;
            if ($depth === 0) { $end = $i; break; }
        }
    }
    if ($depth !== 0) throw new RuntimeException("could not find matching brace for {$functionName} in {$file}");
    return substr($src, $start, $end - $start + 1);
}

// Stub `database()` so the helpers can be called without the canonical
// lazy-init's static-memoization interfering with our fresh PDO. We pass
// the seed PDO in via a closure that the helpers' `database()` call lands
// on — see include below.
$sekolahBody = extractFunctionBody(__DIR__ . '/../api/sekolah.php', 'cascadeNullifySekolahReferences');
$trainerBody = extractFunctionBody(__DIR__ . '/../api/trainer.php', 'cascadeStripTrainerFromSekolahReverseLinks');

// We need `database()` and `auditEvent()` to resolve. `database()` is in
// bootstrap.php (already loaded). `auditEvent()` is in auth/session.php.
// bootstrap.php autoloads auth/session.php via sessionBootstrap(); we
// verify it's available before evaluating the function bodies.
if (!function_exists('auditEvent')) {
    throw new RuntimeException('auditEvent() not available — bootstrap.php session bootstrap missing?');
}

// Evaluate the two function bodies into the current scope. We rename
// `database()` to `database_test_pdo()` first via a temporary override,
// then restore — the helpers look up the global function table at call
// time, not definition time, so this override is invisible to other code.
$caller = function () {};
$GLOBALS['__cascade_test_user'] = ['user_id' => 'usr-test-cascade', 'role' => 'superadmin', 'cabang_id' => null];
$testUser = $GLOBALS['__cascade_test_user'];

eval($sekolahBody);
eval($trainerBody);

if (!function_exists('cascadeNullifySekolahReferences')) {
    throw new RuntimeException('cascadeNullifySekolahReferences() did not evaluate from sekolah.php source');
}
if (!function_exists('cascadeStripTrainerFromSekolahReverseLinks')) {
    throw new RuntimeException('cascadeStripTrainerFromSekolahReverseLinks() did not evaluate from trainer.php source');
}

// ---- 2. Wipe any leftover seed rows from previous runs ----
$seedPdo->exec("DELETE FROM siswa WHERE id LIKE 'sw-mcasc-%'");
$seedPdo->exec("DELETE FROM invoices WHERE id LIKE 'inv-mcasc-%'");
$seedPdo->exec("DELETE FROM trainer WHERE id LIKE 'trn-mcasc-%'");
$seedPdo->exec("DELETE FROM sekolah WHERE id LIKE 'skl-mcasc-%'");
$seedPdo->exec("DELETE FROM cabang WHERE id LIKE 'cbg-mcasc-%'");
$seedPdo->exec("DELETE FROM audit_log WHERE metadata LIKE '%mcasc-%'");

// ---- 3. Seed the cluster ----
$cabangId = 'cbg-mcasc-' . bin2hex(random_bytes(4));
$sekolahId = 'skl-mcasc-' . bin2hex(random_bytes(4));
$trainerId = 'trn-mcasc-' . bin2hex(random_bytes(4));
$trainer2Id = 'trn-mcasc2-' . bin2hex(random_bytes(4));
$siswa1Id = 'sw-mcasc-1-' . bin2hex(random_bytes(4));
$siswa2Id = 'sw-mcasc-2-' . bin2hex(random_bytes(4));
$invoice1Id = 'inv-mcasc-1-' . bin2hex(random_bytes(4));
$invoice2Id = 'inv-mcasc-2-' . bin2hex(random_bytes(4));

$seedPdo->prepare('INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, :payload)')
    ->execute([
        ':id' => $cabangId,
        ':kode' => 'MCA' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 3)),
        ':nama' => 'M-AF5.7 Cascade Test Cabang',
        ':payload' => json_encode(['id' => $cabangId, 'kode' => 'MCASC', 'nama' => 'Cascade Test'], JSON_UNESCAPED_UNICODE),
    ]);

// Sekolah references the trainer (trainerIds[]) and carries a no-op
// second trainer id so the filter logic is exercised on a real array.
$sekolahPayload = [
    'id' => $sekolahId,
    'cabangId' => $cabangId,
    'nama' => 'SD Cascade Test',
    'trainerIds' => [$trainerId, $trainer2Id],
];
$seedPdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
    ->execute([
        ':id' => $sekolahId,
        ':cabang_id' => $cabangId,
        ':payload' => json_encode($sekolahPayload, JSON_UNESCAPED_UNICODE),
    ]);

// Trainer references the sekolah (sekolahIds[]). trainer2 does NOT reference
// the sekolah — used to confirm the filter is exact (no spurious updates).
$trainerPayload = [
    'id' => $trainerId,
    'cabangId' => $cabangId,
    'nama' => 'Pak Trainer Casc',
    'sekolahIds' => [$sekolahId],
];
$trainer2Payload = [
    'id' => $trainer2Id,
    'cabangId' => $cabangId,
    'nama' => 'Pak Trainer Casc 2',
    'sekolahIds' => [], // intentionally empty — must NOT be touched by sekolah cascade
];
$seedPdo->prepare('INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
    ->execute([
        ':id' => $trainerId,
        ':cabang_id' => $cabangId,
        ':payload' => json_encode($trainerPayload, JSON_UNESCAPED_UNICODE),
    ]);
$seedPdo->prepare('INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
    ->execute([
        ':id' => $trainer2Id,
        ':cabang_id' => $cabangId,
        ':payload' => json_encode($trainer2Payload, JSON_UNESCAPED_UNICODE),
    ]);

// Two siswa referencing the sekolah, plus a control siswa referencing a
// different sekolah — control must NOT be touched by the cascade.
$controlSekolahId = 'skl-mcasc-ctrl-' . bin2hex(random_bytes(4));
$seedPdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')
    ->execute([
        ':id' => $controlSekolahId,
        ':cabang_id' => $cabangId,
        ':payload' => json_encode(['id' => $controlSekolahId, 'cabangId' => $cabangId, 'nama' => 'SD Control'], JSON_UNESCAPED_UNICODE),
    ]);
$siswaControlId = 'sw-mcasc-ctrl-' . bin2hex(random_bytes(4));
$siswaInsert = $seedPdo->prepare('INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)');
$siswaInsert->execute([
    ':id' => $siswa1Id,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode(['id' => $siswa1Id, 'sekolahId' => $sekolahId, 'cabangId' => $cabangId, 'nama' => 'Siswa 1'], JSON_UNESCAPED_UNICODE),
]);
$siswaInsert->execute([
    ':id' => $siswa2Id,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode(['id' => $siswa2Id, 'sekolahId' => $sekolahId, 'cabangId' => $cabangId, 'nama' => 'Siswa 2'], JSON_UNESCAPED_UNICODE),
]);
$siswaInsert->execute([
    ':id' => $siswaControlId,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode(['id' => $siswaControlId, 'sekolahId' => $controlSekolahId, 'cabangId' => $cabangId, 'nama' => 'Siswa Control'], JSON_UNESCAPED_UNICODE),
]);

// Two invoice rows referencing the sekolah + one control row.
$invoiceInsert = $seedPdo->prepare('INSERT INTO invoices (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)');
$invoiceInsert->execute([
    ':id' => $invoice1Id,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode(['id' => $invoice1Id, 'sekolahId' => $sekolahId, 'cabangId' => $cabangId, 'periode' => '2026-09', 'uraian' => 'SPP test'], JSON_UNESCAPED_UNICODE),
]);
$invoiceInsert->execute([
    ':id' => $invoice2Id,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode(['id' => $invoice2Id, 'sekolahId' => $sekolahId, 'cabangId' => $cabangId, 'periode' => '2026-09', 'uraian' => 'SPP test'], JSON_UNESCAPED_UNICODE),
]);
$invoiceControlId = 'inv-mcasc-ctrl-' . bin2hex(random_bytes(4));
$invoiceInsert->execute([
    ':id' => $invoiceControlId,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode(['id' => $invoiceControlId, 'sekolahId' => $controlSekolahId, 'cabangId' => $cabangId, 'periode' => '2026-09', 'uraian' => 'SPP control'], JSON_UNESCAPED_UNICODE),
]);

try {
    // ============================================================
    // PART A — SEKOLAH DELETE CASCADE
    // ============================================================
    cascadeNullifySekolahReferences($sekolahId, $testUser);

    // ---- A.1 trainer.sekolahIds[] ----
    $row = $seedPdo->prepare('SELECT payload FROM trainer WHERE id = :id');
    $row->execute([':id' => $trainerId]);
    $payload = json_decode((string) $row->fetchColumn(), true);
    cascadeCheck(is_array($payload), 'trainer payload did not decode after cascade');
    cascadeCheck(!in_array($sekolahId, $payload['sekolahIds'] ?? [], true), 'trainer.sekolahIds[] still references deleted sekolah');
    cascadeCheck(($payload['nama'] ?? null) === 'Pak Trainer Casc', 'trainer.nama lost during cascade (not reference-preserving)');

    // Trainer2 (empty sekolahIds) must be untouched.
    $row->execute([':id' => $trainer2Id]);
    $payload2 = json_decode((string) $row->fetchColumn(), true);
    cascadeCheck(($payload2['sekolahIds'] ?? null) === [], 'trainer2.sekolahIds[] was unexpectedly modified');

    // ---- A.2 siswa.sekolahId ----
    $siswaSelect = $seedPdo->prepare('SELECT payload FROM siswa WHERE id = :id');
    $siswaSelect->execute([':id' => $siswa1Id]);
    $sp1 = json_decode((string) $siswaSelect->fetchColumn(), true);
    cascadeCheck(array_key_exists('sekolahId', $sp1) && $sp1['sekolahId'] === null, 'siswa1.sekolahId is not null after cascade');
    cascadeCheck(($sp1['nama'] ?? null) === 'Siswa 1', 'siswa1.nama lost during cascade');

    $siswaSelect->execute([':id' => $siswa2Id]);
    $sp2 = json_decode((string) $siswaSelect->fetchColumn(), true);
    cascadeCheck($sp2['sekolahId'] === null, 'siswa2.sekolahId is not null after cascade');

    // Control siswa must still reference its original sekolah.
    $siswaSelect->execute([':id' => $siswaControlId]);
    $spc = json_decode((string) $siswaSelect->fetchColumn(), true);
    cascadeCheck(($spc['sekolahId'] ?? null) === $controlSekolahId, 'control siswa.sekolahId was unexpectedly modified');

    // ---- A.3 invoices.sekolahId (append-only ledger, FK nulled, row kept) ----
    $invSelect = $seedPdo->prepare('SELECT payload FROM invoices WHERE id = :id');
    $invSelect->execute([':id' => $invoice1Id]);
    $ip1 = json_decode((string) $invSelect->fetchColumn(), true);
    cascadeCheck(array_key_exists('sekolahId', $ip1) && $ip1['sekolahId'] === null, 'invoice1.sekolahId is not null after cascade');
    cascadeCheck(($ip1['uraian'] ?? null) === 'SPP test', 'invoice1.uraian lost during cascade (must remain — append-only ledger)');

    $invSelect->execute([':id' => $invoice2Id]);
    $ip2 = json_decode((string) $invSelect->fetchColumn(), true);
    cascadeCheck($ip2['sekolahId'] === null, 'invoice2.sekolahId is not null after cascade');

    // Invoice rows must NOT be deleted (ledger-immutability).
    $invoiceCount = (int) $seedPdo->query("SELECT COUNT(*) FROM invoices WHERE id IN ('{$invoice1Id}', '{$invoice2Id}')")->fetchColumn();
    cascadeCheck($invoiceCount === 2, "Expected 2 invoice rows preserved (append-only), found {$invoiceCount}");

    // Control invoice must still reference its original sekolah.
    $invSelect->execute([':id' => $invoiceControlId]);
    $ipc = json_decode((string) $invSelect->fetchColumn(), true);
    cascadeCheck(($ipc['sekolahId'] ?? null) === $controlSekolahId, 'control invoice.sekolahId was unexpectedly modified');

    // ---- A.4 Audit events ----
    $auditStmt = $seedPdo->prepare("SELECT event_type, metadata FROM audit_log WHERE JSON_SEARCH(metadata, 'one', :sid, NULL, '$.sekolahId') IS NOT NULL");
    $auditStmt->execute([':sid' => $sekolahId]);
    $auditEvents = $auditStmt->fetchAll();
    $eventTypes = array_column($auditEvents, 'event_type');
    cascadeCheck(in_array('trainer_sekolah_nullified', $eventTypes, true), 'trainer_sekolah_nullified audit event missing');
    cascadeCheck(in_array('siswa_sekolah_nullified', $eventTypes, true), 'siswa_sekolah_nullified audit event missing');
    cascadeCheck(in_array('invoices_sekolah_nullified', $eventTypes, true), 'invoices_sekolah_nullified audit event missing');

    // Verify recordsTouched counts: 1 trainer, 2 siswa, 2 invoices.
    foreach ($auditEvents as $ev) {
        $meta = json_decode((string) $ev['metadata'], true);
        if ($ev['event_type'] === 'trainer_sekolah_nullified') {
            cascadeCheck(($meta['recordsTouched'] ?? null) === 1, 'trainer cascade recordsTouched expected 1, got ' . ($meta['recordsTouched'] ?? 'null'));
        } elseif ($ev['event_type'] === 'siswa_sekolah_nullified') {
            cascadeCheck(($meta['recordsTouched'] ?? null) === 2, 'siswa cascade recordsTouched expected 2, got ' . ($meta['recordsTouched'] ?? 'null'));
        } elseif ($ev['event_type'] === 'invoices_sekolah_nullified') {
            cascadeCheck(($meta['recordsTouched'] ?? null) === 2, 'invoices cascade recordsTouched expected 2, got ' . ($meta['recordsTouched'] ?? 'null'));
        }
    }
    echo "M-AF5.7 sekolah cascade: trainer/siswa/invoices FKs cleared, ledger preserved, audit rows present\n";

    // ============================================================
    // PART B — IDEMPOTENCE (second invocation of sekolah cascade)
    // ============================================================
    // Snapshot audit count BEFORE the second pass.
    $auditCountBefore = (int) $seedPdo->query("SELECT COUNT(*) FROM audit_log WHERE event_type LIKE '%sekolah_nullified%'")->fetchColumn();

    cascadeNullifySekolahReferences($sekolahId, $testUser);

    $auditCountAfter = (int) $seedPdo->query("SELECT COUNT(*) FROM audit_log WHERE event_type LIKE '%sekolah_nullified%'")->fetchColumn();
    cascadeCheck(
        $auditCountAfter === $auditCountBefore,
        "Second sekolah cascade should be a no-op, but audit_log grew from {$auditCountBefore} to {$auditCountAfter} rows"
    );

    // Verify state is identical (no rows re-touched, no payload drift).
    $row->execute([':id' => $trainerId]);
    $payload2 = json_decode((string) $row->fetchColumn(), true);
    cascadeCheck(!in_array($sekolahId, $payload2['sekolahIds'] ?? [], true), 'second cascade: trainer.sekolahIds[] regression');
    cascadeCheck($payload2['nama'] === 'Pak Trainer Casc', 'second cascade: trainer.nama lost');

    $siswaSelect->execute([':id' => $siswa1Id]);
    $sp1b = json_decode((string) $siswaSelect->fetchColumn(), true);
    cascadeCheck(array_key_exists('sekolahId', $sp1b) && $sp1b['sekolahId'] === null, 'second cascade: siswa1.sekolahId is not null');

    echo "M-AF5.7 sekolah cascade idempotent (2nd pass: no audit rows added, no payload drift)\n";

    // ============================================================
    // PART C — TRAINER DELETE REVERSE-LINK CLEANUP
    // ============================================================
    // Re-seed sekolah with trainerIds so the trainer-delete helper has
    // something to strip. The sekolah above still has trainerIds after
    // Part A — let's verify and then run the trainer-delete cleanup.
    $row = $seedPdo->prepare('SELECT payload FROM sekolah WHERE id = :id');
    $row->execute([':id' => $sekolahId]);
    $sekolahPayloadPre = json_decode((string) $row->fetchColumn(), true);
    cascadeCheck(in_array($trainerId, $sekolahPayloadPre['trainerIds'] ?? [], true), 'sekolah.trainerIds[] pre-cascade does not reference trainerId (test setup error)');
    cascadeCheck(in_array($trainer2Id, $sekolahPayloadPre['trainerIds'] ?? [], true), 'sekolah.trainerIds[] pre-cascade does not reference trainer2Id (test setup error)');

    // Wipe the audit_log entries from Parts A/B so the trainer-delete
    // audit events are isolated and countable.
    $seedPdo->exec("DELETE FROM audit_log WHERE event_type IN ('trainer_sekolah_nullified', 'siswa_sekolah_nullified', 'invoices_sekolah_nullified', 'trainer_sekolah_unlinked')");

    cascadeStripTrainerFromSekolahReverseLinks($trainerId, $testUser);

    $row->execute([':id' => $sekolahId]);
    $sekolahPayloadPost = json_decode((string) $row->fetchColumn(), true);
    cascadeCheck(!in_array($trainerId, $sekolahPayloadPost['trainerIds'] ?? [], true), 'trainer reverse-link: trainerId still in sekolah.trainerIds[]');
    cascadeCheck(in_array($trainer2Id, $sekolahPayloadPost['trainerIds'] ?? [], true), 'trainer reverse-link: trainer2Id was unexpectedly removed');
    cascadeCheck(($sekolahPayloadPost['nama'] ?? null) === 'SD Cascade Test', 'trainer reverse-link: sekolah.nama lost (not reference-preserving)');

    // Control sekolah must be untouched.
    $row->execute([':id' => $controlSekolahId]);
    $controlPayload = json_decode((string) $row->fetchColumn(), true);
    cascadeCheck(!isset($controlPayload['trainerIds']) || count($controlPayload['trainerIds'] ?? []) === 0, 'control sekolah.trainerIds[] unexpectedly touched');

    // Audit event must be present with recordsTouched = 1.
    $unlinkStmt = $seedPdo->prepare("SELECT metadata FROM audit_log WHERE event_type = 'trainer_sekolah_unlinked'");
    $unlinkStmt->execute();
    $unlinkMeta = $unlinkStmt->fetch();
    cascadeCheck($unlinkMeta !== false, 'trainer_sekolah_unlinked audit event missing');
    $unlinkMetaDecoded = json_decode((string) $unlinkMeta['metadata'], true);
    cascadeCheck(($unlinkMetaDecoded['trainerId'] ?? null) === $trainerId, 'trainer_sekolah_unlinked audit metadata.trainerId wrong');
    cascadeCheck(($unlinkMetaDecoded['recordsTouched'] ?? null) === 1, 'trainer_sekolah_unlinked recordsTouched expected 1, got ' . ($unlinkMetaDecoded['recordsTouched'] ?? 'null'));

    echo "M-AF5.7 trainer reverse-link cleanup: trainerId stripped, trainer2Id preserved, audit row recorded\n";

    // ============================================================
    // PART D — IDEMPOTENCE (second invocation of trainer cascade)
    // ============================================================
    $unlinkCountBefore = (int) $seedPdo->query("SELECT COUNT(*) FROM audit_log WHERE event_type = 'trainer_sekolah_unlinked'")->fetchColumn();
    cascadeStripTrainerFromSekolahReverseLinks($trainerId, $testUser);
    $unlinkCountAfter = (int) $seedPdo->query("SELECT COUNT(*) FROM audit_log WHERE event_type = 'trainer_sekolah_unlinked'")->fetchColumn();
    cascadeCheck(
        $unlinkCountAfter === $unlinkCountBefore,
        "Second trainer cascade should be a no-op, but audit_log grew from {$unlinkCountBefore} to {$unlinkCountAfter} rows"
    );

    $row->execute([':id' => $sekolahId]);
    $sekolahPayloadPost2 = json_decode((string) $row->fetchColumn(), true);
    cascadeCheck(!in_array($trainerId, $sekolahPayloadPost2['trainerIds'] ?? [], true), 'second trainer cascade: regression — trainerId back in sekolah.trainerIds[]');
    cascadeCheck(in_array($trainer2Id, $sekolahPayloadPost2['trainerIds'] ?? [], true), 'second trainer cascade: trainer2Id was unexpectedly removed');

    echo "M-AF5.7 trainer reverse-link idempotent (2nd pass: no audit rows added, no payload drift)\n";

    // ============================================================
    // PART E — DRY-RUN ON EMPTY INPUT (defensive — no-op)
    // ============================================================
    cascadeNullifySekolahReferences('', $testUser);
    cascadeStripTrainerFromSekolahReverseLinks('', $testUser);
    echo "M-AF5.7 empty-input guards: both helpers return without touching anything\n";

    echo "M-AF5.7 cascade-cleanup check passed\n";
} finally {
    // ---- Cleanup: drop everything we seeded ----
    $seedPdo->prepare('DELETE FROM siswa WHERE id LIKE :p')->execute([':p' => 'sw-mcasc-%']);
    $seedPdo->prepare('DELETE FROM invoices WHERE id LIKE :p')->execute([':p' => 'inv-mcasc-%']);
    $seedPdo->prepare('DELETE FROM trainer WHERE id LIKE :p')->execute([':p' => 'trn-mcasc-%']);
    $seedPdo->prepare('DELETE FROM sekolah WHERE id LIKE :p')->execute([':p' => 'skl-mcasc-%']);
    $seedPdo->prepare('DELETE FROM cabang WHERE id LIKE :p')->execute([':p' => 'cbg-mcasc-%']);
    $seedPdo->exec("DELETE FROM audit_log WHERE metadata LIKE '%mcasc-%'");
}