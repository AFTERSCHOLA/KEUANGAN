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
// AA.A.2 — service-token guard (Hybrid-Opaque Bearer, deny-closed).
// Valid Bearer resolves scope through the SAME authorize();
// revoked/expired/malformed Bearer resolves to null (401 at the edge);
// CSRF boundary: cookie path requires CSRF, Bearer-only skips it, both
// present requires it (fail-closed). NOTE: the trainer sekolah row at
// :96 below still FAILs on the clean tree (trainerIds vs
// _sekolahTrainerIds drift) — pre-existing, untouched by this task.
// ---------------------------------------------------------------------
policyCheck(function_exists('serviceBearerUser'), 'AA.A.2 service-token guard helper is missing');

$__aa2Server = $_SERVER;
$__aa2Cookie = $_COOKIE;
$__aa2Pdo = database();
$__aa2Pdo->exec("DELETE FROM service_tokens WHERE prefix IN ('tstbr001','tstbr002','tstbr003')");
$__aa2Pdo->exec("DELETE FROM users WHERE id = 'usr-bearer-aa2'");
$__aa2Pdo->prepare("INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, active, must_change_password) VALUES ('usr-bearer-aa2','test_bearer_aa2','Bearer AA2',:ph,'admin_cabang','cab-bearer-1',1,0)")
    ->execute([':ph' => password_hash('BearerTest123', PASSWORD_DEFAULT)]);
$__aa2SecretOk = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
$__aa2SecretRevoked = 'ZYXWVUTSRQPONMLKJIHGFEDCBAhgfedcba987654321';
$__aa2SecretExpired = '0123456789abcdefABCDEFGHIJKLMNOPQRSTUVWXYZa';
$__aa2SeedToken = $__aa2Pdo->prepare("INSERT INTO service_tokens (id, prefix, token_hash, last4, user_id, role, cabang_id, trainer_id, name, expires_at, revoked_at, created_ip) VALUES (:id, :prefix, :hash, :last4, 'usr-bearer-aa2', 'admin_cabang', 'cab-bearer-1', NULL, 'AA.A.2 bearer case', :exp, :rev, '127.0.0.1')");
$__aa2SeedToken->execute([':id' => 'srv-bearer-aa2-ok', ':prefix' => 'tstbr001', ':hash' => serviceTokenHash($__aa2SecretOk), ':last4' => '6789', ':exp' => date('Y-m-d H:i:s', time() + 90 * 24 * 60 * 60), ':rev' => null]);
$__aa2SeedToken->execute([':id' => 'srv-bearer-aa2-rev', ':prefix' => 'tstbr002', ':hash' => serviceTokenHash($__aa2SecretRevoked), ':last4' => '4321', ':exp' => date('Y-m-d H:i:s', time() + 90 * 24 * 60 * 60), ':rev' => date('Y-m-d H:i:s', time())]);
$__aa2SeedToken->execute([':id' => 'srv-bearer-aa2-exp', ':prefix' => 'tstbr003', ':hash' => serviceTokenHash($__aa2SecretExpired), ':last4' => 'XYZa', ':exp' => date('Y-m-d H:i:s', time() - 24 * 60 * 60), ':rev' => null]);

// Valid Bearer resolves scope through the SAME authorize().
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr001_' . $__aa2SecretOk;
$_COOKIE = [];
$__aa2User = serviceBearerUser();
policyCheck(is_array($__aa2User), 'AA.A.2 valid Bearer should resolve a user');
policyCheck(array_keys($__aa2User) === ['id', 'username', 'displayName', 'role', 'cabangId', 'trainerId', 'active', 'mustChangePassword'], 'AA.A.2 Bearer identity must match the safeIdentity() shape');
policyCheck($__aa2User['username'] === 'test_bearer_aa2' && $__aa2User['role'] === 'admin_cabang' && $__aa2User['cabangId'] === 'cab-bearer-1', 'AA.A.2 Bearer identity must carry the user row scope');
policyCheck(authorize('read', 'siswa', ['cabangId' => 'cab-bearer-1'], $__aa2User), 'AA.A.2 valid Bearer should read own branch');
policyCheck(!authorize('read', 'siswa', ['cabangId' => 'cab-other'], $__aa2User), 'AA.A.2 valid Bearer must NOT read cross-branch (scope still enforced)');
policyCheck(requestRequiresCsrf($__aa2User) === false, 'AA.A.2 Bearer-only POST without CSRF must pass the CSRF gate');

// Revoked / expired / wrong-secret / malformed / missing Bearer → null.
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr002_' . $__aa2SecretRevoked;
$_COOKIE = [];
policyCheck(serviceBearerUser() === null, 'AA.A.2 revoked Bearer must resolve to null (401 at the edge)');
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr003_' . $__aa2SecretExpired;
policyCheck(serviceBearerUser() === null, 'AA.A.2 expired Bearer must resolve to null (401 at the edge)');
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr001_' . substr($__aa2SecretOk, 0, 42) . 'X';
policyCheck(serviceBearerUser() === null, 'AA.A.2 wrong-secret Bearer must resolve to null');
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer garbage';
policyCheck(serviceBearerUser() === null, 'AA.A.2 malformed Bearer must resolve to null');
unset($_SERVER['HTTP_AUTHORIZATION']);
policyCheck(serviceBearerUser() === null, 'AA.A.2 missing Bearer header must resolve to null');

// CSRF boundary: cookie path requires CSRF (403 at the edge); both
// present (Bearer header + session cookie) requires CSRF (fail-closed).
$__aa2SessionKey = serverConfig()['session_name'] ?? 'afterschola_session';
$_COOKIE = [$__aa2SessionKey => 'dummy-session-id'];
policyCheck(requestRequiresCsrf(null) === true, 'AA.A.2 cookie POST without CSRF must require CSRF (403 at the edge)');
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr001_' . $__aa2SecretOk;
policyCheck(requestRequiresCsrf($__aa2User) === true, 'AA.A.2 Bearer + session cookie must still require CSRF (fail-closed)');

$__aa2Pdo->exec("DELETE FROM service_tokens WHERE prefix IN ('tstbr001','tstbr002','tstbr003')");
$__aa2Pdo->exec("DELETE FROM users WHERE id = 'usr-bearer-aa2'");
$_SERVER = $__aa2Server;
$_COOKIE = $__aa2Cookie;

echo "AA.A.2 service-token guard rows passed\n";

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

// AP.D.1 (D-AP7): honorPayments — admin_cabang writes own branch
// (branch-scoped lane), cross-branch denied. Invoices stay read-only.
policyCheck(authorize('read', 'honorPayments', ['cabangId' => 'cab-1'], $adminCabang), 'Admin Cabang should read own-branch honorPayments');
foreach (['create', 'update', 'delete', 'write'] as $action) {
    policyCheck(authorize($action, 'honorPayments', ['cabangId' => 'cab-1'], $adminCabang), "Admin Cabang should {$action} own-branch honorPayments (AP.D.1)");
    policyCheck(!authorize($action, 'honorPayments', ['cabangId' => 'cab-2'], $adminCabang), "Admin Cabang should NOT {$action} cross-branch honorPayments");
}
// invoices: read-only for Admin Cabang (unchanged).
foreach (['invoices'] as $resource) {
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