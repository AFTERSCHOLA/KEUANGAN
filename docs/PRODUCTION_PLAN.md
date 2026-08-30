# Afterschola Production Plan

## 1. Product and release boundary

Afterschola is locally testable today and cPanel is the deployment target, not a prerequisite for completing the application. The canonical product is the root `src/` React/Vite application; `frontend-style/` is visual reference material only and must never be included in the production bundle.

The first production release includes CRUD for operational entities, attendance capture and verification, SPP and honor ledgers, reports, branch scope, backup/restore, the PWA shell, secure login, server-side RBAC, audit logging, migration/reconciliation, staging deployment, and a rehearsed rollback. Real-time updates, soft-delete/trash, flexible honor matrices without an approved business case, and self-service email password reset are outside this release.

Soft-login is no longer used in any build. A single username + password form is the only entry point; tests sign in through the API via `loginViaApi()` in `tests/fixtures.js` against the seeded PHP test users. A production build must fail closed and cannot unlock protected screens from localStorage role state alone.

## 2. System topology

```text
Browser
  ├── React/Vite static artifact (same origin)
  ├── /api/auth/*       PHP session authentication
  ├── /api/*            PHP authorization + domain API
  ├── IndexedDB         approved offline cache/outbox and photos
  └── localStorage      non-sensitive UI preferences only

cPanel
  ├── HTTPS document root
  ├── PHP 8.2+ / PDO
  ├── MySQL database
  ├── private config/log/upload/backup locations
  └── cron for backups/health checks if available
```

Deployment is same-origin so session cookies and CSRF headers do not require cross-origin handling. The Vite artifact contains static UI assets only. PHP endpoints own authentication, authorization, validation, and domain persistence. MySQL is the authoritative shared data store. Uploads, logs, backups, and secrets live outside the public document root or are exposed only through authorized endpoints.

## 3. Canonical identity and role model

The server owns the user record and runtime role context. Required user fields are:

```text
id
username or email (unique)
displayName
password_hash
role: superadmin | admin_cabang | trainer
cabangId: nullable for superadmin, required for admin_cabang/trainer when assigned
trainerId: nullable except trainer accounts
active
mustChangePassword
failedLoginCount / lockedUntil or equivalent rate-limit state
createdAt / updatedAt / lastLoginAt
```

The server derives this runtime context:

```text
{ userId, role, cabangId, trainerId, permissions, sessionExpiry }
```

Only `superadmin`, `admin_cabang`, and `trainer` are valid roles. `admin`, `head-trainer`, and unknown roles are rejected at the server boundary; compatibility conversion is an explicit migration, never an authorization fallback. The client may display the safe identity but cannot author role, branch, trainer, or permission claims.

## 4. Authentication lifecycle

- `POST /api/auth/login` uses generic failure responses, bounded account/source throttling, inactive-user rejection, `password_verify()`, `session_regenerate_id(true)`, forced-password-change state, and an audit event.
- `GET /api/auth/me` returns only `{ id, username, displayName, role, cabangId, trainerId, active, mustChangePassword }`, or 401. It never returns a password field.
- `GET /api/auth/csrf` returns the synchronizer token stored in the PHP session.
- `POST /api/auth/change-password` requires an authenticated session and CSRF token, enforces the password policy, clears `mustChangePassword`, regenerates the session, and audits the change.
- `POST /api/auth/logout` requires CSRF, destroys the server session and cookie, and audits the logout.
- `POST /api/users` and user-management operations are Superadmin-only. Reset creates no plaintext persistence and sets `mustChangePassword`.

Sessions use secure HttpOnly cookies, `SameSite=Lax`, HTTPS-only `Secure` in production, strict session mode, idle and absolute expiry, cookie-only session IDs, and server-side invalidation. Login secrets never appear in browser storage or URLs.

## 5. Authorization matrix

The PHP `authorize($action, $resource, $data)` policy is deny-by-default and is authoritative for every read and write.

| Capability | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Cabang management | Full, all branches | None | None |
| Schools | Full, all branches | Read own branch | Read assigned schools |
| Trainers | Full, all branches | Read own branch | Read own record |
| Students | Full, audited | Full, own branch | Read-only assigned students |
| Attendance | Read/verify all | Write/verify own branch | Write own sessions; self-certify own weekly records |
| SPP collection | Full, all branches | Record own branch; mark deposited | None |
| Honor payments | Full; only writer | Read own trainers | None |
| Invoices/slips | Generate all | View/print own branch | None |
| Financial reports | Full, cross-branch | Own branch, redacted | None |
| Tunggakan/WA | All branches | Own branch | None |
| Backup | Any/all | Own branch | None |
| Restore | Full, confirmed | None | None |
| Audit log | Full | Own branch read-only | None |
| Global settings and tariffs | Full | None | None |

The server scopes every query and validates every write. A missing or invalid branch ownership relation is denied, never treated as global. React visibility is convenience only.

## 6. Data/API contract

Canonical entities and ownership are:

- `cabang`
- `sekolah.cabangId`
- `trainer.sekolahIds[]` plus an explicit branch relationship
- `siswa.sekolahId`
- `absensi.sekolahId`, `trainerId`, verification and certification fields
- `sppPayments.siswaId`, `cabangId`
- `honorPayments.trainerId`, `cabangId`
- `invoices.sekolahId`, `cabangId`
- `settings`
- `users`
- `audit_log`

All joins use IDs; names are display caches. Periods use `YYYY-MM`. IDs are opaque or branch-prefixed. Payloads are validated against factory-shaped records. Ledgers are append-only and idempotent by immutable ID. Derived finance values are computed by the server and are never accepted as authoritative client input.

The existing `read.php`, `sync.php`, `absensi.php`, `sppPayments.php`, and `honorPayments.php` files are scaffolding. They must require authentication, apply policy before querying or writing, validate JSON and ownership, and expand to the required entities. API semantics are 401 unauthenticated, 403 unauthorized, 409 ID/version conflict, 422 validation error, and generic 500 without internals. Reads have allow-listed entities, pagination, and body/response size limits.

## 7. CSRF, browser, and server security

Production requires HTTPS. HSTS is enabled only after HTTPS is confirmed. Session cookies are HttpOnly, Secure in production, SameSite=Lax, strict-mode, cookie-only, and expiry-bound. Every cookie-authenticated state-changing request sends the session synchronizer token in a custom header; missing or mismatched tokens return 403.

Responses provide a compatible Content-Security-Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, frame protection, and a camera-compatible `Permissions-Policy` when attendance capture requires it. PHP uses prepared PDO statements, allow-listed entity/action routing, strict JSON content types, request/body limits, enum/number/date validation, and generic production errors.

Directory listing is disabled. Config, SQL, dumps, logs, source maps, and executable uploads are not directly accessible. Audit logs exclude passwords, tokens, and unnecessary PII. Login throttling, inactive accounts, password policy, forced first-login change, and Superadmin-managed reset are required.

## 8. Photos and offline behavior

The service worker caches static assets only by default. Approved authenticated IndexedDB storage may hold the minimal Trainer attendance cache, outbox, and photos. localStorage contains only non-sensitive UI preferences. Photos are never stored in localStorage for production.

Uploads validate actual image content, MIME, size, dimensions, and extension. The server generates names and stores files outside executable/public paths or serves them through authorized endpoints. Abandoned uploads are cleaned up.

Outbox states are `pending`, `sent`, `conflict`, `failed`, and `discarded`. A record is visibly pending until server acknowledgement. Network retry preserves pending writes. 401 returns to login without claiming success; 403 remains denied; 409 surfaces a reload/merge path; duplicate immutable ledger IDs are idempotently acknowledged. Logout must require syncing or explicitly discarding pending writes. “Saved offline” never means “server saved.”

## 9. Migration and reconciliation

The only import source is the canonical `afterschola_v4_*`/v4 JSON backup. Firebase, prototype data, `afterschola_v3_*`, hardcoded credentials, `loginKode`, and legacy name-based relationships are excluded.

Every import requires:

1. A backup and immutable source checksum.
2. Dry-run validation before writes.
3. Explicit branch assignment for every record.
4. Reference and duplicate checks.
5. Idempotent import with migration version and checksum.
6. Transaction and rollback behavior.
7. Post-import row-count and finance reconciliation.
8. Separate user bootstrap and password setup.

## 10. Testing and quality gates

Unit coverage is required for policy/role normalization, branch scope, migrations, finance invariants, and outbox state transitions. PHP integration tests use a test database. Playwright covers real login, expiry, role matrix, branch isolation, attendance, ledger idempotency, upload validation, backup/restore, and offline behavior. The production build, source hygiene scan, and artifact secret scan must pass.

Existing M0–M7 and Phase 5–7 exit gates, finance invariants, visual parity, PWA build, and no-debug/source-hygiene checks remain mandatory.

## 11. cPanel staging and production runbook

Prerequisites are DNS and staging subdomains, confirmed HTTPS, PHP 8.2+, required PDO/MySQL/session/fileinfo/upload extensions, a least-privilege MySQL user/database, private config and upload/backup paths, cron if available, and cPanel Terminal access for the first Superadmin bootstrap.

Build once and deploy the same artifact to staging. Configure private secrets outside git and outside the document root. Apply ordered schema migrations, bootstrap the first Superadmin through the protected command, run smoke and security tests, import only an approved v4 export, and sign the reconciliation report.

Before production promotion, create and verify a readable database backup, retain the previous artifact/configuration, promote the tested artifact, run the production smoke suite, and record the release. Rollback restores a known artifact/configuration and the corresponding database backup; it never uses ad-hoc production SQL. Post-release checks verify authentication, scopes, headers, backups, audits, and health checks.

## 12. Status and decisions

| Area | Status | Resolving milestone / boundary | Owner |
|---|---|---|---|
| Root React/Vite app and modular features | Complete | Existing M0–M7 gates | Product integration |
| Canonical v4 local entities and factories | Complete/partial | M1.1, M3.2 | Product integration |
| Soft role picker and Trainer dashboard | Partial | M1.1–M1.4 | Product integration |
| Branch entity and branch filtering | Partial | M1.1, M3.2, M4.3 | Scope/policy |
| PHP PDO/MySQL ledger scaffold | Partial | M2.1–M3.4 | Platform/auth |
| Secure authentication and sessions | Partial | M2.1–M2.4, M4.1–M4.2 | Platform/auth |
| Server RBAC and branch authorization | M3.1 done (policy + full matrix tests pass, KI-1 resolved); M3.2–M3.5 remaining | M3.2–M3.5 | Scope/policy |
| CSRF, headers, rate limiting, upload controls | Not implemented | M5.1–M5.2 | Platform/auth |
| Authenticated offline outbox/conflicts | Partial | M5.3 | Product integration |
| v4 migration and reconciliation | Not implemented | M6.1–M6.2 | Data/release |
| cPanel staging and production promotion | Blocked on hosting access | D7.1–D8.3 | Data/release |
| Trial conversion billing | Requires business decision | M5.4 decision gate, before trial release | Product/business approver |
| Self-service email reset | Deferred | Post-release P1: transactional email infrastructure | Platform/auth |
| Real-time updates | Deferred | Post-release P2: realtime infrastructure | Platform/auth |
| Soft-delete/trash | Deferred | Post-release P3: retention and recovery decision | Product integration + Data/release |
| Flexible branch-specific honor matrix | Deferred pending business case | Post-release P4: approved business case | Product/business approver |
| Prototype cleanup and handoff | Deferred until visual parity/handoff | Existing visual gate, before release handoff | Product integration |
| JWT, signed-header auth, and per-branch `.htaccess` protection | Explicit non-goal | Excluded from first release; revisit only through a new architecture decision | Platform/auth |

## Non-goals for this release

- Firebase or the `frontend-style` implementation.
- `afterschola_v3_*` storage or prototype credentials.
- JWT stored in browser storage.
- A Node backend in cPanel production.
- Real-time/WebSocket infrastructure.
- Soft-delete/trash.
- A full flexible honor matrix without an approved business case.
- Self-service email password reset without transactional email infrastructure.
- Any client-side role check treated as a security boundary.
