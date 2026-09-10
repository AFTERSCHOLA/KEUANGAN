# Release Hygiene Plan — clearing the deployment blockers

**Status:** DRAFT — awaiting implementation via `RELEASE_HYGIENE_MILESTONES.md`.
**Trigger:** 2026-09-10 milestone-order verification (AUDIT_FOLLOWUP M-AF5.1–5.7 ✅, SCOPE_EXPANSION A2.5 ✅, PLAYWRIGHT PM.5.11–5.22 ✅, PRODUCTION D9.1–D9.2 ✅ re-verified at HEAD) surfaced the remaining deployment blockers listed in §3.
**Position:** This is a temporary, gate-by-gate fixing plan for release readiness (taste #40). It does **not** replace `PRODUCTION_PLAN.md` / `PRODUCTION_MILESTONES.md`; when Gate RH-H closes, the status tables there are updated and this document is folded or retired per the same convention as `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md`.

---

## 1. Context and inputs

- The application core is green at HEAD `44ede9c` (2026-09-10): vitest 54/54, production build clean, cascade battery (D9.1/D9.2) 2/2, multi-account sync green, `src/` grep-clean of debug statements, working tree clean.
- What remains between "green app" and "deployable app" is the release path: one credential incident, one broken deploy bundle, three production-gate gaps (M5.1 leftovers, M5.2 photo storage, M5.4 runbooks), the migration gate (M6.1/M6.2), and CI/RC orchestration (M6.3).
- User decisions recorded 2026-09-10 (see D-RH1..D-RH3): rotate the leaked cPanel DB password without git-history purge; the cPanel database behind the leaked credential is **empty/schema-only**; the real v4 (localStorage-era) production data still **lives in the operator's browser localStorage** and will be exported as the v4 backup JSON — the M6.1 importer is therefore the mandatory migration path.
- The user asked for a **.env-style placeholder** so the rotated credentials can be pasted in, ready-made, at setup time (§6).
- The user proposed storing uploaded photos in "a folder in the codebase" using cPanel's own storage. That model is corrected and pinned in §9 / D-RH5: the folder is created by the app at runtime, gitignored locally (`private/uploads/`), and on cPanel it lives **outside the document root** — never inside `deploy/`.

## 2. Goals and non-goals

**Goals**

1. Zero credentials in the working tree and future commits (the live incident is neutralized by rotation + untracking).
2. `npm run build:deploy` produces a complete, parity-verified, credential-free bundle that actually works on cPanel (including `server/lib/`).
3. Attendance/sekolah/logo photos are durably server-backed with scope-checked retrieval; nothing image-shaped is served from a public path.
4. An operator who is not a developer can deploy, rotate, back up, restore, import v4 data, and reconcile — by following `docs/OPERATIONS.md` alone.
5. A v4 browser export imports transactionally into the empty production DB and reconciles against the source, signed.
6. One command (`npm run rc:verify`) runs the whole release-candidate battery; CI guards the fast lane on every push.

**Non-goals (stay out of this chain)**

- Fixing the documented pre-existing test-debt cohorts (deferred with owners, §13).
- cPanel deployment itself (staging/promotion/rollback stay in PRODUCTION D7/D8 — re-entered after this chain closes).
- Photo-outbox (retrying offline photo uploads) — documented boundary, deferred (§9).
- Trial billing, email reset, soft-delete, flexible honor matrices (long-standing non-goals per `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md:241`).

## 3. Findings registry (F-RH)

| ID | Finding | Evidence |
|---|---|---|
| F-RH1 | **CRITICAL** — real cPanel DB credential committed at `deploy/config.php` (DSN `aftersch_bisnis_manajemen`, user + password). Web access is mitigated by `.htaccess`, but the secret is in git history and every clone. | `git ls-files deploy/` shows it tracked; file contains live password; = cross-cutting finding #6 in `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md:206`, never fixed. |
| F-RH2 | The entire `deploy/` mirror (`api/`, `auth/`, `bin/`, `bootstrap.php`, `config.example.php`, `schema.sql`, `.htaccess`, `config.php`) is **tracked**, contradicting locked decision D3 in `DEPLOY_BUNDLE.md` and taste #73 (mirror artifacts gitignored; Vite outputs tracked). This is what made F-RH1 possible. | `git ls-files deploy/` → 47 files incl. the whole mirror; nested `deploy/.gitignore` cannot untrack already-tracked files. |
| F-RH3 | `server/lib/` (`backupRestore.php`, `invoiceGenerator.php`) is missing from `build-deploy.cjs` MIRRORS and from the parity expected-set. The current bundle's `backup-create.php`, `backup-download.php`, `restore.php`, and `bin/generate-invoices.php` `require_once ../lib/...` files that do not exist in `deploy/` → backup/restore and invoice generation would 500 on cPanel. | `server/api/backup-create.php:4`, `server/lib/` exists, `Test-Path deploy/lib` → False; `scripts/build-deploy.cjs:48-58` MIRRORS/FILES omit lib. |
| F-RH4 | M5.1 leftovers: no HSTS anywhere; `vite.config.js` has no explicit `build.sourcemap:false` (source maps could ship in a future config change). | `server/bootstrap.php:7-12` securityHeaders() lacks HSTS; `vite.config.js` (full file) has no `build` key; `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md:170`. |
| F-RH5 | M5.2 server-side gap: `photo_uploads` table exists but no upload/download endpoints; photos live only in per-device IndexedDB (backup→wipe→restore loses them; minors' PII on uncontrolled devices). | `server/schema.sql:171-181`; no `server/api/photo-*.php`; `src/lib/photoStorage.js` (idb-keyval only); `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md:171`. |
| F-RH6 | M5.4 gap: no `docs/OPERATIONS.md`; `DEPLOY_BUNDLE.md:102` references an operator runbook that does not exist; no rotation/incident/backup procedures. | `Test-Path docs/OPERATIONS.md` → False. |
| F-RH7 | M6.1/M6.2 gap: no v4 importer reachable by the person who holds the data (their browser), no reconciliation script/report; server `restore.php` expects the server snapshot shape, not the client `exportBackup()` `{version:2,data:{…}}` shape. | `src/lib/backup.js:45-51` vs `server/lib/backupRestore.php:36-46`; `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md:179-180`. |
| F-RH8 | M6.3 gap: no CI workflow, no single release-candidate battery command. | `.github/workflows` absent; `package.json` scripts lack an RC entry. |
| F-RH9 | Stale claim correction (taste #42): the 2026-09-02 audit's "AppModal is orphan" (cross-cutting finding #4) is **no longer true** — `ConfirmDialog.jsx` and `AlertDialog.jsx` both import `AppModal` (M-AF5.1-era). Recorded here so no one "cleans up" a live component. | `src/components/ConfirmDialog.jsx:1`, `src/components/AlertDialog.jsx:1`. |

## 4. Decision set (D-RH)

| # | Decision | Status |
|---|---|---|
| D-RH1 | **Credential response = rotate only** (user, 2026-09-10): the old cPanel DB password is changed on cPanel; no git-history purge / force-push. The dead credential remains in history — accepted risk because rotation makes it worthless; force-push would break teammates' clones. | Locked |
| D-RH2 | **cPanel DB is empty/schema-only** (user, 2026-09-10): the importer runs against a clean production DB; no merge-with-existing-rows semantics needed. | Locked |
| D-RH3 | **v4 data lives in browser localStorage** (user, 2026-09-10): the operator exports the v4 JSON from the browser; the import path is the superadmin UI ("Impor Data v4") → server importer. The importer is a deploy-blocking gate, not a nice-to-have. | Locked |
| D-RH4 | **The .env seam**: a tracked `.env.example` at repo root is the ready-made placeholder; a ~20-line dotenv loader in `server/bootstrap.php` (no new dependency) parses `.env` when present; precedence stays real environment > `.env` file > built-in defaults. `.env` is already gitignored; `.htaccess` already blocks `*.env` over HTTP. | Locked |
| D-RH5 | **Photo storage model** (corrects the user's proposal): the codebase creates the storage folder at runtime — locally `private/uploads/` at repo root (gitignored, never committed), on cPanel a `private/uploads/` sibling **outside** `public_html`. Photos are **never** stored inside `deploy/` (it is wiped and re-mirrored by every build, sits inside the document root, and would leak PII into git). Retrieval is only through an authorized endpoint. | Locked |
| D-RH6 | **Untrack the whole `deploy/` mirror** (not just `config.php`): restore the locked D3/taste-#73 state — mirror artifacts ignored, Vite outputs + `invoice/` assets tracked. A fresh clone must run `npm run build:deploy` before deploying (runbook step 0; already required for hashed assets). | Locked |
| D-RH7 | **No repo-root `.htaccess`**: the repo root is never a document root (local dev uses the PHP built-in server, which ignores `.htaccess`; cPanel serves `deploy/`). The generated `deploy/.htaccess` remains the single protection point. Supersedes the "root .htaccess" note in `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md:170`. | Locked |
| D-RH8 | **HSTS gating**: `Strict-Transport-Security: max-age=31536000; includeSubDomains` is sent only when `session_secure` is true (production/HTTPS). Never sent in local dev (browsers would pin localhost). No `preload` (YAGNI). | Locked |
| D-RH9 | **Photo scope matrix** (mirrors absensi read scoping): upload = any authenticated role; read = superadmin any, admin_cabang own branch, trainer own branch. Photos are branch-scoped evidence, not owner-private. | Locked |
| D-RH10 | **Importer contract**: superadmin-only (`manage_backup` deny-list), CSRF, single transaction, all-or-nothing; `dryRun` mode returns a per-entity counts + reference report without writing; a second import of the same data 409s with zero rows written (idempotent by conflict, satisfying M6.1's "imported twice has no duplicates"). | Locked |
| D-RH11 | **RC battery scope**: `rc:verify` runs the verified-green named set (PHP test battery, vitest, focused Playwright gates, build, `build:deploy`, secret/tracked-file scan) — not the full Playwright suite, whose 16 documented pre-existing failures are owned by §13. CI (GitHub Actions) is a node-only fast lane (no third-party setup actions, no guessed runner capabilities); the PHP battery stays local/staging via `rc:verify`. | Locked |

## 5. Rules (R-RH)

- **R-RH1** No credential ever lands in a tracked file (taste #41). `.env` is gitignored; `deploy/config.php` is untracked and web-blocked; `config.example.php` keeps `replace_me` placeholders.
- **R-RH2** `deploy/` is generated, never hand-edited (DEPLOY_BUNDLE D1); `build:deploy` is the only sanctioned way to change it; parity post-check is a hard gate (taste #71/#72).
- **R-RH3** Photos are stored outside the document root and served only through an authorized, scope-checked endpoint; filenames are server-generated (PRODUCTION_PLAN §7: "server generates names and stores files outside executable/public paths or serves them through authorized endpoints").
- **R-RH4** Photo validation validates actual content (finfo MIME + `getimagesize`), not the client-declared Content-Type; size cap enforced server-side.
- **R-RH5** The v4 importer is transactional, reference-preserving, idempotent-by-conflict, and audit-trailed (`v4_imported` with per-entity counts) — taste #35.
- **R-RH6** Reconciliation reports are signed (sha256 of the report body) and written under `private/` — never inside the document root.
- **R-RH7** Every operational action in `OPERATIONS.md` maps to either an existing audited endpoint or a documented manual cPanel step; no ad-hoc SQL repair (PRODUCTION D7.4 rule).
- **R-RH8** Test-infra changes in this chain may not broaden app behavior; specs/tests added here assert only the new release-path surfaces.
- **R-RH9** HSTS and any header change must keep the local dev loop unaffected (localhost HTTP never receives HSTS).
- **R-RH10** Completion is recorded back to the source documents (PRODUCTION_MILESTONES M5.x/M6.x status blocks + PRODUCTION_GATE_CONFIRMATION reconciliation rows) before this chain is called done (taste #43).

## 6. Credential incident and the .env seam (F-RH1, F-RH2)

**Incident.** `deploy/config.php` (tracked since commit `9cd6136`) contains a live cPanel DSN, DB user, and password. Web exfiltration is blocked by the generated `.htaccess`, but the secret is in git history. Response (D-RH1): the **user rotates the password on cPanel** (user-owned; see §10 for the runbook and §14 for the blocking note), and the repo side is fixed so no future credential can be committed the same way:

1. Untrack the entire `deploy/` mirror (`git rm -r --cached …`) including `config.php` — D-RH6. The nested generated `deploy/.gitignore` then genuinely ignores the mirrors; root `.gitignore` gains an explicit `/deploy/config.php` line as defense-in-depth.
2. `scripts/build-deploy.cjs`'s generated `deploy/.gitignore` (the `DEPLOY_GITIGNORE` constant) gains `config.php` and `.env` lines, so a hand-dropped credential inside `deploy/` is ignored and invisible to `git add -A`.
3. A secret scan (part of `rc:verify` and CI, RH.G) fails the build if any tracked file is `deploy/config.php`/`.env`, or carries a non-placeholder DB password literal.

**The ready-made placeholder (user ask).** Precedence: real environment variables > `.env` file > built-in defaults. `server/bootstrap.php` gains `parseEnvFile(string $path): array` and loads the **first existing** of `__DIR__/.env` (in `deploy/`, that is the document root) and `dirname(__DIR__)/.env` (repo root locally; one above the doc root on cPanel — also the safest spot). Keys are `KEY=VALUE`, `#` comments, optional quotes; a key already present in the real environment is never overridden. No new dependency.

`.env.example` (tracked, root) is the paste-ready template — the operator fills exactly three values after rotation:

```text
# Konfigurasi server — salin file ini menjadi .env lalu isi nilainya.
# .env TIDAK pernah masuk git (diabaikan). Jangan menaruh kredensial di file lain.

APP_ENV=production
APP_DSN=mysql:host=localhost;dbname=NAMA_DATABASE_CPANEL;charset=utf8mb4
APP_DB_USER=USER_DATABASE_CPANEL
APP_DB_PASS=PASSWORD_BARU_SETELAH_ROTASI
APP_SESSION_SECURE=true
```

`build-deploy` mirrors `.env.example` into `deploy/.env.example` (gitignored artifact), so the operator's flow is `cp .env.example .env` + paste. This supersedes the old "edit config.php on the server" runbook step (DEPLOY_BUNDLE §4 step 2 is updated in RH.B.2).

## 7. Deploy bundle integrity (F-RH3)

`MIRRORS` in `scripts/build-deploy.cjs` gains `{ from: server/lib, to: deploy/lib }`; the parity expected-set and the generated `deploy/.gitignore` gain `lib/`. After rebuild, `deploy/lib/backupRestore.php` and `deploy/lib/invoiceGenerator.php` exist and the post-check parity stays clean. The bundle file list in `DEPLOY_BUNDLE.md` §3 is corrected to include `lib/` (RH.B.2). This also future-proofs `photoStore.php` (§9) — it ships in `deploy/lib/` automatically.

## 8. HTTP hardening leftovers (F-RH4, M5.1)

- **HSTS (D-RH8):** `securityHeaders()` sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` iff `serverConfig()['session_secure']` is true. Local dev (secure=false) is untouched.
- **Source maps:** `vite.config.js` gains an explicit `build: { sourcemap: false }` so a future config edit cannot silently ship maps; the RC battery asserts `dist/assets/*.map` count is zero.
- **Root `.htaccess` (D-RH7):** deliberately not added — the repo root is never a document root. The decision is recorded here to close the `PRODUCTION_GATE_CONFIRMATION` note without code.
- Headers are verified by a CLI probe asserting `headers_list()` content both with and without `APP_SESSION_SECURE=true` (no HTTP server needed).

## 9. Server-side photo storage (F-RH5, M5.2)

**Corrected model (answers the user's "is the logic like this?").** Half right: yes, use the cPanel host's own filesystem. But the folder must not be a normal folder inside the codebase/`deploy/`:

1. Anything under the cPanel document root is directly URL-fetchable — attendance photos of minors must only be reachable through an authorized endpoint (PRODUCTION_PLAN §7).
2. `build:deploy` wipes and re-mirrors `deploy/` on every build — uploaded files would be destroyed and would trip the parity gate.
3. Uploads inside the repo show up in `git status` and eventually get committed — PII in git (taste #20/#50).

The correct shape (mirrors the existing `private/backups` pattern in `backupRestore.php:48-61`): a **`private/uploads/`** folder the app creates at runtime — locally at repo root (`private/` is already gitignored and `.htaccess`-blocked), on cPanel as a sibling of `public_html` (outside the document root). Server-generated random filenames, one `photo_uploads` row per file (cabang_id + owner_user_id + storage_path + mime + size), bytes served **only** by an authenticated, scope-checked endpoint.

**Server (RH.D.1–D.3).** `server/lib/photoStore.php`: `photoStorageDir()`, `savePhotoBytes()` (random name, 0750 dir, 0640 file), `loadPhotoBytes()` with a traversal guard (storage_path must resolve inside the uploads dir). `server/api/photo-upload.php` (POST, auth + CSRF; `finfo` content sniff, `getimagesize` dimension sanity, 2 MB request cap, reject non-JPEG/PNG/WebP content; insert row; `auditEvent('photo_uploaded')`). `server/api/photo-download.php` (GET `?id=`; auth; scope per D-RH9; 404 unknown id; correct Content-Type; no directory listing; bytes never URL-addressable). A new `server/tests/photo.endpoint.php` proves the M5.2 VERIFY matrix: spoofed MIME rejected, oversized rejected, traversal rejected, cross-branch read 403, anonymous 401, valid upload + thumbnail roundtrip.

**Client (RH.D.4).** `src/lib/photoStorage.js` gains a server tier: after the existing compress+IndexedDB save, an authenticated online session also uploads; on success the entry becomes `{type:'server', id}` (idb entry kept as offline cache); `loadPhotoDataUrl()` resolves `type:'server'` via the download endpoint (and caches into idb). `PhotoSlot`/AttendanceForm flow unchanged otherwise. **Documented boundary:** photos captured while offline remain device-local (idb) until the record is saved again while online — a photo outbox is deferred (YAGNI); the boundary is stated in `OPERATIONS.md`.

## 10. Operator runbook — `docs/OPERATIONS.md` (F-RH6, M5.4)

New doc (Indonesian operator copy where UI is involved, English structure per house style). Sections, each with exact commands:

1. **Deploy (first time):** `npm run build:deploy` → upload `deploy/` → `cp .env.example .env` + paste rotated values → import `schema.sql` → `mkdir private/{uploads,backups,logs}` outside doc root → `php bin/create-superadmin.php …` → first-login change.
2. **Credential rotation (the D-RH1 runbook):** cPanel → change DB user password → update `.env` (`APP_DB_PASS`) → verify login; per-user password resets via the existing reset flow; when to rotate (departure, suspicion, scheduled).
3. **Backup/restore:** UI/endpoint backup → `private/backups/` (checksum in `backups` table) → copy `private/` off-host → restore via the audited restore endpoint; **test restore quarterly** (the M5.4 "verified backups" rule); photo files under `private/uploads/` are part of the off-host copy.
4. **Disable a user / incident response:** deactivate via users.php (audit-trailed), read `audit_log` by actor, the credential-rotation section, and the rollback step below.
5. **Rollback:** retain previous `deploy/` artifact + last verified DB backup; restore order (artifact first, DB second); post-rollback checks (login, branch isolation smoke, audit row present).
6. **Logs:** where PHP errors go on cPanel (`private/logs`, error_log), where audit events live (`audit_log` table), how to export.

VERIFY: document inspection (every M5.4 topic from `PRODUCTION_MILESTONES.md:303-313` present) + a live backup→restore cycle against the test DB (counts identical) + the secret scan green.

## 11. v4 import and reconciliation (F-RH7, M6.1 + M6.2)

**Importer (`server/api/v4-import.php`, RH.F.1).** Superadmin-only (`manage_backup` deny-list) + CSRF. Accepts the client `exportBackup()` shape `{version:2, exportedAt, data:{cabang, sekolah, trainer, siswa, absensi, honorPayments, sppPayments, invoices, settings}}` (tolerates the server snapshot `{entities:{…}}` shape too). Modes: `dryRun:true` → report only (per-entity counts, unresolved-reference list, derived-cabangId list); commit → **one transaction**, INSERT-only, any duplicate id → 409 listing the conflicting ids with **zero rows written** (all-or-nothing). Reference checks: `siswa.sekolahId` and `sekolah.cabangId` must resolve (hard edges — abort); `trainer.sekolahIds` must resolve (hard); `absensi` entries' `siswaId/trainerId` resolve against the import set (hard for present values); optional fields (`asistenId`, `dokumentasi`) tolerated when absent. Missing record-level `cabangId` is derived from the referenced sekolah's `cabangId` (recorded in the report). Audit: `v4_imported` with `{counts, dryRun}`. Fixtures ship as `server/tests/v4-import.fixtures.json` (valid + broken + duplicate sets); `server/tests/v4.import.php` proves: broken fixture writes zero rows with a per-error report; valid fixture imported twice → second run 409, zero rows, identical counts; ledger sums preserved.

**Reconciliation (`server/bin/reconcile.php`, RH.F.2).** CLI: `php server/bin/reconcile.php <v4-export.json>` → compares source JSON vs live DB: per-entity counts, per-branch tallies, `spp_payments`/`honor_payments` sums, invoice status mix; writes a signed report (`sha256` over the report body; report stored under `private/reports/reconcile-<ts>.json`) and prints a summary; exit 0 = MATCH, exit 1 = DRIFT with each drift line named. Test `server/tests/reconcile.check.php`: matching fixture → exit 0 MATCH; a seeded drift (one deleted SPP row) → exit 1 naming the drift. This is the M6.2 "signed reconciliation report before deployment".

**Client path (RH.F.3).** `BackupRestorePanel` (superadmin-only render) gains "Impor Data v4 ke Server": file picker (or "gunakan data browser saat ini") → dry-run POST → AlertDialog "Pratinjau Impor" with per-entity counts + unresolved references → "Mulai Impor" → commit POST → success alert → caches hard-reloaded. This is the reachable path for D-RH3 (the data is in the operator's browser). Playwright `tests/v4-import.spec.js`: trainer sees no button; superadmin seeds localStorage with a v4 fixture, imports via UI, server read-back counts match; second import surfaces the conflict report.

## 12. Release-candidate battery and CI (F-RH8, M6.3)

**`npm run rc:verify` (RH.G.1)** — `scripts/rc-verify.cjs`, single exit code, ordered:

1. `php -l` every `server/**/*.php` (and `deploy/` after build);
2. PHP battery: `server/tests/*.php` (identity, session, login, schema, policy, entity, api, invoice, superadmin, endpoint protection, users endpoint, cascade family, photo, v4 import, reconcile);
3. `npm test` (vitest);
4. `npm run db:reset` + focused Playwright gates (the verified-green named set: r3-verify, multi-account-crud-sync, cascade-users-deactivated, cascade-cleanup, the A2.5 batch, the PM.5 batch, auth specs);
5. `npm run build` (assert zero `dist/assets/*.map`);
6. `npm run build:deploy` (parity hard gate);
7. Secret + tracked-file scan (`scripts/secret-scan.cjs`: no tracked `deploy/config.php`/`.env`/mirror artifacts, no non-placeholder password literals; `.env.example` markers allowed).

D-RH11: the full Playwright suite is **not** in the battery — its 16 pre-existing failures are owned by §13; conflating them would make the RC gate permanently red and meaningless.

**CI (RH.G.2)** — `.github/workflows/ci.yml`, node-only fast lane (no third-party actions, no guessed runner PHP): `npm ci` → `npm test` → `npm run build` → `node scripts/secret-scan.cjs` → tracked-file guards. The PHP battery runs via `rc:verify` locally/staging. First green Actions run is evidence (push is user-owned per taste #21).

## 13. Deferred with owners (taste #53)

| Item | Owner / resolving venue | Why deferred |
|---|---|---|
| `server/tests/users.endpoint.php` 3/33 stale-contract failures (post-`1fcaf79` cabangId authority) | Test-infra follow-up microtask (already filed in the D9.2 record, `PRODUCTION_MILESTONES.md:510`) | Documented pre-existing; stash-proven unrelated |
| 12 `e2e.spec.js` selector drifts + `m64/m72/m73` + `student-delete-absensi` cohorts | HYGIENE chain classes 2–4 (`SCOPE_EXPANSION_MILESTONES.md:226`, `PRODUCTION_MILESTONES.md:508`) | Documented baseline debt, 91/16 improving |
| `endpoint.protection.php` / `users.endpoint.php` orphan `php -S` processes on Windows (live hang hit 2026-09-10, PID 2088) + the restore-test wiping `cabang` | Test-infra follow-up (D9.2 record #3) | Test-harness behavior, not app code |
| Photo outbox (retry offline photo uploads) | Future scope-expansion microtask if trainers regularly work offline | YAGNI; §9 boundary documented instead |
| `docs/log-doc/audit-report copy*.md` stray copies | Housekeeping microtask | Cosmetic |
| Full-suite green (closing the 16) | HYGIENE chain exit | Blocks "hygiene:verify", not the RC battery (D-RH11) |
| AppModal "orphan" cleanup | **None — claim retracted** (F-RH9) | Component is live (ConfirmDialog/AlertDialog) |

## 14. Evidence freeze (taste #41)

| Item | Record (2026-09-10) |
|---|---|
| Commit / tree | HEAD `44ede9c`, `git status` clean |
| Runtimes | PHP 8.2.12 (`D:\Games and Apps\xampp\php\php.exe`), XAMPP MariaDB 10.4.32 on :3306 (alive), PHP dev server `127.0.0.1:8000` (PID 11320, `-t server`), Node v24.16.0, npm 11.13.0, Vite 5173 not running (Playwright `webServer` auto-boots with `reuseExistingServer`) |
| Package scripts | `dev, build, preview, build:deploy, db:reset, setup, test, test:destructive, hygiene:verify` |
| Config state | `server/config.php` tracked, env-driven, no credentials; `server/config.example.php` present (`replace_me`); `.env` absent; `.env.example` absent (RH.A.2 creates it); `deploy/config.php` tracked **with live credential** (F-RH1) |
| Verified baseline at freeze | vitest 54/54; `npm run build` green (PWA precache 435.39 KiB); cascade battery 2/2 at HEAD; multi-account sync 1/1; D9.2 SQL check green ×2; `src/` grep-clean of `console.(log\|debug)` |
| Unverified at freeze | `server/tests/endpoint.protection.php` at HEAD (stopped — documented Windows hang; last recorded 208 checks green 2026-09-10 14:36, only dead-duplicate code changed since) |
| User-owned prerequisites | (1) Rotate the cPanel DB password — blocks only the D7 staging leg, not this chain; (2) push access for the first CI run |

## 15. Completion recording (taste #43)

When Gate RH-H closes: update `PRODUCTION_MILESTONES.md` M5.1/M5.2/M5.4 and M6.1/M6.2/M6.3 blocks with DONE records; update `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md` reconciliation rows (T5 → M5.1/M5.2/M5.4 resolved-local, T6 → verified-local, and the cross-cutting findings #6/#8 rows); update `DEPLOY_BUNDLE.md` + `CONFIG.md` (RH.B.2); then the project re-enters **PRODUCTION Gate D7.1** (staging inspection) with the rotation as the only human prerequisite.

## 16. Cross-references

- `docs/PRODUCTION_PLAN.md` §7 (HTTP hardening), §8 (photos/offline), §11 (build once, deploy same artifact)
- `docs/PRODUCTION_MILESTONES.md` M5.1–M5.4, M6.1–M6.3, Gate D7/D8
- `docs/DEPLOY_BUNDLE.md`, `docs/CONFIG.md`, `docs/USER_PROVISIONING.md`, `docs/RUN_LOCALLY.md`
- `docs/PRODUCTION_GATE_CONFIRMATION_MILESTONES.md` cross-cutting findings #6, #8
- `scripts/build-deploy.cjs`, `server/lib/backupRestore.php`, `src/lib/backup.js`, `src/lib/photoStorage.js`
