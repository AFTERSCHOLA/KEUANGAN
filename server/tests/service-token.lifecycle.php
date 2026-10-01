<?php
declare(strict_types=1);

// AA.B.1 (D-AA2, D-AA5, D-AA6, D-AA10) — service-token lifecycle WITHOUT
// spawning php -S (binding architecture ruling): direct lib calls
// (serviceTokenMint/serviceTokenRevoke/serviceBearerUser) + DB rows,
// mirroring schema.migration.php / authorize.policy.php style.
//
// Flow: mint (secret visible once) -> me-via-Bearer 200 without CSRF ->
// revoke -> Bearer null (401 at the edge); audit_log holds
// minted/revoked/denied rows with NO secret in metadata; all seeded rows
// (users + service_tokens + audit_log) are deleted even on failure.

require_once __DIR__ . '/../bootstrap.php';

function lcCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

// RED gate: thin endpoint + importable core must exist.
lcCheck(is_file(__DIR__ . '/../api/auth/tokens.php'), 'AA.B.1 tokens.php endpoint is missing');
lcCheck(function_exists('serviceTokenMint'), 'AA.B.1 serviceTokenMint() is missing');
lcCheck(function_exists('serviceTokenRevoke'), 'AA.B.1 serviceTokenRevoke() is missing');

$__lcServer = $_SERVER;
$__lcCookie = $_COOKIE;
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

$__lcSuffix = bin2hex(random_bytes(4));
$__lcOwnerId = 'usr-test-b1-owner-' . $__lcSuffix;
$__lcOtherId = 'usr-test-b1-other-' . $__lcSuffix;
$__lcTrainerId = 'usr-test-b1-trn-' . $__lcSuffix;
$__lcLockedId = 'usr-test-b1-locked-' . $__lcSuffix;
$__lcBranch = 'cab-test-b1-' . $__lcSuffix;
$__lcOwnerName = 'test_b1_mint_' . $__lcSuffix;
$__lcOtherName = 'test_b1_other_' . $__lcSuffix;
$__lcTrainerName = 'test_b1_trainer_' . $__lcSuffix;
$__lcLockedName = 'test_b1_locked_' . $__lcSuffix;
$__lcSeedIds = [$__lcOwnerId, $__lcOtherId, $__lcTrainerId, $__lcLockedId];
$__lcSeedPrefixes = ['tstbr008', 'tstbr009'];
$__lcMintedPrefixes = [];

$__lcPdo = database();
$__lcSeedUser = $__lcPdo->prepare("INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password) VALUES (:id, :username, :display, :ph, :role, :cabang, :trainer, 1, 0)");

function lcIdentity(string $id, string $username, string $role, ?string $cabang, ?string $trainer): array {
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

function lcCleanup(PDO $pdo, array $userIds, array $prefixes): void {
    if ($prefixes !== []) {
        $placeholders = implode(',', array_fill(0, count($prefixes), '?'));
        $pdo->prepare("DELETE FROM service_tokens WHERE prefix IN ({$placeholders})")->execute($prefixes);
    }
    if ($userIds !== []) {
        $placeholders = implode(',', array_fill(0, count($userIds), '?'));
        $pdo->prepare("DELETE FROM audit_log WHERE actor_user_id IN ({$placeholders}) AND event_type IN ('service_token_minted','service_token_revoked','service_token_denied')")->execute($userIds);
        $pdo->prepare("DELETE FROM users WHERE id IN ({$placeholders})")->execute($userIds);
    }
}

try {
    // Static wiring: me.php resolves Bearer-first without CSRF on safe GET;
    // tokens.php stays a thin wrapper (method gate -> auth -> lib -> json).
    $__lcMeSrc = (string) file_get_contents(__DIR__ . '/../api/auth/me.php');
    lcCheck(strpos($__lcMeSrc, 'serviceBearerUser') !== false, 'AA.B.1 me.php must resolve Bearer via serviceBearerUser()');
    lcCheck(strpos($__lcMeSrc, 'requireCsrf') === false, 'AA.B.1 me.php GET must NOT require CSRF (browser bootstrap sends none)');
    $__lcTokensSrc = (string) file_get_contents(__DIR__ . '/../api/auth/tokens.php');
    lcCheck(strpos($__lcTokensSrc, 'serviceTokenMint') !== false && strpos($__lcTokensSrc, 'serviceTokenRevoke') !== false, 'AA.B.1 tokens.php must delegate to the importable lib');

    $__lcSeedUser->execute([':id' => $__lcOwnerId, ':username' => $__lcOwnerName, ':display' => 'B1 owner', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'admin_cabang', ':cabang' => $__lcBranch, ':trainer' => null]);
    $__lcSeedUser->execute([':id' => $__lcOtherId, ':username' => $__lcOtherName, ':display' => 'B1 other', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'admin_cabang', ':cabang' => $__lcBranch, ':trainer' => null]);
    $__lcSeedUser->execute([':id' => $__lcTrainerId, ':username' => $__lcTrainerName, ':display' => 'B1 trainer', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'trainer', ':cabang' => $__lcBranch, ':trainer' => 'trn-test-b1-' . $__lcSuffix]);
    $__lcSeedUser->execute([':id' => $__lcLockedId, ':username' => $__lcLockedName, ':display' => 'B1 locked', ':ph' => password_hash('CorrectHorse123X', PASSWORD_DEFAULT), ':role' => 'admin_cabang', ':cabang' => $__lcBranch, ':trainer' => null]);

    $__lcOwner = lcIdentity($__lcOwnerId, $__lcOwnerName, 'admin_cabang', $__lcBranch, null);
    $__lcOther = lcIdentity($__lcOtherId, $__lcOtherName, 'admin_cabang', $__lcBranch, null);
    $__lcTrainer = lcIdentity($__lcTrainerId, $__lcTrainerName, 'trainer', $__lcBranch, 'trn-test-b1-' . $__lcSuffix);
    $__lcLocked = lcIdentity($__lcLockedId, $__lcLockedName, 'admin_cabang', $__lcBranch, null);

    // Direct-seeded guard rows (tstbr00* hygiene): revoked + expired Bearer
    // resolve to null (401 at the edge).
    $__lcSeedToken = $__lcPdo->prepare("INSERT INTO service_tokens (id, prefix, token_hash, last4, user_id, role, cabang_id, trainer_id, name, expires_at, revoked_at, created_ip) VALUES (:id, :prefix, :hash, :last4, :uid, 'admin_cabang', :cabang, NULL, 'AA.B.1 seeded', :exp, :rev, '127.0.0.1')");
    $__lcRevSecret = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';
    $__lcExpSecret = 'ZYXWVUTSRQPONMLKJIHGFEDCBAhgfedcba987654321';
    $__lcSeedToken->execute([':id' => 'srv-test-b1-rev', ':prefix' => 'tstbr009', ':hash' => serviceTokenHash($__lcRevSecret), ':last4' => '6789', ':uid' => $__lcOwnerId, ':cabang' => $__lcBranch, ':exp' => date('Y-m-d H:i:s', time() + 90 * 86400), ':rev' => date('Y-m-d H:i:s', time())]);
    $__lcSeedToken->execute([':id' => 'srv-test-b1-exp', ':prefix' => 'tstbr008', ':hash' => serviceTokenHash($__lcExpSecret), ':last4' => '4321', ':uid' => $__lcOwnerId, ':cabang' => $__lcBranch, ':exp' => date('Y-m-d H:i:s', time() - 86400), ':rev' => null]);
    $_COOKIE = [];
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr009_' . $__lcRevSecret;
    lcCheck(serviceBearerUser() === null, 'AA.B.1 revoked Bearer must resolve to null (401 at the edge)');
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer aft_tstbr008_' . $__lcExpSecret;
    lcCheck(serviceBearerUser() === null, 'AA.B.1 expired Bearer must resolve to null (401 at the edge)');
    echo "AA.B.1 revoked/expired guard rows passed\n";

    // Mint: ttl omitted -> 90d default; secret visible exactly once.
    $__lcMint = serviceTokenMint($__lcOwner, ['action' => 'mint', 'name' => 'b1 lifecycle'], '127.0.0.1');
    lcCheck($__lcMint['status'] === 201, 'AA.B.1 mint should be 201, got ' . $__lcMint['status']);
    lcCheck(isset($__lcMint['body']['token'], $__lcMint['body']['prefix'], $__lcMint['body']['expires_at']), 'AA.B.1 mint must return {token, prefix, expires_at}');
    lcCheck(array_keys($__lcMint['body']) === ['token', 'prefix', 'expires_at'], 'AA.B.1 mint body must carry ONLY {token, prefix, expires_at}');
    $__lcToken = (string) $__lcMint['body']['token'];
    lcCheck(preg_match('/^aft_([A-Za-z0-9]{8})_([A-Za-z0-9\-_]{43})$/', $__lcToken, $__lcM) === 1, 'AA.B.1 mint token shape must be aft_<prefix8>_<secret43>');
    lcCheck($__lcM[1] === $__lcMint['body']['prefix'], 'AA.B.1 mint prefix must match the token prefix');
    $__lcSecret = $__lcM[2];
    $__lcExpTs = strtotime((string) $__lcMint['body']['expires_at']);
    lcCheck(abs($__lcExpTs - (time() + 90 * 86400)) < 300, 'AA.B.1 missing ttl_days must default to 90d');
    $__lcMintedPrefixes[] = $__lcMint['body']['prefix'];

    // DB stores ONLY the hash (+ prefix/last4/scope); raw secret nowhere.
    $__lcRowStmt = $__lcPdo->prepare('SELECT * FROM service_tokens WHERE prefix = :prefix LIMIT 1');
    $__lcRowStmt->execute([':prefix' => $__lcMint['body']['prefix']]);
    $__lcRow = $__lcRowStmt->fetch();
    lcCheck(is_array($__lcRow), 'AA.B.1 minted row must be readable by prefix');
    lcCheck($__lcRow['token_hash'] === serviceTokenHash($__lcSecret), 'AA.B.1 stored hash must match the one-time secret');
    lcCheck($__lcRow['last4'] === substr($__lcSecret, -4), 'AA.B.1 last4 must be the last 4 of the secret');
    lcCheck($__lcRow['user_id'] === $__lcOwnerId && $__lcRow['role'] === 'admin_cabang' && $__lcRow['cabang_id'] === $__lcBranch, 'AA.B.1 token scope must bind caller user_id + role + cabang_id');
    lcCheck(strpos((string) $__lcRow['id'], 'srv-') === 0, 'AA.B.1 token id must carry the srv- idiom');
    lcCheck(strpos(implode('|', array_map('strval', array_values($__lcRow))), $__lcSecret) === false, 'AA.B.1 raw secret must NOT be stored in any column');

    // me via Bearer WITHOUT CSRF -> resolves (safe GET, no CSRF traffic).
    $_COOKIE = [];
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $__lcToken;
    $__lcMe = serviceBearerUser();
    lcCheck(is_array($__lcMe), 'AA.B.1 me via Bearer without CSRF must resolve');
    lcCheck(array_keys($__lcMe) === ['id', 'username', 'displayName', 'role', 'cabangId', 'trainerId', 'active', 'mustChangePassword'], 'AA.B.1 Bearer identity must match the safeIdentity() shape');
    lcCheck($__lcMe['username'] === $__lcOwnerName && $__lcMe['cabangId'] === $__lcBranch, 'AA.B.1 Bearer identity must carry the caller scope');
    echo "AA.B.1 mint -> me-via-Bearer rows passed\n";

    // ttl invalid -> 422 (present-but-invalid only; missing defaults above).
    foreach ([0, -5, 366, 'abc', ''] as $__lcBadTtl) {
        $__lcBad = serviceTokenMint($__lcOwner, ['action' => 'mint', 'name' => 'bad ttl', 'ttl_days' => $__lcBadTtl], '127.0.0.1');
        lcCheck($__lcBad['status'] === 422, 'AA.B.1 ttl_days invalid must be 422');
    }
    $__lcNoName = serviceTokenMint($__lcOwner, ['action' => 'mint', 'name' => '  '], '127.0.0.1');
    lcCheck($__lcNoName['status'] === 422, 'AA.B.1 blank name must be 422');

    // Scope-narrowing outside caller scope -> 403 + denied audit.
    $__lcNarrow = serviceTokenMint($__lcOwner, ['action' => 'mint', 'name' => 'narrow', 'cabang_id' => 'cab-elsewhere'], '127.0.0.1');
    lcCheck($__lcNarrow['status'] === 403, 'AA.B.1 cabang narrowing outside own scope must be 403');

    // Trainer mint binds trainer_id from the SESSION identity (never body).
    $__lcTrMint = serviceTokenMint($__lcTrainer, ['action' => 'mint', 'name' => 'trainer token', 'ttl_days' => 30], '127.0.0.1');
    lcCheck($__lcTrMint['status'] === 201, 'AA.B.1 trainer mint should be 201');
    $__lcMintedPrefixes[] = $__lcTrMint['body']['prefix'];
    $__lcRowStmt->execute([':prefix' => $__lcTrMint['body']['prefix']]);
    $__lcTrRow = $__lcRowStmt->fetch();
    lcCheck(is_array($__lcTrRow) && $__lcTrRow['trainer_id'] === 'trn-test-b1-' . $__lcSuffix, 'AA.B.1 trainer token must bind trainer_id from session');

    // Throttle: locked caller -> generic 401 (same message as login.php),
    // check-only on entry (mint failures above must NOT have locked anyone).
    $__lcKey = loginAttemptKey($__lcLockedName);
    for ($i = 0; $i < 5; $i++) registerLoginFailure($__lcKey);
    lcCheck(loginLocked($__lcKey), 'AA.B.1 test lock setup failed');
    $__lcThrottled = serviceTokenMint($__lcLocked, ['action' => 'mint', 'name' => 'throttled'], '127.0.0.1');
    lcCheck($__lcThrottled['status'] === 401, 'AA.B.1 throttled mint must be 401');
    lcCheck(($__lcThrottled['body']['error'] ?? '') === 'Nama pengguna atau kata sandi salah', 'AA.B.1 throttled mint must reuse the generic login message');
    clearLoginFailures($__lcKey);
    $__lcOwnerKey = loginAttemptKey($__lcOwnerName);
    lcCheck(!loginLocked($__lcOwnerKey), 'AA.B.1 mint validation failures must NOT increment the shared throttle');
    echo "AA.B.1 validation/throttle/scope rows passed\n";

    // Revoke: malformed -> 422; unknown -> 404; non-owner -> SAME 404.
    $__lcMalformed = serviceTokenRevoke($__lcOwner, 'short');
    lcCheck($__lcMalformed['status'] === 422, 'AA.B.1 malformed prefix revoke must be 422');
    $__lcUnknown = serviceTokenRevoke($__lcOwner, 'tstbr007');
    lcCheck($__lcUnknown['status'] === 404, 'AA.B.1 unknown-prefix revoke must be 404');
    $__lcForeign = serviceTokenRevoke($__lcOther, (string) $__lcMint['body']['prefix']);
    lcCheck($__lcForeign['status'] === 404 && $__lcForeign['body'] === $__lcUnknown['body'], 'AA.B.1 non-owner revoke must be indistinguishable from unknown (same 404)');
    $__lcRev = serviceTokenRevoke($__lcOwner, (string) $__lcMint['body']['prefix']);
    lcCheck($__lcRev['status'] === 200 && ($__lcRev['body']['prefix'] ?? null) === $__lcMint['body']['prefix'], 'AA.B.1 owner revoke must be 200 with the prefix');
    lcCheck(!isset($__lcRev['body']['token']), 'AA.B.1 revoke must never return a secret');

    // Revoke is immediate: next Bearer use resolves to null (401 at edge).
    $_COOKIE = [];
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $__lcToken;
    lcCheck(serviceBearerUser() === null, 'AA.B.1 revoked token must resolve to null (401 at the edge)');

    // Audit: minted + revoked + denied rows exist, NO secret/token in metadata.
    $__lcAuditStmt = $__lcPdo->prepare("SELECT event_type, metadata FROM audit_log WHERE actor_user_id = :uid AND event_type IN ('service_token_minted','service_token_revoked','service_token_denied') ORDER BY id");
    $__lcAuditStmt->execute([':uid' => $__lcOwnerId]);
    $__lcAudits = $__lcAuditStmt->fetchAll();
    $__lcEvents = array_column($__lcAudits, 'event_type');
    foreach (['service_token_minted', 'service_token_revoked', 'service_token_denied'] as $__lcWant) {
        lcCheck(in_array($__lcWant, $__lcEvents, true), "AA.B.1 audit_log is missing {$__lcWant}");
    }
    foreach ($__lcAudits as $__lcAudit) {
        $__lcMeta = (string) ($__lcAudit['metadata'] ?? '');
        lcCheck(strpos($__lcMeta, $__lcSecret) === false, 'AA.B.1 audit metadata must NOT contain the secret');
        $__lcDecoded = json_decode($__lcMeta, true);
        if (is_array($__lcDecoded)) {
            lcCheck(!isset($__lcDecoded['token']) && !isset($__lcDecoded['secret']), 'AA.B.1 audit metadata must NOT carry token/secret keys');
        }
    }
    echo "AA.B.1 revoke + audit rows passed\n";
} finally {
    clearLoginFailures(loginAttemptKey($__lcLockedName));
    clearLoginFailures(loginAttemptKey($__lcOwnerName));
    lcCleanup($__lcPdo, $__lcSeedIds, array_merge($__lcSeedPrefixes, $__lcMintedPrefixes));
    $_SERVER = $__lcServer;
    $_COOKIE = $__lcCookie;
}

echo "AA.B.1 service-token lifecycle passed\n";
