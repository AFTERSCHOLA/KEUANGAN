<?php
declare(strict_types=1);

// AA.A.2 (D-AA2–D-AA4) — Hybrid-Opaque service-token guard (deny-closed).
//
// Browser auth stays cookie session + CSRF (server/auth/session.php).
// Machine auth uses opaque Bearer tokens `aft_<prefix8>_<secret43>` where
// `secret = base64url-nopad(random_bytes(32))`. Only the HASH is stored:
// `token_hash = SHA256(secret)`, or HMAC-SHA256 when the
// `SERVICE_TOKEN_PEPPER` env var is set (read via getenv only; absent =
// plain SHA256 — no pepper key lives in config files or the repo).
//
// Lookup is by plain `prefix`, compared with `hash_equals`, then
// `expires_at` must be in the future, `revoked_at` must be NULL, and the
// bound user row must be active with a valid role. The resolved identity
// is the SAME `safeIdentity()` shape session auth uses, so every request
// still flows through the SAME `authorize()` scope checks — the guard
// supplies the user, never a bypass (R-AA1).
//
// CSRF boundary (D-AA3, R-AA2): Bearer-only skips CSRF (no ambient
// credentials); any session/remember cookie presence requires CSRF, even
// when a Bearer header is also present (fail-closed).
//
// Guard order for endpoints adopting this file:
//   405 method → 401 auth (cookie or Bearer) → 403 CSRF (cookie path
//   only) → 422 body → 403 scope → 201/200.

function serviceTokenHash(string $secret): string {
    $pepper = getenv('SERVICE_TOKEN_PEPPER');
    if (is_string($pepper) && $pepper !== '') {
        return hash_hmac('sha256', $secret, $pepper);
    }
    return hash('sha256', $secret);
}

function serviceBearerUser(): ?array {
    try {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? null;
        if (!is_string($header) || $header === '') {
            // CGI/FastCGI often hides the Authorization header from
            // $_SERVER — fall back to the request-headers helpers.
            $headers = [];
            if (function_exists('apache_request_headers')) {
                $headers = apache_request_headers();
            } elseif (function_exists('getallheaders')) {
                $headers = getallheaders();
            }
            if (is_array($headers)) {
                foreach ($headers as $name => $value) {
                    if (strcasecmp((string) $name, 'Authorization') === 0 && is_string($value) && $value !== '') {
                        $header = $value;
                        break;
                    }
                }
            }
        }
        if (!is_string($header) || $header === '') return null;
        if (strncasecmp($header, 'Bearer ', 7) !== 0) return null;
        $raw = trim(substr($header, 7));
        if (!preg_match('/^aft_([A-Za-z0-9]{8})_([A-Za-z0-9\-_]{43})$/', $raw, $matches)) return null;
        $prefix = $matches[1];
        $secret = $matches[2];

        $pdo = database();
        $stmt = $pdo->prepare('SELECT token_hash, user_id, expires_at, revoked_at FROM service_tokens WHERE prefix = :prefix LIMIT 1');
        $stmt->execute([':prefix' => $prefix]);
        $row = $stmt->fetch();
        if (!is_array($row)) return null;
        if (!hash_equals((string) $row['token_hash'], serviceTokenHash($secret))) return null;
        if ($row['revoked_at'] !== null) return null;
        if (strtotime((string) $row['expires_at']) <= time()) return null;

        $userStmt = $pdo->prepare("SELECT id, username, display_name, role, cabang_id, trainer_id, active, must_change_password FROM users WHERE id = :id AND active = 1 AND role IN ('superadmin', 'admin_cabang', 'trainer') LIMIT 1");
        $userStmt->execute([':id' => $row['user_id']]);
        $userRow = $userStmt->fetch();
        if (!is_array($userRow)) return null;
        return safeIdentity([
            'id' => $userRow['id'],
            'username' => $userRow['username'],
            'displayName' => $userRow['display_name'],
            'role' => $userRow['role'],
            'cabangId' => $userRow['cabang_id'],
            'trainerId' => $userRow['trainer_id'],
            'active' => (bool) $userRow['active'],
            'mustChangePassword' => (bool) $userRow['must_change_password'],
        ]);
    } catch (Throwable $ignored) {
        return null;
    }
}

// Pure CSRF-boundary predicate: true when the request must present
// `X-CSRF-Token` (403 at the edge when absent/mismatched), false when a
// Bearer-only request may skip it. Any ambient-cookie presence (session
// or remember cookie — the latter restores a session server-side) means
// the cookie path is involved, so CSRF is required even with a valid
// Bearer header (fail-closed). Anonymous stays fail-closed (the 401 in
// requireAuthUserOrBearer() fires before CSRF is ever evaluated).
function requestRequiresCsrf(?array $bearerUser): bool {
    $sessionKey = 'afterschola_session';
    try {
        $config = serverConfig();
        if (is_string($config['session_name'] ?? null) && ($config['session_name'] ?? '') !== '') {
            $sessionKey = $config['session_name'];
        }
    } catch (Throwable $ignored) {
    }
    $rememberKey = defined('REMEMBER_COOKIE') ? REMEMBER_COOKIE : 'afterschola_remember';
    if (isset($_COOKIE[$sessionKey]) || isset($_COOKIE[$rememberKey])) return true;
    return $bearerUser === null;
}

// Cookie-or-Bearer authentication for endpoints: 401 when neither
// resolves, CSRF enforced on the cookie path only (Bearer-only skips).
// Returns the session identity when the cookie path is involved (both
// present + valid CSRF included), else the Bearer identity.
function requireAuthUserOrBearer(): array {
    $bearerUser = serviceBearerUser();
    if (!requestRequiresCsrf($bearerUser)) {
        return $bearerUser;
    }
    $user = requireAuthenticatedUser();
    requireCsrf();
    return $user;
}
