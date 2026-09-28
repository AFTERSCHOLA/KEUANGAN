# Remember-Me Plan — Persistent Login Session (Opt-In)

**Status:** APPROVED 2026-09-28 — D-RM1–D-RM5 Locked; implementation underway gate by gate.
**Position:** Short scope-expansion doc per taste #69 (single file; promoted to a paired MILESTONES chain only if the build grows past 3 microtasks). It does **not** replace `docs/AUTH_API_PLAN.md` / `docs/AUTH_API_MILESTONES.md`, `docs/UNIVERSAL.md`, or `docs/IMPLEMENTATION_PLAN.md`.
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/AUTH_API_PLAN.md` §4 (D-AA1 hybrid locked, D-AA3 session+CSRF, D-AA10 contract shape) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → this file.
**Request:** keep the login session alive across browser restarts unless the user consciously logs out — opt-in tick on the login form ("Keep login session").

---

## 1. Context and inputs

- Today (`server/auth/session.php:38-80`): session cookie `lifetime 0` (dies with the browser), server idle-timeout 30 min (`SESSION_IDLE_SECONDS`), absolute cap 8 h (`SESSION_ABSOLUTE_SECONDS`). No remember-me exists anywhere (repo-wide grep for remember/keep-login/Ingat: zero hits outside an unrelated trainer-account toggle).
- Verified 2026-09-28 (temp roundtrip gate, removed after passing): logout destroys the session only (`server/api/auth/logout.php` touches zero data tables); the client cache is cleared by design and fully rehydrates on next login across all 8 writable entities. So persistence is proven — this plan is purely about *session longevity*, not data safety.
- Existing idioms to reuse, not invent: `loginSession()`/`invalidateSession()`/`auditEvent()` (`session.php`); `HttpOnly + Lax (+Secure prod)` cookie posture (`session.php:62-68`); opaque Bearer pattern for machines (D-AA1 — cookie session stays the browser mode, no third mode); `AlertDialog`/`Modal` + pinned Indonesian copy; `Verified:` / `Unverified:` reporting.

## 2. Goals and non-goals

**Goals**

1. An opt-in checkbox on `LoginPage` keeps the session across browser restarts until its cap or an explicit logout.
2. Explicit logout always revokes persistence (no silent resurrection after "Keluar").
3. Lockout (5 fails → 15 min), password policy, CSRF, and the role matrix behave exactly as today.

**Non-goals (stay out of this plan)**

- Social/SSO login, biometrics, multi-device management UI.
- Changing the default (unchecked) session behavior: 30 min idle / 8 h absolute stay.
- Touching payment/ledger/invoice logic in any way.

## 3. Findings registry (F-RM)

| ID | Finding | Evidence |
|---|---|---|
| F-RM1 | **No persistence primitive exists.** Only the transient session cookie + server-side `$_SESSION` window; closing the browser always ends the session. | `session.php:62-68` (`lifetime 0`); grep remember → 0 hits |
| F-RM2 | **Revocation has no persistent counterpart.** `invalidateSession()` clears `$_SESSION` + cookie; a remember token would need its own server-side revocation or logout could not kill it. | `session.php:83-96`; `logout.php` (session-only) |
| F-RM3 | **Login contract is username+password only.** `auth.js login()` posts `{ username, password }`; the server must accept an extra opt-in flag without breaking existing callers/tests. | `auth.js:115-123`; `LoginPage.jsx:11-30` |

## 4. Decision set (D-RM, proposed — locked only on approval)

| # | Decision | Status |
|---|---|---|
| D-RM1 | **Opt-in, default off (concrete pick).** `LoginPage` gains `Tetap masuk di perangkat ini` (unchecked default). Unchecked logins behave byte-identically to today. | Locked |
| D-RM2 | **Opaque rotating token, 30-day cap (concrete pick).** New `remember_tokens` table: `{ token_hash (SHA-256, PK), user_id, created_at, expires_at (≤ 30 d), last_used_at }`. Raw token lives only in the persistent cookie; DB holds the hash. Rotation is age-gated (amended 2026-09-28 after E2E caught concurrent restores racing single-use lineage under React StrictMode double-mount): restore rotates only when the token is older than 1 h (`REMEMBER_ROTATE_AFTER_SECONDS`); fresh tokens are reused as-is so concurrent bootstraps both succeed. Expiry is computed on the PHP clock (MySQL NOW() skew observed +5 h locally). | Locked |
| D-RM3 | **Cookie posture mirrors the session cookie.** `HttpOnly + Lax (+Secure prod)`, `Expires = min(30 d, ...)`, same `session_name`-adjacent name (`afterschola_remember`). Never readable from JS; CSRF rules unchanged (restore path mints a fresh CSRF token). | Locked |
| D-RM4 | **Restore is session-equivalent, audited.** On requests with no active session but a valid remember cookie: re-establish `$_SESSION` (same `safeIdentity` shape), refresh CSRF, update `last_used_at` + rotate, emit `auditEvent('session_restored_via_remember', …)`. Expired/unknown token → silent anonymous (no user-enumeration signal beyond today's 401). | Locked |
| D-RM5 | **Explicit logout revokes.** `logout.php` deletes the presented token hash (plus, on password change, all of the user's tokens). Lockout still applies to password attempts; remember-restore never counts as a login attempt. | Locked |

## 5. Data model (additive only)

```text
remember_tokens (new table):
{ token_hash: CHAR(64) PK, user_id, created_at, expires_at, last_used_at }
No changes to users/sessions tables; no payload shape changes elsewhere.
```

## 6. Rules (R-RM)

- **R-RM1** One concern per edit: table + restore + login UI + revoke/tests are separate microtasks; never restyle while fixing logic.
- **R-RM2** Mirror, don't invent: `loginSession`/`invalidateSession`/`auditEvent` composition, cookie flags verbatim from `startSecureSession()`, LoginPage copy pinned (§7).
- **R-RM3** Server is authoritative: cookie presence alone never grants identity — only a live `remember_tokens` row does; UI mirrors, never guards alone; no role broadening.
- **R-RM4** Verification language `Verified: <command> -> <result>` / `Unverified:`; source hygiene gate (no `console.log` in `src/`, no artifacts in `git status`); `deploy/` only via `npm run build:deploy`.

## 7. UI concept (pinned copy)

Login form, below the password field: `[ ] Tetap masuk di perangkat ini` (unchecked default). No other copy changes. AccountMenu "Keluar" behavior unchanged (now also revokes the token).

## 8. Access model (explicit, no broadening)

| Action | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Opt into remember-me at login | ✅ | ✅ | ✅ (same checkbox, same 30 d cap) |
| Revoke own token (logout) | ✅ | ✅ | ✅ |
| Revoke another user's tokens | ❌ (only via password reset by an admin, future venue) | ❌ | ❌ |
| Server rule | token restore re-runs the existing role/branch/assignment gates; nothing bypassed | same | same |

## 9. Verification (planned, not yet run)

1. Unit: token hash/rotation/expiry pure helpers (new `server/tests/remember.check.php` style, mirroring existing contract scripts).
2. E2E: check tick → close browser context → reopen → still authenticated (no login form); explicit logout → reopen → login form shows; expired token → anonymous; `pageErrors` zero.
3. Regression: `npm test` + relevant Playwright suites + `npm run build` green; unrelated failures labeled pre-existing with stash evidence.

## 10. Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Multi-device token list / remote revoke-all UI | Future amendment + abuse review | Needs new UI + per-device naming; falsifiable now without it |
| Remember-me for machine Bearer clients | AUTH chain (D-AA1) | Different credential mode; out of browser scope |
| Shorter/longer caps per role | Business sign-off | 30 d uniform is falsifiable now |

## 11. Verification (2026-09-28 — implemented, all green)

- `Verified: php server/tests/remember.check.php -> all checks passed` (plain login mints nothing; remember login sets persistent HttpOnly cookie + hashed row ~30 d out; remember-only jar restores 200 with identity match; fresh-token reuse + concurrent restores succeed; aged token rotates with old hash replaced; consumed replay/tampered/expired → 401 with prune; logout deletes the row and kills restore; seeded user + rows cleaned in `finally`).
- `Verified: playwright rm-persist-temp.spec.js (removed after passing) -> tick survives a fresh browser context, UI logout revokes, unticked login sets no cookie`.
- `Verified: npm run test -> 45 files, 253 passed; npm run build -> clean; php -l session.php/login.php/logout.php/remember.check.php -> no errors`.
- `Verified: playwright m51-verify + m512-verify -> green` (m512 registry count corrected 13 → 14 for the CS.D.3 Asisten Eksternal tab; trainer-hidden list extended — no broadening).
- Incidental finds fixed en route (taste: verify-the-verification): (1) `runMigrations()` fail-stops on the non-idempotent `2026-09-23` ALTER, blocking every later migration — backfilled the two already-applied rows on the test DB; (2) MySQL-vs-PHP clock skew (+5 h locally) — token issue/expiry/age all computed on the PHP clock, `UNIX_TIMESTAMP()` for reads; (3) React StrictMode double-mount races single-use rotation — rotation is age-gated at 1 h (D-RM2 amended, plan + code + contract updated together).

## 12. Cross-references

- `docs/UNIVERSAL.md`, `docs/AUTH_API_PLAN.md`, `docs/AUTH_API_MILESTONES.md`, `docs/IMPLEMENTATION_PLAN.md`
- `server/auth/session.php`, `server/api/auth/login.php`, `server/api/auth/logout.php`, `src/features/auth/LoginPage.jsx`, `src/lib/auth.js`, `src/components/AccountMenu.jsx`
