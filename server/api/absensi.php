<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

// 401 first (who are you), then CSRF (403 — proves this came from our own
// app, not a forged cross-site request) — both before we touch the body
// or the database at all.
$user = requireAuthenticatedUser();
requireCsrf();

// Structural validation (422) before authorization (403) — a malformed
// record shouldn't leak whether it would've been in-scope or not.
$record = requireRecord(requestJson());
requireAuthorization('write', 'absensi', $record, $user);
insertLedger('absensi', $record);