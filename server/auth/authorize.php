<?php
declare(strict_types=1);

// CS.B.1 (D-CS2) — cover-link origin resolution lives in
// server/validation/entities.php (pure, no side effects on load).
require_once __DIR__ . '/../validation/entities.php';

// AA.A.2 (D-AA2) — service-token guard (Bearer resolution + CSRF
// boundary). Load-only: scope semantics below are unchanged; the guard
// supplies the ?array $user authorize() already accepts, never a bypass.
require_once __DIR__ . '/service-tokens.php';

const CANONICAL_SERVER_ROLES = ['superadmin', 'admin_cabang', 'trainer'];

function validServerRole(mixed $role): bool {
    return is_string($role) && in_array($role, CANONICAL_SERVER_ROLES, true);
}

function roleCanReadEntity(string $role, string $entity): bool {
    if ($role === 'superadmin') return true;
    if ($role === 'admin_cabang') return in_array($entity, [
        // 'settings' intentionally excluded — global settings/tariffs are
        // Superadmin-only per PRODUCTION_PLAN.md section 5 (decision: kept
        // closed entirely, not filtered).
        // CS.B.2 (D-CS5) — 'eksternal' added: admin_cabang writes own
        // branch only via the generic branch-scoped path below.
        'cabang', 'sekolah', 'trainer', 'siswa', 'absensi', 'absensiPengajar', 'sppPayments', 'honorPayments', 'invoices', 'audit_log', 'eksternal',
    ], true);
    // CS.B.2 (D-CS5) — trainer may READ externals in assigned schools
    // (reference-only for the attendance picker); external-person create
    // stays denied (reference-only; deferred inline creation).
    if ($role === 'trainer') return in_array($entity, ['sekolah', 'trainer', 'siswa', 'absensi', 'absensiPengajar', 'sppPayments', 'honorPayments', 'eksternal'], true);
    return false;
}

function recordOwnsBranch(string $resource, array $data, array $user): bool {
    // `cabang` records don't carry a cabangId field pointing at themselves —
    // the record's own `id` IS the branch id (see schema.sql: `cabang` has
    // no cabang_id column, unlike every other branch-owned table). Special-
    // case it so Admin Cabang can read their own branch record.
    if ($resource === 'cabang') {
        $recordId = $data['id'] ?? null;
        return is_string($recordId) && $recordId !== '' && $recordId === ($user['cabangId'] ?? null);
    }
    $targetBranch = $data['cabangId'] ?? $data['cabang_id'] ?? null;
    return is_string($targetBranch) && $targetBranch !== '' && $targetBranch === ($user['cabangId'] ?? null);
}

function trainerOwnsAttendance(array $data, array $user): bool {
    return ($user['role'] ?? null) === 'trainer'
        && is_string($data['trainerId'] ?? null)
        && $data['trainerId'] === ($user['trainerId'] ?? null);
}

/**
 * TA.B.2 (R-TA8) — cek apakah $trainerId (sebagai instruktur ATAU asisten)
 * mempunyai penugasan untuk $sekolahId yang `aktif = true` dan rentang
 * tanggalnya (periodeMulai..periodeSelesai) mencakup $tanggal.
 *
 * Keputusan eksplisit: periodeSelesai = null diperlakukan sebagai
 * penugasan ongoing/tanpa batas atas, BUKAN "tidak valid sampai diisi".
 * Ini konsisten dengan field optional lain di codebase ini (honor,
 * keterangan) yang permisif selama tidak diisi, bukan fail-closed karena
 * kosong. Kalau kebutuhan bisnis berubah (mis. penugasan tanpa
 * periodeSelesai harus dianggap invalid), ini titik satu-satunya yang
 * perlu diubah.
 *
 * Fails closed: assignment dengan data tanggal/aktif yang malformed
 * dilewati (skip), bukan dianggap match.
 */
function trainerHasActiveAssignment(string $trainerId, string $sekolahId, string $tanggal, PDO $pdo): bool {
    $trainerRows = $pdo->query('SELECT payload FROM trainer ORDER BY created_at, id')->fetchAll();

    foreach ($trainerRows as $row) {
        $trainerPayload = json_decode($row['payload'], true);
        if (!is_array($trainerPayload)) continue;

        $assignments = $trainerPayload['penugasanPengajar'] ?? [];
        if (!is_array($assignments)) continue;

        foreach ($assignments as $assignment) {
            if (!is_array($assignment)) continue;

            $assignedSekolahId = $assignment['sekolahId'] ?? null;
            if ($assignedSekolahId !== $sekolahId) continue;

            // CS.B.2 (D-CS4) — multi-assistant union read: legacy
            // asistenId counts as position 0, asistenIds adds positions
            // 1-2. Reads use the union; writes prefer the new key.
            $asistenIds = $assignment['asistenIds'] ?? null;
            $matchesTrainer = ($assignment['trainerId'] ?? null) === $trainerId
                || ($assignment['asistenId'] ?? null) === $trainerId
                || (is_array($asistenIds) && in_array($trainerId, $asistenIds, true));
            if (!$matchesTrainer) continue;

            if (($assignment['aktif'] ?? null) !== true) continue;

            $periodeMulai = $assignment['periodeMulai'] ?? null;
            if (!is_string($periodeMulai) || $periodeMulai === '') continue;
            if ($tanggal < $periodeMulai) continue;

            $periodeSelesai = $assignment['periodeSelesai'] ?? null;
            if ($periodeSelesai !== null) {
                if (!is_string($periodeSelesai) || $periodeSelesai === '') continue;
                if ($tanggal > $periodeSelesai) continue;
            }

            // CS.B.1 (F-CS2; D-CS2) — cover path. A row carrying coverOf
            // is NOT pay-eligible on its own: it passes only through a
            // live origin (existing assignment, same sekolahId +
            // overlapping scope, aktif, date-covering). Normal rows
            // (coverOf absent/null) return here exactly as before — no
            // cover link, no pay, the 403 stays for genuinely unassigned
            // writes. Malformed origins fail closed (skip, not match).
            $coverOf = $assignment['coverOf'] ?? null;
            if ($coverOf !== null) {
                if (!is_string($coverOf) || trim($coverOf) === '') continue;
                $origin = findAssignmentById($pdo, $coverOf);
                if ($origin === null) continue;
                if (!coverScopeOverlaps($assignment, $origin)) continue;
                if (($origin['aktif'] ?? null) !== true) continue;
                $originMulai = $origin['periodeMulai'] ?? null;
                if (!is_string($originMulai) || $originMulai === '') continue;
                if ($tanggal < $originMulai) continue;
                $originSelesai = $origin['periodeSelesai'] ?? null;
                if ($originSelesai !== null) {
                    if (!is_string($originSelesai) || $originSelesai === '') continue;
                    if ($tanggal > $originSelesai) continue;
                }
            }

            return true;
        }
    }

    return false;
}

/**
 * Trainer-role read scoping.
 *
 * Trainer/asisten ownership is assignment-based, not branch-based.
 * The assignment scope is derived server-side by read.php from the
 * penugasanPengajar records stored in trainer payloads.
 *
 * - trainer: own trainer record only.
 * - sekolah: trainer must appear as trainerId OR asistenId in an
 *            assignment for that school.
 * - siswa: scope follows the student's sekolah assignment.
 * - absensi: own trainerId only.
 *
 * Missing enrichment data fails closed.
 */
function trainerOwnsRecord(string $resource, array $data, array $user): bool {
    $trainerId = $user['trainerId'] ?? null;
    if (!is_string($trainerId) || $trainerId === '') return false;

    if ($resource === 'trainer') {
        $recordId = $data['id'] ?? null;
        return is_string($recordId) && $recordId === $trainerId;
    }

    if ($resource === 'sekolah') {
        // Scope sekolah harus berasal dari penugasan yang sudah
        // di-enrich server-side oleh read.php.
        $assignedTrainerIds = $data['_sekolahTrainerIds'] ?? [];
        return is_array($assignedTrainerIds)
            && in_array($trainerId, $assignedTrainerIds, true);
    }

    if ($resource === 'absensi') {
        return trainerOwnsAttendance($data, $user);
    }

    if ($resource === 'absensiPengajar') {
        return trainerOwnsAttendance($data, $user);
    }

    if ($resource === 'siswa') {
        // Siswa mengikuti scope sekolahnya.
        // read.php mengisi _sekolahTrainerIds dari assignment
        // yang tersimpan di DB, bukan dari request client.
        return in_array($trainerId, $data['_sekolahTrainerIds'] ?? [], true);
    }

    if ($resource === 'eksternal') {
        // CS.B.2 (D-CS5) — external persons are school-scoped exactly
        // like siswa (read.php enriches _sekolahTrainerIds from the
        // external's sekolahId). Reference-only: read-only branch here.
        return in_array($trainerId, $data['_sekolahTrainerIds'] ?? [], true);
    }

    if ($resource === 'sppPayments') {
        return in_array($trainerId, $data['_sekolahTrainerIds'] ?? [], true);
    }

    if ($resource === 'honorPayments') {
    return is_string($data['trainerId'] ?? null) && $data['trainerId'] === ($user['trainerId'] ?? null);
    }

    return false;
}

function authorize(string $action, string $resource, ?array $data = null, ?array $user = null): bool {
    $user ??= requireAuthenticatedUser();
    $role = $user['role'] ?? null;
    if (!validServerRole($role)) return false;
    if ($role === 'superadmin') return true;

    $data ??= [];
    if (in_array($action, ['restore', 'manage_users', 'manage_branch', 'manage_settings', 'manage_backup', 'edit_tarif', 'write_honor_payment', 'settle_honor'], true)) {
        return false;
    }

    if ($role === 'admin_cabang') {
        // Cabang record itself: read-only for admin_cabang. Mutation must go
        // through the explicit 'manage_branch' action (already denied above)
        // — this closes a generic 'update'/'write' call on resource 'cabang'
        // slipping through recordOwnsBranch()'s self-match (record.id ===
        // user.cabangId) and letting an admin edit their own branch record.
        if ($resource === 'cabang' && in_array($action, ['create', 'update', 'delete', 'write'], true)) {
            return false;
        }

        // Audit log: matrix section 5 — Admin Cabang is "Own branch read-only".
        // Same treatment as invoices: read allowed via the normal
        // branch-scoped read path below, mutation blocked here regardless of
        // branch ownership so a matching cabangId can't be used to write/delete.
        // AP.D.1 (D-AP7): honorPayments is EXCLUDED from this deny-list — it
        // falls through to the branch-scoped write check below, so
        // admin_cabang may append/correct own-branch honor (client derives
        // cabangId from the trainer's school, PaymentTable.jsx:45-47) while
        // cross-branch stays 403 via recordOwnsBranch. Every write is
        // trailed (insertLedger auditEvent, bootstrap.php:241).
        if (in_array($resource, ['invoices', 'audit_log'], true) && in_array($action, ['create', 'update', 'delete', 'write'], true)) {
            return false;
        }

        if ($action === 'read') return roleCanReadEntity($role, $resource) && recordOwnsBranch($resource, $data, $user);
        // TA.B.4 — 'correct' ditambahkan ke daftar action bervalidasi
        // branch-scope yang sama dengan create/update/delete/write/verify.
        // Tanpa ini, admin_cabang.absensiPengajar correction selalu jatuh
        // ke `return false;` di akhir fungsi (403 bahkan untuk cabang
        // sendiri), karena tidak ada cabang lain yang menangani 'correct'.
        if (in_array($action, ['create', 'update', 'delete', 'write', 'verify', 'correct'], true)) {
            return roleCanReadEntity($role, $resource) && recordOwnsBranch($resource, $data, $user);
        }
        return false;
    }

    if ($role === 'trainer') {
        if ($action === 'read') return roleCanReadEntity($role, $resource) && trainerOwnsRecord($resource, $data, $user);
        if ($resource === 'absensi' && $action === 'write') return trainerOwnsAttendance($data, $user);
        if ($resource === 'absensi' && $action === 'certify') return trainerOwnsAttendance($data, $user);
        if ($resource === 'absensiPengajar' && $action === 'write') {
            $sekolahId = $data['sekolahId'] ?? null;
            $tanggal = $data['tanggal'] ?? null;
            if (!is_string($sekolahId) || !is_string($tanggal)) {
                return false;
            }
            // CS.B.2 (D-CS5) — external-attendance lane. The row's person
            // is an external without a login, so ownership cannot match:
            // the recorder proves presence instead. Allowed iff the
            // caller records as themselves (dicatatOleh === own user id)
            // AND holds own school+date scope for that session (they were
            // there). The endpoint's 422 shape gate pins recorder identity
            // first; this lane is the backstop for the sync.php
            // authorize-only path, where a forged recorder fails as 403.
            if (isExternalPerson(database(), $data['trainerId'] ?? null)) {
                $me = $user['id'] ?? null;
                if (!is_string($me) || $me === '' || ($data['dicatatOleh'] ?? null) !== $me) {
                    return false;
                }
                return trainerHasActiveAssignment($user['trainerId'] ?? '', $sekolahId, $tanggal, database());
            }
            if (!trainerOwnsAttendance($data, $user)) {
                return false;
            }
            // R-CS4: a recorder on an internal row is a defect — the
            // endpoint 422s it, and this lane refuses it too so the
            // sync.php path (authorize-only) cannot smuggle one in.
            if (($data['dicatatOleh'] ?? null) !== null) {
                return false;
            }
            return trainerHasActiveAssignment($data['trainerId'], $sekolahId, $tanggal, database());
        }
        // CS.B.2 (D-CS5) — trainer external-person create stays denied
        // (reference-only; deferred inline creation, taste #33).
        if ($resource === 'eksternal') {
            return false;
        }
        // Trainer sengaja TIDAK punya jalur 'correct' di sini — koreksi
        // absensiPengajar adalah scope Admin Cabang/Superadmin saja
        // (TA.B.4). Trainer yang mengirim action=correct jatuh ke `return
        // false;` di bawah -> 403, bukan diam-diam diizinkan lewat cek
        // trainerOwnsAttendance/trainerHasActiveAssignment yang hanya
        // menjaga jalur 'write'.
        return false;
    }

    return false;
}

function requireAuthorization(string $action, string $resource, ?array $data = null, ?array $user = null): array {
    $user ??= requireAuthenticatedUser();
    if (!authorize($action, $resource, $data, $user)) jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    return $user;
}