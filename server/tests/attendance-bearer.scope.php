<?php
declare(strict_types=1);

// AA.C.1 (D-AA4, D-AA9; R-AA1, R-AA2, R-AA3) — attendance write via Bearer
// with scope, WITHOUT spawning php -S (binding architecture ruling):
// mint tokens via serviceTokenMint, resolve via serviceBearerUser() with
// $_SERVER Authorization spoofing, then assert authorize() allow/deny per
// the scope matrix + requestRequiresCsrf gate behavior per transport.
// HTTP (endpoint.protection.php) + playwright rows are MANUAL runbook
// (Unverified here) — recorded in the task report, never run here.
//
// jsonResponse() exits the process, so the live HTTP 401/403/201 edges
// are pinned statically (405-first ordering + guard adoption + 403 copy)
// while every DECISION before those exits is asserted live at function
// level. Fixtures are test_-prefixed (tokens minted with test_ names,
// one direct tstbr00* revoked seed); all seeded rows (users +
// service_tokens + trainer/absensi/absensi_pengajar rows + audit_log)
// are deleted even on failure.

require_once __DIR__ . '/../bootstrap.php';

function abCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

// RED gate: the three endpoints must adopt the Bearer guard. Pre-change
// they resolve cookie-session only (requireAuthenticatedUser), so a
// Bearer-presented attendance write 401s before scope is ever reached.
$__abAbsensiSrc = (string) file_get_contents(__DIR__ . '/../api/absensi.php');
$__abPengajarSrc = (string) file_get_contents(__DIR__ . '/../api/absensiPengajar.php');
$__abReadSrc = (string) file_get_contents(__DIR__ . '/../api/read.php');
abCheck(strpos($__abAbsensiSrc, 'requireAuthUserOrBearer') !== false, 'AA.C.1 absensi.php must adopt the Bearer guard via requireAuthUserOrBearer() (Bearer write currently 401s)');
abCheck(strpos($__abPengajarSrc, 'requireAuthUserOrBearer') !== false, 'AA.C.1 absensiPengajar.php must adopt the Bearer guard via requireAuthUserOrBearer() (Bearer write currently 401s)');
abCheck(strpos($__abReadSrc, 'serviceBearerUser') !== false, 'AA.C.1 read.php must resolve Bearer-first via serviceBearerUser()');
abCheck(strpos($__abReadSrc, 'requireCsrf') === false, 'AA.C.1 read.php GET must stay CSRF-free (safe method, me.php ruling)');
// Guard order per endpoint: 405 method gate precedes the auth preamble.
foreach (['absensi' => $__abAbsensiSrc, 'absensiPengajar' => $__abPengajarSrc, 'read' => $__abReadSrc] as $__abName => $__abSrc) {
    $__abMethodPos = strpos($__abSrc, "Method tidak diizinkan'], 405");
    $__abGuardPos = max((int) strpos($__abSrc, 'requireAuthUserOrBearer'), (int) strpos($__abSrc, 'serviceBearerUser'));
    abCheck($__abMethodPos !== false && $__abGuardPos !== false && $__abMethodPos < $__abGuardPos, "AA.C.1 {$__abName}.php must keep the 405 method gate before auth (405 -> 401 -> 403 -> 422 -> 403 scope)");
}
// Scope logic untouched: every authorize() call stays byte-identical —
// only the two-line auth preamble per endpoint changes.
foreach (["requireAuthorization('verify', 'absensi'", "requireAuthorization('update', 'absensi'", "requireAuthorization('certify', 'absensi'", "requireAuthorization('write', 'absensi'"] as $__abCall) {
    abCheck(strpos($__abAbsensiSrc, $__abCall) !== false, "AA.C.1 absensi.php must keep authorize() call byte-identical: {$__abCall}");
}
foreach (["requireAuthorization('correct', 'absensiPengajar'", "requireAuthorization('write', 'absensiPengajar'"] as $__abCall) {
    abCheck(strpos($__abPengajarSrc, $__abCall) !== false, "AA.C.1 absensiPengajar.php must keep authorize() call byte-identical: {$__abCall}");
}
echo "AA.C.1 Bearer adoption + authorize() pins passed\n";

$__abServer = $_SERVER;
$__abCookie = $_COOKIE;
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

$__abSuffix = bin2hex(random_bytes(4));
$__abCabA = 'cab-test-c1-a-' . $__abSuffix;
$__abCabB = 'cab-test-c1-b-' . $__abSuffix;
$__abSchA = 'sch-test-c1-a-' . $__abSuffix;
$__abSchOut = 'sch-test-c1-out-' . $__abSuffix;
$__abTrnA = 'test_trn_c1_a_' . $__abSuffix;
$__abTrnB = 'test_trn_c1_b_' . $__abSuffix;
$__abUserTrnA = 'usr-test-c1-trna-' . $__abSuffix;
$__abUserTrnB = 'usr-test-c1-trnb-' . $__abSuffix;
$__abUserAdmA = 'usr-test-c1-adma-' . $__abSuffix;
$__abUserAdmB = 'usr-test-c1-admb-' . $__abSuffix;
$__abUserSup = 'usr-test-c1-sup-' . $__abSuffix;
$__abNameTrnA = 'test_c1_trna_' . $__abSuffix;
$__abNameTrnB = 'test_c1_trnb_' . $__abSuffix;
$__abNameAdmA = 'test_c1_adma_' . $__abSuffix;
$__abNameAdmB = 'test_c1_admb_' . $__abSuffix;
$__abNameSup = 'test_c1_sup_' . $__abSuffix;
$__abAbsId = 'test_abs_c1_' . $__abSuffix;
$__abAbpId = 'test_abp_c1_' . $__abSuffix;
$__abUserIds = [$__abUserTrnA, $__abUserTrnB, $__abUserAdmA, $__abUserAdmB, $__abUserSup];
$__abMintPrefixes = [];
$__abSeedPrefixes = ['tstbr010'];

$__abPdo = database();

function abIdentity(string $id, string $username, string $role, ?string $cabang, ?string $trainer): array {
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

function abCleanup(PDO $pdo, array $userIds, array $prefixes, array $trainerIds, array $absIds, array $abpIds): void {
    if ($prefixes !== []) {
        $placeholders = implode(',', array_fill(0, count($prefixes), '?'));
        try {
            $pdo->prepare("DELETE FROM service_tokens WHERE prefix IN ({$placeholders})")->execute($prefixes);
        } catch (Throwable $ignored) {
        }
    }
    if ($absIds !== []) {
        $placeholders = implode(',', array_fill(0, count($absIds), '?'));
        try {
            $pdo->prepare("DELETE FROM absensi WHERE id IN ({$placeholders})")->execute($absIds);
        } catch (Throwable $ignored) {
        }
    }
    if ($abpIds !== []) {
        $placeholders = implode(',', array_fill(0, count($abpIds), '?'));
        try {
            $pdo->prepare("DELETE FROM absensi_pengajar WHERE id IN ({$placeholders})")->execute($abpIds);
        } catch (Throwable $ignored) {
        }
    }
    if ($trainerIds !== []) {
        $placeholders = implode(',', array_fill(0, count($trainerIds), '?'));
        try {
            $pdo->prepare("DELETE FROM trainer WHERE id IN ({$placeholders})")->execute($trainerIds);
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
    // ---- Seed users (trainer A/B own-branch, admin A/B cross-branch, superadmin) ----
    $__abSeedUser = $__abPdo->prepare("INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password) VALUES (:id, :username, :display, :ph, :role, :cabang, :trainer, 1, 0)");
    $__abSeedUser->execute([':id' => $__abUserTrnA, ':username' => $__abNameTrnA, ':display' => 'C1 trainer A', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'trainer', ':cabang' => $__abCabA, ':trainer' => $__abTrnA]);
    $__abSeedUser->execute([':id' => $__abUserTrnB, ':username' => $__abNameTrnB, ':display' => 'C1 trainer B', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'trainer', ':cabang' => $__abCabA, ':trainer' => $__abTrnB]);
    $__abSeedUser->execute([':id' => $__abUserAdmA, ':username' => $__abNameAdmA, ':display' => 'C1 admin A', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'admin_cabang', ':cabang' => $__abCabA, ':trainer' => null]);
    $__abSeedUser->execute([':id' => $__abUserAdmB, ':username' => $__abNameAdmB, ':display' => 'C1 admin B', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'admin_cabang', ':cabang' => $__abCabB, ':trainer' => null]);
    $__abSeedUser->execute([':id' => $__abUserSup, ':username' => $__abNameSup, ':display' => 'C1 superadmin', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'superadmin', ':cabang' => null, ':trainer' => null]);

    // ---- Seed trainer person rows: A holds one active assignment (schA,
    // ---- 2026-01-01..2026-12-31); B exists but holds no assignment ----
    $__abAssignment = ['sekolahId' => $__abSchA, 'trainerId' => $__abTrnA, 'aktif' => true, 'periodeMulai' => '2026-01-01', 'periodeSelesai' => '2026-12-31'];
    $__abSeedTrainer = $__abPdo->prepare("INSERT INTO trainer (id, cabang_id, payload) VALUES (:id, :cabang, :payload)");
    $__abSeedTrainer->execute([':id' => $__abTrnA, ':cabang' => $__abCabA, ':payload' => json_encode(['id' => $__abTrnA, 'nama' => 'C1 Trainer A', 'penugasanPengajar' => [$__abAssignment]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    $__abSeedTrainer->execute([':id' => $__abTrnB, ':cabang' => $__abCabA, ':payload' => json_encode(['id' => $__abTrnB, 'nama' => 'C1 Trainer B'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);

    // ---- Seed one branch-A attendance row per ledger (cleanup target) ----
    $__abPdo->prepare("INSERT INTO absensi (id, cabang_id, payload) VALUES (:id, :cabang, :payload)")
        ->execute([':id' => $__abAbsId, ':cabang' => $__abCabA, ':payload' => json_encode(['id' => $__abAbsId, 'cabangId' => $__abCabA, 'trainerId' => $__abTrnA], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    $__abPdo->prepare("INSERT INTO absensi_pengajar (id, cabang_id, correction_of, payload) VALUES (:id, :cabang, NULL, :payload)")
        ->execute([':id' => $__abAbpId, ':cabang' => $__abCabA, ':payload' => json_encode(['id' => $__abAbpId, 'cabangId' => $__abCabA, 'trainerId' => $__abTrnA, 'sekolahId' => $__abSchA, 'tanggal' => '2026-05-10'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);

    // ---- Direct tstbr00* seed: revoked Bearer resolves to null (401 edge) ----
    $__abRevSecret = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
    $__abPdo->prepare("INSERT INTO service_tokens (id, prefix, token_hash, last4, user_id, role, cabang_id, trainer_id, name, expires_at, revoked_at, created_ip) VALUES (:id, :prefix, :hash, :last4, :uid, 'trainer', :cabang, :trainer, 'AA.C.1 revoked seed', :exp, :rev, '127.0.0.1')")
        ->execute([':id' => 'srv-test-c1-rev', ':prefix' => 'tstbr010', ':hash' => serviceTokenHash($__abRevSecret), ':last4' => '6789', ':uid' => $__abUserTrnA, ':cabang' => $__abCabA, ':trainer' => $__abTrnA, ':exp' => date('Y-m-d H:i:s', time() + 90 * 86400), ':rev' => date('Y-m-d H:i:s', time())]);
    $_COOKIE = [];
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr010_' . $__abRevSecret;
    abCheck(serviceBearerUser() === null, 'AA.C.1 revoked Bearer must resolve to null (401 at the edge)');

    // ---- Mint live tokens via serviceTokenMint (secret visible once) ----
    $__abCallerTrnA = abIdentity($__abUserTrnA, $__abNameTrnA, 'trainer', $__abCabA, $__abTrnA);
    $__abCallerAdmB = abIdentity($__abUserAdmB, $__abNameAdmB, 'admin_cabang', $__abCabB, null);
    $__abCallerSup = abIdentity($__abUserSup, $__abNameSup, 'superadmin', null, null);
    $__abMintTrnA = serviceTokenMint($__abCallerTrnA, ['action' => 'mint', 'name' => 'test_c1 trainer A bearer'], '127.0.0.1');
    $__abMintAdmB = serviceTokenMint($__abCallerAdmB, ['action' => 'mint', 'name' => 'test_c1 admin B bearer'], '127.0.0.1');
    $__abMintSup = serviceTokenMint($__abCallerSup, ['action' => 'mint', 'name' => 'test_c1 superadmin bearer'], '127.0.0.1');
    foreach (['trainerA' => $__abMintTrnA, 'adminB' => $__abMintAdmB, 'superadmin' => $__abMintSup] as $__abWho => $__abMint) {
        abCheck($__abMint['status'] === 201, "AA.C.1 mint for {$__abWho} should be 201, got {$__abMint['status']}");
        abCheck(preg_match('/^aft_([A-Za-z0-9]{8})_([A-Za-z0-9\-_]{43})$/', (string) $__abMint['body']['token']) === 1, "AA.C.1 mint token shape invalid for {$__abWho}");
        $__abMintPrefixes[] = $__abMint['body']['prefix'];
    }

    // ---- Resolve each Bearer (Authorization spoof, no cookies) ----
    $_COOKIE = [];
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $__abMintTrnA['body']['token'];
    $__abTrnAUser = serviceBearerUser();
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $__abMintAdmB['body']['token'];
    $__abAdmBUser = serviceBearerUser();
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $__abMintSup['body']['token'];
    $__abSupUser = serviceBearerUser();
    unset($_SERVER['HTTP_AUTHORIZATION']);
    abCheck(is_array($__abTrnAUser) && $__abTrnAUser['trainerId'] === $__abTrnA && $__abTrnAUser['cabangId'] === $__abCabA, 'AA.C.1 trainer-A Bearer must resolve with own scope');
    abCheck(is_array($__abAdmBUser) && $__abAdmBUser['role'] === 'admin_cabang' && $__abAdmBUser['cabangId'] === $__abCabB, 'AA.C.1 admin-B Bearer must resolve with own scope');
    abCheck(is_array($__abSupUser) && $__abSupUser['role'] === 'superadmin', 'AA.C.1 superadmin Bearer must resolve');
    abCheck(array_keys($__abTrnAUser) === ['id', 'username', 'displayName', 'role', 'cabangId', 'trainerId', 'active', 'mustChangePassword'], 'AA.C.1 Bearer identity must match the safeIdentity() shape');
    echo "AA.C.1 mint -> Bearer resolve rows passed\n";

    // ---- Scope matrix via the RESOLVED Bearer identities (R-AA1: same authorize()) ----
    $__abInScope = ['cabangId' => $__abCabA, 'trainerId' => $__abTrnA, 'sekolahId' => $__abSchA, 'tanggal' => '2026-05-10'];
    // Trainer A writing trainer B -> 403 (absensiPengajar + absensi lanes).
    abCheck(!authorize('write', 'absensiPengajar', array_merge($__abInScope, ['trainerId' => $__abTrnB]), $__abTrnAUser), 'AA.C.1 trainer A writing trainer B (absensiPengajar) must be 403');
    abCheck(!authorize('write', 'absensi', ['cabangId' => $__abCabA, 'trainerId' => $__abTrnB], $__abTrnAUser), 'AA.C.1 trainer A writing trainer B (absensi) must be 403');
    // Out-of-assignment sekolah -> 403.
    abCheck(!authorize('write', 'absensiPengajar', array_merge($__abInScope, ['sekolahId' => $__abSchOut]), $__abTrnAUser), 'AA.C.1 out-of-assignment sekolah must be 403');
    // Outside assignment date range -> 403.
    abCheck(!authorize('write', 'absensiPengajar', array_merge($__abInScope, ['tanggal' => '2027-06-01']), $__abTrnAUser), 'AA.C.1 outside assignment date range must be 403');
    // Positive control: own trainerId + assigned sekolah + in-range date -> allow.
    abCheck(authorize('write', 'absensiPengajar', $__abInScope, $__abTrnAUser), 'AA.C.1 trainer-A Bearer own in-scope write must pass (not blanket-deny)');
    abCheck(authorize('write', 'absensi', ['cabangId' => $__abCabA, 'trainerId' => $__abTrnA], $__abTrnAUser), 'AA.C.1 trainer-A Bearer own absensi write must pass');
    // Admin_cabang correcting branch-A record from branch-B identity -> 403.
    abCheck(!authorize('correct', 'absensiPengajar', ['cabangId' => $__abCabA, 'trainerId' => $__abTrnA, 'sekolahId' => $__abSchA, 'tanggal' => '2026-05-10'], $__abAdmBUser), 'AA.C.1 admin_cabang correcting branch-A record from branch-B identity must be 403');
    abCheck(!authorize('write', 'absensi', ['cabangId' => $__abCabA], $__abAdmBUser), 'AA.C.1 admin_cabang writing cross-branch absensi must be 403');
    // Same-branch admin allow (positive control, cookie-path parity).
    $__abAdmACaller = abIdentity($__abUserAdmA, $__abNameAdmA, 'admin_cabang', $__abCabA, null);
    abCheck(authorize('correct', 'absensiPengajar', ['cabangId' => $__abCabA, 'trainerId' => $__abTrnA, 'sekolahId' => $__abSchA, 'tanggal' => '2026-05-10'], $__abAdmACaller), 'AA.C.1 same-branch admin_cabang correct must pass');
    // Superadmin passes all above.
    abCheck(authorize('write', 'absensiPengajar', array_merge($__abInScope, ['trainerId' => $__abTrnB]), $__abSupUser), 'AA.C.1 superadmin must pass trainer-B write');
    abCheck(authorize('write', 'absensiPengajar', array_merge($__abInScope, ['sekolahId' => $__abSchOut]), $__abSupUser), 'AA.C.1 superadmin must pass out-of-assignment sekolah');
    abCheck(authorize('write', 'absensiPengajar', array_merge($__abInScope, ['tanggal' => '2027-06-01']), $__abSupUser), 'AA.C.1 superadmin must pass out-of-range date');
    abCheck(authorize('correct', 'absensiPengajar', ['cabangId' => $__abCabA], $__abSupUser), 'AA.C.1 superadmin must pass cross-branch correct');
    echo "AA.C.1 Bearer scope matrix rows passed\n";

    // ---- CSRF gate per transport (R-AA2): Bearer skips, cookie requires ----
    $__abSessionKey = serverConfig()['session_name'] ?? 'afterschola_session';
    $__abRememberKey = defined('REMEMBER_COOKIE') ? REMEMBER_COOKIE : 'afterschola_remember';
    $_COOKIE = [];
    abCheck(requestRequiresCsrf($__abTrnAUser) === false, 'AA.C.1 Bearer without CSRF must reach scope checks (not 403-CSRF)');
    $_COOKIE = [$__abSessionKey => 'dummy-session-id'];
    abCheck(requestRequiresCsrf(null) === true, 'AA.C.1 cookie without CSRF must still 403 (Token keamanan tidak valid at the edge)');
    abCheck(requestRequiresCsrf($__abTrnAUser) === true, 'AA.C.1 Bearer + session cookie must still require CSRF (fail-closed)');
    $_COOKIE = [$__abRememberKey => 'dummy-remember'];
    abCheck(requestRequiresCsrf($__abTrnAUser) === true, 'AA.C.1 Bearer + remember cookie must still require CSRF (fail-closed)');
    $_COOKIE = [];
    abCheck(requestRequiresCsrf(null) === true, 'AA.C.1 anonymous must read as CSRF-required (401 at the edge first)');
    $__abSessionSrc = (string) file_get_contents(__DIR__ . '/../auth/session.php');
    abCheck(strpos($__abSessionSrc, "'Token keamanan tidak valid'") !== false, 'AA.C.1 requireCsrf must keep the 403 copy `Token keamanan tidak valid`');
    echo "AA.C.1 CSRF transport rows passed\n";
} finally {
    abCleanup($__abPdo, $__abUserIds, array_merge($__abSeedPrefixes, $__abMintPrefixes), [$__abTrnA, $__abTrnB], [$__abAbsId], [$__abAbpId]);
    $_SERVER = $__abServer;
    $_COOKIE = $__abCookie;
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

echo "AA.C.1 attendance Bearer scope passed\n";
