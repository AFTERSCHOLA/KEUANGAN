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
// query-param filtering (YAGNI). coverOf rows are returned verbatim;
// filtering stays the client's date gate + the server write-gate
// (trainerHasActiveAssignment) concern, not this lane's.

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
