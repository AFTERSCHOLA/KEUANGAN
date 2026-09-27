<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/_master.php';
require_once __DIR__ . '/../validation/entities.php';

// CS.B.2 (F-CS5; D-CS5) — minimal external-assistant person record.
// No login account; attendance is recorded by an authorized admin/trainer
// in-scope for the school+date with mandatory dicatatOleh (enforced on
// the absensiPengajar write path, not here).
//
// Privilege matrix (COVER_SLOT_PLAN.md §9):
// - superadmin -> full access, cabangId explicit per record.
// - admin_cabang -> full CRUD scoped to own branch (cabangId forced from
//   the session, never trusted from the client — trainer.php parity).
// - trainer -> never (reference-only; deferred inline creation).
// masterWrite()/masterDelete() re-check authorize() against the stored
// branch, so cross-branch writes 403 there even with a forged body.

$user = requireAuthenticatedUser();
$method = $_SERVER['REQUEST_METHOD'];
$role = $user['role'] ?? null;

if ($method === 'POST' || $method === 'PUT') {
    $data = requestJson();
    $action = $data['action'] ?? 'create';
    if (!in_array($action, ['create', 'update', 'delete'], true)) {
        jsonResponse(['error' => 'Operasi tidak didukung'], 400);
    }

    if ($role === 'trainer') {
        jsonResponse(['error' => 'Hanya Admin yang dapat mengelola asisten eksternal'], 403);
    }

    if ($action === 'delete') {
        if ($role !== 'admin_cabang' && $role !== 'superadmin') {
            jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
        }
        cascadeStripEksternalFromAssignments((string) ($data['id'] ?? ''), $user);
        masterDelete('eksternal', $user);
        return;
    }

    if ($role === 'admin_cabang') {
        if (array_key_exists('cabangId', $data)) {
            jsonResponse(['error' => 'cabangId tidak boleh dikirim'], 422);
        }
        $cabangId = $user['cabangId'] ?? null;
        if (!is_string($cabangId) || $cabangId === '') {
            jsonResponse(['error' => 'Sesi tidak memiliki cabang yang valid'], 422);
        }
    } elseif ($role === 'superadmin') {
        if ($action === 'create') {
            $cabangId = $data['cabangId'] ?? null;
            if (!is_string($cabangId) || trim($cabangId) === '') {
                jsonResponse(['error' => 'cabangId wajib diisi'], 422);
            }
            $chk = database()->prepare('SELECT 1 FROM cabang WHERE id = :id');
            $chk->execute([':id' => $cabangId]);
            if ($chk->fetchColumn() === false) {
                jsonResponse(['error' => 'Cabang tidak valid'], 422);
            }
        } else {
            if (array_key_exists('cabangId', $data)) {
                jsonResponse(['error' => 'cabangId tidak boleh diubah lewat form ini'], 422);
            }
            $existing = database()->prepare('SELECT cabang_id FROM eksternal WHERE id = :id');
            $existing->execute([':id' => $data['id'] ?? null]);
            $cabangId = $existing->fetchColumn();
            if ($cabangId === false) {
                jsonResponse(['error' => 'Asisten eksternal tidak ditemukan'], 404);
            }
        }
    } else {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }

    // Strict shape gate: unlike legacy entities (whose payload validators
    // are unenforced on HTTP writes), this entity is new — no legacy
    // posture to preserve. Malformed rows 422 before masterWrite.
    $shapeErrors = validateEksternal(
        array_merge($data, ['cabangId' => $cabangId]),
        database()
    );
    if ($shapeErrors !== []) {
        jsonResponse(['error' => implode('; ', $shapeErrors)], 422);
    }

    masterWrite('eksternal', $user, record: $data, overrides: ['cabangId' => $cabangId], action: $action);
} elseif ($method === 'DELETE') {
    if ($role === 'trainer') {
        jsonResponse(['error' => 'Hanya Admin yang dapat mengelola asisten eksternal'], 403);
    }
    if ($role !== 'admin_cabang' && $role !== 'superadmin') {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }
    $body = requestJson();
    cascadeStripEksternalFromAssignments($body['id'] ?? ($_GET['id'] ?? ''), $user);
    masterDelete('eksternal', $user);
} else {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

/**
 * CS.B.2 — deleting an external strips its id from every
 * trainer.payload.penugasanPengajar[].asistenIds that still references it
 * (same best-effort pattern as trainer.php's reverse-link strip: per-row
 * try/catch, swallow + log, delete never fails on malformed JSON).
 * Reference-preserving (taste #35): only the dangling entry is removed —
 * legacy asistenId entries never hold externals (validator rejects them),
 * so they are untouched. Attendance history (absensi_pengajar rows) is
 * untouched: honor math keeps its audit trail.
 */
function cascadeStripEksternalFromAssignments(string $eksternalId, array $user): void {
    if (trim($eksternalId) === '') return;
    $pdo = database();
    $touched = 0;
    try {
        $rows = $pdo->query('SELECT id, payload FROM trainer');
        $upd = $pdo->prepare('UPDATE trainer SET payload = :payload WHERE id = :id');
        while ($row = $rows->fetch()) {
            $payload = json_decode((string) $row['payload'], true);
            if (!is_array($payload) || !isset($payload['penugasanPengajar']) || !is_array($payload['penugasanPengajar'])) continue;
            $changed = false;
            foreach ($payload['penugasanPengajar'] as $i => $assignment) {
                if (!is_array($assignment) || !isset($assignment['asistenIds']) || !is_array($assignment['asistenIds'])) continue;
                $filtered = array_values(array_filter($assignment['asistenIds'], static fn($v) => $v !== $eksternalId));
                if (count($filtered) === count($assignment['asistenIds'])) continue;
                $payload['penugasanPengajar'][$i]['asistenIds'] = $filtered;
                $changed = true;
            }
            if (!$changed) continue;
            $upd->execute([
                ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':id' => $row['id'],
            ]);
            $touched++;
        }
    } catch (Throwable $e) {
        error_log('cascadeStripEksternalFromAssignments failed: ' . $e->getMessage());
    }
    if ($touched > 0) {
        auditEvent('eksternal_assignment_unlinked', $user, 'trainer', null, [
            'eksternalId' => $eksternalId,
            'recordsTouched' => $touched,
        ]);
    }
}
