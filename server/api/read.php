<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

// 401 — no session, no data. requireAuthenticatedUser() is defined in
// auth/session.php (required by bootstrap.php) and jsonResponse(401)'s
// internally on an anonymous caller.
$user = requireAuthenticatedUser();

$entity = $_GET['entity'] ?? null;
$allEntities = ['absensi', 'sppPayments', 'honorPayments'];

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
        $rows = $pdo->query("SELECT payload FROM {$config['table']} ORDER BY created_at, id")->fetchAll();
    } else {
        // cabang_id is a real column on all three tables — scope at the SQL
        // level first (branch-level, coarse-grained) before any per-record
        // authorize() check below. A caller with no branch context (should
        // never happen post-login, but fail closed rather than assume) gets
        // nothing instead of an unscoped query.
        $cabangId = $user['cabangId'] ?? null;
        if (!is_string($cabangId) || $cabangId === '') {
            $output[$name] = [];
            continue;
        }
        $stmt = $pdo->prepare("SELECT payload FROM {$config['table']} WHERE cabang_id = :cabang_id ORDER BY created_at, id");
        $stmt->execute([':cabang_id' => $cabangId]);
        $rows = $stmt->fetchAll();
    }

    $records = array_values(array_filter(array_map(
        static fn (array $row): mixed => json_decode($row['payload'], true),
        $rows
    ), static fn (mixed $record): bool => is_array($record)));

    // Admin Cabang and Superadmin are already fully covered by the query
    // above. Trainer needs a further per-record check beyond branch scope —
    // e.g. absensi.trainerId must match — enforced via trainerOwnsRecord()
    // inside authorize(). sppPayments/honorPayments never reach this branch
    // for trainer: roleCanReadEntity() already excluded them above.
    if ($user['role'] === 'trainer') {
        $records = array_values(array_filter(
            $records,
            static fn (array $record): bool => authorize('read', $name, $record, $user)
        ));
    }

    $output[$name] = $records;
}

jsonResponse($entity ? ($output[$entity] ?? []) : $output);