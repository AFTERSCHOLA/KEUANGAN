<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

// AA.D.1 (D-AA4, R-AA2): 401 first (cookie OR Bearer), then 403 CSRF
// on the cookie path only (Bearer-only skips, both-present requires) —
// both before we touch the body or the database at all. Scope stays in
// the SAME requireAuthorization() call below (R-AA1).
$user = requireAuthUserOrBearer();

$record = requireRecord(requestJson());
requireAuthorization('write', 'sppPayments', $record, $user);
insertLedger('sppPayments', $record);