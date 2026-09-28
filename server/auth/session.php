<?php
declare(strict_types=1);

const SESSION_IDLE_SECONDS = 1800;
const SESSION_ABSOLUTE_SECONDS = 28800;
const CSRF_HEADER = 'HTTP_X_CSRF_TOKEN';
const SESSION_USER_KEY = 'afterschola_user';
const SESSION_STARTED_KEY = 'afterschola_started_at';
const SESSION_ACTIVITY_KEY = 'afterschola_activity_at';
const SESSION_CSRF_KEY = 'afterschola_csrf';

function serverConfig(): array {
    $configFile = __DIR__ . '/../config.php';
    if (!is_file($configFile)) {
        if (php_sapi_name() === 'cli' || (getenv('APP_ENV') ?: 'production') !== 'production') {
            $fallback = __DIR__ . '/../config.example.php';
            if (is_file($fallback)) {
                $config = require $fallback;
                if (!is_array($config)) {
                    fwrite(STDERR, "config.example.php tidak me-return array\n");
                    jsonResponse(['error' => 'Konfigurasi server tidak valid'], 500);
                }
                return $config;
            }
        }
        jsonResponse(['error' => 'Konfigurasi server belum tersedia'], 500);
    }
    $config = require $configFile;
    if (!is_array($config)) jsonResponse(['error' => 'Konfigurasi server tidak valid'], 500);
    return $config;
}

function productionMode(): bool {
    $config = serverConfig();
    return ($config['environment'] ?? 'production') === 'production';
}

function startSecureSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $config = serverConfig();
    $secure = (bool) ($config['session_secure'] ?? productionMode());

    // Override session.save_path with an app-owned, writable folder.
    // cPanel's default (/var/cpanel/php/sessions/alt-php82) has caused
    // silent session-write failures on this host — the session ID gets
    // issued and the cookie round-trips fine, but $_SESSION data itself
    // never persists, so every request after login looks anonymous. A
    // path we control and can verify permissions on sidesteps that.
    $sessionPath = getenv('APP_SESSION_SAVE_PATH');
    if (!$sessionPath) {
        $sessionPath = dirname(__DIR__, 2) . '/php_sessions';
    }
    if (is_dir($sessionPath) && is_writable($sessionPath)) {
        session_save_path($sessionPath);
    }

    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.gc_maxlifetime', (string) SESSION_IDLE_SECONDS);
    session_name($config['session_name'] ?? 'afterschola_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    $now = time();
    if (!isset($_SESSION[SESSION_STARTED_KEY])) $_SESSION[SESSION_STARTED_KEY] = $now;
    if (!isset($_SESSION[SESSION_ACTIVITY_KEY])) $_SESSION[SESSION_ACTIVITY_KEY] = $now;
    if ($now - (int) $_SESSION[SESSION_STARTED_KEY] > SESSION_ABSOLUTE_SECONDS || $now - (int) $_SESSION[SESSION_ACTIVITY_KEY] > SESSION_IDLE_SECONDS) {
        invalidateSession();
        session_start();
        $_SESSION[SESSION_STARTED_KEY] = $now;
        $_SESSION[SESSION_ACTIVITY_KEY] = $now;
    } else {
        $_SESSION[SESSION_ACTIVITY_KEY] = $now;
    }
}

function invalidateSession(): void {
    if (session_status() !== PHP_SESSION_ACTIVE) return;
    $_SESSION = [];
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $params['path'] ?? '/',
        'domain' => $params['domain'] ?? '',
        'secure' => (bool) ($params['secure'] ?? false),
        'httponly' => (bool) ($params['httponly'] ?? true),
        'samesite' => $params['samesite'] ?? 'Lax',
    ]);
    session_destroy();
}

function sessionUser(): ?array {
    startSecureSession();
    $user = $_SESSION[SESSION_USER_KEY] ?? null;
    if (is_array($user)) return $user;
    // D-RM4 — transparent restore from a valid remember-me cookie.
    // Invalid/expired tokens stay anonymous (today's 401, no new signal).
    $restored = restoreFromRememberToken();
    return is_array($restored) ? $restored : null;
}

function requireAuthenticatedUser(): array {
    $user = sessionUser();
    if (!$user || !($user['active'] ?? false)) jsonResponse(['error' => 'Autentikasi diperlukan'], 401);
    return $user;
}

function safeIdentity(array $user): array {
    return [
        'id' => (string) $user['id'],
        'username' => (string) $user['username'],
        'displayName' => (string) $user['displayName'],
        'role' => (string) $user['role'],
        'cabangId' => $user['cabangId'] ?? null,
        'trainerId' => $user['trainerId'] ?? null,
        'active' => (bool) $user['active'],
        'mustChangePassword' => (bool) $user['mustChangePassword'],
    ];
}

function loginSession(array $user): array {
    startSecureSession();
    session_regenerate_id(true);
    $_SESSION[SESSION_USER_KEY] = safeIdentity($user);
    $_SESSION[SESSION_STARTED_KEY] = time();
    $_SESSION[SESSION_ACTIVITY_KEY] = time();
    $_SESSION[SESSION_CSRF_KEY] = bin2hex(random_bytes(32));
    return $_SESSION[SESSION_USER_KEY];
}

// ============================================
// D-RM2/D-RM4/D-RM5 — remember-me token lifecycle (opt-in persistent
// login). Only the SHA-256 hash is stored; the raw token lives solely
// in the persistent HttpOnly cookie. Single-use lineage: every restore
// deletes the presented hash and mints a fresh one.
// ============================================
const REMEMBER_COOKIE = 'afterschola_remember';
const REMEMBER_DAYS = 30;

function rememberCookieParams(): array {
    $config = serverConfig();
    $secure = (bool) ($config['session_secure'] ?? productionMode());
    return [
        'expires' => time() + REMEMBER_DAYS * 24 * 60 * 60,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

function rememberTokenHash(string $raw): string {
    return hash('sha256', $raw);
}

// Mints a token row + sets the persistent cookie. Call after loginSession,
// before any output (setcookie header posture mirrors startSecureSession).
function issueRememberToken(string $userId): string {
    $raw = bin2hex(random_bytes(32));
    $pdo = database();
    // Single-clock rule: expiry is computed in PHP (same clock as the
    // restore-time comparison below). MySQL NOW() can run in a different
    // timezone than PHP time() on some hosts (observed +5h skew locally),
    // which would silently stretch or shrink the 30-day window.
    $expiresAt = date('Y-m-d H:i:s', time() + REMEMBER_DAYS * 24 * 60 * 60);
    $pdo->prepare('INSERT INTO remember_tokens (token_hash, user_id, expires_at) VALUES (:hash, :uid, :exp)')
        ->execute([':hash' => rememberTokenHash($raw), ':uid' => $userId, ':exp' => $expiresAt]);
    setcookie(REMEMBER_COOKIE, $raw, rememberCookieParams());
    $_COOKIE[REMEMBER_COOKIE] = $raw;
    return $raw;
}

// Validates the presented cookie and re-establishes the session.
// Returns the restored identity or null. Never throws past the caller:
// auth stays fail-closed (anonymous) on any storage hiccup.
//
// Rotation is age-gated (D-RM2): the hash rotates only when the token is
// older than an hour. Fresh tokens are reused as-is so CONCURRENT
// restores (React StrictMode double-mounts bootstrapAuth twice in dev;
// any two tabs racing on load) both succeed instead of the loser 401ing
// on an already-consumed hash. Steady-state use still rotates regularly.
const REMEMBER_ROTATE_AFTER_SECONDS = 3600;

function restoreFromRememberToken(): ?array {
    try {
        $raw = $_COOKIE[REMEMBER_COOKIE] ?? null;
        if (!is_string($raw) || $raw === '') return null;
        $pdo = database();
        // UNIX_TIMESTAMP: timezone-agnostic epoch — immune to the
        // MySQL-vs-PHP clock skew that wall-clock reads suffer from.
        $stmt = $pdo->prepare('SELECT user_id, expires_at, UNIX_TIMESTAMP(created_at) AS created_ts FROM remember_tokens WHERE token_hash = :hash LIMIT 1');
        $stmt->execute([':hash' => rememberTokenHash($raw)]);
        $row = $stmt->fetch();
        if ($row === false) return null;
        if (strtotime((string) $row['expires_at']) <= time()) {
            $pdo->prepare('DELETE FROM remember_tokens WHERE token_hash = :hash')
                ->execute([':hash' => rememberTokenHash($raw)]);
            return null;
        }
        $userStmt = $pdo->prepare("SELECT id, username, display_name, role, cabang_id, trainer_id, active, must_change_password FROM users WHERE id = :id AND active = 1 AND role IN ('superadmin', 'admin_cabang', 'trainer') LIMIT 1");
        $userStmt->execute([':id' => $row['user_id']]);
        $userRow = $userStmt->fetch();
        if (!is_array($userRow)) return null;
        $pdo->prepare('UPDATE remember_tokens SET last_used_at = NOW() WHERE token_hash = :hash')
            ->execute([':hash' => rememberTokenHash($raw)]);
        $age = time() - (int) ($row['created_ts'] ?? time());
        if ($age > REMEMBER_ROTATE_AFTER_SECONDS) {
            // Old enough: consume the presented hash, mint the next.
            $pdo->prepare('DELETE FROM remember_tokens WHERE token_hash = :hash')
                ->execute([':hash' => rememberTokenHash($raw)]);
            issueRememberToken((string) $userRow['id']);
        }
        $identity = [
            'id' => $userRow['id'],
            'username' => $userRow['username'],
            'displayName' => $userRow['display_name'],
            'role' => $userRow['role'],
            'cabangId' => $userRow['cabang_id'],
            'trainerId' => $userRow['trainer_id'],
            'active' => (bool) $userRow['active'],
            'mustChangePassword' => (bool) $userRow['must_change_password'],
        ];
        $_SESSION[SESSION_USER_KEY] = safeIdentity($identity);
        $_SESSION[SESSION_STARTED_KEY] = time();
        $_SESSION[SESSION_ACTIVITY_KEY] = time();
        unset($_SESSION[SESSION_CSRF_KEY]);
        auditEvent('session_restored_via_remember', $_SESSION[SESSION_USER_KEY], 'user', (string) $userRow['id']);
        return $_SESSION[SESSION_USER_KEY];
    } catch (Throwable $ignored) {
        return null;
    }
}

// Deletes the presented token row + clears the cookie. Call on explicit
// logout (D-RM5) — after this, the cookie resurrects nothing.
function revokeRememberToken(): void {
    try {
        $raw = $_COOKIE[REMEMBER_COOKIE] ?? null;
        if (is_string($raw) && $raw !== '') {
            database()->prepare('DELETE FROM remember_tokens WHERE token_hash = :hash')
                ->execute([':hash' => rememberTokenHash($raw)]);
        }
    } catch (Throwable $ignored) {
    }
    setcookie(REMEMBER_COOKIE, '', [
        'expires' => time() - 42000,
        'path' => '/',
        'secure' => false,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    unset($_COOKIE[REMEMBER_COOKIE]);
}

function csrfToken(): string {
    startSecureSession();
    if (!isset($_SESSION[SESSION_CSRF_KEY])) $_SESSION[SESSION_CSRF_KEY] = bin2hex(random_bytes(32));
    return (string) $_SESSION[SESSION_CSRF_KEY];
}

function requireCsrf(): void {
    $expected = csrfToken();
    $provided = $_SERVER[CSRF_HEADER] ?? '';
    if (!is_string($provided) || $provided === '' || !hash_equals($expected, $provided)) {
        jsonResponse(['error' => 'Token keamanan tidak valid'], 403);
    }
}

function auditEvent(string $eventType, ?array $user = null, ?string $targetType = null, ?string $targetId = null, array $metadata = []): void {
    try {
        $pdo = database();
        $stmt = $pdo->prepare('INSERT INTO audit_log (actor_user_id, actor_role, cabang_id, event_type, target_type, target_id, metadata) VALUES (:actor_user_id, :actor_role, :cabang_id, :event_type, :target_type, :target_id, :metadata)');
        $stmt->execute([
            ':actor_user_id' => $user['id'] ?? null,
            ':actor_role' => $user['role'] ?? null,
            ':cabang_id' => $user['cabangId'] ?? null,
            ':event_type' => $eventType,
            ':target_type' => $targetType,
            ':target_id' => $targetId,
            ':metadata' => $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
        ]);
    } catch (Throwable $error) {
        if (productionMode()) return;
    }
}

function loginAttemptKey(string $username): string {
    return hash('sha256', strtolower(trim($username)) . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

function loginLocked(string $key): bool {
    $stmt = database()->prepare('SELECT locked_until FROM login_attempts WHERE key_hash = :key_hash');
    $stmt->execute([':key_hash' => $key]);
    $lockedUntil = $stmt->fetchColumn();
    return is_string($lockedUntil) && strtotime($lockedUntil) > time();
}

function registerLoginFailure(string $key): void {
    $pdo = database();
    $stmt = $pdo->prepare('INSERT INTO login_attempts (key_hash, failed_count, locked_until) VALUES (:key_hash, 1, NULL) ON DUPLICATE KEY UPDATE failed_count = failed_count + 1, locked_until = IF(failed_count + 1 >= 5, DATE_ADD(NOW(), INTERVAL 15 MINUTE), locked_until)');
    $stmt->execute([':key_hash' => $key]);
}

function clearLoginFailures(string $key): void {
    $stmt = database()->prepare('DELETE FROM login_attempts WHERE key_hash = :key_hash');
    $stmt->execute([':key_hash' => $key]);
}

function requirePasswordPolicy(string $password): void {
    if (strlen($password) < 12 || strlen($password) > 255 || !preg_match('/[a-z]/', $password) || !preg_match('/[A-Z]/', $password) || !preg_match('/\d/', $password)) {
        jsonResponse(['error' => 'Kata sandi minimal 12 karakter dan harus memuat huruf besar, huruf kecil, serta angka'], 422);
    }
}
