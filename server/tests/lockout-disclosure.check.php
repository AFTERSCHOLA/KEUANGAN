<?php
declare(strict_types=1);

// M-F1 — throttle clear-on-password-change regression.
// The lockout copy itself stays generic per AA.B.2 (no enumeration):
// login.php must reuse 'Nama pengguna atau kata sandi salah' on the
// locked branch. What this pins is that a password change / admin reset
// clears login_attempts, so the new password works on the next login
// instead of 401-ing behind a stale lock (the reported "old and new both
// wrong on second login").
// Run: php server/tests/lockout-disclosure.check.php (needs live MySQL test DB)

require_once __DIR__ . '/../bootstrap.php';

ob_start();

function ldCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

$loginSrc = (string) file_get_contents(__DIR__ . '/../api/auth/login.php');
$changeSrc = (string) file_get_contents(__DIR__ . '/../api/auth/change-password.php');
$usersSrc = (string) file_get_contents(__DIR__ . '/../api/users.php');

// Part 1: locked branch keeps the generic 401 (AA.B.2 no-enumeration rule).
ldCheck(substr_count($loginSrc, 'Nama pengguna atau kata sandi salah') >= 3, 'M-F1 login.php must reuse the generic 401 on empty/locked/invalid');

// Part 2: password change + admin reset must clear the throttle.
ldCheck(strpos($changeSrc, 'clearLoginFailures') !== false, 'M-F1 change-password.php must clear login_attempts');
ldCheck(strpos($usersSrc, 'clearLoginFailures') !== false, 'M-F1 users.php reset must clear login_attempts');

// Part 3 (function-level, existing API): 5 failures lock, clear unlocks.
$suffix = bin2hex(random_bytes(4));
$ldUser = 'test_mf1_' . $suffix;
$keyA = loginAttemptKey($ldUser);
clearLoginFailures($keyA);
ldCheck(!loginLocked($keyA), 'M-F1 fresh key must not be locked');
for ($i = 0; $i < 5; $i++) registerLoginFailure($keyA);
ldCheck(loginLocked($keyA), 'M-F1 5 failures must lock the key');
clearLoginFailures($keyA);
ldCheck(!loginLocked($keyA), 'M-F1 clear must unlock the key');

ob_end_clean();
echo "M-F1 lockout-disclosure check passed\n";
