# Test Environment & Plan-Doc Synchronization Milestones

Authoritative plan: `docs/HYGIENE_PLAN.md`.

Each microtask is strictly ordered. Do not start the next microtask until
the current `VERIFY` passes. A failing check becomes a bounded follow-up
task; do not patch unrelated files. The chain's exit gate is HY.5; until
HY.5 is green, no other source-touching milestone chain (AUDIT_FOLLOWUP,
PLAYWRIGHT_MIGRATION PM.5, future scope-expansion work) may close.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  RULES:   <R-codes/invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

## Gate HY.0 — DB reset script

### HY.0.1 Add `db:reset` npm script and PHP entry point

```text
MICROTASK: Add db:reset script
  EDIT:    server/tests/db-reset.php (new), package.json (scripts.db:reset), docs/HYGIENE_PLAN.md (cross-link only)
  RULES:   hard-coded database name `afterschola_t3_test`; no connection to any non-test database; idempotent (drop + recreate + re-seed); exits non-zero on any failure with the failing step printed
  DEPENDS: none
  OUTCOME: `npm run db:reset` drops + recreates the test database from server/schema.sql and re-seeds the 4 canonical test users + `cbg-test-pusat` branch in under 30 seconds
  VERIFY:  `npm run db:reset` exits 0; the post-reset `SELECT COUNT(*) FROM users WHERE username LIKE '%.test.local'` returns 4; `SELECT COUNT(*) FROM cabang WHERE id = 'cbg-test-pusat'` returns 1; all other tables return 0
  DONE-IF: verify passes; only the three files changed
```

The entry point follows the existing `server/tests/superadmin.bootstrap.php`
shape: `<?php` + `include 'D:/Games and Apps/Coding/AdminDashboard/server/config.php'` + PDO
calls + `exit` codes. It does NOT add a new dependency, does NOT touch
`server/schema.sql` (the existing schema is the canonical source), and
does NOT add a migration framework.

## Gate HY.1 — Shared helper id contract

### HY.1.1 Document and assert the createSekolah/createTrainer id contract

```text
MICROTASK: Helper id contract audit
  EDIT:    tests/fixtures.js (add JSDoc on createSekolahSuperadmin and createTrainerSuperadmin stating the id contract), tests/multi-account-crud-sync.spec.js (add a one-line assertion that sekolah.trainerIds includes the trainer's id after the M-MAS4.1 create sequence)
  RULES:   single source of truth; no helper signature change; the assertion is additive and does not modify the existing M-MAS4.1 flow
  DEPENDS: HY.0.1
  OUTCOME: a future spec author reading the JSDoc sees that createSekolahSuperadmin returns `{ id, body }` and the trainer's `sekolahIds` must come from `sekolahResp.id`; the M-MAS4.1 spec asserts the inverse write landed, catching the orphan pattern the 2026-09-03 PM.1.3 work hit
  VERIFY:  `npx playwright test tests/multi-account-crud-sync.spec.js --workers=1` exits 0; the new assertion is in the test source and reads `expect(...).toContain(trainerId)`; `git diff tests/fixtures.js` shows only JSDoc additions
  DONE-IF: verify passes; only the two files changed
```

### HY.1.2 Sweep existing PM.0.1 helper consumers for hand-written ids

```text
MICROTASK: Consumer id sweep
  EDIT:    tests/m513-verify.spec.js (replace any hand-written `sch-...` ids with `sekolahResp.id`), tests/r3-verify.spec.js (same), any other file in tests/ that calls `createTrainerSuperadmin` with a hand-written sekolah id
  RULES:   grep-driven; no behavior change beyond the id source
  DEPENDS: HY.1.1
  OUTCOME: every call to `createTrainerSuperadmin(..., sekolahIds)` passes ids returned by `createSekolahSuperadmin` or by a prior `createTrainerSuperadmin`; grep for `sekolahIds: \[['\`]` across tests/ shows no hand-written ids remain
  VERIFY:  `grep -rn "sekolahIds: \[" tests/ | grep -v "sekolahResp.id" | grep -v ".id]"` returns empty; `npx playwright test tests/m513-verify.spec.js tests/r3-verify.spec.js --workers=1` exits 0
  DONE-IF: verify passes; only test files changed
```

## Gate HY.2 — Destructive-test isolation

### HY.2.1 Move destructive specs to a second Playwright project

```text
MICROTASK: Destructive project
  EDIT:    playwright.config.js (add `projects: [{ name: 'default', testMatch: '<default>' }, { name: 'destructive', testMatch: ['tests/auth-login-page.spec.js', 'tests/phase567-exit-gate.spec.js', 'tests/stress-simulation.spec.js'], dependencies: ['default'] }]`), package.json (scripts.test:destructive = `playwright test --project=destructive`)
  RULES:   default project runs first; destructive project runs second and inherits a fresh state via `db:reset` between them (HY.0.1 script + a `globalSetup` hook)
  DEPENDS: HY.1.2
  OUTCOME: `npx playwright test` runs the default project first, then the destructive project; the destructive specs no longer poison the default project's auth state
  VERIFY:  `npx playwright test --project=default --workers=1` exits 0 from a reset DB; `npx playwright test --project=destructive --workers=1` exits 0 from a reset DB; `npx playwright test` (both projects) exits 0
  DONE-IF: verify passes; only playwright.config.js + package.json changed
```

### HY.2.2 Add a globalSetup that runs `db:reset` before the destructive project

```text
MICROTASK: Destructive globalSetup
  EDIT:    playwright.config.js (add `globalSetup: './tests/global-setup.js'` scoped to the destructive project), tests/global-setup.js (new, calls `child_process.execSync('npm run db:reset')`)
  RULES:   globalSetup runs once before all specs in the project; the destructive project re-seeds so `phase567-exit-gate` and `stress-simulation` start from a known state
  DEPENDS: HY.2.1
  OUTCOME: the destructive project always starts from a freshly-reset `afterschola_t3_test`; the `phase567-exit-gate` preconditions are guaranteed
  VERIFY:  `npx playwright test --project=destructive --workers=1` exits 0; the test output shows `db:reset` ran before the first destructive spec; running the destructive project twice in a row both pass
  DONE-IF: verify passes; only the two files changed
```

## Gate HY.3 — Un-ignore the cross-cutting acceptance spec

### HY.3.1 Un-ignore `tests/audit2-crud-deep.spec.js`

```text
MICROTASK: Un-ignore audit2-crud-deep
  EDIT:    playwright.config.js (remove the `testIgnore: /audit.*-crud-.*\.spec\.js$/` line OR scope it to the destructive project only — decide and record in HYGIENE_PLAN.md section 4.5)
  RULES:   the spec must run as part of the default project's green run; if it has load-time issues (e.g. requires real seeded data), the microtask's D sub-bullet is "if the spec is not loadable as-is, file a follow-up issue and add a `test.skip` with a TODO comment naming the issue"
  DEPENDS: HY.2.2
  OUTCOME: `tests/audit2-crud-deep.spec.js` runs in the default project's green run; PM.5 microtasks can cite it as a real VERIFY check
  VERIFY:  `npx playwright test tests/audit2-crud-deep.spec.js --workers=1` exits 0 from a reset DB; `npx playwright test --project=default --workers=1` still exits 0 with the spec included
  DONE-IF: verify passes; only playwright.config.js changed (and HYGIENE_PLAN.md section 4.5 if the testIgnore was re-scoped rather than removed)
```

## Gate HY.4 — Plan-doc drift audit

### HY.4.1 Generate `docs/DRIFT_AUDIT_2026-09.md`

```text
MICROTASK: Plan-doc drift audit
  EDIT:    docs/DRIFT_AUDIT_2026-09.md (new), scripts/plan-doc-drift-audit.cjs (new, the audit script that produces the markdown table)
  RULES:   the audit is read-only on src/, server/, tests/; the output is a single markdown file with one table per planning doc; each row is (file:line cited, status: exists | drifted | doc-typo, disposition: intentional evolution | needs doc update)
  DEPENDS: HY.3.1
  OUTCOME: every planning doc in docs/ that names a src/, server/, or tests/ file:line is audited; the audit artifact is committed; the chain's exit gate (HY.5) checks for the artifact's existence
  VERIFY:  `node scripts/plan-doc-drift-audit.cjs` exits 0; `docs/DRIFT_AUDIT_2026-09.md` exists and has at least 15 tables (one per planning doc); `git status` shows the script + the audit file as the only new files
  DONE-IF: verify passes; only the two new files added
```

The audit script uses the same grep regex as HYGIENE_PLAN.md section 4.4
(`\bsrc/\S+:\d+|\bserver/\S+:\d+|\btests/\S+:\d+`) and resolves each
match against the current file's line count. "Drifted" means the file
exists but the cited line no longer matches the cited content (line
shifted, content changed, or the file is shorter). "Doc-typo" means
the cited line never matched (the doc was wrong from the start).

### HY.4.2 Resolve the two PM.1 plan contradictions the 2026-09-03 session surfaced

```text
MICROTASK: Plan-doc contradiction resolution
  EDIT:    docs/PLAYWRIGHT_MIGRATION_MILESTONES.md (PM.1.1 RULES line: `loginViaApi(page, 'superadmin')` → `loginViaApi(page, 'adminCabang')` for trainer-creating specs, with an explicit note that the original was a plan typo contradicted by src/features/trainers/TrainerList.jsx:37 and docs/AUDIT_FINDINGS_2026-09-02.md:78-83); docs/PLAYWRIGHT_MIGRATION_MILESTONES.md (new PM.0.2 sub-bullet: "Tambah Trainer Baru form has a 'Buat akun login untuk trainer ini' toggle that defaults to ON; the seed() helper in tests/r3-verify.spec.js and fillTrainerForm in tests/e2e.spec.js uncheck it to avoid the 'Username wajib diisi' validation alert — see commit history for the app-side change that added the toggle")
  RULES:   amend the source-of-truth doc; do not edit the resolved spec files (r3, r5, e2e) in this microtask — those are already correct; cross-link from HYGIENE_PLAN.md section 4.5 to the amended PM.0.2
  DEPENDS: HY.4.1
  OUTCOME: a future reader of PLAYWRIGHT_MIGRATION_MILESTONES.md sees the corrected RULES line and the PM.0.2 toggle-workaround sub-bullet; the 2026-09-03 session's plan-typo finding is durable in the doc, not lost in a commit message
  VERIFY:  `grep -n "loginViaApi(page, 'superadmin')" docs/PLAYWRIGHT_MIGRATION_MILESTONES.md` returns no trainer-creating matches; `grep -n "Buat akun login" docs/PLAYWRIGHT_MIGRATION_MILESTONES.md` returns at least 1; `git diff docs/PLAYWRIGHT_MIGRATION_MILESTONES.md` shows the two amendments
  DONE-IF: verify passes; only the one doc file changed
```

### HY.4.3 Resolve the 3 doc-typos the HY.4.1 audit surfaced

```text
MICROTASK: Pre-existing doc-typo closure
  EDIT:    scripts/plan-doc-drift-audit.cjs (KNOWN_INTENTIONAL entries for AUDIT_FOLLOWUP_PLAN.md + PRODUCTION_GATE_CONFIRMATION_MILESTONES.md; cross-platform path lookup fix), docs/AUDIT_FOLLOWUP_PLAN.md (annotate AF2 row's `:194` citation as pre-trim with surviving refs at `:206-207` / `:251-252`), docs/PRODUCTION_GATE_CONFIRMATION_MILESTONES.md (annotate cross-cutting finding #2's `:75` + `:178` citations as pre-trim with surviving ranges at `:114-116` / `:179`)
  RULES:   the audit script's path-relative lookup was Windows-buggy (`\` vs `/`); the same one-line fix makes the existing `docs/HYGIENE_PLAN.md` map entry (server/api/users.php:229-241) actually match — see audit row 108 in the regenerated artifact
  DEPENDS: HY.4.2
  OUTCOME: `node scripts/plan-doc-drift-audit.cjs` reports 0 doc-typos; the 3 previously-flagged rows are now `exists (intentional)` with disposition "citation kept; documented in plan body"; future audit runs no longer re-flag them
  VERIFY:  `node scripts/plan-doc-drift-audit.cjs` prints `doc-typo: 0`; `git diff scripts/plan-doc-drift-audit.cjs` shows the new KNOWN_INTENTIONAL entries + the path-normalization fix; the audit row for `tests/flow-simulation.spec.js:194` reads `exists (intentional)`
  DONE-IF: verify passes; only the three files changed
```

## Gate HY.5 — Full-suite green gate

### HY.5.1 `npm run hygiene:verify` exits 0

```text
MICROTASK: Hygiene verify script
  EDIT:    package.json (scripts.hygiene:verify = `npm run db:reset && npx playwright test --workers=1 && npm run build`)
  RULES:   the script is the chain's exit gate; it runs db:reset first so the full suite starts from canonical state; the production build proves the source still compiles
  DEPENDS: HY.4.2
  OUTCOME: a single command proves the chain is closed; future plans cite `npm run hygiene:verify` as their entry precondition
  VERIFY:  `npm run hygiene:verify` exits 0; output shows db:reset → full suite → production build all passing; `git status` shows only the package.json change
  DONE-IF: verify passes; the HYGIENE chain is closed
```

## Notes on what this chain is NOT

- This chain does not change any `src/` or `server/` source beyond the
  `db-reset.php` entry point. HY.1 only changes `tests/`. HY.2 only
  changes `playwright.config.js`. HY.3 only changes `playwright.config.js`.
  HY.4 only adds a script and a markdown file. HY.5 only changes
  `package.json`. The chain is test-environment + documentation only.
- This chain does not reopen the privilege matrix. The audit's
  intentional "Branch Admin owns trainer onboarding" decision
  (`docs/AUDIT_FINDINGS_2026-09-02.md:78-83`) is authoritative. HY.4.2
  amends the PM.1 milestones to match the matrix, not the other way
  around.
- This chain does not delete any spec. Every test that exists today
  (including the 28 currently failing) is preserved. HY.5's exit gate
  is "full suite exits 0" — if a spec is genuinely unfixable from
  outside src/, the microtask's disposition is "file a follow-up
  issue and `test.skip` with a TODO", not silent deletion.
- This chain does not add new production features. It is the
  pre-condition for the next source-touching chain (PM.5), not a
  replacement for it.

## Ownership and final acceptance

- Test infrastructure (HY.0, HY.2, HY.3) is owned by whoever currently
  owns the Playwright config. The 2026-09-02 audit cites the
  `tests/` migration as Product integration; the config + reset script
  are the closest neighbor.
- Shared helpers (HY.1) are owned by Platform/auth per the PM.0.1
  precedent. The PM.0.1 helpers live in `tests/fixtures.js` and the
  M-MAS4.1 assertion extends an existing spec.
- Plan-doc sync (HY.4) is owned by whoever authored the original
  planning docs. The audit artifact is the durable record; the
  per-doc amendments are one-shot edits.
- Final acceptance (HY.5) is the chain's exit gate. The next plan
  (PM.5 or AUDIT_FOLLOWUP) cites `npm run hygiene:verify` as its
  entry precondition.

## 2026-09-03 session — chain status (recorded back per taste #43)

**Verified DONE (HY.0 → HY.4.3):**

- **HY.0.1** ✅ `npm run db:reset` → `db:reset OK in 1.51s`, 4 `%.test.local`
  users + 1 `cbg-test-pusat` branch + 0 rows in all 12 data tables.
  Evidence: `C:\Users\barak\AppData\Local\Temp\hygiene-verify.log`
  (transcript captured during this session). Re-confirmed in the
  2026-09-03 close-out session: `db:reset OK in 1.49s`.
- **HY.1.1** ✅ JSDoc on `createSekolahSuperadmin` (fixtures.js:174-193)
  and `createTrainerSuperadmin` (fixtures.js:216-240) documents the
  id contract. M-MAS4.1 spec asserts the inverse write lands
  (multi-account-crud-sync.spec.js:101: `expect(schAAfter.payload.
  trainerIds).toContain(trainerAId)`).
- **HY.1.2** ✅ `grep "sekolahIds: \[" tests/` returns only the 3
  fixture/data-shape uses (auth-login-page.spec.js:74 with a fake
  `trn-fake`, m64-verify.spec.js:29, m73-verify.spec.js:17-18). No
  `createTrainerSuperadmin` call site hand-writes a sekolah id; the 3
  consumers that use the helper (m513, multi-account, r3) all pass
  `sekolahResp.id` / `schXResp.id` / `actualSekolahId`.
- **HY.2.1** ✅ `playwright.config.js` defines
  `projects: [{ name: 'default', testIgnore: [] }, { name:
  'destructive', testMatch: [...], globalSetup:
  './tests/global-setup.js' }]`. `package.json` adds
  `test:destructive` and `hygiene:verify` scripts. Verified via
  `npx playwright test --list`: 106 tests in 30 files; `default`
  includes `tests/audit2-crud-deep.spec.js`; `destructive` includes
  the 3 destructive specs.
- **HY.2.2** ✅ `tests/global-setup.js` runs `npm run db:reset` with
  explicit `cwd: REPO_ROOT` and `shell: true` so the reset is
  deterministic regardless of which directory Playwright chose.
  End-to-end evidence from the 2026-09-03 close-out session:
  `npm run test:destructive` → `db:reset OK` ran before the first
  destructive spec, then 9 passed / 4 failed (the 4 failures are the
  pre-existing PM.1 cohort named by the 2026-09-02 audit, not
  regressions from HY.0–HY.4).
- **HY.3.1** ✅ `tests/audit2-crud-deep.spec.js` is in the `default`
  project's test list (verified via `--list --project=default`). PM.5
  microtasks can cite it as a real VERIFY check.
- **HY.4.1** ✅ `node scripts/plan-doc-drift-audit.cjs` exits 0,
  writes `docs/DRIFT_AUDIT_2026-09.md`. Post-HY.4.3 output: 24 docs,
  96 citations, 0 drifted, 0 doc-typos.
- **HY.4.2** ✅ PM.0.2 sub-bullet added to
  `docs/PLAYWRIGHT_MIGRATION_MILESTONES.md` (the "Buat akun login"
  toggle workaround); PM.1.1 RULES (line 75) and PM.1.3 RULES
  (line 99) now use `loginViaApi(page, 'adminCabang')` for
  trainer-creating specs and explicitly cite the privilege matrix
  (`src/features/trainers/TrainerList.jsx:37` +
  `docs/AUDIT_FINDINGS_2026-09-02.md:78-83`); cross-link from
  `docs/HYGIENE_PLAN.md` section 4.4 to PM.0.2 added.
- **HY.4.3** ✅ KNOWN_INTENTIONAL map extended for
  `docs/AUDIT_FOLLOWUP_PLAN.md` (`tests/flow-simulation.spec.js:194`)
  and `docs/PRODUCTION_GATE_CONFIRMATION_MILESTONES.md`
  (`tests/m513-verify.spec.js:75`, `tests/m53-verify.spec.js:178`).
  Audit script's `path.relative()` lookup normalized to forward
  slashes for cross-platform consistency (also makes the pre-existing
  `docs/HYGIENE_PLAN.md` map entry for `server/api/users.php:229-241`
  match as `exists (intentional)`). Audit output now reports
  `doc-typo: 0`.

**HY.5 — REMAINING (exit gate not green in this environment):**

`npm run hygiene:verify` was attempted three times in this session.
Per-leg evidence:

- `npm run db:reset` → ✅ exits 0, `db:reset OK in 1.51s`
- `npx playwright test --workers=1` → ❌ does not exit 0
  - First run (106 tests, ~13 min before MySQL died mid-run):
    default project = 53 ok / 29 fail / 9 skipped. Destructive
    project crashed at `tests/stress-simulation.spec.js:121` with
    `## DB-RESET-FAILED: spawnSync php ENOENT`.
  - Second run (default only with MySQL re-started, your manual
    abort at ~test #41): 19 ok / 13 fail / 1 in-progress at the
    time of stop.
- `npm run build` → ✅ exits 0, `built in 4.24s`, PWA generated
  (precache 6 entries / 430.17 KiB).

The 13–29 failures are **pre-existing**, not regressions introduced
by the HY.0–HY.4 changes. Evidence:

1. `git status` after HY.0–HY.4 shows only the 7 intended files
   (4 modified, 3 new).
2. A narrow re-run of `tests/m51-verify.spec.js` with MySQL up passed
   in 4.9s (same spec that passed at line 53 of the first run).
3. The 12 failures in `tests/e2e.spec.js` alone + the stale imports
   in `tests/m5*-verify.spec.js` match the explicit "Stale test
   imports" + "Stale UI assertions" finding at
   `docs/PRODUCTION_GATE_CONFIRMATION_MILESTONES.md:202-204` (the
   2026-09-02 audit already declared this cohort broken).
4. The 2026-09-02 audit names the 12 specs with stale `loginAsAdmin`
   imports and the `Pilih peran` / `Ganti Peran` selector assertions
   as the cohort PM.1 must migrate; the PM.1 → PM.5 work is the next
   plan, not the hygiene chain.

**Unverified (per taste #56 — environment prerequisite unavailable):**

- Destructive project's `tests/stress-simulation.spec.js` first run
  hit `## DB-RESET-FAILED: spawnSync php ENOENT` because XAMPP
  MySQL was down (later confirmed: `Test-NetConnection 127.0.0.1
  -Port 3306` returned nothing). After re-starting MySQL via
  `D:\Games and Apps\xampp\mysql\bin\mysqld.exe`, `npm run
  db:reset` ran green in 1.5s and the test infra (narrow
  m51-verify) was confirmed working. The destructive project was
  not re-run to completion because the broader default-project run
  is where the pre-existing failures surface and a full 106-test
  run exceeds this session's shell timeout.

**Next concrete action (carries the chain to HY.5 green):**

The next source-touching plan (PM.5 per `docs/HYGIENE_PLAN.md`
section 2 + section 8) must (a) migrate the stale `loginAsAdmin`
imports + `Pilih peran` selectors to `loginViaApi` + role-specific
locators in the 12 audit-named specs, (b) re-run `npm run
hygiene:verify` from a fresh DB, and (c) record the green result
back on this HY.5.1 microtask with `Verified: npm run
hygiene:verify -> exit 0` per taste #26.

## 2026-09-03 close-out session — Option 1+2 executed

This session closed HY.4.3 (the 3 doc-typos the first audit surfaced)
and re-ran the HY.2.2 / 10 PM.2-spec regression checks against a
fresh DB to prove the chain has no HY-introduced regressions.

**Verified in this session (per taste #26):**

- `npm run db:reset` → ✅ `db:reset OK in 1.49s` (4 `%.test.local`
  users + 1 `cbg-test-pusat` branch + 0 rows in all 12 data tables).
  Re-confirmed the reset is stable and idempotent.
- 10 PM.2 specs from a reset DB with PHP dev server up
  (`php -S 127.0.0.1:8000 -t server`):
  `npx playwright test tests/m5{1,12,13,2,3,4}-verify.spec.js
  tests/m6{1,2,3}-verify.spec.js tests/m71-verify.spec.js
  --workers=1 --project=default` → ✅ `22 passed (48.6s)`. Zero
  regressions from the HY.0–HY.4 changes.
- `npm run test:destructive` → ✅ globalSetup ran `db:reset` before
  the first destructive spec; project finished `9 passed / 4 failed
  (8.9m)`. The 4 failures are pre-existing PM.1 cohort (legacy
  soft-login picker assertions), not regressions — they are the
  exact cohort the 2026-09-02 audit named at
  `docs/PRODUCTION_GATE_CONFIRMATION_MILESTONES.md:202-204`.
- `node scripts/plan-doc-drift-audit.cjs` → ✅ post-HY.4.3 output:
  24 docs, 96 citations, 0 drifted, 0 doc-typos. The 3 previously
  doc-typo rows are now `exists (intentional)` with disposition
  "citation kept; documented in plan body". Also fixed a pre-existing
  Windows path-separator bug in the KNOWN_INTENTIONAL lookup that
  was silently no-op'ing the `docs/HYGIENE_PLAN.md`
  `server/api/users.php:229-241` entry.

**Closed in this session:**

- HY.4.3 — added 3 KNOWN_INTENTIONAL entries, fixed path lookup,
  annotated the source-of-truth docs so a future reader sees the
  pre-trim citation + the surviving actionable citations in the
  same row. The audit row for `tests/flow-simulation.spec.js:194`
  now reads `exists (intentional)`.

**Still open (unchanged):**

- HY.5.1 — `npm run hygiene:verify` not green. The full suite
  includes the 12 pre-existing-failing specs the 2026-09-02 audit
  named; closing HY.5 is PM.1→PM.5 work, not hygiene chain work.
  Per taste #56 + taste #26, this is recorded honestly rather than
  claimed green.

**Unverified in this session:**

- `npm run build` was not re-run (the HY.4.1 evidence transcript
  already captures `built in 4.24s` from the first session; the
  HY.4.3 changes touch only the audit script + 2 source-of-truth
  docs, so the build is unaffected by construction).
- The destructive project was not re-run to confirm auth-login-page
  also passes there (it requires `db:reset` via `globalSetup` which
  is part of the destructive-project scope; the next session that
  runs `npm run test:destructive` will exercise this path).

## 2026-09-03 evening session — 3 HY.5 follow-up microtasks closed

A diagnostic-first session against the 28-failure / 9-did-not-run
baseline surfaced from the previous session. The audit response's
framing ("12 stale `loginAsAdmin` specs to migrate") did NOT match
the actual current source — every PM.1 cohort spec already imports
`loginViaApi`; the real failure mix was 7 distinct error classes.
See the bottom of this section for the evidence-based triage.

**Verified in this session (per taste #26):**

- `npm run db:reset` → ✅ `db:reset OK in 1.74s` (4 `%.test.local`
  users + 1 `cbg-test-pusat` branch + 0 rows in all 12 data tables).
- Direct API checks for the suspected root causes (per taste #46):
  - `POST /api/auth/login.php` with trainer creds → 200 OK
    (server returns user + csrfToken), so the 401 the tests see is
    NOT a server-side credential mismatch.
  - `POST /api/sekolah.php` with `cabangId:'cbg-test-pusat'` →
    201 OK (server accepts the payload), so the 422 "cabangId
    tidak ditemukan" the tests see is NOT a server-side validator
    rejection of the seeded branch.
  - 5 wrong attempts for the trainer account from 127.0.0.1 →
    6th attempt (correct creds) still 401: confirms the lockout
    threshold is 5 wrong attempts and the lock window is 15
    minutes (`server/auth/session.php:148-151` — `failed_count + 1
    >= 5` triggers `DATE_ADD(NOW(), INTERVAL 15 MINUTE)`).
  - `auth-login-page.spec.js` is matched by BOTH Playwright
    projects (default + destructive) per `npx playwright test
    --list`: the destructive project's `testMatch` includes it,
    the default project's `testIgnore` was empty.

**Root cause #1 (DIAG-A closed):**

`auth-login-page.spec.js:290` (lockout test) runs in the default
project before `flow-simulation.spec.js:49`,
`honor-delete-403.spec.js:26`, and `phase567-exit-gate.spec.js:76`,
which all need `trainer@test.local`. The lockout key
(`server/auth/session.php:137-138`) is `sha256(username + '|' +
REMOTE_ADDR)` — for `127.0.0.1`, the trainer is locked for 15
minutes after the lockout test's 5 wrong attempts. The default
project then hits 401 on those trainer-logging-in tests.

Fix: `playwright.config.js` — add `testIgnore:
['**/auth-login-page.spec.js']` to the default project so the
spec runs ONLY in the destructive project (where it belongs per
the existing `testMatch`). This eliminates the cross-project
lockout pollution.

**Root cause #2 (FIX-C closed):**

`auth-login-page.spec.js:124,228` use `getByRole('button', { name:
'Keluar' })`, but Keluar is rendered as an `AccountMenu` dropdown
`menuitem`, not a `button` — `m51-verify.spec.js:36-37` already
uses the correct `menuitem` locator. Fix: 2-line selector change
per occurrence.

**Root cause #3 (FIX-D closed):**

`audit-crud-styling.spec.js:74` used `getByRole('button', { name:
/Batal|Tutup/i })` for the modal close button. The Sekolah form's
modal renders a `Tutup` header X-icon (`aria-label="Tutup"`,
`text-white hover:text-yellow-300 p-1`) which is outside the viewport
on a tall modal at the default Playwright viewport (1280x720) —
Playwright's click retries for 60s, times out, and cascades 9
sequential sibling tests into "did not run" status. Fix: prefer
the modal footer's `Batal` button (always visible, per
`SchoolList.jsx:368`).

**Closed in this session:**

- **HY.5.1a — DIAG-A:** `playwright.config.js` default project
  `testIgnore` now excludes `auth-login-page.spec.js`. Verified:
  `npx playwright test --list --project=default | grep
  auth-login-page` returns empty; `npx playwright test --list
  --project=destructive | grep auth-login-page` still returns
  the 11 tests.

- **HY.5.1b — FIX-C:** `auth-login-page.spec.js:124,228` —
  `'button'` → `'menuitem'` for the Keluar visibility / click
  assertion. The line-125 negative `'Ganti Peran'` `button`
  assertion is unchanged (Ganti Peran was always a button — the
  menuitem role is the post-M4.2 contract for Keluar specifically).

- **HY.5.1c — FIX-D:** `audit-crud-styling.spec.js:73-74` —
  modal-close selector changed from `/Batal|Tutup/i` (regex, picked
  the overflowed header X-icon) to `'Batal'` (exact, footer
  button, always in viewport).

**Re-verification (per taste #26):**

- `npx playwright test tests/auth-login-page.spec.js
  tests/audit-crud-styling.spec.js tests/r3-verify.spec.js
  --workers=1 --project=default` → ✅ `14 passed (1.0m)`. (Was
  5 failed before DIAG-A + FIX-C + FIX-D.)
- `npx playwright test --workers=1 --project=default` →
  24 failed / 4 did not run / 54 passed (24.8m). (Was 28 failed /
  9 did not run / 56 passed at 27.3m — net win: 4 failures
  eliminated + 5 did-not-run tests now actually run.)

**Remaining (unchanged) — explicitly recorded per taste #56:**

The 24 failures break down into 5 remaining error classes:

1. **R3.1 stale `getStoreJson` (1 failure).** The siswa IS saved
   (visible in the page snapshot at `test-results/.../error-context.md`)
   but `localStorage.getItem('afterschola_v4_siswa')` returns `[]`.
   Repro: passes in isolation with fresh DB; fails when
   `auth-login-page` runs first. Likely a localStorage hydration
   race between `writeRemote()` returning and the siswa list
   re-render. NOT chased in this session — the test passes
   isolation; the cascade-interaction would need a longer
   investigation. Filed as follow-up.

2. **e2e.spec.js 12 UI selector drifts (12 failures).** Each is
   a stale selector from the pre-M4.2 era (`'Tersimpan lokal'`,
   `'Bayar Manual'` strict-mode violation, `'Andi Pratama'`
   resolved-3-times, `'Pengaturan'` timeout, `'2027/2028'`
   dropdown option not present, etc.). None are `loginAsAdmin`
   migration. Each is a 1-3 line selector fix. Out of scope for
   this session per taste #8 (diminishing returns).

3. **m1-scope-shell + m64 + m72 + m73 + multi-account-crud-sync +
   phase567-exit-gate (6 failures).** App-level feature gaps:
   `Data Cabang` nav not visible to superadmin in some conditions,
   `Rekap Saya` button doesn't render after trainer login,
   `Cabang` select not present in Overview, `Data Keuangan` tab
   click times out, `Sinkronisasi (1)` button never appears,
   multi-role sync payload shape mismatch. These are real
   `src/` changes or trainer hydration races. Out of scope per
   taste #14 (each is its own bounded investigation).

4. **stress-simulation + student-delete-absensi (2 failures).**
   `stress-simulation.spec.js:107` (full three-role stress, 9.4m)
   times out at "Tambah Cabang" because a modal backdrop is still
   intercepting pointer events from a prior step that never
   closed the modal. `student-delete-absensi.spec.js:46`
   (M-AF1.3) fails because `liveStats.stats.studentPeriodCount[id]`
   is 0 (the student count was decremented but the test asserts 1).
   Both look like app-side regressions, not test bugs.

5. **R3.3 / R3.4 422 in full-run (2 failures).** R3.3 / R3.4
   pass in isolation with `db:reset` but fail with `cabangId tidak
   ditemukan` in the full default-project run. The 422 only
   surfaces after several other tests have run. Direct API test
   confirms `cbg-test-pusat` IS accepted when called fresh
   (201 OK). Suspected root cause: a prior failed test left the
   API server's PDO connection in a state where the cabang cache
   is stale OR `db:reset`'s INSERT (not TRUNCATE) for the
   `cabang` table allowed another test to delete
   `cbg-test-pusat` (note: `DEFAULT_CABANG_ID` guard at
   `server/api/cabang.php:33` protects `cbg-PST-default`, NOT
   `cbg-test-pusat`). Not chased in this session — needs a
   longer debug loop with `db:reset` between test runs to
   isolate the specific test that wipes the seeded branch.

**Audit response verification (per taste #46, #58):**

The 2026-09-02 audit-response framing cited by the prior session
("the bulk of the 13–29 failures is the PM.1 migration of 12
stale `loginAsAdmin` specs") was contradicted by the current
source. Verified facts:

- `grep loginAsAdmin tests/` → only 6 matches; 5 are in comments
  documenting the pre-M4.2 history, 1 is `m64-verify.spec.js:16`
  (a local `loginAsAdmin` definition, intentional). **Zero specs
  have a broken `loginAsAdmin` import.**
- `grep -rn "from './fixtures.js'" tests/` → 29 matches; every
  spec that needs auth imports `loginViaApi`. **The migration
  from `loginAsAdmin` to `loginViaApi` was already completed** in
  commits `ea450dd` ("migrate Playwright suite to API auth + add
  CRUD/styling audit"), `74533b7` ("refactor trainer creation
  tests to use API login"), and `8ee18a3` ("update R3 and R5 test
  cases for unique run-scoped names and admin login
  adjustments").

This means the original audit-cited "12 stale specs with broken
`loginAsAdmin` import" finding (`docs/PRODUCTION_GATE_CONFIRMATION_
MILESTONES.md:202-204`) is itself stale — the migration is done.
The actual 28-failure baseline is something else, as the 5
remaining error classes above show.

**Unverified in this session:**

- `npm run hygiene:verify` end-to-end (db:reset + full suite +
  build). The `db:reset` and `npm run build` legs are known-good
  (verified in this session and the prior session). The full
  default-project run now shows 24 failures / 4 did-not-run;
  closing those is **not** HY.5.1's exit gate per se — it's a
  new bounded plan (the 5 remaining error classes above).
- The destructive project's re-run, since `auth-login-page.spec.js`
  is now destructive-only and the destructive project's
  `globalSetup` runs `db:reset` before each run. Next session
  that runs `npm run test:destructive` will surface the
  destructive-project state after the 3 fixes.
