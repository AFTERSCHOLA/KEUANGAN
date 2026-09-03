# Test Environment & Plan-Doc Synchronization Plan

This plan is the pre-condition for any further source-touching milestone chain
(AUDIT_FOLLOWUP, PLAYWRIGHT_MIGRATION PM.5, future scope-expansion work). The
PLAYWRIGHT_MIGRATION chain (PM.0 → PM.2) is structurally complete; the
remaining 28 failing tests in `npx playwright test tests/` and the
plan-doc/code drift in `docs/` are the next two layers of debt the migration
chain surfaced. This plan closes both before any more src/ changes land.

Authoritative foundation: `docs/UNIVERSAL.md` + `docs/PRODUCTION_PLAN.md` +
`docs/PRODUCTION_MILESTONES.md` + `docs/PRODUCTION_GATE_CONFIRMATION_MILESTONES.md`.
This document does not replace them; it adds a bounded hygiene chain
(`HYGIENE_PLAN.md` + `HYGIENE_MILESTONES.md`) that every future planning doc
cites as a precondition.

Cross-reference: `docs/HYGIENE_MILESTONES.md` HY.0.1 owns the
`server/tests/db-reset.php` entry point that this plan section 4.1
describes.

## 1. Why this plan exists (not a pure refactor)

The 2026-09-02 to 2026-09-03 PM.1 work surfaced five distinct, repeating
failure modes that all stem from the same root: the test environment and the
plan documents have drifted apart from the code, and there is no gate that
catches the drift. The modes:

1. **Fixture-vs-DB drift.** `tests/fixtures.js:29` documents
   `admin.cabang@test.local` as bound to `cbg-test-pusat`, but the `cabang`
   table had no such row. 20 sekolah under that branch were created before
   the server-side `cabangId` validation was added. PM.1.3 API seed calls
   returned 422 "cabangId tidak ditemukan" until the branch was inserted by
   hand. The T3 gate in `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md` was
   never closed.
2. **Shared-helper ID-mismatch.** `createSekolahSuperadmin` mints
   `sch-${cabangId.replace('cbg-','')}-${suffix}` but callers hand-write the
   id for `createTrainerSuperadmin`'s `sekolahIds` array. The server's
   inverse write (`server/api/users.php:229-241`) cannot link them, so the
   sekolah's `trainerIds` stays empty and the absensi form's trainer filter
   (`AttendanceForm.jsx:50`) sees no trainers. The fix was per-test
   workarounds, not a helper fix.
3. **Destructive-test ordering.** `auth-login-page.spec.js:290` exercises
   5-failed-attempt account lockout. The lockout persists across the rest
   of the run; later tests that log in as the same user get 423. There is
   no `test.describe.serial` or per-test unlock.
4. **Ignored cross-cutting acceptance.** `playwright.config.js:5` has
   `testIgnore: /audit.*-crud-.*\.spec\.js$/`. The PM.5 milestones'
   `VERIFY` line cites `tests/audit2-crud-deep.spec.js` as the
   post-PM.5 cross-cutting check. With the file ignored, the VERIFY is a
   no-op.
5. **Plan-doc / code drift.** `docs/AUDIT_FINDINGS_2026-09-02.md` documents
   the intentional privilege matrix
   ("Branch Admin owns trainer onboarding; superadmin only edits existing")
   at `src/features/trainers/TrainerList.jsx:36-37`, but
   `docs/PLAYWRIGHT_MIGRATION_MILESTONES.md` PM.1.1 RULES still reads
   `loginViaApi(page, 'superadmin')` for specs that create trainers. The
   plan contradicts the authoritative app behavior; the migration had to
   surface this contradiction to the user before resolving it.

Each of these is a class, not an instance. The five are listed in the
2026-09-03 session log (`docs/session-ses_023b.md` continuation) and are
cross-referenced from the corresponding `HYGIENE_MILESTONES.md` microtask.

## 2. Goal and observable outcome

After this plan closes:

- `npm run db:reset` brings `afterschola_t3_test` to a known canonical
  state (schema + 4 seeded users + `cbg-test-pusat` branch + zero data
  rows) in under 30 seconds.
- `npx playwright test tests/ --workers=1` exits 0 from a freshly-reset DB
  with zero page errors and zero `console.log`/`debugger` introduced in
  `tests/`.
- Every `tests/fixtures.js` shared helper has a documented consumer list
  and a verified id contract; new specs that use the helpers cannot
  produce the same id-mismatch orphan the PM.1.3 work hit.
- Destructive specs (`auth-login-page.spec.js:290` lockout,
  `phase567-exit-gate.spec.js`, `stress-simulation.spec.js`) are
  isolated from the rest of the suite so the green run is reproducible
  from a cold start.
- `tests/audit2-crud-deep.spec.js` is un-ignored and serves as the
  post-PM.5 cross-cutting acceptance check the milestones cite.
- Every planning doc that names a `file:line` reference has been
  re-verified against the current source; drift is recorded in
  `docs/DRIFT_AUDIT_2026-09.md` with a "intentional evolution" or
  "needs doc update" disposition per item.

## 3. Scope

**In scope:**

- `npm run db:reset` script + PHP entry point under `server/tests/`.
- `tests/fixtures.js` shared helpers: id contract audit + fix.
- `playwright.config.js` destructive-test isolation strategy.
- `tests/audit2-crud-deep.spec.js` un-ignore.
- One-shot plan-doc drift audit producing `docs/DRIFT_AUDIT_2026-09.md`.
- Resolution of the two PM.1 plan contradictions the 2026-09-03 session
  surfaced (PM.1.1 RULES superadmin→adminCabang for trainer-creating
  specs; PM.5.x.1 sub-bullet for the "Buat akun login" toggle).

**Explicitly out of scope:**

- Any `src/` source changes (PM.5 microtasks are the next plan, gated on
  this one's exit criteria).
- Any `server/` source changes beyond the `db:reset` entry point.
- The privilege matrix itself. `AUDIT_FINDINGS_2026-09-02.md:78-83`
  documents the matrix as intentional; this plan does not reopen it.
- New features, scope-expansion items, or business-rule changes.

## 4. Architectural decisions

### 4.1 DB reset strategy (Option A: full drop + re-seed)

`npm run db:reset` calls a single PHP entry point
(`server/tests/db-reset.php`) that:

1. Drops the `afterschola_t3_test` database.
2. Re-creates it from `server/schema.sql`.
3. Runs the existing `server/tests/superadmin.bootstrap.php` (or its
   equivalent) to seed the 4 canonical test users + the `cbg-test-pusat`
   branch.
4. Confirms the seed by issuing a `SELECT COUNT(*)` against each table
   and printing the result.

Option B (truncate + re-seed) is rejected because migration bookkeeping
(`migrations` table, `schema_migrations` table) is cleaner with a full
re-apply. Option C (snapshot + restore from a saved dump) is rejected
because the dump itself becomes the source of drift.

The entry point is a thin script, not a PHPUnit test, because Playwright
calls it via `npm run` and the rest of the test bootstrap already uses
direct PHP execution (`server/tests/superadmin.bootstrap.php`).

### 4.2 Destructive-test isolation (Option A: per-file worker)

The destructive specs are moved to a second Playwright project
(`playwright.config.js` `projects: [{ name: 'default' }, { name:
'destructive' }]`) that runs after the default project. The destructive
project re-logs in fresh; its only consumer is `auth-login-page.spec.js:290`,
`phase567-exit-gate.spec.js`, and `stress-simulation.spec.js`.

Option B (`test.describe.serial` within a single spec file) is rejected
because the destructive specs span 3 files. Option C (a `beforeAll` that
clears `login_attempts` + `users.locked_until`) is rejected because
`phase567-exit-gate` and `stress-simulation` do destructive things to
data, not just auth state, and a partial reset would leave stale data
that pollutes later reads.

### 4.3 Helper id contract (Option A: helpers return id; callers use it)

`createSekolahSuperadmin` already returns `{ id, body }`. The fix is
documentation + audit: every caller must pass `sekolahResp.id` (not a
hand-written id) into `createTrainerSuperadmin`. A new assertion in
`tests/multi-account-crud-sync.spec.js:52` (the M-MAS4.1 spec) verifies
the inverse write lands: after creating sekolah + trainer, the sekolah's
`payload.trainerIds` contains the trainer's id.

Option B (helpers auto-link by `cabangId + suffix`) is rejected because
it hides the explicit contract. Option C (a single `seedFixture` helper
that does sekolah + trainer + inverse write atomically) is deferred to
the next plan; it is the right long-term shape but expands the API
surface beyond what this plan needs.

### 4.4 Plan-doc drift audit (Option A: grep + per-doc table)

For each of the 15 planning docs in `docs/`, extract every `file:line`
reference (regex: `\bsrc/\S+:\d+|\bserver/\S+:\d+|\btests/\S+:\d+`) and
verify the line still exists in the current source. Record drift in
`docs/DRIFT_AUDIT_2026-09.md` with three columns: intentional evolution
(doc needs update to reflect new code), doc typo (doc was wrong, code
stayed right), or no drift (line still exists). No code changes flow
from the audit; the audit only records state.

Option B (full re-read of every doc) is rejected as unbounded. Option C
(grep only for the most-recently-touched docs) is rejected because the
drift is uniformly distributed (no signal in recency).

## 5. Sequencing

The chain has natural ordering from cheapest environmental fix to
expensive doc audit:

1. **HY.0** (DB reset script) — single small script; unblocks every
   later verification run.
2. **HY.1** (helper id contract audit + fix) — bounded, one helper +
   one new test assertion.
3. **HY.2** (destructive-test isolation) — bounded, `playwright.config.js`
   + 3 file moves.
4. **HY.3** (un-ignore audit2-crud-deep) — one-line config change + a
   smoke run to confirm the spec is loadable.
5. **HY.4** (plan-doc drift audit) — bounded, produces a single
   `DRIFT_AUDIT_2026-09.md` artifact.
6. **HY.5** (full-suite green gate) — the exit gate that combines all
   of the above; runs the full suite from a reset DB and asserts exit 0.

Per taste #74, downstream microtasks are renumbered contiguously and
`DEPENDS` references are kept consistent.

## 6. Verification

Per taste #20 + #17, after every microtask:

- `npx playwright test tests/<spec>` exits 0.
- `npx playwright test tests/ --workers=1` (full suite) exits 0 from a
  freshly-reset DB.
- `git status` shows only the files listed in the microtask's `EDIT`
  line as changed.
- No `console.log` / `debugger` introduced in `tests/`.
- `npm run build` still produces a clean production build.

The HY.5 gate is the chain's exit: it runs the full suite, the
production build, and the `DRIFT_AUDIT_2026-09.md` file existence check
in one verification pass.

## 7. Risks and open decisions

- **HY.2 destructive-test isolation may surface flake in
  `phase567-exit-gate`.** The spec relies on the exact shape of the
  pre-test DB. If the destructive project re-logs in fresh but does not
  re-seed, the spec's preconditions may be unmet. The microtask includes
  a `npm run db:reset && npx playwright test tests/phase567-exit-gate.spec.js`
  smoke before claiming success.
- **HY.4 plan-doc drift audit is a snapshot.** Code will keep drifting
  the day after the audit. The audit is a baseline; the next plan (PM.5)
  must re-run it as part of its own entry criteria. The `HYGIENE_PLAN.md`
  section 8 (Lifecycle) records this.
- **HY.1 helper id contract is a documentation + assertion change, not
  an API change.** The helpers' signatures stay the same. The risk is
  that an existing consumer's hand-written id happens to collide with
  the helper's minted id for a specific suffix, in which case the
  audit assertion fails. The fix is to update the consumer to use the
  returned id, not to change the helper.
- **HY.0 DB reset drops the `migrations` table.** If the canonical seed
  tracks migration state, dropping the table forces a re-apply. The
  microtask verifies that `superadmin.bootstrap.php` (or the chosen
  seeder) handles this correctly by checking `migrations` is
  repopulated.

## 8. Lifecycle

This plan is one-shot for the current baseline. After HY.5 closes, the
`HYGIENE_PLAN.md` + `HYGIENE_MILESTONES.md` pair becomes a precondition
that every future plan cites at the top of its own `_PLAN.md`:

```text
Precondition: `docs/HYGIENE_PLAN.md` HY.5 gate is green; the
full Playwright suite exits 0 from a freshly-reset `afterschola_t3_test`
database. The author re-runs the full suite + production build before
declaring a milestone done.
```

The HY.5 gate must be re-run before any `_MILESTONES.md` chain that
touches `src/`, `server/`, or shared `tests/fixtures.js` is declared
done. The gate is a script (`npm run hygiene:verify`) that:

1. `npm run db:reset`
2. `npx playwright test tests/ --workers=1`
3. `npm run build`
4. Exits 0 only if all three pass.

A failing gate blocks the PR. This is the same pattern as
`PRODUCTION_GATE_CONFIRMATION_MILESTONES.md` T3, extended to cover
test environment hygiene in addition to backend contract tests.

## 9. Rollback

Each microtask is one bounded change. If a microtask produces a
regression the focused spec does not catch, `git revert` the single
commit for that microtask. The chain is one-spec-at-a-time so rollback
is one file per scope.

The DB reset script (HY.0) is the only one with cross-cutting effect:
it drops the test database. The microtask's `DONE-IF` clause includes
a `git status` check confirming the script is the only file added, and
the production database (`afterschola` or whatever cPanel uses) is
unreachable from the script by construction (it hard-codes the
`afterschola_t3_test` name).
