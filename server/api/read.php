<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

// M4.1/M3.1: dulu endpoint ini dump seluruh tabel tanpa filter apapun —
// lubang security (semua cabang, semua trainer, bisa baca data siapa
// saja). Sekarang tiap record dicek lewat authorize() atau discope lewat
// cabang_id di level SQL sebelum masuk response.
//
// 401 — no session, no data.
$user = requireAuthenticatedUser();

$entity = $_GET['entity'] ?? null;
$allEntities = [
    'absensi', 'sppPayments', 'honorPayments', 'settings', 'invoices',
    'sekolah', 'trainer', 'siswa', 'cabang',
];

// Validate the entity name itself first (400) before any permission check,
// so an unknown ?entity= never leaks a 403 vs 400 distinction about
// entities that don't exist.
if ($entity !== null) {
    entityConfig($entity); // jsonResponse(400)'s on an unsupported name.
}

// 403 — a valid entity this role has zero access to, requested explicitly.
// Superadmin short-circuits true inside roleCanReadEntity().
if ($entity !== null && !roleCanReadEntity($user['role'], $entity)) {
    jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
}

$entities = $entity ? [$entity] : $allEntities;
$pdo = database();
$output = [];

// siswa has no cabang_id-derived-from-itself relationship trainerOwnsRecord
// can use directly — it needs the OWNING school's assigned trainerIds
// (siswa.sekolahId -> sekolah.trainerIds). Precompute once, only if a
// trainer might need it (siswa is in scope AND role is trainer) — avoids
// an unnecessary query for every other role/entity combination.
/**
 * TA.A.3 — assignment scope.
 *
 * Scope trainer/asisten tidak boleh dipercaya dari payload request.
 * Ambil seluruh assignment dari trainer payload yang tersimpan di DB,
 * lalu bentuk index:
 *
 *   sekolahId => [trainerId, asistenId, ...]
 *
 * Dengan begitu:
 * - instruktur mendapat sekolah yang memang ditugaskan kepadanya;
 * - asisten juga mendapat sekolah tempat dia ditugaskan;
 * - ID trainer lain dari request tidak bisa dipakai untuk bypass scope.
 */
$sekolahTrainerIds = [];

if (
    $user['role'] === 'trainer'
    && (
        in_array('siswa', $entities, true)
        || in_array('sekolah', $entities, true)
        || in_array('sppPayments', $entities, true)
    )
) {
    $sekolahRows = $pdo
        ->query('SELECT payload FROM sekolah ORDER BY created_at, id')
        ->fetchAll();

    foreach ($sekolahRows as $row) {
        $sekolahPayload = json_decode($row['payload'], true);

        if (!is_array($sekolahPayload)) {
            continue;
        }

        $sekolahId = $sekolahPayload['id'] ?? null;

        if (!is_string($sekolahId) || trim($sekolahId) === '') {
            continue;
        }

        $assignments = $sekolahPayload['penugasanPengajar'] ?? [];

        if (!is_array($assignments)) {
            continue;
        }

        foreach ($assignments as $assignment) {
            if (!is_array($assignment)) {
                continue;
            }

            foreach (['trainerId', 'asistenId'] as $field) {
                $assignedId = $assignment[$field] ?? null;

                if (!is_string($assignedId) || trim($assignedId) === '') {
                    continue;
                }

                $sekolahTrainerIds[$sekolahId][] = trim($assignedId);
            }
        }
    }

    foreach ($sekolahTrainerIds as $sekolahId => $trainerIds) {
        $sekolahTrainerIds[$sekolahId] = array_values(
            array_unique($trainerIds)
        );
    }
}

// sppPayments butuh 1 hop tambahan: siswaId -> sekolahId. Precompute
// sekali di sini juga, sama alasannya kayak $sekolahTrainerIds di atas —
// hindari query berulang per-record di loop filter di bawah.
$siswaSekolahId = [];
if ($user['role'] === 'trainer' && in_array('sppPayments', $entities, true)) {
    $siswaRows = $pdo->query('SELECT payload FROM siswa ORDER BY created_at, id')->fetchAll();
    foreach ($siswaRows as $row) {
        $sw = json_decode($row['payload'], true);
        if (is_array($sw) && isset($sw['id'])) {
            $siswaSekolahId[$sw['id']] = $sw['sekolahId'] ?? null;
        }
    }
}

foreach ($entities as $name) {
    // Bulk mode (?entity= omitted): entities this role can't read at all
    // come back as an empty list rather than a 403 — matches the "return
    // everything you're allowed to see" shape bulk mode implies.
    if (!roleCanReadEntity($user['role'], $name)) {
        $output[$name] = [];
        continue;
    }

    $config = entityConfig($name);

$selectCols = $name === 'honorPayments'
    ? 'payload, version, correction_of'
    : 'payload, version';

if ($user['role'] === 'superadmin') {
    $rows = $pdo->query("SELECT {$selectCols} FROM {$config['table']} ORDER BY created_at, id")->fetchAll();
} elseif ($name === 'cabang') {
    // cabang has no cabang_id column pointing at itself
    $rows = $pdo->query("SELECT {$selectCols} FROM {$config['table']} ORDER BY created_at, id")->fetchAll();
} else {
    $cabangId = $user['cabangId'] ?? null;

    if ($user['role'] === 'admin_cabang' && (!is_string($cabangId) || $cabangId === '')) {
        $output[$name] = [];
        continue;
    }

    if ($user['role'] === 'admin_cabang') {
        $stmt = $pdo->prepare(
            "SELECT {$selectCols} FROM {$config['table']}
             WHERE cabang_id = :cabang_id
             ORDER BY created_at, id"
        );
        $stmt->execute([':cabang_id' => $cabangId]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query(
            "SELECT {$selectCols} FROM {$config['table']} ORDER BY created_at, id"
        )->fetchAll();
    }
}

    $records = array_values(array_filter(array_map(
    static function (array $row) use ($name): array {
        $payload = json_decode($row['payload'], true);

        if (!is_array($payload)) {
            return ['__invalid' => true];
        }

        $payload['version'] = (int) $row['version'];

        // correction_of disimpan di kolom SQL terpisah,
        // jadi harus dikembalikan ke bentuk correctionOf
        // supaya frontend tahu bahwa record ini adalah koreksi
        // dari entry pembayaran sebelumnya.
        if (
            $name === 'honorPayments'
            && array_key_exists('correction_of', $row)
            && $row['correction_of'] !== null
        ) {
            $payload['correctionOf'] = $row['correction_of'];
        }

        return $payload;
    },
    $rows
), static fn (mixed $record): bool =>
    is_array($record) && !($record['__invalid'] ?? false)
));

    // Admin Cabang (non-cabang entities) and Superadmin are already fully
    // covered by the query above. Everyone else needs a per-record
    // authorize() check: Admin Cabang reading 'cabang' itself (self-match
    // against their own branch id), and Trainer for every entity (trainer
    // is assignment-based, not branch-based — e.g. absensi.trainerId must
    // match, sekolah.trainerIds must contain them, siswa needs the indirect
    // sekolah lookup precomputed above).
    if (
    $user['role'] === 'trainer'
    || ($user['role'] === 'admin_cabang' && $name === 'cabang')
) {
    $records = array_values(array_filter(
        $records,
        static function (array $record) use (
    $name,
    $user,
    $sekolahTrainerIds,
    $siswaSekolahId
): bool {
    $authorizationRecord = $record;

    if ($name === 'sekolah' && $user['role'] === 'trainer') {
    $sekolahId = $record['id'] ?? null;

    $authorizationRecord['_sekolahTrainerIds'] =
        $sekolahTrainerIds[$sekolahId] ?? [];
}

    if ($name === 'siswa') {
        $sekolahId = $record['sekolahId'] ?? null;

        $authorizationRecord['_sekolahTrainerIds'] =
            $sekolahTrainerIds[$sekolahId] ?? [];
    }

    if ($name === 'sppPayments') {
        $sekolahId =
            $siswaSekolahId[$record['siswaId'] ?? null] ?? null;

        $authorizationRecord['_sekolahTrainerIds'] =
            $sekolahTrainerIds[$sekolahId] ?? [];
    }

    return authorize(
        'read',
        $name,
        $authorizationRecord,
        $user
    );
}
    ));
}

    $output[$name] = $records;
}

jsonResponse($entity ? ($output[$entity] ?? []) : $output);