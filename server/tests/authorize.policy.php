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
$__aa2Pdo->exec("DELETE FROM service_tokens WHERE prefix IN ('tstbr001','tstbr002','tstbr003','tstbr004','tstbr005')");
$__aa2Pdo->exec("DELETE FROM users WHERE id = 'usr-bearer-aa2'");
$__aa2Pdo->prepare("INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, active, must_change_password) VALUES ('usr-bearer-aa2','test_bearer_aa2','Bearer AA2',:ph,'admin_cabang','cab-bearer-1',1,0)")
    ->execute([':ph' => password_hash('BearerTest123', PASSWORD_DEFAULT)]);
$__aa2SecretOk = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
$__aa2SecretRevoked = 'ZYXWVUTSRQPONMLKJIHGFEDCBAhgfedcba987654321';
$__aa2SecretExpired = '0123456789abcdefABCDEFGHIJKLMNOPQRSTUVWXYZa';
$__aa2SecretStaleBranch = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
$__aa2SeedToken = $__aa2Pdo->prepare("INSERT INTO service_tokens (id, prefix, token_hash, last4, user_id, role, cabang_id, trainer_id, name, expires_at, revoked_at, created_ip) VALUES (:id, :prefix, :hash, :last4, 'usr-bearer-aa2', 'admin_cabang', :cabang, NULL, 'AA.A.2 bearer case', :exp, :rev, '127.0.0.1')");
$__aa2SeedToken->execute([':id' => 'srv-bearer-aa2-ok', ':prefix' => 'tstbr001', ':hash' => serviceTokenHash($__aa2SecretOk), ':last4' => '6789', ':cabang' => 'cab-bearer-1', ':exp' => date('Y-m-d H:i:s', time() + 90 * 24 * 60 * 60), ':rev' => null]);
$__aa2SeedToken->execute([':id' => 'srv-bearer-aa2-rev', ':prefix' => 'tstbr002', ':hash' => serviceTokenHash($__aa2SecretRevoked), ':last4' => '4321', ':cabang' => 'cab-bearer-1', ':exp' => date('Y-m-d H:i:s', time() + 90 * 24 * 60 * 60), ':rev' => date('Y-m-d H:i:s', time())]);
$__aa2SeedToken->execute([':id' => 'srv-bearer-aa2-exp', ':prefix' => 'tstbr003', ':hash' => serviceTokenHash($__aa2SecretExpired), ':last4' => 'XYZa', ':cabang' => 'cab-bearer-1', ':exp' => date('Y-m-d H:i:s', time() - 24 * 60 * 60), ':rev' => null]);
// Fix round 1/5, Finding 1: token minted for another branch (stale scope
// after a branch transfer) — must fail closed against the live user row.
$__aa2SeedToken->execute([':id' => 'srv-bearer-aa2-stale', ':prefix' => 'tstbr004', ':hash' => serviceTokenHash($__aa2SecretStaleBranch), ':last4' => 'NOPQ', ':cabang' => 'cab-other', ':exp' => date('Y-m-d H:i:s', time() + 90 * 24 * 60 * 60), ':rev' => null]);

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
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_zzzz9999_' . $__aa2SecretOk;
$_COOKIE = [];
policyCheck(serviceBearerUser() === null, 'AA.A.2 unknown-prefix Bearer must resolve to null');
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr004_' . $__aa2SecretStaleBranch;
policyCheck(serviceBearerUser() === null, 'AA.A.2 branch-stale Bearer must resolve to null (token cabang differs from live user row)');
unset($_SERVER['HTTP_AUTHORIZATION']);
policyCheck(serviceBearerUser() === null, 'AA.A.2 missing Bearer header must resolve to null');

// CSRF boundary: cookie path requires CSRF (403 at the edge); both
// present (Bearer header + session cookie) requires CSRF (fail-closed).
$__aa2SessionKey = serverConfig()['session_name'] ?? 'afterschola_session';
$_COOKIE = [$__aa2SessionKey => 'dummy-session-id'];
policyCheck(requestRequiresCsrf(null) === true, 'AA.A.2 cookie POST without CSRF must require CSRF (403 at the edge)');
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr001_' . $__aa2SecretOk;
policyCheck(requestRequiresCsrf($__aa2User) === true, 'AA.A.2 Bearer + session cookie must still require CSRF (fail-closed)');

// Fix round 1/5, Finding 2: SERVICE_TOKEN_PEPPER path — the HMAC hash
// resolves while the pepper is set (and the plain-SHA256 token stops
// resolving, proving the hash mode actually switched); env restored
// after so later rows run pepper-free.
$__aa2PriorPepper = getenv('SERVICE_TOKEN_PEPPER');
putenv('SERVICE_TOKEN_PEPPER=aa2-test-pepper');
$__aa2SecretPeppered = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg';
$__aa2Pdo->prepare("INSERT INTO service_tokens (id, prefix, token_hash, last4, user_id, role, cabang_id, trainer_id, name, expires_at, revoked_at, created_ip) VALUES ('srv-bearer-aa2-pep','tstbr005',:hash,'defg','usr-bearer-aa2','admin_cabang','cab-bearer-1',NULL,'AA.A.2 pepper case',:exp,NULL,'127.0.0.1')")
    ->execute([':hash' => serviceTokenHash($__aa2SecretPeppered), ':exp' => date('Y-m-d H:i:s', time() + 90 * 24 * 60 * 60)]);
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr005_' . $__aa2SecretPeppered;
$_COOKIE = [];
$__aa2PepperUser = serviceBearerUser();
policyCheck(is_array($__aa2PepperUser) && $__aa2PepperUser['username'] === 'test_bearer_aa2', 'AA.A.2 peppered Bearer should resolve under SERVICE_TOKEN_PEPPER');
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr001_' . $__aa2SecretOk;
policyCheck(serviceBearerUser() === null, 'AA.A.2 plain-hash Bearer must NOT resolve while SERVICE_TOKEN_PEPPER is set');
if ($__aa2PriorPepper === false) {
    putenv('SERVICE_TOKEN_PEPPER');
} else {
    putenv('SERVICE_TOKEN_PEPPER=' . $__aa2PriorPepper);
}
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr001_' . $__aa2SecretOk;
$_COOKIE = [];
policyCheck(is_array(serviceBearerUser()), 'AA.A.2 plain-hash Bearer should resolve again after pepper restore');

$__aa2Pdo->exec("DELETE FROM service_tokens WHERE prefix IN ('tstbr001','tstbr002','tstbr003','tstbr004','tstbr005')");
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

policyCheck(authorize('read', 'sekolah', ['id' => 'sch-1', 'trainerIds' => ['trn-1', 'trn-9'], '_sekolahTrainerIds' => ['trn-1', 'trn-9']], $trainer), 'Trainer should read assigned sekolah');
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
// Slice 1 Raport (2026-10-03) — trainer/manager RBAC for 'raport'.
// Trainer writes iff scope-assigned to the student's school (via
// _sekolahTrainerIds, ownership-only without a date gate, BUG2
// parity); deletes only own-scope Draft rows; verification
// (Diajukan->Terverifikasi) is admin_cabang/superadmin only.
// Admin Cabang is branch-scoped via cabangId, like other master data.
// ---------------------------------------------------------------------
$raportAssigned = ['id' => 'rpt-1', 'siswaId' => 'sis-1', 'cabangId' => 'cab-1', 'status' => 'Draft', '_sekolahTrainerIds' => ['trn-1']];
$raportUnassigned = ['id' => 'rpt-2', 'siswaId' => 'sis-2', 'cabangId' => 'cab-1', 'status' => 'Draft', '_sekolahTrainerIds' => ['trn-9']];
$raportVerified = ['id' => 'rpt-3', 'siswaId' => 'sis-1', 'cabangId' => 'cab-1', 'status' => 'Terverifikasi', '_sekolahTrainerIds' => ['trn-1']];
policyCheck(authorize('read', 'raport', $raportAssigned, $trainer), 'Trainer should read raport for assigned sekolah');
policyCheck(!authorize('read', 'raport', $raportUnassigned, $trainer), 'Trainer should NOT read raport for unassigned sekolah');
policyCheck(authorize('write', 'raport', $raportAssigned, $trainer), 'Trainer should write raport for assigned sekolah');
policyCheck(!authorize('write', 'raport', $raportUnassigned, $trainer), 'Trainer should NOT write raport for unassigned sekolah');
policyCheck(authorize('delete', 'raport', $raportAssigned, $trainer), 'Trainer should delete own-scope Draft raport');
policyCheck(!authorize('delete', 'raport', $raportVerified, $trainer), 'Trainer should NOT delete Terverifikasi raport');
policyCheck(!authorize('write', 'raport', array_merge($raportAssigned, ['status' => 'Terverifikasi']), $trainer), 'Trainer should NOT verify (write Terverifikasi) raport');
policyCheck(authorize('write', 'raport', ['cabangId' => 'cab-1'], $adminCabang), 'Admin Cabang should write own-branch raport');
policyCheck(!authorize('write', 'raport', ['cabangId' => 'cab-2'], $adminCabang), 'Admin Cabang should NOT write cross-branch raport');

// Slice 1 Raport — live-DB fallback for the endpoint write path
// (server/api/raport.php -> masterWrite): the stored record carries no
// _sekolahTrainerIds enrichment, so authorize() resolves the student's
// school + the trainer assignment from the live DB. Seeds mirror the
// AA.A.2 style above; pre-cleanup keeps re-runs idempotent.
$__rptPdo = database();
$__rptPdo->exec("DELETE FROM siswa WHERE id IN ('sis-rpt-a','sis-rpt-b')");
$__rptPdo->exec("DELETE FROM trainer WHERE id IN ('trn-rpt-1')");
$__rptPdo->prepare("INSERT INTO siswa (id, cabang_id, payload) VALUES ('sis-rpt-a','cab-1',:p)")
    ->execute([':p' => json_encode(['id' => 'sis-rpt-a', 'sekolahId' => 'sch-rpt-a', 'cabangId' => 'cab-1', 'status' => 'Aktif'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
$__rptPdo->prepare("INSERT INTO siswa (id, cabang_id, payload) VALUES ('sis-rpt-b','cab-1',:p)")
    ->execute([':p' => json_encode(['id' => 'sis-rpt-b', 'sekolahId' => 'sch-rpt-b', 'cabangId' => 'cab-1', 'status' => 'Aktif'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
$__rptPdo->prepare("INSERT INTO trainer (id, cabang_id, payload) VALUES ('trn-rpt-1','cab-1',:p)")
    ->execute([':p' => json_encode(['id' => 'trn-rpt-1', 'cabangId' => 'cab-1', 'penugasanPengajar' => [['sekolahId' => 'sch-rpt-a', 'trainerId' => 'trn-rpt-1', 'aktif' => true]]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
$trainerRpt = u('trainer', ['trainerId' => 'trn-rpt-1']);
policyCheck(authorize('write', 'raport', ['id' => 'rpt-live-1', 'siswaId' => 'sis-rpt-a', 'cabangId' => 'cab-1', 'status' => 'Draft'], $trainerRpt), 'Trainer should write raport for live-assigned school (DB fallback)');
policyCheck(!authorize('write', 'raport', ['id' => 'rpt-live-2', 'siswaId' => 'sis-rpt-b', 'cabangId' => 'cab-1', 'status' => 'Draft'], $trainerRpt), 'Trainer should NOT write raport for live-unassigned school (DB fallback)');
$__rptPdo->exec("DELETE FROM siswa WHERE id IN ('sis-rpt-a','sis-rpt-b')");
$__rptPdo->exec("DELETE FROM trainer WHERE id IN ('trn-rpt-1')");

// ---------------------------------------------------------------------
// Invalid / malformed role input never authorizes anything.
// ---------------------------------------------------------------------
foreach (['admin', 'head-trainer', '', null] as $badRole) {
    policyCheck(!authorize('read', 'sekolah', ['cabangId' => 'cab-1'], ['role' => $badRole, 'cabangId' => 'cab-1']), 'Invalid role should never authorize');
}

echo "M3.1 authorize.php policy matrix passed\n";