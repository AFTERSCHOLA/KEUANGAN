<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';

// LP.B.2 — Logo current-id endpoint (F-LP3; D-LP2, D-LP3; R-LP1, R-LP3).
//
// Concrete pick (taste #17; LOGO_PORTABILITY_PLAN.md §8): the current logo
// id is the latest `logo_uploaded` audit row's target_id, validated against
// photo_uploads with cabang_id IS NULL. No new table. updatedAt is the
// photo_uploads.created_at of that row (authoritative bytes timestamp).
//
// Auth (mirrors photo-download.php / read.php GET idiom): cookie session
// only, no CSRF (a hydration fetch cannot send X-CSRF-Token). Any
// authenticated role may read the current id — the full settings payload
// stays superadmin-only (D-LP3: roleCanReadEntity() untouched, no settings
// row is ever read here).
//
// Order: 405 method -> 401 auth -> 403 invalid role -> 404 no logo -> 200.
// A dangling audit row (target missing or not a global logo) is 404, not
// 500, so a pruned/edited photo_uploads table reads as "no logo" instead
// of leaking which ids exist.

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method tidak diizinkan'], 405);

$user = requireAuthenticatedUser();

$role = $user['role'] ?? null;
if (!validServerRole($role)) jsonResponse(['error' => 'Akses tidak diizinkan'], 403);

$pdo = database();

$audit = $pdo->query(
    "SELECT target_id FROM audit_log WHERE event_type = 'logo_uploaded' ORDER BY id DESC LIMIT 1"
);
$auditRow = $audit === false ? false : $audit->fetch();
$logoId = is_array($auditRow) ? ($auditRow['target_id'] ?? null) : null;
if (!is_string($logoId) || $logoId === '') {
    jsonResponse(['error' => 'Logo belum diunggah'], 404);
}

$stmt = $pdo->prepare('SELECT id, cabang_id, created_at FROM photo_uploads WHERE id = :id');
$stmt->execute([':id' => $logoId]);
$row = $stmt->fetch();
if ($row === false) {
    jsonResponse(['error' => 'Logo belum diunggah'], 404);
}

// Logo tier is global-only: a target that is not a NULL-branch row is not
// a logo (never serve a branch photo through this endpoint — D-RH9 stays
// branch-scoped, D-LP3).
if ($row['cabang_id'] !== null) {
    jsonResponse(['error' => 'Logo belum diunggah'], 404);
}

jsonResponse(['id' => $row['id'], 'updatedAt' => $row['created_at']]);
