<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../validation/entities.php';

/**
 * M3.2 VERIFY: fixtures reject missing ownership, invalid references,
 * duplicate IDs, unknown roles, invalid enums, and oversized payloads.
 */

function fixtureCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

function hasError(array $errors, string $needle): bool {
    foreach ($errors as $error) if (stripos($error, $needle) !== false) return true;
    return false;
}

function assertSame(mixed $expected, mixed $actual, string $message = ''): void {
    if ($expected !== $actual) {
        throw new RuntimeException(
            $message !== '' ? $message : 'assertSame failed'
        );
    }
}

function assertContains(string $needle, array $haystack, string $message = ''): void {
    foreach ($haystack as $value) {
        if (is_string($value) && stripos($value, $needle) !== false) {
            return;
        }
    }

    throw new RuntimeException(
        $message !== '' ? $message : "assertContains failed: {$needle}"
    );
}

$pdo = database();

// Seed a real cabang + sekolah + trainer to validate references against.
$cabangId = 'cbg-m32-' . bin2hex(random_bytes(4));
$pdo->prepare('INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, :payload)')->execute([
    ':id' => $cabangId,
    ':kode' => 'M32' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 3)),
    ':nama' => 'M3.2 Test Cabang',
    ':payload' => json_encode(['id' => $cabangId], JSON_UNESCAPED_UNICODE),
]);

$sekolahId = 'skl-m32-' . bin2hex(random_bytes(4));
$pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')->execute([
    ':id' => $sekolahId,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode(['id' => $sekolahId, 'cabangId' => $cabangId], JSON_UNESCAPED_UNICODE),
]);

$otherCabangId = 'cbg-m32-other-' . bin2hex(random_bytes(4));
$pdo->prepare('INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, :payload)')->execute([
    ':id' => $otherCabangId,
    ':kode' => 'M32' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 3)),
    ':nama' => 'M3.2 Other Cabang',
    ':payload' => json_encode(['id' => $otherCabangId], JSON_UNESCAPED_UNICODE),
]);

$trainerId = 'trn-m32-' . bin2hex(random_bytes(4));
$pdo->prepare('INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')->execute([
    ':id' => $trainerId,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode(['id' => $trainerId, 'cabangId' => $cabangId], JSON_UNESCAPED_UNICODE),
]);

// TA.A.1 — tipePengajar enum (D-TA1/D-TA2/D-TA3/D-TA5)
// Field optional untuk menjaga backward compatibility dengan trainer lama.
$trainerBase = [
    'id' => 'trn-ta1-' . bin2hex(random_bytes(3)),
    'cabangId' => $cabangId,
    'honor' => 100,
];

$errors = validateTrainer($trainerBase + ['tipePengajar' => 'instruktur'], $pdo);
fixtureCheck(
    $errors === [],
    'trainer with tipePengajar=instruktur should validate, got: ' . implode('; ', $errors)
);

$errors = validateTrainer($trainerBase + ['tipePengajar' => 'asisten'], $pdo);
fixtureCheck(
    $errors === [],
    'trainer with tipePengajar=asisten should validate, got: ' . implode('; ', $errors)
);

$errors = validateTrainer($trainerBase + ['tipePengajar' => 'admin'], $pdo);
fixtureCheck(
    hasError($errors, 'tipePengajar'),
    'trainer with invalid tipePengajar should be rejected'
);

// Backward compatibility: trainer lama tanpa tipePengajar tetap valid.
$errors = validateTrainer($trainerBase, $pdo);
fixtureCheck(
    $errors === [],
    'legacy trainer without tipePengajar should still validate, got: ' . implode('; ', $errors)
);

echo "TA.A.1 tipePengajar enum/backward-compatibility check passed\n";


// TA.A.2 — trainer assignment schema
// Gunakan fixture yang benar-benar sudah ada di database agar
// pengecekan referensi sekolah/trainer ikut benar-benar teruji.

$assistant1Id = 'trn-m32-assistant-1-' . bin2hex(random_bytes(3));
$assistant2Id = 'trn-m32-assistant-2-' . bin2hex(random_bytes(3));

foreach ([
    [$assistant1Id, 'M3A1'],
    [$assistant2Id, 'M3A2'],
] as [$assistantId, $kodeSuffix]) {
    $pdo->prepare(
        'INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)'
    )->execute([
        ':id' => $assistantId,
        ':cabang_id' => $cabangId,
        ':payload' => json_encode([
            'id' => $assistantId,
            'cabangId' => $cabangId,
            'tipePengajar' => 'asisten',
        ], JSON_UNESCAPED_UNICODE),
    ]);
}

$trainerWithAssignments = [
    'id' => $trainerId,
    'cabangId' => $cabangId,
    'sekolahIds' => [$sekolahId],
    'tipePengajar' => 'instruktur',
    'penugasanPengajar' => [
        [
            'sekolahId' => $sekolahId,
            'trainerId' => $trainerId,
            'asistenId' => $assistant1Id,
        ],
        [
            'sekolahId' => $sekolahId,
            'trainerId' => $trainerId,
            'asistenId' => $assistant2Id,
        ],
        [
            'sekolahId' => $sekolahId,
            'trainerId' => $trainerId,
            'asistenId' => null,
        ],
    ],
];

assertSame(
    [],
    validateTrainer($trainerWithAssignments, $pdo),
    'TA.A.2 multiple trainer assignments with nullable asistenId'
);

$invalidAssignmentSchool = $trainerWithAssignments;
$invalidAssignmentSchool['penugasanPengajar'][0]['sekolahId'] = 'sekolah-does-not-exist';

assertContains(
    'sekolahId does not reference an existing sekolah',
    validateTrainer($invalidAssignmentSchool, $pdo),
    'TA.A.2 invalid sekolah reference must be rejected'
);

$invalidAssignmentTrainer = $trainerWithAssignments;
$invalidAssignmentTrainer['penugasanPengajar'][0]['trainerId'] = 'trainer-does-not-exist';

assertContains(
    'trainerId does not reference an existing trainer',
    validateTrainer($invalidAssignmentTrainer, $pdo),
    'TA.A.2 invalid trainer reference must be rejected'
);

$invalidAssignmentAssistant = $trainerWithAssignments;
$invalidAssignmentAssistant['penugasanPengajar'][0]['asistenId'] = 'trainer-does-not-exist';

assertContains(
    'asistenId does not reference an existing trainer',
    validateTrainer($invalidAssignmentAssistant, $pdo),
    'TA.A.2 invalid asisten reference must be rejected'
);

echo "TA.A.2 trainer assignment schema check passed\n";

// SB.B.1 — seed a real siswa so validateSppPayment()'s siswaId reference
// check has something valid to point at.
$siswaId = 'sw-sb1-' . bin2hex(random_bytes(4));
$pdo->prepare('INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')->execute([
    ':id' => $siswaId,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode([
        'id' => $siswaId,
        'cabangId' => $cabangId,
        'sekolahId' => $sekolahId,
        'status' => 'Aktif',
    ], JSON_UNESCAPED_UNICODE),
]);

// SBF.2 — seed a real invoice so invoice-level payment rows have
// something valid to point at.
$invoiceId = 'inv-sbf2-' . bin2hex(random_bytes(4));
$pdo->prepare('INSERT INTO invoices (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)')->execute([
    ':id' => $invoiceId,
    ':cabang_id' => $cabangId,
    ':payload' => json_encode([
        'id' => $invoiceId,
        'cabangId' => $cabangId,
        'sekolahId' => $sekolahId,
        'periode' => '2031-02',
        'status' => 'Terbit',
    ], JSON_UNESCAPED_UNICODE),
]);

try {
    // ================= missing ownership =================
    $errors = validateSekolah(['id' => 'skl-x'], $pdo);
    fixtureCheck(hasError($errors, 'cabangId is required'), 'sekolah without cabangId should fail ownership check');

    $errors = validateSiswa(['id' => 'sw-x', 'sekolahId' => $sekolahId, 'status' => 'Aktif'], $pdo);
    fixtureCheck(hasError($errors, 'cabangId is required'), 'siswa without cabangId should fail ownership check');
    echo "M3.2 missing-ownership check passed\n";

    // ================= invalid references =================
    $errors = validateSekolah(['id' => 'skl-x', 'cabangId' => 'cbg-does-not-exist'], $pdo);
    fixtureCheck(hasError($errors, 'does not reference an existing cabang'), 'sekolah with a fake cabangId should fail reference check');

    $errors = validateAbsensi(['id' => 'abs-x', 'sekolahId' => 'skl-does-not-exist', 'trainerId' => $trainerId], $pdo);
    fixtureCheck(hasError($errors, 'does not reference an existing sekolah'), 'absensi with a fake sekolahId should fail reference check');

    // Referential consistency, not just existence: siswa.cabangId must match
    // the sekolah it points at, not just be A valid cabang somewhere.
    $errors = validateSiswa(['id' => 'sw-x', 'sekolahId' => $sekolahId, 'cabangId' => $otherCabangId, 'status' => 'Aktif'], $pdo);
    fixtureCheck(hasError($errors, 'does not match the branch'), 'siswa.cabangId mismatched against its sekolah should fail');
    echo "M3.2 invalid-references check passed\n";

    // ================= duplicate IDs =================
    $dupSekolahId = 'skl-m32-dup-' . bin2hex(random_bytes(4));
    $insertSekolah = $pdo->prepare('INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)');
    $insertSekolah->execute([':id' => $dupSekolahId, ':cabang_id' => $cabangId, ':payload' => json_encode(['id' => $dupSekolahId], JSON_UNESCAPED_UNICODE)]);
    try {
        $insertSekolah->execute([':id' => $dupSekolahId, ':cabang_id' => $cabangId, ':payload' => json_encode(['id' => $dupSekolahId], JSON_UNESCAPED_UNICODE)]);
        throw new RuntimeException('Duplicate sekolah id was accepted');
    } catch (PDOException $error) {
        fixtureCheck($error->getCode() === '23000', 'Duplicate sekolah id failed with unexpected error: ' . $error->getMessage());
    }
    echo "M3.2 duplicate-id check passed\n";

    // ================= unknown roles =================
    $badUserId = 'usr-m32-' . bin2hex(random_bytes(4));
    try {
        $pdo->prepare("INSERT INTO users (id, username, display_name, password_hash, role, active, must_change_password) VALUES (:id, :username, 'M3.2 Bad Role', :hash, 'admin', 1, 1)")
            ->execute([':id' => $badUserId, ':username' => 'm32.badrole.' . bin2hex(random_bytes(4)) . '@dev.test', ':hash' => password_hash('Whatever123', PASSWORD_DEFAULT)]);
        throw new RuntimeException('Unknown role "admin" was accepted by the users table');
    } catch (PDOException $error) {
        fixtureCheck(in_array($error->getCode(), ['01000', '22001', 'HY000'], true) || str_contains($error->getMessage(), 'Data truncated'), 'Unknown-role insert failed with an unexpected error: ' . $error->getMessage());
    }
    fixtureCheck(!validServerRole('admin'), 'PHP-level validServerRole() should also reject "admin"');
    echo "M3.2 unknown-role check passed\n";

    // ================= invalid enums =================
    $errors = validateSiswa(['id' => 'sw-x', 'sekolahId' => $sekolahId, 'cabangId' => $cabangId, 'status' => 'Lulus'], $pdo);
    fixtureCheck(hasError($errors, 'is not one of'), 'siswa with an unrecognized status should fail enum check');

    $errors = validateSiswa(['id' => 'sw-x', 'sekolahId' => $sekolahId, 'cabangId' => $cabangId, 'status' => 'Berhenti'], $pdo);
    fixtureCheck(!hasError($errors, 'is not one of'), 'siswa with status Berhenti should be a valid enum value');
    echo "M3.2 invalid-enum check passed\n";

    // ================= oversized payloads =================
    $oversized = ['id' => 'sw-x', 'sekolahId' => $sekolahId, 'cabangId' => $cabangId, 'status' => 'Aktif', 'catatan' => str_repeat('x', 250 * 1024)];
    $errors = validateSiswa($oversized, $pdo);
    fixtureCheck(hasError($errors, 'exceeds limit'), 'oversized siswa payload should be rejected');

    $normal = ['id' => 'sw-x', 'sekolahId' => $sekolahId, 'cabangId' => $cabangId, 'status' => 'Aktif'];
    $errors = validateSiswa($normal, $pdo);
    fixtureCheck(!hasError($errors, 'exceeds limit'), 'a normal-sized siswa payload should not trip the size limit');
    echo "M3.2 oversized-payload check passed\n";

    // ================= SB.B.1 — sumberDana enum (D-SB12) =================
    $basePayment = ['id' => 'spp-sb1-' . bin2hex(random_bytes(3)), 'siswaId' => $siswaId];

    $errors = validateSppPayment($basePayment + ['sumberDana' => 'sekolah'], $pdo);
    fixtureCheck($errors === [], 'sppPayments with sumberDana=sekolah should validate, got: ' . implode('; ', $errors));

    $errors = validateSppPayment($basePayment + ['sumberDana' => 'ortu'], $pdo);
    fixtureCheck($errors === [], 'sppPayments with sumberDana=ortu should validate, got: ' . implode('; ', $errors));

    $errors = validateSppPayment($basePayment + ['sumberDana' => 'bank'], $pdo);
    fixtureCheck(hasError($errors, 'sumberDana'), 'sppPayments with an out-of-enum sumberDana should be rejected');

    // Legacy payload: field absent entirely — must still validate (R-SB3,
    // non-destructive migration). This is the assertion that would catch
    // someone later "tightening" the field into a required one.
    $errors = validateSppPayment($basePayment, $pdo);
    fixtureCheck($errors === [], 'legacy sppPayments without sumberDana should still validate, got: ' . implode('; ', $errors));

    echo "SB.B.1 sumberDana enum check passed\n";

    // ================= SBF.2 — invoice-level rows (D-SB8/D-SBF2) =================
    $invoiceBase = ['id' => 'spp-sbf2-' . bin2hex(random_bytes(3))];

    $errors = validateSppPayment($invoiceBase + ['siswaId' => null, 'invoiceId' => $invoiceId], $pdo);
    fixtureCheck($errors === [], 'invoice-level sppPayments (null siswaId + real invoiceId) should validate, got: ' . implode('; ', $errors));

    $errors = validateSppPayment($invoiceBase + ['invoiceId' => 'inv-does-not-exist'], $pdo);
    fixtureCheck(hasError($errors, 'invoiceId'), 'sppPayments with a fake invoiceId should be rejected');

    $errors = validateSppPayment($invoiceBase + ['invoiceId' => $invoiceId, 'sekolahId' => 'skl-wrong-school'], $pdo);
    fixtureCheck(hasError($errors, 'sekolahId'), 'sppPayments with mismatched sekolahId should be rejected (R-SB6)');

    $errors = validateSppPayment($invoiceBase + ['invoiceId' => $invoiceId, 'sekolahId' => $sekolahId], $pdo);
    fixtureCheck($errors === [], 'invoice-level sppPayments with matching sekolahId should validate, got: ' . implode('; ', $errors));

    echo "SBF.2 invoice-level payment check passed\n";
} finally {
    $pdo->prepare('DELETE FROM invoices WHERE cabang_id = :c')->execute([':c' => $cabangId]);
    $pdo->prepare('DELETE FROM siswa WHERE cabang_id = :c')->execute([':c' => $cabangId]);
    $pdo->prepare('DELETE FROM sekolah WHERE cabang_id IN (:c1, :c2)')->execute([':c1' => $cabangId, ':c2' => $otherCabangId]);
    $pdo->prepare('DELETE FROM trainer WHERE cabang_id = :c')->execute([':c' => $cabangId]);
    $pdo->prepare('DELETE FROM cabang WHERE id IN (:c1, :c2)')->execute([':c1' => $cabangId, ':c2' => $otherCabangId]);
}