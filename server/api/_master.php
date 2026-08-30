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
    $stmt = $pdo->prepare("SELECT id, cabang_id, version, payload FROM {$table} WHERE id = :id");
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

function masterWrite(string $entity, array $user, bool $isCabang = false, ?array $record = null, array $overrides = []): never {
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
    $wasCreate = $existing === null;

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
            ? "INSERT INTO {$config['table']} (id, version, payload) VALUES (:id, :version, :payload)"
            : "INSERT INTO {$config['table']} (id, cabang_id, version, payload) VALUES (:id, :cabang_id, :version, :payload)";
        try {
            $stmt = $pdo->prepare($sql);
            $params = [':id' => $id, ':version' => $newVersion, ':payload' => $payloadJson];
            if (!$isCabang) $params[':cabang_id'] = $cabangId;
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
        jsonResponse(['ok' => true, 'id' => $id, 'version' => $newVersion], 201);
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
    $sql = "UPDATE {$config['table']} SET " . (!$isCabang ? 'cabang_id = :cabang_id, ' : '') . "version = :version, payload = :payload WHERE id = :id AND version = :expected_version";
    $stmt = $pdo->prepare($sql);
    $params = [':id' => $id, ':version' => $newVersion, ':payload' => $payloadJson, ':expected_version' => $existing['version']];
    if (!$isCabang) $params[':cabang_id'] = $cabangId;
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
    jsonResponse(['ok' => true, 'id' => $id, 'version' => $newVersion], 200);
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
    if ($existing === null) jsonResponse(['error' => 'Record tidak ditemukan'], 404);

    $authData = $existing['payload'];
    $authData['id'] = $existing['id'];
    if (!$isCabang) $authData['cabangId'] = $existing['cabangId'];
    if (!authorize('delete', $entity, $authData, $user)) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }

    $stmt = $pdo->prepare("DELETE FROM {$config['table']} WHERE id = :id");
    $stmt->execute([':id' => $id]);

    // FIX: was completely missing.
    auditEvent("{$entity}_deleted", $user, $entity, $id, array_filter([
        'cabangId' => $isCabang ? null : $existing['cabangId'],
    ]));
    jsonResponse(['ok' => true, 'id' => $id]);
}