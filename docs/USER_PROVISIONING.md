# User Provisioning (Branch Onboarding + Trainer Login Accounts)

**Status:** Implementation in progress — see `~/.commandcode/plans/user-provisioning-plan.md` for the full decision set and verification plan. This doc is the executable spec.

**Purpose:** Define how Super Admin onboards a Branch (and its Branch Admin) and how Branch Admin onboards its Trainers (with login accounts) in a single transactional flow.

---

## 1. Decision Set

| # | Decision | Status |
|---|---|---|
| D1 | Super Admin = overseer, does NOT create Trainers or Trainer login accounts | Locked |
| D2 | Super Admin creates Branch + Branch Admin in one flow (single API call, transactional) | Locked |
| D3 | Branch Admin creates Trainer record + Trainer login account in one flow (single API call, transactional) | Locked |
| D4 | Initial password is system-generated, returned once, `mustChangePassword = 1`. User must change on first login via existing `MustChangePasswordPage`. | Locked |
| D5 | **No per-branch account cap.** Dropped. Reversible later if reality demands. | Locked |
| D6 | Trainer records without login accounts remain allowed (substitute-trainer case). Not counted against any cap (D5 removed caps). | Locked |
| D7 | No trainer branch-selector UI in `TrainerForm`. Branch Admin's branch auto-fills from `ctx.cabangId`. (Closes the carried-over "missing branch selector" gap from the conversation that produced this plan.) | Locked |
| D8 | All writes go through a single `users.php` endpoint | Locked |
| D9 | Trainer record + user account are atomic — rollback one rolls back both | Locked |

---

## 2. Endpoint: `POST /api/users.php`

### Authentication & CSRF
Every state-changing call requires a valid session cookie and the `X-CSRF-Token` header.

### 2.1 `action: 'create'`

**Request body:**

```json
{
  "action": "create",
  "role": "admin_cabang" | "trainer",
  "username": "string, 3-64 chars, [a-zA-Z0-9_.-]",
  "displayName": "string, non-empty",
  "cabangId": "string, must reference an existing cabang row (superadmin) or match session.cabangId (admin_cabang)",
  "trainer": {                          // REQUIRED when role === "trainer"
    "nama": "string, non-empty",
    "wa": "string",
    "jadwal": "string",
    "honor": "number, default 0",
    "sekolahIds": ["string", ...]       // optional, must reference sekolah in same branch
  }
}
```

**Validation order:** body shape → branch scoping (per role) → trainer record insert → username uniqueness (proactive) → password generation → user insert (transactional) → audit events → response.

**Response (201):**

```json
{
  "ok": true,
  "user": {
    "id": "usr-<24 hex>",
    "username": "...",
    "displayName": "...",
    "role": "admin_cabang|trainer",
    "cabangId": "...",
    "trainerId": "trn-...|null",
    "active": true,
    "mustChangePassword": true
  },
  "initialPassword": "<16 chars, mixed case + digit>",
  "trainer": { "id": "trn-...", "nama": "...", ... }   // present only when role === "trainer"
}
```

**Error cases:**

| Status | When |
|---|---|
| 400 | `action` missing or unsupported |
| 401 | No session cookie |
| 403 | CSRF missing/mismatched, OR admin_cabang trying to create admin_cabang, OR admin_cabang targeting a different branch, OR trainer role using endpoint |
| 422 | Missing/invalid fields, non-existent cabang, duplicate username, empty trainer nama |
| 500 | Database error after all validation passed |

**Branch-scoping rules:**

- **superadmin**: can create `admin_cabang` or `trainer` in any existing `cabang`.
- **admin_cabang**: can create only `trainer`, and only in `session.cabangId`.

**Transactional semantics:**

- If `role === 'trainer'`, a `trainer` row is INSERTed first (with payload + branch id).
- Then `users` row is INSERTed in a transaction.
- If the `users` INSERT fails (duplicate username caught by FK, deadlock, anything), the previously-created `trainer` row is rolled back via `rollbackTrainerRecord()` which also undoes the `sekolah.trainerIds[]` reverse-link.
- `trainer_created` and `user_created` audit events are emitted ONLY after the transaction commits.

### 2.2 `action: 'update'`

**Request body:** `{ id, displayName?, active? }`

**Validation:** Branch scoping — admin_cabang can only update trainers in own branch. Cannot change role (would require delete + recreate).

**Response:** `{ ok: true, id }`

### 2.3 `action: 'delete'`

Soft-delete via `active = 0`. Branch scoping same as `update`. Returns `{ ok, id }`.

### 2.4 `action: 'reset_password'`

Generates a new initial password, sets `must_change_password = 1`, returns the password in response. Branch scoping same as `update`.

**Response:** `{ ok, id, initialPassword }`

---

## 3. Frontend Flows

### 3.1 Flow A — Super Admin onboards Branch + Admin

Lives in `src/features/admin/BranchManager.jsx`. The single onboarding form (`BranchOnboardingForm`) replaces the current `BranchForm`. Adds:

- Display name input (for the new admin)
- Username input
- "Buat Akun Admin untuk Cabang Ini" toggle (default on)
- On submit, after server returns 201, shows an `AlertDialog` with the initial password and a copy-to-clipboard button. The dialog requires explicit acknowledgement ("Saya sudah catat") before closing.

### 3.2 Flow B — Branch Admin onboards Trainer

Lives in `src/features/trainers/TrainerList.jsx`. Extends `TrainerForm` with:

- Username input
- "Buat Akun Login untuk Trainer Ini" toggle (default on; off when the trainer is a substitute without login credentials)
- On submit success, same AlertDialog-with-initial-password pattern as Flow A.

### 3.3 Store wiring

`src/lib/store.js` `WRITE_ENDPOINTS` map gains `'users' => '/api/users.php'`. No other changes — `writeRemote('users', record)` works through the existing adapter.

---

## 4. Why no per-branch cap

The cap was originally considered as a safety valve but rejected for three reasons:

1. **No schema column exists for it** and the privilege doc never asked for one — adding it would be a fresh business rule, not a defense.
2. **Test data hygiene** is what actually motivates the concern. That's solved by `DELETE FROM users WHERE username LIKE 'test_%'` after tests, not by a production cap.
3. **Reversible**: if real-world usage shows runaway account creation, the cap can be added later with real data to calibrate the number.

---

## 5. Why system-generated initial passwords (D4)

Re-uses the existing `must_change_password` column (schema.sql line 22) and the existing `MustChangePasswordPage.jsx`. The Branch Admin or Super Admin sees the password exactly once at creation time, then forgets it. The Trainer/Admin changes it on first login. This:

- Stops admins from setting weak passwords they know forever.
- Re-uses audited infrastructure that already works.
- Fits the "trust the server" principle (the admin doesn't need to *know* the password long-term, only to relay it once).

---

## 6. Audit event catalog

| Event | Target type | When |
|---|---|---|
| `user_created` | user | Successful `create` |
| `trainer_created` | trainer | Successful `create` with `role === 'trainer'` (emitted after parent commit) |
| `user_updated` | user | Successful `update` |
| `user_deactivated` | user | Successful `delete` (soft) |
| `user_password_reset` | user | Successful `reset_password` |

---

## 7. Open / Parked Questions

- "Can Super Admin create a Trainer for a branch temporarily without a Branch Admin?" — **No, per D1.** If a real need arises, revisit.
- "What happens when a Branch Admin leaves?" — **Deactivate via `users.php` `update` with `active: false`.** The trainer records they created remain; the branch can have a new admin assigned.
- "Can Trainers change their own username?" — **No.** Username is identity. Contact Super Admin.
- "Soft-delete trash / 30-day recovery?" — **Deferred** per `PRODUCTION_PLAN.md:7`.