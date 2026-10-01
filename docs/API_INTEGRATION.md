# API Integration Guide (`docs/API_INTEGRATION.md`)

**Status:** Updated 2026-10-01 — Gates AA.A → AA.C **IMPLEMENTED** (service_tokens table, Bearer guard, mint/revoke/me, throttle fix, attendance via Bearer). Schools/siswa/SPP/trainers via Bearer remain **PLANNED** (Gate AA.D open) — those 4 sectors are still cookie-session + CSRF only. The §3 mint → use → revoke flow below works now for login/me/attendance; do not use Bearer against the 4 AA.D sectors yet.
**Purpose:** One document the other division follows to (a) use what works today via cookie + CSRF, and (b) understand exactly what the planned Hybrid-Opaque server-to-server path will change (Gates AA.A → AA.D in `AUTH_API_PLAN.md` / `AUTH_API_MILESTONES.md`). Every claim below is anchored to file:line; planned items are labeled `PLANNED`.
**Conventions:** doc structure is English per house style; UI copy and error strings are quoted in Indonesian exactly as the app renders them. Host-specific values are placeholders — `<domain>`, `<db-name>` — never a guessed real path. Local API base is `http://127.0.0.1:8000` (docroot `server/`); production API base is `https://<domain>` (docroot `deploy/`, generated via `npm run build:deploy`, never hand-edited). cURL examples use `curl.exe`. Verification language: `Verified: <command> -> <result>` / `Unverified: run <command>`.

**Observable outcome:** An other-division script can mint one service token once, then read/write login/me/attendance via `Authorization: Bearer` with zero CSRF traffic (§3, live since 2026-10-01). Schools/siswa/SPP/trainers via Bearer work only after Gate AA.D closes.
**Falsifiable check:** `mint -> me via Bearer without CSRF = 200; revoke -> next Bearer use = 401; browser POST without CSRF still = 403` (function-level lock: `service-token.lifecycle`, `throttle-csrf.matrix`, `attendance-bearer.scope` all EXIT 0; HTTP/playwright rows remain manual — see §7).

---

## 1. Alignment table — verify-the-verification (taste #68)

| Item | Docs say | Code reality | Verdict |
|---|---|---|---|
| Hybrid-Opaque agreed, no code yet | `AUTH_API_PLAN.md:3` `DRAFT 2026-09-23 — no code executed yet` | `server/auth/` = only `session.php` + `authorize.php`; `server/api/auth/` = 5 files, no `tokens.php`; grep `Bearer\|service_tokens\|SERVICE_TOKEN_PEPPER` in `server/` = 0 hits | Confirmed — unimplemented by design |
| Browser = cookie `afterschola_session` + `X-CSRF-Token` | `PRODUCTION_PLAN.md:59-66,111-113`; `AUTH_API_PLAN.md:12-14` | `server/auth/session.php:38-81` session setup; `session.php:267-272` `requireCsrf()` → 403 `"Token keamanan tidak valid"`; `src/lib/api.js:43-46` auto-injects `X-CSRF-Token`, `src/lib/api.js:51` `credentials:'same-origin'` | Confirmed |
| Same-origin `/api`, no CORS | `PRODUCTION_PLAN.md:29`; `AUTH_API_PLAN.md:17` | `vite.config.js:36-43` proxy `/api → http://localhost:8000` | Confirmed |
| `authorize()` deny-by-default, server authoritative | `SCOPE_EXPANSION_PRIVILEGES.md` matrix; `AUTH_API_PLAN.md:16` | `server/auth/authorize.php:199-297` single shared `authorize()`; all 5 sectors call it (§2) | Confirmed |
| Token API for attendance/schools/siswa/SPP/trainers | Only implied (`SCOPE_EXPANSION_PLAN.md` Phase C C3; `PRODUCTION_PLAN.md:109`) | No token path; cookie CRUD exists per §2 | Partially specified → made explicit by `AUTH_API_PLAN.md:133`, still unbuilt |
| `SERVICE_TOKEN_PEPPER` env alongside `config.php` | `AUTH_API_PLAN.md:64,69` D-AA2/D-AA7 | `server/config.php:22-48`, `server/config.example.php:1-9`, `.env.example:4-8` have no such key | Gap — env contract not added (Gate AA.A) |
| Gates AA.A → AA.D | `AUTH_API_MILESTONES.md:10-22` | All `EDIT:` targets absent (`service-tokens.php`, `tokens.php`, `2026-*-service-tokens.sql`, `service-token.lifecycle.php`) | Gap — all gates open |
| JWT in browser forbidden | `PRODUCTION_PLAN.md:177`; `AUTH_API_PLAN.md:38,72` | Grep `Authorization\|Bearer` in `src/*.js` = 0 hits | Confirmed — respected |

---

## 2. What exists TODAY — per-sector inventory (all cookie-only)

> Global guard order today: `405 method → 401 auth (cookie session) → 403 CSRF → 422 body → 403 scope → 200/201`. There is **no Bearer branch** — a server-to-server client that sends `Authorization: Bearer` without cookies + `X-CSRF-Token` gets `401` (no session) or `403` (no CSRF) on every POST below.

| # | Sector (ID / EN) | Write endpoint | Read path | Auth guard today | Scope enforcement |
|---|---|---|---|---|---|
| 1 | Absensi / Attendance | `server/api/absensi.php:6` POST-only; `:11` `requireAuthenticatedUser()`; `:12` `requireCsrf()` (siswa attendance) + `server/api/absensiPengajar.php:12,16,17` same guard (trainer/asisten self-attendance) | `GET server/api/read.php?entity=absensi` or `entity=absensiPengajar` (`read.php:16-21` allow-list; `:13` auth-only, no CSRF on GET) | Cookie-only | `absensi.php:28,55,57,86,101` `verify/update/certify/write` via shared `authorize()`; `absensiPengajar.php:64,108` `correct/write` — trainer own + active assignment, `admin_cabang` own branch |
| 2 | Sekolah / School | `server/api/sekolah.php:6` POST-only (`action=create/update/delete` in body); `:8` auth; `:9` CSRF | `GET read.php?entity=sekolah` | Cookie-only | `sekolah.php:38,211,242-243` `delete/create/update` ×2 (old + new branch dual-check) |
| 3 | Siswa / Students | `server/api/siswa.php:6` auth; `:7` `POST/PUT`, `:42` `DELETE` (body `action=`, `DELETE` also reads `$_GET['id']`); CSRF inside `server/api/_master.php:41,168` (`masterWrite`/`masterDelete`) | `GET read.php?entity=siswa` | Cookie-only (CSRF indirect via `_master.php`) | `_master.php:75,81` dual `authorize('write')` (existing + incoming branch), `:182` `authorize('delete')` |
| 4 | Pembayaran SPP / SPP Payment | `server/api/sppPayments.php:5` POST-only; `:7` auth; `:8` CSRF; `:11` single-lane `requireAuthorization('write','sppPayments')` (+ read-side `GET server/api/spp-status.php?periode=` at `spp-status.php:29,31` auth-only) | `GET read.php?entity=sppPayments` | Cookie-only | Same `authorize()`; branch scope via `recordOwnsBranch()`; finance boundaries unchanged |
| 5 | Pembayaran Honor Trainer / Honor Trainer Payment | `server/api/honorPayments.php:5` POST-only (`action=append/create→append/correct`); `:7` auth; `:8` CSRF. Person master is `server/api/trainer.php:7` (auth; CSRF via `_master.php`). Related: `server/api/invoices.php:5,7,8`, `invoices-generate.php:6,8,9`, `invoices-doc.php:21,22` | `GET read.php?entity=honorPayments` (trainer: own-`trainerId` only; `invoices` excluded for trainer) | Cookie-only | `honorPayments.php:31,38` `write/honorPayments`; `invoices*.php` `create/update/delete/read` — see role box below |

**Role box — honor vs invoices differ (do not conflate):**

- `invoices` writes are effectively superadmin-only: `server/auth/authorize.php:230-232` denies `create/update/delete/write` on `invoices` (and `audit_log`) for `admin_cabang` before scope; trainer cannot even read (`roleCanReadEntity()` at `authorize.php:27` omits `invoices`; `invoices-doc.php:65-70` re-enforces "trainer never").
- `honorPayments` is **NOT** superadmin-only in code: `authorize.php:224-231` (AP.D.1 exception) lets `admin_cabang` `append/correct` **own-branch** honor (branch still enforced `authorize.php:240-242`); trainer may `read` own-`trainerId` honor (`authorize.php:192-194`, readable in `roleCanReadEntity`) but has **no write lane** (trainer block `authorize.php:246-293` only allows `absensi*` writes). Note: `honorPayments.php:26-31` comment still claims "effectively Superadmin-only" — stale relative to the AP.D.1 exception; trust `authorize.php`.
- Bulk read (no `?entity=`) returns all allowed + `[]` for denied (`read.php:187-190`); unknown `?entity=` → `400`, valid-but-forbidden → `403` (`read.php:27,32-34`).
- Legacy `server/api/sync.php:10,13,37` (POST, auth-only, no CSRF) accepts only `['absensi','absensiPengajar','sppPayments','honorPayments']` — `sekolah/siswa/invoices/trainer` are deliberately not syncable (`sync.php:32-36`); retained only, client no longer calls it (`sync.php:4-7`).

### 2a. End-to-end TODAY (cookie + CSRF via curl.exe)

```bat
REM 1. Login (skipCsrf on this call only) — saves session cookie to jar
curl.exe -c jar.txt -H "Content-Type: application/json" -d "{\"username\":\"<user>\",\"password\":\"<pass>\"}" http://127.0.0.1:8000/api/auth/login.php

REM 2. Fetch CSRF token (session-bound)
curl.exe -b jar.txt http://127.0.0.1:8000/api/auth/csrf.php

REM 3a. Read — GET needs cookie only, no CSRF (example: schools)
curl.exe -b jar.txt "http://127.0.0.1:8000/api/read.php?entity=sekolah"

REM 3b. Write — POST needs cookie + X-CSRF-Token (example: attendance; replace <csrf-token>)
curl.exe -b jar.txt -H "Content-Type: application/json" -H "X-CSRF-Token: <csrf-token>" -d "{\"action\":\"...\"}" http://127.0.0.1:8000/api/absensi.php

REM 4. Logout (CSRF-attached, best-effort)
curl.exe -b jar.txt -X POST -H "X-CSRF-Token: <csrf-token>" http://127.0.0.1:8000/api/auth/logout.php
```

Contract today: JSON `{data, error:{code,message}}`-ish via `jsonResponse()`; `401 "Autentikasi diperlukan"` (no session), `403 "Token keamanan tidak valid"` (CSRF mismatch), `403 "Akses tidak diizinkan"` (scope), `405` wrong method, `422` validation, generic `500`. Login throttle: 5 fails per `username|IP` → 15 min lock, generic `401` anti-enumeration (`server/auth/session.php:165-185`, `server/api/auth/login.php:11-28`).

---

## 3. What is PLANNED — Hybrid-Opaque server-to-server (Gates AA.A → AA.D)

> Everything in this section is `PLANNED` per `AUTH_API_PLAN.md` §4 (D-AA1–D-AA10, all Locked). No file below exists yet. Included so the other division can plan integration work and review the exact contract before implementation starts.

**Design lock (D-AA1–D-AA10 summary):** Browser stays cookie + CSRF unchanged. Machines use opaque Bearer `aft_<prefix8>_<secret43>` where `secret = base64url-nopad(random_bytes(32))`; DB stores `token_hash = SHA256(secret)` (+ HMAC pepper when `SERVICE_TOKEN_PEPPER` set), `prefix` plain for lookup + `last4` for display; header `Authorization: Bearer aft_...`; secret shown exactly once at mint. CSRF boundary: Bearer → skip CSRF; cookie → require CSRF; both present → require CSRF (fail-closed). Scope inheritance, no broadening: token binds `user_id + role + cabang_id (+ trainer_id)` at mint; every request calls the same `authorize()` (§2 scope table unchanged; `honorPayments`/`invoices`/restore stay superadmin-gated per role box). Expiry/revoke/audit: default TTL 90 d, max 365 d; `expires_at/revoked_at/last_used_at`; revoke immediate; `audit_log` rows `service_token_minted/revoked/denied` with no secret in metadata. Mint joins the same 5/15 min throttle; `401/429` generic Indonesian messages. Same-origin `/api/*` (no `/api/v1` fork); migration `server/migrations/2026-*-service-tokens.sql` + `schema.sql`; `deploy/` only via `npm run build:deploy`. No JWT in browser (static check).

**Planned schema + endpoints (from `AUTH_API_PLAN.md:91-120`):**

```text
PLANNED service_tokens { id PK srv-..., prefix UNIQUE 8 chars, token_hash UNIQUE SHA256(secret),
  last4, user_id FK->users.id, role ENUM(superadmin|admin_cabang|trainer),
  cabang_id NULL (required for admin_cabang/trainer), trainer_id NULL,
  name, expires_at, revoked_at NULL, last_used_at NULL, created_ip, created_at/updated_at }
INDEX idx_service_tokens_user (user_id), INDEX idx_service_tokens_expiry (expires_at)

PLANNED POST server/api/auth/tokens.php {action:'mint', name, ttl_days<=365, cabang_id?}
  auth: cookie+CSRF (browser) — reuses login throttle; returns {token (once), prefix, expires_at}
PLANNED GET  server/api/auth/me.php            // cookie OR Bearer (Bearer skips CSRF)
PLANNED DEL  server/api/auth/tokens.php {action:'revoke', prefix}
PLANNED POST server/api/absensi.php / absensiPengajar.php / sekolah.php / siswa.php /
  sppPayments.php / trainer.php     // existing handlers + Bearer guard, same authorize()
PLANNED GET  server/api/read.php?entity=...    // existing allow-list + Bearer guard
Guard order: 405 method → 401 auth (cookie or Bearer) → 403 CSRF (cookie path only)
  → 422 body → 403 scope → 201/200.
```

**Planned end-to-end (will work only after AA.B closes; do not run today):**

```bat
REM PLANNED — 1. Mint once via browser session (cookie+CSRF); secret visible ONCE
REM PLANNED curl.exe -b jar.txt -H "X-CSRF-Token: <csrf-token>" -d "{\"action\":\"mint\",\"name\":\"divisi-lain-prod\",\"ttl_days\":90}" http://127.0.0.1:8000/api/auth/tokens.php
REM PLANNED -> {token:"aft_<prefix8>_<secret43>", prefix:"...", expires_at:"..."}

REM PLANNED — 2. Use Bearer with zero CSRF traffic (example: write attendance)
REM PLANNED curl.exe -H "Authorization: Bearer aft_..." -H "Content-Type: application/json" -d "{\"action\":\"...\"}" http://127.0.0.1:8000/api/absensi.php

REM PLANNED — 3. Read via Bearer (example: students)
REM PLANNED curl.exe -H "Authorization: Bearer aft_..." "http://127.0.0.1:8000/api/read.php?entity=siswa"

REM PLANNED — 4. Revoke; next Bearer use -> 401
REM PLANNED curl.exe -b jar.txt -X DELETE -H "X-CSRF-Token: <csrf-token>" -d "{\"action\":\"revoke\",\"prefix\":\"...\"}" http://127.0.0.1:8000/api/auth/tokens.php
```

Planned falsifiable gate (`AUTH_API_PLAN.md:7`): `mint -> me via Bearer without CSRF = 200; revoke -> next Bearer use = 401; browser POST without CSRF still = 403`.

---

## 4. Feature inventory (complete / partial / deferred)

| State | Items |
|---|---|
| ✅ Complete (usable today) | Cookie-session login/logout/me/csrf/change-password; CRUD + `read.php` for all 5 sectors with shared `authorize()` scope; SPP `spp-status.php`; invoices generate/doc; `build:deploy` mirror parity |
| 🟡 Partial (specified, unbuilt) | Hybrid-Opaque Bearer across all 5 sectors (AA.C attendance first, AA.D schools/siswa/SPP/trainers gist); `service_tokens` migration + `schema.sql`; `service-tokens.php` guard; `tokens.php` mint/revoke + `me` Bearer; throttle extension to mint; `SERVICE_TOKEN_PEPPER` env contract — all owned by `AUTH_API_PLAN.md` / `AUTH_API_MILESTONES.md` Gates AA.A–AA.D |
| ⏸️ Deferred (explicit non-goals, not in this chain) | JWT/PASETO stateless, OAuth2 full server, SSO, browser refresh-rotation, mTLS, signed-header auth, per-branch `.htaccess`, email reset, realtime, soft-delete-trash — per `AUTH_API_PLAN.md` §8 + `PRODUCTION_PLAN.md:177-186` |

---

## 5. What the other division should do NOW

1. **Build against cookie + CSRF today (§2a)** if integration cannot wait — same `authorize()` scope will carry over to Bearer, so branch/role logic learned now transfers directly.
2. **Do not implement a local token/Bearer shim** — the locked shape (`aft_<prefix8>_<secret43>`, `token_hash`, `prefix` lookup, both-present-requires-CSRF) is specified in `AUTH_API_PLAN.md:64-66`; a divergent shim will conflict with Gate AA.A.2.
3. **To unblock server-to-server:** request Gates AA.A → AA.C (table + guard → mint/revoke + me → attendance via Bearer) in that order — later gates do not start until prior VERIFY passes (`AUTH_API_MILESTONES.md:4`). AA.D adds the remaining 4 sectors' gist.
4. **Security ground rules (carry over):** same-origin only; no secrets in git/logs/URLs/browser storage; token secret stored server-side as hash only, shown once; `honorPayments`/`invoices`/restore stay superadmin-gated — do not ask for role broadening as a shortcut (taste #33, R-AA1).

---

## 6. Risks + deferred with owners

| Item | Disposition | Owner |
|---|---|---|
| JWT/PASETO stateless, OAuth2 full, browser refresh-rotation | Deferred — revisit only with measured need | Platform/auth |
| mTLS, signed-header auth, per-branch `.htaccess` | Explicit non-goal per `PRODUCTION_PLAN.md:177` | Platform/auth |
| CSRF 403 drift on Login/first-POST (session path, proxy bypass, multi-tab regenerate) | New finding owned by `AUTH_API_PLAN.md` F-AA2; fix is owned session path + proxy discipline, not CSRF removal | Platform/auth |
| Trial billing rule (M5.4 gate) | Open business decision, out of this chain | Product/business approver |

---

## 7. Verification evidence (this audit)

```text
Verified: ls server/auth/ -> authorize.php, session.php (no service-tokens.php)
Verified: ls server/api/auth/ -> change-password.php, csrf.php, login.php, logout.php, me.php (no tokens.php)
Verified: grep Bearer|HTTP_AUTHORIZATION|service_tokens|SERVICE_TOKEN_PEPPER in server/*.php -> 0 hits (Bearer absent)
Verified: ls server/api/absensi.php,absensiPengajar.php,sekolah.php,siswa.php,sppPayments.php,honorPayments.php -> 6 files present (sectors exist)
Verified: grep requireAuthenticatedUser|requireCsrf|requireAuthorization in server/api/*.php -> 86 matches, all cookie+CSRF (see §2 table)
Verified: read src/lib/api.js:43-46,51 + server/auth/session.php:267-272 -> cookie+CSRF confirmed, no Authorization header
Verified: read docs/AUTH_API_PLAN.md:3 -> DRAFT 2026-09-23, no code executed yet (plan itself agrees)
Unverified: run php server/tests/schema.migration.php + php server/tests/authorize.policy.php (contract scripts, need PHP runtime; expected: no service_tokens, role-matrix only)
Remaining: Gates AA.A-AA.D implementation + per-gate VERIFY (mint->me 200, revoke->401, cookie-without-CSRF 403)
```

*End of API Integration Guide — cookie today (§2), Hybrid-Opaque planned (§3), gates AA.A–AA.D own the build.*
