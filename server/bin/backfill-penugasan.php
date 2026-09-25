<?php

declare(strict_types=1);
// AP.A.2 (F-AP1; D-AP1) — one-time backfill: every existing school↔trainer
// link lacking an overlapping active assignment gains exactly one
// (periodeMulai=today, selesai=null, asisten=null).
//
// Idempotent + collision-safe (taste #35): re-running adds zero rows —
// ensureAssignment() skips links that already overlap, and the closing
// validation pass fails the run (non-zero exit) if any same-branch live
// link is still uncovered. Reference-preserving: only
// trainer.payload.penugasanPengajar is appended; links, history, and
// versions are otherwise untouched (version+1 per touched trainer is the
// normal optimistic-concurrency signal, R-AP5).
//
// Links are read from BOTH directions (trainer.sekolahIds[] and
// sekolah.trainerIds[]) and deduplicated, because the two arrays can
// drift. Cross-branch or dangling links are reported as skipped, never
// force-linked (R-AP2).
//
// Usage:
//   php server/bin/backfill-penugasan.php
//   php server/bin/backfill-penugasan.php --dry-run   # report only

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/assignments.php';

$dryRun = in_array('--dry-run', $argv ?? [], true);
$actor = ['id' => 'system:backfill-penugasan', 'role' => 'system', 'cabangId' => null];
$pdo = database();

// ---- collect links from both directions ----
$links = []; // "trainerId|sekolahId" => [trainerId, sekolahId]
foreach ($pdo->query('SELECT id, payload FROM trainer')->fetchAll() as $row) {
    $p = json_decode((string) $row['payload'], true);
    if (!is_array($p)) continue;
    foreach ((isset($p['sekolahIds']) && is_array($p['sekolahIds']) ? $p['sekolahIds'] : []) as $sid) {
        if (!is_string($sid) || trim($sid) === '') continue;
        $links[$row['id'] . '|' . $sid] = [$row['id'], $sid];
    }
}
foreach ($pdo->query('SELECT id, payload FROM sekolah')->fetchAll() as $row) {
    $p = json_decode((string) $row['payload'], true);
    if (!is_array($p)) continue;
    foreach ((isset($p['trainerIds']) && is_array($p['trainerIds']) ? $p['trainerIds'] : []) as $tid) {
        if (!is_string($tid) || trim($tid) === '') continue;
        $links[$tid . '|' . $row['id']] = [$tid, $row['id']];
    }
}

$added = 0;
$skipped = 0;
foreach ($links as $link) {
    [$tid, $sid] = $link;
    if ($dryRun) {
        $skipped++;
        continue;
    }
    $added += ensureAssignment($pdo, $tid, $sid, $actor);
}

// ---- validation pass: every live same-branch link must overlap ----
$missing = [];
$crossBranch = 0;
$dangling = 0;
$sel = $pdo->prepare('SELECT cabang_id, payload FROM trainer WHERE id = :id');
$ssch = $pdo->prepare('SELECT cabang_id FROM sekolah WHERE id = :id');
foreach ($links as $link) {
    [$tid, $sid] = $link;
    $sel->execute([':id' => $tid]);
    $trow = $sel->fetch();
    $ssch->execute([':id' => $sid]);
    $schBranch = $ssch->fetchColumn();
    if ($trow === false || $schBranch === false) {
        $dangling++;
        continue;
    }
    if ($schBranch !== $trow['cabang_id']) {
        $crossBranch++;
        continue;
    }
    $p = json_decode((string) $trow['payload'], true);
    $rows = is_array($p) && isset($p['penugasanPengajar']) && is_array($p['penugasanPengajar'])
        ? $p['penugasanPengajar'] : [];
    if (!hasOverlappingActiveAssignment($rows, $sid, autoAssignmentToday())) {
        $missing[] = "{$tid}|{$sid}";
    }
}

echo 'links scanned: ' . count($links) . "\n";
echo ($dryRun ? 'would-touch links: ' : 'assignments added: ') . ($dryRun ? $skipped : $added) . "\n";
echo 'dangling links skipped: ' . $dangling . "\n";
echo 'cross-branch links skipped: ' . $crossBranch . "\n";
echo 'uncovered after run: ' . count($missing) . "\n";
if ($missing !== []) {
    echo "MISSING:\n  " . implode("\n  ", array_slice($missing, 0, 20)) . "\n";
    exit(1);
}
echo "BACKFILL OK\n";
exit(0);
