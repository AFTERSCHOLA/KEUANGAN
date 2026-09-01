# Trainer Account `cabangId` — Session as Authority

**Status:** Implementation in progress
**Scope:** Branch Admin → Trainer (with login account) creation flow only.
**Touches:** `deploy/api/users.php`, `src/features/trainer/TrainerList.jsx`

---

## 1. Problem

`USER_PROVISIONING.md D7` already says "No trainer branch-selector UI in `TrainerForm`. Branch Admin's branch auto-fills from `ctx.cabangId`." But the *current code* (`deploy/api/users.php:70–87`, `src/features/trainers/TrainerList.jsx:49–51, 94–101`) implements that as a hidden client-side field:

- `openAdd()` reads `ctx.cabangId` and stashes it on `form.cabangId`.
- `save()` sends `cabangId: form.cabangId` in the body.
- The server reads it back, runs an existence check, and (for `admin_cabang`) compares it against the session — returning 403 on mismatch.

This is a hidden, never-shown field that the client has to plumb through just so the server can verify it matches the session. The server *already* has the authority (`$user['cabangId']`) — the body field is redundant noise, and a leaky abstraction (DevTools can spoof it).

The same asymmetry exists for `trainer.php` already correctly resolved: `deploy/api/trainer.php:27–33` actively rejects any `cabangId` in the body for branch admins and forces it from session.

## 2. Goal

Make `POST /api/users.php` follow the `trainer.php` rule for the `admin_cabang` actor:

- **Branch Admin**: `cabangId` is server-derived from the session. Any `cabangId` key in the request body is rejected outright. No client plumbing needed.
- **Super Admin**: keeps the current behavior — they must supply `cabangId` in the body because their session has no branch.

Trainer accounts created this way are bound to the branch admin's own branch at the SQL level (`users.cabang_id`, `trainer.cabang_id`) atomically with the trainer record, exactly as today.

## 3. Files Touched

| File | Change |
|---|---|
| `deploy/api/users.php` (`createUser`) | Replace body-supplied `cabangId` validation with session-first derivation. Branch Admin: ignore body key, use `$user['cabangId']`; reject if session has none. Super Admin: keep body-supplied + existence check. |
| `src/features/trainers/TrainerList.jsx` (`save`, `openAdd`) | Stop sending `cabangId` in the trainer-create-account request body. `openAdd` no longer needs to read `readCached('cabang')` for that path (still needed for `cabangKode` in `newTrainer`). |

## 4. Microtasks

### M1 — Server: session-first `cabangId` derivation

**Edit:** `deploy/api/users.php`, function `createUser`, lines 70–88.

Replace:

```php
$cabangId = isset($data['cabangId']) && is_string($data['cabangId']) ? trim($data['cabangId']) : '';
if ($cabangId === '') jsonResponse(['error' => 'cabangId wajib diisi'], 422);

if ($role === 'admin_cabang') {
    if ($targetRole !== 'trainer') {
        jsonResponse(['error' => 'Admin Cabang hanya dapat membuat akun trainer'], 403);
    }
    if ($cabangId !== ($actorCabangId ?? '')) {
        jsonResponse(['error' => 'Admin Cabang hanya dapat membuat akun untuk cabang sendiri'], 403);
    }
} else {
    // superadmin: ensure target cabang actually exists
    $check = database()->prepare('SELECT 1 FROM cabang WHERE id = :id');
    $check->execute([':id' => $cabangId]);
    if ($check->fetchColumn() === false) {
        jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
    }
}
```

With:

```php
if ($role === 'admin_cabang') {
    if ($targetRole !== 'trainer') {
        jsonResponse(['error' => 'Admin Cabang hanya dapat membuat akun trainer'], 403);
    }
    // Session is the authority. Reject any client-supplied cabangId outright
    // so DevTools tampering can't bypass branch scoping (mirrors trainer.php).
    if (array_key_exists('cabangId', $data)) {
        jsonResponse(['error' => 'cabangId tidak boleh dikirim'], 422);
    }
    $cabangId = $actorCabangId;
    if (!is_string($cabangId) || $cabangId === '') {
        jsonResponse(['error' => 'Sesi Admin Cabang tidak memiliki cabangId'], 403);
    }
} else {
    // superadmin: must supply a valid target branch
    $cabangId = isset($data['cabangId']) && is_string($data['cabangId']) ? trim($data['cabangId']) : '';
    if ($cabangId === '') jsonResponse(['error' => 'cabangId wajib diisi'], 422);
    $check = database()->prepare('SELECT 1 FROM cabang WHERE id = :id');
    $check->execute([':id' => $cabangId]);
    if ($check->fetchColumn() === false) {
        jsonResponse(['error' => 'cabangId tidak ditemukan'], 422);
    }
}
```

**VERIFY:**
- `cd deploy && php -l api/users.php` → no syntax errors.
- Manual trace: branch admin POSTs `{action:'create', role:'trainer', username:'x', displayName:'y', trainer:{...}}` (no `cabangId`) → server stamps `$user['cabangId']` into both `trainer.cabang_id` and `users.cabang_id`. Response includes the canonical `cabangId`.
- Same request with `cabangId: 'cbg-other'` → 422 "cabangId tidak boleh dikirim".
- Super admin path unchanged: must send `cabangId`; existence check still runs.

### M2 — Frontend: drop `cabangId` from trainer-create-account body

**Edit:** `src/features/trainers/TrainerList.jsx`, `save()` around line 94.

Replace:

```js
result = await writeRemote('users', {
  action: 'create',
  role: 'trainer',
  username: username.trim(),
  displayName: form.nama,
  cabangId: form.cabangId,
  trainer: trainerPayload,
})
```

With:

```js
result = await writeRemote('users', {
  action: 'create',
  role: 'trainer',
  username: username.trim(),
  displayName: form.nama,
  trainer: trainerPayload,
})
```

`openAdd()` still calls `newTrainer(branch.id, branch.kode)` for the offline-edit / non-account-create path, so `form.cabangId` is still set locally for that. The only payload change is: the trainer-with-account request body no longer carries `cabangId`.

**VERIFY:**
- `npm run lint` (or project's lint script) clean.
- Playwright/dev-server run: Branch Admin opens TrainerList → Tambah Trainer Baru → fills form → Simpan → account is created and bound to the branch admin's own branch.
- DevTools network panel: request body has no `cabangId` key; response includes the canonical `cabangId` stamped by the server.

## 5. Out of Scope

- `superadmin` branch-create-account flow (`BranchManager.jsx`) is untouched — superadmin still picks a branch.
- Trainer without login account (`createAccount: false`) still uses `/api/trainer.php`, which already enforces session-as-authority.
- No DB migration, no schema change. `users.cabang_id` and `trainer.cabang_id` stay NOT NULL; the values are derived, not stored differently.

## 6. Done-If

- A Branch Admin can create a Trainer account without ever supplying a `cabangId`.
- The new trainer's `users.cabang_id` and `trainer.cabang_id` equal the admin's session `cabangId`.
- A DevTools-tampered `cabangId` in the request body returns 422.
- Super Admin's flow is byte-identical to before.
- `php -l` clean; project's lint clean; one Playwright smoke run on the trainer-create flow passes.
