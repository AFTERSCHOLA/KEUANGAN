#!/usr/bin/env php
<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Perintah ini hanya dapat dijalankan melalui CLI.\n");
    exit(1);
}

$options = getopt('', ['username:', 'display-name:', 'password:']);
$username = trim((string) ($options['username'] ?? ''));
$displayName = trim((string) ($options['display-name'] ?? ''));
$password = (string) ($options['password'] ?? '');
if ($username === '' || $displayName === '' || $password === '') {
    fwrite(STDERR, "Gunakan --username, --display-name, dan --password melalui terminal terkontrol.\n");
    exit(1);
}
requirePasswordPolicy($password);

$pdo = database();
$count = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'superadmin'")->fetchColumn();
if ($count > 0) {
    fwrite(STDERR, "Superadmin awal sudah tersedia.\n");
    exit(1);
}

$stmt = $pdo->prepare('INSERT INTO users (id, username, display_name, password_hash, role, active, must_change_password) VALUES (:id, :username, :display_name, :password_hash, \'superadmin\', 1, 0)');
$stmt->execute([
    ':id' => 'usr-' . bin2hex(random_bytes(12)),
    ':username' => $username,
    ':display_name' => $displayName,
    ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
]);
fwrite(STDOUT, "Superadmin berhasil dibuat.\n");
