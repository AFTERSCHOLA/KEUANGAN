<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/photoStore.php';

// LP.B.2 — Logo download endpoint (F-LP3; D-LP2, D-LP3; R-LP1, R-LP3).
//
// Mirrors server/api/photo-download.php verbatim except scope: GET with
// cookie-session auth only (no CSRF — an <img>/fetch-blob caller cannot
// send X-CSRF-Token, same as photo-download/read.php). Any authenticated
// role may stream logo bytes — the logo is branding, not minor PII — while
// the full settings payload stays superadmin-only (D-LP3:
// roleCanReadEntity() untouched, settings.php untouched).
//
// Scope (logo-only, global): the row must exist AND have cabang_id IS NULL.
// A branch-photo id resolves as 404 here (not 403), so this endpoint can
// never be used to probe or bypass the D-RH9 branch scope — from the logo
// tier's perspective a branch photo simply does not exist. The NULL check
// runs BEFORE any disk read, so a non-logo id costs zero bytes.
//
// Auth order mirrors photo-download.php:
//   405 method -> 401 auth -> 403 invalid role -> 422 missing id
//   -> 404 unknown/non-logo id -> bytes.
// Unknown id is 404 (not 403) so callers cannot confuse "no such logo"
// with "forbidden".

const LOGO_DOWNLOAD_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

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
    jsonResponse(['error' => 'Logo tidak ditemukan'], 404);
}

// --- logo-only scope runs BEFORE any disk read ---------------------------
if ($row['cabang_id'] !== null) {
    jsonResponse(['error' => 'Logo tidak ditemukan'], 404);
}

$mime = $row['mime_type'] ?? null;
if (!is_string($mime) || !in_array($mime, LOGO_DOWNLOAD_ALLOWED_MIMES, true)) {
    error_log('logo-download.php: unexpected mime_type for logo ' . $id);
    jsonResponse(['error' => 'Logo tidak valid'], 500);
}

// `storage_path` is a bare filename (see savePhotoBytes()) so it cannot
// address outside the uploads dir — reject defensively anyway in case an
// old/manually-edited row holds something else (same idiom as
// photo-download.php:72-89 / backup-download.php:29-32).
$storagePath = $row['storage_path'] ?? '';
if (!is_string($storagePath) || $storagePath === '' || strpos($storagePath, '/') !== false || strpos($storagePath, '\\') !== false || strpos($storagePath, '..') !== false) {
    error_log('logo-download.php: suspicious storage_path for logo ' . $id);
    jsonResponse(['error' => 'Logo tidak valid'], 500);
}

try {
    $bytes = loadPhotoBytes($storagePath);
} catch (InvalidArgumentException $error) {
    error_log('logo-download.php invalid path for logo ' . $id . ': ' . $error->getMessage());
    jsonResponse(['error' => 'Logo tidak valid'], 500);
} catch (RuntimeException $error) {
    if ($error->getMessage() === 'Foto tidak ditemukan') {
        jsonResponse(['error' => 'Logo tidak ditemukan'], 404);
    }
    error_log('logo-download.php read failed for logo ' . $id . ': ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal membaca file logo'], 500);
}

header('Content-Type: ' . $mime);
header('Content-Length: ' . strlen($bytes));
echo $bytes;
exit;
