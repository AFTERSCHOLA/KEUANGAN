<?php
declare(strict_types=1);

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
        'cabang', 'sekolah', 'trainer', 'siswa', 'absensi', 'sppPayments', 'honorPayments', 'invoices', 'audit_log',
    ], true);
    if ($role === 'trainer') return in_array($entity, ['sekolah', 'trainer', 'siswa', 'absensi', 'sppPayments'], true);
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

    if ($resource === 'siswa') {
        // Siswa mengikuti scope sekolahnya.
        // read.php mengisi _sekolahTrainerIds dari assignment
        // yang tersimpan di DB, bukan dari request client.
        return in_array($trainerId, $data['_sekolahTrainerIds'] ?? [], true);
    }

    if ($resource === 'sppPayments') {
        return in_array($trainerId, $data['_sekolahTrainerIds'] ?? [], true);
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
        // Same treatment as honorPayments/invoices: read allowed via the normal
        // branch-scoped read path below, mutation blocked here regardless of
        // branch ownership so a matching cabangId can't be used to write/delete.
        if (in_array($resource, ['honorPayments', 'invoices', 'audit_log'], true) && in_array($action, ['create', 'update', 'delete', 'write'], true)) {
            return false;
        }
        
        if ($action === 'read') return roleCanReadEntity($role, $resource) && recordOwnsBranch($resource, $data, $user);
        if (in_array($action, ['create', 'update', 'delete', 'write', 'verify'], true)) {
            return roleCanReadEntity($role, $resource) && recordOwnsBranch($resource, $data, $user);
        }
        return false;
    }

    if ($role === 'trainer') {
        if ($action === 'read') return roleCanReadEntity($role, $resource) && trainerOwnsRecord($resource, $data, $user);
        if ($resource === 'absensi' && $action === 'write') return trainerOwnsAttendance($data, $user);
        if ($resource === 'absensi' && $action === 'certify') return trainerOwnsAttendance($data, $user);
        return false;
    }

    return false;
}

function requireAuthorization(string $action, string $resource, ?array $data = null, ?array $user = null): array {
    $user ??= requireAuthenticatedUser();
    if (!authorize($action, $resource, $data, $user)) jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    return $user;
}