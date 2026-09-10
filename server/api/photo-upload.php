<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/photoStore.php';

// RH.D.2 — Photo upload endpoint (F-RH5, R-RH1..R-RH4, D-RH9).
//
// Concrete pick: multipart/form-data field `photo` is the primary transport
// (src/lib/api.js already passes FormData through without a JSON envelope),
// with a raw-bytes php://input fallback for non-multipart callers. Both
// paths converge on the same validation pipeline below — the client-declared
// type (multipart $_FILES['type'] or raw Content-Type header) is never
// trusted (R-RH4).
//
// Auth order mirrors backup-create.php / endpoint.protection.php:
//   405 method -> 401 auth -> 403 CSRF -> 422 validation.
// Upload is any-authenticated-role per D-RH9, so requireAuthenticatedUser()
// is the full gate — no authorize() matrix entry is needed here (that is why
// server/auth/authorize.php is intentionally untouched; RH.D.3 adds the
// branch-scoped read check on the download side).
//
// Validation (all BEFORE any disk/DB write, so rejects leave zero rows and
// zero files): finfo content sniff + getimagesize sanity, JPEG/PNG/WebP
// actual content only, 2 MB cap enforced on actual bytes (bootstrap's
// requestJson cap guards the JSON envelope — this raw path enforces its own).

const PHOTO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_UPLOAD_ALLOWED_MIMES = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();
requireCsrf();

$role = $user['role'] ?? null;
if (!validServerRole($role)) jsonResponse(['error' => 'Akses tidak diizinkan'], 403);

$ownerId = $user['id'] ?? null;
if (!is_string($ownerId) || $ownerId === '') jsonResponse(['error' => 'Autentikasi diperlukan'], 401);

// --- cabang_id authority: session is the authority, never the client ------
// Mirrors server/api/trainer.php + sekolah.php: admin_cabang/trainer get
// their branch forced from the session (any client-supplied cabangId is a
// 422, not silently accepted); superadmin has no session branch so they must
// name one explicitly (validated against cabang).
if ($role === 'superadmin') {
    $cabangId = $_POST['cabangId'] ?? $_GET['cabangId'] ?? null;
    if (!is_string($cabangId) || trim($cabangId) === '') {
        jsonResponse(['error' => 'cabangId wajib diisi'], 422);
    }
    $cabangId = trim($cabangId);
    $check = database()->prepare('SELECT 1 FROM cabang WHERE id = :id');
    $check->execute([':id' => $cabangId]);
    if ($check->fetchColumn() === false) {
        jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
    }
} else {
    if (array_key_exists('cabangId', $_POST) || isset($_GET['cabangId'])) {
        jsonResponse(['error' => 'cabangId tidak boleh dikirim'], 422);
    }
    $sessionCabang = $user['cabangId'] ?? null;
    if (!is_string($sessionCabang) || trim($sessionCabang) === '') {
        jsonResponse(['error' => 'Sesi tidak memiliki cabang yang valid'], 422);
    }
    $cabangId = trim($sessionCabang);
}

// --- resolve raw bytes (multipart primary, raw fallback) -------------------
$bytes = null;

if (isset($_FILES['photo']) && is_array($_FILES['photo'])) {
    $file = $_FILES['photo'];
    if (isset($file['error']) && is_array($file['error'])) {
        jsonResponse(['error' => 'Foto wajib diunggah satu file'], 422);
    }
    $uploadError = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($uploadError === UPLOAD_ERR_NO_FILE) {
        $bytes = null; // fall through to the raw-body attempt below
    } elseif ($uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE) {
        jsonResponse(['error' => 'Foto melebihi batas 2 MB'], 422);
    } elseif ($uploadError !== UPLOAD_ERR_OK) {
        jsonResponse(['error' => 'Foto gagal diunggah'], 422);
    } else {
        $reportedSize = (int) ($file['size'] ?? 0);
        if ($reportedSize > PHOTO_UPLOAD_MAX_BYTES) {
            jsonResponse(['error' => 'Foto melebihi batas 2 MB'], 422);
        }
        if ($reportedSize === 0) {
            jsonResponse(['error' => 'Foto tidak valid: file kosong'], 422);
        }
        $tmpName = $file['tmp_name'] ?? '';
        if (!is_string($tmpName) || $tmpName === '' || !is_uploaded_file($tmpName)) {
            jsonResponse(['error' => 'Foto gagal diunggah'], 422);
        }
        $read = file_get_contents($tmpName);
        if (!is_string($read) || $read === '') {
            jsonResponse(['error' => 'Foto tidak valid: file kosong'], 422);
        }
        $bytes = $read;
    }
}

if ($bytes === null) {
    // Raw fallback for non-multipart callers (e.g. curl --data-binary).
    // php://input is empty for multipart requests, so this only fires when
    // no usable $_FILES entry arrived. CONTENT_LENGTH is checked first so a
    // giant body is rejected without buffering it all into memory.
    $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : null;
    if ($contentLength !== null && $contentLength > PHOTO_UPLOAD_MAX_BYTES) {
        jsonResponse(['error' => 'Foto melebihi batas 2 MB'], 422);
    }
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || $raw === '') {
        jsonResponse(['error' => 'Foto wajib diunggah'], 422);
    }
    $bytes = $raw;
}

$byteSize = strlen($bytes);
if ($byteSize === 0) {
    jsonResponse(['error' => 'Foto tidak valid: file kosong'], 422);
}
if ($byteSize > PHOTO_UPLOAD_MAX_BYTES) {
    jsonResponse(['error' => 'Foto melebihi batas 2 MB'], 422);
}

// --- content validation: sniff actual bytes, never the declared type ------
$finfo = finfo_open(FILEINFO_MIME_TYPE);
if ($finfo === false) {
    error_log('photo-upload.php: finfo_open failed');
    jsonResponse(['error' => 'Gagal memvalidasi foto'], 500);
}
$sniffed = finfo_buffer($finfo, $bytes);
finfo_close($finfo);
if (!is_string($sniffed) || !isset(PHOTO_UPLOAD_ALLOWED_MIMES[$sniffed])) {
    jsonResponse(['error' => 'Format foto tidak didukung (hanya JPEG/PNG/WebP)'], 422);
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

$extension = PHOTO_UPLOAD_ALLOWED_MIMES[$sniffed];
$photoId = 'pht-' . bin2hex(random_bytes(12));

// --- persist: file first, then row; DB failure deletes the file ------------
try {
    $storagePath = savePhotoBytes($bytes, $extension);
} catch (Throwable $error) {
    error_log('photo-upload.php save failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal menyimpan foto'], 500);
}

try {
    database()->prepare(
        'INSERT INTO photo_uploads (id, cabang_id, owner_user_id, storage_path, mime_type, byte_size) VALUES (:id, :cabang_id, :owner_user_id, :storage_path, :mime_type, :byte_size)'
    )->execute([
        ':id' => $photoId,
        ':cabang_id' => $cabangId,
        ':owner_user_id' => $ownerId,
        ':storage_path' => $storagePath,
        ':mime_type' => $sniffed,
        ':byte_size' => $byteSize,
    ]);
} catch (PDOException $error) {
    @unlink(photoStorageDir() . DIRECTORY_SEPARATOR . $storagePath);
    if (isDuplicate($error)) jsonResponse(['error' => 'ID sudah tersimpan', 'id' => $photoId], 409);
    error_log('photo-upload.php insert failed: ' . $error->getMessage());
    jsonResponse(['error' => 'Gagal menyimpan foto'], 500);
}

auditEvent('photo_uploaded', $user, 'photo_uploads', $photoId, [
    'cabangId' => $cabangId,
    'mimeType' => $sniffed,
    'byteSize' => $byteSize,
]);

jsonResponse(['ok' => true, 'id' => $photoId], 201);
