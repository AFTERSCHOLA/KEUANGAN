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

const TRAINER_TIPE_PENGAJAR_VALUES = ['instruktur', 'asisten'];

const PENUGASAN_HARI_VALUES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

const SPP_PAYMENT_SUMBER_DANA_VALUES = ['sekolah', 'ortu'];
// Confirmed from src/features/attendance/AttendanceForm.jsx (line ~232) —
// the only three pill-button options the UI offers for trainer status.
// No 'Sakit' value exists in the app today. finance.js only ever checks
// `=== 'Hadir'` for honor eligibility, so this validation doesn't change
// any finance behavior — it just stops a typo/garbage value (e.g. from a
// future client bug or a hand-crafted API call) from silently landing in
// the database and rendering as-is in RiwayatAbsensi.jsx/TrainerHistory.jsx.


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

// PS.A.1 (F-PS2/F-PS3; D-PS2/D-PS3/D-PS5) — school slot vocabulary.
// Returns null when the sekolah row is missing (caller already errors on
// sekolahId); otherwise the decoded jadwalList array (possibly empty).
function sekolahJadwalList(PDO $pdo, mixed $sekolahId): ?array {
    if (!is_string($sekolahId) || trim($sekolahId) === '') return null;
    $stmt = $pdo->prepare("SELECT payload FROM `sekolah` WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $sekolahId]);
    $raw = $stmt->fetchColumn();
    if (!is_string($raw)) return null;
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) return null;
    $list = $decoded['jadwalList'] ?? null;
    if (!is_array($list)) return [];
    return $list;
}

function isValidTimeHM(mixed $value): bool {
    return is_string($value) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) === 1;
}

// CS.B.1 (F-CS2; D-CS2) — cover-link helpers. A cover assignment row
// carries coverOf = origin assignment id + same sekolahId/slot scope.
// Origin lookup scans every trainer payload (assignments live on the
// host trainer's record, mirroring trainerHasActiveAssignment() in
// server/auth/authorize.php). Returns the origin row array or null.
function findAssignmentById(PDO $pdo, string $assignmentId): ?array {
    $rows = $pdo->query('SELECT payload FROM trainer ORDER BY created_at, id')->fetchAll();
    foreach ($rows as $row) {
        $payload = json_decode((string) ($row['payload'] ?? ''), true);
        if (!is_array($payload)) continue;
        $assignments = $payload['penugasanPengajar'] ?? [];
        if (!is_array($assignments)) continue;
        foreach ($assignments as $assignment) {
            if (is_array($assignment) && ($assignment['id'] ?? null) === $assignmentId) return $assignment;
        }
    }
    return null;
}

// CS.B.1 (D-CS2) — scope overlap for a cover/origin pair. Unscoped
// (null triple) on either side fans out over every slot, so it overlaps
// anything in the same school; two scoped rows overlap only on exact
// triple equality (same YAGNI rule as hasOverlappingActiveAssignment()
// in server/lib/assignments.php — no interval overlap).
function assignmentSlotKey(?array $assignment): string {
    if ($assignment === null) return json_encode([null, null, null]);
    $hari = $assignment['hari'] ?? null;
    $mulai = $assignment['jamMulai'] ?? null;
    $selesai = $assignment['jamSelesai'] ?? null;
    if ($hari === '') $hari = null;
    if ($mulai === '') $mulai = null;
    if ($selesai === '') $selesai = null;
    return json_encode([$hari, $mulai, $selesai]);
}

function isUnscopedSlotKey(string $slotKey): bool {
    return $slotKey === json_encode([null, null, null]);
}

function coverScopeOverlaps(array $coverRow, array $originRow): bool {
    if (($coverRow['sekolahId'] ?? null) !== ($originRow['sekolahId'] ?? null)) return false;
    $coverKey = assignmentSlotKey($coverRow);
    $originKey = assignmentSlotKey($originRow);
    if (isUnscopedSlotKey($coverKey) || isUnscopedSlotKey($originKey)) return true;
    return $coverKey === $originKey;
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

    if (!requireNonEmptyString($data['id'] ?? null)) {
        $errors[] = 'trainer: id is required';
    }

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

        // TA.A.2 — assignment schema.
    // Satu trainer/instruktur dapat memiliki banyak assignment,
    // satu sekolah dapat memiliki banyak assignment, dan asistenId
    // boleh null untuk assignment tanpa asisten.
    if (array_key_exists('penugasanPengajar', $data)) {
        if (!is_array($data['penugasanPengajar'])) {
            $errors[] = 'trainer: penugasanPengajar must be an array';
        } else {
            foreach ($data['penugasanPengajar'] as $index => $assignment) {
                if (!is_array($assignment)) {
                    $errors[] = "trainer: penugasanPengajar[{$index}] must be an object";
                    continue;
                }

                $sekolahId = $assignment['sekolahId'] ?? null;
                if (
                    !requireNonEmptyString($sekolahId) ||
                    !rowExists($pdo, 'sekolah', $sekolahId)
                ) {
                    $errors[] = "trainer: penugasanPengajar[{$index}].sekolahId does not reference an existing sekolah";
                }

                $trainerId = $assignment['trainerId'] ?? null;
if (
    !requireNonEmptyString($trainerId) ||
    !rowExists($pdo, 'trainer', $trainerId)
) {
    $errors[] = "trainer: penugasanPengajar[{$index}].trainerId does not reference an existing trainer";
} elseif ($trainerId !== ($data['id'] ?? null)) {
    $errors[] =
        "trainer: penugasanPengajar[{$index}].trainerId must match the trainer record being validated";
}

                // asistenId memang boleh null.
                $asistenId = $assignment['asistenId'] ?? null;
                if ($asistenId !== null) {
                    if (
                        !requireNonEmptyString($asistenId) ||
                        !rowExists($pdo, 'trainer', $asistenId)
                    ) {
                        $errors[] = "trainer: penugasanPengajar[{$index}].asistenId does not reference an existing trainer";
                    }
                }

                // CS.B.2 (F-CS3; D-CS4) — multi-assistant, additive.
                // asistenIds null/absent reads as legacy (valid); when set
                // it holds max 2 ids, each a known trainer OR external.
                // Reads use the union (legacy asistenId counts as position
                // 0); writes prefer this key. Legacy single-asistenId
                // posture above is untouched (existence-only, no branch
                // check); externals additionally agree with the assignment
                // branch when the row carries one (§5 in-branch invariant).
                if (array_key_exists('asistenIds', $assignment) && $assignment['asistenIds'] !== null) {
                    $asistenIds = $assignment['asistenIds'];
                    if (!is_array($asistenIds)) {
                        $errors[] = "trainer: penugasanPengajar[{$index}].asistenIds must be an array";
                    } elseif (count($asistenIds) > 2) {
                        $errors[] = "trainer: penugasanPengajar[{$index}].asistenIds holds at most 2 assistants";
                    } else {
                        foreach ($asistenIds as $asistenPos => $asistenEntry) {
                            if (!requireNonEmptyString($asistenEntry)) {
                                $errors[] = "trainer: penugasanPengajar[{$index}].asistenIds[{$asistenPos}] must be a non-empty string";
                            } elseif (!rowExists($pdo, 'trainer', $asistenEntry) && !rowExists($pdo, 'eksternal', $asistenEntry)) {
                                $errors[] = "trainer: penugasanPengajar[{$index}].asistenIds[{$asistenPos}] does not reference an existing trainer or external assistant";
                            } elseif (
                                !rowExists($pdo, 'trainer', $asistenEntry)
                                && $cabangId !== null
                                && is_string($cabangId)
                                && $cabangId !== ''
                                && cabangIdOf($pdo, 'eksternal', $asistenEntry) !== $cabangId
                            ) {
                                $errors[] = "trainer: penugasanPengajar[{$index}].asistenIds[{$asistenPos}] does not match the assignment branch";
                            }
                        }
                    }
                }

                $cabangId = $assignment['cabangId'] ?? null;

if ($cabangId !== null) {
    if (!requireNonEmptyString($cabangId)) {
        $errors[] =
            "trainer: penugasanPengajar[{$index}].cabangId must be a non-empty string";
    } elseif (!rowExists($pdo, 'cabang', $cabangId)) {
        $errors[] =
            "trainer: penugasanPengajar[{$index}].cabangId does not reference an existing cabang";
    } else {
        $sekolahCabangId = cabangIdOf($pdo, 'sekolah', $sekolahId);

        if (
            $sekolahCabangId !== null
            && $cabangId !== $sekolahCabangId
        ) {
            $errors[] =
                "trainer: penugasanPengajar[{$index}].cabangId does not match the sekolah branch";
        }

        $trainerCabangId = cabangIdOf($pdo, 'trainer', $trainerId);

        if (
            $trainerCabangId !== null
            && $cabangId !== $trainerCabangId
        ) {
            $errors[] =
                "trainer: penugasanPengajar[{$index}].cabangId does not match the trainer branch";
        }
    }
}

                // PS.A.1 — nullable slot scope (D-PS2/D-PS3/D-PS5).
                // Missing keys read as null (unscoped, legacy rows stay valid).
                // Non-null triple must match the sekolah jadwalList vocabulary.
                $hari = $assignment['hari'] ?? null;
                $jamMulai = $assignment['jamMulai'] ?? null;
                $jamSelesai = $assignment['jamSelesai'] ?? null;
                if ($hari === '') $hari = null;
                if ($jamMulai === '') $jamMulai = null;
                if ($jamSelesai === '') $jamSelesai = null;
                $vocabErr = "trainer: penugasanPengajar[{$index}].hari/jamMulai/jamSelesai harus merujuk pada jadwal sekolah yang dipilih";

                if ($hari === null) {
                    if ($jamMulai !== null || $jamSelesai !== null) {
                        $errors[] = $vocabErr;
                    }
                } elseif (!in_array($hari, PENUGASAN_HARI_VALUES, true)) {
                    $errors[] = $vocabErr;
                } elseif (($jamMulai === null) !== ($jamSelesai === null)) {
                    $errors[] = $vocabErr;
                } elseif ($jamMulai !== null) {
                    if (!isValidTimeHM($jamMulai) || !isValidTimeHM($jamSelesai)) {
                        $errors[] = $vocabErr;
                    } elseif (strcmp((string)$jamSelesai, (string)$jamMulai) <= 0) {
                        $errors[] = "trainer: penugasanPengajar[{$index}].jamSelesai harus setelah jamMulai";
                    } else {
                        $slots = sekolahJadwalList($pdo, $sekolahId);
                        if (is_array($slots)) {
                            $match = false;
                            foreach ($slots as $slot) {
                                if (!is_array($slot)) continue;
                                if (($slot['dayOfWeek'] ?? null) === $hari
                                    && ($slot['time'] ?? null) === $jamMulai
                                    && (($slot['endTime'] ?? '') === $jamSelesai)) {
                                    $match = true;
                                    break;
                                }
                            }
                            if (!$match) $errors[] = $vocabErr;
                        }
                    }
                } else {
                    $slots = sekolahJadwalList($pdo, $sekolahId);
                    if (is_array($slots)) {
                        $match = false;
                        foreach ($slots as $slot) {
                            if (is_array($slot) && ($slot['dayOfWeek'] ?? null) === $hari) {
                                $match = true;
                                break;
                            }
                        }
                        if (!$match) $errors[] = $vocabErr;
                    }
                }

                // CS.B.1 (F-CS2; D-CS2) — cover link. Absent/null reads as
                // a normal row (legacy rows stay valid). When present it
                // must reference an existing assignment for the same
                // sekolahId with overlapping scope; otherwise the row
                // mints pay-eligibility from nothing. No cover link, no
                // pay — the 403 stays for genuinely unassigned writes.
                // (Overlap exclusion of cover rows against their origin
                // lives in hasOverlappingActiveAssignment(), CS.A.1
                // groundwork — validateTrainer never did overlap checks.)
                $coverOf = $assignment['coverOf'] ?? null;
                if ($coverOf !== null) {
                    if (!is_string($coverOf) || trim($coverOf) === '') {
                        $errors[] = "trainer: penugasanPengajar[{$index}].coverOf must be a non-empty string";
                    } else {
                        $origin = findAssignmentById($pdo, $coverOf);
                        if ($origin === null) {
                            $errors[] = "trainer: penugasanPengajar[{$index}].coverOf does not reference an existing assignment";
                        } elseif (!coverScopeOverlaps($assignment, $origin)) {
                            $errors[] = "trainer: penugasanPengajar[{$index}].coverOf must reference an assignment for the same sekolahId with overlapping scope";
                        }
                    }
                }
            }
        }
    }

    // TA.A.1 — tipePengajar bersifat optional untuk backward compatibility.
    // Trainer lama yang belum punya field ini tetap valid.
    if (array_key_exists('tipePengajar', $data)) {
        if (!in_array($data['tipePengajar'], TRAINER_TIPE_PENGAJAR_VALUES, true)) {
            $errors[] = "trainer: tipePengajar '" . var_export($data['tipePengajar'], true)
                . "' is not one of " . implode(', ', TRAINER_TIPE_PENGAJAR_VALUES);
        }
    }

    // Honor tetap dikonfigurasi per trainer oleh Admin Cabang.
    // Tidak ada nominal yang di-hardcode di validator.
    if (array_key_exists('honor', $data)) {
        if (!is_int($data['honor']) && !is_float($data['honor'])) {
            $errors[] = 'trainer: honor must be a number';
        } elseif ($data['honor'] < 0) {
            $errors[] = 'trainer: honor must be greater than or equal to 0';
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

const ABSENSI_PENGAJAR_STATUS_VALUES = ['Hadir', 'Izin', 'Alpa'];
const ABSENSI_PENGAJAR_KETERANGAN_VALUES = ['EXPO', 'Pengganti', 'Lainnya'];

// CS.B.2 (F-CS5; D-CS5) — person-kind resolution for attendance rows.
// An id present in `trainer` is internal (wins even on a cross-table
// collision — trainer ids are never minted for externals); otherwise an
// id present in `eksternal` is an external assistant without a login.
function isExternalPerson(PDO $pdo, mixed $id): bool {
    if (!is_string($id) || trim($id) === '') return false;
    if (rowExists($pdo, 'trainer', $id)) return false;
    return rowExists($pdo, 'eksternal', $id);
}

const ABSENSI_PENGAJAR_PERAN_VALUES = ['I', 'A'];

function validateAbsensiPengajar(array $data, PDO $pdo): array {
    $errors = array_merge([], checkPayloadSize($data, 'absensiPengajar'));

    if (!requireNonEmptyString($data['id'] ?? null)) {
        $errors[] = 'absensiPengajar: id is required';
    }
    $personId = $data['trainerId'] ?? null;
    $isExternal = false;
    if (!requireNonEmptyString($personId)) {
        $errors[] = 'absensiPengajar: trainerId is required';
    } elseif (!rowExists($pdo, 'trainer', $personId) && !rowExists($pdo, 'eksternal', $personId)) {
        $errors[] = 'absensiPengajar: trainerId does not reference an existing trainer or external assistant';
    } else {
        $isExternal = isExternalPerson($pdo, $personId);
    }
    if (!requireNonEmptyString($data['sekolahId'] ?? null) || !rowExists($pdo, 'sekolah', $data['sekolahId'])) {
        $errors[] = 'absensiPengajar: sekolahId does not reference an existing sekolah';
    }
    if (!requireNonEmptyString($data['tanggal'] ?? null)) {
        $errors[] = 'absensiPengajar: tanggal is required';
    }

    $status = $data['status'] ?? null;
    if (!in_array($status, ABSENSI_PENGAJAR_STATUS_VALUES, true)) {
        $errors[] = "absensiPengajar: status '" . var_export($status, true)
            . "' is not one of " . implode(', ', ABSENSI_PENGAJAR_STATUS_VALUES);
    }

    $keterangan = $data['keterangan'] ?? null;
    if ($keterangan !== null && !in_array($keterangan, ABSENSI_PENGAJAR_KETERANGAN_VALUES, true)) {
        $errors[] = "absensiPengajar: keterangan '" . var_export($keterangan, true)
            . "' is not one of " . implode(', ', ABSENSI_PENGAJAR_KETERANGAN_VALUES);
    }

    if (!requireNonEmptyString($data['cabangId'] ?? null)) {
        $errors[] = 'absensiPengajar: cabangId is required (ownership)';
    } elseif (!rowExists($pdo, 'cabang', $data['cabangId'])) {
        $errors[] = 'absensiPengajar: cabangId does not reference an existing cabang';
    }

    // CS.B.2 (F-CS4/F-CS5; D-CS3/D-CS5) — per-session role + recorder.
    // peran rides on the row (I/A); absent/null reads as legacy (valid,
    // history byte-identical). dicatatOleh is required iff the row's
    // person is external (who claimed the 50k); on internal rows a
    // recorder must not be smuggled (R-CS4: silently writing unvalidated
    // recorder is a defect). Caller-identity (dicatatOleh === self) is
    // enforced at the write path (absensiPengajarWriteError), which sees
    // the authenticated user — this validator is caller-agnostic.
    if (array_key_exists('peran', $data) && $data['peran'] !== null) {
        if (!in_array($data['peran'], ABSENSI_PENGAJAR_PERAN_VALUES, true)) {
            $errors[] = "absensiPengajar: peran '" . var_export($data['peran'], true)
                . "' is not one of " . implode(', ', ABSENSI_PENGAJAR_PERAN_VALUES);
        }
    }
    $recorder = $data['dicatatOleh'] ?? null;
    if ($isExternal) {
        if (!requireNonEmptyString($recorder)) {
            $errors[] = 'absensiPengajar: dicatatOleh is required when the row person is an external assistant';
        }
    } elseif ($recorder !== null) {
        $errors[] = 'absensiPengajar: dicatatOleh is only valid for external-assistant rows';
    }

    return $errors;
}

// CS.B.2 (D-CS5) — narrow write-path gate for server/api/absensiPengajar.php
// (R-CS5: structural 422 before authorization 403 — a malformed record
// must not leak scope info). Runs the caller-agnostic validator above,
// then pins caller-identity: an external row's dicatatOleh must be the
// authenticated caller's own user id (no forging someone else as the
// recorder who claimed the 50k). Returns the Indonesian error or null.
// T2.E.2 (F-T2-14; D-T2-9) — corrections preserve the ORIGINAL recorder
// (buildPengajarCorrection keeps dicatatOleh; the corrector is an admin,
// never the session owner of the row). $preservedRecorder carries the
// original row's dicatatOleh for the correct path only: an external
// correction passes when its recorder equals self (corrector takes over)
// OR equals the preserved original (audit intact). Anything else —
// including a forged third id — still fails. Default null keeps the
// write path byte-identical (additive only).
function absensiPengajarWriteError(array $record, PDO $pdo, array $user, ?string $preservedRecorder = null): ?string {
    $errors = validateAbsensiPengajar($record, $pdo);
    if ($errors !== []) return implode('; ', $errors);
    if (isExternalPerson($pdo, $record['trainerId'] ?? null)) {
        $me = $user['id'] ?? null;
        $recorder = $record['dicatatOleh'] ?? null;
        if (is_string($me) && $me !== '' && $recorder === $me) return null;
        if (is_string($preservedRecorder) && $preservedRecorder !== '' && $recorder === $preservedRecorder) return null;
        return 'absensiPengajar: dicatatOleh harus berisi id pengguna yang mencatat';
    }
    return null;
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

// CS.B.2 (F-CS5; D-CS5) — minimal external-assistant person record:
// { nama, kontak, sekolahId, cabangId }, no login account. cabangId is
// REQUIRED and must agree with the referenced sekolah's branch (same
// ownership posture as siswa) — the admin_cabang own-branch / superadmin
// gate lives in authorize.php + eksternal.php, not here.
function validateEksternal(array $data, PDO $pdo): array {
    $errors = array_merge([], checkPayloadSize($data, 'eksternal'));
    if (!requireNonEmptyString($data['id'] ?? null)) $errors[] = 'eksternal: id is required';
    if (!requireNonEmptyString($data['nama'] ?? null)) $errors[] = 'eksternal: nama is required';
    if (array_key_exists('kontak', $data) && $data['kontak'] !== null && !is_string($data['kontak'])) {
        $errors[] = 'eksternal: kontak must be a string';
    }
    $sekolahId = $data['sekolahId'] ?? null;
    $sekolahCabangId = null;
    if (!requireNonEmptyString($sekolahId)) {
        $errors[] = 'eksternal: sekolahId is required';
    } elseif (!rowExists($pdo, 'sekolah', $sekolahId)) {
        $errors[] = 'eksternal: sekolahId does not reference an existing sekolah';
    } else {
        $sekolahCabangId = cabangIdOf($pdo, 'sekolah', $sekolahId);
    }
    $cabangId = $data['cabangId'] ?? null;
    if (!requireNonEmptyString($cabangId)) {
        $errors[] = 'eksternal: cabangId is required (ownership)';
    } elseif (!rowExists($pdo, 'cabang', $cabangId)) {
        $errors[] = 'eksternal: cabangId does not reference an existing cabang';
    } elseif ($sekolahCabangId !== null && $cabangId !== $sekolahCabangId) {
        $errors[] = 'eksternal: cabangId does not match the branch of the referenced sekolah';
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
        'absensiPengajar' => validateAbsensiPengajar($data, $pdo),
        'honorPayments' => validateHonorPayment($data, $pdo),
        'sppPayments' => validateSppPayment($data, $pdo),
        'invoices' => validateInvoice($data, $pdo),
        'eksternal' => validateEksternal($data, $pdo),
        default => ["{$entity}: no validator defined for this entity"],
    };
}