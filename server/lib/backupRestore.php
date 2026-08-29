<?php
declare(strict_types=1);

// camelCase keys match the JSON shape already used elsewhere in this
// codebase for full-dataset payloads — see migrateIds() in constants.js,
// which reads/writes this exact same key set ('sekolah', 'trainer',
// 'siswa', 'absensi', 'honorPayments', 'sppPayments', 'invoices',
// 'cabang'). Keeping the same names here means a backup file is at least
// visually consistent with what the old v4 JSON shape looked like, even
// though this is a separate, self-contained backup feature (not the v4
// importer — that's M6.1's job).
const BACKUP_ENTITY_TABLES = [
    'cabang' => 'cabang',
    'sekolah' => 'sekolah',
    'trainer' => 'trainer',
    'siswa' => 'siswa',
    'absensi' => 'absensi',
    'sppPayments' => 'spp_payments',
    'honorPayments' => 'honor_payments',
    'invoices' => 'invoices',
    'settings' => 'settings',
];

// Deliberately EXCLUDED from backup/restore:
// - 'users': restoring would clobber password hashes/session-relevant
//   state for accounts that may have changed since the backup was taken
//   (including the superadmin doing the restore right now). Account
//   management needs its own dedicated flow, not a bulk JSON blob.
// - 'audit_log': append-only history, must never be overwritten.
// - 'photo_uploads': these are files on disk (storage_path), not just DB
//   rows — a real backup would need to archive the actual image files
//   too. Out of scope here; revisit once M5.2 (Secure photo storage)
//   defines where/how those files live. A restore right now would leave
//   attendance photo references pointing at files that may not exist.

function createBackupSnapshot(PDO $pdo): array {
    $snapshot = ['generatedAt' => date('c'), 'entities' => []];
    foreach (BACKUP_ENTITY_TABLES as $key => $table) {
        $rows = $pdo->query("SELECT payload FROM {$table}")->fetchAll();
        $snapshot['entities'][$key] = array_values(array_filter(array_map(
            static fn (array $row): mixed => json_decode($row['payload'], true),
            $rows
        ), static fn (mixed $r): bool => is_array($r)));
    }
    return $snapshot;
}

function backupStorageDir(): string {
    // One level up from server/, into a sibling 'private' directory — sits
    // outside whatever XAMPP/cPanel serves as document root in most
    // standard layouts. KNOWN GAP: not sufficient on its own — M5.1
    // (Harden HTTP security) still needs explicit deny rules (.htaccess /
    // server config) for this path once the real hosting document root is
    // confirmed (D7.1). Until M5.1 lands, treat this as defense-in-depth
    // (random filenames + auth-gated download endpoint), not a guarantee.
    $dir = __DIR__ . '/../../private/backups';
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
    }
    return realpath($dir) ?: $dir;
}

/** Writes a backup file to disk and records it in `backups`. */
function createBackup(PDO $pdo, array $actor): array {
    $snapshot = createBackupSnapshot($pdo);
    $json = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    $checksum = hash('sha256', $json);
    $id = 'bkp-' . date('Ymd-His') . '-' . substr(bin2hex(random_bytes(4)), 0, 7);
    $filename = $id . '.json';
    $path = backupStorageDir() . DIRECTORY_SEPARATOR . $filename;

    if (file_put_contents($path, $json) === false) {
        throw new RuntimeException('Gagal menulis file backup ke disk');
    }
    chmod($path, 0640);

    $pdo->prepare('INSERT INTO backups (id, checksum, location, created_by) VALUES (:id, :checksum, :location, :created_by)')
        ->execute([
            ':id' => $id,
            ':checksum' => $checksum,
            ':location' => $filename, // bare filename only — see backup-download.php's traversal guard
            ':created_by' => $actor['id'] ?? null,
        ]);

    auditEvent('backup_created', $actor, 'backups', $id, ['checksum' => $checksum, 'sizeBytes' => strlen($json)]);

    return ['id' => $id, 'checksum' => $checksum, 'path' => $path, 'json' => $json];
}

/**
 * Full replace, inside one transaction: deletes every row in each backed-
 * up table, then re-inserts from the snapshot. Hard replace, not a merge —
 * matches the UI's own warning ("Ini akan menimpa seluruh data saat ini").
 * `users`, `audit_log`, `photo_uploads` are never touched (see notes at
 * top of file). All entities are validated as present BEFORE any DELETE
 * runs, so a malformed file fails closed instead of partially wiping data.
 */
function restoreFromSnapshot(PDO $pdo, array $snapshot, array $actor): array {
    if (!isset($snapshot['entities']) || !is_array($snapshot['entities'])) {
        throw new InvalidArgumentException('File backup tidak valid: struktur "entities" tidak ditemukan');
    }
    foreach (BACKUP_ENTITY_TABLES as $key => $table) {
        if (!isset($snapshot['entities'][$key]) || !is_array($snapshot['entities'][$key])) {
            throw new InvalidArgumentException("File backup tidak valid: entity '$key' hilang atau bukan array");
        }
    }

    $counts = [];
    $pdo->beginTransaction();
    try {
        // No FK constraints in schema.sql (JSON-payload tables, no
        // REFERENCES), so delete order doesn't matter here.
        foreach (BACKUP_ENTITY_TABLES as $table) {
            $pdo->exec("DELETE FROM {$table}");
        }

        foreach (BACKUP_ENTITY_TABLES as $key => $table) {
            $records = $snapshot['entities'][$key];
            foreach ($records as $record) {
                if (!is_array($record) || !isset($record['id'])) continue; // skip malformed rows, don't abort whole restore
                $id = (string) $record['id'];
                $payload = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

                if ($key === 'cabang') {
                    $pdo->prepare('INSERT INTO cabang (id, kode, nama, payload) VALUES (:id, :kode, :nama, :payload)')
                        ->execute([
                            ':id' => $id,
                            ':kode' => (string) ($record['kode'] ?? ''),
                            ':nama' => (string) ($record['nama'] ?? ''),
                            ':payload' => $payload,
                        ]);
                } elseif ($key === 'honorPayments') {
                    $pdo->prepare('INSERT INTO honor_payments (id, cabang_id, correction_of, payload) VALUES (:id, :cabang_id, :correction_of, :payload)')
                        ->execute([
                            ':id' => $id,
                            ':cabang_id' => $record['cabangId'] ?? null,
                            ':correction_of' => $record['correctionOf'] ?? null,
                            ':payload' => $payload,
                        ]);
                } else {
                    $pdo->prepare("INSERT INTO {$table} (id, cabang_id, payload) VALUES (:id, :cabang_id, :payload)")
                        ->execute([
                            ':id' => $id,
                            ':cabang_id' => $record['cabangId'] ?? null,
                            ':payload' => $payload,
                        ]);
                }
            }
            $counts[$key] = count($records);
        }

        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }

    auditEvent('data_restored', $actor, 'backups', null, ['counts' => $counts]);

    return $counts;
}