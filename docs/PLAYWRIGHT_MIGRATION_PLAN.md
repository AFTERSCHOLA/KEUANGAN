# Playwright Suite Migration Plan

This plan migrates 13 pre-M4.2 Playwright specs that still reference the deleted
`RolePicker.jsx` ("Pilih peran Superadmin / Admin / Trainer"), the removed
"Ganti Peran" sidebar control, and the non-existent `loginAsAdmin` helper
exported by `tests/fixtures.js`. Each of those specs fails at module load today
(`import { loginAsAdmin } from './fixtures.js'` is unresolved), so the
"focused Playwright gates" that PRODUCTION_MILESTONES.M4.3 / M5.x cite as their
VERIFY evidence are not actually re-runnable until this work closes.

The authoritative plans remain `PRODUCTION_PLAN.md`, `PRODUCTION_MILESTONES.md`,
and `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md` (the "Per-microtask alignment
(2026-09-02 audit)" section lists every stale spec). This document does not
replace them; it adds a bounded migration plan and ordered microtasks in
`PLAYWRIGHT_MIGRATION_MILESTONES.md`.

## 1. Goal and observable outcome

After this plan closes, every Playwright spec under `tests/` either (a) loads
and runs end-to-end against the post-M4.2 application, or (b) is explicitly
deleted as superseded. No spec references `loginAsAdmin`, "Pilih peran *", or
"Ganti Peran". `npx playwright test tests/` (focused set first, then full
suite) returns the same pass/fail verdict as the actual production code, not a
module-load error.

## 2. Why this is not a pure selector rewrite

The pre-M4.2 specs are **soft-login fixtures**: they log in via the
`Pilih peran Superadmin/Admin/Trainer` picker, create Sekolah/Trainer/Siswa
through the UI, and then read `afterschola_v4_*` directly out of `localStorage`
to assert fixture state. The post-M4.2 app no longer has the picker; the
canonical login is `loginViaApi()` against the PHP backend, and writes/reads
flow through `/api/*` not localStorage.

A literal "find-and-replace `loginAsAdmin` → `loginViaApi(page, 'superadmin')`"
fixes the import error but **changes nothing else**: the tests still assert
against `afterschola_v4_absensi` in localStorage, where the new code path no
longer persists. The migration therefore has two halves:

1. **Login shape** — replace the picker and `Ganti Peran` with
   `loginViaApi()` / `page.context().clearCookies()`. Mechanical, but the
   cross-test `Ganti Peran` switches also need to be re-expressed as
   `logout(page) + loginViaApi(newRole)`.
2. **Fixture shape** — replace `localStorage.getItem('afterschola_v4_*')`
   reads/writes with the corresponding `/api/*.php` reads/writes. The existing
   `multi-account-crud-sync.spec.js` already demonstrates this pattern (see
   its `createBranch` / `createSekolahSuperadmin` / `createTrainerSuperadmin`
   helpers — M-MAS4.1's `loginAndPrime` reuses `loginViaApi`).

The two halves are bundled per spec, not sequenced, because each spec needs
both before its assertions mean anything.

## 3. Scope: 13 specs, grouped by behavior

`tests/fixtures.js` currently exports `test, TEST_USERS, loginViaApi, expect`.
It does NOT export `loginAsAdmin`. Adding `loginAsAdmin` as a thin wrapper over
`loginViaApi(page, 'superadmin')` would unblock the import error but leave the
fixture-shape half broken (the tests would still assert against localStorage).
Per taste #61 (server-side authorization is authoritative), the right fix is to
also rewrite the fixture half — not to paper over the import with a stub.

Group A — **M5 cohort, full UI flow + localStorage assertion (8 specs).**
   - `m51-verify.spec.js` (38 LOC)
   - `m512-verify.spec.js` (127 LOC)
   - `m513-verify.spec.js` (154 LOC)
   - `m52-verify.spec.js` (370 LOC)
   - `m53-verify.spec.js` (186 LOC)
   - `m54-verify.spec.js` (250 LOC)
   - `m61-verify.spec.js` (140 LOC)
   - `m62-verify.spec.js` (143 LOC)
   - `m63-verify.spec.js` (157 LOC)
   - `m71-verify.spec.js` (142 LOC)

These assert per-milestone UI flows (attendance capture, role-context
filtering, finance invariants) that previously persisted to localStorage. After
migration they seed fixtures via the API and assert through the UI plus
`/api/read.php?entity=...`. The picker/`Ganti Peran` blocks become
`loginViaApi(role)` + `page.context().clearCookies() + loginViaApi(otherRole)`.

Group B — **import-rewrite only (3 specs, no `Pilih peran` selectors).**
   - `r3-verify.spec.js` (156 LOC)
   - `r5-verify.spec.js` (179 LOC)
   - `e2e.spec.js` (898 LOC)

These already use the credential form / API, but import `loginAsAdmin` for
mid-test re-login. They only need the import line swapped to
`loginViaApi(page, 'superadmin')`. Grep confirms zero `Pilih peran` /
`Ganti Peran` matches in Group B.

## 4. Out of scope (explicit)

- `auth-login-page.spec.js`, `flow-simulation.spec.js`, `m1-scope-shell-navigation.spec.js`,
  `multi-account-crud-sync.spec.js`, `ki1-trainer-cabangid.spec.js`,
  `honor-delete-403.spec.js`, `settings-read-leak.spec.js`,
  `school-form-validation.spec.js`, `school-list-actions.spec.js`,
  `student-delete-absensi.spec.js`, `phase567-exit-gate.spec.js`,
  `stress-simulation.spec.js` — already migrated; not touched.
- `server/tests/*.php` — backend tests are out of scope.
- App source under `src/` — no app code changes are required for this work;
  the migration is test-only.
- `deploy/config.php` leak — explicitly excluded by user request 2026-09-02.

## 5. Architectural decision: fixture shape

The previous M5.x specs created Sekolah+Trainer+Siswa through the UI, then
read the localStorage entity to verify the write. The new code path sends
every write through `writeRemote()` → `/api/*.php`, and reads through
`/api/read.php?entity=...`. Two implementation options:

- **Option A (Recommended): Seed via the API, assert via the API.**
  Reuse `loginAndPrime` / `createBranch` / `createSekolahSuperadmin` /
  `createTrainerSuperadmin` helpers already present in
  `multi-account-crud-sync.spec.js`. Extract them into `tests/fixtures.js` so
  every spec imports the same helpers. Test code becomes smaller and
  consistent with how the application actually writes.
- **Option B (Rejected): Seed via the UI, assert via the API.**
  Keeps the UI-driven setup that the old tests had. Slower, flakier
  (Vite dev server + the test both driving the UI), and exercises
  writeRemote() only indirectly. Loses the M-MAS4.1 helper reuse benefit.
- **Option C (Rejected): Add a dev-only localStorage seeding helper.**
  Exposes a back door for tests that bypasses the production code path.
  Violates the production-plan invariant that localStorage is "non-sensitive
  UI preferences only" (PRODUCTION_PLAN.md §2). Per taste #8 / #33 this is
  not acceptable.

Decision: **Option A.** Helpers move into `tests/fixtures.js` and are shared
by all migrated specs.

## 6. Architectural decision: scope-switch fixture isolation

`m51/m512/m513` log in as admin to seed fixtures, then click `Ganti Peran` to
switch to trainer and assert scope. After migration the "switch" becomes
`await logout(page); await page.context().clearCookies(); await loginViaApi(page, 'trainer')`.
Per taste #25, this is a single-line `logout(page)` helper in `fixtures.js`
modeled on `multi-account-crud-sync.spec.js:57-59`.

Cleanup: every Group A spec must delete its own created Sekolah/Trainer/Siswa
in a `finally` block (M-MAS4.1 already does this for its Sim-* branches;
pattern is `try { ... } finally { /* best-effort delete */ }`).

## 7. Test-data hygiene (taste #66)

All seeded records use a `SIM-` / `Simulasi-` prefix in `nama` / `kode` so a
`afterschola_v4_*` cache scrub or a `DELETE WHERE nama LIKE 'Sim%'` stays
surgical. The existing `multi-account-crud-sync.spec.js` already uses
`PREFIX_A = 'SIMA'` / `PREFIX_B = 'SIMB'`; we reuse the same naming. No quotas
or caps in production code — hygiene is purely a test-side cleanup pattern.

## 8. Sequencing

The migration has natural ordering from smallest-scope to largest-scope:

1. Add the shared API helpers to `tests/fixtures.js`. Single small change;
   unlocks every subsequent spec.
2. Migrate Group B (3 specs, import-only). Cheapest; validates the helper.
3. Migrate the smallest Group A spec (`m51-verify.spec.js`, 38 LOC) first to
   prove the helper covers the picker-rewrite + logout/login + UI assertion
   shape end-to-end.
4. Migrate the remaining Group A specs in ascending LOC order. Each is one
   bounded PR-sized change. Verification per spec is the existing Playwright
   spec running green plus zero page errors.

Per taste #74, downstream microtasks renumber contiguously and `DEPENDS`
references are kept consistent.

## 9. Verification

Per taste #20 + #17, after every spec is migrated:

- `npx playwright test tests/<spec>` exits 0.
- `npx playwright test tests/<spec> --workers=1` (stress profile) exits 0.
- `git status` shows only `tests/` files changed (no app source or fixture
  backend touched).
- No `console.log` / `debugger` introduced in `tests/`.
- Final sweep: `npx playwright test tests/<group>` for the whole group, then
  the full `npx playwright test tests/` with zero page errors.

## 10. Risks and open decisions

- **M5.x spec assertions reference localStorage entity keys.** Some assertions
  (e.g. `m51:1:3` checking the active role is persisted) no longer apply
  post-M4.2 because localStorage no longer holds the role. Migration replaces
  those with `/api/auth/me.php` re-reads.
- **M5.x seeds ~10 records per test.** The `try/finally` cleanup matters; if
  it is skipped the disposable `afterschola_t3_test` database will accumulate
  Sim-* rows that pollute later assertions. Each spec owns its own cleanup.
- **Existing passing suites** (`auth-login-page.spec.js`, etc.) already
  cleared the throttle in a `beforeAll`. The new fixtures helpers must not
  re-add a throttle reset (one already exists) — keep the dependency one-way.
- **Helpers moved into `tests/fixtures.js`** change a shared fixture file. Per
  taste #8, grep for every consumer before/after the move to confirm none
  silently break.

## 11. Rollback

If a milestone produces a regression that the focused spec does not catch,
revert the bounded spec change (git revert the single commit). Per taste #5 /
#17, the migration is one-spec-at-a-time so rollback is one file per scope.