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

function autoAssignmentToday(): string
{
    return date('Y-m-d');
}

// Overlap mirrors the attendance gates (authorize.php
// trainerHasActiveAssignment + buildDailyTimetable date predicate):
// same school + aktif true + open-ended or not yet ended.
function hasOverlappingActiveAssignment(array $rows, string $sekolahId, string $today): bool
{
    foreach ($rows as $r) {
        if (!is_array($r)) continue;
        if (($r['sekolahId'] ?? null) !== $sekolahId) continue;
        if (($r['aktif'] ?? null) !== true) continue;
        $end = $r['periodeSelesai'] ?? null;
        if ($end === null || $end === '' || (is_string($end) && $end >= $today)) return true;
    }
    return false;
}

// Pure diff: build rows for added links lacking an overlapping active row.
function missingAssignmentLinks(array $existingRows, string $trainerId, array $addedSekolahIds, string $today): array
{
    $out = [];
    foreach ($addedSekolahIds as $sid) {
        if (!is_string($sid) || trim($sid) === '') continue;
        if (hasOverlappingActiveAssignment($existingRows, $sid, $today)) continue;
        $out[] = [
            'id' => autoAssignmentId(),
            'sekolahId' => $sid,
            'trainerId' => $trainerId,
            'asistenId' => null,
            'periodeMulai' => $today,
            'periodeSelesai' => null,
            'aktif' => true,
        ];
    }
    return $out;
}

// Load-trainer-and-persist variant for post-write hooks (sekolah.php,
// users.php): appends missing rows and bumps version. Same-branch gated.
// Returns rows added. Best-effort: never throws past the caller.
function ensureAssignment(PDO $pdo, string $trainerId, string $sekolahId, array $user): int
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
        $missing = missingAssignmentLinks($existing, $trainerId, [$sekolahId], $today);
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
function ensureAssignmentsForTrainerIds(PDO $pdo, array $addedTrainerIds, string $sekolahId, array $user): int
{
    $n = 0;
    foreach ($addedTrainerIds as $tid) {
        if (!is_string($tid) || trim($tid) === '') continue;
        $n += ensureAssignment($pdo, $tid, $sekolahId, $user);
    }
    return $n;
}
