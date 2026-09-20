<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

function policyCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

function u(string $role, array $extra = []): array {
    return array_merge(['role' => $role], $extra);
}

// ---------------------------------------------------------------------
// Superadmin: full access, including actions denied to everyone else.
// ---------------------------------------------------------------------
$superadmin = u('superadmin');
foreach (['cabang', 'sekolah', 'trainer', 'siswa', 'absensi', 'sppPayments', 'honorPayments', 'invoices', 'audit_log', 'settings'] as $resource) {
    policyCheck(authorize('read', $resource, [], $superadmin), "Superadmin read denied for {$resource}");
}
foreach (['restore', 'manage_users', 'manage_branch', 'manage_settings', 'edit_tarif', 'write_honor_payment', 'settle_honor'] as $action) {
    policyCheck(authorize($action, 'anything', [], $superadmin), "Superadmin action denied: {$action}");
}

// ---------------------------------------------------------------------
// Global deny-by-default: restore / settings / honor-write are blocked
// for every non-superadmin role, regardless of resource or branch match.
// ---------------------------------------------------------------------
$adminCabang = u('admin_cabang', ['cabangId' => 'cab-1']);
$trainer = u('trainer', ['trainerId' => 'trn-1']);
foreach (['restore', 'manage_users', 'manage_branch', 'manage_settings', 'edit_tarif', 'write_honor_payment', 'settle_honor'] as $action) {
    policyCheck(!authorize($action, 'anything', ['cabangId' => 'cab-1'], $adminCabang), "Admin Cabang should be denied action: {$action}");
    policyCheck(!authorize($action, 'anything', ['cabangId' => 'cab-1'], $trainer), "Trainer should be denied action: {$action}");
}

// ---------------------------------------------------------------------
// Global settings/tariffs: closed entirely to Admin Cabang, even read.
// ---------------------------------------------------------------------
policyCheck(!authorize('read', 'settings', [], $adminCabang), 'Admin Cabang should not be able to read settings');
policyCheck(!authorize('read', 'settings', [], $trainer), 'Trainer should not be able to read settings');

// ---------------------------------------------------------------------
// Admin Cabang: branch-scoped read/write across owned resources.
// ---------------------------------------------------------------------
foreach (['sekolah', 'trainer', 'siswa', 'absensi', 'sppPayments'] as $resource) {
    policyCheck(authorize('read', $resource, ['cabangId' => 'cab-1'], $adminCabang), "Admin Cabang should read own-branch {$resource}");
    policyCheck(!authorize('read', $resource, ['cabangId' => 'cab-2'], $adminCabang), "Admin Cabang should NOT read other-branch {$resource}");
    policyCheck(authorize('write', $resource, ['cabangId' => 'cab-1'], $adminCabang), "Admin Cabang should write own-branch {$resource}");
    policyCheck(!authorize('write', $resource, ['cabangId' => 'cab-2'], $adminCabang), "Admin Cabang should NOT write other-branch {$resource}");
}

// Cross-branch fails closed on missing/empty cabangId, not treated as global.
policyCheck(!authorize('read', 'siswa', [], $adminCabang), 'Admin Cabang read with missing cabangId should be denied, not global');
policyCheck(!authorize('read', 'siswa', ['cabangId' => ''], $adminCabang), 'Admin Cabang read with empty cabangId should be denied');

// cabang record itself: read-only self-match via record.id === user.cabangId.
policyCheck(authorize('read', 'cabang', ['id' => 'cab-1'], $adminCabang), 'Admin Cabang should read own cabang record');
policyCheck(!authorize('read', 'cabang', ['id' => 'cab-2'], $adminCabang), 'Admin Cabang should NOT read other cabang record');
foreach (['create', 'update', 'delete', 'write'] as $action) {
    policyCheck(!authorize($action, 'cabang', ['id' => 'cab-1'], $adminCabang), "Admin Cabang should NOT {$action} own cabang record (must go through manage_branch)");
}

// honorPayments / invoices: read-only for Admin Cabang.
foreach (['honorPayments', 'invoices'] as $resource) {
    policyCheck(authorize('read', $resource, ['cabangId' => 'cab-1'], $adminCabang), "Admin Cabang should read own-branch {$resource}");
    foreach (['create', 'update', 'delete', 'write'] as $action) {
        policyCheck(!authorize($action, $resource, ['cabangId' => 'cab-1'], $adminCabang), "Admin Cabang should NOT {$action} {$resource}, even own branch");
    }
}

// audit_log: read-only for Admin Cabang (matrix section 5 — regression
// guard for the gap where mutation wasn't explicitly blocked).
policyCheck(authorize('read', 'audit_log', ['cabangId' => 'cab-1'], $adminCabang), 'Admin Cabang should read own-branch audit_log');
policyCheck(!authorize('read', 'audit_log', ['cabangId' => 'cab-2'], $adminCabang), 'Admin Cabang should NOT read other-branch audit_log');
foreach (['create', 'update', 'delete', 'write'] as $action) {
    policyCheck(!authorize($action, 'audit_log', ['cabangId' => 'cab-1'], $adminCabang), "Admin Cabang should NOT {$action} audit_log, even own branch");
}
policyCheck(!authorize('read', 'audit_log', ['cabangId' => 'cab-1'], $trainer), 'Trainer should NOT read audit_log at all');
foreach (['create', 'update', 'delete', 'write'] as $action) {
    policyCheck(!authorize($action, 'audit_log', ['cabangId' => 'cab-1'], $trainer), "Trainer should NOT {$action} audit_log");
}

// ---------------------------------------------------------------------
// Trainer: assignment-based ownership, not branch-based.
// ---------------------------------------------------------------------
policyCheck(authorize('read', 'trainer', ['id' => 'trn-1'], $trainer), 'Trainer should read own record');
policyCheck(!authorize('read', 'trainer', ['id' => 'trn-2'], $trainer), 'Trainer should NOT read another trainer record');

policyCheck(authorize('read', 'sekolah', ['trainerIds' => ['trn-1', 'trn-9']], $trainer), 'Trainer should read assigned sekolah');
policyCheck(!authorize('read', 'sekolah', ['trainerIds' => ['trn-9']], $trainer), 'Trainer should NOT read unassigned sekolah');

policyCheck(authorize('read', 'absensi', ['trainerId' => 'trn-1'], $trainer), 'Trainer should read own absensi');
policyCheck(!authorize('read', 'absensi', ['trainerId' => 'trn-9'], $trainer), 'Trainer should NOT read other trainer absensi');
policyCheck(authorize('write', 'absensi', ['trainerId' => 'trn-1'], $trainer), 'Trainer should write own absensi');
policyCheck(!authorize('write', 'absensi', ['trainerId' => 'trn-9'], $trainer), 'Trainer should NOT write other trainer absensi');
policyCheck(authorize('certify', 'absensi', ['trainerId' => 'trn-1'], $trainer), 'Trainer should self-certify own absensi');
policyCheck(!authorize('certify', 'absensi', ['trainerId' => 'trn-9'], $trainer), 'Trainer should NOT certify other trainer absensi');

// siswa: no direct trainerId — assignment goes through _sekolahTrainerIds,
// which the caller (read.php) MUST enrich. Fails closed if absent.
policyCheck(!authorize('read', 'siswa', ['id' => 'sis-1'], $trainer), 'Trainer siswa read without _sekolahTrainerIds must fail closed');
policyCheck(authorize('read', 'siswa', ['id' => 'sis-1', '_sekolahTrainerIds' => ['trn-1', 'trn-9']], $trainer), 'Trainer siswa read with matching _sekolahTrainerIds should succeed');
policyCheck(!authorize('read', 'siswa', ['id' => 'sis-1', '_sekolahTrainerIds' => ['trn-9']], $trainer), 'Trainer siswa read with non-matching _sekolahTrainerIds should be denied');

// Trainer has no write scope outside absensi.
foreach (['sekolah', 'trainer', 'siswa'] as $resource) {
    foreach (['create', 'update', 'delete', 'write'] as $action) {
        policyCheck(!authorize($action, $resource, ['id' => 'x', 'trainerIds' => ['trn-1'], '_sekolahTrainerIds' => ['trn-1']], $trainer), "Trainer should NOT {$action} {$resource}");
    }
}
// Trainer: sppPayments read-only, scoped through the student's school
// assignment. The caller (read.php) MUST enrich the payment record with
// _sekolahTrainerIds before authorize() is called. Missing ownership data
// fails closed.
policyCheck(
    !authorize('read', 'sppPayments', ['id' => 'spp-1', 'siswaId' => 'sis-1'], $trainer),
    'Trainer sppPayments read without _sekolahTrainerIds must fail closed'
);

policyCheck(
    authorize(
        'read',
        'sppPayments',
        [
            'id' => 'spp-1',
            'siswaId' => 'sis-1',
            '_sekolahTrainerIds' => ['trn-1', 'trn-9'],
        ],
        $trainer
    ),
    'Trainer should read sppPayments for assigned sekolah'
);

policyCheck(
    !authorize(
        'read',
        'sppPayments',
        [
            'id' => 'spp-2',
            'siswaId' => 'sis-2',
            '_sekolahTrainerIds' => ['trn-9'],
        ],
        $trainer
    ),
    'Trainer should NOT read sppPayments for unassigned sekolah'
);

// Trainer must remain read-only for financial ledgers other than the
// explicitly allowed sppPayments.
foreach (['honorPayments', 'invoices'] as $resource) {
    policyCheck(
        !authorize('read', $resource, ['cabangId' => 'cab-1'], $trainer),
        "Trainer should NOT read {$resource}"
    );

    foreach (['create', 'update', 'delete', 'write'] as $action) {
        policyCheck(
            !authorize($action, $resource, ['cabangId' => 'cab-1'], $trainer),
            "Trainer should NOT {$action} {$resource}"
        );
    }
}

// sppPayments is read-only for Trainer — no mutation access.
foreach (['create', 'update', 'delete', 'write'] as $action) {
    policyCheck(
        !authorize(
            $action,
            'sppPayments',
            [
                'id' => 'spp-1',
                'siswaId' => 'sis-1',
                '_sekolahTrainerIds' => ['trn-1'],
            ],
            $trainer
        ),
        "Trainer should NOT {$action} sppPayments"
    );
}

// ---------------------------------------------------------------------
// Invalid / malformed role input never authorizes anything.
// ---------------------------------------------------------------------
foreach (['admin', 'head-trainer', '', null] as $badRole) {
    policyCheck(!authorize('read', 'sekolah', ['cabangId' => 'cab-1'], ['role' => $badRole, 'cabangId' => 'cab-1']), 'Invalid role should never authorize');
}

echo "M3.1 authorize.php policy matrix passed\n";