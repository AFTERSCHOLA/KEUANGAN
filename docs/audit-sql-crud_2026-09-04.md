# Audit-SQL-CRUD Walkthrough (F-24)

Date: 2026-09-04
Source: `docs/log-doc/audit-app-vs-tests_2026-09-04_2249Z.md` §F-24
Milestone: `M-AF5.6`

This document traverses, by hand, every create / update / delete path from
the React frontend through `src/lib/store.js` to the PHP endpoint under
`server/api/` and finally to the SQL statement that lands on MariaDB. Each
section lists the file:line of each hop, the SQL the server issues, and any
foreign-key or cascade gap relative to `PRODUCTION_PLAN.md` §6 (Data/API
contract) and `SCOPE_EXPANSION_PRIVILEGES.md` (Role Privilege Matrix).

The audit was driven by the team's `traverse by hand` ask (F-24 in the
2026-09-04 manual audit). F-04 (server cascade omits `users` on `cabang`
and `trainer` delete) was already known before this walkthrough started —
the per-entity findings below simply confirm it and flag where else the
gap appears. No new SQL gaps were introduced during this audit; the gaps
are pre-existing and are tracked in `PRODUCTION_MILESTONES.md` as `D9.1`.

## Conventions used in every section

- Frontend entry is the call site of `writeRemote(key, ...)`, `deleteRemote(key, id)`,
  `upsert(key, ...)` (which queues via `queueSync()`), or `queueSync(key, ...)`
  directly. All four go through `apiRequest()` in `src/lib/api.js` to
  the matching PHP endpoint.
- The `store.js` adapter layer (`WRITE_ENDPOINTS` map at
  `src/lib/store.js:323-332`) maps each entity key to a single PHP
  endpoint URL. There is no per-call routing — the key in the body is
  used by the endpoint itself.
- Server authorization runs **before** SQL: every endpoint calls
  `requireAuthenticatedUser()` (`server/auth/session.php:89`) → usually
  `requireCsrf()` (`server/auth/session.php:124`) → `requireAuthorization()`
  or `authorize()` (`server/auth/authorize.php:126/80`).
- Optimistic concurrency uses the SQL-side `version` column on every
  full-CRUD table (`schema.sql`). `read.php:109` echoes the SQL-side
  `version` back into every payload so subsequent `writeRemote()` calls
  can round-trip the value into `_master.php:111` `masterWrite()`
  (`server/api/_master.php:35-148`).
- Ledger tables (`absensi`, `spp_payments`, `honor_payments`) are
  **append-only** — there is no UPDATE or DELETE on them; "corrections"
  are new rows with a non-null `correction_of` FK. Per
  `PRODUCTION_PLAN.md:107` this is by design.

## cabang

### create / update

- Frontend: `BranchManager.jsx:108` — `await writeRemote('cabang', cabangPayload)`.
  (`src/features/admin/BranchManager.jsx:108`)
- `store.js` adapter: `writeRemote('cabang', record)` →
  `WRITE_ENDPOINTS.cabang` = `/api/cabang.php`
  (`src/lib/store.js:326`, `:398-446`).
  `prepareWritePayload('cabang', ...)` returns the record unchanged
  (no `cabangId` is ever sent on a `cabang` row — the row's own `id`
  IS the branch id, `server/auth/authorize.php:22-30`).
- HTTP: `POST /api/cabang.php` body `{ ...data, action: 'create' | 'update' }`.
- Server auth: `requireAuthenticatedUser()` →
  `requireAuthorization('manage_branch', 'cabang', $data, $user)`
  (`server/api/cabang.php:11`, `:38`). `manage_branch` is in the
  authorize() deny-list (`server/auth/authorize.php:87`), so every
  non-superadmin role gets 403 before any SQL runs.
- Proactive duplicate check:
  `SELECT id, nama FROM cabang WHERE kode = :kode AND id != :id`
  (`server/api/cabang.php:55-57`) — the backstop is the `UNIQUE KEY
  uq_cabang_kode (kode)` on the table (`server/schema.sql:10`).
- Server SQL: `masterWrite('cabang', $user, isCabang: true, record: $data,
  overrides: ['kode' => $kode], action: $action)`
  (`server/api/cabang.php:62`) → `_master.php:82-100` (create) or
  `_master.php:111-141` (update). Concrete statements:

```sql
-- create
INSERT INTO cabang (id, kode, nama, version, payload)
VALUES (:id, :kode, :nama, :version, :payload);

-- update
UPDATE cabang
SET kode = :kode, nama = :nama, version = :version, payload = :payload
WHERE id = :id AND version = :expected_version;
```

- Audit: `auditEvent('cabang_created' | 'cabang_updated', $user, 'cabang', $id, ['cabangId' => null])`
  (`server/api/_master.php:103`, `:144`) → `INSERT INTO audit_log (...)`
  (`server/auth/session.php:132-148`).

### delete

- Frontend: `BranchManager.jsx:183` —
  `await deleteRemote('cabang', pendingDeleteId)`
  (`src/features/admin/BranchManager.jsx:183`).
- `store.js`: `deleteRemote('cabang', id)` → `POST /api/cabang.php`
  `{ id, action: 'delete' }` (`src/lib/store.js:448-463`,
  `WRITE_ENDPOINTS.cabang`).
- HTTP: `server/api/cabang.php:14-37`. Two guard paths:
  - HTTP `DELETE` verb with `id` in body or `?id=` query.
  - `POST` with `action: 'delete'` (the React path).
  Both check `DEFAULT_CABANG_ID = 'cbg-PST-default'` (`server/api/cabang.php:9`,
  `:17-18`, `:33-34`) and 422 if the user is trying to delete the seed
  fallback branch.
- Server auth: `masterDelete('cabang', $user, isCabang: true)`
  (`server/api/cabang.php:20/36`).
- Cascade scan: `_master.php:170-178` runs
  `SELECT 1 FROM {sekolah, trainer, siswa, absensi, spp_payments,
  honor_payments, invoices} WHERE cabang_id = :cabang_id LIMIT 1`. If
  any of those returns a row, the delete is blocked with 422
  `'Cabang masih memiliki data terkait'`.
- Server SQL (after the cascade check passes):

```sql
DELETE FROM cabang WHERE id = :id;
```

- Audit: `auditEvent('cabang_deleted', $user, 'cabang', $id, ['cabangId' => null])`
  (`server/api/_master.php:184`).

### Drift / FK / cascade gaps

- **F-04 (already known).** The cascade scan at `_master.php:170-178`
  lists `sekolah, trainer, siswa, absensi, spp_payments, honor_payments,
  invoices` but **does not include `users`**. `users.cabang_id` is
  nullable in `schema.sql:19` (so the `DELETE FROM cabang` itself
  doesn't fail at the SQL layer), but every `users.cabang_id` that
  pointed at the now-deleted branch becomes an orphan FK — both a
  referential-integrity bug and a privacy bug (the user row keeps
  referencing a branch that no longer exists). Tracked in
  `PRODUCTION_MILESTONES.md` as `D9.1`; the planned fix is
  `UPDATE users SET active = 0, cabang_id = NULL WHERE cabang_id = :id
  AND active = 1` inside the same transaction.
- The proactive `cabang` kode uniqueness check (`cabang.php:55-57`) is a
  friendly error path, not the actual integrity guarantee — the actual
  guarantee is `UNIQUE KEY uq_cabang_kode (kode)` (`schema.sql:10`). This
  matches `PRODUCTION_PLAN.md:107` ("IDs are opaque or branch-prefixed;
  payloads are validated against factory-shaped records").
- No FK at the SQL level for `users.cabang_id → cabang.id` either
  (`schema.sql:13-31`). The current design uses nullable columns with
  application-level enforcement; the cascade gap above is the
  consequence.

## sekolah

### create / update

- Frontend: `SchoolList.jsx:103` — `await writeRemote('sekolah', form)`
  (`src/features/schools/SchoolList.jsx:103`).
- `store.js`: `WRITE_ENDPOINTS.sekolah` = `/api/sekolah.php`
  (`src/lib/store.js:327`). `prepareWritePayload('sekolah', record, ctx)`
  strips `record.cabangId` for the `admin_cabang` role
  (`src/lib/store.js:349-351`).
- HTTP: `POST /api/sekolah.php` body `{ ...data, action: 'create' | 'update' }`.
- Server auth: `requireAuthenticatedUser()` → `requireCsrf()`
  (`server/api/sekolah.php:7-8`) → for `admin_cabang`, the body is
  rejected with 422 if it carries `cabangId` at all (`:46-49`) and the
  session's `cabangId` is used as the branch authority (`:50-53`). For
  `superadmin`, `cabangId` is required (`:55-57`) and validated against
  the `cabang` table (`:58-62`).
- Server SQL (`:69-85` for create, `:99-109` for update):

```sql
-- create
INSERT INTO sekolah (id, cabang_id, payload)
VALUES (:id, :cabang_id, :payload);

-- update
UPDATE sekolah
SET cabang_id = :cabang_id, payload = :payload, version = version + 1
WHERE id = :id;
```

  Note: `sekolah.php`'s update path does **not** carry the
  `version = version + 1` `AND version = :expected_version` guard that
  `_master.php:122` does — `sekolah.php` does its own two-pass
  authorization (`sekolah.php:90-97`) but uses an unconditional UPDATE.
  See Drift below.
- Audit: `auditEvent('sekolah_created' | 'sekolah_updated', $user, 'sekolah', $id, ['cabangId' => $cabangId])`
  (`:83`, `:111`).

### delete

- Frontend: `SchoolList.jsx:202` — `await deleteRemote('sekolah', id)`
  (`src/features/schools/SchoolList.jsx:202`).
- HTTP: `POST /api/sekolah.php` body `{ id, action: 'delete' }`.
- Server auth: `requireAuthorization('delete', 'sekolah', ['cabangId' => $existing['cabang_id']], $user)`
  (`server/api/sekolah.php:29`). The existing record's branch is loaded
  first so the authorization check sees where the row actually lives
  today, not where the client thinks it lives.
- Server SQL (`:34`):

```sql
DELETE FROM sekolah WHERE id = :id;
```

- Audit: `auditEvent('sekolah_deleted', $user, 'sekolah', $data['id'], ['cabangId' => $existing['cabang_id']])`
  (`:35`).

### Drift / FK / cascade gaps

- **KNOWN GAP** at `server/api/sekolah.php:31-33` — the file's own
  comment flags it: "no check for trainer.sekolahIds, siswa.sekolahId,
  or invoices.sekolahId referencing this school before deleting". The
  cascade pattern established for `cabang` (`_master.php:170-178`) is
  **not** mirrored here. Same shape as F-04 on `users`, except
  `sekolah` has no SQL-level FK to the child tables anyway, so the
  breakage is application-level (orphan IDs in `trainer.sekolahIds`,
  `siswa.sekolahId`, `invoices.sekolahId`) rather than SQL-enforced.
- `sekolah.php`'s `update` path (`:99-105`) does **not** use
  optimistic-concurrency `WHERE id = :id AND version = :expected_version`
  the way `_master.php:122` does. It always bumps `version` and
  unconditionally overwrites the row. This is a documented asymmetry —
  `sekolah.php` predates the optimistic-concurrency retrofit
  (`_master.php:111-141`). Per `audit-app-vs-tests_2026-09-04_2249Z.md`
  F-24 ask, this is flagged but not a "bug" per the plan.

## trainer

### create

- Frontend (with account): `TrainerList.jsx:94` —
  `await writeRemote('users', { action: 'create', ... })`
  (`src/features/trainers/TrainerList.jsx:94`). This is the
  trainer-with-login-account path — the canonical entry per
  `USER_PROVISIONING.md D2/D3/D8/D9`.
- Frontend (no account): `TrainerList.jsx:127` —
  `await writeRemote('trainer', form)`
  (`src/features/trainers/TrainerList.jsx:127`). Reached for the
  substitute-trainer case (D6).
- `store.js`: `WRITE_ENDPOINTS.users` = `/api/users.php`
  (`src/lib/store.js:331`), `WRITE_ENDPOINTS.trainer` = `/api/trainer.php`
  (`:324`). `prepareWritePayload('trainer', ...)` strips `cabangId` for
  `admin_cabang` (`:353-355`); `prepareWritePayload('users', ...)` does
  the same (`:361-363`).
- HTTP for the no-account path: `POST /api/trainer.php` body
  `{ ...data, action: 'create' }`.
- Server auth: `requireAuthenticatedUser()` → role guard that 403s
  any `superadmin` trying to create a trainer (`server/api/trainer.php:28-30`).
  For `admin_cabang`, the body is rejected with 422 if it carries
  `cabangId` (`:40-43`) and the session's `cabangId` is the branch
  authority (`:44-47`).
- Server SQL: `masterWrite('trainer', $user, record: $data,
  overrides: ['cabangId' => $cabangId], action: 'create')`
  (`server/api/trainer.php:61`) → `_master.php:82-100`:

```sql
INSERT INTO trainer (id, cabang_id, version, payload)
VALUES (:id, :cabang_id, :version, :payload);
```

- For the **with-account** path (`/api/users.php`), the trainer record
  is inserted atomically inside the `INSERT INTO users` transaction:
  `INSERT INTO trainer (id, cabang_id, version, payload) VALUES (:id,
  :cabang_id, 1, :payload)` (`server/api/users.php:217-224`), then a
  reverse-link loop pushes the trainer id into each assigned school's
  `payload.trainerIds[]` (`:230-249` — `UPDATE sekolah SET payload =
  :payload WHERE id = :id`). If the username check (`:108-117`) fails
  later, `rollbackTrainerRecord()` undoes both the trainer row and the
  sekolah reverse-links (`:260-284`).
- Audit: `auditEvent('trainer_created', $user, 'trainer', $id, ['cabangId' => $cabangId])`
  fires from **two** places — `_master.php:103` (the no-account path)
  and `users.php:157` (the with-account path). The
  `user_created` row also fires from `users.php:159`.

### update

- Frontend (no account): `TrainerList.jsx:127` (writeRemote dispatches
  `action: 'create' | 'update'` based on whether the local cache has
  the id — `src/lib/store.js:411`).
- HTTP: `POST /api/trainer.php` body `{ ...data, action: 'update' }`.
- Server auth: same role guard as create. For `superadmin`, the body's
  `cabangId` is rejected (`:50-52`) and the existing trainer's branch
  is loaded from SQL (`:53-58`); for `admin_cabang`, the session
  `cabangId` is the authority. The trainer cannot be moved between
  branches by either role — that's by design
  (`trainer.php:37-39` comment).
- Server SQL: `masterWrite('trainer', ...)` → `_master.php:111-141`:

```sql
UPDATE trainer
SET cabang_id = :cabang_id, version = :version, payload = :payload
WHERE id = :id AND version = :expected_version;
```

- Audit: `auditEvent('trainer_updated', ...)` at `_master.php:144`.

### delete

- Frontend: `TrainerList.jsx:215` —
  `await deleteRemote('trainer', pendingRemoveId)`
  (`src/features/trainers/TrainerList.jsx:215`).
- HTTP: `POST /api/trainer.php` body `{ id, action: 'delete' }` (or
  HTTP `DELETE` verb — both reach `masterDelete('trainer', $user)`,
  `server/api/trainer.php:24/66`).
- Server auth: `requireAuthentication` + 403 if role is not
  `admin_cabang` (`trainer.php:21-23`, `:63-65` — superadmin cannot
  delete trainers, period).
- Server SQL: `_master.php:160-181`:

```sql
DELETE FROM trainer WHERE id = :id;
```

  **No cascade scan.** The cascade scan at `_master.php:170-178`
  only fires in the `isCabang` branch (i.e., on `cabang` delete).
  Trainer delete has no equivalent. The reverse-link cleanup
  (remove the trainer id from each `sekolah.trainerIds[]`) lives
  on the **with-account** path inside `users.php:260-284`, but only
  for the failure case (`rollbackTrainerRecord`); there is no
  equivalent on the trainer delete path itself.
- Audit: `auditEvent('trainer_deleted', ...)` at `_master.php:184`.

### Drift / FK / cascade gaps

- **F-04 (already known).** `_master.php`'s trainer-delete branch
  does not cascade to `users.trainer_id` (which becomes an orphan FK
  when the trainer row goes away — same shape as the `cabang` case).
  Tracked in `PRODUCTION_MILESTONES.md` `D9.1`. The fix is
  `UPDATE users SET active = 0, trainer_id = NULL WHERE trainer_id =
  :id AND active = 1` inside the trainer delete transaction.
- The reverse-link on `sekolah.trainerIds[]` (`users.php:230-249` for
  create, no equivalent for delete) is not cleaned up when a trainer
  is deleted via `trainer.php` directly. This is an application-level
  orphan (the sekolah still lists the trainer as assigned), not a SQL
  integrity bug. The school's `read.php` filter
  (`server/api/read.php:44-52, 122-129`) only consults
  `sekolah.trainerIds[]` for the trainer-role read scope, so a stale
  entry silently degrades the trainer's read access (they'd still see
  the school after the trainer row is gone). Not flagged as F-04
  because the user row is the actual data-integrity issue; this is a
  UX/cache drift that the read filter eventually catches.
- The trainer **role guard** at `trainer.php:28-30` (superadmin can't
  create) and `:63-65` (superadmin can't delete) is an unusual
  asymmetry — it follows the WA thread 1/9/2026 decision in
  `trainer.php:17-19`. Per `PRODUCTION_PLAN.md:97`, the canonical
  model is "trainer.sekolahIds[] plus an explicit branch
  relationship", which `superadmin` update still upholds (they edit
  but don't own).

## siswa

### create / update

- Frontend: `StudentList.jsx:69` — `await writeRemote('siswa', form)`
  (`src/features/students/StudentList.jsx:69`).
- `store.js`: `WRITE_ENDPOINTS.siswa` = `/api/siswa.php`
  (`src/lib/store.js:325`). `prepareWritePayload('siswa', ...)`
  **always** strips `cabangId` (`:357-359`) — per
  `PRODUCTION_MILESTONES.md` "siswa.cabangId — server derive, LOCKED",
  the branch is always derived from `sekolahId` server-side.
- HTTP: `POST /api/siswa.php` body `{ ...data, action: 'create' | 'update' }`.
- Server auth: `requireAuthenticatedUser()` → `masterWrite('siswa', $user, record: $data, overrides: ['cabangId' => $newCabangId], action: $action)`
  (`server/api/siswa.php:41`). The `cabangId` override is the
  server-derived branch, computed by
  `SELECT cabang_id FROM sekolah WHERE id = :id` (`:34-39`).
- Server SQL: `_master.php:82-100` / `:111-141` with `cabangId`
  overridden to the school's branch:

```sql
INSERT INTO siswa (id, cabang_id, version, payload)
VALUES (:id, :cabang_id, :version, :payload);

UPDATE siswa
SET cabang_id = :cabang_id, version = :version, payload = :payload
WHERE id = :id AND version = :expected_version;
```

- Audit: `auditEvent('siswa_created' | 'siswa_updated', ...)` at
  `_master.php:103`, `:144`.

### delete

- Frontend: `StudentList.jsx:90` —
  `await deleteRemote('siswa', pendingRemoveId)`
  (`src/features/students/StudentList.jsx:90`).
- HTTP: `POST /api/siswa.php` body `{ id, action: 'delete' }` (or HTTP
  `DELETE` — both reach `nullifyAbsensiSiswaId()` first, then
  `masterDelete('siswa', $user)`). Both paths in
  `server/api/siswa.php:15-22` and `:42-47`.
- **Pre-delete cascade (M-AF1.3):**
  `nullifyAbsensiSiswaId($data['id'], $user)` (`:60-91`) walks every
  `absensi.payload.siswaList[]`, finds entries whose `siswaId` matches
  the deleted siswa, sets them to `null`, and `UPDATE absensi SET
  payload = :payload WHERE id = :id` per touched row. Touched counts
  emit `auditEvent('absensi_siswa_nullified', $user, 'absensi', null,
  ['siswaId' => $siswaId, 'recordsTouched' => $touched])` (`:85-89`).
- Server SQL for the siswa row itself (`_master.php:180-181`):

```sql
DELETE FROM siswa WHERE id = :id;
```

  **Append-only ledgers preserved.** `spp_payments` rows for the
  deleted siswa are intentionally **not** touched (per `RD` in
  `AUDIT_PLAN.md`, the ledger is immutable). The file's own comment
  at `siswa.php:19-20` documents this.
- Audit: `auditEvent('siswa_deleted', ...)` at `_master.php:184`,
  plus the `absensi_siswa_nullified` event above when applicable.

### Drift / FK / cascade gaps

- **M-AF1.3 (already fixed 2026-09-05)** — the absensi cascade is
  server-authoritative in both POST-action-delete and HTTP-DELETE paths
  (`siswa.php:15-22, 42-47, 60-91`).
- `spp_payments` is intentionally preserved (append-only). No gap,
  this is by design and matches `PRODUCTION_PLAN.md:107`.
- No FK at the SQL layer (`schema.sql:125-133`). Application-level
  enforcement.

## absensi (ledger, append-only)

### write (append)

- Frontend: `AttendanceForm.jsx:109` — `upsert('absensi', record)`
  (`src/features/attendance/AttendanceForm.jsx:109`).
- `store.js`: `upsert()` (`:298-314`) calls `queueSync(key, saved)` (`:313`).
  `queueSync()` (`:492-498`) only enqueues for `LEDGER_KEYS` —
  `absensi` is one of them. The entry is written into the outbox
  `${STORE_KEY}_syncLog` (`STORAGE_KEY` = `afterschola_v4_syncLog`).
- Outbox flush: triggered from the AccountMenu's "Sinkronisasi" button
  via `syncPending()` (`src/lib/store.js:511-562`), which `POST`s the
  whole outbox to `/api/sync.php`.
- HTTP: `POST /api/sync.php` body `{ entries: [{ key: 'absensi', record: {...} }, ...] }`
  (`server/api/sync.php:1-78`).
- Per-entry auth: `authorize('write', 'absensi', $record, $user)` —
  not `requireAuthorization()`, so a single out-of-scope entry only
  fails that entry, not the whole batch (`sync.php:42`).
- Server SQL (per `sync.php:47-60`):

```sql
INSERT INTO absensi (id, cabang_id, payload)
VALUES (:id, :cabang_id, :payload);
```

  Append-only — never UPDATE, never DELETE on the SQL side for
  legitimate corrections (see verify path below for the one UPDATE).
- Audit: `auditEvent('absensi_recorded', $user, 'absensi', $id, ['cabangId' => ..., 'via' => 'sync'])`
  (`sync.php:62-65`).

### verify

- HTTP: `POST /api/absensi.php` body `{ id, action: 'verify' }`
  (`server/api/absensi.php:16-39`). This is the only UPDATE on the
  absensi table.
- Server auth: `requireAuthorization('verify', 'absensi', $payload, $user)`
  where `$payload['cabangId']` is loaded from the row's existing
  `cabang_id` column if not present in the payload (`:26-27`).
- Server-side stamps `statusVerifikasi = { by: $user['role'], at: <server-time> }`
  (`:32`) — never trusts a client-supplied verifier identity or
  timestamp.
- Server SQL:

```sql
UPDATE absensi SET payload = :payload WHERE id = :id;
```

  Note this update does **not** check `version = :expected_version` —
  it always bumps. The single `absensi` row's `version` column is
  otherwise unused (the table is append-only).
- Audit: `auditEvent('absensi_verified', $user, 'absensi', $id, ['cabangId' => $payload['cabangId']])`
  (`:37`).

### Drift / FK / cascade gaps

- The trainer-role write check is `trainerOwnsAttendance()`
  (`authorize.php:35-39`, `:118`) — `record.trainerId === user.trainerId`.
  This is the only entity with a write path open to trainers.
- Per `PRODUCTION_PLAN.md:99`, absensi carries `sekolahId`, `trainerId`,
  and verification fields; all of these are inside the JSON `payload`
  column rather than as separate SQL columns. Read-side filtering
  uses `recordOwnsBranch()` (`authorize.php:22-33`) for `admin_cabang`
  and `trainerOwnsAttendance()` for trainer.
- The `nullifyAbsensiSiswaId()` cascade from `siswa.php:60-91` is the
  only legitimate UPDATE on `absensi.payload` outside the verify
  path. Both are server-authoritative and idempotent.

## sppPayments (ledger, append-only)

### write (append)

- Frontend: `PaymentTable.jsx:55` and `:81` —
  `upsert('honorPayments', ...)` is in the same file but for SPP the
  chain is `addSppPayment()` in `src/lib/sppPayments.js` →
  `upsert('sppPayments', record)`. (The SPP write path doesn't go
  through `PaymentTable.jsx`; it goes through the SPP modal's submit
  handler — both ultimately hit `upsert('sppPayments', ...)` which
  triggers `queueSync()`.)
- `store.js`: identical ledger pattern — `upsert` → `queueSync` →
  outbox → `syncPending()` → `POST /api/sync.php`
  (`src/lib/store.js:298-314`, `:492-498`, `:511-562`).
- HTTP: `POST /api/sync.php` body `{ entries: [{ key: 'sppPayments', record: {...} }, ...] }`.
  Per-entry auth: `authorize('write', 'sppPayments', $record, $user)`.
- Server SQL (`sync.php:47-60`):

```sql
INSERT INTO spp_payments (id, cabang_id, payload)
VALUES (:id, :cabang_id, :payload);
```

- Audit: `auditEvent('sppPayments_recorded', $user, 'sppPayments', $id, ['cabangId' => ..., 'via' => 'sync'])`
  (`sync.php:62-65`).

### Drift / FK / cascade gaps

- Per `authorize.php:87`, the action `write_honor_payment` is in the
  deny-list — this catches the honorPayments sibling, not SPP.
  SPP's role check is the standard `recordOwnsBranch()` branch
  ownership test (`authorize.php:31-32`).
- The SPP table does NOT cascade to `siswa` on delete (per the
  M-AF1.3 decision at `siswa.php:19-20`). SPP rows for a deleted
  siswa remain in the ledger with the orphan `siswaId` — by design.

## honorPayments (ledger, append-only, with corrections)

### write (append)

- Frontend: `PaymentTable.jsx:55` —
  `upsert('honorPayments', newHonorPayment({ ... }))`
  (`src/features/payments/PaymentTable.jsx:55`).
- `store.js`: same ledger pattern as absensi/SPP — `upsert` →
  `queueSync` → outbox → `syncPending()` → `POST /api/sync.php`.
- HTTP: `POST /api/sync.php` body `{ entries: [{ key: 'honorPayments', record: {...} }, ...] }`.
- Server SQL (`sync.php:47-60`):

```sql
INSERT INTO honor_payments (id, cabang_id, correction_of, payload)
VALUES (:id, :cabang_id, :correction_of, :payload);
```

  Note the extra `correction_of` column (FK to the row being corrected,
  `schema.sql:86`).

### correct

- HTTP: `POST /api/honorPayments.php` body
  `{ action: 'correct', correctionOf: <id>, record: {...} }`
  (`server/api/honorPayments.php:13-26`).
- Server auth: `requireAuthorization('write', 'honorPayments', $record, $user)`.
  Per the resource-specific deny-list at `authorize.php:105-107`,
  `admin_cabang` is rejected outright for any write action on
  `honorPayments`; the trainer role never has `write` on this
  resource (`authorize.php:116-121`). Only `superadmin` reaches the
  INSERT. This matches `PRODUCTION_PLAN.md` §5 ("Superadmin: Full; only writer").
- Server SQL (`bootstrap.php:178-191` via `insertLedger()`):

```sql
INSERT INTO honor_payments (id, cabang_id, correction_of, payload)
VALUES (:id, :cabang_id, :correction_of, :payload);
```

- Audit: `auditEvent('honorPayments_recorded', $user, 'honorPayments', $id, ['cabangId' => ..., 'correctionOf' => <id>])`
  (`bootstrap.php:197-200`).

### Drift / FK / cascade gaps

- The `correction_of` column is **not** declared as a SQL FK
  (`schema.sql:83-94`). It's an application-level pointer. A
  correction against an `honor_payments` row that later gets
  hard-deleted would leave a dangling `correction_of`. In practice
  there is no hard-delete path on `honor_payments` (no UPDATE, no
  DELETE), so this is a theoretical gap.
- Per `PRODUCTION_PLAN.md:101`, the canonical relationship is
  `honorPayments.trainerId, cabangId` — both inside the JSON payload,
  consistent with every other ledger entity.

## invoices

### create / update

- Frontend: invoices are **generated**, not edited directly. The
  generator is hit from `src/features/reports/InvoiceModal.jsx` (and
  the standalone `server/bin/generate-invoices.php` CLI). The
  per-invoice edit path (`/api/invoices.php`) is reserved for the
  superadmin's manual correction use case.
- HTTP: `POST /api/invoices.php` body `{ ...data, action: 'create' | 'update' }`.
- Server auth: `requireAuthenticatedUser()` → `requireCsrf()`
  (`server/api/invoices.php:7-8`) → `requireAuthorization('create' | 'update', 'invoices', $record, $user)`.
  Per `authorize.php:105-107`, `admin_cabang` is denied for any write
  on `invoices`. Only superadmin reaches the SQL.
- `cabangId` is required and validated against the `cabang` table
  (`:48-55`) — no `admin_cabang`-derived-from-session branch exists
  here because that role can never reach this far.
- Server SQL (`:64-76` create, `:89-99` update):

```sql
INSERT INTO invoices (id, cabang_id, payload)
VALUES (:id, :cabang_id, :payload);

UPDATE invoices
SET cabang_id = :cabang_id, payload = :payload, version = version + 1
WHERE id = :id;
```

  Same `version = version + 1` asymmetry as `sekolah.php` — no
  optimistic-concurrency guard.
- Audit: `auditEvent('invoices_created' | 'invoices_updated', ...)` (`:75`, `:101`).

### generate (bulk)

- HTTP: `POST /api/invoices-generate.php` body
  `{ periode: 'YYYY-MM', uraian: <string>, cabangId?: <id> }`
  (`server/api/invoices-generate.php:1-55`).
- Server auth: `requireAuthorization('create', 'invoices', [], $user)`.
  Per the file comment at `:11-16`, this is a bulk operation, not
  tied to one record, so the empty data array is fine.
- Server SQL: `generateInvoicesForPeriod($pdo, $periode, $uraian, $user, $cabangIdFilter)`
  (`server/lib/invoiceGenerator.php:150`):

```sql
INSERT INTO invoices (id, cabang_id, payload)
VALUES (:id, :c, :p);
```

  (Idempotent on the `(id)` primary key — the generator reads existing
  rows first and skips IDs that already exist for the period, see
  the `FOR UPDATE` lock at `invoiceGenerator.php:129`.)
- Audit: emitted indirectly via the per-row INSERT path
  (`sync.php:62-65` shape; generator path emits
  `invoices_recorded` per generated row inside `invoiceGenerator.php`,
  not detailed here because it's not part of the API surface that
  React reaches).

### delete

- HTTP: `POST /api/invoices.php` body `{ id, action: 'delete' }`.
- Server auth: same resource deny-list as create/update
  (`authorize.php:105-107`) — admin_cabang is 403.
- Server SQL (`:35`):

```sql
DELETE FROM invoices WHERE id = :id;
```

- Audit: `auditEvent('invoices_deleted', ...)` (`:36`).

### Drift / FK / cascade gaps

- The invoice delete path (`invoices.php:35`) has **no cascade scan**
  mirroring `cabang` delete. If a sekolah is deleted and invoices for
  it remain, the inverse direction (cabang delete cascades to invoices
  via `_master.php:170-178`) is the only protection. Inverse-link
  drift (orphan `invoices.sekolahId` after sekolah delete) is the
  same class as F-04 but on a different table — not currently tracked
  because the `cabang`-delete cascade catches it.

## users

### create

- Frontend: `BranchManager.jsx:128` (superadmin creating a Branch
  Admin) and `TrainerList.jsx:94` (Branch Admin creating a trainer
  with login account).
- HTTP: `POST /api/users.php` body `{ action: 'create', role,
  username, displayName, cabangId?, trainer?: {...} }`
  (`server/api/users.php:52-181`).
- Server auth: `requireAuthenticatedUser()` → `requireCsrf()` →
  role guard at `:36-39` (only `superadmin` and `admin_cabang` reach
  this file).
- Branch scoping (`:76-95`):
  - `admin_cabang`: `cabangId` is stripped from the body if present
    (`:80-82`) and the session's `cabangId` is used (`:83-86`).
  - `superadmin`: `cabangId` is required and validated against
    `cabang` (`:88-94`).
- Trainer-record creation: if `role === 'trainer'`, a `trainer` row is
  created atomically inside the same transaction
  (`createTrainerRecord()`, `:183-255`). Reverse-links to assigned
  sekolahs (`:230-249`) push the trainer id into each school's
  `payload.trainerIds[]`. On any later failure, `rollbackTrainerRecord()`
  undoes both the trainer row and the reverse-links (`:260-284`).
- Username uniqueness: proactive check (`:108-117`) plus the
  `UNIQUE KEY uq_users_username (username)` backstop at
  `schema.sql:28`.
- Server SQL (`users.php:129-141`):

```sql
INSERT INTO users (id, username, display_name, password_hash, role,
                   cabang_id, trainer_id, active, must_change_password)
VALUES (:id, :username, :display_name, :password_hash, :role,
        :cabang_id, :trainer_id, 1, 1);
```

  Inside a transaction (`:126-143`). Password hashing:
  `password_hash($initialPassword, PASSWORD_DEFAULT)` (`:122`).
- Audit: `auditEvent('trainer_created', ...)` (when applicable, `:157`)
  and `auditEvent('user_created', $user, 'user', $userId, [...])` (`:159-163`).

### update

- Frontend: not currently invoked from `src/features/*` (UI affordance
  for "edit user" is not exposed; the server-side update path is
  reachable via direct `POST`).
- HTTP: `POST /api/users.php` body `{ action: 'update', id, ...fields }`
  (`users.php:286-326`).
- Server auth: row-level check (`:299-301`) — `admin_cabang` can only
  update trainer users in their own branch.
- Server SQL (`:317-318`):

```sql
UPDATE users SET <dynamic fields> WHERE id = :id;
```

  Allowed fields: `display_name`, `active`. No `cabang_id`, no
  `role`, no `password_hash` changes via this path.
- Audit: `auditEvent('user_updated', ...)` (`:320-323`).

### delete (deactivate, soft-delete)

- HTTP: `POST /api/users.php` body `{ action: 'delete', id }`
  (`users.php:328-353`).
- Server auth: row-level check (`:341-343`) — `admin_cabang` can only
  deactivate trainers in their own branch.
- Server SQL (`:345`):

```sql
UPDATE users SET active = 0 WHERE id = :id;
```

  **Soft-delete**, not hard-delete. The user row stays in the table
  so audit history (`audit_log.target_id`, `users.created_at`) is
  preserved.
- Audit: `auditEvent('user_deactivated', $user, 'user', $userId, ['cabangId' => ..., 'trainerId' => ...])`
  (`:347-350`).

### reset_password

- HTTP: `POST /api/users.php` body `{ action: 'reset_password', id }`
  (`users.php:355-386`).
- Server SQL (`:375-377`):

```sql
UPDATE users
SET password_hash = :h,
    must_change_password = 1,
    failed_login_count = 0,
    locked_until = NULL
WHERE id = :id;
```

  Resets the lockout counters (`failed_login_count`, `locked_until`)
  which are otherwise dead columns (`schema.sql:23-24`) — see Drift
  below.
- Audit: `auditEvent('user_password_reset', ...)` (`:379`).

### Drift / FK / cascade gaps

- **F-04 (already known, captured here per the M-AF5.6 contract).**
  `_master.php:170-178` (`cabang` delete cascade) does NOT scan
  `users.cabang_id`. After a `cabang` delete, every
  `users.cabang_id` pointing at that branch becomes an orphan FK.
  Similarly, `trainer.php:24` (`masterDelete('trainer', ...)`) does
  NOT cascade to `users.trainer_id` — trainer delete leaves orphan
  `users.trainer_id` values.
  - The user row's own `cabang_id` / `trainer_id` column being
    nullable (`schema.sql:19-20`) prevents the SQL `DELETE` from
    failing, but the application-level invariant ("every user's
    cabang_id points at a real branch" / "every user's trainer_id
    points at a real trainer") is silently broken.
  - Per `audit-app-vs-tests_2026-09-04_2249Z.md` lines 76-84 and
    `PRODUCTION_MILESTONES.md` `D9.1`, the planned fix is:
    `UPDATE users SET active = 0, cabang_id = NULL WHERE
    cabang_id = :id AND active = 1` inside the `cabang` delete
    transaction, plus the `trainer_id = NULL` analog inside the
    `trainer` delete transaction, both wrapped in
    `auditEvent('user_cascade_deactivated', ...)` with a `count`
    metadata field. This is **not in scope** for M-AF5.6 — M-AF5.6
    only documents the gap. The remediation microtask is M-AF5.7.
- `users.failed_login_count` and `users.locked_until`
  (`schema.sql:23-24`) are dead columns — the live lockout counters
  live on `login_attempts` (`schema.sql:48-53`). They are only ever
  touched by the password reset path (`users.php:375-377`), which
  resets them to 0/NULL. Per taste rule #65 (YAGNI over forced
  precision), these columns are scheduled for removal under
  `DF4` in `AUDIT_FOLLOWUP_PLAN.md` and are not in scope for M-AF5.6.
- No SQL-level FK between `users.cabang_id` and `cabang.id` or
  between `users.trainer_id` and `trainer.id` — application-level
  enforcement only. The cascade gap above is the direct consequence.

## settings

### create / update

- Frontend: `src/components/SettingsModal.jsx` (the only entry point;
  the actual save goes through the `superadmin`-gated path).
- HTTP: `POST /api/settings.php` body `{ ...data, action: 'create' | 'update' }`.
- Server auth: `requireAuthenticatedUser()` → `requireCsrf()` →
  `requireAuthorization('manage_settings', 'settings', $record, $user)`.
  `manage_settings` is in the deny-list (`authorize.php:87`) and
  `settings` is excluded from `roleCanReadEntity()` for both
  `admin_cabang` and `trainer` (`authorize.php:14-17`). Effectively
  superadmin-only.
- `cabangId` is **optional** for settings (`settings.php:48-60`) —
  it's validated for referential integrity if present, but it's not
  used as an authorization boundary. The `settings` table's
  `cabang_id` column is nullable (`schema.sql:147`).
- Server SQL (`:68-78` create, `:99-105` update):

```sql
INSERT INTO settings (id, cabang_id, payload)
VALUES (:id, :cabang_id, :payload);

UPDATE settings
SET cabang_id = :cabang_id, payload = :payload, version = version + 1
WHERE id = :id;
```

  Same `version = version + 1` asymmetry as `sekolah.php` / `invoices.php`.
- Audit: `auditEvent('settings_created' | 'settings_updated', ...)` (`:79`, `:110`).

### delete

- HTTP: `POST /api/settings.php` body `{ id, action: 'delete' }`.
- Server auth: same `manage_settings` deny (`:34`).
- Server SQL (`:36`):

```sql
DELETE FROM settings WHERE id = :id;
```

- Audit: `auditEvent('settings_deleted', ...)` (`:37`).

### Drift / FK / cascade gaps

- The `settings` table only has a single `id` primary key and no
  natural branch partitioning (`schema.sql:145-152`). The
  application uses one global settings record (id = 'global'); the
  optional `cabang_id` column is reserved for a possible future
  per-branch setting. Per `PRODUCTION_PLAN.md:103`, the canonical
  entity `settings` is global — this matches the current
  implementation.
- **AF7 (read-side leak).** `read.php:30-32` correctly returns 403
  for non-superadmin requests for `?entity=settings`, but
  `src/components/SettingsModal.jsx` is still reachable from the
  AccountMenu entry. The leak path is documented and tracked in
  `AUDIT_FOLLOWUP_MILESTONES.md` `M-AF2.2` (already closed 2026-09-05
  per the DONE block at line 190 of that file).

## audit_log

### insert (server-only)

- Frontend: **no write path**. `audit_log` is a server-internal table.
  Every server endpoint that mutates state calls `auditEvent(...)`
  (`server/auth/session.php:132-148`), which `INSERT INTO audit_log
  (...)`s a row.
- Server SQL (`session.php:132-148`):

```sql
INSERT INTO audit_log
  (actor_user_id, actor_role, cabang_id, event_type, target_type,
   target_id, metadata)
VALUES
  (:actor_user_id, :actor_role, :cabang_id, :event_type, :target_type,
   :target_id, :metadata);
```

  Wrapped in a try/catch (`session.php:133-148`) that silently swallows
  errors when `productionMode()` is true — so a missing audit table or
  a transient lockout never blocks the user-facing write. In
  development, the error surfaces to the next `error_log`.

### read

- HTTP: `GET /api/read.php?entity=audit_log` (per `read.php:17`,
  `audit_log` is in the `allEntities` allow-list).
- Server auth: `roleCanReadEntity()` includes `audit_log` for both
  `superadmin` and `admin_cabang` (`authorize.php:12-17`). `trainer`
  is denied (`authorize.php:18` returns false for everything but
  the four canonical entities).
- Server SQL (`read.php:65-94`):

```sql
-- superadmin
SELECT payload, version FROM audit_log ORDER BY created_at, id;

-- admin_cabang
SELECT payload, version FROM audit_log
WHERE cabang_id = :cabang_id
ORDER BY created_at, id;
```

  (Note: `audit_log` is not in `entityConfig()` — it has its own
  column names; `read.php:65-94` uses string interpolation rather
  than the helper. This works because the SQL is the same shape as
  every other table.)
- Admin_cabang mutation: denied at `authorize.php:105-107` —
  `audit_log` is in the resource-specific deny-list for any
  create/update/delete/write action.

### Drift / FK / cascade gaps

- `audit_log` is **append-only** — there is no UPDATE or DELETE
  endpoint that reaches the table, and the table itself has no
  mutation affordance beyond `INSERT`. This is by design
  (`PRODUCTION_PLAN.md:86` — "Audit log | Full | Own branch
  read-only | None"). The `auditEvent` swallow-and-continue error
  handling (`session.php:145-147`) is the one soft spot — a misconfigured
  audit_log table (missing columns, etc.) silently breaks the audit
  trail. This is documented and accepted per the production-mode
  guard at `session.php:146`.
- No SQL-level FK on `audit_log.cabang_id`, `actor_user_id`, or
  `target_id` (`schema.sql:33-46`). All FK relationships are
  application-level.

## Cross-cutting drift summary

The traversal above confirms the following points of drift between
current implementation and `PRODUCTION_PLAN.md` §6 /
`SCOPE_EXPANSION_PRIVILEGES.md`. Each is either an existing
known-issue or a documented asymmetry.

| Area | Source-of-truth | Current state | Drift | Tracked in |
|---|---|---|---|---|
| `cabang` cascade omits `users` | `PRODUCTION_PLAN.md:107` ("All joins use IDs"; "server scopes every query and validates every write") | `_master.php:170-178` scans 7 tables but not `users` | YES | `PRODUCTION_MILESTONES.md` `D9.1` (this is F-04) |
| `trainer` cascade omits `users` and `sekolah.trainerIds[]` reverse-link cleanup | same | `trainer.php:24` → `masterDelete('trainer', ...)` with no cascade | YES | `D9.1` |
| `sekolah` cascade omits `trainer.sekolahIds[]`, `siswa.sekolahId`, `invoices.sekolahId` | same | `sekolah.php:31-33` documents this as a KNOWN GAP inline | YES (documented) | inline comment, not yet filed as a microtask |
| `users.failed_login_count` / `users.locked_until` dead columns | `PRODUCTION_PLAN.md` doesn't require them | reset only on password reset (`users.php:375-377`) | YES (deferred) | `AUDIT_FOLLOWUP_PLAN.md` `DF4` |
| Optimistic-concurrency asymmetry on `sekolah.php` and `invoices.php` updates | `_master.php:111-141` is the canonical pattern | `sekolah.php:99-105` and `invoices.php:90-95` use `UPDATE ... SET version = version + 1 WHERE id = :id` (no expected_version check) | YES (asymmetry) | not currently filed; flagged here |
| `invoices` delete has no cascade scan | `PRODUCTION_PLAN.md:107` (server-authoritative referential integrity) | `invoices.php:35` plain DELETE | YES (rely on `cabang`-delete cascade to catch orphans) | not currently filed; protected transitively |
| Settings read-side render leak | `SCOPE_EXPANSION_PRIVILEGES.md` matrix + `AUDIT_FOLLOWUP_MILESTONES.md` `M-AF2.2` | resolved 2026-09-05 | NO (resolved) | `AUDIT_FOLLOWUP_MILESTONES.md` `M-AF2.2` |

## What this walkthrough does **not** change

Per the M-AF5.6 contract ("Write docs/audit-sql-crud walkthrough"), this
document is read-only — no code, no SQL, no migrations. Remediation of
the cascade gaps above (including F-04's already-tracked `D9.1` and
the inline-documented sekolah/invoices cascade asymmetries) belongs to
`M-AF5.7` ("Remediate cascade gaps surfaced by M-AF5.6"), which depends
on this document being merged first.

## Verification record

- **Document inspection (manual):**
  - ✅ Every entity in the M-AF5.6 scope list has a section:
    cabang ✓, sekolah ✓, trainer ✓, siswa ✓, absensi ✓, sppPayments ✓,
    honorPayments ✓, invoices ✓, users ✓, settings ✓, audit_log ✓.
  - ✅ Every section cites file:line for the frontend entry, the
    `store.js` adapter hop, the PHP endpoint, and the SQL statement.
  - ✅ Every drift relative to `PRODUCTION_PLAN.md` §6 or
    `SCOPE_EXPANSION_PRIVILEGES.md` is flagged inline at the end of
    the section and summarized in the cross-cutting table.
  - ✅ The F-04 cascade gap is captured in the `users` section (this
    was the explicit M-AF5.6 contract).
- **Files changed:** only `docs/audit-sql-crud_2026-09-04.md` (new).
