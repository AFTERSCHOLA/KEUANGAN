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

### M1.2 Render soft login

```text
MICROTASK: Render soft login
  EDIT:    src/features/auth/RolePicker.jsx, src/App.jsx
  RULES:   R5; Indonesian copy; no credentials; prototype is visual reference only
  DEPENDS: M1.1
  OUTCOME: clearing v4 UI state shows a blocking login page and a valid non-production context unlocks the dashboard
  VERIFY:  Playwright proves Superadmin, Admin Cabang-with-branch, and Trainer-with-assignment persistence; invalid submissions stay blocked
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
**Status: BLOCKED — not done.**

Progress: fixed stale M5 test login helpers (`m52`/`m53`/`m54-verify.spec.js`) to select
a branch before submitting, since Admin Cabang login now requires `cabangId` (M7.1).
Reduced M5/Phase 5-7 gate failures from 13/16 to 8/16.

Two remaining failures are test-only defects (in scope for M1.4, not yet applied):
- `m53-verify.spec.js:178-180` — one inline re-login site still missing branch selection.
- `m53` M5.3.1 / `m54` exit gate — seed data injects `role: 'admin'`, which
  `normalizeRole()` rejects (only `superadmin`/`admin_cabang`/`trainer` are canonical
  per M1.1/G0.2). Fix is to seed `role: 'admin_cabang'` with a valid `cabangId`.

Five remaining failures (`m52-verify.spec.js`) are **not test defects** — they expose
a real application bug, out of M1.4's scope to fix. See "Known issues" below and the
corresponding row in `PRODUCTION_PLAN.md` section 12.

M1.4 cannot be marked DONE until either (a) the app bug is fixed upstream in M3.1 and
all 16 tests pass, or (b) an explicit scope decision is made to route around it (e.g.
running the affected M5.2 tests as Superadmin) with sign-off recorded here.

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
  EDIT:    src/App.jsx, src/features/auth/RolePicker.jsx, auth bootstrap tests
  RULES:   soft-login development-only; production fail-closed; no sensitive persisted identity
  DEPENDS: M4.1
  OUTCOME: production mode cannot unlock the dashboard from localStorage role state alone
  VERIFY:  production Playwright with only afterschola_v4_ui.role sees login; valid PHP session sees dashboard; expired session exposes no protected data
  DONE-IF: verify passes; only intended files changed
```

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

### D7.2 Deploy staging artifact

```text
MICROTASK: Deploy staging artifact
  EDIT:    cPanel document root, private config, schema migration, release artifact
  RULES:   same tested artifact; no secrets in bundle; least-privilege DB user
  DEPENDS: D7.1 and M6.3
  OUTCOME: staging serves the React app and authenticated PHP API over HTTPS
  VERIFY:  staging smoke suite passes auth, CSRF, role matrix, branch isolation, CRUD, conflicts, uploads, PWA, and backup paths
  DONE-IF: verify passes; only intended files changed
```

### D7.3 Import and reconcile staging data

```text
MICROTASK: Reconcile staging data
  EDIT:    staging database through reviewed migration/import only
  RULES:   verified backup; transaction/idempotence; no ad-hoc SQL repair
  DEPENDS: D7.2 and approved v4 export
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


## Ownership and final acceptance

- Platform/auth owns `server/bootstrap.php`, `server/auth/`, `server/api/auth/`, schema/migrations, `src/lib/auth.js`, and `src/lib/api.js`.
- Scope/policy owns `server/auth/authorize.php`, branch filters, and policy tests.
- Product integration owns `src/App.jsx`, auth UI, store adapter, and role-sensitive integration.
- Data/release owns importer, reconciliation, backups, staging, and production runbooks.
- Test ownership covers unit, PHP integration, Playwright, build, security, and source-hygiene checks.

The project is not production-ready until soft-login is development-only, PHP sessions and password hashes are used, 401/403/409/422 are tested, server RBAC and branch isolation pass crafted API tests, CSRF/rate limits/expiry/headers/uploads pass, audits/backups/restore/migration/reconciliation pass, offline writes remain visibly pending until acknowledgement, existing product gates remain green, staging passes, and rollback is rehearsed with retained artifact and backup.
