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
        $stmt = $pdo->prepare('SELECT token_hash, user_id, role, cabang_id, trainer_id, expires_at, revoked_at FROM service_tokens WHERE prefix = :prefix LIMIT 1');
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
        // Token-bound scope (D-AA4; minted with user_id + role + cabang_id
        // (+ trainer_id) in AA.B.1): the token carries the scope it was
        // minted with, so a stale token — e.g. user transferred branch or
        // role changed since mint — fails closed here instead of riding
        // the live row into a new branch. Strict compare: NULL (superadmin
        // without branch / non-trainer) only matches NULL. Live branch /
        // assignment checks still stay in authorize() downstream (R-AA1).
        if ($row['role'] !== $userRow['role']) return null;
        if ($row['cabang_id'] !== $userRow['cabang_id']) return null;
        if ($row['trainer_id'] !== $userRow['trainer_id']) return null;
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

// ---------------------------------------------------------------------
// AA.B.1 (D-AA2, D-AA5, D-AA6, D-AA10) — mint/revoke CORE (importable,
// non-exiting) so service-token.lifecycle.php tests WITHOUT spawning
// php -S. The thin HTTP wrapper lives in server/api/auth/tokens.php.
// Return shape is ['status' => int, 'body' => array]; bodies reuse the
// existing flat jsonResponse() idiom with Indonesian copy. The raw secret
// is returned exactly once inside the mint body and never stored —
// every other path (DB row, audit metadata, revoke body) carries only
// prefix/last4 (R-AA3).
// ---------------------------------------------------------------------

function serviceTokenRandomPrefix(): string {
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    $out = '';
    for ($i = 0; $i < 8; $i++) $out .= $alphabet[random_int(0, 61)];
    return $out;
}

function serviceTokenNewSecret(): string {
    // 32 random bytes -> base64url, no padding -> always 43 chars.
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}

function serviceTokenMint(array $caller, array $params, string $createdIp = ''): array {
    $username = isset($caller['username']) && is_string($caller['username']) ? $caller['username'] : '';
    // D-AA6 check-only (ruling 4): the caller is already authenticated, so
    // mint validation/scope failures must NOT increment the shared login
    // bucket — only a pre-locked caller is turned away, with the same
    // generic 401 as login.php (no enumeration).
    if ($username !== '' && loginLocked(loginAttemptKey($username))) {
        auditEvent('service_token_denied', $caller, 'service_token', null, ['reason' => 'throttled']);
        return ['status' => 401, 'body' => ['error' => 'Nama pengguna atau kata sandi salah']];
    }
    $name = isset($params['name']) && is_string($params['name']) ? trim($params['name']) : '';
    if ($name === '' || strlen($name) > 191) {
        return ['status' => 422, 'body' => ['error' => 'Nama token wajib diisi']];
    }
    // Ruling 2: ttl_days OPTIONAL, missing -> 90d; present-but-invalid -> 422.
    $ttl = 90;
    if (array_key_exists('ttl_days', $params) && $params['ttl_days'] !== null) {
        $raw = $params['ttl_days'];
        if (is_int($raw)) {
            $ttl = $raw;
        } elseif (is_float($raw) && floor($raw) == $raw) {
            $ttl = (int) $raw;
        } elseif (is_string($raw) && ctype_digit($raw)) {
            $ttl = (int) $raw;
        } else {
            return ['status' => 422, 'body' => ['error' => 'Masa berlaku tidak valid (1–365 hari)']];
        }
        if ($ttl < 1 || $ttl > 365) {
            return ['status' => 422, 'body' => ['error' => 'Masa berlaku tidak valid (1–365 hari)']];
        }
    }
    $role = $caller['role'] ?? null;
    if (!in_array($role, ['superadmin', 'admin_cabang', 'trainer'], true)) {
        auditEvent('service_token_denied', $caller, 'service_token', null, ['reason' => 'role']);
        return ['status' => 403, 'body' => ['error' => 'Akses tidak diizinkan']];
    }
    // Scope binds user_id + role + cabang_id (+ trainer_id) from the
    // CALLER's session identity, never from the client body. The body
    // cabang_id is only an explicit scope-NARROWING that must stay within
    // the caller's own scope, else 403.
    $cabang = $caller['cabangId'] ?? null;
    if (array_key_exists('cabang_id', $params) && $params['cabang_id'] !== null && $params['cabang_id'] !== '') {
        $requested = $params['cabang_id'];
        if (!is_string($requested) || trim($requested) === '' || strlen($requested) > 191) {
            return ['status' => 422, 'body' => ['error' => 'Cabang tidak valid']];
        }
        $requested = trim($requested);
        if ($role !== 'superadmin' && $requested !== (string) ($cabang ?? '')) {
            auditEvent('service_token_denied', $caller, 'service_token', null, ['reason' => 'scope', 'cabangId' => $requested]);
            return ['status' => 403, 'body' => ['error' => 'Akses tidak diizinkan']];
        }
        $cabang = $requested;
    }
    $trainerId = ($role === 'trainer') ? ($caller['trainerId'] ?? null) : null;
    if ($trainerId !== null && !is_string($trainerId)) $trainerId = null;

    $pdo = database();
    $expiresAt = date('Y-m-d H:i:s', time() + $ttl * 86400);
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $prefix = serviceTokenRandomPrefix();
        $secret = serviceTokenNewSecret();
        $id = 'srv-' . bin2hex(random_bytes(8));
        try {
            $pdo->prepare('INSERT INTO service_tokens (id, prefix, token_hash, last4, user_id, role, cabang_id, trainer_id, name, expires_at, revoked_at, created_ip) VALUES (:id, :prefix, :hash, :last4, :uid, :role, :cabang, :trainer, :name, :exp, NULL, :ip)')
                ->execute([
                    ':id' => $id,
                    ':prefix' => $prefix,
                    ':hash' => serviceTokenHash($secret),
                    ':last4' => substr($secret, -4),
                    ':uid' => (string) ($caller['id'] ?? ''),
                    ':role' => $role,
                    ':cabang' => $cabang,
                    ':trainer' => $trainerId,
                    ':name' => $name,
                    ':exp' => $expiresAt,
                    ':ip' => $createdIp !== '' ? $createdIp : null,
                ]);
            auditEvent('service_token_minted', $caller, 'service_token', $id, ['prefix' => $prefix, 'name' => $name, 'expires_at' => $expiresAt]);
            return ['status' => 201, 'body' => ['token' => "aft_{$prefix}_{$secret}", 'prefix' => $prefix, 'expires_at' => $expiresAt]];
        } catch (PDOException $error) {
            if (!isDuplicate($error)) {
                return ['status' => 500, 'body' => ['error' => 'Gagal membuat token']];
            }
        }
    }
    return ['status' => 409, 'body' => ['error' => 'ID sudah tersimpan']];
}

function serviceTokenRevoke(array $caller, string $prefix): array {
    if (!preg_match('/^[A-Za-z0-9]{8}$/', $prefix)) {
        return ['status' => 422, 'body' => ['error' => 'Prefix token tidak valid']];
    }
    $pdo = database();
    $stmt = $pdo->prepare('SELECT id, user_id FROM service_tokens WHERE prefix = :prefix LIMIT 1');
    $stmt->execute([':prefix' => $prefix]);
    $row = $stmt->fetch();
    // Ruling 5: unknown prefix and non-owner non-superadmin share ONE 404
    // (no distinction, no enumeration); owner or superadmin revokes.
    $allowed = is_array($row)
        && (($row['user_id'] === ($caller['id'] ?? null)) || (($caller['role'] ?? null) === 'superadmin'));
    if (!$allowed) {
        auditEvent('service_token_denied', $caller, 'service_token', null, ['reason' => 'revoke_forbidden', 'prefix' => $prefix]);
        return ['status' => 404, 'body' => ['error' => 'Token tidak ditemukan']];
    }
    $pdo->prepare('UPDATE service_tokens SET revoked_at = NOW() WHERE prefix = :prefix')->execute([':prefix' => $prefix]);
    auditEvent('service_token_revoked', $caller, 'service_token', (string) $row['id'], ['prefix' => $prefix]);
    return ['status' => 200, 'body' => ['ok' => true, 'prefix' => $prefix]];
}
