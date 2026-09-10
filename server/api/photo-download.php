<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/photoStore.php';

// RH.D.3 — Photo download endpoint (F-RH5, R-RH3, D-RH9).
//
// Concrete pick: GET ?id= streams the exact stored bytes with the stored
// mime_type as Content-Type. No CSRF (an <img>/fetch-blob caller cannot
// send X-CSRF-Token; auth is the cookie session, same as backup-download
// and read.php which are also GET without CSRF). No public URL ever
// exists: bytes live in private/uploads/ outside the document root (D-RH5)
// and are only reachable through this scope-checked endpoint (R-RH3).
//
// Auth order mirrors backup-download.php / read.php:
//   405 method -> 401 auth -> 422 missing id -> 404 unknown id
//   -> 403 scope -> bytes.
// Unknown id is 404 (not 403) so callers cannot confuse "no such photo"
// with "forbidden"; cross-branch existence IS distinguished as 403 per
// the RH.D.3 OUTCOME (authorized same-branch 200, cross-branch 403,
// anonymous 401).
//
// Scope (D-RH9 — branch-scoped evidence, not owner-private):
//   superadmin any branch; admin_cabang own branch (photo row's cabang_id);
//   trainer own branch (same branch check, not the assignment-based
//   trainerOwnsRecord used by read.php — photos carry a real cabang_id).

const PHOTO_DOWNLOAD_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();

$role = $user['role'] ?? null;
if (!validServerRole($role)) jsonResponse(['error' => 'Akses tidak diizinkan'], 403);

$id = $_GET['id'] ?? null;
if (!is_string($id) || trim($id) === '') {
    jsonResponse(['error' => 'id wajib diisi'], 422);
}
$id = trim($id);

$stmt = database()->prepare('SELECT cabang_id, storage_path, mime_type, byte_size FROM photo_uploads WHERE id = :id');
$stmt->execute([':id' => $id]);
$row = $stmt->fetch();
if ($row === false) {
    jsonResponse(['error' => 'Foto tidak ditemukan'], 404);
}

// --- branch scope (D-RH9) runs BEFORE any disk read, so a cross-branch
// --- caller gets 403 with zero bytes.
if ($role !== 'superadmin') {
    $userBranch = $user['cabangId'] ?? null;
    if (!is_string($userBranch) || trim($userBranch) === '') {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }
    if (!is_string($row['cabang_id']) || $row['cabang_id'] !== trim($userBranch)) {
        jsonResponse(['error' => 'Akses tidak diizinkan'], 403);
    }
}

$mime = $row['mime_type'] ?? null;
if (!is_string($mime) || !in_array($mime, PHOTO_DOWNLOAD_ALLOWED_MIMES, true)) {
    error_log('photo-download.php: unexpected mime_type for photo ' . $id);
    jsonResponse(['error' => 'Foto tidak valid'], 500);
}

// `storage_path` is a bare filename (see savePhotoBytes()) so it cannot
// address outside the uploads dir — reject defensively anyway in case an
// old/manually-edited row holds something else (same idiom as
// backup-download.php:29-32).
$storagePath = $row['storage_path'] ?? '';
if (!is_string($storagePath) || $storagePath === '' || strpos($storagePath, '/') !== false || strpos($storagePath, '\\') !== false || strpos($storagePath, '..') !== false) {
    error_log('photo-download.php: suspicious storage_path for photo ' . $id);
    jsonResponse(['error' => 'Foto tidak valid'], 500);
}

try {
    $bytes = loadPhotoBytes($storagePath);
} catch (InvalidArgumentException $error) {
    error_log('photo-download.php invalid path for photo ' . $id . ': ' . $error->getMessage());
    jsonResponse(['error' => 'Foto tidak valid'], 500);
} catch (RuntimeException $error) {
    if ($error->getMessage() === 'Foto tidak ditemukan') {
        jsonResponse(['error' => 'Foto tidak ditemukan'], 404);
    }
    error_log('photo-download.php read failed for photo ' . $id . ': ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal membaca file foto'], 500);
}

header('Content-Type: ' . $mime);
header('Content-Length: ' . strlen($bytes));
echo $bytes;
exit;
