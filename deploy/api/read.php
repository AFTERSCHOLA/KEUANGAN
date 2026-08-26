<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);
$entity = $_GET['entity'] ?? null;
$entities = $entity ? [$entity] : ['absensi', 'sppPayments', 'honorPayments'];
$output = [];
$pdo = database();
foreach ($entities as $name) {
    $config = entityConfig($name);
    $rows = $pdo->query("SELECT payload FROM {$config['table']} ORDER BY created_at, id")->fetchAll();
    $output[$name] = array_map(static fn (array $row): mixed => json_decode($row['payload'], true), $rows);
}
jsonResponse($entity ? ($output[$entity] ?? []) : $output);
