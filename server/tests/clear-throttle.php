<?php
/**
 * DC Lane-2 (phase567 retirement follow-up) — in-repo replacement for the
 * machine-local `clear_throttle.php` Temp script that
 * `tests/auth-login-page.spec.js` used to call per-test/per-file.
 *
 * Clears the login-attempt throttle so a deliberate lockout in one test
 * (auth #5 locks a user for 15 minutes) cannot cascade into later tests.
 * Refuses to run against any database whose name is not the hard-coded
 * test database (HY.0.1 RULES: never touch a non-test database).
 *
 * Usage:  php server/tests/clear-throttle.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

const THROTTLE_DB_NAME = 'afterschola_t3_test';

$pdo = database();
$current = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
if ($current !== THROTTLE_DB_NAME) {
    fwrite(STDERR, 'clear-throttle REFUSES: connected database is "' . $current . '", expected "' . THROTTLE_DB_NAME . '"' . PHP_EOL);
    exit(1);
}

$pdo->exec('DELETE FROM login_attempts');
echo 'clear-throttle OK (login_attempts emptied on ' . THROTTLE_DB_NAME . ')' . PHP_EOL;
