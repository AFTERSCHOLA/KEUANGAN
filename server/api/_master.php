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

    // D9.1 — deactivate any login account tied to this record BEFORE the
    // record itself is deleted, so no session can survive it. Placed
    // after the existing "still has related data" guard (cabang), so
    // this only fires when the delete is actually about to succeed.
    if ($isCabang) {
        cascadeDeactivateUsers('cabang_id', $id, $user);
    } elseif ($entity === 'trainer') {
        cascadeDeactivateUsers('trainer_id', $id, $user);
    }

    $stmt = $pdo->prepare("DELETE FROM {$config['table']} WHERE id = :id");
    $stmt->execute([':id' => $id]);

    // FIX: was completely missing.
    auditEvent("{$entity}_deleted", $user, $entity, $id, array_filter([
        'cabangId' => $isCabang ? null : $existing['cabangId'],
    ]));
    jsonResponse(['ok' => true, 'id' => $id]);
}

// D9.1 — cascade deactivate any login accounts tied to a cabang/trainer
// right before it's deleted, so a session can never outlive the record
// it's scoped to. Mirrors cascadeStripTrainerFromSekolahReverseLinks()'s
// best-effort, idempotent, audit-trailed pattern (trainer.php). The
// "AND active = 1" clause makes this a no-op on re-run — nothing left
// to deactivate the second time.
function cascadeDeactivateUsers(string $column, string $id, array $actor): void {
    if ($id === '') return;
    $pdo = database();

    $stmt = $pdo->prepare("SELECT id FROM users WHERE {$column} = :id AND active = 1");
    $stmt->execute([':id' => $id]);
    $affected = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (empty($affected)) return;

    $update = $pdo->prepare(
        "UPDATE users SET active = 0, {$column} = NULL WHERE {$column} = :id AND active = 1"
    );
    $update->execute([':id' => $id]);

    foreach ($affected as $userId) {
        auditEvent('user_cascade_deactivated', $actor, 'user', $userId, [$column => $id]);
    }
}