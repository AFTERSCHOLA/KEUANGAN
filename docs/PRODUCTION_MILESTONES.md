# Afterschola Production Milestones

Each microtask is strictly ordered. Do not start the next microtask until the current `VERIFY` passes. A failing check becomes a bounded follow-up task; do not patch unrelated files.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  RULES:   <R-codes/invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

## Gate 0 — Document and contract freeze

### G0.1 Freeze production decisions

```text
MICROTASK: Freeze production decisions
  EDIT:    PRODUCTION_PLAN.md, PRODUCTION_MILESTONES.md, scope roadmap M8/deferred references
  RULES:   R1, R2; concrete backend, session, role, CSRF, API, offline, upload, deployment, and release decisions are authoritative
  DEPENDS: required first reads complete
  OUTCOME: another developer can identify the local path, production target, blockers, and release boundary without opening source code
  VERIFY:  document inspection finds all concrete decisions and the synchronized disposition tables list an owner plus a resolving milestone or explicit release boundary for every deferred, blocked, superseded, and business-decision item
  DONE-IF: verify passes; only intended files changed
```

### G0.2 Freeze identity contract

```text
MICROTASK: Freeze identity contract
  EDIT:    server/schema.sql, server/bootstrap.php, src/lib/auth.js, src/lib/api.js, contract tests
  RULES:   canonical roles only; server identity authoritative; no plaintext credentials or localStorage sessions
  DEPENDS: G0.1
  OUTCOME: client and PHP layers agree on safe identity, status codes, and session behavior
  VERIFY:  contract tests reject admin/head-trainer/client role claims and password fields in safe responses
  DONE-IF: verify passes; only intended files changed
```

## Gate 1 — Canonical soft-login and branch context

### M1.1 Normalize role context

```text
MICROTASK: Normalize role context
  EDIT:    src/lib/store.js, src/lib/role.js, src/lib/branchScope.js, role unit tests
  RULES:   R2, R5; canonical roles; no unscoped legacy-admin fallback
  DEPENDS: G0.2
  OUTCOME: getRoleContext() returns validated { role, trainerId, cabangId } for all canonical roles
  VERIFY:  unit tests prove branch-A cannot read branch-B, Trainer scope is assignment-based, and legacy admin without branch is rejected or requires reselection
  DONE-IF: verify passes; only intended files changed
```

### M1.2 Render credential login

```text
MICROTASK: Render credential login
  EDIT:    src/features/auth/LoginPage.jsx, src/App.jsx, src/features/auth/RolePicker.jsx (delete)
  RULES:   R5; Indonesian copy; no credentials; prototype is visual reference only
  DEPENDS: M1.1
  OUTCOME: anonymous load shows one username + password form in every build; valid PHP session unlocks the dashboard; a forged localStorage role cannot unlock it
  VERIFY:  Playwright auth-login-page.spec.js cases 1, 2, 6, 7, 8, 10 all pass; no role-picker copy remains in the bundle
  DONE-IF: verify passes; only intended files changed
```

### M1.3 Scope shell navigation

```text
MICROTASK: Scope shell navigation
  EDIT:    src/App.jsx, src/features/overview/OverviewCards.jsx, src/features/admin/BranchManager.jsx
  RULES:   privilege matrix; hidden UI is not security; Superadmin-only branch management
  DEPENDS: M1.2
  OUTCOME: role changes update tabs, branch filter, and landing screen without exposing another role's controls
  VERIFY:  Playwright proves hidden-tab redirects, Admin Cabang lacks branch management, Trainer sees four tabs, and Superadmin switches branch views
  DONE-IF: verify passes; only intended files changed
```

### M1.4 Gate soft flow

```text
MICROTASK: Gate soft flow
  EDIT:    focused M5/phase tests only
  RULES:   existing M5 and Phase 5–7 exit gates; no unrelated feature changes
  DEPENDS: M1.3
  OUTCOME: the local Trainer-to-Admin/Superadmin flow remains executable with attendance proof and finance behavior
  VERIFY:  existing M5 and Phase 5–7 exit-gate tests pass with zero page errors
  DONE-IF: verify passes; only intended files changed
```

**Status: VERIFIED.**

Verified: `npm test` -> 10 files / 34 tests passed; `npm run build` -> production build succeeded.
Verified: focused M1.2/M1.3/M5.1–M5.4/KI-1/Phase 5–7 Playwright gates -> 27 passed with zero page errors.
Verified: original M1.4/M5.2–M5.4/Phase 5–7 suite -> 13 passed with zero page errors.
Verified: `tests/stress-simulation.spec.js` -> 1 passed with `FINAL PAGE ERRORS []`.
Changed: focused test fixtures only — canonical `admin_cabang` branch contexts in `m53-verify.spec.js` and `m54-verify.spec.js`; CSRF route fixture in `phase567-exit-gate.spec.js`.

The prior M1.4 blockers were stale test setup: missing branch selection, legacy `role: 'admin'`, and fixture records without branch ownership. KI-1 remains resolved and its dedicated tests pass. Stress findings F1–F5, F7, F11–F12, F17, F20, F22, and trainer sync-button visibility remain tracked under their existing audit/production owners; they were not patched in this gate.

## Gate 2 — PHP authentication foundation

### M2.1 Add auth schema

```text
MICROTASK: Add auth schema
  EDIT:    server/schema.sql, server/migrations/
  RULES:   least privilege; unique identities; no plaintext secrets; idempotent migrations
  DEPENDS: G0.2; local test database available
  OUTCOME: a fresh database stores users, throttling state, sessions when database-backed, and audit events
  VERIFY:  schema migration applies twice without destructive differences and rejects duplicate usernames
  DONE-IF: verify passes; only intended files changed
```

### M2.2 Implement session bootstrap

```text
MICROTASK: Implement session bootstrap
  EDIT:    server/bootstrap.php, server/auth/session.php, config example
  RULES:   secure cookie flags; strict mode; idle/absolute expiry; generic errors
  DEPENDS: M2.1
  OUTCOME: every API request has either a validated server session or no identity
  VERIFY:  PHP integration tests prove anonymous identity absence, expired-session rejection, and HTTPS cookie flags
  DONE-IF: verify passes; only intended files changed
```

### M2.3 Implement login lifecycle

```text
MICROTASK: Implement login lifecycle
  EDIT:    server/api/auth/login.php, logout.php, me.php, csrf.php, change-password.php, user tests
  RULES:   password_hash/password_verify; session rotation; CSRF; rate limit; forced change
  DEPENDS: M2.2
  OUTCOME: a seeded test user can log in, retrieve safe identity, change a forced password, and log out
  VERIFY:  integration tests prove wrong password, inactive user, lockout, fixation resistance, password non-leakage, CSRF failure, and logout invalidation
  DONE-IF: verify passes; only intended files changed
```

### M2.4 Bootstrap first Superadmin

```text
MICROTASK: Bootstrap first Superadmin
  EDIT:    server/bin/create-superadmin.php, deployment documentation
  RULES:   no defaults; controlled one-time setup; hashed password; audit event
  DEPENDS: M2.3
  OUTCOME: the first Superadmin is created without committing or exposing credentials
  VERIFY:  bootstrap creates a hash, refuses duplicate initial setup, and the account completes login lifecycle tests
  DONE-IF: verify passes; only intended files changed
```

## Gate 3 — Server authorization and data API

### M3.1 Implement authorization policy

```text
MICROTASK: Implement authorization policy
  EDIT:    server/auth/authorize.php, policy tests
  RULES:   privilege matrix; deny by default; server-derived role/scope
  DEPENDS: M2.3
  OUTCOME: one reusable policy consistently makes role and branch decisions
  VERIFY:  policy tests cover every matrix row, cross-branch access, Trainer ownership, honor-payment, restore, and branch management restrictions
  DONE-IF: verify passes; only intended files changed
```

### M3.2 Complete owned schema

```text
MICROTASK: Complete owned schema
  EDIT:    server/schema.sql, migrations, entity validation helpers
  RULES:   explicit cabang_id; ID joins; canonical fields; no derived finance writes
  DEPENDS: M3.1
  OUTCOME: every production entity has validated ownership and audit-compatible metadata
  VERIFY:  fixtures reject missing ownership, invalid references, duplicate IDs, unknown roles, invalid enums, and oversized payloads
  DONE-IF: verify passes; only intended files changed
```

### M3.3 Protect existing endpoints

```text
MICROTASK: Protect existing endpoints
  EDIT:    server/api/read.php, sync.php, absensi.php, sppPayments.php, honorPayments.php, server/bootstrap.php
  RULES:   401/403/409/422 contract; prepared statements; append-only ledgers; CSRF
  DEPENDS: M3.1 and M3.2
  OUTCOME: existing API calls are authenticated, scoped, validated, and idempotent
  VERIFY:  API tests prove anonymous 401, cross-scope 403, duplicate 409, malformed 422, and valid same-scope writes
  DONE-IF: verify passes; only intended files changed
```

### M3.4 Add remaining domain endpoints

```text
MICROTASK: Add domain endpoints
  EDIT:    branch/school/trainer/student/invoice/settings/backup endpoints and endpoint registry
  RULES:   no client role/scope trust; scoped reads; restore Superadmin-only
  DEPENDS: M3.3
  OUTCOME: every production feature has a server API matching the privilege matrix
  VERIFY:  endpoint matrix runs CRUD/read/restore tests for every role and resource with no unauthorized leakage
  DONE-IF: verify passes; only intended files changed
```

### M3.5 Add audit events

```text
MICROTASK: Add audit events
  EDIT:    audit schema/helper and security-sensitive endpoint call sites
  RULES:   no password/token/unnecessary PII logging; append-only audit records
  DEPENDS: M3.3
  OUTCOME: authentication, privilege, verification, payment, backup, restore, and account changes are attributable
  VERIFY:  tests assert event type, actor, scope, target, timestamp, and absence of secrets
  DONE-IF: verify passes; only intended files changed
```

**T3 / G0–M3 status: VERIFIED.**

Verified: `D:\\Games and Apps\\xampp\\php\\php.exe --version` -> PHP 8.2.12; `curl`, `PDO`, `pdo_mysql`, and `session` extensions present; XAMPP MariaDB 10.4.32 alive on port 3306; isolated `afterschola_t3_test` database created; ignored `server/config.php` configured for the test database. `php -l` passed for every `server/**/*.php` file. Identity, session, login, schema, policy, entity, API, invoice, and Superadmin bootstrap tests all exited 0; final protected endpoint/audit/restore suite exited 0 with 201 checks passed.
Changed: `server/api/_master.php`, `server/api/cabang.php`, `server/api/siswa.php`, `server/api/trainer.php`, `server/schema.sql`, and `server/tests/endpoint.protection.php`; milestone evidence documentation updated; `server/config.php` remains ignored and uncommitted.
Remaining: local T3 evidence does not prove cPanel production readiness; Platform-auth / Data-release owns staging/hosting verification.

## Gate 4 — Authenticated React mode

### M4.1 Add API/auth adapter

```text
MICROTASK: Add API auth adapter
  EDIT:    src/lib/auth.js, src/lib/api.js, src/lib/store.js
  RULES:   browser holds no session secret; 401/403/409 semantics; server authority
  DEPENDS: M3.3
  OUTCOME: client bootstraps /api/auth/me, obtains CSRF, calls scoped APIs, and handles expiry, denial, and conflict
  VERIFY:  API-backed tests prove 401 returns to login, 403 shows feedback, and 409 remains pending/conflicted
  DONE-IF: verify passes; only intended files changed
```

### M4.2 Switch production auth gate

```text
MICROTASK: Switch production auth gate
  EDIT:    src/App.jsx, src/lib/auth.js, src/lib/store.js, src/lib/role.js, src/features/auth/LoginPage.jsx, src/features/auth/MustChangePasswordPage.jsx (new), tests/fixtures.js, tests/auth-login-page.spec.js (new)
  RULES:   soft login removed; production fail-closed; no sensitive persisted identity
  DEPENDS: M4.1
  OUTCOME: production mode cannot unlock the dashboard from localStorage role state alone; cache isolation prevents anonymous reads; mustChangePassword blocks the dashboard until the user changes their password; the sidebar's "Ganti Peran" control is replaced with "Keluar" wired to auth.js logout()
  VERIFY:  tests/auth-login-page.spec.js cases 2, 10, 11 all pass; src/lib/__tests__/store-cache-isolation.test.js passes; production Playwright with only afterschola_v4_ui.role sees login; valid PHP session sees dashboard; expired session exposes no protected data
  DONE-IF: verify passes; only intended files changed
```

**Status: VERIFIED.**

Verified: `npm test` -> 12 files / 42 tests passed (incl. `src/lib/__tests__/store-cache-isolation.test.js` 5/5, auth-bootstrap/auth-contract/auth-unauthorized green).
Verified: `npm run build` -> production build succeeded; `dist/assets/*.js` contains no `RolePicker`, `Pilih peran`, or `Ganti Peran` strings.
Verified: `php -l` on `server/api/auth/login.php`, `me.php`, `change-password.php` -> no syntax errors; PHP dev server on `127.0.0.1:8000` answers `/api/auth/me.php` with 401 for an anonymous request (expected without a session).
Unverified: `npx playwright test tests/auth-login-page.spec.js`, `tests/m1-scope-shell-navigation.spec.js`, `tests/phase567-exit-gate.spec.js`, and `tests/stress-simulation.spec.js --workers=1` — Playwright tests require a live Vite dev server + the seeded `afterschola_t3_test` MySQL fixture; they were not executed in this session and remain the team's local gate.
Note: localStorage alone cannot unlock the dashboard — `getRoleContext()` in `src/lib/store.js` is bound to `getSafeIdentityContext()` in `src/lib/auth.js`, which returns `null` until `/api/auth/me.php` or `/api/auth/login.php` returns a server-derived safe identity. `RolePicker.jsx` is deleted; the sidebar exposes `Keluar` wired to `logout()`.

### M4.3 Wire scoped feature access

```text
MICROTASK: Wire scoped feature access
  EDIT:    role-sensitive feature components and store adapter
  RULES:   R2, privilege matrix, finance and ledger invariants
  DEPENDS: M4.2
  OUTCOME: feature operations use authenticated server data and authorized controls/data only
  VERIFY:  Playwright role matrix covers school/student/trainer/attendance/payment/report/backup controls and scope-switch finance invariance
  DONE-IF: verify passes; only intended files changed
```

## Gate 5 — Security, uploads, offline, and operations

### M5.1 Harden HTTP security

```text
MICROTASK: Harden HTTP security
  EDIT:    PHP response middleware, .htaccess/deployment rules, Vite production configuration
  RULES:   HTTPS; CSP compatible with app; no direct secret/config access
  DEPENDS: M4.2
  OUTCOME: production responses and filesystem rules enforce browser/server hardening
  VERIFY:  smoke tests assert headers, protected-file blocking, no directory listing, and no secrets/source maps in artifact
  DONE-IF: verify passes; only intended files changed
```

**Status: DONE (RH.C.1, 2026-09-11).**

Verified: `php -r` CLI probe -> `Strict-Transport-Security: max-age=31536000; includeSubDomains` present iff `APP_SESSION_SECURE=true`, absent by default (localhost never pinned); `npm run build` -> zero `dist/assets/*.map` (`vite.config.js` pins `build.sourcemap: false`); `npm run rc:verify` -> ALL 7 STEPS OK (2026-09-11).
Changed: `server/bootstrap.php` (gated HSTS per D-RH8), `vite.config.js` (`build.sourcemap: false`).
Note: no repo-root `.htaccess` added per D-RH7 (the repo root is never a document root; `deploy/.htaccess` stays the single protection point) — closes the `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md:170` note without code.

### M5.2 Secure photo storage

```text
MICROTASK: Secure photo storage
  EDIT:    photo client/server modules, upload/download endpoints, attendance components
  RULES:   no photos in localStorage; content and ownership validation; authorized retrieval
  DEPENDS: M3.4 and M4.3
  OUTCOME: attendance photos survive refresh through approved storage and cannot be fetched outside scope
  VERIFY:  upload tests reject spoofed MIME, invalid/oversized images, traversal, and cross-branch retrieval; valid thumbnails render
  DONE-IF: verify passes; only intended files changed
```

**Status: DONE (RH.D.1–D.5, 2026-09-11).**

Verified: `php server/tests/photo.endpoint.php` -> 30 checks / 0 failed (anonymous 401, CSRF 403, cross-branch 403, unknown-id 404, traversal 422/404, spoofed-MIME 422, oversized 422, valid upload+download roundtrip byte-identical, `photo_uploaded` audit row, storage outside the docroot); `npx playwright test tests/photo-server-roundtrip.spec.js` -> passed inside `rc:verify` step 4 (2026-09-11); `npm run rc:verify` -> ALL 7 STEPS OK.
Changed: `server/lib/photoStore.php`, `server/api/photo-upload.php`, `server/api/photo-download.php`, `server/tests/photo.endpoint.php`, `src/lib/photoStorage.js` (server tier + idb offline cache), `src/components/PhotoSlot.jsx` (save path only).
Boundary: offline-captured photos stay device-local until re-saved online — no photo outbox (deferred, YAGNI).

**Status: DONE — logo portability (LP.B.1–B.4 + LP.C.1–C.2, 2026-09-12).**

A superadmin-uploaded logo is global: `POST /api/logo-upload.php` (superadmin-only + CSRF, no `cabangId`, `cabang_id = NULL`) → `GET /api/logo-current.php` (any authenticated role, current id) → `GET /api/logo-download.php?id=` (any authenticated role, bytes); the client saves `{type:'server', id}` and every device hydrates it (`App.jsx` convergence + `SidebarLogo` fallback, idb cache warming). The A2.5-LOGO idb-only expectation is superseded (taste #42; see `docs/SCOPE_EXPANSION_MILESTONES.md` LP.B.4 update + `tests/settings-logo-picker.spec.js` header).

Verified: `php -l server/api/logo-upload.php + logo-current.php + logo-download.php + server/tests/logo.endpoint.php` -> no syntax errors; `php server/tests/logo.endpoint.php` -> 48 checks / 0 failed (valid PNG/JPEG/WebP 201 with NULL-branch row + byte-identical file, spoofed-MIME 422, oversized 422, non-superadmin 403, cabangId-sent 422, zero-row/zero-file rejects, `logo_uploaded` audit, storage outside `server/`); `git diff 9d1a3f9..HEAD` -> `server/api/photo-upload.php`, `photo-download.php`, `server/lib/photoStore.php` untouched (branch-photo contracts unchanged); `git check-ignore -v deploy-upload.zip login.json` -> both ignored, `git ls-files` precise probe -> neither tracked, both absent on disk (LP.C.1).
Changed (LP chain): `server/api/logo-upload.php`, `server/api/logo-current.php`, `server/api/logo-download.php`, `server/migrations/2026-09-12-logo-nullable-cabang.sql` (`cabang_id` NULLable, additive), `server/schema.sql` (same line), `server/bootstrap.php` (DDL-safe commit guard), `server/tests/logo.endpoint.php`, `src/lib/photoStorage.js` (`uploadLogoToServer` + `fetchLogoCurrent`/`fetchLogoDataUrl`), `src/components/PhotoSlot.jsx` (`uploadMode`, default `branch-photo`), `src/components/SettingsModal.jsx` (logo slot `global-logo`), `src/components/SidebarLayout.jsx` + `src/App.jsx` (missing-logo hydration), `tests/settings-logo-picker.spec.js` (server contract + second-context leg), `docs/SCOPE_EXPANSION_MILESTONES.md` (A2.5-LOGO LP.B.4 update), `.gitignore` (zip/login lines), `docs/DEPLOY_GUIDE_CPANEL.md` (LP.A.1 DONE + LP.C.2 manual checklist).
Unverified (recorded, not re-run in this doc-only session): `npx playwright test tests/settings-logo-picker.spec.js --project=default --workers=1` (LP.B.4 record 2026-09-12 -> 1 passed; cross-device bytes leg) and the branch-photo regression specs (LP diff touches no branch-photo contract; full `rc:verify` battery re-runs at staging per D7.1). `npm run build:deploy` parity for the three new endpoints refreshes with the next D7.2 bundle build (mirror covers `server/api/` wholesale; no build-script change).
Manual carry-overs (owner: teammate with cPanel access): one-time bootstrap-Cron removal + `deploy-upload.zip`/`login.json`/stray-`<docroot>/config.php` server cleanup — runbook + evidence slots in `docs/DEPLOY_GUIDE_CPANEL.md` §3.2 (LP.C.2), after all automated VERIFYs.

### M5.3 Define outbox conflicts

```text
MICROTASK: Define outbox conflicts
  EDIT:    src/lib/store.js, sync adapter, outbox tests, server version validation
  RULES:   acknowledgement required; visible pending/conflict states; no silent data loss
  DEPENDS: M4.1 and M3.4
  OUTCOME: offline attendance queues and synchronizes while mutable conflicts are surfaced
  VERIFY:  API/Playwright simulation covers offline queue, reconnect, 401, 403, duplicate 409, stale-version 409, retry, and pending logout
  DONE-IF: verify passes; only intended files changed
```

### M5.4 Add operational runbooks

```text
MICROTASK: Add operational runbooks
  EDIT:    deployment/security/backup/restore documents and CI checks
  RULES:   verified backups; secrets excluded; deterministic rollback
  DEPENDS: M5.1–M5.3
  OUTCOME: another operator can configure, backup, restore, rotate credentials, disable users, and respond to incidents
  VERIFY:  checklist review, test backup/restore, and secret scan pass
  DONE-IF: verify passes; only intended files changed
```

**Status: DONE (RH.E.1, 2026-09-11).**

Verified: document inspection -> all six M5.4 topics present with exact commands in `docs/OPERATIONS.md` (configure §1, backup §3, restore §3, rotate `APP_DB_PASS` §2, disable via `users.php delete` §4, incident/`audit_log` §4); live backup→restore cycle against the test DB -> counts identical (cabang 1→1, trainer 2→2); `node scripts/secret-scan.cjs` -> exit 0; `npm run rc:verify` -> ALL 7 STEPS OK (2026-09-11).
Changed: `docs/OPERATIONS.md` (new).

## Gate 6 — Migration and release candidate

### M6.1 Validate v4 import

```text
MICROTASK: Validate v4 import
  EDIT:    protected importer, migration validators, fixtures
  RULES:   v4-only source; dry-run; reference preservation; idempotent collision-safe migration
  DEPENDS: M3.2 and M5.4
  OUTCOME: valid v4 backup imports into a fresh database without changing IDs or finance meaning
  VERIFY:  broken fixture writes zero rows; valid fixture imported twice has no duplicates and matching row counts/totals
  DONE-IF: verify passes; only intended files changed
```

**Status: DONE (RH.F.1 + RH.F.3, 2026-09-11).**

Verified: `php server/tests/v4.import.php` -> 33 checks / 0 failed (broken fixture zero rows + per-error report; valid commit then re-import 409 with zero new rows; dryRun report-only); `npx playwright test tests/v4-import.spec.js` -> 2/2 inside `rc:verify` step 4 (trainer sees no import surface; superadmin browser-data import + conflict preview); `npm run rc:verify` -> ALL 7 STEPS OK.
Changed: `server/api/v4-import.php`, `server/lib/v4Import.php`, `server/tests/v4-import.fixtures.json`, `server/tests/v4.import.php`, `src/components/BackupRestorePanel.jsx` (superadmin-only import block), `tests/v4-import.spec.js`.
Contract: superadmin-only + CSRF, one transaction, all-or-nothing 409 with zero rows on duplicate ids, `v4_imported` audit (R-RH5, D-RH10).

### M6.2 Reconcile production data

```text
MICROTASK: Reconcile production data
  EDIT:    reconciliation scripts, runbook, tests
  RULES:   compare counts, references, branch totals, attendance, ledgers, and reports
  DEPENDS: M6.1
  OUTCOME: release candidate has a signed reconciliation report before deployment
  VERIFY:  fixture reconciliation matches source/destination finance snapshots, scopes, and ledger totals exactly
  DONE-IF: verify passes; only intended files changed
```

**Status: DONE (RH.F.2, 2026-09-11).**

Verified: `php server/tests/reconcile.check.php` -> 18 checks / 0 failed (matching fixture exit 0 MATCH + sha256-verified report under `private/reports/`; seeded SPP-row drift exit 1 naming entity/row/sum; invoice-status drift exit 1 naming row + mix); `npm run rc:verify` -> ALL 7 STEPS OK (2026-09-11).
Changed: `server/bin/reconcile.php`, `server/tests/reconcile.check.php`.

### M6.3 Run release candidate

```text
MICROTASK: Run release candidate
  EDIT:    tests only unless a verified in-scope defect requires code
  RULES:   M0–M7 gates; security; source hygiene; no scope creep
  DEPENDS: M6.2
  OUTCOME: the application is production-ready in a local/staging-equivalent environment
  VERIFY:  npm test, PHP API tests, focused Playwright, Phase 5–7 gate, npm run build, secret scan, and no-debug checks pass
  DONE-IF: verify passes; only intended files changed
```

**Status: DONE (RH.G.1 + RH.G.2, 2026-09-11).**

Verified: `npm run rc:verify` -> ALL 7 STEPS OK (2026-09-11): [1/7] LINT OK (59 server files); [2/7] PHP BATTERY OK (17 scripts, incl. `db:reset` re-seed after `endpoint.protection.php`, whose restore-test wipes `cabang`); [3/7] VITEST OK (14 files / 65 tests); [4/7] PLAYWRIGHT OK (26 specs / 41 tests: 39 passed + 2 flaky-passed-on-retry — `ki1-trainer-cabangid:118` and `trainer-honor-input`, both login-nav races under load, green in isolation); [5/7] BUILD OK (zero `dist/assets/*.map`, precache 443.23 KiB); [6/7] DEPLOY OK (parity clean, 40 PHP files mirrored, 37 deploy files linted); [7/7] SECRET-SCAN OK. `node scripts/secret-scan.cjs` -> exit 0 standalone. CI workflow present at `.github/workflows/ci.yml` (node-only fast lane: `npm ci` -> `npm test` -> `npm run build` -> secret-scan -> tracked-file guard); first Actions run pending user push (taste #21).
Changed: `scripts/rc-verify.cjs`, `package.json` (`rc:verify`), `scripts/secret-scan.cjs`, `.github/workflows/ci.yml`.
Scope: the full Playwright suite's 16 documented pre-existing failures stay owned by `RELEASE_HYGIENE_PLAN.md` §13 (D-RH11) — not in this battery. Prerequisite hardening in this session (test-infra only, no app behavior): `DEPLOY_GITIGNORE` gains `.env.example` + `deploy/.env.example` untracked; `rc-verify` quotes spaced binary paths; `PHP_BINARY` + `taskkill /T` reaping in all `php -S` spawn sites (no more orphan `php.exe`); `users.endpoint.php` updated to the post-`1fcaf79` cabangId contract (35/35); `--retries 1` on the Playwright step (retries stay visible as flaky).

## Gate 7 — cPanel staging

### D7.1 Inspect hosting capabilities

```text
MICROTASK: Inspect hosting capabilities
  EDIT:    environment configuration and runbook only
  RULES:   do not guess PHP version, extensions, document root, DNS, or HTTPS behavior
  DEPENDS: cPanel account, staging subdomain, database access
  OUTCOME: actual staging prerequisites and server capabilities are recorded
  VERIFY:  health check confirms PHP 8.2+, PDO/MySQL, sessions, fileinfo/upload, HTTPS, database connectivity, and private paths
  DONE-IF: verify passes; only intended files changed
```

### D7.2 Build deploy artifact locally

```text
MICROTASK: Build deploy artifact
  EDIT:    scripts/build-deploy.cjs (executable), package.json (build:deploy script), deploy/.htaccess + deploy/.gitignore (generated), .gitignore (ignores the mirror artifacts), docs/DEPLOY_BUNDLE.md
  RULES:   generated artifacts are gitignored; Vite outputs remain tracked; parity check is a hard gate; private/ and config.php never enter the bundle
  DEPENDS: M6.3
  OUTCOME: `npm run build:deploy` produces deploy/ byte-equivalent to what was tested; deploy/api/users.php, deploy/auth/session.php, deploy/auth/authorize.php, deploy/bin/create-superadmin.php all exist; .htaccess blocks private/, *.sql, *.log, config.php
  VERIFY:  build exits 0; parity post-check passes; manual rm of deploy/api/users.php → rebuild restores it; git status shows Vite outputs as modified and the mirror files absent
  DONE-IF: verify passes; only intended files changed
```

### D7.3 Deploy staging artifact

```text
MICROTASK: Deploy staging artifact
  EDIT:    cPanel document root, private config, schema migration, release artifact
  RULES:   upload deploy/* produced by D7.2; no secrets in bundle; least-privilege DB user; config.php created on the server from config.example.php
  DEPENDS: D7.1 and D7.2 and M6.3
  OUTCOME: staging serves the React app and authenticated PHP API over HTTPS
  VERIFY:  staging smoke suite passes auth, CSRF, role matrix, branch isolation, CRUD, conflicts, uploads, PWA, and backup paths; GET /api/users.php returns 401 (not 404)
  DONE-IF: verify passes; only intended files changed
```

### D7.4 Import and reconcile staging data

```text
MICROTASK: Reconcile staging data
  EDIT:    staging database through reviewed migration/import only
  RULES:   verified backup; transaction/idempotence; no ad-hoc SQL repair
  DEPENDS: D7.3 and approved v4 export
  OUTCOME: staging contains reconciled production-shaped data and controlled user access
  VERIFY:  post-import counts, finance snapshots, branch isolation, and audit events match signed reconciliation report
  DONE-IF: verify passes; only intended files changed
```

## Gate 8 — Production promotion and rollback

### D8.1 Back up production

```text
MICROTASK: Back up production
  EDIT:    cPanel backup/cron configuration and release record
  RULES:   tested restore path; retain previous artifact; no deployment without backup
  DEPENDS: staging gate passed and production approval
  OUTCOME: production can be restored to its pre-release state
  VERIFY:  readable backup exists with checksum/retention record and test restore or rehearsal passes
  DONE-IF: verify passes; only intended files changed
```

### D8.2 Promote release

```text
MICROTASK: Promote release
  EDIT:    production artifact/config/schema through the runbook
  RULES:   same artifact as staging; secure config; ordered reversible migrations
  DEPENDS: D8.1
  OUTCOME: production serves the approved authenticated role and branch policy
  VERIFY:  production smoke suite proves anonymous blocking, role boundaries, branch isolation, expiry, headers, and no leakage
  DONE-IF: verify passes; only intended files changed
```

### D8.3 Exercise rollback

```text
MICROTASK: Exercise rollback
  EDIT:    release record/runbook corrections only; no ad-hoc application patch
  RULES:   known artifact/database backup; audit every action
  DEPENDS: D8.2
  OUTCOME: release owner can restore the previous version and verify backups/audits after launch
  VERIFY:  rollback rehearsal and post-release checks complete with documented results
  DONE-IF: verify passes; only intended files changed
```

## Known issues discovered during gate execution

### KI-1: Admin Cabang cannot create new trainers (discovered during M1.4)

`src/lib/constants.js`'s `newTrainer()` does not set a `cabangId` field on the created
record. `src/lib/store.js`'s `isWithinScope()` for `admin_cabang` + `trainer` accepts a
record only if it already exists in the trainer collection (`trainerIds.has(record.id)`)
or if `record.cabangId === ctx.cabangId`. A brand-new trainer satisfies neither: it isn't
in the collection yet, and its `cabangId` is `undefined`. `upsert()` silently no-ops when
`isWithinScope()` returns false — no error, no alert; the form appears to save
successfully but the record is never persisted.

- **Reproduction**: log in as Admin Cabang with a valid branch selected → Data Trainer →
  Tambah Trainer Baru → fill form → Simpan. The trainer never appears in
  `afterschola_v4_trainer`.
- **Impact**: Admin Cabang cannot onboard a new trainer through the UI at all. Confirmed
  via `tests/m52-verify.spec.js` (5 tests fail with an empty Trainer dropdown downstream,
  because the seeded trainer was never actually saved).
- **Owner / resolving milestone**: Scope/policy, **M3.1 Implement authorization policy**.
  `isWithinScope()` is the client-side precursor to `server/auth/authorize.php`; the fix
  belongs with that work so the two stay consistent, not as an ad-hoc patch here.
- **Suggested direction (not yet implemented)**: either (a) have `newTrainer()`/
  `newSiswa()`-equivalent creation paths stamp `cabangId` derived from the creating
  admin's context, or (b) extend `isWithinScope()` to also allow a new record when every
  school it references is already within the actor's branch scope.

**Status: RESOLVED (M3.1, commit 2f4b60e).** `newTrainer()` in
src/lib/constants.js now stamps `cabangId` on new trainer records, and
`TrainerList.jsx`'s openAdd() derives the branch from the logged-in
Admin Cabang's own getRoleContext() instead of an arbitrary cabang[0].
Verified by tests/ki1-trainer-cabangid.spec.js.

## Gate D9 — Server cascade integrity (per D-04 = A)

Source: `docs/log-doc/audit-app-vs-tests_2026-09-04_2249Z.md` F-04. Decision: `UPDATE users SET active = 0, FK = NULL` on delete.

### D9.1 Server cascade: deactivate users on cabang/trainer delete

```text
MICROTASK: Server cascade: deactivate users on cabang/trainer delete
  EDIT:    server/api/_master.php (around line 170-178, the isCabang branch); server/api/trainer.php (line 24, the trainer masterDelete call site)
  RULES:   taste #35 (idempotent, reference-preserving); taste #43 (record completion back to source-of-truth); taste #50 (privacy); wrap the cascade update in a transaction with the existing DELETE; emit `auditEvent('user_cascade_deactivated', ...)` per the existing `users.php:347` `user_deactivated` event pattern; the `WHERE active = 1` clause ensures idempotence on re-run
  DEPENDS: none
  OUTCOME: deleting a `cabang` (server/api/cabang.php) cascades to `UPDATE users SET active = 0, cabang_id = NULL WHERE cabang_id = :id AND active = 1`; deleting a `trainer` (server/api/trainer.php:24) cascades to the same with `trainer_id`; the audit_log captures `user_cascade_deactivated` for each affected user; running the cascade twice is a no-op (idempotence)
  VERIFY:  Playwright `tests/cascade-users-deactivated.spec.js` (new) logs in as superadmin, creates a branch with an admin account, deletes the branch, asserts the admin user can no longer log in (401 on POST /api/auth/login), asserts the audit_log contains `user_cascade_deactivated` for that user; same flow for a trainer with a login account; existing `tests/multi-account-crud-sync.spec.js` and `tests/endpoint.protection.php` remain green
  DONE-IF: verify passes; only intended files changed
```

**Re-verification at HEAD (2026-09-11; post-dates the D9.2 battery).** Commit `44ede9c` removed the pre-transaction `cascadeDeactivateUsers()` helper and deleted the superseded `2026-09-08-cascade-orphan-cleanup.sql`, but the shipped cascade — transactional `SELECT ... FOR UPDATE` + `UPDATE users SET active = 0, <col> = NULL WHERE <col> = :id AND active = 1` sharing the `DELETE` transaction in `masterDelete()` (`server/api/_master.php:199-229`), with post-commit `user_cascade_deactivated` audit per user — is intact.

Verified: `npx playwright test tests/cascade-users-deactivated.spec.js` -> 2/2 inside `rc:verify` step 4 (2026-09-11); `php server/tests/cascade-cleanup.php` and `php server/tests/cascade-orphan-cleanup.php` green in step 2; `tests/multi-account-crud-sync.spec.js` and `tests/endpoint.protection.php` (208 checks) green in the same run. The one-time cleanup file of record is `server/migrations/2026-09-10-cascade-orphan-cleanup.sql`.

### D9.2 One-time migration: clean up existing orphan users

```text
MICROTASK: One-time migration: clean up existing orphan users
  EDIT:    server/migrations/<timestamp>-cascade-orphan-cleanup.sql (new), server/bootstrap.php (register migration)
  FINDS:   F-04 (audit); this is the post-D9.1 cleanup of orphans the team's manual testing surfaced
  RULES:   taste #35 (idempotent, reference-preserving); the migration is the dual of D9.1's cascade update — it neutralizes orphans that pre-existed before D9.1 landed
  DEPENDS: D9.1
  OUTCOME: every existing `active=1` user with a `cabang_id` not in the `cabang` table (or a `trainer_id` not in the `trainer` table) is set to `active=0, cabang_id=NULL, trainer_id=NULL`; running the migration twice is a no-op; an audit row is emitted per affected user
  VERIFY:  SQL test: a temporary test DB seeded with 3 orphan users (cabang_id pointing to a deleted cabang) and 2 non-orphan users is migrated twice; the second run is a no-op; all 3 orphans are deactivated and FK-nulled; the 2 non-orphans are untouched; existing r3-verify.spec.js and multi-account-crud-sync.spec.js remain green
  DONE-IF: verify passes; only intended files changed
```

DONE 2026-09-10 — `server/migrations/2026-09-10-cascade-orphan-cleanup.sql` (new) ships the one-time orphan cleanup as two `;\n`-terminated statements: an audit-first `INSERT INTO audit_log … SELECT` emitting one `user_orphan_cleaned` row per affected user (metadata `{cabangId, trainerId}` matching D9.1's `user_cascade_deactivated` shape, ids only per taste #50; `actor_user_id`/`actor_role` NULL because a system migration has no human actor; `audit_log.cabang_id` keeps the user's dangling branch id so branch-scoped audit views stay queryable after `users.cabang_id` is nulled), then the `UPDATE users SET active = 0, cabang_id = NULL, trainer_id = NULL WHERE active = 1 AND (cabang/trainer reference dangling)`. Both statements gate on `active = 1`, so a second run matches zero rows — SQL-level idempotence (taste #35), with the `migrations` table row as the primary guard. Statement order is load-bearing: the audit SELECT captures the orphan set while the predicate still matches; the UPDATE then flips `active`, which the INSERT's gate keys on. Registration in `server/bootstrap.php` is by discovery (runMigrations() applies every `migrations/*.sql` not yet in the `migrations` table — same as M-AF5.4), so the microtask's "register migration" resolves as a robustness fix instead: runMigrations()' naive `explode(";\n", …)` splitter is now CRLF-normalized first (`str_replace("\r\n", "\n", $sql)`), because `core.autocrlf=true` rewrites checked-out SQL files to CRLF on Windows and a CRLF file would glue a trailing `\r` onto every statement after the first — this migration is the first multi-statement file where that lands. The file on disk is LF-only, and the splitter contract is documented in the migration header.

Enabling fix in `server/tests/db-reset.php`: the canonical seed created `usr-trainer-test`→`trn-test-1` and `usr-trainer-must-test`→`trn-test-2` with zero `trainer` rows (pre-D9.2 db-reset's own verify asserted `trainer: 0`), leaving both canonical trainer users dangling by exactly this migration's predicate — and since runMigrations() auto-applies pending files on the first `database()` call after every reset, the migration would have deactivated both trainer logins and broken the 12 documented trainer-login spec flows (absensi-outbox-prune, audit-crud-styling trainer leg, audit2 trainer leg, flow-simulation trainer, m1-scope-shell trainer×2, m512 trainer registry, m53 trainer×2, settings-read-leak trainer leg, plus every destructive-project trainer login). The seed now inserts the two `trainer` rows the users reference (payload shape mirrors `_manual_seed_fixtures.php` upsertTrainer), the HY.0.1 verify asserts `trainer == 2` + `0 active users with dangling trainer_id`, and the summary prints `trainer (seeded): 2 (0 dangling refs)`.

New SQL verification `server/tests/cascade-orphan-cleanup.php` per the VERIFY spec: seeds 3 orphan users (`usr-d92-orphan-*`, cabang_id → a never-inserted `cbg-gone-*` id, two of them also carrying a dangling `trn-gone-*` trainer_id) plus 2 non-orphans (`usr-d92-clean-*`, superadmin no-refs) into the canonical test DB **before** the first `database()` call, so the real runMigrations() path applies the migration; asserts the migrations row is recorded with a 40-char checksum, all 3 orphans are `active=0, cabang_id=NULL, trainer_id=NULL` while username/display_name/password_hash/role survive (reference-preserving), the 2 non-orphans and all 4 canonical seed users stay active, and one `user_orphan_cleaned` audit row per orphan carries the pre-cleanup dangling ids (cabang_id column + metadata). Run 2 deletes the migrations row and re-executes the migration statements verbatim (mirroring siswa-foto-purge.php's run-2 simulation; runMigrations() is statically memoized per-process) — asserts zero rows touched, zero new audit rows. `php server\tests\cascade-orphan-cleanup.php` → pass ×2 consecutive runs (re-runnable); fail-fast precondition demands a post-D9.2 db:reset (canonical seed referentially consistent). Fixtures cleaned in `finally`.

Verification battery (2026-09-10): `php server\tests\cascade-orphan-cleanup.php` green ×2; `php server\tests\siswa-foto-purge.php`, `php server\tests\cascade-cleanup.php`, `php server\tests\schema.migration.php`, `php server\tests\api.integration.php`, `php server\tests\authorize.policy.php`, `php server\tests\entity.validation.php`, `php server\tests\identity.contract.php`, `php server\tests\invoice.generation.php`, `php server\tests\login.lifecycle.php`, `php server\tests\session.bootstrap.php`, `php server\tests\superadmin.bootstrap.php`, `php server\tests\endpoint.protection.php` (208 checks) all green; `php server\tests\users.endpoint.php` → 33 checks / 3 failures — **pre-existing drift proven by stash-and-rerun**: commit 1fcaf79 gave users.php session-based cabangId authority (rejecting client-sent cabangId from admin_cabang) but the spec still expects the old contract; identical 3/33 failures on stashed pre-D9.2 code, unrelated to this milestone (filed as follow-up). Named gates `npx playwright test tests/r3-verify.spec.js tests/multi-account-crud-sync.spec.js --workers=1` → 5/5 green. Full default-project suite (`npx playwright test --workers=1 --project=default`, post-db:reset): 91 passed / 16 failed (32.2m) — all 16 proven pre-existing: 12 `e2e.spec.js` selector drifts (HYGIENE 2026-09-03 class 2, documented at SCOPE_EXPANSION_MILESTONES.md:226), `student-delete-absensi` (documented class 4, fails at the same line 185 on baseline), and m64/m72/m73 (reproduced identically in isolation **and** on stashed pre-D9.2 code). Baseline comparison: 2026-09-07/08 full-suite was 77/24 — this run is 91/16, strictly better (post-859ea75 login-fix and PM.5-era selector repairs). `npm test` (vitest) 54/54 green; `npm run build` green (435.39 KiB precache). Zero regressions from D9.2.

Follow-ups outside this milestone's scope (taste #53): (1) `server/tests/users.endpoint.php` needs updating to users.php's post-1fcaf79 cabangId contract; (2) the 5 documented e2e/m64/m72/m73/student-delete pre-existing-failure cohorts need their owning milestones; (3) endpoint.protection.php / users.endpoint.php orphan their self-spawned `php -S` dev servers on Windows (proc_terminate doesn't reap the cmd.exe→php.exe child chain — three orphans observed and killed this session) and endpoint.protection.php's restore-test legitimately wipes the cabang table, requiring a db:reset after it — test-infra hardening for a follow-up microtask.

- Platform/auth owns `server/bootstrap.php`, `server/auth/`, `server/api/auth/`, schema/migrations, `src/lib/auth.js`, and `src/lib/api.js`.
- Scope/policy owns `server/auth/authorize.php`, branch filters, and policy tests.
- Product integration owns `src/App.jsx`, auth UI, store adapter, and role-sensitive integration.
- Data/release owns importer, reconciliation, backups, staging, and production runbooks.
- Test ownership covers unit, PHP integration, Playwright, build, security, and source-hygiene checks.

The project is not production-ready until soft-login is development-only, PHP sessions and password hashes are used, 401/403/409/422 are tested, server RBAC and branch isolation pass crafted API tests, CSRF/rate limits/expiry/headers/uploads pass, audits/backups/restore/migration/reconciliation pass, offline writes remain visibly pending until acknowledgement, existing product gates remain green, staging passes, and rollback is rehearsed with retained artifact and backup.
