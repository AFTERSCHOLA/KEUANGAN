<?php
declare(strict_types=1);

/**
 * M3.2 — entity validation helpers.
 *
 * Pure functions: given a decoded JSON payload for one record, return a
 * list of error strings (empty = valid). Reference checks that need the
 * database take $pdo explicitly rather than reaching for a global, so
 * these stay testable against fixtures without a live server.
 *
 * Ownership (explicit cabangId):
 *   - sekolah, siswa, invoices: REQUIRED (schema.sql has cabang_id NOT
 *     NULL on these three tables).
 *   - trainer, absensi, sppPayments, honorPayments, settings: OPTIONAL —
 *     schema.sql allows NULL here. If present, must be a non-empty string
 *     and (where a reference exists) must agree with the referenced
 *     record's branch.
 *
 * Known gap: siswa records built by src/lib/constants.js's newSiswa() do
 * not stamp a cabangId at all, only sekolahId — yet schema.sql requires
 * siswa.cabang_id NOT NULL. Until the client stamps it directly (mirroring
 * the M3.1/KI-1 fix for trainer), the API layer that calls this validator
 * (M3.3/M3.4) MUST derive cabangId from the referenced sekolah before
 * validation, the same way trainer ownership required an explicit
 * cabangId fix. validateSiswa() enforces this by checking siswa.cabangId
 * equals the referenced sekolah's cabangId — it does not derive it itself.
 */

const MAX_RECORD_PAYLOAD_BYTES = 200 * 1024; // 200KB per record — CONFIRMED, not
// a guess. Photos never land in payload JSON: dokumentasi[] entries store
// only an IndexedDB pointer ({key, size, slot, type: 'idb'}), never a
// base64 dataURL (PRODUCTION_PLAN.md section 8 requires authorized upload
// endpoints for photo bytes, not inline payload). The heaviest real
// record observed (absensi with a 30-siswa siswaList + 2 photo pointers)
// runs a few KB; a generated invoice with dozens of line items runs low
// tens of KB. 200KB leaves roughly a 10-40x margin over anything actually
// produced by this app's data shapes — kept as-is, not tightened or
// loosened without a concrete record that needs it.

const SISWA_STATUS_VALUES = ['Aktif', 'Trial', 'Berhenti'];

const TRAINER_STATUS_VALUES = ['Hadir', 'Izin', 'Alpa'];
// Confirmed from src/features/attendance/AttendanceForm.jsx (line ~232) —
// the only three pill-button options the UI offers for trainer status.
// No 'Sakit' value exists in the app today. finance.js only ever checks
// `=== 'Hadir'` for honor eligibility, so this validation doesn't change
// any finance behavior — it just stops a typo/garbage value (e.g. from a
// future client bug or a hand-crafted API call) from silently landing in
// the database and rendering as-is in RiwayatAbsensi.jsx/TrainerHistory.jsx.

const SPP_PAYMENT_SUMBER_DANA_VALUES = ['sekolah', 'ortu'];
// SB.B.1 (D-SB12) — payment source, independent from `metode` (channel).
// Optional field: legacy payloads without it still validate (R-SB3-style
// non-destructive migration, mirrored from D-SB7 for sekolah). When
// present, must be one of the enum values below — this only rejects
// garbage/typo values, it does not require the field.

function requireNonEmptyString(mixed $value): bool {
    return is_string($value) && trim($value) !== '';
}

function checkPayloadSize(array $data, string $label): array {
    $errors = [];
    $size = strlen(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');
    if ($size > MAX_RECORD_PAYLOAD_BYTES) {
        $errors[] = "{$label}: payload size {$size} bytes exceeds limit of " . MAX_RECORD_PAYLOAD_BYTES . ' bytes';
    }
    return $errors;
}

function rowExists(PDO $pdo, string $table, string $id): bool {
    $stmt = $pdo->prepare("SELECT 1 FROM `{$table}` WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $id]);
    return $stmt->fetchColumn() !== false;
}

function cabangIdOf(PDO $pdo, string $table, string $id): ?string {
    $stmt = $pdo->prepare("SELECT cabang_id FROM `{$table}` WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $id]);
    $value = $stmt->fetchColumn();
    return is_string($value) ? $value : null;
}

function validateSekolah(array $data, PDO $pdo): array {
    $errors = array_merge([], checkPayloadSize($data, 'sekolah'));
    if (!requireNonEmptyString($data['id'] ?? null)) $errors[] = 'sekolah: id is required';
    if (!requireNonEmptyString($data['cabangId'] ?? null)) {
        $errors[] = 'sekolah: cabangId is required (ownership)';
    } elseif (!rowExists($pdo, 'cabang', $data['cabangId'])) {
        $errors[] = 'sekolah: cabangId does not reference an existing cabang';
    }
    return $errors;
}

function validateTrainer(array $data, PDO $pdo): array {
    $errors = array_merge([], checkPayloadSize($data, 'trainer'));
    if (!requireNonEmptyString($data['id'] ?? null)) $errors[] = 'trainer: id is required';
    $cabangId = $data['cabangId'] ?? null;
    if ($cabangId !== null) {
        if (!requireNonEmptyString($cabangId)) {
            $errors[] = 'trainer: cabangId, if present, must be a non-empty string';
        } elseif (!rowExists($pdo, 'cabang', $cabangId)) {
            $errors[] = 'trainer: cabangId does not reference an existing cabang';
        }
    }
    foreach (($data['sekolahIds'] ?? []) as $sekolahId) {
        if (!is_string($sekolahId) || !rowExists($pdo, 'sekolah', $sekolahId)) {
            $errors[] = "trainer: sekolahIds references non-existent sekolah '{$sekolahId}'";
        }
    }
    return $errors;
}

function validateSiswa(array $data, PDO $pdo): array {
    $errors = array_merge([], checkPayloadSize($data, 'siswa'));
    if (!requireNonEmptyString($data['id'] ?? null)) $errors[] = 'siswa: id is required';

    $sekolahId = $data['sekolahId'] ?? null;
    $sekolahCabangId = null;
    if (!requireNonEmptyString($sekolahId)) {
        $errors[] = 'siswa: sekolahId is required';
    } elseif (!rowExists($pdo, 'sekolah', $sekolahId)) {
        $errors[] = "siswa: sekolahId does not reference an existing sekolah";
    } else {
        $sekolahCabangId = cabangIdOf($pdo, 'sekolah', $sekolahId);
    }

    // Ownership: required, and must agree with the referenced sekolah's
    // branch — not merely "any real cabang". See file docblock: the
    // client does not stamp this yet, so a caller enriching the payload
    // (M3.3/M3.4) must derive it from the sekolah relationship.
    $cabangId = $data['cabangId'] ?? null;
    if (!requireNonEmptyString($cabangId)) {
        $errors[] = 'siswa: cabangId is required (ownership) — must be derived from the sekolah relationship before validation';
    } elseif ($sekolahCabangId !== null && $cabangId !== $sekolahCabangId) {
        $errors[] = 'siswa: cabangId does not match the branch of the referenced sekolah';
    }

    $status = $data['status'] ?? null;
    if (!in_array($status, SISWA_STATUS_VALUES, true)) {
        $errors[] = "siswa: status '" . var_export($status, true) . "' is not one of " . implode(', ', SISWA_STATUS_VALUES);
    }
    return $errors;
}

function validateAbsensi(array $data, PDO $pdo): array {
    $errors = array_merge([], checkPayloadSize($data, 'absensi'));
    if (!requireNonEmptyString($data['id'] ?? null)) $errors[] = 'absensi: id is required';
    if (!requireNonEmptyString($data['sekolahId'] ?? null) || !rowExists($pdo, 'sekolah', $data['sekolahId'])) {
        $errors[] = 'absensi: sekolahId does not reference an existing sekolah';
    }
    if (!requireNonEmptyString($data['trainerId'] ?? null) || !rowExists($pdo, 'trainer', $data['trainerId'])) {
        $errors[] = 'absensi: trainerId does not reference an existing trainer';
    }
    $trainerStatus = $data['trainerStatus'] ?? null;
    if (!in_array($trainerStatus, TRAINER_STATUS_VALUES, true)) {
        $errors[] = "absensi: trainerStatus '" . var_export($trainerStatus, true) . "' is not one of " . implode(', ', TRAINER_STATUS_VALUES);
    }
    return $errors;
}

function validateHonorPayment(array $data, PDO $pdo): array {
    $errors = array_merge([], checkPayloadSize($data, 'honorPayments'));
    if (!requireNonEmptyString($data['id'] ?? null)) $errors[] = 'honorPayments: id is required';
    if (!requireNonEmptyString($data['trainerId'] ?? null) || !rowExists($pdo, 'trainer', $data['trainerId'])) {
        $errors[] = 'honorPayments: trainerId does not reference an existing trainer';
    }
    return $errors;
}

function validateSppPayment(array $data, PDO $pdo): array {
    $errors = array_merge([], checkPayloadSize($data, 'sppPayments'));
    if (!requireNonEmptyString($data['id'] ?? null)) $errors[] = 'sppPayments: id is required';
    // SBF.2 (D-SBF2, D-SB8) — invoice-level rows: siswaId may be null/empty
    // iff invoiceId references an existing invoice. Legacy per-siswa rows
    // (no invoiceId) validate exactly as before (R-SB3). When both are
    // present, each reference is checked independently; a supplied
    // sekolahId must match the invoice's sekolahId (R-SB6), absent is
    // tolerated (no writer sends it yet — full column deferred, §8).
    $invoiceId = $data['invoiceId'] ?? null;
    $hasInvoiceRef = is_string($invoiceId) && trim($invoiceId) !== '';
    $siswaId = $data['siswaId'] ?? null;
    $hasSiswaRef = requireNonEmptyString($siswaId);
    if ($hasInvoiceRef) {
        $invStmt = $pdo->prepare("SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sekolahId')) FROM invoices WHERE id = :id");
        $invStmt->execute([':id' => $invoiceId]);
        $invSekolahId = $invStmt->fetchColumn();
        if ($invSekolahId === false) {
            $errors[] = 'sppPayments: invoiceId does not reference an existing invoice';
        } else {
            $rowSekolahId = $data['sekolahId'] ?? null;
            if (is_string($rowSekolahId) && trim($rowSekolahId) !== '' && $rowSekolahId !== $invSekolahId) {
                $errors[] = 'sppPayments: sekolahId does not match the referenced invoice (R-SB6)';
            }
        }
        if ($hasSiswaRef && !rowExists($pdo, 'siswa', $siswaId)) {
            $errors[] = 'sppPayments: siswaId does not reference an existing siswa';
        }
    } elseif (!$hasSiswaRef || !rowExists($pdo, 'siswa', $siswaId)) {
        $errors[] = 'sppPayments: siswaId does not reference an existing siswa';
    }
    $sumberDana = $data['sumberDana'] ?? null;
    if ($sumberDana !== null && !in_array($sumberDana, SPP_PAYMENT_SUMBER_DANA_VALUES, true)) {
        $errors[] = "sppPayments: sumberDana '" . var_export($sumberDana, true) . "' is not one of " . implode(', ', SPP_PAYMENT_SUMBER_DANA_VALUES);
    }
    return $errors;
}

function validateInvoice(array $data, PDO $pdo): array {
    $errors = array_merge([], checkPayloadSize($data, 'invoices'));
    if (!requireNonEmptyString($data['id'] ?? null)) $errors[] = 'invoices: id is required';
    $sekolahId = $data['sekolahId'] ?? null;
    if (!requireNonEmptyString($sekolahId) || !rowExists($pdo, 'sekolah', $sekolahId)) {
        $errors[] = 'invoices: sekolahId does not reference an existing sekolah';
    }
    if (!requireNonEmptyString($data['cabangId'] ?? null)) {
        $errors[] = 'invoices: cabangId is required (ownership)';
    }
    return $errors;
}

/** @return array<int,string> */
function validateRecord(string $entity, array $data, PDO $pdo): array {
    return match ($entity) {
        'sekolah' => validateSekolah($data, $pdo),
        'trainer' => validateTrainer($data, $pdo),
        'siswa' => validateSiswa($data, $pdo),
        'absensi' => validateAbsensi($data, $pdo),
        'honorPayments' => validateHonorPayment($data, $pdo),
        'sppPayments' => validateSppPayment($data, $pdo),
        'invoices' => validateInvoice($data, $pdo),
        default => ["{$entity}: no validator defined for this entity"],
    };
}