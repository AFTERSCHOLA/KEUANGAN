<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/_master.php';
require_once __DIR__ . '/../lib/assignments.php';

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
        cascadeStripTrainerFromSekolahReverseLinks($data['id'] ?? '', $user);
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

    // AP.A.1 (D-AP1) — auto-create assignments for newly added school
    // links. Injected into $data BEFORE masterWrite so the versioned
    // write stays atomic (no extra bump, 409-safe). Same-branch gated;
    // cross-branch links persist (legacy behavior) but gain no row.
    $newLinks = isset($data['sekolahIds']) && is_array($data['sekolahIds']) ? $data['sekolahIds'] : [];
    if ($newLinks !== []) {
        $oldLinks = [];
        $existingRows = [];
        if ($action === 'update') {
            $prev = database()->prepare('SELECT payload FROM trainer WHERE id = :id');
            $prev->execute([':id' => $data['id'] ?? null]);
            $prow = $prev->fetch();
            $pp = $prow !== false ? json_decode((string) $prow['payload'], true) : null;
            if (is_array($pp)) {
                if (isset($pp['sekolahIds']) && is_array($pp['sekolahIds'])) $oldLinks = $pp['sekolahIds'];
                if (isset($pp['penugasanPengajar']) && is_array($pp['penugasanPengajar'])) $existingRows = $pp['penugasanPengajar'];
            }
        }
        if (isset($data['penugasanPengajar']) && is_array($data['penugasanPengajar'])) {
            $existingRows = $data['penugasanPengajar'];
        }
        $added = array_values(array_diff(
            array_values(array_filter($newLinks, 'is_string')),
            array_values(array_filter($oldLinks, 'is_string'))
        ));
        if ($added !== []) {
            $sameBranch = [];
            $chk = database()->prepare('SELECT cabang_id FROM sekolah WHERE id = :id');
            foreach ($added as $sid) {
                $chk->execute([':id' => $sid]);
                if ($chk->fetchColumn() === $cabangId) $sameBranch[] = $sid;
                else error_log("trainer.php auto-assignment skipped non-same-branch link sekolah={$sid}");
            }
            $rows = missingAssignmentLinks($existingRows, (string) ($data['id'] ?? ''), $sameBranch, autoAssignmentToday());
            if ($rows !== []) {
                $data['penugasanPengajar'] = array_values(array_merge($existingRows, $rows));
                auditEvent('assignment_auto_created', $user, 'trainer', (string) ($data['id'] ?? ''), [
                    'sekolahIds' => array_column($rows, 'sekolahId'),
                    'cabangId' => $cabangId,
                ]);
            }
        }
    }

    masterWrite('trainer', $user, record: $data, overrides: ['cabangId' => $cabangId], action: $action);
} elseif ($method === 'DELETE') {
    if ($role !== 'admin_cabang') {
        jsonResponse(['error' => 'Superadmin tidak dapat menghapus trainer'], 403);
    }
    $body = requestJson();
    cascadeStripTrainerFromSekolahReverseLinks($body['id'] ?? ($_GET['id'] ?? ''), $user);
    masterDelete('trainer', $user);
} else {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

/**
 * M-AF5.7 — strip a trainer id from every `sekolah.payload.trainerIds[]`
 * reverse-link that still references it. Mirrors the
 * `users.php:rollbackTrainerRecord` best-effort pattern (try/catch per
 * row, swallow + log so the delete itself never fails on a malformed
 * JSON payload). Idempotent: a second pass touches zero rows because the
 * WHERE predicate already requires the id to still be present. Emits one
 * `trainer_sekolah_unlinked` audit event with the touched count.
 */
function cascadeStripTrainerFromSekolahReverseLinks(string $trainerId, array $user): void {
    if (trim($trainerId) === '') return;
    $pdo = database();
    $trainerIdEsc = $trainerId;
    $touched = 0;
    try {
        $rows = $pdo->prepare('SELECT id, payload FROM sekolah WHERE JSON_SEARCH(payload, \'one\', :id, NULL, \'$.trainerIds\') IS NOT NULL');
        $rows->execute([':id' => $trainerIdEsc]);
        $upd = $pdo->prepare('UPDATE sekolah SET payload = :payload WHERE id = :id');
        while ($row = $rows->fetch()) {
            $payload = json_decode((string) $row['payload'], true);
            if (!is_array($payload) || !isset($payload['trainerIds']) || !is_array($payload['trainerIds'])) continue;
            $filtered = array_values(array_filter($payload['trainerIds'], static fn($v) => $v !== $trainerIdEsc));
            if (count($filtered) === count($payload['trainerIds'])) continue;
            $payload['trainerIds'] = $filtered;
            $upd->execute([
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':id' => $row['id'],
            ]);
            $touched++;
        }
    } catch (Throwable $e) {
        error_log('cascadeStripTrainerFromSekolahReverseLinks failed: ' . $e->getMessage());
    }
    if ($touched > 0) {
        auditEvent('trainer_sekolah_unlinked', $user, 'sekolah', null, [
            'trainerId' => $trainerIdEsc,
            'recordsTouched' => $touched,
        ]);
    }
}