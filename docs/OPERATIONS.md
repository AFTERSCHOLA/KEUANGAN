# Operations Runbook (`docs/OPERATIONS.md`)

**Status:** Implemented — RH.E.1 (F-RH6, M5.4). One document an operator follows alone to deploy, rotate credentials, back up, restore, disable a user, respond to an incident, and roll back.
**Purpose:** Every action below maps to either an existing audited endpoint or a documented manual cPanel step (R-RH7). No ad-hoc SQL writes — never `UPDATE`/`DELETE` by hand; all state changes go through the listed endpoints.

**Conventions:** doc structure is English per house style; UI copy is quoted in Indonesian exactly as the app renders it. Host-specific values are placeholders — `<user>`, `<db-name>`, `<domain>` — never a guessed real path. Local API base is `http://127.0.0.1:8000` (via `scripts\start-php-server.bat`, docroot `server/`); production API base is `https://<domain>` (docroot `deploy/`). cURL examples use `curl.exe` with a cookie jar; replace `<csrf-token>` with the value from `/api/auth/csrf.php`.

**M5.4 topic coverage (PRODUCTION_MILESTONES.md:303-313):**

| M5.4 topic | Section |
|---|---|
| configure | §1 Deploy (first time): configure the server |
| backup | §3 Backup |
| restore | §3 Restore |
| rotate credentials | §2 Credential rotation |
| disable users | §4 Disable a user |
| incident response | §4 Incident response |

---

## 1. Deploy (first time): configure the server

Build the bundle first — a fresh clone has no mirror artifacts (D-RH6). `deploy/` is generated, never hand-edited (R-RH2); `server/lib/` ships inside it (RH.B.1).

```text
npm run build:deploy
```

Expected tail: `Build OK: N PHP files mirrored, M Vite assets copied, .htaccess written.` The post-check parity is a hard gate — a failure is a bug in `scripts/build-deploy.cjs`, recovery is re-running the same command.

1. Upload everything under `deploy/` to the cPanel document root (e.g. `/home/<user>/public_html/`). Preserve directory structure.
2. Configure with `.env` — never edit a PHP file on the server (CONFIG.md §3, RH.A.2/RH.C.1):

```bash
cp .env.example .env
```

Paste the real values into `.env` (tracked `.env.example` at the repo root, mirrored to `deploy/.env.example`, is the paste-ready template):

```text
APP_ENV=production
APP_DSN=mysql:host=localhost;dbname=<db-name>;charset=utf8mb4
APP_DB_USER=<user>
APP_DB_PASS=<new-password-after-rotation>
APP_SESSION_SECURE=true
```

Precedence is real environment > `.env` file > built-in defaults (`server/bootstrap.php` `parseEnvFile()`/`loadEnvFile()`); a host environment manager can override without touching any file. `.env` is gitignored and blocked over HTTP by the generated `deploy/.htaccess`. `Strict-Transport-Security: max-age=31536000; includeSubDomains` is sent only when `APP_SESSION_SECURE=true` (production HTTPS); local dev (`false`) never receives it. `vite.config.js` pins `build.sourcemap: false`, so no `dist/assets/*.map` is ever emitted.

3. Import the schema (first deploy only): phpMyAdmin → select database `<db-name>` → Import → upload `schema.sql` (the file just uploaded as part of `deploy/`) → Go.
4. Create `private/` **outside** the document root (D-RH5). Photos (`private/uploads/`) and backups (`private/backups/`) live here — never inside `deploy/` (it is wiped on every build and sits inside the document root):

```bash
mkdir -p /home/<user>/private/uploads
mkdir -p /home/<user>/private/backups
mkdir -p /home/<user>/private/logs
```

Locally these resolve to repo-root `private/uploads/` and `private/backups/` (gitignored, created at runtime by `photoStorageDir()`/`backupStorageDir()`); on cPanel they are the sibling of `public_html` above. Photo bytes are served **only** through the authorized download endpoint (§3) — there is no public URL. Documented boundary: photos captured while offline stay device-local (IndexedDB) until the record is saved again while online; no photo outbox is retried automatically.

5. Bootstrap the first Superadmin (M2.4). Run in the document root via cPanel Terminal/SSH; the password is read from a hidden prompt (never from shell history):

```bash
php bin/create-superadmin.php --username=<name> --display-name=<name>
```

`--password=<temp-password>` is supported only for controlled automation. The script refuses a second bootstrap (`Superadmin awal sudah tersedia.`) and writes a `superadmin_bootstrap` audit row. Log in via the UI and change the password on first login if prompted (`MustChangePasswordPage`).

6. Smoke check (proves the bundle, not a 404 masquerading as auth):

```text
GET https://<domain>/api/users.php with no session → 401 (not 404)
```

Then log in as superadmin in the browser. A wrong username/password returns `Nama pengguna atau kata sandi salah` (401) — the same message for unknown user, wrong password, inactive account, or lockout (5 failures → 15-minute lock).

## 2. Credential rotation

**Database password (D-RH1 runbook).** The DB credential lives in exactly one place: `.env` (`APP_DB_PASS`) on the server. It is never in git (R-RH1).

1. cPanel → Databases → change the password of the database user `<user>` for `<db-name>` (manual host step; no repo command).
2. On the server, update `.env`:

```text
APP_DB_PASS=<new-password-after-rotation>
```

No rebuild or re-upload is needed — the next request picks it up via `serverConfig()`.
3. Verify: log in via the UI, or:

```text
POST https://<domain>/api/auth/login.php
Content-Type: application/json
{"username": "<superadmin-username>", "password": "<password>"}
→ 200 with {"user": {...}, "csrfToken": "..."}
```

Rotate on: staff departure, any suspicion of exposure, and on a schedule (quarterly recommended). The old leaked credential stays in git history by locked decision D-RH1 — rotation is what neutralizes it; do not attempt a history purge.

**Per-user passwords.** An admin resets another account through the audited endpoint (emits `user_password_reset`, forces `must_change_password = 1`):

```text
POST /api/users.php
X-CSRF-Token: <csrf-token>
{"action": "reset_password", "id": "<user-id>"}
→ 200 {"ok": true, "id": "<user-id>", "initialPassword": "<16-char-once-only>"}
```

Relay the returned password once (same pattern as onboarding: the UI shows it in an `AlertDialog` with copy-to-clipboard and `Saya sudah catat` acknowledgement). Scope: superadmin any user; `admin_cabang` only trainers in `session.cabangId`. A user changes their own password via:

```text
POST /api/auth/change-password.php
X-CSRF-Token: <csrf-token>
{"currentPassword": "<old>", "newPassword": "<new-min-12-mixed-case-digit>"}
```

Policy (`requirePasswordPolicy()`): 12–255 chars with lowercase, uppercase, and digit. Wrong current password returns `Kata sandi lama salah` (401).

## 3. Backup and restore

Only superadmin (`manage_backup` / `restore` deny-list) can back up or restore; every call needs the session cookie and (for `POST`) `X-CSRF-Token` from `GET /api/auth/csrf.php`. The UI lives in the Settings panel: `Cadangkan Data (Backup)` → `Unduh Backup` (toast: `Backup berhasil diunduh.`); `Pulihkan Data (Restore)` → `Pilih File Backup...` → confirm `Timpa semua data?` → `Ya, Timpa Data` / `Batal` (warning: `Ini akan menimpa seluruh data saat ini.`).

**Backup.** One request creates the snapshot, writes it to disk, and streams it back:

```text
POST /api/backup-create.php → 200 application/json download bkp-<ts>.json
GET  /api/backup-list.php → 200 {"backups": [{"id": "bkp-...", "checksum": "sha256...", ...}]}
GET  /api/backup-download.php?id=<backup-id> → 200 the same bytes (checksum-verified; sets verified_at)
```

Local example (after `scripts\start-php-server.bat`):

```text
curl.exe -c cookies.txt -H "Content-Type: application/json" -d "{\"username\":\"superadmin@test.local\",\"password\":\"SuperTest123!X\"}" http://127.0.0.1:8000/api/auth/login.php
curl.exe -b cookies.txt -c cookies.txt http://127.0.0.1:8000/api/auth/csrf.php
curl.exe -b cookies.txt -c cookies.txt -H "X-CSRF-Token: <csrf-token>" -X POST http://127.0.0.1:8000/api/backup-create.php -o backup.json
curl.exe -b cookies.txt "http://127.0.0.1:8000/api/read.php?entity=cabang"
```

Files land in `private/backups/bkp-*.json` (mode 0640) with a `backups` table row (`id`, `checksum` sha256, `location` bare filename, `created_by`) and a `backup_created` audit row. Copy `private/` off-host after every backup — photo files under `private/uploads/` are **part of the off-host copy** (they are not inside the DB snapshot). Test-restore quarterly (the M5.4 "verified backups" rule).

**Restore.** Full replace inside one transaction (emits `data_restored` with per-entity `counts`); a malformed file fails closed with zero rows touched:

```text
POST /api/restore.php (multipart, field name backupFile) → 200 {"ok": true, "counts": {...}}
```

```text
curl.exe -b cookies.txt -c cookies.txt -H "X-CSRF-Token: <csrf-token>" -F "backupFile=@backup.json" http://127.0.0.1:8000/api/restore.php
```

On cPanel replace the base with `https://<domain>` and upload the last verified off-host JSON the same way (or pick it in the UI). Restore order for a full rollback is always artifact first, DB second (§5). **Not covered by the DB snapshot:** `users` (password hashes/session state would be clobbered), append-only `audit_log`, and `photo_uploads` rows/file bytes — these are never touched by restore. Re-copy `private/uploads/` from the same off-host set when photos are involved. Canonical verification cycle against the test DB:

```text
npm run db:reset
# backup via endpoint, restore via endpoint, re-read counts identical
```

Proven 2026-09-10: `BEFORE {"cabang":1,...,"trainer":2,...}` → backup 200 → restore 200 `{"counts":{"cabang":1,...,"trainer":2,...}}` → `AFTER` identical, `GET /api/read.php?entity=cabang` 1→1, `?entity=trainer` 2→2.

## 4. Disable a user / incident response

**Disable users.** Deactivation is soft (`active = 0`) via the audited endpoint (emits `user_deactivated`); the account can no longer log in (401 on `POST /api/auth/login.php`):

```text
POST /api/users.php
X-CSRF-Token: <csrf-token>
{"action": "delete", "id": "<user-id>"}
→ 200 {"ok": true, "id": "<user-id>"}
```

Equivalent non-destructive form: `{"action": "update", "id": "<user-id>", "active": false}` (emits `user_updated`). Scope: superadmin any user; `admin_cabang` only trainers in their own branch (cross-branch → 403). Deleting a `cabang`/`trainer` additionally deactivates its login accounts server-side (`user_cascade_deactivated`, D9.1) — do not "clean up" users by hand. Verify with a login attempt as that user (expect 401 `Nama pengguna atau kata sandi salah`) and a `user_deactivated` audit row (§6).

**Incident response.** Order: contain → rotate → verify → record.

1. Contain: disable the affected account(s) above. For a suspected session theft, have the user log out everywhere they control (`POST /api/auth/logout.php` invalidates that session) and reset their password (§2).
2. Read the trail (read-only): `audit_log` is append-only. There is no audit viewer endpoint — inspect it in phpMyAdmin (read-only `SELECT`; never write):

```sql
SELECT actor_user_id, actor_role, event_type, target_type, target_id, created_at
FROM audit_log WHERE actor_user_id = '<user-id>' ORDER BY id DESC LIMIT 50;
```

Key event types: `login_failed` / `login_succeeded`, `user_deactivated`, `user_password_reset`, `password_changed`, `backup_created`, `data_restored`, `photo_uploaded`, `user_cascade_deactivated`. Repeated `login_failed` for one username means either an attack or a stuck client — the 5-failure 15-minute lock clears on its own after a successful login; do not hand-edit `login_attempts`.
3. Rotate: DB password (§2) if the host credential is suspect; per-user resets for every account the actor touched.
4. Verify: log in as superadmin, re-run the §1 smoke check (`GET /api/users.php` anonymous → 401), spot-check `GET /api/read.php?entity=siswa` branch scoping, and confirm the new `user_deactivated` / `user_password_reset` audit rows exist.
5. Record: keep the off-host backup from before the incident plus the post-fix backup; note times, actor ids, and event ids for the release record. Then follow §5 if data must be wound back.

## 5. Rollback

Retain before every release: (a) the previous `deploy/` artifact (zip the uploaded tree before overwriting), and (b) the last verified DB backup JSON off-host (§3). No deployment without a backup (D8.1 rule).

1. Re-upload the previous artifact to `/home/<user>/public_html/` (same procedure as §1 step 1). `.env` and `private/` are outside the artifact and stay in place.
2. Restore the last verified backup through the audited endpoint (§3 Restore) — artifact first, DB second.
3. Post-rollback checks (all must pass, in order):

```text
POST /api/auth/login.php as superadmin → 200
GET  /api/users.php with no session → 401 (not 404)
GET  /api/read.php?entity=invoices as admin_cabang → 200, only own-branch rows
audit_log contains data_restored with the restored counts
```

If any check fails, stop: re-confirm the artifact version (`deploy/assets/` hashes change per build) and that the restored JSON is the pre-release one (compare `backups.checksum` with `sha256` of the file). Record the outcome in the release record; audit every action (every step above already emits its event).

## 6. Logs

**PHP errors.** The app reports failures via `error_log()` (e.g. `backup-create.php failed: ...`, `photo-upload.php insert failed: ...`, checksum/traversal guards). On cPanel read them in the host Errors interface / the `error_log` file in the document root; locally they appear on the PHP dev server stderr (`scripts\start-php-server.bat` window). `private/logs/` (created in §1) is the operator's collection point for downloaded copies — the app does not run a log-viewer endpoint.

**Audit events.** Every security-sensitive action appends to the `audit_log` table (`actor_user_id`, `actor_role`, `cabang_id`, `event_type`, `target_type`, `target_id`, `metadata`, `created_at`) — no passwords/tokens are ever stored there. Export via phpMyAdmin → select `audit_log` → Export for the incident window (§4), or filter with the read-only `SELECT` above.

**Backups ledger.** `GET /api/backup-list.php` is the authoritative list (`id`, `checksum`, `created_by`, `created_at`, `verified_at`); a download sets `verified_at`. Treat a backup with no `verified_at` and no quarterly test-restore as unverified.

---

## Verification

| # | Check | Pass condition |
|---|---|---|
| 1 | Six M5.4 topics present | `configure` (§1), `backup` (§3), `restore` (§3), `rotate`/`APP_DB_PASS` (§2), `disable`/`users.php delete` (§4), `incident`/`audit_log` (§4) all found with exact commands |
| 2 | Commands real | every endpoint named exists under `server/api/`; every file path named exists (`deploy/.env.example`, `private/uploads/`, `private/backups/`, `bin/create-superadmin.php`); host-specific values are `<user>`/`<db-name>`/`<domain>` placeholders |
| 3 | Live cycle | `npm run db:reset` → backup via `POST /api/backup-create.php` → restore via `POST /api/restore.php` → re-read counts identical (cabang 1→1, trainer 2→2; full entity map equal) |
| 4 | Scope | `git status` shows only `docs/OPERATIONS.md` added |

## Cross-references

- `docs/DEPLOY_BUNDLE.md` §4 — the upload + `cp .env.example .env` + `mkdir private/` + `create-superadmin` flow this runbook executes.
- `docs/CONFIG.md` §3 — the `.env` paste template and real-environment-wins precedence.
- `docs/RELEASE_HYGIENE_PLAN.md` §10 — the six-section structure followed here; §9/D-RH5 — the outside-docroot photo model; §6/D-RH1 — rotate-only credential decision.
- `docs/USER_PROVISIONING.md` §2 — `POST /api/users.php` create/update/delete/reset_password contract.
- `docs/PRODUCTION_MILESTONES.md` M5.4 (configure/backup/restore/rotate/disable/incident), M5.1 (HSTS/sourcemap), M5.2 (photo scope), D7–D8 (staging/promotion/rollback re-entry).
- `server/lib/backupRestore.php` — snapshot shape, excluded tables, transactional replace.
- `server/lib/photoStore.php`, `server/api/photo-upload.php`, `server/api/photo-download.php` — outside-root storage, content sniffing, branch-scoped reads.
- `scripts/build-deploy.cjs` — the only sanctioned way to change `deploy/`.
