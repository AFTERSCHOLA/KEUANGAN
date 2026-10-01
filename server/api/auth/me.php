<?php
declare(strict_types=1);
require_once __DIR__ . '/../../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
// AA.B.1 (D-AA10 + ruling 1): safe read — Bearer-first without CSRF;
// else today's cookie session (no CSRF on GET; api.js never sends one,
// bootstrapAuth relies on skipCsrf). Cookie POST CSRF rules elsewhere stay.
$bearer = serviceBearerUser();
if (is_array($bearer)) jsonResponse(['user' => $bearer]);
jsonResponse(['user' => safeIdentity(requireAuthenticatedUser())]);
