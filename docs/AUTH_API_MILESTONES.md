# Auth API Milestones — Microtask Chain (AA.A → AA.D)

**Companion to `docs/AUTH_API_PLAN.md`.**
Login + attendance first (AA.A–AA.C runnable slice); full CRUD gist in AA.D so the next session has the gist. Each microtask must VERIFY before the next starts.

**Source of truth:** `AUTH_API_PLAN.md` §3 (F-AA1–F-AA8), §4 (D-AA1–D-AA10), §5 (R-AA1–R-AA8).

---

## Gate exit criteria

Rantai ditutup bila seluruh kriteria berikut terpenuhi:

1. `service_tokens` table exists via dated `server/migrations/` + `schema.sql`, idempotent with checksum.
2. Mint shows secret exactly once; otherwise only `prefix/last4`; revoke is immediate; `audit_log` records mint/revoke/denied without secrets.
3. `GET me` works via cookie+CSRF and via Bearer-without-CSRF; cookie POST without CSRF still 403.
4. Throttle 5 fails → 15min on login+mint with generic 401/429 Indonesian messages; no enumeration.
5. Attendance write via Bearer respects branch/assignment scope (cross-branch 403); browser flow unregressed.
6. Schools/siswa/SPP/trainers accept Bearer with identical scope (gist); `honorPayments`/`invoices`/restore stay superadmin-only.
7. `npm run build:deploy` parity HARD gate passes (no missing/extra files); `deploy/` never hand-edited.
8. Every microtask has VERIFY; completion write-back recorded on source docs.

---

# Gate AA.A — Token table + migration (reuse existing chain)

### AA.A.1 Add service_tokens migration + schema

```text
MICROTASK: Add service_tokens migration + schema

EDIT: server/migrations/2026-09-24-service-tokens.sql, server/schema.sql,
      server/tests/schema.migration.php

FINDS: F-AA5, F-AA8; D-AA5, D-AA7

RULES: R-AA1, R-AA6, R-AA7; idempotent, collision-safe, reference-preserving

DEPENDS: none

OUTCOME: service_tokens table with prefix/token_hash/user/role/branch/expiry/revoke
         indexes applies cleanly on fresh and existing DBs.

VERIFY: php server/tests/schema.migration.php
        -> service_tokens exists with UNIQUE(prefix, token_hash);
        -> rerun is idempotent (checksum recorded, no duplicate).

DONE-IF: verify passes; only intended files changed
```

### AA.A.2 Add service-token guard (deny-closed, no fork)

```text
MICROTASK: Add service-token guard (deny-closed, no fork)

EDIT: server/auth/service-tokens.php, server/auth/authorize.php,
      server/tests/authorize.policy.php

FINDS: F-AA3, F-AA8; D-AA1, D-AA2, D-AA3, D-AA4

RULES: R-AA1, R-AA2, R-AA4, R-AA5; hash_equals compare; both-present requires CSRF

DEPENDS: AA.A.1

OUTCOME: guard resolves Bearer (prefix lookup + hash compare + expiry/revoke/scope)
         or falls back to cookie+CSRF, injecting the same auth{user,role,cabang} shape.

VERIFY: php server/tests/authorize.policy.php
        -> valid Bearer resolves scope;
        -> revoked/expired Bearer 401;
        -> cookie POST without CSRF 403;
        -> Bearer POST without CSRF passes CSRF gate (scope still enforced).

DONE-IF: verify passes; only intended files changed
```

---

# Gate AA.B — Mint/revoke + login first slice

### AA.B.1 Mint + revoke + me via Bearer

```text
MICROTASK: Mint + revoke + me via Bearer

EDIT: server/api/auth/tokens.php, server/api/auth/me.php,
      server/tests/service-token.lifecycle.php

FINDS: F-AA4, F-AA6; D-AA2, D-AA5, D-AA6, D-AA10

RULES: R-AA3, R-AA4, R-AA5, R-AA6; secret once; generic 401/429 Indonesian codes

DEPENDS: AA.A.2

OUTCOME: cookie+CSRF caller mints once (secret visible once), me works via Bearer
         without CSRF, revoke makes next Bearer use 401 with audit rows.

VERIFY: php server/tests/service-token.lifecycle.php
        -> mint -> me 200 without CSRF;
        -> revoke -> Bearer 401;
        -> audit_log has minted/revoked/denied with no secret in metadata;
        -> cleanup DELETE FROM users WHERE username LIKE 'test_%' + token rows.

DONE-IF: verify passes; only intended files changed
```

### AA.B.2 Login throttle + CSRF-matrix regression

```text
MICROTASK: Login throttle + CSRF-matrix regression

EDIT: server/api/auth/login.php, server/auth/session.php,
      server/tests/login.lifecycle.php

FINDS: F-AA1, F-AA2, F-AA4; D-AA3, D-AA6

RULES: R-AA3, R-AA4, R-AA7; 5 fails -> 15min; generic messages; matrix cookie/Bearer

DEPENDS: AA.B.1

OUTCOME: login+mint share throttle without enumeration; browser matrix unchanged;
         session path/proxy discipline documented (owned php_sessions, same-origin /api).

VERIFY: php server/tests/login.lifecycle.php
        -> 5 wrong -> 6th (even correct) locked 401 generik;
        -> success clears lock; session id rotates;
        -> logout without/wrong CSRF 403; Bearer skips CSRF.
        + npm run build -> clean production build.

DONE-IF: verify passes; unrelated failures confirmed pre-existing before moving on
```

---

# Gate AA.C — Attendance via Bearer (first vertical)

### AA.C.1 Attendance write via Bearer with scope

```text
MICROTASK: Attendance write via Bearer with scope

EDIT: server/api/absensi.php, server/api/absensiPengajar.php, server/api/read.php,
      server/tests/endpoint.protection.php

FINDS: F-AA3, F-AA6; D-AA4, D-AA9

RULES: R-AA1, R-AA2, R-AA3; trainer own + active assignment; admin_cabang own branch

DEPENDS: AA.B.1

OUTCOME: trainer/admin_cabang write own-branch attendance via Bearer; cross-branch
         403; superadmin passes; browser cookie path unregressed.

VERIFY: php server/tests/endpoint.protection.php
        -> trainer A writing trainer B 403;
        -> out-of-assignment sekolah 403;
        -> outside assignment date range 403;
        -> admin_cabang B correcting branch-A 403;
        + npx playwright test tests/e2e/auth-bearer.spec.ts (cookie vs Bearer).

DONE-IF: verify passes; only intended files changed; original acceptance re-run
```

---

# Gate AA.D — Full CRUD gist (schools/siswa/SPP/trainers) for next session

### AA.D.1 Bearer gist across entities (no role broadening)

```text
MICROTASK: Bearer gist across entities (no role broadening)

EDIT: server/api/sekolah.php, server/api/siswa.php, server/api/sppPayments.php,
      server/api/trainer.php, server/api/read.php, server/api/sync.php,
      server/tests/api.integration.php

FINDS: F-AA3, F-AA6, F-AA7; D-AA4, D-AA8, D-AA9, D-AA10

RULES: R-AA1, R-AA2, R-AA3, R-AA5, R-AA8; honorPayments/invoices/restore stay
       superadmin-only; no localStorage tokens; one concern per edit

DEPENDS: AA.C.1

OUTCOME: schools/siswa/SPP/trainers accept Bearer with identical branch scope as
         cookie; finance/SPP boundaries unchanged; copy remains Indonesian.

VERIFY: php server/tests/api.integration.php
        -> Bearer CRUD 200/403 per cabang matrix;
        -> admin_cabang creating branch/setting/invoice still 403;
        -> trainer POST users still 403;
        + npm run build -> clean; + npm run build:deploy -> parity HARD gate passes.

DONE-IF: verify passes; deploy/ only via build script; write-back to
         PRODUCTION_PLAN.md §12 + SCOPE_EXPANSION_PLAN.md Phase C C3 recorded
```

---

## Deferred with owners (not in AA.A–AA.D scope)

| Item | Disposition | Owner |
|---|---|---|
| JWT/PASETO stateless, OAuth2 full, browser refresh-rotation | Deferred, needs measured revocation/stale-claim case | Platform/auth |
| mTLS, signed-header auth, per-branch `.htaccess` | Explicit non-goal per `PRODUCTION_PLAN.md:177` | Platform/auth |
| Realtime, email reset, trash, honor matrix w/o case | Deferred P1–P4 per `PRODUCTION_PLAN.md` | Respective owners |

*End of Auth API Milestones — Login + attendance first, full CRUD gist for next session.*
