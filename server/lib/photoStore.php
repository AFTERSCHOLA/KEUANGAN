<?php
declare(strict_types=1);

/**
 * Server-side photo storage primitives (RH.D.1, F-RH5).
 *
 * Mirrors the existing private/backups pattern in backupRestore.php:48-61.
 * Locally the dir is repo-root private/uploads/ (gitignored, never
 * committed); on cPanel it is a private/uploads/ sibling OUTSIDE the
 * document root (D-RH5). Photos are NEVER stored inside deploy/ and are
 * served only through an authorized endpoint (R-RH3). Content validation
 * (finfo + getimagesize, 2 MB cap) is RH.D.2's job at the endpoint — this
 * file takes raw bytes and never trusts a client-declared type (R-RH4).
 */

function photoStorageDir(): string {
    // One level up from server/, into a sibling 'private' directory — sits
    // outside whatever XAMPP/cPanel serves as document root in most
    // standard layouts. Same shape as backupStorageDir().
    $dir = __DIR__ . '/../../private/uploads';
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
    }
    return realpath($dir) ?: $dir;
}

/**
 * Saves raw photo bytes under a server-generated random name.
 *
 * Concrete pick: bin2hex(random_bytes(16)) + '.' + sanitized extension.
 * Default 'bin' is neutral — the endpoint (RH.D.2) passes 'jpg'/'png'/
 * 'webp' explicitly after sniffing actual content. Extension is restricted
 * to [a-z0-9]{1,10} so a caller can never smuggle a .php suffix in.
 *
 * Returns the storage_path as stored in photo_uploads.storage_path: the
 * bare filename, relative to photoStorageDir().
 */
function savePhotoBytes(string $bytes, string $extension = 'bin'): string {
    if ($bytes === '') {
        throw new InvalidArgumentException('Foto tidak valid: bytes kosong');
    }
    $ext = strtolower(ltrim(trim($extension), '.'));
    if ($ext === '' || !preg_match('/^[a-z0-9]{1,10}$/', $ext)) {
        throw new InvalidArgumentException('Ekstensi foto tidak valid');
    }

    $filename = bin2hex(random_bytes(16)) . '.' . $ext;
    $path = photoStorageDir() . DIRECTORY_SEPARATOR . $filename;

    if (file_put_contents($path, $bytes) === false) {
        throw new RuntimeException('Gagal menulis file foto ke disk');
    }
    chmod($path, 0640);

    return $filename;
}

/**
 * Loads photo bytes by storage_path (bare filename).
 *
 * Traversal guard: rejects '/' '\' '..' upfront (same idiom as
 * backup-download.php), then requires the realpath() of the candidate to
 * resolve strictly inside photoStorageDir(). Throws on traversal,
 * missing file, or read failure — never returns outside bytes.
 */
function loadPhotoBytes(string $storagePath): string {
    if ($storagePath === '' || strpos($storagePath, '/') !== false || strpos($storagePath, '\\') !== false || strpos($storagePath, '..') !== false) {
        throw new InvalidArgumentException('Path foto tidak valid');
    }

    $base = photoStorageDir();
    $realBase = realpath($base) ?: $base;
    $candidate = $base . DIRECTORY_SEPARATOR . $storagePath;
    $realCandidate = realpath($candidate);
    if ($realCandidate === false) {
        throw new RuntimeException('Foto tidak ditemukan');
    }
    if ($realCandidate !== $realBase && !str_starts_with($realCandidate, $realBase . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Path foto tidak valid');
    }

    $content = file_get_contents($realCandidate);
    if ($content === false) {
        throw new RuntimeException('Gagal membaca file foto');
    }
    return $content;
}
