<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
$data = requestJson();
$action = $data['action'] ?? 'append';
if ($action === 'correct') {
    $record = $data['record'] ?? null;
    $correctionOf = $data['correctionOf'] ?? null;
    if (!is_array($record) || !is_string($correctionOf) || $correctionOf === '') {
        jsonResponse(['error' => 'Koreksi membutuhkan record dan correctionOf'], 422);
    }
    insertLedger('honorPayments', $record, $correctionOf);
}
if ($action !== 'append') jsonResponse(['error' => 'Operasi tidak didukung'], 400);
insertLedger('honorPayments', $data);
