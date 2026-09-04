<?php

declare(strict_types=1);

/**
 * Env-driven server config.
 *
 * Precedence (highest first):
 *   1. Environment variables (APP_DSN, APP_DB_USER, APP_DB_PASS, APP_ENV,
 *      APP_SESSION, APP_SESSION_SECURE) — set these on any host (local
 *      dev, CI, cPanel) and the same tracked file works everywhere.
 *   2. Defaults below — safe for a fresh local clone on the canonical
 *      XAMPP setup (root user, no password, test DB).
 *
 * `server/config.example.php` stays as the documented, no-credentials
 * reference. Nothing in this file is environment-specific anymore, so
 * a fresh checkout is immediately runnable on any machine without
 * hand-editing — the historical cause of the misleading 500
 * "Konfigurasi server belum tersedia" that teammates hit.
 */

$env = static function (string $name, string $default): string {
    $value = getenv($name);
    return ($value === false || $value === '') ? $default : $value;
};

$environment    = $env('APP_ENV', 'development');
$dsn            = $env('APP_DSN', 'mysql:host=127.0.0.1;dbname=afterschola_t3_test;charset=utf8mb4');
$dbUser         = $env('APP_DB_USER', 'root');
$dbPass         = $env('APP_DB_PASS', '');
$sessionName    = $env('APP_SESSION', 'afterschola_session');
$sessionSecure  = $env('APP_SESSION_SECURE', 'false') === 'true';

if (!str_contains($dsn, 'charset=utf8mb4')) {
    $dsn .= str_contains($dsn, ';') ? '' : ';';
    if (!str_contains($dsn, 'charset=')) {
        $dsn .= 'charset=utf8mb4';
    }
}

return [
    'environment'    => $environment,
    'dsn'            => $dsn,
    'username'       => $dbUser,
    'password'       => $dbPass,
    'session_name'   => $sessionName,
    'session_secure' => $sessionSecure,
];