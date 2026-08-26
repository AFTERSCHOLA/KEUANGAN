<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

function contractCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

foreach (['superadmin', 'admin_cabang', 'trainer'] as $role) {
    contractCheck(validServerRole($role), "Canonical role rejected: {$role}");
}

foreach (['admin', 'head-trainer', 'client', 'unknown', '', null, 1, true, []] as $role) {
    contractCheck(!validServerRole($role), 'Non-canonical role accepted');
}

$identity = safeIdentity([
    'id' => 'usr-contract',
    'username' => 'contract@example.test',
    'displayName' => 'Contract Test',
    'role' => 'trainer',
    'cabangId' => 'cbg-contract',
    'trainerId' => 'trn-contract',
    'active' => 1,
    'mustChangePassword' => 0,
    'password' => 'should-not-leak',
    'password_hash' => 'should-not-leak',
    'failedLoginCount' => 7,
    'lockedUntil' => '2099-01-01 00:00:00',
]);

$expectedKeys = ['id', 'username', 'displayName', 'role', 'cabangId', 'trainerId', 'active', 'mustChangePassword'];
contractCheck(array_keys($identity) === $expectedKeys, 'Safe identity field allowlist changed');
foreach (['password', 'password_hash', 'failedLoginCount', 'lockedUntil'] as $field) {
    contractCheck(!array_key_exists($field, $identity), "Sensitive field leaked: {$field}");
}
contractCheck($identity['role'] === 'trainer', 'Safe identity role changed');
contractCheck($identity['active'] === true, 'Safe identity active flag is not boolean');
contractCheck($identity['mustChangePassword'] === false, 'Safe identity password-change flag is not boolean');

echo "G0.2 PHP identity contract passed\n";
