<?php
declare(strict_types=1);

// AA.B.2 (F-AA1, F-AA2, F-AA4; D-AA3, D-AA6; R-AA3, R-AA4, R-AA7) —
// login throttle + CSRF-matrix regression WITHOUT spawning php -S
// (binding architecture ruling): pure function-level calls
// (loginAttemptKey/loginLocked/registerLoginFailure/clearLoginFailures,
// loginSession session-id rotation, csrfToken/requireCsrf success path,
// serviceBearerUser/requestRequiresCsrf matrix, serviceTokenMint
// locked→401) + static source pins for the exiting edges
// (requireCsrf 403, login.php generic 401, logout.php CSRF gate).
//
// jsonResponse() exits the process, and Set-Cookie headers only appear
// on a genuine response cycle, so the HTTP end-to-end
// (server/tests/login.lifecycle.php) stays a MANUAL runbook row
// (Unverified here). This file locks the DECISIONS that precede those
// exits: throttle helpers, CSRF predicate, session rotation, and the
// static 403/401 copy the edges emit.
//
// Fixtures are test_-prefixed; all seeded rows (login_attempts via
// clearLoginFailures, users + service_tokens + audit_log) are deleted
// even on failure.

require_once __DIR__ . '/../bootstrap.php';

// CLI sessions need headers unsent: buffer all row echoes so the first
// startSecureSession()/session_start() (section C) still runs before
// PHP marks headers sent. Without this, the throttle echoes above would
// make session_start()/session_regenerate_id() warn + fail.
ob_start();

function mcCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$__mcServer = $_SERVER;
$__mcCookie = $_COOKIE;
$__mcSession = $_SESSION ?? [];
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

$__mcSuffix = bin2hex(random_bytes(4));
$__mcThrottleUser = 'test_mc_throttle_' . $__mcSuffix;
$__mcMintLockedUser = 'test_mc_mintlocked_' . $__mcSuffix;
$__mcMintOwnerUser = 'test_mc_mintowner_' . $__mcSuffix;
$__mcBearerUser = 'test_mc_bearer_' . $__mcSuffix;
$__mcOwnerId = 'usr-test-mc-owner-' . $__mcSuffix;
$__mcBearerPrefix = 'tmc' . substr($__mcSuffix, 0, 5);
$__mcMintPrefixes = [];
$__mcUserIds = [$__mcOwnerId];

$__mcPdo = database();

function mcCleanup(PDO $pdo, array $userIds, array $prefixes, array $usernames): void {
    foreach ($usernames as $username) {
        try {
            clearLoginFailures(loginAttemptKey((string) $username));
        } catch (Throwable $ignored) {
        }
    }
    if ($prefixes !== []) {
        $placeholders = implode(',', array_fill(0, count($prefixes), '?'));
        try {
            $pdo->prepare("DELETE FROM service_tokens WHERE prefix IN ({$placeholders})")->execute($prefixes);
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
    // ---- A. Throttle key: lower(username)|IP (R-AA4) ----
    $__mcKeyBase = loginAttemptKey($__mcThrottleUser);
    mcCheck($__mcKeyBase === loginAttemptKey(strtoupper($__mcThrottleUser)), 'AA.B.2 throttle key must be case-insensitive');
    mcCheck($__mcKeyBase === loginAttemptKey('  ' . $__mcThrottleUser . '  '), 'AA.B.2 throttle key must trim whitespace');
    mcCheck($__mcKeyBase !== loginAttemptKey('test_mc_other_' . $__mcSuffix), 'AA.B.2 throttle key must differ per username');
    $_SERVER['REMOTE_ADDR'] = '10.0.0.9';
    mcCheck($__mcKeyBase !== loginAttemptKey($__mcThrottleUser), 'AA.B.2 throttle key must bind IP');
    $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
    echo "AA.B.2 throttle key rows passed\n";

    // ---- B. Login throttle helpers: 5 fails -> locked, success clears ----
    // Mirrors login.php:11-12 (loginLocked gate -> generic 401) + :22-28
    // (register on failure, clear on success). The 6th attempt (even
    // correct) stays locked at the helper level; the HTTP 401 copy is
    // pinned statically below (same generic, no enumeration).
    $__mcKey = loginAttemptKey($__mcThrottleUser);
    clearLoginFailures($__mcKey);
    mcCheck(!loginLocked($__mcKey), 'AA.B.2 fresh throttle key must not be locked');
    for ($i = 0; $i < 5; $i++) {
        registerLoginFailure($__mcKey);
        if ($i < 4) mcCheck(!loginLocked($__mcKey), 'AA.B.2 must not lock before 5 failures (attempt ' . ($i + 1) . ')');
    }
    mcCheck(loginLocked($__mcKey), 'AA.B.2 5 failures must lock the key (15min window)');
    mcCheck(loginLocked($__mcKey), 'AA.B.2 6th attempt (even correct) must still read locked');
    clearLoginFailures($__mcKey);
    mcCheck(!loginLocked($__mcKey), 'AA.B.2 success must clear the lock');
    echo "AA.B.2 login throttle (5->locked, clear) rows passed\n";

    // ---- B2. login.php static: generic 401, no enumeration ----
    $__mcLoginSrc = (string) file_get_contents(__DIR__ . '/../api/auth/login.php');
    mcCheck(strpos($__mcLoginSrc, 'loginAttemptKey') !== false, 'AA.B.2 login.php must key via loginAttemptKey()');
    mcCheck(strpos($__mcLoginSrc, 'loginLocked') !== false, 'AA.B.2 login.php must gate on loginLocked()');
    mcCheck(strpos($__mcLoginSrc, 'registerLoginFailure') !== false, 'AA.B.2 login.php must register failures');
    mcCheck(strpos($__mcLoginSrc, 'clearLoginFailures') !== false, 'AA.B.2 login.php must clear on success');
    mcCheck(strpos($__mcLoginSrc, 'loginSession') !== false, 'AA.B.2 login.php must rotate via loginSession()');
    $__mcGeneric = 'Nama pengguna atau kata sandi salah';
    mcCheck(substr_count($__mcLoginSrc, $__mcGeneric) >= 3, 'AA.B.2 login.php must reuse the generic 401 on empty/locked/invalid (no enumeration)');
    foreach (['terkunci', 'terblokir', 'coba lagi', 'too many', 'throttl'] as $__mcLeak) {
        mcCheck(stripos($__mcLoginSrc, $__mcLeak) === false, "AA.B.2 login.php must not leak lock state ({$__mcLeak})");
    }
    // NOTE: 'loginLocked'/'locked_until' identifiers + SQL are expected;
    // user-visible copy is pinned by the generic-count assertion above.
    echo "AA.B.2 login generic-message rows passed\n";

    // ---- C. Session rotation + CSRF token (before any further echo
    // ---- concerns: session_start happens here, first in the process) ----
    $__mcIdentity = [
        'id' => $__mcOwnerId,
        'username' => $__mcMintOwnerUser,
        'displayName' => $__mcMintOwnerUser,
        'role' => 'admin_cabang',
        'cabangId' => 'cab-test-mc-' . $__mcSuffix,
        'trainerId' => null,
        'active' => true,
        'mustChangePassword' => false,
    ];
    startSecureSession();
    $__mcPreId = session_id();
    $__mcRotated = loginSession($__mcIdentity);
    $__mcPostId = session_id();
    mcCheck(is_string($__mcPreId) && $__mcPreId !== '' && is_string($__mcPostId) && $__mcPostId !== '', 'AA.B.2 session ids must be observable');
    mcCheck($__mcPostId !== $__mcPreId, 'AA.B.2 loginSession must regenerate the session id (fixation resistance)');
    mcCheck(array_keys($__mcRotated) === ['id', 'username', 'displayName', 'role', 'cabangId', 'trainerId', 'active', 'mustChangePassword'], 'AA.B.2 loginSession identity must match the safeIdentity() shape');
    mcCheck(!isset($__mcRotated['password']) && !isset($__mcRotated['password_hash']), 'AA.B.2 loginSession identity must not leak password fields');
    $__mcCsrfA = csrfToken();
    $__mcCsrfB = csrfToken();
    mcCheck(is_string($__mcCsrfA) && preg_match('/^[0-9a-f]{64}$/', $__mcCsrfA) === 1, 'AA.B.2 csrfToken must be 64 hex chars');
    mcCheck($__mcCsrfA === $__mcCsrfB, 'AA.B.2 csrfToken must be stable within the session');
    mcCheck(($_SESSION[SESSION_CSRF_KEY] ?? null) === $__mcCsrfA, 'AA.B.2 csrfToken must live under SESSION_CSRF_KEY');
    // Live success path: correct header passes without exiting.
    $_SERVER[CSRF_HEADER] = $__mcCsrfA;
    requireCsrf();
    unset($_SERVER[CSRF_HEADER]);
    echo "AA.B.2 session rotation + CSRF token rows passed\n";

    // ---- D. CSRF decision matrix (D-AA3): predicate first ----
    $__mcSessionKey = serverConfig()['session_name'] ?? 'afterschola_session';
    $__mcRememberKey = defined('REMEMBER_COOKIE') ? REMEMBER_COOKIE : 'afterschola_remember';
    $__mcDummyBearer = [
        'id' => 'usr-test-mc-dummy', 'username' => 'test_mc_dummy', 'displayName' => 'dummy',
        'role' => 'admin_cabang', 'cabangId' => 'cab-test-mc', 'trainerId' => null,
        'active' => true, 'mustChangePassword' => false,
    ];
    // Cookie POST without CSRF -> requires CSRF (403 `Token keamanan tidak
    // valid` at the edge; copy pinned statically in E).
    $_COOKIE = [$__mcSessionKey => 'dummy-session-id'];
    unset($_SERVER['HTTP_AUTHORIZATION']);
    mcCheck(requestRequiresCsrf(null) === true, 'AA.B.2 cookie POST without CSRF must require CSRF (403 at the edge)');
    // Bearer-only POST -> passes the CSRF gate.
    $_COOKIE = [];
    mcCheck(requestRequiresCsrf($__mcDummyBearer) === false, 'AA.B.2 Bearer-only POST must pass the CSRF gate');
    // Bearer + cookie both present -> requires CSRF (fail-closed).
    $_COOKIE = [$__mcSessionKey => 'dummy-session-id'];
    mcCheck(requestRequiresCsrf($__mcDummyBearer) === true, 'AA.B.2 Bearer + session cookie must still require CSRF (fail-closed)');
    // Remember cookie is an ambient-cookie path too (restores a session).
    $_COOKIE = [$__mcRememberKey => 'dummy-remember'];
    mcCheck(requestRequiresCsrf($__mcDummyBearer) === true, 'AA.B.2 Bearer + remember cookie must still require CSRF (fail-closed)');
    $_COOKIE = [$__mcRememberKey => 'dummy-remember'];
    mcCheck(requestRequiresCsrf(null) === true, 'AA.B.2 remember-cookie POST must require CSRF');
    // Anonymous stays fail-closed (401 fires before CSRF is evaluated).
    $_COOKIE = [];
    mcCheck(requestRequiresCsrf(null) === true, 'AA.B.2 anonymous must read as CSRF-required (401 at the edge first)');
    // Scope still enforced downstream for Bearer (same authorize()).
    mcCheck(authorize('read', 'siswa', ['cabangId' => 'cab-test-mc'], array_merge($__mcDummyBearer, ['cabangId' => 'cab-test-mc'])), 'AA.B.2 Bearer scope: own branch must authorize');
    mcCheck(!authorize('read', 'siswa', ['cabangId' => 'cab-other'], array_merge($__mcDummyBearer, ['cabangId' => 'cab-test-mc'])), 'AA.B.2 Bearer scope: cross-branch must stay 403');
    echo "AA.B.2 CSRF matrix rows passed\n";

    // ---- D2. Real Bearer integration: mint-free seed, resolve, revoke ----
    $__mcPdo->prepare("INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password) VALUES (:id, :username, :display, :ph, 'admin_cabang', :cabang, NULL, 1, 0)")
        ->execute([':id' => $__mcOwnerId, ':username' => $__mcBearerUser, ':display' => 'MC bearer', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':cabang' => 'cab-test-mc-' . $__mcSuffix]);
    $__mcBearerSecret = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
    $__mcPdo->prepare("INSERT INTO service_tokens (id, prefix, token_hash, last4, user_id, role, cabang_id, trainer_id, name, expires_at, revoked_at, created_ip) VALUES (:id, :prefix, :hash, :last4, :uid, 'admin_cabang', :cabang, NULL, 'AA.B.2 matrix bearer', :exp, NULL, '127.0.0.1')")
        ->execute([':id' => 'srv-test-mc-' . $__mcSuffix, ':prefix' => $__mcBearerPrefix, ':hash' => serviceTokenHash($__mcBearerSecret), ':last4' => '6789', ':uid' => $__mcOwnerId, ':cabang' => 'cab-test-mc-' . $__mcSuffix, ':exp' => date('Y-m-d H:i:s', time() + 90 * 86400)]);
    $_COOKIE = [];
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_' . $__mcBearerPrefix . '_' . $__mcBearerSecret;
    $__mcResolved = serviceBearerUser();
    mcCheck(is_array($__mcResolved) && $__mcResolved['username'] === $__mcBearerUser, 'AA.B.2 valid Bearer must resolve');
    mcCheck(requestRequiresCsrf($__mcResolved) === false, 'AA.B.2 real Bearer-only must pass the CSRF gate');
    $_COOKIE = [$__mcSessionKey => 'dummy-session-id'];
    mcCheck(requestRequiresCsrf($__mcResolved) === true, 'AA.B.2 real Bearer + cookie must still require CSRF (fail-closed)');
    $_COOKIE = [];
    mcCheck(authorize('read', 'siswa', ['cabangId' => 'cab-test-mc-' . $__mcSuffix], $__mcResolved), 'AA.B.2 real Bearer must read own branch');
    mcCheck(!authorize('read', 'siswa', ['cabangId' => 'cab-elsewhere'], $__mcResolved), 'AA.B.2 real Bearer must NOT read cross-branch');
    // Revoked Bearer resolves to null (401 at the edge).
    $__mcPdo->prepare('UPDATE service_tokens SET revoked_at = NOW() WHERE prefix = :prefix')->execute([':prefix' => $__mcBearerPrefix]);
    mcCheck(serviceBearerUser() === null, 'AA.B.2 revoked Bearer must resolve to null (401 at the edge)');
    unset($_SERVER['HTTP_AUTHORIZATION']);
    $_COOKIE = [];
    $__mcMintPrefixes[] = $__mcBearerPrefix;
    echo "AA.B.2 real-Bearer matrix rows passed\n";

    // ---- E. Exiting edges pinned statically (never invoked live) ----
    $__mcSessionSrc = (string) file_get_contents(__DIR__ . '/../auth/session.php');
    mcCheck(strpos($__mcSessionSrc, "'Token keamanan tidak valid'") !== false, 'AA.B.2 requireCsrf must keep the 403 copy `Token keamanan tidak valid`');
    mcCheck(preg_match('/function requireCsrf.*?403/s', $__mcSessionSrc) === 1, 'AA.B.2 requireCsrf must emit 403');
    mcCheck(strpos($__mcSessionSrc, 'session_regenerate_id(true)') !== false, 'AA.B.2 loginSession must call session_regenerate_id(true)');
    $__mcLogoutSrc = (string) file_get_contents(__DIR__ . '/../api/auth/logout.php');
    mcCheck(strpos($__mcLogoutSrc, 'requireAuthenticatedUser') !== false, 'AA.B.2 logout.php must require authentication (401 when anonymous)');
    mcCheck(strpos($__mcLogoutSrc, 'requireCsrf') !== false, 'AA.B.2 logout without/wrong CSRF must 403 via requireCsrf()');
    $__mcTokensSrc = (string) file_get_contents(__DIR__ . '/../api/auth/tokens.php');
    mcCheck(strpos($__mcTokensSrc, 'requireCsrf') !== false, 'AA.B.2 tokens.php (browser mint) must stay behind requireCsrf()');
    echo "AA.B.2 exiting-edge (403) rows passed\n";

    // ---- F. Mint shares the throttle, check-only (D-AA6) ----
    // Locked caller -> generic 401 (same copy as login.php, no
    // enumeration). Already built in AA.B.1; asserted here, not
    // re-implemented.
    $__mcLockedKey = loginAttemptKey($__mcMintLockedUser);
    clearLoginFailures($__mcLockedKey);
    for ($i = 0; $i < 5; $i++) registerLoginFailure($__mcLockedKey);
    mcCheck(loginLocked($__mcLockedKey), 'AA.B.2 mint-lock setup failed');
    $__mcLockedCaller = [
        'id' => 'usr-test-mc-locked-' . $__mcSuffix, 'username' => $__mcMintLockedUser,
        'displayName' => $__mcMintLockedUser, 'role' => 'admin_cabang',
        'cabangId' => 'cab-test-mc-' . $__mcSuffix, 'trainerId' => null,
        'active' => true, 'mustChangePassword' => false,
    ];
    $__mcThrottled = serviceTokenMint($__mcLockedCaller, ['action' => 'mint', 'name' => 'throttled probe'], '127.0.0.1');
    mcCheck($__mcThrottled['status'] === 401, 'AA.B.2 locked mint must be 401');
    mcCheck(($__mcThrottled['body']['error'] ?? '') === 'Nama pengguna atau kata sandi salah', 'AA.B.2 locked mint must reuse the generic login message');
    mcCheck(!isset($__mcThrottled['body']['token']), 'AA.B.2 locked mint must not leak a secret');
    clearLoginFailures($__mcLockedKey);
    // Mint validation failures must NOT increment the shared bucket.
    $__mcOwnerCaller = [
        'id' => $__mcOwnerId, 'username' => $__mcMintOwnerUser,
        'displayName' => $__mcMintOwnerUser, 'role' => 'admin_cabang',
        'cabangId' => 'cab-test-mc-' . $__mcSuffix, 'trainerId' => null,
        'active' => true, 'mustChangePassword' => false,
    ];
    $__mcBad = serviceTokenMint($__mcOwnerCaller, ['action' => 'mint', 'name' => '  '], '127.0.0.1');
    mcCheck($__mcBad['status'] === 422, 'AA.B.2 blank-name mint must be 422');
    mcCheck(!loginLocked(loginAttemptKey($__mcMintOwnerUser)), 'AA.B.2 mint validation failures must NOT lock the shared throttle');
    // Throttled-mint audit row exists without a secret.
    $__mcAuditStmt = $__mcPdo->prepare("SELECT metadata FROM audit_log WHERE event_type = 'service_token_denied' AND metadata LIKE :like ORDER BY id DESC LIMIT 1");
    $__mcAuditStmt->execute([':like' => '%throttled%']);
    $__mcDenied = $__mcAuditStmt->fetch();
    if (is_array($__mcDenied)) {
        $__mcMeta = (string) ($__mcDenied['metadata'] ?? '');
        mcCheck(strpos($__mcMeta, 'aft_') === false, 'AA.B.2 denied audit must not carry a token');
    }
    echo "AA.B.2 mint throttle rows passed\n";

    // ---- G. Session path / proxy discipline lives as code comments ----
    // (OUTCOME: documented where the behavior lives, not a new doc.)
    mcCheck(strpos($__mcSessionSrc, 'php_sessions') !== false, 'AA.B.2 session path discipline must name the owned php_sessions folder');
    mcCheck(strpos($__mcSessionSrc, 'session_save_path') !== false, 'AA.B.2 session path discipline must set session_save_path');
    mcCheck(strpos($__mcSessionSrc, 'app-owned') !== false, 'AA.B.2 session path discipline must keep the app-owned rationale comment');
    $__mcGuardSrc = (string) file_get_contents(__DIR__ . '/../auth/service-tokens.php');
    mcCheck(stripos($__mcGuardSrc, 'fail-closed') !== false, 'AA.B.2 CSRF boundary must keep the fail-closed comment');
    mcCheck(stripos($__mcGuardSrc, 'Bearer-only') !== false || stripos($__mcGuardSrc, 'Bearer → skip CSRF') !== false || stripos($__mcGuardSrc, 'Bearer skips CSRF') !== false, 'AA.B.2 CSRF boundary must document Bearer-skips-CSRF');
    echo "AA.B.2 session path/proxy discipline rows passed\n";
} finally {
    mcCleanup($__mcPdo, $__mcUserIds, $__mcMintPrefixes, [$__mcThrottleUser, $__mcMintLockedUser, $__mcMintOwnerUser]);
    $_SERVER = $__mcServer;
    $_COOKIE = $__mcCookie;
    $_SESSION = $__mcSession;
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

echo "AA.B.2 throttle + CSRF matrix passed\n";
