<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/photoStore.php';

// LP.B.1 — Logo upload endpoint (F-LP1, F-LP2; D-LP1, D-LP2, D-LP3; R-LP1, R-LP2).
//
// Concrete pick: the global logo reuses the photo_uploads + photoStore.php
// idiom (taste #11, #17) with cabang_id = NULL (D-LP2). This is what
// unblocks superadmin: photo-upload.php 422s a superadmin without an
// explicit cabangId (F-LP2), while only superadmin may edit settings —
// so the logo tier takes NO cabangId at all (422 if sent) and gates to
// role === 'superadmin' (403 otherwise, D-LP3 — manage_settings stays
// superadmin-only, no role is broadened).
//
// Transport mirrors photo-upload.php verbatim: multipart field `logo` is
// the primary transport (with a `photo` alias so the LP.B.3 client can
// reuse the uploadPhotoToServer FormData shape), plus a raw-bytes
// php://input fallback for non-multipart callers. All paths converge on
// the same validation pipeline — the client-declared type (multipart
// $_FILES['type'] or raw Content-Type header) is never trusted (R-LP2).
//
// Auth order mirrors photo-upload.php / endpoint.protection.php:
//   405 method -> 401 auth -> 403 CSRF -> 403 role -> 422 validation.
// Role runs before validation so a non-superadmin always sees 403 with
// zero rows and zero files, even when the payload would also 422.
//
// Validation (all BEFORE any disk/DB write, so rejects leave zero rows
// and zero files): finfo content sniff + getimagesize sanity,
// JPEG/PNG/WebP actual content only, 2 MB cap enforced on actual bytes.

const LOGO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_UPLOAD_ALLOWED_MIMES = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

$role = $user['role'] ?? null;
if (!validServerRole($role) || $role !== 'superadmin') jsonResponse(['error' => 'Akses tidak diizinkan'], 403);

$ownerId = $user['id'] ?? null;
if (!is_string($ownerId) || $ownerId === '') jsonResponse(['error' => 'Autentikasi diperlukan'], 401);

// --- global logo takes NO branch: any client-supplied id is a 422 ------
// Mirrors photo-upload.php's strictness in reverse (there superadmin must
// name a cabangId; here nobody may — the stored cabang_id is NULL).
if (
    array_key_exists('cabangId', $_POST) || isset($_GET['cabangId'])
    || array_key_exists('cabang_id', $_POST) || isset($_GET['cabang_id'])
) {
    jsonResponse(['error' => 'cabangId tidak boleh dikirim'], 422);
}

// --- resolve raw bytes (multipart primary, raw fallback) -------------------
$bytes = null;

foreach (['logo', 'photo'] as $field) {
    if (!isset($_FILES[$field]) || !is_array($_FILES[$field])) continue;
    $file = $_FILES[$field];
    if (isset($file['error']) && is_array($file['error'])) {
        jsonResponse(['error' => 'Logo wajib diunggah satu file'], 422);
    }
    $uploadError = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($uploadError === UPLOAD_ERR_NO_FILE) {
        continue; // try the next field, then the raw-body attempt below
    } elseif ($uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE) {
        jsonResponse(['error' => 'Logo melebihi batas 2 MB'], 422);
    } elseif ($uploadError !== UPLOAD_ERR_OK) {
        jsonResponse(['error' => 'Logo gagal diunggah'], 422);
    } else {
        $reportedSize = (int) ($file['size'] ?? 0);
        if ($reportedSize > LOGO_UPLOAD_MAX_BYTES) {
            jsonResponse(['error' => 'Logo melebihi batas 2 MB'], 422);
        }
        if ($reportedSize === 0) {
            jsonResponse(['error' => 'Logo tidak valid: file kosong'], 422);
        }
        $tmpName = $file['tmp_name'] ?? '';
        if (!is_string($tmpName) || $tmpName === '' || !is_uploaded_file($tmpName)) {
            jsonResponse(['error' => 'Logo gagal diunggah'], 422);
        }
        $read = file_get_contents($tmpName);
        if (!is_string($read) || $read === '') {
            jsonResponse(['error' => 'Logo tidak valid: file kosong'], 422);
        }
        $bytes = $read;
        break;
    }
}

if ($bytes === null) {
    // Raw fallback for non-multipart callers (e.g. curl --data-binary).
    // php://input is empty for multipart requests, so this only fires when
    // no usable $_FILES entry arrived. CONTENT_LENGTH is checked first so a
    // giant body is rejected without buffering it all into memory.
    $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : null;
    if ($contentLength !== null && $contentLength > LOGO_UPLOAD_MAX_BYTES) {
        jsonResponse(['error' => 'Logo melebihi batas 2 MB'], 422);
    }
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || $raw === '') {
        jsonResponse(['error' => 'Logo wajib diunggah'], 422);
    }
    $bytes = $raw;
}

$byteSize = strlen($bytes);
if ($byteSize === 0) {
    jsonResponse(['error' => 'Logo tidak valid: file kosong'], 422);
}
if ($byteSize > LOGO_UPLOAD_MAX_BYTES) {
    jsonResponse(['error' => 'Logo melebihi batas 2 MB'], 422);
}

// --- content validation: sniff actual bytes, never the declared type ------
$finfo = finfo_open(FILEINFO_MIME_TYPE);
if ($finfo === false) {
    error_log('logo-upload.php: finfo_open failed');
    jsonResponse(['error' => 'Gagal memvalidasi logo'], 500);
}
$sniffed = finfo_buffer($finfo, $bytes);
finfo_close($finfo);
if (!is_string($sniffed) || !isset(LOGO_UPLOAD_ALLOWED_MIMES[$sniffed])) {
    jsonResponse(['error' => 'Format logo tidak didukung (hanya JPEG/PNG/WebP)'], 422);
}

$imageInfo = @getimagesizefromstring($bytes);
if (!is_array($imageInfo)) {
    jsonResponse(['error' => 'File bukan gambar yang valid'], 422);
}
$gisMime = $imageInfo['mime'] ?? null;
if ($gisMime !== $sniffed) {
    jsonResponse(['error' => 'File bukan gambar yang valid'], 422);
}
if (($imageInfo[0] ?? 0) <= 0 || ($imageInfo[1] ?? 0) <= 0) {
    jsonResponse(['error' => 'File bukan gambar yang valid'], 422);
}

$extension = LOGO_UPLOAD_ALLOWED_MIMES[$sniffed];
$logoId = 'lgo-' . bin2hex(random_bytes(12));

// --- persist: file first, then row; DB failure deletes the file ------------
try {
    $storagePath = savePhotoBytes($bytes, $extension);
} catch (Throwable $error) {
    error_log('logo-upload.php save failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal menyimpan logo'], 500);
}

try {
    // cabang_id is the NULL literal (global logo, D-LP2) — never a bound
    // client value.
    database()->prepare(
        'INSERT INTO photo_uploads (id, cabang_id, owner_user_id, storage_path, mime_type, byte_size) VALUES (:id, NULL, :owner_user_id, :storage_path, :mime_type, :byte_size)'
    )->execute([
        ':id' => $logoId,
        ':owner_user_id' => $ownerId,
        ':storage_path' => $storagePath,
        ':mime_type' => $sniffed,
        ':byte_size' => $byteSize,
    ]);
} catch (PDOException $error) {
    @unlink(photoStorageDir() . DIRECTORY_SEPARATOR . $storagePath);
    if (isDuplicate($error)) jsonResponse(['error' => 'ID sudah tersimpan', 'id' => $logoId], 409);
    error_log('logo-upload.php insert failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal menyimpan logo'], 500);
}

auditEvent('logo_uploaded', $user, 'photo_uploads', $logoId, [
    'mimeType' => $sniffed,
    'byteSize' => $byteSize,
]);

jsonResponse(['ok' => true, 'id' => $logoId], 201);
