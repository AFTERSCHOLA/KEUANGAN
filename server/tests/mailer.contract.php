<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

/**
 * server/tests/mailer.contract.php
 *
 * Contract test for Task 4:
 * - SMTP Config example template
 * - RFC 2822 email message builder
 * - Zero-dependency SMTP mailer / fallback outbox logger
 * - Users table email and password reset migration & schema
 */

$failures = 0;
$total = 0;

function check(string $label, bool $condition, string $detail = ''): void {
    global $failures, $total;
    $total++;
    if ($condition) {
        echo "  OK   {$label}\n";
    } else {
        $failures++;
        echo "  FAIL {$label}" . ($detail !== '' ? " — {$detail}" : '') . "\n";
    }
}

echo "=== mailer.contract.php ===\n";

// ---------------------------------------------------------------------------
// 1. Config example template contract
// ---------------------------------------------------------------------------
$smtpExamplePath = __DIR__ . '/../config.smtp.example.php';
check('config.smtp.example.php exists', is_file($smtpExamplePath));

if (is_file($smtpExamplePath)) {
    $exampleConfig = require $smtpExamplePath;
    check('config.smtp.example.php returns array', is_array($exampleConfig));
    $requiredKeys = ['enabled', 'host', 'port', 'secure', 'username', 'password', 'from_email', 'from_name'];
    foreach ($requiredKeys as $key) {
        check("config.smtp.example.php has key '{$key}'", array_key_exists($key, $exampleConfig));
    }
    check('config.smtp.example.php enabled is false by default', ($exampleConfig['enabled'] ?? null) === false);
}

// ---------------------------------------------------------------------------
// 2. Mailer helper functions contract
// ---------------------------------------------------------------------------
$mailerPath = __DIR__ . '/../lib/mailer.php';
check('server/lib/mailer.php exists', is_file($mailerPath));

if (is_file($mailerPath)) {
    require_once $mailerPath;

    check('smtpConfig() function exists', function_exists('smtpConfig'));
    check('buildEmailMessage() function exists', function_exists('buildEmailMessage'));
    check('sendEmail() function exists', function_exists('sendEmail'));

    if (function_exists('smtpConfig')) {
        // Without config.smtp.php created, smtpConfig should return null or config array if present
        $realConfigPath = __DIR__ . '/../config.smtp.php';
        $cfg = smtpConfig();
        if (!is_file($realConfigPath)) {
            check('smtpConfig() returns null when config.smtp.php does not exist', $cfg === null);
        } else {
            check('smtpConfig() returns array when config.smtp.php exists', is_array($cfg));
        }
    }

    if (function_exists('buildEmailMessage')) {
        $to = 'recipient@test.local';
        $subject = 'Reset Your Password';
        $html = '<p>Click <a href="http://localhost/reset">here</a> to reset.</p>';
        $extraHeaders = [
            'Reply-To' => 'support@afterschola.com',
            'X-Mailer-Tag' => 'task4-test',
        ];

        $rawMessage = buildEmailMessage($to, $subject, $html, $extraHeaders);

        check('buildEmailMessage returns string', is_string($rawMessage));
        check('buildEmailMessage has RFC 2822 header-body delimiter', strpos($rawMessage, "\r\n\r\n") !== false);

        [$headerBlock, $bodyBlock] = explode("\r\n\r\n", $rawMessage, 2);

        check('buildEmailMessage contains To header', strpos($headerBlock, "To: {$to}") !== false);
        check('buildEmailMessage contains Subject header', strpos($headerBlock, "Subject: {$subject}") !== false);
        check('buildEmailMessage contains MIME-Version header', strpos($headerBlock, "MIME-Version: 1.0") !== false);
        check('buildEmailMessage contains Content-Type header', stripos($headerBlock, "Content-Type: text/html; charset=UTF-8") !== false);
        check('buildEmailMessage contains Date header', preg_match('/^Date: /m', $headerBlock) === 1);
        check('buildEmailMessage contains From header', preg_match('/^From: /m', $headerBlock) === 1);
        check('buildEmailMessage contains Reply-To header', strpos($headerBlock, "Reply-To: support@afterschola.com") !== false);
        check('buildEmailMessage contains X-Mailer-Tag header', strpos($headerBlock, "X-Mailer-Tag: task4-test") !== false);
        check('buildEmailMessage contains HTML body', trim($bodyBlock) === trim($html));
    }

    if (function_exists('sendEmail')) {
        $outboxLog = __DIR__ . '/../data/mail_outbox.log';
        if (is_file($outboxLog)) {
            @unlink($outboxLog);
        }

        // Test sending with default/fallback mode (unconfigured or disabled SMTP)
        $sent = sendEmail('fallback-user@test.local', 'Fallback Subject', '<h1>Test body</h1>');
        check('sendEmail returns true in fallback mode', $sent === true);
        check('sendEmail writes to mail_outbox.log in fallback mode', is_file($outboxLog));
        if (is_file($outboxLog)) {
            $logContent = file_get_contents($outboxLog);
            check('mail_outbox.log records recipient', strpos($logContent, 'fallback-user@test.local') !== false);
            check('mail_outbox.log records subject', strpos($logContent, 'Fallback Subject') !== false);
        }
    }
}

// ---------------------------------------------------------------------------
// 3. Migration file & schema.sql contract
// ---------------------------------------------------------------------------
$migrationFile = __DIR__ . '/../migrations/2026-11-06-users-email-and-reset-token.sql';
check('migration file exists', is_file($migrationFile));

if (is_file($migrationFile)) {
    $migrationSql = file_get_contents($migrationFile);
    check('migration adds email column', stripos($migrationSql, 'email') !== false);
    check('migration adds reset_token_hash column', stripos($migrationSql, 'reset_token_hash') !== false);
    check('migration adds reset_token_expires_at column', stripos($migrationSql, 'reset_token_expires_at') !== false);
    check('migration adds idx_users_email index', stripos($migrationSql, 'idx_users_email') !== false);

    // Verify migration SQL executes successfully against an un-migrated schema
    $pdo = database();
    $pdo->exec("DROP TEMPORARY TABLE IF EXISTS test_users_migration");
    $pdo->exec("CREATE TEMPORARY TABLE test_users_migration (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        username VARCHAR(191) NOT NULL,
        display_name VARCHAR(191) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('superadmin', 'admin_cabang', 'trainer') NOT NULL,
        cabang_id VARCHAR(191) NULL,
        trainer_id VARCHAR(191) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        must_change_password TINYINT(1) NOT NULL DEFAULT 1,
        failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
        locked_until DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login_at DATETIME NULL
    )");

    $statements = array_filter(array_map('trim', explode(";\n", str_replace("\r\n", "\n", $migrationSql))));
    $migrationRunOk = true;
    try {
        foreach ($statements as $st) {
            $cleaned = trim(preg_replace('/^--.*$/m', '', $st));
            if ($cleaned === '') continue;
            // Replace table name users with test_users_migration
            $adapted = preg_replace('/\busers\b/', 'test_users_migration', $cleaned);
            $pdo->exec($adapted);
        }
    } catch (Throwable $e) {
        $migrationRunOk = false;
        echo "  Migration execution error: " . $e->getMessage() . "\n";
    }
    check('migration statements execute cleanly on un-migrated schema', $migrationRunOk);

    $testCols = array_column($pdo->query("SHOW COLUMNS FROM test_users_migration")->fetchAll(PDO::FETCH_ASSOC), 'Field');
    check('migrated test table has email column', in_array('email', $testCols, true));
    check('migrated test table has reset_token_hash column', in_array('reset_token_hash', $testCols, true));
    check('migrated test table has reset_token_expires_at column', in_array('reset_token_expires_at', $testCols, true));
}

$schemaFile = __DIR__ . '/../schema.sql';
check('schema.sql exists', is_file($schemaFile));
if (is_file($schemaFile)) {
    $schemaSql = file_get_contents($schemaFile);
    check('schema.sql defines email column in users', preg_match('/CREATE TABLE IF NOT EXISTS users\s*\(.*?\bemail\b.*?\)/s', $schemaSql) === 1);
    check('schema.sql defines reset_token_hash column in users', preg_match('/CREATE TABLE IF NOT EXISTS users\s*\(.*?\breset_token_hash\b.*?\)/s', $schemaSql) === 1);
    check('schema.sql defines reset_token_expires_at column in users', preg_match('/CREATE TABLE IF NOT EXISTS users\s*\(.*?\breset_token_expires_at\b.*?\)/s', $schemaSql) === 1);
    check('schema.sql defines idx_users_email in users', preg_match('/CREATE TABLE IF NOT EXISTS users\s*\(.*?\bidx_users_email\b.*?\)/s', $schemaSql) === 1);
}

// ---------------------------------------------------------------------------
// 4. Live database columns & constraints check
// ---------------------------------------------------------------------------
$pdo = database();

// Helper to get columns for users
$colsStmt = $pdo->query("SHOW COLUMNS FROM users");
$userColumns = array_column($colsStmt->fetchAll(PDO::FETCH_ASSOC), 'Field');

check('users table has email column', in_array('email', $userColumns, true));
check('users table has reset_token_hash column', in_array('reset_token_hash', $userColumns, true));
check('users table has reset_token_expires_at column', in_array('reset_token_expires_at', $userColumns, true));

// Test unique email enforcement if column exists
if (in_array('email', $userColumns, true)) {
    $testEmail = 'unique-test-' . bin2hex(random_bytes(4)) . '@test.local';
    $u1 = 'usr-t4-' . bin2hex(random_bytes(6));
    $u2 = 'usr-t4-' . bin2hex(random_bytes(6));

    $insert = $pdo->prepare(
        "INSERT INTO users (id, username, display_name, email, password_hash, role, active, must_change_password) "
      . "VALUES (:id, :username, :display_name, :email, :hash, 'trainer', 1, 0)"
    );

    $insert->execute([
        ':id' => $u1,
        ':username' => 'user1_' . bin2hex(random_bytes(4)),
        ':display_name' => 'User 1',
        ':email' => $testEmail,
        ':hash' => password_hash('Secret123', PASSWORD_DEFAULT),
    ]);

    $duplicateFailed = false;
    try {
        $insert->execute([
            ':id' => $u2,
            ':username' => 'user2_' . bin2hex(random_bytes(4)),
            ':display_name' => 'User 2',
            ':email' => $testEmail,
            ':hash' => password_hash('Secret123', PASSWORD_DEFAULT),
        ]);
    } catch (PDOException $e) {
        $duplicateFailed = true;
    }
    check('duplicate email throws PDOException', $duplicateFailed);

    // Test nullable email allowed (multiple users can have NULL email)
    $u3 = 'usr-t4-' . bin2hex(random_bytes(6));
    $u4 = 'usr-t4-' . bin2hex(random_bytes(6));
    $nullEmailAllowed = true;
    try {
        $insert->execute([
            ':id' => $u3,
            ':username' => 'user3_' . bin2hex(random_bytes(4)),
            ':display_name' => 'User 3',
            ':email' => null,
            ':hash' => password_hash('Secret123', PASSWORD_DEFAULT),
        ]);
        $insert->execute([
            ':id' => $u4,
            ':username' => 'user4_' . bin2hex(random_bytes(4)),
            ':display_name' => 'User 4',
            ':email' => null,
            ':hash' => password_hash('Secret123', PASSWORD_DEFAULT),
        ]);
    } catch (PDOException $e) {
        $nullEmailAllowed = false;
    }
    check('multiple users with NULL email are allowed', $nullEmailAllowed);

    // Cleanup test records
    $pdo->prepare("DELETE FROM users WHERE id IN (?, ?, ?, ?)")->execute([$u1, $u2, $u3, $u4]);
}

echo "\nSummary: {$total} checks, {$failures} failed\n";

if ($failures > 0) {
    exit(1);
}
exit(0);
