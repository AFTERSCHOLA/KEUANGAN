<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/_master.php';

// ============================================================
// M-U1 — User Provisioning endpoint (USER_PROVISIONING.md D2+D3+D8+D9)
//
// Single endpoint for:
//   - Super Admin: create Branch Admin + create Trainer (with login account)
//   - Branch Admin: create Trainer (with login account, own branch only)
//
// Single source of truth for password policy, username uniqueness,
// branch scoping, and audit events. All state-changing endpoints in this
// codebase lead with requireCsrf() (regression noted in _master.php
// comment lines 9-18 — never omit it).
// ============================================================

$user = requireAuthenticatedUser();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    requireCsrf();
    $data = requestJson();
    $action = $data['action'] ?? 'create';
    handleUserAction($action, $data, $user);
} else {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

function handleUserAction(string $action, array $data, array $user): never {
    if (!in_array($action, ['create', 'update', 'delete', 'reset_password'], true)) {
        jsonResponse(['error' => 'Operasi tidak didukung'], 400);
    }

    $role = $user['role'] ?? null;
    if (!in_array($role, ['superadmin', 'admin_cabang'], true)) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }

    if ($action === 'create') {
        createUser($data, $user);
    } elseif ($action === 'update') {
        updateUser($data, $user);
    } elseif ($action === 'delete') {
        deleteUser($data, $user);
    } else {
        resetUserPassword($data, $user);
    }
}

function createUser(array $data, array $user): never {
    $role = $user['role'];
    $actorCabangId = $user['cabangId'] ?? null;

    // ---- 1. Validate body shape ----
    $targetRole = $data['role'] ?? null;
    if (!in_array($targetRole, ['admin_cabang', 'trainer'], true)) {
        jsonResponse(['error' => 'Role yang didukung hanya admin_cabang atau trainer'], 422);
    }

    $username = isset($data['username']) && is_string($data['username']) ? trim($data['username']) : '';
    if ($username === '' || !preg_match('/^[a-zA-Z0-9_.-]{3,64}$/', $username)) {
        jsonResponse(['error' => 'Username harus 3-64 karakter, hanya huruf/angka/garis-bawah/titik/strip'], 422);
    }

    $displayName = isset($data['displayName']) && is_string($data['displayName']) ? trim($data['displayName']) : '';
    if ($displayName === '') jsonResponse(['error' => 'Nama tampilan wajib diisi'], 422);

    // ---- 2. Branch scoping per role ----
    // Session is the authority for branch assignment, never the client.
    // Mirrors server/api/trainer.php:20-33 — Branch Admin's session.cabangId
    // IS the trainer's branch; any client-supplied cabangId is rejected
    // outright so DevTools tampering can't bypass branch scoping.
    // Super Admin has no session.cabangId, so they must supply one.
    if ($role === 'admin_cabang') {
        if ($targetRole !== 'trainer') {
            jsonResponse(['error' => 'Admin Cabang hanya dapat membuat akun trainer'], 403);
        }
        if (array_key_exists('cabangId', $data)) {
            jsonResponse(['error' => 'cabangId tidak boleh dikirim'], 422);
        }
        $cabangId = $actorCabangId;
        if (!is_string($cabangId) || $cabangId === '') {
            jsonResponse(['error' => 'Sesi Admin Cabang tidak memiliki cabangId'], 403);
        }
    } else {
        $cabangId = isset($data['cabangId']) && is_string($data['cabangId']) ? trim($data['cabangId']) : '';
        if ($cabangId === '') jsonResponse(['error' => 'cabangId wajib diisi'], 422);
        $check = database()->prepare('SELECT 1 FROM cabang WHERE id = :id');
        $check->execute([':id' => $cabangId]);
        if ($check->fetchColumn() === false) {
            jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
        }
    }

    // ---- 3. Trainer-record creation (atomic with the account) ----
    $trainerRecord = null;
    if ($targetRole === 'trainer') {
        $trainerPayload = isset($data['trainer']) && is_array($data['trainer']) ? $data['trainer'] : [];
        $trainerRecord = createTrainerRecord($trainerPayload, $cabangId);
        if ($trainerRecord === null) {
            jsonResponse(['error' => 'Gagal membuat record trainer (nama wajib diisi)'], 422);
        }
    }

    // ---- 4. Username uniqueness check (proactive, friendly error) ----
    $existing = database()->prepare('SELECT id, display_name FROM users WHERE username = :u LIMIT 1');
    $existing->execute([':u' => $username]);
    $dup = $existing->fetch();
    if ($dup !== false) {
        // Rollback the trainer record we just created so we don't leave orphans.
        if ($trainerRecord !== null) {
            rollbackTrainerRecord($trainerRecord['id'], $trainerRecord['sekolahIds']);
        }
        jsonResponse(['error' => "Username \"$username\" sudah dipakai oleh \"{$dup['display_name']}\". Pilih username lain."], 422);
    }

    // ---- 5. Generate initial password + hash ----
    $initialPassword = generateInitialPassword();
    requirePasswordPolicy($initialPassword); // sanity-check, should always pass
    $passwordHash = password_hash($initialPassword, PASSWORD_DEFAULT);

    // ---- 6. Insert user atomically ----
    $pdo = database();
    $pdo->beginTransaction();
    try {
        $userId = 'usr-' . bin2hex(random_bytes(12));
        $stmt = $pdo->prepare(
            'INSERT INTO users (id, username, display_name, password_hash, role, cabang_id, trainer_id, active, must_change_password)
             VALUES (:id, :username, :display_name, :password_hash, :role, :cabang_id, :trainer_id, 1, 1)'
        );
        $stmt->execute([
            ':id' => $userId,
            ':username' => $username,
            ':display_name' => $displayName,
            ':password_hash' => $passwordHash,
            ':role' => $targetRole,
            ':cabang_id' => $cabangId,
            ':trainer_id' => $trainerRecord !== null ? $trainerRecord['id'] : null,
        ]);

        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        if ($trainerRecord !== null) {
            rollbackTrainerRecord($trainerRecord['id'], $trainerRecord['sekolahIds']);
        }
        if (isDuplicate($e)) {
            jsonResponse(['error' => 'Username atau trainer_id bentrok dengan data yang ada'], 422);
        }
        jsonResponse(['error' => 'Gagal membuat akun'], 500);
    }

    // ---- 7. Audit only after the transaction commits ----
    if ($trainerRecord !== null) {
        auditEvent('trainer_created', $user, 'trainer', $trainerRecord['id'], ['cabangId' => $cabangId]);
    }
    auditEvent('user_created', $user, 'user', $userId, array_filter([
        'cabangId' => $cabangId,
        'trainerId' => $trainerRecord !== null ? $trainerRecord['id'] : null,
        'role' => $targetRole,
    ]));

    $response = [
        'ok' => true,
        'user' => [
            'id' => $userId,
            'username' => $username,
            'displayName' => $displayName,
            'role' => $targetRole,
            'cabangId' => $cabangId,
            'trainerId' => $trainerRecord !== null ? $trainerRecord['id'] : null,
            'active' => true,
            'mustChangePassword' => true,
        ],
        'initialPassword' => $initialPassword,
    ];
    if ($trainerRecord !== null) $response['trainer'] = $trainerRecord;
    jsonResponse($response, 201);
}

function createTrainerRecord(array $payload, string $cabangId): ?array {
    // Mirrors the validation done in trainer.php, minus the HTTP layer.
    // Returns null on validation failure; the caller maps that to a 422.
    $name = isset($payload['nama']) && is_string($payload['nama']) ? trim($payload['nama']) : '';
    if ($name === '') return null;

    // Generate branch-prefixed trainer id using the same generator shape as
    // constants.js (generateId('trn', cabangKode)).
    $cabangKode = '';
    $stmt = database()->prepare('SELECT kode FROM cabang WHERE id = :id');
    $stmt->execute([':id' => $cabangId]);
    $row = $stmt->fetch();
    if ($row !== false) $cabangKode = strtoupper(trim((string) $row['kode']));

    $branch = $cabangKode !== '' ? ($cabangKode . '-') : '';
    $trainerId = 'trn-' . $branch . (string) time() . '-' . substr(bin2hex(random_bytes(4)), 0, 7);

    $wa = isset($payload['wa']) && is_string($payload['wa']) ? trim($payload['wa']) : '';
    $jadwal = isset($payload['jadwal']) && is_string($payload['jadwal']) ? trim($payload['jadwal']) : '';
    $honor = isset($payload['honor']) ? (int) $payload['honor'] : 0;
    $sekolahIds = isset($payload['sekolahIds']) && is_array($payload['sekolahIds']) ? array_values(array_filter($payload['sekolahIds'], 'is_string')) : [];

    $record = [
        'id' => $trainerId,
        'nama' => $name,
        'wa' => $wa,
        'jadwal' => $jadwal,
        'honor' => $honor,
        'sekolahIds' => $sekolahIds,
        'cabangId' => $cabangId,
    ];

    try {
        $stmt = database()->prepare(
            'INSERT INTO trainer (id, cabang_id, version, payload) VALUES (:id, :cabang_id, 1, :payload)'
        );
        $stmt->execute([
            ':id' => $trainerId,
            ':cabang_id' => $cabangId,
            ':payload' => json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
    } catch (PDOException $e) {
        if (isDuplicate($e)) return null;
        return null;
    }

    // Idempotent reverse-link: push trainerId into sekolah.trainerIds[].
    if (!empty($sekolahIds)) {
        foreach ($sekolahIds as $sekolahId) {
            try {
                $sel = database()->prepare('SELECT payload FROM sekolah WHERE id = :id AND cabang_id = :cab');
                $sel->execute([':id' => $sekolahId, ':cab' => $cabangId]);
                $row = $sel->fetch();
                if ($row === false) continue;
                $payloadRow = json_decode((string) $row['payload'], true);
                if (!is_array($payloadRow)) continue;
                $trainerIds = isset($payloadRow['trainerIds']) && is_array($payloadRow['trainerIds']) ? $payloadRow['trainerIds'] : [];
                if (!in_array($trainerId, $trainerIds, true)) $trainerIds[] = $trainerId;
                $payloadRow['trainerIds'] = $trainerIds;
                $upd = database()->prepare('UPDATE sekolah SET payload = :payload WHERE id = :id');
                $upd->execute([':payload' => json_encode($payloadRow, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $sekolahId]);
            } catch (Throwable $e) {
                // best-effort reverse link — log via audit but don't fail the whole create
                continue;
            }
        }
    }

    // Note: trainer_created audit is emitted by the caller AFTER the parent
    // user_created transaction commits. Emitting here would create a misleading
    // audit row if a later step (username dupe, FK error) fails and we roll back.
    return $record;
}

// Roll back a trainer record created earlier in the same request when a later
// step fails (duplicate username, FK violation, etc.). Removes the trainer
// row AND undoes the sekolah.trainerIds[] reverse-links so no orphans remain.
function rollbackTrainerRecord(string $trainerId, array $sekolahIds): void {
    $pdo = database();
    foreach ($sekolahIds as $sekolahId) {
        try {
            $sel = $pdo->prepare('SELECT payload FROM sekolah WHERE id = :id');
            $sel->execute([':id' => $sekolahId]);
            $row = $sel->fetch();
            if ($row === false) continue;
            $payloadRow = json_decode((string) $row['payload'], true);
            if (!is_array($payloadRow)) continue;
            $trainerIds = isset($payloadRow['trainerIds']) && is_array($payloadRow['trainerIds']) ? $payloadRow['trainerIds'] : [];
            $trainerIds = array_values(array_filter($trainerIds, fn($t) => $t !== $trainerId));
            $payloadRow['trainerIds'] = $trainerIds;
            $upd = $pdo->prepare('UPDATE sekolah SET payload = :payload WHERE id = :id');
            $upd->execute([':payload' => json_encode($payloadRow, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':id' => $sekolahId]);
        } catch (Throwable $e) {
            continue;
        }
    }
    try {
        $pdo->prepare('DELETE FROM trainer WHERE id = :id')->execute([':id' => $trainerId]);
    } catch (Throwable $e) {
        // best-effort
    }
}

function updateUser(array $data, array $user): never {
    $role = $user['role'];
    $actorCabangId = $user['cabangId'] ?? null;

    $userId = isset($data['id']) && is_string($data['id']) ? trim($data['id']) : '';
    if ($userId === '') jsonResponse(['error' => 'id wajib diisi'], 422);

    $pdo = database();
    $stmt = $pdo->prepare('SELECT id, username, display_name, role, cabang_id, trainer_id, active FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $existing = $stmt->fetch();
    if ($existing === false) jsonResponse(['error' => 'User tidak ditemukan'], 422);

    if ($role === 'admin_cabang' && ($existing['cabang_id'] !== $actorCabangId || $existing['role'] !== 'trainer')) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }

    $updates = [];
    $params = [':id' => $userId];

    if (isset($data['displayName']) && is_string($data['displayName']) && trim($data['displayName']) !== '') {
        $updates[] = 'display_name = :display_name';
        $params[':display_name'] = trim($data['displayName']);
    }
    if (array_key_exists('active', $data)) {
        $updates[] = 'active = :active';
        $params[':active'] = $data['active'] ? 1 : 0;
    }

    if (empty($updates)) jsonResponse(['error' => 'Tidak ada field yang diubah'], 422);

    $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id');
    $stmt->execute($params);

    auditEvent('user_updated', $user, 'user', $userId, array_filter([
        'cabangId' => $existing['cabang_id'],
        'fields' => array_keys($params),
    ]));

    jsonResponse(['ok' => true, 'id' => $userId]);
}

function deleteUser(array $data, array $user): never {
    $role = $user['role'];
    $actorCabangId = $user['cabangId'] ?? null;

    $userId = isset($data['id']) && is_string($data['id']) ? trim($data['id']) : '';
    if ($userId === '') jsonResponse(['error' => 'id wajib diisi'], 422);

    $pdo = database();
    $stmt = $pdo->prepare('SELECT id, role, cabang_id, trainer_id FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $existing = $stmt->fetch();
    if ($existing === false) jsonResponse(['error' => 'User tidak ditemukan'], 422);

    if ($role === 'admin_cabang' && ($existing['cabang_id'] !== $actorCabangId || $existing['role'] !== 'trainer')) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }

    $pdo->prepare('UPDATE users SET active = 0 WHERE id = :id')->execute([':id' => $userId]);

    auditEvent('user_deactivated', $user, 'user', $userId, array_filter([
        'cabangId' => $existing['cabang_id'],
        'trainerId' => $existing['trainer_id'],
    ]));

    jsonResponse(['ok' => true, 'id' => $userId]);
}

function resetUserPassword(array $data, array $user): never {
    $role = $user['role'];
    $actorCabangId = $user['cabangId'] ?? null;

    $userId = isset($data['id']) && is_string($data['id']) ? trim($data['id']) : '';
    if ($userId === '') jsonResponse(['error' => 'id wajib diisi'], 422);

    $pdo = database();
    $stmt = $pdo->prepare('SELECT id, role, cabang_id FROM users WHERE id = :id AND active = 1 LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $existing = $stmt->fetch();
    if ($existing === false) jsonResponse(['error' => 'User tidak ditemukan atau nonaktif'], 422);

    if ($role === 'admin_cabang' && ($existing['cabang_id'] !== $actorCabangId || $existing['role'] !== 'trainer')) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }

    $newPassword = generateInitialPassword();
    requirePasswordPolicy($newPassword);

    $pdo->prepare(
        'UPDATE users SET password_hash = :h, must_change_password = 1, failed_login_count = 0, locked_until = NULL WHERE id = :id'
    )->execute([':h' => password_hash($newPassword, PASSWORD_DEFAULT), ':id' => $userId]);

    auditEvent('user_password_reset', $user, 'user', $userId, ['cabangId' => $existing['cabang_id']]);

    jsonResponse([
        'ok' => true,
        'id' => $userId,
        'initialPassword' => $newPassword,
    ]);
}

// 16 chars, mixed case + digit, satisfies requirePasswordPolicy().
function generateInitialPassword(): string {
    $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    $lower = 'abcdefghjkmnpqrstuvwxyz';
    $digits = '23456789';
    $all = $upper . $lower . $digits;
    $len = 16;
    $out = '';
    $out .= $upper[random_int(0, strlen($upper) - 1)];
    $out .= $lower[random_int(0, strlen($lower) - 1)];
    $out .= $digits[random_int(0, strlen($digits) - 1)];
    for ($i = 3; $i < $len; $i++) {
        $out .= $all[random_int(0, strlen($all) - 1)];
    }
    return str_shuffle($out);
}