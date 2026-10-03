<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/_master.php';
require_once __DIR__ . '/../validation/entities.php';

// Slice 1 Raport (2026-10-03) — raport semester per siswa, pola
// master-data eksternal.php (masterWrite/masterDelete + strict shape
// gate + cabangId server-side, bukan dari klien) dengan cabangId
// diturunkan dari siswaId → sekolah.cabang_id (pola siswa.php:31-47).
//
// Privilege matrix (spec §2 + plan Task 3):
// - superadmin -> penuh. create: cabangId wajib + cek tabel cabang;
//   update: dikunci dari baris tersimpan (pola eksternal.php:52-73).
// - admin_cabang -> CRUD cabang sendiri; cabangId tidak boleh dikirim
//   (ditolak 422), diturunkan server dari siswa.
// - trainer -> tulis iff scope-assigned ke sekolah siswa (authorize.php
//   trainerScopedToRaport: enriched atau live-DB, ownership-only tanpa
//   gate tanggal, BUG2 parity); hapus hanya Draft dalam scope;
//   verifikasi (Diajukan→Terverifikasi) hanya admin_cabang/superadmin.
// Duplikat (siswaId, semester, tahunAjaran) → 409 dengan pesan Indonesia
// yang mengarah ke koreksi (load-to-correct, meniru Riwayat Absensi).

// AA.D.1 (D-AA4, R-AA2): 401 first (cookie OR Bearer). CSRF for the
// cookie path is enforced inside masterWrite()/masterDelete() in
// _master.php — gated on the Bearer boundary there so the
// cookie path (including both-present) still requires it while
// Bearer-only skips it. Scope stays in the SAME authorize() calls in
// _master.php (R-AA1).
$user = requireAuthUserOrBearer();
$method = $_SERVER['REQUEST_METHOD'];
$role = $user['role'] ?? null;

if ($method === 'POST' || $method === 'PUT') {
    // PUT tolerated (eksternal.php/siswa.php parity): the brief's "405
    // non-POST" means non-write methods 405, not POST-only.
    $data = requestJson();
    // Server-authoritative scope (Global Constraint): _sekolahTrainerIds
    // is a server-side enrichment (read.php), never a client claim. A
    // forged key forwarded into requireAuthorization() would be honoured
    // by trainerScopedToRaport()'s enriched-first branch, and forwarded
    // into masterWrite() it would persist verbatim in the stored payload.
    // Strip it here — before validation, authorization, and storage alike —
    // so the write path always resolves scope live from the DB.
    unset($data['_sekolahTrainerIds']);
    $action = $data['action'] ?? 'create';
    if (!in_array($action, ['create', 'update', 'delete'], true)) {
        jsonResponse(['error' => 'Operasi tidak didukung'], 400);
    }

    if ($action === 'delete') {
        masterDelete('raport', $user);
        return;
    }

    if ($role !== 'admin_cabang' && $role !== 'superadmin' && $role !== 'trainer') {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }

    // Update needs the stored row: missing id 404s here (eksternal.php
    // parity), and the stored branch locks the effective cabangId for
    // superadmin updates below.
    $storedCabangId = null;
    if ($action === 'update') {
        $id = $data['id'] ?? null;
        if (!is_string($id) || trim($id) === '') {
            jsonResponse(['error' => 'Record membutuhkan id'], 422);
        }
        $existing = database()->prepare('SELECT cabang_id FROM raport WHERE id = :id');
        $existing->execute([':id' => $id]);
        $storedCabangId = $existing->fetchColumn();
        if ($storedCabangId === false) {
            jsonResponse(['error' => 'Raport tidak ditemukan'], 404);
        }
    }

    // siswaId is required before anything else: the server derives the
    // branch from it (siswa.php:31-47 parity), never from the client.
    $siswaId = $data['siswaId'] ?? null;
    if (!is_string($siswaId) || trim($siswaId) === '') {
        jsonResponse(['error' => 'Record membutuhkan siswaId'], 422);
    }

    // cabangId is never trusted from the client — except superadmin
    // create, which must state it explicitly (checked against the cabang
    // table, eksternal.php:52-73 parity; validateRaport additionally
    // rejects it when it disagrees with the student's school branch).
    if ($role === 'admin_cabang' || $role === 'trainer') {
        if (array_key_exists('cabangId', $data)) {
            jsonResponse(['error' => 'cabangId tidak boleh dikirim'], 422);
        }
        $cabangId = raportDerivedCabangId($siswaId);
    } elseif ($action === 'create') {
        $cabangId = $data['cabangId'] ?? null;
        if (!is_string($cabangId) || trim($cabangId) === '') {
            jsonResponse(['error' => 'cabangId wajib diisi'], 422);
        }
        $chk = database()->prepare('SELECT 1 FROM cabang WHERE id = :id');
        $chk->execute([':id' => $cabangId]);
        if ($chk->fetchColumn() === false) {
            jsonResponse(['error' => 'Cabang tidak valid'], 422);
        }
        // The student's school must still resolve (same 422s as other
        // roles) so the shape gate below can cross-check the branch.
        raportDerivedCabangId($siswaId);
    } else {
        // Final-fix wave: superadmin update tolerates a matching cabangId
        // (client roundtrip keeps the stored value); only a differing
        // value is a branch-move attempt → 422. Either way the stored
        // branch wins.
        if (array_key_exists('cabangId', $data)) {
            if ($data['cabangId'] !== $storedCabangId) {
                jsonResponse(['error' => 'cabangId tidak boleh diubah lewat form ini'], 422);
            }
            unset($data['cabangId']);
        }
        $cabangId = $storedCabangId;
    }

    // Strict shape gate: unlike legacy entities (whose payload validators
    // are unenforced on HTTP writes), this entity is new — no legacy
    // posture to preserve. Malformed rows 422 before masterWrite, and
    // therefore before the scope check (absensiPengajar.php parity: a
    // malformed record must not leak whether it would've been in-scope).
    $shapeErrors = validateRaport(
        array_merge($data, ['cabangId' => $cabangId]),
        database()
    );
    if ($shapeErrors !== []) {
        jsonResponse(['error' => implode('; ', $shapeErrors)], 422);
    }

    // Scope check before the duplicate probe: a cross-branch duplicate
    // probe must not become an existence oracle (403 first, then 409).
    // masterWrite() re-checks authorize() against the stored branch on
    // updates, so a forged cross-branch move still 403s there.
    // $data carries no _sekolahTrainerIds here (stripped above), so the
    // trainer lane always resolves live-DB — a forged key can never reach
    // the trust check.
    $authRecord = array_merge($data, ['cabangId' => $cabangId]);
    requireAuthorization('write', 'raport', $authRecord, $user);

    // Unik per (siswaId, semester, tahunAjaran): simpan ulang adalah
    // koreksi record yang sama (load-to-correct), bukan duplikat.
    // Payload JSON has no DB-level unique key (meniru tabel sekolah),
    // so the endpoint enforces it here with the correct-to-form message.
    // TOCTOU posture (document-only, plan-mandated): the app-level SELECT
    // probe below cannot serialize concurrent creates — two simultaneous
    // writes can both pass it (second wins silently). No DB unique key per
    // the frozen Task-2 schema; same posture as existing master-data and
    // acceptable for the single-writer UI flow (409 → load-to-correct).
    $dupSql = "SELECT id FROM raport
        WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.siswaId')) = :siswaId
          AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.semester')) = :semester
          AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.tahunAjaran')) = :tahunAjaran";
    $dupParams = [
        ':siswaId' => $siswaId,
        ':semester' => $data['semester'],
        ':tahunAjaran' => (string) $data['tahunAjaran'],
    ];
    if ($action === 'update') {
        $dupSql .= ' AND id != :id';
        $dupParams[':id'] = $data['id'];
    }
    $dupStmt = database()->prepare($dupSql . ' LIMIT 1');
    $dupStmt->execute($dupParams);
    $dupId = $dupStmt->fetchColumn();
    if ($dupId !== false) {
        jsonResponse(['error' => 'Raport semester ini sudah ada — buka untuk koreksi', 'existingId' => $dupId], 409);
    }

    masterWrite('raport', $user, record: $data, overrides: ['cabangId' => $cabangId], action: $action);
} elseif ($method === 'DELETE') {
    masterDelete('raport', $user);
} else {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

/**
 * Derive the authoritative cabangId from siswaId → siswa.payload
 * .sekolahId → sekolah.cabang_id (siswa.php:31-47 parity). Every
 * unresolvable link 422s — the branch is never defaulted or guessed.
 */
function raportDerivedCabangId(string $siswaId): string {
    $pdo = database();
    $sStmt = $pdo->prepare('SELECT payload FROM siswa WHERE id = :id LIMIT 1');
    $sStmt->execute([':id' => $siswaId]);
    $sRaw = $sStmt->fetchColumn();
    if (!is_string($sRaw)) {
        jsonResponse(['error' => 'Siswa tidak ditemukan'], 422);
    }
    $sPayload = json_decode($sRaw, true);
    $sekolahId = is_array($sPayload) ? ($sPayload['sekolahId'] ?? null) : null;
    if (!is_string($sekolahId) || trim($sekolahId) === '') {
        jsonResponse(['error' => 'Siswa tidak memiliki sekolahId'], 422);
    }
    $cStmt = $pdo->prepare('SELECT cabang_id FROM sekolah WHERE id = :id');
    $cStmt->execute([':id' => $sekolahId]);
    $cabangId = $cStmt->fetchColumn();
    if (!is_string($cabangId) || $cabangId === '') {
        jsonResponse(['error' => 'Sekolah siswa tidak ditemukan'], 422);
    }
    return $cabangId;
}
