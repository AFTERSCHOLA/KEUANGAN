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
    if ($role === 'trainer') return in_array($entity, ['sekolah', 'trainer', 'siswa', 'absensi'], true);
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
 * Trainer-role read scoping (M3.1 gap 1). Trainer's canonical read entities
 * are 'sekolah', 'trainer', 'siswa', 'absensi' (roleCanReadEntity) but each
 * needs its own ownership check — trainer is assignment-based, not
 * branch-based (trainer has no cabangId of its own in most cases).
 *
 *   - trainer:  own record only, matched by id.
 *   - sekolah:  record.trainerIds must contain this trainer's id
 *               (constants.js newSekolah() stores assignment there).
 *   - absensi:  record.trainerId must match (reuses trainerOwnsAttendance,
 *               same rule already enforced for write/certify).
 *   - siswa:    siswa has no trainerId of its own — assignment is indirect
 *               via siswa.sekolahId -> sekolah.trainerIds. authorize.php has
 *               no DB handle here, so the caller (read.php, M3.3) MUST look
 *               up the student's school and pass its trainerIds in under
 *               $data['_sekolahTrainerIds'] before calling authorize().
 *               Missing that key fails closed (returns false), not open.
 */
function trainerOwnsRecord(string $resource, array $data, array $user): bool {
    $trainerId = $user['trainerId'] ?? null;
    if (!is_string($trainerId) || $trainerId === '') return false;

    if ($resource === 'trainer') {
        $recordId = $data['id'] ?? null;
        return is_string($recordId) && $recordId === $trainerId;
    }
    if ($resource === 'sekolah') {
        return in_array($trainerId, $data['trainerIds'] ?? [], true);
    }
    if ($resource === 'absensi') {
        return trainerOwnsAttendance($data, $user);
    }
    if ($resource === 'siswa') {
        // See docblock above — fails closed if the caller didn't enrich $data.
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