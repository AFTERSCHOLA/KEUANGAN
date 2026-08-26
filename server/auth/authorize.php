<?php
declare(strict_types=1);

const CANONICAL_SERVER_ROLES = ['superadmin', 'admin_cabang', 'trainer'];

function validServerRole(mixed $role): bool {
    return is_string($role) && in_array($role, CANONICAL_SERVER_ROLES, true);
}

function roleCanReadEntity(string $role, string $entity): bool {
    if ($role === 'superadmin') return true;
    if ($role === 'admin_cabang') return in_array($entity, [
        'cabang', 'sekolah', 'trainer', 'siswa', 'absensi', 'sppPayments', 'honorPayments', 'invoices', 'settings', 'audit_log',
    ], true);
    if ($role === 'trainer') return in_array($entity, ['sekolah', 'trainer', 'siswa', 'absensi'], true);
    return false;
}

function recordOwnsBranch(array $data, array $user): bool {
    $targetBranch = $data['cabangId'] ?? $data['cabang_id'] ?? null;
    return is_string($targetBranch) && $targetBranch !== '' && $targetBranch === ($user['cabangId'] ?? null);
}

function trainerOwnsAttendance(array $data, array $user): bool {
    return ($user['role'] ?? null) === 'trainer'
        && is_string($data['trainerId'] ?? null)
        && $data['trainerId'] === ($user['trainerId'] ?? null);
}

function authorize(string $action, string $resource, ?array $data = null, ?array $user = null): bool {
    $user ??= requireAuthenticatedUser();
    $role = $user['role'] ?? null;
    if (!validServerRole($role)) return false;
    if ($role === 'superadmin') return true;

    $data ??= [];
    if (in_array($action, ['restore', 'manage_users', 'manage_branch', 'manage_settings', 'edit_tarif', 'write_honor_payment', 'settle_honor'], true)) {
        return false;
    }

    if ($role === 'admin_cabang') {
        if ($resource === 'honorPayments' && in_array($action, ['create', 'update', 'delete', 'write'], true)) return false;
        if ($action === 'read') return roleCanReadEntity($role, $resource) && recordOwnsBranch($data, $user);
        if (in_array($action, ['create', 'update', 'delete', 'write', 'verify'], true)) {
            return roleCanReadEntity($role, $resource) && recordOwnsBranch($data, $user);
        }
        return false;
    }

    if ($role === 'trainer') {
        if ($action === 'read') return roleCanReadEntity($role, $resource);
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
