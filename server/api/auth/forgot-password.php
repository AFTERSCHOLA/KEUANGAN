<?php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once __DIR__ . '/../../lib/mailer.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method tidak diizinkan'], 405);
}

$body = requestJson();
$identity = isset($body['identity']) && is_string($body['identity']) ? trim($body['identity']) : '';
if ($identity === '') {
    jsonResponse(['error' => 'Username atau email wajib diisi'], 422);
}

$pdo = database();
$stmt = $pdo->prepare('SELECT id, username, display_name, email, active FROM users WHERE active = 1 AND (username = :u OR email = :e) LIMIT 1');
$stmt->execute([':u' => $identity, ':e' => $identity]);
$user = $stmt->fetch();

if (!$user) {
    jsonResponse(['error' => 'Pengguna tidak ditemukan'], 404);
}

$email = isset($user['email']) && is_string($user['email']) ? trim($user['email']) : '';
if ($email === '') {
    jsonResponse(['error' => 'Akun ini belum memiliki email terdaftar. Silakan hubungi Superadmin untuk mereset kata sandi.'], 422);
}

$rawToken = bin2hex(random_bytes(32));
$hash = hash('sha256', $rawToken);
$expires = date('Y-m-d H:i:s', time() + 3600); // 1 hour

$updateStmt = $pdo->prepare('UPDATE users SET reset_token_hash = :hash, reset_token_expires_at = :expires WHERE id = :id');
$updateStmt->execute([
    ':hash' => $hash,
    ':expires' => $expires,
    ':id' => $user['id'],
]);

// Determine base URL for reset link
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$baseUrl = $scheme . '://' . $host;
if (!empty($_SERVER['HTTP_ORIGIN'])) {
    $baseUrl = rtrim((string)$_SERVER['HTTP_ORIGIN'], '/');
}
$resetLink = $baseUrl . '/?resetToken=' . urlencode($rawToken);

$displayName = htmlspecialchars((string)($user['display_name'] ?? $user['username']), ENT_QUOTES, 'UTF-8');
$escapedLink = htmlspecialchars($resetLink, ENT_QUOTES, 'UTF-8');
$expiresFormatted = date('H:i', time() + 3600);

$htmlBody = <<<HTML
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
    <h2 style="color: #1e3a8a; margin-top: 0;">Reset Kata Sandi Akun Afterschola</h2>
    <p>Halo <strong>{$displayName}</strong>,</p>
    <p>Kami menerima permintaan untuk mengatur ulang kata sandi akun Afterschola Anda. Klik tombol di bawah ini untuk melanjutkan:</p>
    <div style="margin: 28px 0; text-align: center;">
        <a href="{$escapedLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Kata Sandi</a>
    </div>
    <p>Atau salin dan tempel tautan berikut di peramban (browser) Anda:</p>
    <p style="word-break: break-all; background-color: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 0.9em;"><a href="{$escapedLink}" style="color: #2563eb;">{$escapedLink}</a></p>
    <p style="color: #64748b; font-size: 0.9em; margin-top: 24px;">Tautan ini hanya berlaku selama <strong>1 jam</strong>. Jika Anda tidak merasa melakukan permintaan ini, silakan abaikan email ini dan kata sandi Anda tidak akan berubah.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
    <p style="color: #94a3b8; font-size: 0.8em; margin-bottom: 0;">Email ini dikirim secara otomatis oleh sistem Afterschola Admin Dashboard.</p>
</div>
HTML;

sendEmail($email, 'Reset Kata Sandi - Afterschola', $htmlBody);
auditEvent('password_reset_requested', null, 'user', (string)$user['id']);

jsonResponse([
    'ok' => true,
    'message' => 'Tautan reset kata sandi telah dikirim ke email terdaftar.',
]);
