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
| Hybrid-Opaque AA.A → AA.C | `AUTH_API_PLAN.md:3` `IN PROGRESS 2026-10-01` (commits `91ff74e..d468c93`) | `server/auth/service-tokens.php` guard + `server/api/auth/tokens.php` mint/revoke + `service_tokens` table live; AA.D still open | Implemented AA.A–AA.C, AA.D pending |
| Browser = cookie `afterschola_session` + `X-CSRF-Token` | `PRODUCTION_PLAN.md:59-66,111-113`; `AUTH_API_PLAN.md:12-14` | `server/auth/session.php:38-81` session setup; `session.php:267-272` `requireCsrf()` → 403 `"Token keamanan tidak valid"`; `src/lib/api.js:43-46` auto-injects `X-CSRF-Token`, `src/lib/api.js:51` `credentials:'same-origin'` | Confirmed |
| Same-origin `/api`, no CORS | `PRODUCTION_PLAN.md:29`; `AUTH_API_PLAN.md:17` | `vite.config.js:36-43` proxy `/api → http://localhost:8000` | Confirmed |
| `authorize()` deny-by-default, server authoritative | `SCOPE_EXPANSION_PRIVILEGES.md` matrix; `AUTH_API_PLAN.md:16` | `server/auth/authorize.php:199-297` single shared `authorize()`; all 5 sectors call it (§2) | Confirmed |
| Token API for attendance | Specified (`AUTH_API_PLAN.md:133`) + built AA.C.1 | `server/api/absensi.php:7-13`, `absensiPengajar.php:11-15` adopt `requireAuthUserOrBearer()`; scope asserts via live `authorize()` | Implemented for attendance; schools/siswa/SPP/trainers stay cookie-only until AA.D |
| `SERVICE_TOKEN_PEPPER` env | `AUTH_API_PLAN.md:64,69` D-AA2/D-AA7 (env-only, never in repo) | `server/auth/service-tokens.php:28-34` reads `getenv()` only; absent/empty = plain SHA256; no key in `config.php`/`config.example.php`/`.env.example` by design — set it in the real environment (or `.env`, gitignored) for HMAC mode | Implemented (env contract); ops must set it outside git |
| Gates AA.A → AA.C | `AUTH_API_MILESTONES.md` AA.A.1–AA.C.1 | All `EDIT:` targets present + function-level tests green (`schema.migration`, `authorize.policy` new rows, `service-token.lifecycle`, `throttle-csrf.matrix`, `attendance-bearer.scope`); HTTP/playwright rows manual | Implemented; Gate AA.D open |
| JWT in browser forbidden | `PRODUCTION_PLAN.md:177`; `AUTH_API_PLAN.md:38,72` | Grep `Authorization\|Bearer` in `src/*.js` = 0 hits | Confirmed — respected |

---

## 2. Per-sector inventory (attendance = cookie + Bearer; rest = cookie-only until AA.D)

> Global guard order on adopted endpoints: `405 method → 401 auth (cookie or Bearer) → 403 CSRF (cookie path only) → 422 body → 403 scope → 200/201`. Bearer-only skips CSRF; cookie requires `X-CSRF-Token`; both present requires CSRF (fail-closed). Every request still flows through the same `authorize()` — the guard supplies identity, never a bypass.

| # | Sector (ID / EN) | Write endpoint | Read path | Auth guard today | Scope enforcement |
|---|---|---|---|---|---|
| 1 | Absensi / Attendance | `server/api/absensi.php:7-13` POST-only, `requireAuthUserOrBearer()` (siswa attendance) + `server/api/absensiPengajar.php:11-15` same guard (trainer/asisten self-attendance) | `GET server/api/read.php?entity=absensi` or `entity=absensiPengajar` (`read.php:9-12` Bearer-first, no CSRF on GET) | Cookie + Bearer | `absensi.php:28,55,57,86,101` `verify/update/certify/write` via shared `authorize()`; `absensiPengajar.php:64,108` `correct/write` — trainer own + active assignment, `admin_cabang` own branch |
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

Contract: JSON `{data, error:{code,message}}`-ish via `jsonResponse()`; `401 "Autentikasi diperlukan"` (no session), `403 "Token keamanan tidak valid"` (CSRF mismatch), `403 "Akses tidak diizinkan"` (scope), `405` wrong method, `422` validation, generic `500`. Login throttle: 5 fails per `username|IP` → 15 min lock, generic `401` anti-enumeration (`server/auth/session.php:293-313`, `server/api/auth/login.php:11-28`).

---

## 3. Hybrid-Opaque server-to-server — LIVE for login/me/attendance (AA.D sectors: PLANNED)

> Gates AA.A → AA.C are implemented (commits `91ff74e..b574d67`). What is live: token table + guard + mint/revoke + `me` via Bearer + attendance (both files) + `read.php` via Bearer. What is still cookie-only: `sekolah.php`, `siswa.php`, `sppPayments.php`, `trainer.php` (Gate AA.D open) — Bearer against those 4 returns `401` (no session) until AA.D adopts the same two-line guard.

**Design lock (as built, D-AA1–D-AA10):** Browser stays cookie + CSRF unchanged. Machines use opaque Bearer `aft_<prefix8>_<secret43>` where `secret = base64url-nopad(random_bytes(32))` (`service-tokens.php:155-158`); DB stores `token_hash = SHA256(secret)`, or HMAC-SHA256 when `SERVICE_TOKEN_PEPPER` is set in the environment (`service-tokens.php:28-34`); `prefix` plain for lookup + `last4` for display; header `Authorization: Bearer aft_...`; secret shown exactly once at mint. CSRF boundary: Bearer-only → skip CSRF; any session/remember cookie present → require CSRF even with Bearer (fail-closed); anonymous → 401 first. Scope inheritance, no broadening: token binds `user_id + role + cabang_id (+ trainer_id)` at mint from the caller's session (never from the body); every request calls the same `authorize()` (§2 scope table unchanged). Expiry/revoke/audit: default TTL 90 d, max 365 d (`ttl_days` optional, missing → 90, invalid → 422 `"Masa berlaku tidak valid (1–365 hari)"`); `expires_at/revoked_at/last_used_at`; revoke immediate; `audit_log` rows `service_token_minted/revoked/denied` with only `prefix/name/expires_at/reason` (no secret). Mint joins the same 5/15 min throttle check-only (locked caller → 401 `"Nama pengguna atau kata sandi salah"`, never increments). Same-origin `/api/*` (no `/api/v1` fork); migration `server/migrations/2026-09-24-service-tokens.sql` + `schema.sql`; `deploy/` only via `npm run build:deploy`. No JWT in browser.

**Live schema + endpoints:**

```text
service_tokens { id PK srv-+16hex, prefix UNIQUE 8 chars, token_hash UNIQUE,
  last4, user_id, role ENUM(superadmin|admin_cabang|trainer),
  cabang_id NULL (required for admin_cabang/trainer), trainer_id NULL,
  name, expires_at, revoked_at NULL, last_used_at NULL, created_ip, created_at/updated_at }
INDEX idx_service_tokens_user (user_id), INDEX idx_service_tokens_expiry (expires_at)

POST server/api/auth/tokens.php {action:'mint', name, ttl_days? (default 90, 1–365), cabang_id? (narrow-only)}
  auth: cookie+CSRF (browser; Bearer cannot mint) — reuses login throttle check-only
  -> 201 {token (exactly once — save it now), prefix, expires_at}
  -> 401 locked/throttled (generic); 422 name/ttl/cabang invalid; 403 out-of-scope narrowing
POST server/api/auth/tokens.php {action:'revoke', prefix}
  auth: cookie+CSRF; owner or superadmin
  -> 200 {ok:true, prefix}; unknown prefix and non-owner share one 404 "Token tidak ditemukan" (no enumeration); malformed prefix -> 422 "Prefix token tidak valid"
GET  server/api/auth/me.php            // Bearer-first without CSRF, else cookie session (no CSRF on safe GET)
POST server/api/absensi.php / absensiPengajar.php   // Bearer or cookie+CSRF, same authorize()
GET  server/api/read.php?entity=...    // Bearer or cookie, existing allow-list
Guard order: 405 "Method tidak diizinkan" → 401 "Autentikasi diperlukan" → 403 CSRF "Token keamanan tidak valid"
  (cookie path only) → 422 body → 403 scope "Akses tidak diizinkan" → 201/200.
```

**End-to-end (runs today — mint once via browser session, then Bearer with zero CSRF):**

```bat
REM 0. Login + CSRF (browser session into a cookie jar; same as §2a steps 1–2)
curl.exe -c jar.txt -H "Content-Type: application/json" -d "{\"username\":\"<user>\",\"password\":\"<pass>\"}" http://127.0.0.1:8000/api/auth/login.php
REM <csrf-token> = value from: curl.exe -b jar.txt http://127.0.0.1:8000/api/auth/csrf.php

REM 1. Mint once (cookie+CSRF); secret visible ONCE — store aft_... in a vault, never in git/logs/URLs
curl.exe -b jar.txt -H "Content-Type: application/json" -H "X-CSRF-Token: <csrf-token>" -d "{\"action\":\"mint\",\"name\":\"divisi-lain-prod\",\"ttl_days\":90}" http://127.0.0.1:8000/api/auth/tokens.php
REM -> 201 {token:"aft_<prefix8>_<secret43>", prefix:"...", expires_at:"..."}

REM 2. Me via Bearer, no cookies, no CSRF
curl.exe -H "Authorization: Bearer <aft_...>" http://127.0.0.1:8000/api/auth/me.php
REM -> 200 {user:{id,username,displayName,role,cabangId,trainerId,...}}

REM 3. Write attendance via Bearer (example; same authorize() scope as cookie)
curl.exe -H "Authorization: Bearer <aft_...>" -H "Content-Type: application/json" -d "{\"action\":\"...\",\"id\":\"...\",\"cabangId\":\"...\"}" http://127.0.0.1:8000/api/absensi.php

REM 4. Read via Bearer (example: attendance; AA.D sectors still need cookie+CSRF)
curl.exe -H "Authorization: Bearer <aft_...>" "http://127.0.0.1:8000/api/read.php?entity=absensi"

REM 5. Revoke (cookie+CSRF, owner or superadmin); next Bearer use -> 401
curl.exe -b jar.txt -H "Content-Type: application/json" -H "X-CSRF-Token: <csrf-token>" -d "{\"action\":\"revoke\",\"prefix\":\"...\"}" http://127.0.0.1:8000/api/auth/tokens.php
REM -> 200 {ok:true, prefix:"..."}
```

**Ops notes:** set `SERVICE_TOKEN_PEPPER` in the real environment (or gitignored `.env`) to enable HMAC mode — rotating it invalidates previously minted tokens (fail-closed; re-mint after rotation). A transferred user (branch/role changed since mint) fails closed at first use — mint a fresh token. Token TTL is fixed at mint (max 365 d); there is no refresh — mint again before expiry.

Falsifiable gate (`AUTH_API_PLAN.md:7`, now live for attendance): `mint -> me via Bearer without CSRF = 200; revoke -> next Bearer use = 401; browser POST without CSRF still = 403`.

---

## 4. Feature inventory (complete / partial / deferred)

| State | Items |
|---|---|
| ✅ Complete (usable today) | Cookie-session login/logout/me/csrf/change-password; CRUD + `read.php` for all 5 sectors with shared `authorize()` scope; SPP `spp-status.php`; invoices generate/doc; `build:deploy` mirror parity; **Bearer: service_tokens table + guard + mint/revoke + `me` + attendance (both files) + `read.php`, throttle fix, CSRF 3-way matrix** |
| 🟡 Partial (AA.D open) | Bearer for schools/siswa/SPP/trainers (`sekolah.php`, `siswa.php`, `sppPayments.php`, `trainer.php` still cookie-only) — same two-line guard adoption as AA.C.1, owned by `AUTH_API_MILESTONES.md` Gate AA.D |
| ⏸️ Deferred (explicit non-goals, not in this chain) | JWT/PASETO stateless, OAuth2 full server, SSO, browser refresh-rotation, mTLS, signed-header auth, per-branch `.htaccess`, email reset, realtime, soft-delete-trash — per `AUTH_API_PLAN.md` §8 + `PRODUCTION_PLAN.md:177-186` |

---

## 5. What the other division should do NOW

1. **Use Bearer now for login/me/attendance (§3)** — mint one token per integration (name it, e.g. `"divisi-lain-prod"`), store the secret in a vault, scope follows the minting user's role/branch.
2. **For the 4 AA.D sectors, build against cookie + CSRF (§2a) for now** — same `authorize()` scope carries over to Bearer later, so branch/role logic learned now transfers directly.
3. **Do not implement a local token/Bearer shim** — the locked shape (`aft_<prefix8>_<secret43>`, `token_hash`, `prefix` lookup, both-present-requires-CSRF) is implemented in `server/auth/service-tokens.php:28-135`; a divergent shim will conflict with Gate AA.D.
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

## 7. Verification evidence (AA.A → AA.C implementation)

```text
Verified: ls server/auth/ -> authorize.php, session.php, service-tokens.php (guard live)
Verified: ls server/api/auth/ -> change-password.php, csrf.php, login.php, logout.php, me.php, tokens.php (mint/revoke live)
Verified: php server/tests/schema.migration.php -> EXIT 0 (idempotency + duplicate-username + unique(prefix, token_hash))
Verified: php server/tests/authorize.policy.php -> new Bearer rows pass; EXIT 255 only at pre-existing :194 trainerIds row (clean-tree failure, separate owner)
Verified: php server/tests/service-token.lifecycle.php -> EXIT 0 (mint -> me 200 no CSRF -> revoke -> 401; audits secret-free)
Verified: php server/tests/throttle-csrf.matrix.php -> EXIT 0 (5 fails -> 6th locked; CSRF 3-way matrix)
Verified: php server/tests/attendance-bearer.scope.php -> EXIT 0 (own-branch allow, cross-branch/assignment 403, Bearer-no-CSRF reaches scope)
Verified: npm test -> 47 files, 300 tests, all pass
Verified: npm run build:deploy -> Build OK: 53 PHP mirrored, 10 assets, .htaccess written
Unverified: run php server/tests/login.lifecycle.php (server-spawning; manual staging row)
Unverified: run php server/tests/endpoint.protection.php (server-spawning; manual staging row)
Unverified: run npx playwright test tests/e2e/auth-bearer.spec.ts (browser E2E; manual staging row)
Remaining: Gate AA.D (Bearer for sekolah/siswa/sppPayments/trainer); pre-existing authorize.policy :194; pepper-rotation live run
```

*End of API Integration Guide — Bearer live for login/me/attendance (§3); cookie-only for the 4 AA.D sectors (§2); Gate AA.D owns the rest.*
