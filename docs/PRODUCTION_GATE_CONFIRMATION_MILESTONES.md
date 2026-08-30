# Temporary Production Gate Confirmation Milestones

This is a short execution checklist for confirming `PRODUCTION_MILESTONES.md`. The authoritative plan remains `PRODUCTION_PLAN.md` and `PRODUCTION_MILESTONES.md`; this document does not replace either one.

A gate is `VERIFIED` only when its check passes. Otherwise record `PARTIAL`, `BLOCKED`, or `UNVERIFIED` with evidence. Local checks cannot prove cPanel production readiness. Remove or fold this document into the authoritative status tables after the release-candidate gate closes.

## Gate T0 — Freeze evidence and environment

```text
MICROTASK: Freeze evidence
  EDIT:    this document's evidence table only
  RULES:   production docs are authoritative; no credentials in git
  DEPENDS: required first reads complete
  OUTCOME: the current commit, working-tree state, runtimes, database prerequisites, and exact checks are recorded
  VERIFY:  inspect docs, git status, package scripts, PHP availability, and server/config.example.php
  DONE-IF: evidence is recorded; no source or credential files changed
```

## Gate T1 — Restore frontend baseline

```text
MICROTASK: Restore frontend baseline
  EDIT:    src/lib/api.js, src/lib/constants.js, related tests only
  RULES:   smallest bounded fix; preserve canonical roles and branch-prefixed IDs
  DEPENDS: T0
  OUTCOME: the frontend test suite and production build can execute
  VERIFY:  npm test && npm run build both exit 0
  DONE-IF: verify passes; only intended files changed
```

## Gate T2 — Confirm local role and product gates

```text
MICROTASK: Confirm local gates
  EDIT:    only failing gate-owned files and focused tests
  RULES:   M1.1–M1.4, M5/Phase 5–7 gates, audit rules; no unrelated cleanup
  DEPENDS: T1
  OUTCOME: role persistence, branch isolation, trainer creation, attendance, finance, dialogs, and audit flows remain executable
  VERIFY:  focused Playwright gates, stress simulation, and the original M1.4/Phase 5–7 suite pass with zero page errors
  DONE-IF: verify passes; failures outside scope are recorded, not patched here
```

## Gate T3 — Confirm PHP foundation and protected APIs

```text
MICROTASK: Confirm server contracts
  EDIT:    non-committed test configuration/environment; server source only for contract failures
  RULES:   G0.2, M2.1–M2.4, M3.1–M3.5; server identity and RBAC are authoritative
  DEPENDS: T2; PHP 8.2+, MySQL/PDO, and test database available
  OUTCOME: sessions, password lifecycle, CSRF, policy, validation, protected endpoints, audit events, and invoice behavior are evidenced
  VERIFY:  PHP syntax, identity, session, login, schema, policy, entity, endpoint, API, audit, and invoice tests exit 0
  DONE-IF: verify passes; unavailable PHP/database/hosting prerequisites are explicitly marked blocked
```

## Gate T4 — Switch React to authenticated production mode

```text
MICROTASK: Wire authenticated React
  EDIT:    src/App.jsx, src/features/auth/RolePicker.jsx, src/lib/auth.js, src/lib/store.js, feature write adapters
  RULES:   M4.1–M4.3; production fail-closed; no sensitive localStorage identity; 401/403/409 semantics
  DEPENDS: T3
  OUTCOME: production boot requires a valid PHP session and feature writes use authenticated server authority while offline work stays visibly pending/conflicted
  VERIFY:  production-mode Playwright with only localStorage role state shows login; valid session reaches the dashboard; API tests prove 401, 403, and 409 handling
  DONE-IF: verify passes; local soft-login remains development/test-only
```

## Gate T5 — Close security, uploads, offline, and operations

```text
MICROTASK: Harden operations
  EDIT:    security middleware/deployment rules, photo endpoints, outbox adapter, runbooks, checks
  RULES:   M5.1–M5.4; secure files; authorized photos; append-only ledgers; no silent data loss
  DEPENDS: T4
  OUTCOME: headers, protected paths, upload validation, authorized retrieval, explicit outbox states, logout behavior, backups, and runbooks are verifiable
  VERIFY:  security/header, upload, offline/conflict, backup/restore, secret-scan, and no-debug checks pass
  DONE-IF: verify passes; trial billing remains blocked until its business decision is recorded
```

## Gate T6 — Close migration and reconciliation

```text
MICROTASK: Verify migration
  EDIT:    protected importer, validators, reconciliation scripts, fixtures, and runbook
  RULES:   M6.1–M6.2; v4-only source; checksum; dry-run; transaction; idempotence; reference preservation
  DEPENDS: T5
  OUTCOME: an approved v4 backup imports safely and its counts, scopes, references, ledgers, and finance totals reconcile
  VERIFY:  broken fixture writes zero rows; valid fixture imported twice has identical counts, IDs, references, and totals; reconciliation report is signed
  DONE-IF: verify passes; no ad-hoc production SQL used
```

## Gate T7 — Confirm cPanel staging

```text
MICROTASK: Verify staging
  EDIT:    staging configuration and release record only
  RULES:   D7.1–D7.3; do not guess hosting capabilities; deploy the tested artifact
  DEPENDS: T6; cPanel account, staging domain, HTTPS, and database access available
  OUTCOME: actual PHP/extensions, document root, private paths, artifact deployment, data import, and staging smoke results are recorded
  VERIFY:  staging health and smoke suite pass auth, CSRF, roles, branch isolation, CRUD, conflicts, uploads, PWA, and backup paths
  DONE-IF: verify passes; otherwise remain BLOCKED with the missing capability named
```

## Gate T8 — Promote and rehearse rollback

```text
MICROTASK: Rehearse release
  EDIT:    release record, backup/cron configuration, and runbook corrections only
  RULES:   D8.1–D8.3; same artifact as staging; retained backup; reversible migration; audited actions
  DEPENDS: T7; production approval available
  OUTCOME: production promotion, backup verification, post-release checks, and rollback are reproducible
  VERIFY:  readable checksum-backed backup, production smoke suite, release record, rollback rehearsal, and post-rollback audit/health checks pass
  DONE-IF: verify passes; the release is not called production-ready before this gate
```

## Final reconciliation

| Gate | Status | Verified evidence | Remaining blocker / owner |
|---|---|---|---|
| T0 / G0 | VERIFIED | Initial freeze: `git rev-parse HEAD` -> `b360e62d9a85107a05a12fd8acf0efd1b273b7b3`; `git status --short --branch` -> `test-stage...origin/test-stage [ahead 23]`; `node --version` -> `v24.16.0`; `npm --version` -> `11.13.0`; initial PHP/MySQL prerequisites were unavailable and are now supplied through XAMPP; `server/config.example.php` is present; ignored `server/config.php` was created for the disposable test database; tracked config/credential scan found no committed credentials. Current bounded test edits are recorded under T2/T3. | Local evidence is not cPanel production evidence; Platform-auth / Data-release |
| T1 / frontend baseline | VERIFIED | `npm test` -> 10 files / 34 tests passed; `npm run build` -> Vite production build succeeded; pre-existing `src/lib/api.js` and `src/lib/constants.js` changes were preserved. | No T1 blocker remains; Platform-auth / Product integration |
| T2 / local product gates | VERIFIED | `npx playwright test` focused role/product set -> 27 passed with zero page errors, including KI-1, M1.2–M1.3, M5.1–M5.4, and Phase 5–7; original M1.4/Phase 5–7 suite -> 13 passed; `npx playwright test tests/stress-simulation.spec.js --workers=1` -> 1 passed with `FINAL PAGE ERRORS []`; `Changed:` `tests/m53-verify.spec.js`, `tests/m54-verify.spec.js`, `tests/phase567-exit-gate.spec.js` only. | Stress findings remain tracked by the audit milestones (F1–F5, F7, F11–F12, F17, F20, F22 and the trainer sync visibility finding); T4–T8 environment/hosting gates remain blocked or unverified. |
| T3 / G0–M3 server | VERIFIED | `D:\Games and Apps\xampp\php\php.exe --version` -> PHP 8.2.12; required `curl`, `PDO`, `pdo_mysql`, and `session` extensions present; XAMPP MariaDB 10.4.32 responded to `mysqladmin ping`; isolated `afterschola_t3_test` database created; ignored `server/config.php` configured with `environment=test`, local PDO DSN, and `session_secure=false`. `php -l` passed for every `server/**/*.php` file. `server/tests/identity.contract.php`, `session.bootstrap.php`, `login.lifecycle.php`, `schema.migration.php`, `authorize.policy.php`, `entity.validation.php`, `api.integration.php`, `invoice.generation.php`, and `superadmin.bootstrap.php` exited 0; final `server/tests/endpoint.protection.php` exited 0 with 201 checks passed. | Local T3 evidence does not prove cPanel production readiness; XAMPP test database/configuration is disposable and credentials remain outside git; Platform-auth / Data-release |
| T4 / M4 authenticated React | PARTIAL | Adapter exists; production bootstrap and feature write migration remain incomplete | Product integration |
| T5 / M5 operations | PARTIAL | Some session, PWA, IndexedDB, sync, and backup code exists | Platform-auth / Product integration |
| T6 / M6 migration | UNVERIFIED | No complete importer/reconciliation evidence recorded | Data-release |
| T7 / D7 staging | BLOCKED | Hosting capability evidence is absent | Data-release |
| T8 / D8 release/rollback | BLOCKED | No production backup, promotion, or rollback rehearsal evidence | Data-release |

## Reporting format

Use only compact evidence statements:

- `Verified: <command> -> <decisive result>`
- `Changed: <bounded files>`
- `Unverified: <check> -> <environment or evidence reason>`
- `Remaining: <next bounded blocker / owner>`

Do not expand scope into deferred email reset, realtime updates, soft-delete/trash, flexible honor matrices, JWT, or routing work.
