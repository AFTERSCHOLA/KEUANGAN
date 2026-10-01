<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

$pdo = database();
$record = [
    'id' => 'abs-integration-' . bin2hex(random_bytes(4)),
    'tanggal' => '2026-08-20',
    'sekolahId' => 'skl-test',
    'trainerId' => 'trn-test',
    'siswaList' => [],
];

$stmt = $pdo->prepare('INSERT INTO absensi (id, payload) VALUES (:id, :payload)');
$stmt->execute([
    ':id' => $record['id'],
    ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
]);

try {
    $stmt->execute([
        ':id' => $record['id'],
        ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    throw new RuntimeException('Duplicate ID was accepted');
} catch (PDOException $error) {
    if (!isDuplicate($error)) throw $error;
}

$count = (int) $pdo->query("SELECT COUNT(*) FROM absensi WHERE id = " . $pdo->quote($record['id']))->fetchColumn();
if ($count !== 1) throw new RuntimeException('Expected exactly one row after duplicate POST');
echo "M7.2.2 duplicate-ID check passed\n";

// ---------------------------------------------------------------------
// AA.D.1 (D-AA4, D-AA8, D-AA9, D-AA10; R-AA1, R-AA2, R-AA3, R-AA5, R-AA8)
// — Bearer gist across entities (no role broadening), function-level
// (no php -S — binding architecture ruling, AA.C.1 pattern): the static
// guard-adoption pins below are the RED gate (pre-adoption the four
// POST endpoints resolve the cookie session only, so a Bearer-presented
// write 401s before scope is ever reached); live authorize() with
// Bearer-resolved identities is the scope matrix. jsonResponse() exits
// the process, so the live HTTP 401/403/201 edges are pinned statically
// (405-first ordering + guard adoption + 403 copy) while every DECISION
// before those exits is asserted live at function level. Fixtures are
// test_-prefixed (+ tstbr02* token prefixes); all seeded rows (users +
// service_tokens + sekolah/siswa/trainer/spp_payments + audit_log) are
// deleted even on failure.
// ---------------------------------------------------------------------

function d1Check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

// ---- RED gate: the four POST endpoints must adopt the Bearer guard.
// ---- sync Bearer-first; read already Bearer-capable (regression pin).
$__d1SekolahSrc = (string) file_get_contents(__DIR__ . '/../api/sekolah.php');
$__d1SiswaSrc = (string) file_get_contents(__DIR__ . '/../api/siswa.php');
$__d1SppSrc = (string) file_get_contents(__DIR__ . '/../api/sppPayments.php');
$__d1TrainerSrc = (string) file_get_contents(__DIR__ . '/../api/trainer.php');
$__d1ReadSrc = (string) file_get_contents(__DIR__ . '/../api/read.php');
$__d1SyncSrc = (string) file_get_contents(__DIR__ . '/../api/sync.php');
$__d1MasterSrc = (string) file_get_contents(__DIR__ . '/../api/_master.php');
$__d1Adopt = ['sekolah' => $__d1SekolahSrc, 'siswa' => $__d1SiswaSrc, 'sppPayments' => $__d1SppSrc, 'trainer' => $__d1TrainerSrc];
foreach ($__d1Adopt as $__d1Name => $__d1Src) {
    d1Check(strpos($__d1Src, 'requireAuthUserOrBearer') !== false, "AA.D.1 {$__d1Name}.php must adopt the Bearer guard via requireAuthUserOrBearer() (Bearer write currently 401s)");
    d1Check(strpos($__d1Src, 'requireAuthenticatedUser') === false, "AA.D.1 {$__d1Name}.php must no longer resolve the cookie session only");
}
// Scope logic untouched: every authorize() call stays byte-identical —
// only the auth preamble per endpoint changes (R-AA1).
foreach (["requireAuthorization('create', 'sekolah'", "requireAuthorization('delete', 'sekolah'"] as $__d1Call) {
    d1Check(strpos($__d1SekolahSrc, $__d1Call) !== false, "AA.D.1 sekolah.php must keep authorize() call byte-identical: {$__d1Call}");
}
d1Check(substr_count($__d1SekolahSrc, "requireAuthorization('update', 'sekolah'") === 2, 'AA.D.1 sekolah.php must keep both update gates (stored-branch + new-branch) byte-identical');
d1Check(strpos($__d1SppSrc, "requireAuthorization('write', 'sppPayments'") !== false, "AA.D.1 sppPayments.php must keep authorize() call byte-identical: requireAuthorization('write', 'sppPayments'");
foreach (["masterWrite('siswa'", "masterDelete('siswa'"] as $__d1Call) {
    d1Check(strpos($__d1SiswaSrc, $__d1Call) !== false, "AA.D.1 siswa.php must keep master call byte-identical: {$__d1Call}");
}
foreach (["masterWrite('trainer'", "masterDelete('trainer'"] as $__d1Call) {
    d1Check(strpos($__d1TrainerSrc, $__d1Call) !== false, "AA.D.1 trainer.php must keep master call byte-identical: {$__d1Call}");
}
// siswa/trainer CSRF lived in masterWrite()/masterDelete() (_master.php)
// — gated on the Bearer boundary there, with the cookie path
// byte-identical (cookie or both-present still requires,
// Bearer-only skips).
d1Check(strpos($__d1MasterSrc, "authorize('write'") !== false, "AA.D.1 _master.php must keep authorize() call byte-identical: authorize('write'");
d1Check(strpos($__d1MasterSrc, "authorize('delete'") !== false, "AA.D.1 _master.php must keep authorize() call byte-identical: authorize('delete'");
d1Check(strpos($__d1MasterSrc, 'requestRequiresCsrf') !== false, 'AA.D.1 _master.php must gate CSRF on the Bearer boundary (cookie path still requires it)');
d1Check(strpos($__d1MasterSrc, 'requireCsrf()') !== false, 'AA.D.1 _master.php must keep the requireCsrf() call for the cookie path');
// sync.php: Bearer-first via serviceBearerUser(), else today's session;
// NO new CSRF (as today); per-entry authorize() stays (deliberately not
// requireAuthorization — the intent comment must survive).
d1Check(strpos($__d1SyncSrc, 'serviceBearerUser()') !== false, 'AA.D.1 sync.php must resolve Bearer-first via serviceBearerUser()');
d1Check(strpos($__d1SyncSrc, 'requireAuthenticatedUser()') !== false, 'AA.D.1 sync.php must keep the session fallback (else-branch, as today)');
d1Check(strpos($__d1SyncSrc, 'requireCsrf') === false, 'AA.D.1 sync.php must stay CSRF-free (legacy retained-only path, as today)');
d1Check(strpos($__d1SyncSrc, "authorize('write'") !== false, 'AA.D.1 sync.php must keep the per-entry authorize() gate');
d1Check(strpos($__d1SyncSrc, 'deliberately NOT requireAuthorization') !== false, 'AA.D.1 sync.php must keep the per-entry (non-exiting) authorize intent');
// read.php: no change expected (Bearer-capable since AA.C.1); regression.
d1Check(strpos($__d1ReadSrc, 'serviceBearerUser') !== false, 'AA.D.1 read.php must stay Bearer-first via serviceBearerUser()');
d1Check(strpos($__d1ReadSrc, 'requireCsrf') === false, 'AA.D.1 read.php GET must stay CSRF-free (safe method, me.php ruling)');
// Guard order where the endpoint gates the method first: 405 precedes
// auth (405 -> 401 -> 403 -> 422 -> 403 scope). NOTE: siswa.php and
// trainer.php resolve auth before their method dispatch (pre-existing
// order; preamble-only change keeps it) — no order pin for those two.
foreach (['sekolah' => $__d1SekolahSrc, 'sppPayments' => $__d1SppSrc, 'sync' => $__d1SyncSrc] as $__d1Name => $__d1Src) {
    $__d1MethodPos = strpos($__d1Src, "Method tidak diizinkan'], 405");
    $__d1GuardPos = max((int) strpos($__d1Src, 'requireAuthUserOrBearer'), (int) strpos($__d1Src, 'serviceBearerUser'));
    d1Check($__d1MethodPos !== false && $__d1GuardPos !== false && $__d1MethodPos < $__d1GuardPos, "AA.D.1 {$__d1Name}.php must keep the 405 method gate before auth");
}
echo "AA.D.1 Bearer adoption + authorize() pins passed\n";

$__d1Server = $_SERVER;
$__d1Cookie = $_COOKIE;
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

$__d1Suffix = bin2hex(random_bytes(4));
$__d1CabA = 'cab-test-d1-a-' . $__d1Suffix;
$__d1CabB = 'cab-test-d1-b-' . $__d1Suffix;
$__d1SchA = 'sch-test-d1-a-' . $__d1Suffix;
$__d1SchB = 'sch-test-d1-b-' . $__d1Suffix;
$__d1SisA = 'sis-test-d1-a-' . $__d1Suffix;
$__d1TrnP = 'trn-test-d1-p-' . $__d1Suffix;
$__d1SppA = 'spp-test-d1-a-' . $__d1Suffix;
$__d1UserSup = 'usr-test-d1-sup-' . $__d1Suffix;
$__d1UserAdmA = 'usr-test-d1-adma-' . $__d1Suffix;
$__d1UserAdmB = 'usr-test-d1-admb-' . $__d1Suffix;
$__d1UserTrn = 'usr-test-d1-trn-' . $__d1Suffix;
$__d1NameSup = 'test_d1_sup_' . $__d1Suffix;
$__d1NameAdmA = 'test_d1_adma_' . $__d1Suffix;
$__d1NameAdmB = 'test_d1_admb_' . $__d1Suffix;
$__d1NameTrn = 'test_d1_trn_' . $__d1Suffix;
$__d1UserIds = [$__d1UserSup, $__d1UserAdmA, $__d1UserAdmB, $__d1UserTrn];
$__d1MintPrefixes = [];
$__d1SeedPrefixes = ['tstbr020'];

$__d1Pdo = database();

function d1Identity(string $id, string $username, string $role, ?string $cabang, ?string $trainer): array {
    return [
        'id' => $id,
        'username' => $username,
        'displayName' => $username,
        'role' => $role,
        'cabangId' => $cabang,
        'trainerId' => $trainer,
        'active' => true,
        'mustChangePassword' => false,
    ];
}

function d1Cleanup(PDO $pdo, array $userIds, array $prefixes, array $sekIds, array $sisIds, array $trnIds, array $sppIds): void {
    if ($prefixes !== []) {
        $placeholders = implode(',', array_fill(0, count($prefixes), '?'));
        try {
            $pdo->prepare("DELETE FROM service_tokens WHERE prefix IN ({$placeholders})")->execute($prefixes);
        } catch (Throwable $ignored) {
        }
    }
    foreach (['sekolah' => $sekIds, 'siswa' => $sisIds, 'trainer' => $trnIds, 'spp_payments' => $sppIds] as $table => $ids) {
        if ($ids === []) continue;
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        try {
            $pdo->prepare("DELETE FROM {$table} WHERE id IN ({$placeholders})")->execute($ids);
        } catch (Throwable $ignored) {
        }
    }
    if ($userIds !== []) {
        $placeholders = implode(',', array_fill(0, count($userIds), '?'));
        try {
            $pdo->prepare("DELETE FROM audit_log WHERE actor_user_id IN ({$placeholders}) AND event_type IN ('service_token_minted','service_token_revoked','service_token_denied')")->execute($userIds);
        } catch (Throwable $ignored) {
        }
        try {
            $pdo->prepare("DELETE FROM users WHERE id IN ({$placeholders})")->execute($userIds);
        } catch (Throwable $ignored) {
        }
    }
}

try {
    // ---- Seed users (superadmin, admin cabang-A, admin cabang-B, trainer bound to trnP in cabang-A) ----
    $__d1SeedUser = $__d1Pdo->prepare("INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password) VALUES (:id, :username, :display, :ph, :role, :cabang, :trainer, 1, 0)");
    $__d1SeedUser->execute([':id' => $__d1UserSup, ':username' => $__d1NameSup, ':display' => 'D1 superadmin', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'superadmin', ':cabang' => null, ':trainer' => null]);
    $__d1SeedUser->execute([':id' => $__d1UserAdmA, ':username' => $__d1NameAdmA, ':display' => 'D1 admin A', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'admin_cabang', ':cabang' => $__d1CabA, ':trainer' => null]);
    $__d1SeedUser->execute([':id' => $__d1UserAdmB, ':username' => $__d1NameAdmB, ':display' => 'D1 admin B', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'admin_cabang', ':cabang' => $__d1CabB, ':trainer' => null]);
    $__d1SeedUser->execute([':id' => $__d1UserTrn, ':username' => $__d1NameTrn, ':display' => 'D1 trainer', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'trainer', ':cabang' => $__d1CabA, ':trainer' => $__d1TrnP]);

    // ---- Seed one entity row per branch-side (cleanup targets; the
    // ---- matrix below asserts the SAME authorize() the endpoints call).
    $__d1Pdo->prepare("INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang, :payload)")
        ->execute([':id' => $__d1SchA, ':cabang' => $__d1CabA, ':payload' => json_encode(['id' => $__d1SchA, 'cabangId' => $__d1CabA, 'nama' => 'D1 Sekolah A'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    $__d1Pdo->prepare("INSERT INTO sekolah (id, cabang_id, payload) VALUES (:id, :cabang, :payload)")
        ->execute([':id' => $__d1SchB, ':cabang' => $__d1CabB, ':payload' => json_encode(['id' => $__d1SchB, 'cabangId' => $__d1CabB, 'nama' => 'D1 Sekolah B'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    $__d1Pdo->prepare("INSERT INTO siswa (id, cabang_id, payload) VALUES (:id, :cabang, :payload)")
        ->execute([':id' => $__d1SisA, ':cabang' => $__d1CabA, ':payload' => json_encode(['id' => $__d1SisA, 'cabangId' => $__d1CabA, 'sekolahId' => $__d1SchA, 'nama' => 'D1 Siswa A'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    $__d1Pdo->prepare("INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :cabang, :payload)")
        ->execute([':id' => $__d1TrnP, ':cabang' => $__d1CabA, ':payload' => json_encode(['id' => $__d1TrnP, 'cabangId' => $__d1CabA, 'nama' => 'D1 Trainer P'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    $__d1Pdo->prepare("INSERT INTO spp_payments (id, cabang_id, payload) VALUES (:id, :cabang, :payload)")
        ->execute([':id' => $__d1SppA, ':cabang' => $__d1CabA, ':payload' => json_encode(['id' => $__d1SppA, 'cabangId' => $__d1CabA, 'siswaId' => $__d1SisA], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);

    // ---- Direct tstbr02* seed: revoked Bearer resolves to null (401 edge) ----
    $__d1RevSecret = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
    $__d1Pdo->prepare("INSERT INTO service_tokens (id, prefix, token_hash, last4, user_id, role, cabang_id, trainer_id, name, expires_at, revoked_at, created_ip) VALUES (:id, :prefix, :hash, :last4, :uid, 'admin_cabang', :cabang, NULL, 'AA.D.1 revoked seed', :exp, :rev, '127.0.0.1')")
        ->execute([':id' => 'srv-test-d1-rev', ':prefix' => 'tstbr020', ':hash' => serviceTokenHash($__d1RevSecret), ':last4' => '6789', ':uid' => $__d1UserAdmA, ':cabang' => $__d1CabA, ':exp' => date('Y-m-d H:i:s', time() + 90 * 86400), ':rev' => date('Y-m-d H:i:s', time())]);
    $_COOKIE = [];
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr020_' . $__d1RevSecret;
    d1Check(serviceBearerUser() === null, 'AA.D.1 revoked Bearer must resolve to null (401 at the edge)');

    // ---- Mint live tokens via serviceTokenMint (secret visible once) ----
    $__d1MintSup = serviceTokenMint(d1Identity($__d1UserSup, $__d1NameSup, 'superadmin', null, null), ['action' => 'mint', 'name' => 'test_d1 superadmin bearer'], '127.0.0.1');
    $__d1MintAdmA = serviceTokenMint(d1Identity($__d1UserAdmA, $__d1NameAdmA, 'admin_cabang', $__d1CabA, null), ['action' => 'mint', 'name' => 'test_d1 admin A bearer'], '127.0.0.1');
    $__d1MintAdmB = serviceTokenMint(d1Identity($__d1UserAdmB, $__d1NameAdmB, 'admin_cabang', $__d1CabB, null), ['action' => 'mint', 'name' => 'test_d1 admin B bearer'], '127.0.0.1');
    $__d1MintTrn = serviceTokenMint(d1Identity($__d1UserTrn, $__d1NameTrn, 'trainer', $__d1CabA, $__d1TrnP), ['action' => 'mint', 'name' => 'test_d1 trainer bearer'], '127.0.0.1');
    foreach (['superadmin' => $__d1MintSup, 'adminA' => $__d1MintAdmA, 'adminB' => $__d1MintAdmB, 'trainer' => $__d1MintTrn] as $__d1Who => $__d1Mint) {
        d1Check($__d1Mint['status'] === 201, "AA.D.1 mint for {$__d1Who} should be 201, got {$__d1Mint['status']}");
        d1Check(preg_match('/^aft_([A-Za-z0-9]{8})_([A-Za-z0-9\-_]{43})$/', (string) $__d1Mint['body']['token']) === 1, "AA.D.1 mint token shape invalid for {$__d1Who}");
        $__d1MintPrefixes[] = $__d1Mint['body']['prefix'];
    }

    // ---- Resolve each Bearer (Authorization spoof, no cookies) ----
    $_COOKIE = [];
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $__d1MintSup['body']['token'];
    $__d1SupUser = serviceBearerUser();
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $__d1MintAdmA['body']['token'];
    $__d1AdmAUser = serviceBearerUser();
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $__d1MintAdmB['body']['token'];
    $__d1AdmBUser = serviceBearerUser();
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $__d1MintTrn['body']['token'];
    $__d1TrnUser = serviceBearerUser();
    unset($_SERVER['HTTP_AUTHORIZATION']);
    d1Check(is_array($__d1SupUser) && $__d1SupUser['role'] === 'superadmin', 'AA.D.1 superadmin Bearer must resolve');
    d1Check(is_array($__d1AdmAUser) && $__d1AdmAUser['role'] === 'admin_cabang' && $__d1AdmAUser['cabangId'] === $__d1CabA, 'AA.D.1 admin-A Bearer must resolve with own scope');
    d1Check(is_array($__d1AdmBUser) && $__d1AdmBUser['role'] === 'admin_cabang' && $__d1AdmBUser['cabangId'] === $__d1CabB, 'AA.D.1 admin-B Bearer must resolve with own scope');
    d1Check(is_array($__d1TrnUser) && $__d1TrnUser['role'] === 'trainer' && $__d1TrnUser['trainerId'] === $__d1TrnP, 'AA.D.1 trainer Bearer must resolve with own scope');
    d1Check(array_keys($__d1AdmAUser) === ['id', 'username', 'displayName', 'role', 'cabangId', 'trainerId', 'active', 'mustChangePassword'], 'AA.D.1 Bearer identity must match the safeIdentity() shape');
    echo "AA.D.1 mint -> Bearer resolve rows passed\n";

    // ---- Scope matrix via the RESOLVED Bearer identities (R-AA1: the
    // ---- SAME authorize() the endpoints call — identical branch scope
    // ---- as the cookie path). admin_cabang own-branch allow,
    // ---- cross-branch 403, per (action, resource) the endpoints use.
    $__d1Own = ['cabangId' => $__d1CabA];
    $__d1Cross = ['cabangId' => $__d1CabB];
    foreach (['create', 'update', 'delete'] as $__d1Action) {
        d1Check(authorize($__d1Action, 'sekolah', $__d1Own, $__d1AdmAUser), "AA.D.1 admin-A Bearer {$__d1Action} own-branch sekolah must pass");
        d1Check(!authorize($__d1Action, 'sekolah', $__d1Cross, $__d1AdmAUser), "AA.D.1 admin-A Bearer {$__d1Action} cross-branch sekolah must be 403");
    }
    foreach (['write', 'delete'] as $__d1Action) {
        d1Check(authorize($__d1Action, 'siswa', $__d1Own, $__d1AdmAUser), "AA.D.1 admin-A Bearer {$__d1Action} own-branch siswa must pass");
        d1Check(!authorize($__d1Action, 'siswa', $__d1Cross, $__d1AdmAUser), "AA.D.1 admin-A Bearer {$__d1Action} cross-branch siswa must be 403");
        d1Check(authorize($__d1Action, 'trainer', $__d1Own, $__d1AdmAUser), "AA.D.1 admin-A Bearer {$__d1Action} own-branch trainer must pass");
        d1Check(!authorize($__d1Action, 'trainer', $__d1Cross, $__d1AdmAUser), "AA.D.1 admin-A Bearer {$__d1Action} cross-branch trainer must be 403");
    }
    d1Check(authorize('write', 'sppPayments', $__d1Own, $__d1AdmAUser), 'AA.D.1 admin-A Bearer write own-branch sppPayments must pass (sync per-entry lane)');
    d1Check(!authorize('write', 'sppPayments', $__d1Cross, $__d1AdmAUser), 'AA.D.1 admin-A Bearer write cross-branch sppPayments must be 403 (sync per-entry lane)');
    // Same-branch admin-B positive control on the B side (cookie parity).
    d1Check(authorize('create', 'sekolah', $__d1Cross, $__d1AdmBUser), 'AA.D.1 admin-B Bearer create own-branch sekolah must pass');
    d1Check(authorize('write', 'sppPayments', $__d1Cross, $__d1AdmBUser), 'AA.D.1 admin-B Bearer write own-branch sppPayments must pass');
    // Superadmin passes every lane above.
    foreach ([['create', 'sekolah', $__d1Cross], ['update', 'sekolah', $__d1Cross], ['delete', 'sekolah', $__d1Cross], ['write', 'siswa', $__d1Cross], ['delete', 'siswa', $__d1Cross], ['write', 'sppPayments', $__d1Cross], ['write', 'trainer', $__d1Cross], ['delete', 'trainer', $__d1Cross]] as $__d1Lane) {
        d1Check(authorize($__d1Lane[0], $__d1Lane[1], $__d1Lane[2], $__d1SupUser), "AA.D.1 superadmin Bearer {$__d1Lane[0]} {$__d1Lane[1]} must pass");
    }
    // Trainer has no write lane on any of the four entities (no role
    // broadening, taste #33) — Bearer or cookie alike.
    foreach (['sekolah', 'siswa', 'sppPayments', 'trainer'] as $__d1Resource) {
        foreach (['create', 'update', 'delete', 'write'] as $__d1Action) {
            d1Check(!authorize($__d1Action, $__d1Resource, ['id' => 'x', 'cabangId' => $__d1CabA], $__d1TrnUser), "AA.D.1 trainer Bearer {$__d1Action} {$__d1Resource} must be 403");
        }
    }
    echo "AA.D.1 Bearer scope matrix rows passed\n";

    // ---- Boundaries unchanged (pin, don't build): admin_cabang still
    // ---- cannot create branch/setting/invoice; trainer POST users 403.
    d1Check(!authorize('create', 'cabang', ['id' => $__d1CabA], $__d1AdmAUser), 'AA.D.1 admin-A Bearer must NOT create cabang (boundary unchanged)');
    d1Check(!authorize('read', 'settings', [], $__d1AdmAUser), 'AA.D.1 admin-A Bearer must NOT read settings (boundary unchanged)');
    d1Check(!authorize('create', 'settings', ['cabangId' => $__d1CabA], $__d1AdmAUser), 'AA.D.1 admin-A Bearer must NOT create setting (boundary unchanged)');
    d1Check(!authorize('update', 'settings', ['cabangId' => $__d1CabA], $__d1AdmAUser), 'AA.D.1 admin-A Bearer must NOT update setting (boundary unchanged)');
    foreach (['create', 'update', 'delete', 'write'] as $__d1Action) {
        d1Check(!authorize($__d1Action, 'invoices', $__d1Own, $__d1AdmAUser), "AA.D.1 admin-A Bearer must NOT {$__d1Action} invoice even own branch (boundary unchanged)");
    }
    foreach (['create', 'update', 'delete'] as $__d1Action) {
        d1Check(!authorize($__d1Action, 'users', ['id' => 'x'], $__d1TrnUser), "AA.D.1 trainer Bearer {$__d1Action} users must be 403 (boundary unchanged)");
    }
    d1Check(!authorize('manage_users', 'users', [], $__d1TrnUser), 'AA.D.1 trainer Bearer manage_users must be 403 (boundary unchanged)');
    // honorPayments/invoices/restore stay as today — NOT adopted here;
    // skipped with reason: authorize.policy.php already pins those lanes
    // (AP.D.1 honor branch lane, invoices read-only, restore deny-list)
    // and no endpoint in this task touches them.
    echo "AA.D.1 boundary rows passed\n";

    // ---- CSRF gate per transport (R-AA2): Bearer skips, cookie requires.
    $__d1SessionKey = serverConfig()['session_name'] ?? 'afterschola_session';
    $__d1RememberKey = defined('REMEMBER_COOKIE') ? REMEMBER_COOKIE : 'afterschola_remember';
    $_COOKIE = [];
    d1Check(requestRequiresCsrf($__d1AdmAUser) === false, 'AA.D.1 Bearer without CSRF must reach scope checks (not 403-CSRF)');
    $_COOKIE = [$__d1SessionKey => 'dummy-session-id'];
    d1Check(requestRequiresCsrf(null) === true, 'AA.D.1 cookie without CSRF must still 403 (Token keamanan tidak valid at the edge)');
    d1Check(requestRequiresCsrf($__d1AdmAUser) === true, 'AA.D.1 Bearer + session cookie must still require CSRF (fail-closed)');
    $_COOKIE = [$__d1RememberKey => 'dummy-remember'];
    d1Check(requestRequiresCsrf($__d1AdmAUser) === true, 'AA.D.1 Bearer + remember cookie must still require CSRF (fail-closed)');
    $_COOKIE = [];
    d1Check(requestRequiresCsrf(null) === true, 'AA.D.1 anonymous must read as CSRF-required (401 at the edge first)');
    $__d1SessionSrc = (string) file_get_contents(__DIR__ . '/../auth/session.php');
    d1Check(strpos($__d1SessionSrc, "'Token keamanan tidak valid'") !== false, 'AA.D.1 requireCsrf must keep the 403 copy `Token keamanan tidak valid`');
    echo "AA.D.1 CSRF transport rows passed\n";
} finally {
    d1Cleanup($__d1Pdo, $__d1UserIds, array_merge($__d1SeedPrefixes, $__d1MintPrefixes), [$__d1SchA, $__d1SchB], [$__d1SisA], [$__d1TrnP], [$__d1SppA]);
    $_SERVER = $__d1Server;
    $_COOKIE = $__d1Cookie;
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

echo "AA.D.1 Bearer gist across entities passed\n";
