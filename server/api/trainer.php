<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/_master.php';

$user = requireAuthenticatedUser();
$method = $_SERVER['REQUEST_METHOD'];
$role = $user['role'] ?? null;

if ($method === 'POST' || $method === 'PUT') {
    $data = requestJson();
    $action = $data['action'] ?? 'create';
    if (!in_array($action, ['create', 'update', 'delete'], true)) {
        jsonResponse(['error' => 'Operasi tidak didukung'], 400);
    }

    // Privilege matrix (WA thread 1/9/2026, final):
    // superadmin -> read + update only, never create/delete trainer.
    // admin_cabang -> full CRUD, scoped to own branch.
    if ($action === 'delete') {
        if ($role !== 'admin_cabang') {
            jsonResponse(['error' => 'Superadmin tidak dapat menghapus trainer'], 403);
        }
        masterDelete('trainer', $user);
        return;
    }

    if ($action === 'create' && $role !== 'admin_cabang') {
        jsonResponse(['error' => 'Superadmin tidak dapat membuat trainer baru'], 403);
    }

    // cabangId is NEVER trusted from the client, for either role.
    // - admin_cabang: cabangId always comes from their own session, and
    //   the client must not send it at all (create AND update).
    // - superadmin: only reaches this point via 'update' (create is
    //   blocked above). They have no branch of their own and are not
    //   allowed to move a trainer between branches, so cabangId for an
    //   update is preserved from the existing record, never taken from
    //   the request body.
    if ($role === 'admin_cabang') {
        if (array_key_exists('cabangId', $data)) {
            jsonResponse(['error' => 'cabangId tidak boleh dikirim'], 422);
        }
        $cabangId = $user['cabangId'] ?? null;
        if (!is_string($cabangId) || $cabangId === '') {
            jsonResponse(['error' => 'Sesi tidak memiliki cabang yang valid'], 422);
        }
    } else {
    // Only reachable for update at this point (create already blocked).
    if (array_key_exists('cabangId', $data)) {
        jsonResponse(['error' => 'cabangId tidak boleh diubah lewat form ini'], 422);
    }
    $existing = database()->prepare('SELECT cabang_id FROM trainer WHERE id = :id');
    $existing->execute([':id' => $data['id'] ?? null]);
    $cabangId = $existing->fetchColumn();
    if ($cabangId === false) {
        jsonResponse(['error' => 'Trainer tidak ditemukan'], 404);
    }
}

    masterWrite('trainer', $user, record: $data, overrides: ['cabangId' => $cabangId], action: $action);
} elseif ($method === 'DELETE') {
    if ($role !== 'admin_cabang') {
        jsonResponse(['error' => 'Superadmin tidak dapat menghapus trainer'], 403);
    }
    masterDelete('trainer', $user);
} else {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}