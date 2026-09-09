<?php
declare(strict_types=1);
// Helper bersama untuk 4 entity master-data yang BISA diedit (sekolah,
// trainer, siswa, cabang) — beda dari insertLedger() di bootstrap.php yang
// append-only. Pakai optimistic concurrency lewat kolom `version` di schema
// — inilah yang bikin semantik 409 "record sudah diubah pihak lain" (M4.1
// VERIFY) beneran ada, bukan silent overwrite.
//
// SECURITY FIX (ditambahkan setelah ditemukan hilang total di versi asli):
// requireCsrf() dan auditEvent() sebelumnya TIDAK PERNAH dipanggil di
// masterWrite()/masterDelete() maupun di file pemanggilnya (siswa.php dkk).
// Ini regresi nyata dari kontrak M3.1/G0.2 yang sudah ditest 199+ checks
// lolos sebelumnya. requireCsrf() ditaruh di baris pertama tiap fungsi
// (sebelum apa pun yang state-changing dieksekusi), auditEvent() ditaruh
// di tiap titik keberhasilan (create/update/delete) dengan nama event yang
// SAMA PERSIS dengan yang sudah diverifikasi endpoint.protection.php
// sebelumnya ({entity}_created/_updated/_deleted) supaya test lama tetap
// bisa memverifikasi audit trail-nya tanpa perlu ganti nama event.

function masterFetch(PDO $pdo, string $table, string $id): ?array {
    $branchColumn = $table === 'cabang' ? 'NULL AS cabang_id' : 'cabang_id';
    $stmt = $pdo->prepare("SELECT id, {$branchColumn}, version, payload FROM {$table} WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $payload = json_decode($row['payload'], true);
    return [
        'id' => $row['id'],
        'cabangId' => $row['cabang_id'],
        'version' => (int) $row['version'],
        'payload' => is_array($payload) ? $payload : [],
    ];
}

function masterWrite(string $entity, array $user, bool $isCabang = false, ?array $record = null, array $overrides = [], string $action = 'create'): never {
    // FIX: was completely missing. Every other state-changing endpoint in
    // this codebase calls this before touching the DB — this one didn't.
    requireCsrf();

    $config = entityConfig($entity);
    $pdo = database();
    $record ??= requestJson();
    foreach ($overrides as $key => $value) {
        $record[$key] = $value;
    }

    if (!isset($record['id']) || !is_string($record['id']) || trim($record['id']) === '') {
        jsonResponse(['error' => 'Record membutuhkan id'], 422);
    }
    $id = trim($record['id']);

    $cabangId = $isCabang ? $id : (isset($record['cabangId']) && is_string($record['cabangId']) ? trim($record['cabangId']) : null);
    if (!$isCabang && $entity !== 'trainer' && ($cabangId === null || $cabangId === '')) {
        jsonResponse(['error' => 'Record membutuhkan cabangId'], 422);
    }

    $existing = masterFetch($pdo, $config['table'], $id);
    if ($action === 'update' && $existing === null) {
        jsonResponse(['error' => 'Record tidak ditemukan'], 422);
    }

    // Cek authorize() dua kali kalau ini update: terhadap cabang LAMA (gak
    // boleh sentuh record yang bukan milikmu) DAN cabang BARU (gak boleh
    // mindahin record ke/dari cabang yang bukan milikmu juga).
    if ($existing !== null) {
        $existingAuthData = $existing['payload'];
        $existingAuthData['id'] = $existing['id'];
        if (!$isCabang) $existingAuthData['cabangId'] = $existing['cabangId'];
        if (!authorize('write', $entity, $existingAuthData, $user)) {
            jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
        }
    }
    $authData = $record;
    if (!$isCabang) $authData['cabangId'] = $cabangId;
    if (!authorize('write', $entity, $authData, $user)) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }

    $clientVersion = isset($record['version']) ? (int) $record['version'] : null;
    $payloadJson = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($existing === null) {
        $newVersion = 1;
        $sql = $isCabang
            ? "INSERT INTO {$config['table']} (id, kode, nama, version, payload) VALUES (:id, :kode, :nama, :version, :payload)"
            : "INSERT INTO {$config['table']} (id, cabang_id, version, payload) VALUES (:id, :cabang_id, :version, :payload)";
        try {
            $stmt = $pdo->prepare($sql);
            $params = [':id' => $id, ':version' => $newVersion, ':payload' => $payloadJson];
            if ($isCabang) {
                $params[':kode'] = $record['kode'];
                $params[':nama'] = $record['nama'];
            } else {
                $params[':cabang_id'] = $cabangId;
            }
            $stmt->execute($params);
        } catch (PDOException $e) {
            if (isDuplicate($e)) jsonResponse(['error' => 'ID sudah dipakai, coba lagi'], 409);
            jsonResponse(['error' => 'Gagal menyimpan record'], 500);
        }
        // FIX: was completely missing — this is why cabang_created/
        // trainer_created/siswa_created rows vanished from audit_log.
        auditEvent("{$entity}_created", $user, $entity, $id, array_filter([
            'cabangId' => $isCabang ? null : $cabangId,
        ]));
        jsonResponse(array_merge($record, ['ok' => true, 'id' => $id, 'version' => $newVersion]), 201);
    }

    // Update — client WAJIB kirim version yang dia baca terakhir kali.
    // Beda -> 409, bukan ketimpa diam-diam.
    if ($clientVersion === null || $clientVersion !== $existing['version']) {
        jsonResponse([
            'error' => 'Konflik versi — record sudah diubah pihak lain',
            'currentVersion' => $existing['version'],
            'current' => $existing['payload'],
        ], 409);
    }

    $newVersion = $existing['version'] + 1;
    $sql = $isCabang
        ? "UPDATE {$config['table']} SET kode = :kode, nama = :nama, version = :version, payload = :payload WHERE id = :id AND version = :expected_version"
        : "UPDATE {$config['table']} SET cabang_id = :cabang_id, version = :version, payload = :payload WHERE id = :id AND version = :expected_version";
    $stmt = $pdo->prepare($sql);
    $params = [':id' => $id, ':version' => $newVersion, ':payload' => $payloadJson, ':expected_version' => $existing['version']];
    if ($isCabang) {
        $params[':kode'] = $record['kode'];
        $params[':nama'] = $record['nama'];
    } else {
        $params[':cabang_id'] = $cabangId;
    }
    $stmt->execute($params);

    if ($stmt->rowCount() === 0) {
        // Ada request lain yang menang race antara SELECT dan UPDATE ini.
        $latest = masterFetch($pdo, $config['table'], $id);
        jsonResponse([
            'error' => 'Konflik versi — record sudah diubah pihak lain',
            'currentVersion' => $latest['version'] ?? null,
            'current' => $latest['payload'] ?? null,
        ], 409);
    }

    // FIX: was completely missing.
    auditEvent("{$entity}_updated", $user, $entity, $id, array_filter([
        'cabangId' => $isCabang ? null : $cabangId,
    ]));
    jsonResponse(['ok' => true, 'id' => $id, 'version' => $newVersion, 'cabangId' => $isCabang ? null : $cabangId], 200);
}

function masterDelete(string $entity, array $user, bool $isCabang = false): never {
    // FIX: was completely missing.
    requireCsrf();

    $config = entityConfig($entity);
    $pdo = database();
    $body = requestJson();
    $id = isset($body['id']) && is_string($body['id']) ? trim($body['id']) : trim((string) ($_GET['id'] ?? ''));
    if ($id === '') jsonResponse(['error' => 'id dibutuhkan'], 422);

    $existing = masterFetch($pdo, $config['table'], $id);
    if ($existing === null) jsonResponse(['error' => 'Record tidak ditemukan'], 422);

    $authData = $existing['payload'];
    $authData['id'] = $existing['id'];
    if (!$isCabang) $authData['cabangId'] = $existing['cabangId'];
    if (!authorize('delete', $entity, $authData, $user)) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }

    if ($isCabang) {
        foreach (['sekolah', 'trainer', 'siswa', 'absensi', 'spp_payments', 'honor_payments', 'invoices'] as $table) {
            $stmt = $pdo->prepare("SELECT 1 FROM {$table} WHERE cabang_id = :cabang_id LIMIT 1");
            $stmt->execute([':cabang_id' => $id]);
            if ($stmt->fetchColumn() !== false) {
                jsonResponse(['error' => 'Cabang masih memiliki data terkait'], 422);
            }
        }
    }

    // D9.1 — users cascade. Deleting a cabang deactivates every active
    // user bound to it (users.cabang_id); deleting a trainer does the
    // same via users.trainer_id (this covers the trainer.php masterDelete
    // call sites — the UPDATE must share a transaction with the DELETE
    // below and run AFTER the authorize()/dependency checks above, so it
    // lives here rather than at the call site). Reference-preserving
    // (taste #35): only `active` and the dangling FK are touched — the
    // user row survives as a soft-deactivated account, mirroring
    // users.php deleteUser. Idempotent: `WHERE active = 1` means a re-run
    // matches zero rows. Privacy (taste #50): audit metadata carries ids
    // only, no username/display_name. Audit events fire AFTER the commit
    // so a rolled-back delete never leaves misleading audit rows
    // (users.php "audit only after the transaction commits" pattern);
    // one `user_cascade_deactivated` event per affected user, shaped
    // exactly like the existing `user_deactivated` event (users.php:347).
    $cascadeUsers = [];
    $cascadeColumn = $isCabang ? 'cabang_id' : ($entity === 'trainer' ? 'trainer_id' : null);

    try {
        $pdo->beginTransaction();
        if ($cascadeColumn !== null) {
            // FOR UPDATE closes the select-then-update race against a
            // concurrent users.php update re-activating a bound account
            // between the two statements.
            $sel = $pdo->prepare("SELECT id, cabang_id, trainer_id FROM users WHERE {$cascadeColumn} = :id AND active = 1 FOR UPDATE");
            $sel->execute([':id' => $id]);
            $cascadeUsers = $sel->fetchAll();
            if ($cascadeUsers !== []) {
                $pdo->prepare("UPDATE users SET active = 0, {$cascadeColumn} = NULL WHERE {$cascadeColumn} = :id AND active = 1")
                    ->execute([':id' => $id]);
            }
        }
        $pdo->prepare("DELETE FROM {$config['table']} WHERE id = :id")->execute([':id' => $id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log("masterDelete({$entity}) failed: " . $e->getMessage());
        jsonResponse(['error' => 'Gagal menghapus record'], 500);
    }

    foreach ($cascadeUsers as $cascadeUser) {
        auditEvent('user_cascade_deactivated', $user, 'user', (string) $cascadeUser['id'], array_filter([
            'cabangId' => $cascadeUser['cabang_id'],
            'trainerId' => $cascadeUser['trainer_id'],
        ]));
    }

    // FIX: was completely missing.
    auditEvent("{$entity}_deleted", $user, $entity, $id, array_filter([
        'cabangId' => $isCabang ? null : $existing['cabangId'],
    ]));
    jsonResponse(['ok' => true, 'id' => $id]);
}