# Playwright Suite Migration Milestones

Authoritative plan: `docs/PLAYWRIGHT_MIGRATION_PLAN.md`.
Authoritative source-of-truth: `docs/PRODUCTION_PLAN.md` +
`docs/PRODUCTION_MILESTONES.md` + `docs/PRODUCTION_GATE_CONFIRMATION_MILESTONES.md`
(per-microtask alignment 2026-09-02 audit).

Each microtask is strictly ordered. Do not start the next microtask until the
current `VERIFY` passes. A failing check becomes a bounded follow-up task; do
not patch unrelated files.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  RULES:   <R-codes/invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

## Gate PM.0 — Shared fixture helpers

### PM.0.1 Extract API seeding helpers into tests/fixtures.js

```text
MICROTASK: Extract API seeding helpers
  EDIT:    tests/fixtures.js (add helpers), tests/multi-account-crud-sync.spec.js (switch imports), nothing else
  RULES:   single source of truth; no new back doors; server authority; SIM-* prefix for test data
  DEPENDS: PM plan accepted by user
  OUTCOME: every spec that needs to seed or read entities through the API uses one helper set
  VERIFY:  npx playwright test tests/multi-account-crud-sync.spec.js exits 0; git diff shows only tests/ changes; no other consumer breaks
  DONE-IF: verify passes; only intended files changed
```

Helpers to extract from `multi-account-crud-sync.spec.js:43-115`:
`primeCsrf`, `loginAndPrime`, `logout`, `readEntity`, `createBranch`,
`deleteBranch`, `createSekolahSuperadmin`, `deleteSekolah`,
`createTrainerSuperadmin`, `createTrainerWithAccount`.

## Gate PM.1 — Group B (import + UI-seeded-fixture rewrite)

### PM.1.1 Rewrite r3-verify.spec.js

```text
MICROTASK: Rewrite r3
  EDIT:    tests/r3-verify.spec.js
  RULES:   replace loginAsAdmin with loginViaApi(page, 'superadmin') + page.goto(APP); replace localStorage afterschola_v4_{siswa,trainer} assertions with /api/read.php?entity=... re-reads; preserve the four R3.* assertions (WA normalization + attendance counts + SPP ledger)
  DEPENDS: PM.0.1
  OUTCOME: r3 spec exercises the WA normalization, attendance counts, and SPP-ledger increment shape against real auth + real backend
  VERIFY:  npx playwright test tests/r3-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only r3 changed
```

### PM.1.2 Rewrite r5-verify.spec.js

```text
MICROTASK: Rewrite r5
  EDIT:    tests/r5-verify.spec.js
  RULES:   same as PM.1.1; preserve the R5.* assertions
  DEPENDS: PM.1.1
  OUTCOME: r5 spec runs against real auth + real backend
  VERIFY:  npx playwright test tests/r5-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only r5 changed
```

### PM.1.3 Rewrite e2e.spec.js

```text
MICROTASK: Rewrite e2e
  EDIT:    tests/e2e.spec.js
  RULES:   same as PM.1.1; the 18 loginAsAdmin call sites all become loginViaApi(page, 'superadmin'); localStorage entity reads in the 17 IMPLEMENTATION_PLAN.md Part 7 rows migrate to /api/read.php
  DEPENDS: PM.1.2
  OUTCOME: e2e suite loads; every M-R7.2 row runs end-to-end
  VERIFY:  npx playwright test tests/e2e.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only e2e changed
```

## Gate PM.2 — Group A (full UI + fixture migration)

### PM.2.1 Migrate m51-verify.spec.js (smallest)

```text
MICROTASK: Migrate m51
  EDIT:    tests/m51-verify.spec.js
  RULES:   replace soft-login picker assertions with loginViaApi + /api/auth/me re-reads; delete the localStorage role assertion
  DEPENDS: PM.1.3
  OUTCOME: m51 spec asserts the post-M4.2 "dashboard reachable, role correct, refresh survives, pageerror empty" shape
  VERIFY:  npx playwright test tests/m51-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m51 changed
```

### PM.2.2 Migrate m512-verify.spec.js

```text
MICROTASK: Migrate m512
  EDIT:    tests/m512-verify.spec.js
  RULES:   replace role-switch via Ganti Peran with logout+loginViaApi sequence
  DEPENDS: PM.2.1
  OUTCOME: m512 spec exercises admin-vs-trainer scope switch through real sessions
  VERIFY:  npx playwright test tests/m512-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m512 changed
```

### PM.2.3 Migrate m513-verify.spec.js

```text
MICROTASK: Migrate m513
  EDIT:    tests/m513-verify.spec.js
  RULES:   seed two schools/trainers/siswa/sessions via API helpers (PM.0.1); read scoped data via /api/read.php
  DEPENDS: PM.2.2
  OUTCOME: m513 spec proves trainer sees only assigned-school data
  VERIFY:  npx playwright test tests/m513-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m513 changed
```

### PM.2.4 Migrate m53-verify.spec.js

```text
MICROTASK: Migrate m53
  EDIT:    tests/m53-verify.spec.js
  RULES:   replace loginAdmin local helper with loginViaApi(page, 'adminCabang'); seed via API
  DEPENDS: PM.2.3
  OUTCOME: m53 spec asserts absensi CRUD through real admin_cabang session
  VERIFY:  npx playwright test tests/m53-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m53 changed
```

### PM.2.5 Migrate m54-verify.spec.js

```text
MICROTASK: Migrate m54
  EDIT:    tests/m54-verify.spec.js
  RULES:   same as PM.2.4; preserve SPP collection + honor payment flow
  DEPENDS: PM.2.4
  OUTCOME: m54 spec exercises SPP/honor roundtrip through real admin_cabang session
  VERIFY:  npx playwright test tests/m54-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m54 changed
```

### PM.2.6 Migrate m52-verify.spec.js

```text
MICROTASK: Migrate m52
  EDIT:    tests/m52-verify.spec.js
  RULES:   seed fixtures via API; assert absensi persists via /api/read.php?entity=absensi; preserve the M5.2.3b Simpan→confirm flow
  DEPENDS: PM.2.5
  OUTCOME: m52 spec covers absensi write with asisten + catatan
  VERIFY:  npx playwright test tests/m52-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m52 changed
```

### PM.2.7 Migrate m61-verify.spec.js

```text
MICROTASK: Migrate m61
  EDIT:    tests/m61-verify.spec.js
  RULES:   same helper-driven approach; preserve M6.1 scope
  DEPENDS: PM.2.6
  OUTCOME: m61 spec runs against the canonical app
  VERIFY:  npx playwright test tests/m61-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m61 changed
```

### PM.2.8 Migrate m62-verify.spec.js

```text
MICROTASK: Migrate m62
  EDIT:    tests/m62-verify.spec.js
  RULES:   same as PM.2.7
  DEPENDS: PM.2.7
  OUTCOME: m62 spec runs
  VERIFY:  npx playwright test tests/m62-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m62 changed
```

### PM.2.9 Migrate m63-verify.spec.js

```text
MICROTASK: Migrate m63
  EDIT:    tests/m63-verify.spec.js
  RULES:   same as PM.2.8
  DEPENDS: PM.2.8
  OUTCOME: m63 spec runs
  VERIFY:  npx playwright test tests/m63-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m63 changed
```

### PM.2.10 Migrate m71-verify.spec.js

```text
MICROTASK: Migrate m71
  EDIT:    tests/m71-verify.spec.js
  RULES:   same as PM.2.9; preserve the M7.1 verifier matrix
  DEPENDS: PM.2.9
  OUTCOME: m71 spec runs
  VERIFY:  npx playwright test tests/m71-verify.spec.js --workers=1 exits 0 with zero page errors
  DONE-IF: verify passes; only m71 changed
```

## Gate PM.3 — Full suite verification

### PM.3.1 Full Playwright suite green

```text
MICROTASK: Full suite green
  EDIT:    no source files; tests/* only
  RULES:   every prior spec green; zero page errors; no console.log/debugger introduced
  DEPENDS: PM.2.10
  OUTCOME: npx playwright test tests/ exits 0 with zero page errors across every spec
  VERIFY:  npx playwright test tests/ --workers=1 exits 0; git status shows only tests/ changes; grep -r 'console\.log\|debugger' tests/ has no new matches
  DONE-IF: verify passes; all 13 stale specs replaced
```

## Notes on what this milestone chain is NOT

- It does not modify any app source under `src/` or `server/`.
- It does not add a `loginAsAdmin` stub to `tests/fixtures.js`. The migration
  is honest: spec semantics change from localStorage to API-backed, not just
  the import line.
- It does not delete any spec; every old spec is migrated in place so the
  test-name-to-row mapping IMPLEMENTATION_PLAN.md Part 7 relies on stays
  intact. If a milestone proves a spec is no longer meaningful
  (e.g. it asserts a soft-login invariant the app no longer has), the
  bounded fix is to rewrite its assertions — not to delete the spec.

## Ownership and final acceptance

- Product integration owns `tests/` migration. Each microtask is one PR.
- Platform/auth owns `tests/fixtures.js` API helpers (PM.0.1).
- Test ownership covers spec loadability + green run + zero page errors.
- The migration chain is complete when PM.3.1's `npx playwright test tests/`
  exits 0 against the current canonical app and the per-microtask
  cross-cutting finding in PRODUCTION_GATE_CONFIRMATION_MILESTONES.md is
  marked resolved.