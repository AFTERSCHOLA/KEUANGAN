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
    if (!is_file($configFile)) jsonResponse(['error' => 'Konfigurasi server belum tersedia'], 500);
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
    return is_array($user) ? $user : null;
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
