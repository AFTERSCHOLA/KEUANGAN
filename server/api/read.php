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
$sekolahTrainerIds = [];
$siswaSekolahIds = [];
$invoiceSekolahIds = [];

if (
    $user['role'] === 'trainer'
    && (
        in_array('siswa', $entities, true)
        || in_array('sppPayments', $entities, true)
    )
) {
    $sekolahRows = $pdo->query(
        'SELECT payload FROM sekolah ORDER BY created_at, id'
    )->fetchAll();

    foreach ($sekolahRows as $row) {
        $sch = json_decode($row['payload'], true);

        if (is_array($sch) && isset($sch['id'])) {
            $sekolahTrainerIds[$sch['id']] = $sch['trainerIds'] ?? [];
        }
    }

    $siswaRows = $pdo->query(
        'SELECT payload FROM siswa ORDER BY created_at, id'
    )->fetchAll();

    foreach ($siswaRows as $row) {
        $student = json_decode($row['payload'], true);

        if (is_array($student) && isset($student['id'])) {
            $siswaSekolahIds[$student['id']] = $student['sekolahId'] ?? null;
        }
    }

    // Invoice-level SPP payment bisa tidak punya siswaId.
    // Jadi ownership trainer harus bisa ditentukan dari invoice -> sekolah.
    if (in_array('sppPayments', $entities, true)) {
        $invoiceRows = $pdo->query(
            'SELECT payload FROM invoices ORDER BY created_at, id'
        )->fetchAll();

        foreach ($invoiceRows as $row) {
            $invoice = json_decode($row['payload'], true);

            if (is_array($invoice) && isset($invoice['id'])) {
                $invoiceSekolahIds[$invoice['id']] = $invoice['sekolahId'] ?? null;
            }
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

    if ($user['role'] === 'superadmin') {
        $rows = $pdo->query("SELECT payload, version FROM {$config['table']} ORDER BY created_at, id")->fetchAll();
    } elseif ($name === 'cabang') {
        // cabang has no cabang_id column pointing at itself — its own `id`
        // IS the branch id (see recordOwnsBranch() in authorize.php). Admin
        // Cabang can only ever see their own branch record; Trainer has no
        // branch-column to scope by here either, so this falls through to
        // the same per-record authorize() check as everyone non-superadmin.
        $rows = $pdo->query("SELECT payload, version FROM {$config['table']} ORDER BY created_at, id")->fetchAll();
    } else {
        // cabang_id is a real column on the other tables — scope at the SQL
        // level first (branch-level, coarse-grained) before any per-record
        // authorize() check below. A caller with no branch context (should
        // never happen post-login, but fail closed rather than assume) gets
        // nothing instead of an unscoped query.
        $cabangId = $user['cabangId'] ?? null;
        if ($user['role'] === 'admin_cabang' && (!is_string($cabangId) || $cabangId === '')) {
            $output[$name] = [];
            continue;
        }
        if ($user['role'] === 'admin_cabang') {
            $stmt = $pdo->prepare("SELECT payload, version FROM {$config['table']} WHERE cabang_id = :cabang_id ORDER BY created_at, id");
            $stmt->execute([':cabang_id' => $cabangId]);
            $rows = $stmt->fetchAll();
        } else {
            // Trainer: no reliable cabang_id column to pre-filter by (trainer
            // assignment is school-based, not branch-based) — pull the full
            // table and let the per-record authorize() check below do the
            // filtering, same as before M4.1.
            $rows = $pdo->query("SELECT payload, version FROM {$config['table']} ORDER BY created_at, id")->fetchAll();
        }
    }

    $records = array_values(array_filter(array_map(
        static function (array $row) use ($name): array {
            $payload = json_decode($row['payload'], true);
            if (!is_array($payload)) return ['__invalid' => true];
            // M-MAS4.2: surface the SQL-side `version` column alongside the
            // payload so subsequent writeRemote() UPDATE calls can echo it
            // back to masterWrite(). masterWrite() (server/api/_master.php:111)
            // returns 409 unless $clientVersion === $existing['version'].
            // Without this echo the client only ever sends $clientVersion=null,
            // so every edit against a cold-loaded record 409s even when there
            // is no actual concurrent edit.
            $payload['version'] = (int) $row['version'];
            return $payload;
        },
        $rows
    ), static fn (mixed $record): bool => is_array($record) && !($record['__invalid'] ?? false)));

    // Admin Cabang (non-cabang entities) and Superadmin are already fully
    // covered by the query above. Everyone else needs a per-record
    // authorize() check: Admin Cabang reading 'cabang' itself (self-match
    // against their own branch id), and Trainer for every entity (trainer
    // is assignment-based, not branch-based — e.g. absensi.trainerId must
    // match, sekolah.trainerIds must contain them, siswa needs the indirect
    // sekolah lookup precomputed above).
    if ($user['role'] === 'trainer' || ($user['role'] === 'admin_cabang' && $name === 'cabang')) {
    $records = array_values(array_filter(
        $records,
        static function (array $record) use (
            $name,
            $user,
            $sekolahTrainerIds,
            $siswaSekolahIds,
            $invoiceSekolahIds
        ): bool {
            if ($name === 'siswa') {
                $sekolahId = $record['sekolahId'] ?? null;

                $record['_sekolahTrainerIds'] =
                    $sekolahTrainerIds[$sekolahId] ?? [];
            }

            if ($name === 'sppPayments') {
                $siswaId = $record['siswaId'] ?? null;

                // Jalur siswa -> sekolah -> trainer
                $sekolahId = $siswaSekolahIds[$siswaId] ?? null;

                // Jalur invoice -> sekolah -> trainer
                // untuk payment yang tidak punya siswaId.
                if (
                    (!is_string($sekolahId) || $sekolahId === '')
                    && isset($record['invoiceId'])
                ) {
                    $sekolahId =
                        $invoiceSekolahIds[$record['invoiceId']] ?? null;
                }

                $record['_sekolahTrainerIds'] =
                    $sekolahTrainerIds[$sekolahId] ?? [];
            }

            return authorize('read', $name, $record, $user);
        }
    ));
}

    $output[$name] = $records;
}

jsonResponse($entity ? ($output[$entity] ?? []) : $output);