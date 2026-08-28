#!/usr/bin/env php
<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Perintah ini hanya dapat dijalankan melalui CLI.\n");
    exit(1);
}

$options = getopt('', ['username:', 'display-name:', 'password::']);
$username = trim((string) ($options['username'] ?? ''));
$displayName = trim((string) ($options['display-name'] ?? ''));

if ($username === '' || $displayName === '') {
    fwrite(STDERR, "Gunakan --username dan --display-name melalui terminal terkontrol.\n");
    exit(1);
}

// Password sengaja TIDAK diwajibkan lewat argumen CLI: argumen proses terlihat di
// `ps aux` dan tersimpan di shell history. --password tetap didukung untuk
// automasi/CI terkendali, tapi default-nya adalah prompt interaktif tersembunyi.
if (array_key_exists('password', $options) && $options['password'] !== false) {
    $password = (string) $options['password'];
} else {
    $password = readHiddenPassword('Password superadmin: ');
    $confirm = readHiddenPassword('Ulangi password: ');
    if (!hash_equals($password, $confirm)) {
        fwrite(STDERR, "Password dan konfirmasi tidak cocok.\n");
        exit(1);
    }
}

if ($password === '') {
    fwrite(STDERR, "Password tidak boleh kosong.\n");
    exit(1);
}

requirePasswordPolicy($password);

$pdo = database();
$pdo->beginTransaction();

try {
    // SELECT ... FOR UPDATE mengunci baris yang cocok agar dua proses bootstrap
    // yang berjalan bersamaan tidak lolos cek ini secara bersamaan (TOCTOU).
    // Catatan: berlaku untuk mesin dengan row locking (mis. MySQL InnoDB). Jika
    // engine tidak mendukungnya, unique constraint di schema + tangkapan
    // PDOException di bawah tetap jadi jaring pengaman terakhir.
    $count = (int) $pdo->query(
        "SELECT COUNT(*) FROM users WHERE role = 'superadmin' FOR UPDATE"
    )->fetchColumn();

    if ($count > 0) {
        $pdo->rollBack();
        fwrite(STDERR, "Superadmin awal sudah tersedia.\n");
        exit(1);
    }

    $userId = 'usr-' . bin2hex(random_bytes(12));

    $stmt = $pdo->prepare(
        'INSERT INTO users (id, username, display_name, password_hash, role, active, must_change_password)
         VALUES (:id, :username, :display_name, :password_hash, \'superadmin\', 1, 0)'
    );
    $stmt->execute([
        ':id' => $userId,
        ':username' => $username,
        ':display_name' => $displayName,
        ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
    ]);

    // TODO(BLOCKED on server/schema.sql + bootstrap.php dari M2.1/M3.5):
    // Insert audit event di sini, dalam transaksi yang sama, mis.:
    //   recordAuditEvent($pdo, [
    //       'event_type' => 'superadmin_bootstrap',
    //       'actor_id'   => $userId,
    //       'target_id'  => $userId,
    //       'scope'      => null,
    //   ]);
    // Nama tabel/kolom dan helper audit belum dikonfirmasi -- JANGAN deploy
    // sebelum baris ini diisi, karena RULES M2.4 mewajibkan audit event dan
    // tanpanya DONE-IF tidak terpenuhi.

    $pdo->commit();
} catch (\PDOException $e) {
    $pdo->rollBack();
    // Constraint unik di level schema (jika ada) jadi jaring pengaman kedua
    // terhadap race condition, di luar lock baris di atas.
    fwrite(STDERR, "Gagal membuat superadmin: kemungkinan sudah ada atau username bentrok.\n");
    exit(1);
}

fwrite(STDOUT, "Superadmin berhasil dibuat.\n");

/**
 * Baca input dari STDIN tanpa menampilkan karakter ke terminal (mis. password).
 * Bergantung pada `stty` (tersedia di lingkungan POSIX/cPanel standar).
 */
function readHiddenPassword(string $prompt): string
{
    fwrite(STDOUT, $prompt);
    $sttyOriginal = shell_exec('stty -g');
    shell_exec('stty -echo');
    $input = fgets(STDIN);
    shell_exec('stty ' . trim((string) $sttyOriginal));
    fwrite(STDOUT, "\n");
    return trim((string) $input);
}