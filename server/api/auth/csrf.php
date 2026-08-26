<?php
declare(strict_types=1);
require_once __DIR__ . '/../../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
requireAuthenticatedUser();
jsonResponse(['csrfToken' => csrfToken()]);
