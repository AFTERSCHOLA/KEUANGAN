# Auth API Plan — Hybrid-Opaque (Browser Cookie + Service Bearer)

**Status:** DRAFT 2026-09-23 — agreed common ground: hybrid-opaque. For team evaluation, no code executed yet.
**Position:** Temporary auth/API readiness chain. This document does **not** replace `PRODUCTION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, or `IMPLEMENTATION_PLAN.md`. When Gate AA-D closes, §10 records write-back to source docs and this pair is folded or retired.
**Trigger:** Persistent CSRF 403 drift on browser Login page across devices/setups/deploy + other division request for API readiness (login, attendance, schools, students/siswa, SPP financing, trainers, server-to-server token instead of session cookie).
**Observable outcome:** Other-division script mints one service token once, then writes one attendance via `Authorization: Bearer` with zero CSRF traffic, while browser cookie login is untouched.
**Falsifiable check:** `mint -> me via Bearer without CSRF = 200; revoke -> next Bearer use = 401; browser POST without CSRF still = 403`.

---

## 1. Context and inputs

- Browser auth today is cookie session `afterschola_session` (HttpOnly, Lax, Secure in prod, `SESSION_IDLE_SECONDS=1800`, `SESSION_ABSOLUTE_SECONDS=28800`, `session_regenerate_id(true)` on login): `server/auth/session.php:4-10,38-81,123-131`.
- Every cookie-authenticated state-changing request requires `X-CSRF-Token`, mismatch returns 403 `Token keamanan tidak valid`: `server/auth/session.php:139-145`, sent via `src/lib/api.js:43-46`. Login itself uses `skipCsrf:true`: `src/lib/auth.js:115-123`.
- Login throttling is per `username|IP` (`loginAttemptKey`), 5 fails → 15min lock, generic 401 anti-enumeration, cleared on success: `server/auth/session.php:165-185`, `server/api/auth/login.php:11-28`.
- Authorization is deny-by-default and authoritative server-side: `authorize($action,$resource,$data)` + `trainerHasActiveAssignment()` + `recordOwnsBranch()`: `server/auth/authorize.php:57-216`. Client scope (`isWithinScope`, `prepareWritePayload`) is filter-only: `src/lib/store.js:40-137,308-341`.
- Topology is same-origin (Vite `/api → localhost:8000` proxy, no browser CORS): `vite.config.js:36-43`, `docs/PRODUCTION_PLAN.md:29`. Canonical backend is `server/`; `deploy/` is a generated mirror via `npm run build:deploy` (HARD parity gate): `scripts/build-deploy.cjs:1-33,44-61`.
- Migrations run lexically from `server/migrations/*.sql` via `runMigrations()` + `schema.sql` as base: `server/bootstrap.php:121-175`. Existing contract tests live in `server/tests/` (`login.lifecycle.php`, `endpoint.protection.php`, `entity.validation.php`).
- Pain: CSRF 403 drift on Login/first-POST across devices/setups (session path, proxy bypass calling `:8000` directly, multi-tab regenerate `loginSession()`), while login limit itself correctly returns 401 not 403.
- Other division needs machine API for login, attendance, schools, siswa, SPP, trainers with a service token, not cookies.

---

## 2. Goals and non-goals

### Goals

1. Browser Login page becomes reliable without weakening security (cookie+CSRF preserved, root causes fixed via owned session path + proxy discipline).
2. Server-to-server API works with opaque Bearer tokens: no cookies, no CSRF on Bearer, same `authorize()` scope.
3. First runnable slice is login+mint + me/read + attendance write via Bearer (Login + attendance first, per team agreement).
4. Full CRUD gist (schools, siswa, SPP, trainers, honor/invoices boundaries) is specified here so the next session has the gist, but implemented only in Gate AA-D.
5. Universal/flexible across devices, setups, deploy envs: env-driven config, same-origin preserved, deterministic `build:deploy` mirror, no secrets in repo/logs.

### Non-goals (stay out of this chain)

- No JWT in browser storage; no browser `localStorage/sessionStorage` tokens.
- No OAuth2 full server, SSO, browser refresh-rotation, or per-branch `.htaccess` protection.
- No role broadening as a shortcut (taste #33); `honorPayments` stays superadmin-write, `invoices` stays superadmin-write per matrix.
- No Firebase / `afterschola_v3_*` / Node prod backend / realtime / soft-delete-trash / email reset (per `PRODUCTION_PLAN.md` deferred/non-goals).
- No styling changes while touching auth logic (one concern per edit).

---

## 3. Findings registry (F-AA)

| ID | Finding | Evidence |
|---|---|---|
| F-AA1 | Browser session is HttpOnly+Lax (+Secure prod), idle 1800s / absolute 28800s, regenerate on login. | `server/auth/session.php:38-81,123-131` |
| F-AA2 | CSRF 403 drift hits first POST after login when session does not round-trip (direct `:8000` bypass, unwritable session path, multi-tab regenerate). | `server/auth/session.php:43-55,139-145`, `src/lib/api.js:43-46`, `vite.config.js:36-43` |
| F-AA3 | `authorize()` is deny-by-default with explicit branch/assignment scope for all three roles. | `server/auth/authorize.php:150-216` |
| F-AA4 | Login/mint abuse is throttled (5 fails → 15min, generic 401). | `server/auth/session.php:165-185`, `server/api/auth/login.php:11-28` |
| F-AA5 | Same-origin only; `deploy/` must mirror `server/` via `npm run build:deploy` (missing/extra files fail the build). | `scripts/build-deploy.cjs:1-33`, `docs/PRODUCTION_PLAN.md:29` |
| F-AA6 | Other division needs machine API: login, attendance, schools, siswa, SPP, trainers + service token (not cookie). | Team request 2026-09-23; no existing token table in `server/schema.sql:13-53` |
| F-AA7 | JWT in browser storage is an explicit non-goal; secrets must never appear in browser storage/URLs. | `docs/PRODUCTION_PLAN.md:177,183` + `§4` |
| F-AA8 | No service-token table, guard, or mint/revoke endpoint exists yet; `server/auth/` has only `session.php` + `authorize.php`. | `server/auth/` listing, `server/api/auth/` listing |

---

## 4. Decision set (D-AA) — Concrete pick: hybrid-opaque (Locked)

| # | Decision | Status |
|---|---|---|
| D-AA1 | **Hybrid locked, no third mode.** Browser = cookie session + CSRF unchanged. Machines = opaque Bearer. | Locked |
| D-AA2 | **Opaque token shape.** `aft_<prefix8>_<secret43>`; `secret = base64url-nopad(random_bytes(32))`; DB stores `token_hash = SHA256(secret)` (+ HMAC pepper when `SERVICE_TOKEN_PEPPER` set), `prefix` plain for lookup + `last4` for display. Header `Authorization: Bearer aft_...`. Secret shown exactly once at mint. | Locked |
| D-AA3 | **CSRF boundary.** Bearer → skip CSRF (no ambient credentials). Cookie/session → require `X-CSRF-Token`. Both present → require CSRF (fail-closed). Matrix covered by unit test. | Locked |
| D-AA4 | **Scope inheritance, no broadening.** Token binds `user_id + role + cabang_id (+ trainer_id when trainer)` at mint; every request calls the same `authorize()`; `admin_cabang`/trainer auto-scoped to own branch/assignment; `honorPayments`/`invoices`/restore stay superadmin-only. | Locked |
| D-AA5 | **Expiry/revoke/audit.** Default TTL 90d, max 365d; columns `expires_at, revoked_at, last_used_at`; revoke is immediate; audit via existing `audit_log` (`service_token_minted/revoked/denied`) with no secret in metadata. | Locked |
| D-AA6 | **Throttle mint+login.** Mint endpoint joins the same 5/15min per-user+IP throttle; 401/429 generic Indonesian messages; no user/token enumeration. Reactive test-data hygiene (`DELETE ... WHERE username LIKE 'test_%'`), no production caps. | Locked |
| D-AA7 | **Env/deploy discipline.** Same-origin `/api/*` (no `/api/v1` fork); `Secure` cookie prod-only; pepper via env contract alongside `server/config.php`; migration as dated `server/migrations/2026-*-service-tokens.sql` + `schema.sql` update; `deploy/` only via `npm run build:deploy`; no secrets in git/logs. | Locked |
| D-AA8 | **No JWT in browser.** `localStorage/sessionStorage` tokens forbidden (static check); browser flow untouched. JWT/PASETO parked as future-only if stateless becomes a real requirement. | Locked |
| D-AA9 | **Slice order.** AA.A token table+migration → AA.B mint/revoke+me (login first) → AA.C attendance via Bearer → AA.D full-CRUD gist (schools/siswa/SPP/trainers). Later gates do not start until prior VERIFY passes. | Locked |
| D-AA10 | **Contract shape.** JSON `{data, error:{code,message}}`; stable Indonesian codes (`AUTH_LOCKED`, `CSRF_MISMATCH`, `TOKEN_REVOKED/EXPIRED`); 401 unauthenticated, 403 CSRF/scope, 409 duplicate id, 422 validation, generic 500. | Locked |

---

## 5. Rules (R-AA)

- **R-AA1** Deny-by-default; never broaden a role as a shortcut; branch/assignment checks live in `authorize()`, not in handlers.
- **R-AA2** Bearer skips CSRF; cookie requires CSRF; both-present requires CSRF.
- **R-AA3** Indonesian UI/error copy; stable error codes; no secret/token in responses except the one-time mint body.
- **R-AA4** Generic 401/429 on login/mint failure; `hash_equals` compare; throttle key is `lower(username)|IP`.
- **R-AA5** One concern per edit; no styling changes inside auth edits; mirror existing `server/api/auth/*` + `server/tests/*` idioms.
- **R-AA6** Migrations idempotent, collision-safe, reference-preserving; checksum recorded; completion only after transformed data validates.
- **R-AA7** Verification language: `Verified: <command> -> <result>` / `Unverified: run <command>`; every microtask has one OUTCOME + one falsifiable VERIFY.
- **R-AA8** Source hygiene gate: no `console.log` in `src/`, no secrets in tracked files, `git status` clean of artifacts at handoff.

---

## 6. Data model + endpoint contract (reuse, no fork)

```text
service_tokens
{
  id VARCHAR(191) PK,          // srv-... (branch-prefixed where applicable)
  prefix VARCHAR(16) UNIQUE,   // 8 chars, lookup key
  token_hash CHAR(64) UNIQUE,  // SHA256(secret) or HMAC-SHA256(pepper, secret)
  last4 CHAR(4),
  user_id VARCHAR(191) FK -> users.id,
  role ENUM('superadmin','admin_cabang','trainer'),
  cabang_id VARCHAR(191) NULL, // required for admin_cabang/trainer, nullable for superadmin
  trainer_id VARCHAR(191) NULL,
  name VARCHAR(191),
  expires_at DATETIME, revoked_at DATETIME NULL,
  last_used_at DATETIME NULL, created_ip VARCHAR(64),
  created_at/updated_at TIMESTAMP
}
INDEX idx_service_tokens_user (user_id), INDEX idx_service_tokens_expiry (expires_at)
```

```text
POST server/api/auth/tokens.php {action:'mint', name, ttl_days<=365, cabang_id?}
  auth: cookie+CSRF (browser) — reuses login throttle; returns {token (once), prefix, expires_at}
GET  server/api/auth/me.php            // cookie OR Bearer (Bearer skips CSRF)
DEL  server/api/auth/tokens.php {action:'revoke', prefix}
POST server/api/absensi.php / absensiPengajar.php / sekolah.php / siswa.php /
     sppPayments.php / trainer.php     // existing handlers + Bearer guard, same authorize()
GET  server/api/read.php?entity=...    // existing allow-list + Bearer guard
```

Guard order per endpoint (existing convention): `405 method → 401 auth (cookie or Bearer) → 403 CSRF (cookie path only) → 422 body → 403 scope → 201/200`.

---

## 7. Alignment table — verify-the-verification (taste #68)

| Item | Docs say | This plan | Verdict |
|---|---|---|---|
| Cookie session + CSRF required | `PRODUCTION_PLAN.md:59-66,111-117` requires session+CSRF | D-AA1/D-AA3 preserve it for browsers | Confirmed — no change |
| JWT / signed-header / `.htaccess` per-branch | `PRODUCTION_PLAN.md:177` explicit non-goal; revisit only via new architecture decision | D-AA8 forbids JWT-in-browser; opaque Bearer is the new-decision vehicle (this pair) | Tension resolved as new decision, not silent patch |
| Server-first storage, same-origin, `build:deploy` mirror | `SCOPE_EXPANSION_PLAN.md` Part 5; `PRODUCTION_PLAN.md:29,148-154`; `scripts/build-deploy.cjs` HARD gate | D-AA7 reuses `/api/*` + mirror, no `/api/v1` fork | Confirmed |
| Role matrix (3 roles, branch scope) | `SCOPE_EXPANSION_PRIVILEGES.md` matrix + `PRODUCTION_PLAN.md:68-90` | D-AA4/R-AA1 reuse `authorize()` unchanged in scope | Confirmed — just a matter of wiring Bearer to it |
| Login throttle, password policy, `mustChangePassword` | `PRODUCTION_PLAN.md:59-66,117` | D-AA6 extends same throttle to mint | Confirmed + small extension |
| API for attendance/schools/students/SPP/trainers via token | Only implied (`SCOPE_EXPANSION_PLAN.md` Phase C C3 server-first prep; `PRODUCTION_PLAN.md:109` scaffolding note) | AA.C first, AA.D gist | Partially specified → this plan makes it explicit |
| CSRF 403 drift as persistent bug | Not documented as a finding; CSRF gate documented as required | F-AA2 records it; fix is session-path/proxy discipline, not CSRF removal | New finding owned here |

---

## 8. Risks + deferred with owners

| Item | Disposition | Owner |
|---|---|---|
| JWT/PASETO stateless, OAuth2 full, browser refresh-rotation | Deferred — revisit only with measured need (revocation + stale-claim analysis) | Platform/auth |
| mTLS, per-branch `.htaccess`, signed-header auth | Explicit non-goal per `PRODUCTION_PLAN.md:177` | Platform/auth |
| Email password reset, realtime, soft-delete/trash, honor matrix w/o case | Deferred per `PRODUCTION_PLAN.md` P1–P4 | Respective owners |
| Trial billing rule (M5.4 gate) | Open business decision, out of this chain | Product/business approver |

---

## 9. Verification language

Use `Verified: <command> -> <result>` / `Unverified: run <command>`. Destructive steps (db:reset/restore) run last; test DB stays isolated/disposable. Contract scripts in `server/tests/` are run directly, each reported individually — never assumed covered by `npm test`.

---

## 10. Completion write-back

When Gate AA-D closes: mark the gate complete on this pair, record bounded changes + verification evidence here, and reconcile stale claims in `PRODUCTION_PLAN.md` §12/CSRF rows + `SCOPE_EXPANSION_PLAN.md` Phase C C3 (server-first) rather than leaving source-of-truth inconsistent. Then fold or retire this pair.

*End of Auth API Plan — hybrid-opaque, Login + attendance first, full CRUD gist for next session.*
