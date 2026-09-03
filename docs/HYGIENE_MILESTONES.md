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
