<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

// SF.1 (D1, R1) — Trainer-only assignment index lane.
//
// Returns ONLY the caller's own assignment rows so an asisten whose
// rows live on the host trainer's record (e.g. Widia holds Alifah's
// rows) can resolve school scope without ever receiving host PII.
// Not a full trainer payload, not an enrichment on `sekolah`.
//
// Shape per row:
//   { sekolahId, periodeMulai, periodeSelesai|null, aktif, peran:'I'|'A' }
// peran is per-ROW, not per-person: 'I' when the row matches via its
// trainerId, 'A' when it matches via asistenId/asistenIds[].
//
// Deliberate non-goals (plan §4): no aktif/date gate here — the client
// applies isAssignmentActiveOnDate per tanggal (SF.2). No sekolahId
// query-param filtering (YAGNI).
//
// SF.1 fix 1/5 (chain-level, amends plan D1 minimally, R1 intact):
// cover rows are NOT returned verbatim. A row with non-null coverOf is
// OMITTED unless its origin passes the live-origin check — origin
// exists, same sekolahId + overlapping scope per coverScopeOverlaps(),
// origin aktif, origin dates well-formed — mirroring the authorize.php
// trainerHasActiveAssignment() cover block minus the $tanggal
// comparisons (the lane is date-agnostic; per-tanggal origin covering
// stays the client date-gate + server write-gate concern). Without this
// a dangling-cover row (coverOf -> missing/inactive/non-overlapping
// origin) would surface in the SF.3 dropdown yet 403 on write.
// Empty-string coverOf counts as absent (legacy). Non-cover rows pass
// through unchanged; the exact 5-key shape is untouched.

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

// Safe read — same idiom as read.php / auth/me.php: Bearer-first
// without CSRF; else today's cookie session (no CSRF on GET).
$bearer = serviceBearerUser();
$user = is_array($bearer) ? $bearer : requireAuthenticatedUser();

// Trainer-only (plan §4): admin_cabang/superadmin use PenugasanManager +
// the full trainer cache, never this lane.
if (($user['role'] ?? null) !== 'trainer') jsonResponse(['error' => 'Akses tidak diizinkan'], 403);

$trainerId = $user['trainerId'] ?? null;
if (!is_string($trainerId) || $trainerId === '') jsonResponse([], 200);

$pdo = database();
$trainerRows = $pdo->query('SELECT payload FROM trainer ORDER BY created_at, id')->fetchAll();

$out = [];
foreach ($trainerRows as $row) {
    $trainerPayload = json_decode($row['payload'] ?? '', true);
    if (!is_array($trainerPayload)) continue;

    $assignments = $trainerPayload['penugasanPengajar'] ?? [];
    if (!is_array($assignments)) continue;

    foreach ($assignments as $assignment) {
        if (!is_array($assignment)) continue;

        $sekolahId = $assignment['sekolahId'] ?? null;
        if (!is_string($sekolahId) || trim($sekolahId) === '') continue;

        // Union mirror of trainerHasActiveAssignment() (authorize.php):
        // trainerId counts as instruktur, asistenId/asistenIds[] as
        // asisten (legacy positions 0 + 1-2). Trainer match wins when a
        // row names the caller in both slots.
        $matchedAs = null;
        if (($assignment['trainerId'] ?? null) === $trainerId) {
            $matchedAs = 'I';
        } else {
            $asistenIds = $assignment['asistenIds'] ?? null;
            if (($assignment['asistenId'] ?? null) === $trainerId
                || (is_array($asistenIds) && in_array($trainerId, $asistenIds, true))) {
                $matchedAs = 'A';
            }
        }
        if ($matchedAs === null) continue;

        // SF.1 fix 1/5: cover rows need a live origin (write-gate
        // parity, authorize.php cover block minus $tanggal). OMIT when
        // the origin is missing, scope-mismatched, inactive, or
        // date-malformed; the SF.3 dropdown must never offer a row the
        // write gate will 403. Empty-string coverOf counts as absent
        // (legacy) and falls through; non-string coverOf fails closed
        // like the write gate. Helpers via bootstrap -> authorize ->
        // entities.php; $pdo is the same read handle as above.
        $coverOf = $assignment['coverOf'] ?? null;
        if ($coverOf !== null && !(is_string($coverOf) && trim($coverOf) === '')) {
            if (!is_string($coverOf)) continue;
            $origin = findAssignmentById($pdo, $coverOf);
            if ($origin === null) continue;
            if (!coverScopeOverlaps($assignment, $origin)) continue;
            if (($origin['aktif'] ?? null) !== true) continue;
            $originMulai = $origin['periodeMulai'] ?? null;
            if (!is_string($originMulai) || $originMulai === '') continue;
            $originSelesai = $origin['periodeSelesai'] ?? null;
            if ($originSelesai !== null && (!is_string($originSelesai) || $originSelesai === '')) continue;
        }

        // R1: only the 5 whitelisted keys leave the server — never host
        // trainer PII (nama/WA/honor/cabang internals stay server-side).
        // periodeMulai/periodeSelesai/aktif are preserved verbatim: an
        // empty-string periodeSelesai stays "" (it is NOT coerced to
        // null — the client predicate treats non-null, including "",
        // as open-ended per isAssignmentActiveOnDate).
        $out[] = [
            'sekolahId' => $sekolahId,
            'periodeMulai' => $assignment['periodeMulai'] ?? null,
            'periodeSelesai' => $assignment['periodeSelesai'] ?? null,
            'aktif' => $assignment['aktif'] ?? null,
            'peran' => $matchedAs,
        ];
    }
}

jsonResponse($out);
