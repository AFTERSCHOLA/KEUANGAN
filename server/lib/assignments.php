<?php

declare(strict_types=1);
// AP.A.1 (F-AP1; D-AP1, D-AP2) — server-side auto-creation of
// penugasanPengajar rows when a school↔trainer link is added.
//
// Single shared helper for the three link-write paths (trainer.php,
// sekolah.php, users.php); no client dual-write. Rows carry no day/time
// (D-AP2: sekolah.jadwalList stays the sole owner of time; slot triple
// omitted = unscoped, valid per entities.php PS.A.1). Idempotent: an
// overlapping active row skips creation, so the TrainerList double-write
// (trainer.php update + sekolah.php inverse update in one UI save) can
// never produce duplicates. Same-branch gated (R-AP2): cross-branch
// links never gain rows.

function autoAssignmentId(): string
{
    return 'pgs-' . (string) (int) (microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(4)), 0, 7);
}

// CS.A.2 (F-CS1; D-CS1) — parses the optional `slotPicks` link payload:
// { sekolahId: [null | {hari, jamMulai, jamSelesai}, ...], ... }.
// Returns [normalized|null, error|null]. Absent/null => [null, null]
// (legacy AP.A.1 behavior, one unscoped row). Malformed =>
// [null, 'slotPicks tidak valid']. Shape-only here; school-vocabulary
// matching stays in entities.php (trainer.php, via masterWrite validation)
// or filterSlotPicksByVocabulary() below (ensure paths, which bypass
// entity validation with direct UPDATEs).
function parseSlotPicks(mixed $raw): array
{
    if ($raw === null) return [null, null];
    if (!is_array($raw)) return [null, 'slotPicks tidak valid'];
    $out = [];
    foreach ($raw as $sid => $picks) {
        if (!is_string($sid) || trim($sid) === '' || !is_array($picks)) return [null, 'slotPicks tidak valid'];
        $list = [];
        foreach ($picks as $pick) {
            if ($pick === null) {
                $list[] = null;
                continue;
            }
            if (!is_array($pick)) return [null, 'slotPicks tidak valid'];
            foreach ($pick as $k => $v) {
                if (!in_array($k, ['hari', 'jamMulai', 'jamSelesai'], true)) return [null, 'slotPicks tidak valid'];
                if ($v !== null && !is_string($v)) return [null, 'slotPicks tidak valid'];
            }
            $list[] = ['hari' => $pick['hari'] ?? null, 'jamMulai' => $pick['jamMulai'] ?? null, 'jamSelesai' => $pick['jamSelesai'] ?? null];
        }
        $out[$sid] = $list;
    }
    return [$out, null];
}

// Strict single-pick validator shared by link endpoints that validate
// BEFORE persisting (trainer.php 422s). Returns null when valid, else the
// pinned Indonesian copy (mirrors entities.php PS.A.1 messages).
// NOTE: whole-payload entity validation (validateTrainer) is currently
// unenforced on HTTP writes (no endpoint calls it — standalone
// entity.validation.php only); this helper gates the newly injected
// pick-rows narrowly without changing that legacy posture.
function validateSlotPick(PDO $pdo, string $sekolahId, ?array $pick): ?string
{
    if ($pick === null) return null;
    if (!function_exists('sekolahJadwalList')) require_once __DIR__ . '/../validation/entities.php';
    $vocabErr = 'Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.';
    $hari = slotPartOf($pick, 'hari');
    $mulai = slotPartOf($pick, 'jamMulai');
    $selesai = slotPartOf($pick, 'jamSelesai');
    if ($hari === null) {
        return ($mulai === null && $selesai === null) ? null : $vocabErr;
    }
    if (!in_array($hari, PENUGASAN_HARI_VALUES, true)) return $vocabErr;
    if (($mulai === null) !== ($selesai === null)) return $vocabErr;
    if ($mulai === null) {
        $slots = sekolahJadwalList($pdo, $sekolahId);
        if (!is_array($slots)) return $vocabErr;
        foreach ($slots as $s) {
            if (is_array($s) && ($s['dayOfWeek'] ?? null) === $hari) return null;
        }
        return $vocabErr;
    }
    if (!isValidTimeHM($mulai) || !isValidTimeHM($selesai)) return $vocabErr;
    if (strcmp((string)$selesai, (string)$mulai) <= 0) {
        return 'Jam selesai harus setelah jam mulai.';
    }
    $slots = sekolahJadwalList($pdo, $sekolahId);
    if (!is_array($slots)) return $vocabErr;
    foreach ($slots as $s) {
        if (
            is_array($s) && ($s['dayOfWeek'] ?? null) === $hari
            && ($s['time'] ?? null) === $mulai && (($s['endTime'] ?? '') === $selesai)
        ) {
            return null;
        }
    }
    return $vocabErr;
}

// CS.B.1 (F-CS2; D-CS2) — narrow cover gate for the trainer.php update
// path (R-CS5: server is authoritative; whole-payload validateTrainer()
// is unenforced on HTTP writes, so the check lives here, sharing the
// findAssignmentById()/coverScopeOverlaps() predicates with entities.php
// — same rules, no divergence). $oldRows is the pre-write payload array
// (empty for create). Returns the pinned Indonesian error or null.
//
// Rules: a non-null coverOf must reference an existing assignment with
// the same sekolahId + overlapping scope; coverOf is immutable once
// written — it may only appear on brand-new row ids (re-pointing or
// late-attaching means delete + create a new row, append-only analog).
function validateCoverRows(PDO $pdo, array $newRows, array $oldRows): ?string
{
    if (!function_exists('findAssignmentById')) require_once __DIR__ . '/../validation/entities.php';
    $oldById = [];
    foreach ($oldRows as $old) {
        if (is_array($old) && isset($old['id']) && is_string($old['id'])) $oldById[$old['id']] = $old;
    }
    foreach ($newRows as $row) {
        if (!is_array($row)) continue;
        $coverOf = $row['coverOf'] ?? null;
        if ($coverOf === null) continue;
        if (!is_string($coverOf) || trim($coverOf) === '') {
            return 'Penugasan pengganti tidak valid: pengganti untuk harus merujuk pada penugasan yang ada.';
        }
        $rowId = $row['id'] ?? null;
        $old = (is_string($rowId) && $rowId !== '') ? ($oldById[$rowId] ?? null) : null;
        if ($old !== null && ($old['coverOf'] ?? null) !== $coverOf) {
            return 'Penugasan pengganti tidak dapat diubah. Hapus dan buat penugasan pengganti baru.';
        }
        $origin = findAssignmentById($pdo, $coverOf);
        if ($origin === null) {
            return 'Penugasan pengganti tidak valid: pengganti untuk harus merujuk pada penugasan yang ada.';
        }
        if (!coverScopeOverlaps($row, $origin)) {
            return 'Penugasan pengganti tidak valid: sekolah dan slot harus sama dengan penugasan asal.';
        }
    }
    return null;
}

// ensure() writes post-commit with no entity-validation layer, so picks
// are matched against the school vocabulary here (trainer.php instead
// 422s out-of-vocabulary picks strictly via validateSlotPick above).
// Invalid picks are skipped with a log line, never written (R-CS4).
function filterSlotPicksByVocabulary(PDO $pdo, string $sekolahId, array $picks): array
{
    $keep = [];
    foreach ($picks as $pick) {
        if ($pick === null) {
            $keep[] = null;
            continue;
        }
        if (validateSlotPick($pdo, $sekolahId, $pick) === null) {
            $keep[] = ['hari' => slotPartOf($pick, 'hari'), 'jamMulai' => slotPartOf($pick, 'jamMulai'), 'jamSelesai' => slotPartOf($pick, 'jamSelesai')];
        } else {
            error_log("ensureAssignment skipped out-of-vocabulary pick sekolah={$sekolahId}");
        }
    }
    return $keep;
}

function autoAssignmentToday(): string
{
    return date('Y-m-d');
}

// Overlap mirrors the attendance gates (authorize.php
// trainerHasActiveAssignment + buildDailyTimetable date predicate):
// same school + aktif true + open-ended or not yet ended.
//
// CS.A.1 (F-CS1; D-CS1) — slot-picked revision, additive only. $slot null
// preserves the AP.A.1 match-all behavior byte-identically (any same-school
// active row blocks). A provided triple narrows the gate to exact-scope
// matches: an unscoped existing row still blocks (it fans out over every
// slot at read time), a scoped row blocks only its exact triple.
// $excludeId lets a cover row ignore its origin id (D-CS2 groundwork):
// cover rows never conflict with their origin.
function slotPartOf(array $slot, string $key): ?string
{
    $v = $slot[$key] ?? null;
    if ($v === '') return null;
    return is_string($v) ? $v : null;
}

function slotKeyOfAssignment(array $r): string
{
    $hari = $r['hari'] ?? null;
    $mulai = $r['jamMulai'] ?? null;
    $selesai = $r['jamSelesai'] ?? null;
    if ($hari === '') $hari = null;
    if ($mulai === '') $mulai = null;
    if ($selesai === '') $selesai = null;
    return json_encode([$hari, $mulai, $selesai]);
}

function isUnscopedAssignmentSlot(array $r): bool
{
    return slotKeyOfAssignment($r) === json_encode([null, null, null]);
}

// BUG7 (F-PG5; D-PG9) — reject duplicate manual assignments within one
// host payload (same-instructor reject; cross-host asisten checks stay
// deferred). Both aktif + intersecting date ranges + same
// slot scope (exact triple; unscoped fans out — same rule as hasOverlappingActiveAssignment, YAGNI: no
// interval matching). T2.E.1 (F-T2-13; D-T2-9) — school equality
// dropped: the same host cannot hold the same clock slot at two schools
// at once. Same-id pairs (edit path) and cover-linked pairs
// (cover rows share their origin scope by design, D-CS2) never block.
// Returns the pinned Indonesian copy or null.
function penugasanRangeStart($v): string
{
    return is_string($v) ? $v : '';
}

function penugasanRangeEnd($v): string
{
    $s = is_string($v) ? trim($v) : '';
    return $s === '' ? '9999-12-31' : $s;
}

function validateNoOverlappingAssignments(array $rows): ?string
{
    $err = 'Penugasan ganda: sekolah dan waktu yang sama sudah terisi pada rentang tanggal ini.';
    $n = count($rows);
    for ($i = 0; $i < $n; $i++) {
        $a = $rows[$i];
        if (!is_array($a)) continue;
        for ($j = $i + 1; $j < $n; $j++) {
            $b = $rows[$j];
            if (!is_array($b)) continue;
            $idA = $a['id'] ?? null;
            $idB = $b['id'] ?? null;
            if (is_string($idA) && $idA !== '' && $idA === $idB) continue;
            $coverA = $a['coverOf'] ?? null;
            $coverB = $b['coverOf'] ?? null;
            if ((is_string($coverA) && $coverA !== '' && $coverA === $idB)
                || (is_string($coverB) && $coverB !== '' && $coverB === $idA)) continue;
            if (($a['aktif'] ?? null) !== true || ($b['aktif'] ?? null) !== true) continue;
            $sekA = $a['sekolahId'] ?? null;
            $sekB = $b['sekolahId'] ?? null;
            if (!is_string($sekA) || $sekA === '' || !is_string($sekB) || $sekB === '') continue;
            $start = max(penugasanRangeStart($a['periodeMulai'] ?? null), penugasanRangeStart($b['periodeMulai'] ?? null));
            $end = min(penugasanRangeEnd($a['periodeSelesai'] ?? null), penugasanRangeEnd($b['periodeSelesai'] ?? null));
            if (strcmp($start, $end) > 0) continue;
            $keyA = slotKeyOfAssignment($a);
            $keyB = slotKeyOfAssignment($b);
            if ($keyA !== $keyB && !isUnscopedAssignmentSlot($a) && !isUnscopedAssignmentSlot($b)) continue;
            return $err;
        }
    }
    return null;
}

// DB.A.1 (F-DB1/F-DB2; D-DB1, D-DB2, D-DB5) — cross-host occupant guard.
// Pure: compares the about-to-be-saved rows of ONE host ($newRows)
// against every other same-branch host's rows ($foreignRows — the caller
// excludes the host record itself; its own rows were already checked by
// validateNoOverlappingAssignments). Two rows conflict iff: both aktif + intersecting periodeMulai..periodeSelesai
// (open end = 9999-12-31, same range helpers as the PG.D gate) + same
// slot scope (exact triple; unscoped fans out — same rule, YAGNI no
// intervals) + occupant sets intersect. T2.E.1 (F-T2-13; D-T2-9) —
// school equality dropped: same person, same clock slot, overlapping
// dates blocks across schools too. Occupants = {trainerId} ∪
// {asistenId} ∪ asistenIds[] with nulls/empties dropped — the same union
// as penugasanInvolvesTrainer() client-side and
// trainerHasActiveAssignment() server-side. Same-id pairs (edit path)
// and cover-linked pairs (either direction; cover shares its origin
// scope by design, D-CS2) never block; rows with no attributable
// occupant never block. Returns the pinned Indonesian copy shared with
// the PG.D gate (D-DB6) or null.
function penugasanOccupants(array $row): array
{
    $out = [];
    foreach ([$row['trainerId'] ?? null, $row['asistenId'] ?? null] as $single) {
        if (is_string($single) && trim($single) !== '') $out[] = $single;
    }
    $extra = $row['asistenIds'] ?? null;
    if (is_array($extra)) {
        foreach ($extra as $id) {
            if (is_string($id) && trim($id) !== '') $out[] = $id;
        }
    }
    return array_values(array_unique($out));
}

function findCrossHostConflict(array $newRows, array $foreignRows): ?string
{
    $err = 'Penugasan ganda: sekolah dan waktu yang sama sudah terisi pada rentang tanggal ini.';
    foreach ($newRows as $a) {
        if (!is_array($a)) continue;
        foreach ($foreignRows as $b) {
            if (!is_array($b)) continue;
            $idA = $a['id'] ?? null;
            $idB = $b['id'] ?? null;
            if (is_string($idA) && $idA !== '' && $idA === $idB) continue;
            $coverA = $a['coverOf'] ?? null;
            $coverB = $b['coverOf'] ?? null;
            if ((is_string($coverA) && $coverA !== '' && $coverA === $idB)
                || (is_string($coverB) && $coverB !== '' && $coverB === $idA)) continue;
            if (($a['aktif'] ?? null) !== true || ($b['aktif'] ?? null) !== true) continue;
            $sekA = $a['sekolahId'] ?? null;
            $sekB = $b['sekolahId'] ?? null;
            if (!is_string($sekA) || $sekA === '' || !is_string($sekB) || $sekB === '') continue;
            $start = max(penugasanRangeStart($a['periodeMulai'] ?? null), penugasanRangeStart($b['periodeMulai'] ?? null));
            $end = min(penugasanRangeEnd($a['periodeSelesai'] ?? null), penugasanRangeEnd($b['periodeSelesai'] ?? null));
            if (strcmp($start, $end) > 0) continue;
            $keyA = slotKeyOfAssignment($a);
            $keyB = slotKeyOfAssignment($b);
            if ($keyA !== $keyB && !isUnscopedAssignmentSlot($a) && !isUnscopedAssignmentSlot($b)) continue;
            $occA = penugasanOccupants($a);
            if ($occA === []) continue;
            $occB = penugasanOccupants($b);
            if ($occB === []) continue;
            if (count(array_intersect($occA, $occB)) === 0) continue;
            return $err;
        }
    }
    return null;
}

function hasOverlappingActiveAssignment(array $rows, string $sekolahId, string $today, ?array $slot = null, ?string $excludeId = null): bool
{
    $slotKey = null;
    if ($slot !== null) {
        $slotKey = json_encode([slotPartOf($slot, 'hari'), slotPartOf($slot, 'jamMulai'), slotPartOf($slot, 'jamSelesai')]);
    }
    foreach ($rows as $r) {
        if (!is_array($r)) continue;
        if (($r['sekolahId'] ?? null) !== $sekolahId) continue;
        if (($r['aktif'] ?? null) !== true) continue;
        if ($excludeId !== null && ($r['id'] ?? null) === $excludeId) continue;
        if ($slotKey !== null && !isUnscopedAssignmentSlot($r) && slotKeyOfAssignment($r) !== $slotKey) continue;
        $end = $r['periodeSelesai'] ?? null;
        if ($end === null || $end === '' || (is_string($end) && $end >= $today)) return true;
    }
    return false;
}

// Pure diff: build rows for added links lacking an overlapping active row.
//
// CS.A.1 (F-CS1; D-CS1) — $slotPicks null preserves AP.A.1 byte-identically
// (one unscoped row per added school; legacy row shape untouched). An array
// maps sekolahId => list of picks (a null pick = one unscoped `Semua slot`
// row, else {hari, jamMulai, jamSelesai}); a school with no entry gains no
// rows ("No pick, no row"). $coverOf tags every created row (null = normal
// row; the link itself is validated in CS.B.1 — here it only drives overlap
// exclusion so a cover never conflicts with its origin).
function missingAssignmentLinks(array $existingRows, string $trainerId, array $addedSekolahIds, string $today, ?array $slotPicks = null, ?string $coverOf = null): array
{
    $out = [];
    // $seen grows within the batch so duplicate picks in one call stay
    // idempotent instead of fanning out.
    $seen = $existingRows;
    foreach ($addedSekolahIds as $sid) {
        if (!is_string($sid) || trim($sid) === '') continue;
        if ($slotPicks === null) {
            if (hasOverlappingActiveAssignment($seen, $sid, $today, null, $coverOf)) continue;
            $row = [
                'id' => autoAssignmentId(),
                'sekolahId' => $sid,
                'trainerId' => $trainerId,
                'asistenId' => null,
                'periodeMulai' => $today,
                'periodeSelesai' => null,
                'aktif' => true,
            ];
            $out[] = $row;
            $seen[] = $row;
            continue;
        }
        if (!array_key_exists($sid, $slotPicks) || !is_array($slotPicks[$sid])) continue;
        foreach ($slotPicks[$sid] as $pick) {
            $slot = is_array($pick) ? $pick : null;
            if (hasOverlappingActiveAssignment($seen, $sid, $today, $slot, $coverOf)) continue;
            $row = [
                'id' => autoAssignmentId(),
                'sekolahId' => $sid,
                'trainerId' => $trainerId,
                'asistenId' => null,
                'coverOf' => $coverOf,
                'hari' => $slot === null ? null : slotPartOf($slot, 'hari'),
                'jamMulai' => $slot === null ? null : slotPartOf($slot, 'jamMulai'),
                'jamSelesai' => $slot === null ? null : slotPartOf($slot, 'jamSelesai'),
                'periodeMulai' => $today,
                'periodeSelesai' => null,
                'aktif' => true,
            ];
            $out[] = $row;
            $seen[] = $row;
        }
    }
    return $out;
}

// Load-trainer-and-persist variant for post-write hooks (sekolah.php,
// users.php): appends missing rows and bumps version. Same-branch gated.
// Returns rows added. Best-effort: never throws past the caller.
// CS.A.1: $slotPicks/$coverOf pass straight through to
// missingAssignmentLinks (both null = AP.A.1 behavior, untouched).
function ensureAssignment(PDO $pdo, string $trainerId, string $sekolahId, array $user, ?array $slotPicks = null, ?string $coverOf = null): int
{
    try {
        $sel = $pdo->prepare('SELECT cabang_id, payload FROM trainer WHERE id = :id');
        $sel->execute([':id' => $trainerId]);
        $row = $sel->fetch();
        if ($row === false) return 0;
        $payload = json_decode((string) $row['payload'], true);
        if (!is_array($payload)) return 0;
        $sch = $pdo->prepare('SELECT cabang_id FROM sekolah WHERE id = :id');
        $sch->execute([':id' => $sekolahId]);
        $schBranch = $sch->fetchColumn();
        if ($schBranch === false || $schBranch !== $row['cabang_id']) {
            error_log("ensureAssignment skipped non-same-branch link trainer={$trainerId} sekolah={$sekolahId}");
            return 0;
        }
        $today = autoAssignmentToday();
        $existing = isset($payload['penugasanPengajar']) && is_array($payload['penugasanPengajar'])
            ? $payload['penugasanPengajar'] : [];
        // CS.A.2 — picks for other schools ride along untouched;
        // missingAssignmentLinks only consumes this school's entry.
        $picks = $slotPicks;
        if (is_array($picks) && array_key_exists($sekolahId, $picks) && is_array($picks[$sekolahId])) {
            $picks[$sekolahId] = filterSlotPicksByVocabulary($pdo, $sekolahId, $picks[$sekolahId]);
        }
        $missing = missingAssignmentLinks($existing, $trainerId, [$sekolahId], $today, $picks, $coverOf);
        if ($missing === []) return 0;
        $payload['penugasanPengajar'] = array_values(array_merge($existing, $missing));
        $upd = $pdo->prepare('UPDATE trainer SET payload = :payload, version = version + 1 WHERE id = :id');
        $upd->execute([
            ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':id' => $trainerId,
        ]);
        auditEvent('assignment_auto_created', $user, 'trainer', $trainerId, [
            'sekolahId' => $sekolahId,
            'cabangId' => $row['cabang_id'],
        ]);
        return count($missing);
    } catch (Throwable $e) {
        error_log('ensureAssignment failed: ' . $e->getMessage());
        return 0;
    }
}

// Batch variant for hooks holding added trainerIds (sekolah.php update).
// CS.A.1: $slotPicks/$coverOf pass through (both null = legacy).
function ensureAssignmentsForTrainerIds(PDO $pdo, array $addedTrainerIds, string $sekolahId, array $user, ?array $slotPicks = null, ?string $coverOf = null): int
{
    $n = 0;
    foreach ($addedTrainerIds as $tid) {
        if (!is_string($tid) || trim($tid) === '') continue;
        $n += ensureAssignment($pdo, $tid, $sekolahId, $user, $slotPicks, $coverOf);
    }
    return $n;
}
