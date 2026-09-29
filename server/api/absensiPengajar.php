<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

// TA.B.2 (F-TA7; D-TA11, D-TA13) — trainer/asisten self-attendance write.
// TA.B.4 (R-TA4) — admin correction path added below: append-only,
// mirrors honorPayments' correction_of pattern rather than legacy
// absensi.php's overwrite-by-id pattern, because absensiPengajar feeds
// Gate C honor calculation (D-TA14) and warrants the stronger audit
// trail already used for money-adjacent ledgers.

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

// 401 first (who are you), then CSRF (403) — both before touching the
// body or the database, same ordering as absensi.php.
$user = requireAuthenticatedUser();
requireCsrf();

$data = requestJson();

if (($data['action'] ?? 'write') === 'correct') {
    // Admin Cabang / Superadmin only (enforced by authorize.php — trainer
    // role has no 'correct' branch and falls through to false/403).
    $originalId = $data['correctionOf'] ?? null;
    if (!is_string($originalId) || trim($originalId) === '') {
        jsonResponse(['error' => 'correctionOf dibutuhkan'], 422);
    }

    $pdo = database();
    $stmt = $pdo->prepare('SELECT cabang_id, payload FROM absensi_pengajar WHERE id = :id');
    $stmt->execute([':id' => $originalId]);
    $original = $stmt->fetch();
    if ($original === false) {
        jsonResponse(['error' => 'Record absensiPengajar asli tidak ditemukan', 'id' => $originalId], 422);
    }

    $originalPayload = json_decode($original['payload'], true) ?: [];

    // FIX (TA.B.4 bug — ditemukan via trainer-attendance-admin.spec.js):
    // body dari correctLedgerEntry() client (store.js) berbentuk
    // { record: {...}, correctionOf, action }. requireRecord() sebelumnya
    // dipanggil dengan $data mentah, yang tidak punya 'id'/'cabangId' di
    // top-level (adanya di $data['record']) — selalu jatuh ke error
    // "Record membutuhkan id". Fix: ambil dari $data['record'].
    $record = requireRecord($data['record'] ?? []);

    // CS.B.2 — corrections mint new rows, so the same role/recorder
    // shape gate applies (a correction cannot smuggle an unvalidated
    // peran or a missing/forged dicatatOleh past the write path).
    // T2.E.2 (F-T2-14; D-T2-9) — the corrector is an admin, never the
    // original recorder: pass the original's dicatatOleh as the
    // preserved identity so a faithful preservation passes while a
    // forged third id still 422s.
    $csbCorrectError = absensiPengajarWriteError($record, database(), $user, $originalPayload['dicatatOleh'] ?? null);
    if ($csbCorrectError !== null) {
        jsonResponse(['error' => $csbCorrectError], 422);
    }

    // Authorize against the NEW record's cabangId (where the correction
    // is being written), the same way masterWrite() re-checks both old
    // and new branch on a cabangId-changing update. A correction cannot
    // move an attendance record across branches implicitly — cabangId on
    // the incoming record must already match recordOwnsBranch's rule.
    requireAuthorization('correct', 'absensiPengajar', $record, $user);

    // R-SB6-style guard: a correction must stay attached to the same
    // trainer + sekolah as the record it corrects, not quietly re-point
    // the attendance to someone else's record via a mismatched original.
    if (($record['trainerId'] ?? null) !== ($originalPayload['trainerId'] ?? null)) {
        jsonResponse(['error' => 'correctionOf: trainerId tidak cocok dengan record asli'], 422);
    }
    if (($record['sekolahId'] ?? null) !== ($originalPayload['sekolahId'] ?? null)) {
        jsonResponse(['error' => 'correctionOf: sekolahId tidak cocok dengan record asli'], 422);
    }

    insertLedger('absensiPengajar', $record, $originalId);
    // FIX: hentikan eksekusi di sini — tanpa ini, kode jatuh terus ke
    // jalur 'write' di bawah dan mencoba requireRecord($data) lagi
    // (yang juga akan gagal, karena alasan yang sama seperti di atas).
    exit;
}

// --- existing 'write' path below, unchanged ---
// Structural validation (422) before authorization (403) — a malformed
// record shouldn't leak whether it would've been in-scope or not.
$record = requireRecord($data);

// CS.B.2 (D-CS3/D-CS5) — per-session role + external recorder shape gate
// (R-CS5: server is authoritative). peran must enum I/A when present;
// dicatatOleh is required iff the row's person is external and must be
// the caller themselves (no forging someone else as the recorder).
// Legacy rows without both keys pass byte-identically.
$csbWriteError = absensiPengajarWriteError($record, database(), $user);
if ($csbWriteError !== null) {
    jsonResponse(['error' => $csbWriteError], 422);
}

// R-TA6/R-TA8 enforcement lives in authorize.php:
// - trainerOwnsAttendance(): $record['trainerId'] must match the caller's
//   own trainerId (a trainer cannot write another trainer's/asisten's
//   attendance, and cannot use someone else's trainerId to bypass scope).
// - trainerHasActiveAssignment(): $record['sekolahId'] must be one this
//   trainer/asisten is actively assigned to, and $record['tanggal'] must
//   fall inside that assignment's aktif date range.
// - CS.B.1 (D-CS2): a cover row passes through its coverOf origin link.
// - CS.B.2 (D-CS5): an external row passes with dicatatOleh=self in own
//   school+date scope.
requireAuthorization('write', 'absensiPengajar', $record, $user);

insertLedger('absensiPengajar', $record);