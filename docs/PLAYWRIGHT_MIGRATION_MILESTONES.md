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

#### PM.0.2 Tambah Trainer Baru — "Buat akun login" toggle workaround (HY.4.2 amendment)

The `Tambah Trainer Baru` form in the Admin Cabang / Superadmin flow has
a `Buat akun login untuk trainer ini` toggle that defaults to ON. When
left ON, the form requires a `Username` value (server-side validation
returns the Indonesian message `Username wajib diisi`). The seed and
form-fill helpers in this chain therefore **uncheck** that toggle before
submitting the form, so the spec does not get tripped by the validation
alert even when it is only asserting the trainer profile fields.

Concrete references:

- The toggle is rendered in the trainer form component (see
  `src/features/trainers/TrainerList.jsx` — the `Buat akun login untuk
  trainer ini` label is bound to a controlled checkbox that defaults
  to `true`).
- The seed helper `seed()` in `tests/r3-verify.spec.js` and the
  `fillTrainerForm()` helper in `tests/e2e.spec.js` both explicitly
  uncheck the toggle (locator: `getByLabel('Buat akun login untuk
  trainer ini', { exact: true })` or equivalent) before clicking the
  form's `Simpan` button.

This sub-bullet is documentation of an already-shipped workaround, not
a new microtask. If the form is later refactored to default the toggle
to OFF, this sub-bullet and the helper uncheck calls can be removed
together.

## Gate PM.1 — Group B (import + UI-seeded-fixture rewrite)

### PM.1.1 Rewrite r3-verify.spec.js

```text
MICROTASK: Rewrite r3
  EDIT:    tests/r3-verify.spec.js
  RULES:   replace loginAsAdmin with loginViaApi(page, 'adminCabang') + page.goto(APP); trainer creation must go through the admin_cabang session per the privilege matrix (see src/features/trainers/TrainerList.jsx:37 and docs/AUDIT_FINDINGS_2026-09-02.md:78-83 — superadmin cannot create trainers via the UI, only edit existing records); the `loginViaApi(page, 'superadmin')` call in the original RULES line was a plan typo; replace localStorage afterschola_v4_{siswa,trainer} assertions with /api/read.php?entity=... re-reads; preserve the four R3.* assertions (WA normalization + attendance counts + SPP ledger); see PM.0.2 for the "Buat akun login" toggle workaround that fillTrainerForm() in this spec applies before clicking Simpan
  DEPENDS: PM.0.1
  OUTCOME: r3 spec exercises the WA normalization, attendance counts, and SPP-ledger increment shape against real auth + real backend, through the admin_cabang role
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
  RULES:   same as PM.1.1 with one carve-out: the 18 loginAsAdmin call sites become loginViaApi(page, 'adminCabang') only for specs that create trainers; specs that only read data or that create non-trainer entities (cabang, sekolah, siswa) keep loginViaApi(page, 'superadmin') because the privilege matrix (`src/features/trainers/TrainerList.jsx:37`, `docs/AUDIT_FINDINGS_2026-09-02.md:78-83`) restricts trainer creation to admin_cabang, while superadmin keeps the read-scope-it-owns role for the other CRUD checks; localStorage entity reads in the 17 IMPLEMENTATION_PLAN.md Part 7 rows migrate to /api/read.php; see PM.0.2 for the "Buat akun login" toggle workaround that fillTrainerForm() applies for the trainer rows in Part 7
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

## Gate PM.4 — Post-migration findings triage

Surfaced by the PM.3.1 verification run on 2026-09-02. Per taste
#30, each finding was cross-referenced against
`docs/AUDIT_FOLLOWUP_PLAN.md`, `docs/PRODUCTION_PLAN.md`,
`docs/SCOPE_EXPANSION_PLAN.md`, and `docs/MULTI_ACCOUNT_SYNC.md`
before being added here:

- Already-tracked in `AUDIT_FOLLOWUP_MILESTONES.md` (no new task
  here): M-AF1.2 owns `flow-simulation`/`ki1-trainer-cabangid`
  legacy-picker rot (AF2, AF3); M-AF1.3 owns
  `student-delete-absensi` nullify (AF4); M-AF2.1 owns
  `honor-delete-403` coverage (AF6); M-AF4.x owns
  `multi-account-crud-sync` branch isolation; `auth-login-page`
  credential flow is owned by the post-M-AUTH.5 acceptance chain.

- Documented in `AUDIT_FINDINGS_2026-09-02.md` and turned into
  styling/UX microtasks under **Gate PM.5** below (no overlap with
  the audit-followup chain; the audit doc remains the durable
  finding record).

## Gate PM.5 — Frontend styling & UX parity (app-side)

Source-grounded microtasks for the ten styling/UX items the
session-end review surfaced on 2026-09-02. Findings 1–5 are
highest-leverage (single PR each) and a pair of #1 + #2 alone
would visibly unify the app; #6–#10 are smaller polish items.
Each microtask follows the standard
`MICROTASK / EDIT / RULES / DEPENDS / OUTCOME / VERIFY / DONE-IF`
shape used elsewhere in this document.

Cross-cutting acceptance (taste #21): every microtask in this gate
must keep the per-tab UI walkthrough in
`tests/audit2-crud-deep.spec.js` green — re-run the audit spec
after each microtask lands and confirm no styling regression in
the corresponding screenshot.

### PM.5.1 Lock the sidebar + page header; scroll only the main panel

```text
MICROTASK: Lock sidebar + header so they stay visible on long tabs
  EDIT:    src/App.jsx (root layout div, line 189), src/components/SidebarLayout.jsx (aside shell, lines 56-62)
  RULES:   preserves the existing `sticky top-0` header behavior; mobile drawer behavior unchanged
  DEPENDS: none
  OUTCOME: the root shell is `h-screen overflow-hidden` instead of `min-h-screen`; the sidebar grows to full viewport height and scrolls internally (`overflow-y-auto`); the main column scrolls independently; the header remains pinned at the top of the main column on every tab including Data Keuangan / Data Siswa
  VERIFY:  tests/audit2-crud-deep.spec.js re-run: every captured `audit2-tab-*.png` shows the same header (Afterschola logo + Akun avatar) and the same sidebar in the same position; no scroll-jump on tab switch; sidebar's nav buttons do not push the brand mark out of view on a 768px-tall viewport
  DONE-IF: verify passes; only App.jsx + SidebarLayout.jsx changed
```

### PM.5.2 Unify the accent palette to a single blue + neutral surface

```text
MICROTASK: Single accent palette — drop the competing yellow / green / rose highlights
  EDIT:    src/components/SidebarLayout.jsx (active-state line 112, header brand line 72, logo border lines 16/23, drawer close hover line 81, collapse hover line 92), src/components/AccountMenu.jsx (avatar border line 50), src/features/reports/FinanceReport.jsx (Cetak Laporan + 6 export chips)
  RULES:   keep the brand-recognizable Afterschola blue; do not introduce a new color; only neutral (slate/white) + the chosen blue
  DEPENDS: PM.5.1
  OUTCOME: every "active" / "brand" / "primary action" surface in the app is the same blue (currently blue-600 / blue-900 / blue-100 variants are fine, but yellow-300/400 and emerald-600 are removed); export chips on Data Keuangan read as blue like the rest of the app's primary buttons
  VERIFY:  tests/audit2-crud-deep.spec.js re-run: every captured tab screenshot shows a single accent color; tests/audit-crud-styling.spec.js AUDIT: visual styling — overview card colors + typography probe shows the new palette colors in the buttons list; npm run build still clean
  DONE-IF: verify passes; no new color tokens added
```

### PM.5.3 School card image fallback should be a local asset, not Unsplash

```text
MICROTASK: Replace Unsplash onError fallback with a local placeholder
  EDIT:    src/features/schools/SchoolList.jsx (onError handler lines 245-248), public/school-placeholder.svg (new)
  RULES:   no new external network dependency; the placeholder must be reachable offline
  DEPENDS: none
  OUTCOME: when a sekolah record has no `foto` URL (or the URL is broken), the card renders the new public/school-placeholder.svg instead of a broken-image glyph; existing onError handler still kicks in for legacy bad URLs
  VERIFY:  tests/audit2-crud-deep.spec.js re-run: `audit2-tab-Data-Sekolah.png` shows no broken-image icon on any card; the placeholder SVG is a subtle slate-200 icon + label
  DONE-IF: verify passes; placeholder asset is <5KB
```

### PM.5.4 Remove the duplicated Data Absensi page title

```text
MICROTASK: Drop the duplicate "Lembar Absensi Harian Kelas" sub-heading
  EDIT:    src/features/attendance/index.jsx (the inner H2 card that re-states the parent page title)
  RULES:   keep the page subtitle "Mencatat data kehadiran guru dan siswa untuk periode …"; do not remove the top-page H1
  DEPENDS: none
  OUTCOME: visiting Data Absensi as any role shows the H1 once; the H2 sub-card is gone; no other content shifts
  VERIFY:  tests/audit2-crud-deep.spec.js re-run: `audit2-tab-Data-Absensi.png` shows exactly one "Lembar Absensi Harian Kelas" heading
  DONE-IF: verify passes; only one src file changed
```

### PM.5.5 Add `title` + `aria-label` to the trainer-card edit/delete icons

```text
MICROTASK: Surface the trainer-card action affordance via hover + a11y text
  EDIT:    src/features/trainers/TrainerList.jsx (the pencil button around line 295 and the trash button around line 301)
  RULES:   Indonesian copy; the existing `canEditTrainers` / `canCreateOrDeleteTrainers` gates must stay; the icons must remain visible to superadmin (Edit) and admin_cabang (Edit + Delete)
  DEPENDS: none
  OUTCOME: hovering the trainer-card edit icon shows the native browser tooltip "Edit trainer"; the delete icon's tooltip is "Hapus trainer"; both have matching `aria-label` so screen-reader users get the same context
  VERIFY:  tests/audit2-crud-deep.spec.js re-run: `audit2-tab-Data-Trainer.png` shows visible tooltips on hover (manual via Playwright `getByTitle` assertion); existing superadmin / admin_cabang nav checks still pass
  DONE-IF: verify passes; only TrainerList.jsx changed
```

### PM.5.6 Sticky sub-header (H1 + filter + primary action) per tab

```text
MICROTASK: Sticky sub-header for every feature tab
  EDIT:    src/components/FeatureSubHeader.jsx (new), src/features/schools/SchoolList.jsx, src/features/students/StudentList.jsx, src/features/trainers/TrainerList.jsx, src/features/attendance/index.jsx, src/features/payments/PaymentTable.jsx, src/features/reports/FinanceReport.jsx, src/features/reports/AgingReport.jsx, src/features/admin/BranchManager.jsx
  RULES:   sub-header sits below the global sticky header (z-30 < z-40); H1 left, period/filter right, primary action as a chip on the far right; the existing card containers (H1 in a white card) are removed
  DEPENDS: PM.5.1 (sub-header is sticky within the new scrolling main column)
  OUTCOME: every feature tab renders an H1 + filter + primary action in a single sticky band; the H1 no longer sits in a white card with empty padding above; the body content starts immediately below
  VERIFY:  tests/audit2-crud-deep.spec.js re-run: every captured tab screenshot shows the H1+filter+action in a tight band at the top of the body, with no white card around it; the period dropdown stays reachable when scrolled
  DONE-IF: verify passes; all 8 feature tabs migrated
```

### PM.5.7 Empty-state illustrations on the four "Belum ada data" cards

```text
MICROTASK: Add minimal SVG illustrations to empty-state cards
  EDIT:    src/components/EmptyState.jsx (new), src/features/trainers/TrainerList.jsx, src/features/admin/BranchManager.jsx, src/features/students/StudentList.jsx (no-data case), src/features/schools/SchoolList.jsx (no-data case)
  RULES:   96px SVG, slate-200 stroke, no text on the SVG itself; copy stays in Indonesian
  DEPENDS: PM.5.2 (uses the unified palette)
  OUTCOME: the four "Belum ada data X" cards render a small illustration + helper text + (where applicable) a primary action button; visually, the page no longer has a giant white card with one line of gray text
  VERIFY:  tests/audit2-crud-deep.spec.js re-run: with the local DB cleared of the corresponding entity, the empty-state screenshot shows the illustration + copy
  DONE-IF: verify passes; 4 callsites migrated
```

### PM.5.8 Tabular numerals on every currency / percentage column

```text
MICROTASK: Use `font-variant-numeric: tabular-nums` on tabular data
  EDIT:    src/index.css (add a single `table { font-variant-numeric: tabular-nums; }` rule), or class-based via a new `src/components/Table.jsx` if the project doesn't have a global CSS entrypoint
  RULES:   the change applies to all `<table>` cells; outside tables the default proportional figures stay (so headings + button text don't get tightened)
  DEPENDS: none
  OUTCOME: columns of Rp figures in Data Keuangan / Umur Piutang / Data Pembayaran / Data Siswa line up vertically; the percentage column in Umur Piutang (`27.3%`) lines up across rows
  VERIFY:  tests/audit2-crud-deep.spec.js re-run: `audit2-tab-Data-Keuangan.png` and `audit2-tab-Umur-Piutang.png` show evenly-aligned numeric columns; existing `getByText('Rp ...')` assertions still pass (the text content is unchanged, only its metrics)
  DONE-IF: verify passes; only CSS / one wrapper component changed
```

### PM.5.9 BranchManager: default to "branch without admin" + clear empty-state copy

```text
MICROTASK: BranchManager lets superadmin create a branch without an admin account
  EDIT:    src/features/admin/BranchManager.jsx (state init line 41, save validation lines 119-128, form render lines 411-454)
  RULES:   preserves the existing `createAdminAccount` checkbox contract; the audit's first-create-failed-silently behavior must be replaced with a clear inline message OR a default-off checkbox
  DEPENDS: none
  OUTCOME: opening Tambah Cabang shows the Admin-Cabang onboarding section unchecked by default; saving without ticking the checkbox + filling the fields creates a branch with no admin and a success toast; ticking the checkbox without filling the fields shows a single inline error "Nama Admin Cabang wajib diisi untuk membuat akun login"
  VERIFY:  tests/audit2-crud-deep.spec.js AUDIT2: superadmin Cabang — full create + visible now passes on its first run without filling the Admin fields; the success dialog "Akun Admin Cabang Berhasil Dibuat" never appears in that case
  DONE-IF: verify passes; only BranchManager.jsx changed
```

### PM.5.10 Mobile drawer: slide-in animation + tap-outside-to-close

```text
MICROTASK: Mobile drawer slide-in transition and tap-to-close
  EDIT:    src/App.jsx (mobile drawer block lines 208-228)
  RULES:   backdrop click still closes the drawer; the drawer's translate-x-0 ↔ -translate-x-full transition is 200ms; desktop sidebar is unchanged
  DEPENDS: PM.5.1
  OUTCOME: opening the mobile hamburger shows the drawer sliding in from the left over a 200ms window; tapping the backdrop or the close icon dismisses it; the body remains scroll-locked while the drawer is open
  VERIFY:  tests/audit2-crud-deep.spec.js AUDIT2: visual — palette consistency across tabs capture uses a mobile viewport (375x667) for the drawer animation step; the snap is taken after the 200ms transition completes
  DONE-IF: verify passes; only App.jsx changed
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

> **Note on gate numbering:** PM.3 (full-suite-green) was authored
> as the original final-acceptance gate. PM.4 (triage) and PM.5
> (styling) were added later, on 2026-09-02, after the audit
> surfaced the carry-overs. The **logical order** is
> PM.0 → PM.1 → PM.2 → **PM.4 → PM.5 → PM.3** (the last three
> can be done in any order, but PM.3's "exits 0" gate is what
> closes the chain). PM.4 and PM.5 are intentionally source-touching;
> PM.0–PM.3 are tests-only (see the "Notes" section below).

## Notes on what this milestone chain is NOT

- Gates PM.0 → PM.3 do not modify any app source under `src/` or
  `server/`. PM.4 (post-migration triage) and PM.5 (styling &
  UX parity) are explicitly different — they are the only gates
  in this chain that touch `src/`. See each microtask for the
  bounded scope.
- The migration chain (PM.0.1 → PM.3.1) does not add a
  `loginAsAdmin` stub to `tests/fixtures.js`. The migration is
  honest: spec semantics change from localStorage to API-backed,
  not just the import line.
- It does not delete any spec; every old spec is migrated in place so the
  test-name-to-row mapping IMPLEMENTATION_PLAN.md Part 7 relies on stays
  intact. If a milestone proves a spec is no longer meaningful
  (e.g. it asserts a soft-login invariant the app no longer has), the
  bounded fix is to rewrite its assertions — not to delete the spec.

## Gate PM.5 (audit-appended) — Manual-audit follow-ups (2026-09-04)

Source: `docs/log-doc/audit-app-vs-tests_2026-09-04_2249Z.md`. These microtasks extend the styling chain. They are file-ready; verify the existing PM.5.1→PM.5.10 numbers (referenced in the Ownership block below) before filing to avoid duplicate IDs.

### PM.5.11 Modal: createPortal + tune padding (F-03)

```text
MICROTASK: Modal: add createPortal(target=document.body) + tune padding
  EDIT:    src/components/AppModal.jsx
  FINDS:   F-03 (manual audit #001, #007)
  RULES:   taste #34 (preserve existing escape/click-outside/body-scroll-lock behavior at AppModal.jsx:41-72); taste #11 (mirror the existing AppModal styling); taste #15 (wire the fix to a real visual guard, not a no-op change)
  DEPENDS: none
  OUTCOME: every modal opens via `createPortal(target=document.body)` so it escapes any ancestor stacking context; the modal's outer div uses `p-2 sm:p-4` instead of `p-4` to reduce the visual gap on small viewports
  VERIFY:  Playwright `tests/modal-positioning.spec.js` (new) opens Sekolah form modal as superadmin in three viewports (375, 768, 1280), asserts the modal's panel top edge sits within 8px of the viewport top, and asserts the modal is not visually clipped by the header; existing modal-using specs (r3-verify, e2e, settings tests) remain green
  DONE-IF: verify passes; only intended files changed
```

### PM.5.12 Trainer: use RupiahInput for Honor field (F-07)

```text
MICROTASK: Trainer: use RupiahInput for Honor field (single-line)
  EDIT:    src/features/trainers/TrainerList.jsx (around line 427-430)
  FINDS:   F-07 (manual audit #024)
  RULES:   taste #11 (mirror existing RupiahInput contract at src/components/RupiahInput.jsx:28-42); per taste #15 wire the swap to the existing form-validation guard, not a no-op
  DEPENDS: none
  OUTCOME: the Trainer's Honor per Kedatangan field uses <RupiahInput> (not the plain <input type="number">); leading zeros are stripped; empty input normalizes to 0 on blur; the stored value is a plain number
  VERIFY:  Playwright `tests/trainer-honor-input.spec.js` (new) opens Trainer form as Admin Cabang, types `01000000` in Honor, asserts the displayed value is `10.000` (after formatting) and the stored value is `1000000`; clears the field, blurs, asserts the displayed value is `0` and the stored value is `0`; existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

### PM.5.13 Salin button: copy feedback (4 sites) (F-06)

```text
MICROTASK: Salin button: copy feedback across 4 sites
  EDIT:    src/features/trainers/TrainerList.jsx (lines 371-374, 385-388), src/features/admin/BranchManager.jsx (lines 333, 347)
  FINDS:   F-06 (manual audit #025)
  RULES:   taste #11 (mirror the existing AlertDialog success-tone); taste #15 (wire to a real validation guard); use a small `useState` per button (e.g. `const [copied, setCopied] = useState(false)`) with a 1.5s `setTimeout` reset; add `aria-live="polite"` for screen readers
  DEPENDS: none
  OUTCOME: every Salin button changes its label to `Tersalin` for 1.5s after a successful `navigator.clipboard.writeText`; clipboard failure shows `Gagal menyalin` instead
  VERIFY:  Playwright `tests/salin-feedback.spec.js` (new) opens the Trainer initial-password dialog as Admin Cabang, clicks Salin, asserts the button text changes to `Tersalin` within 100ms, then reverts to `Salin` after ~1.5s; same assertion for the BranchManager initial-password dialog
  DONE-IF: verify passes; only intended files changed
```

### PM.5.14 Antrean Verifikasi: rename toggle label (F-09)

```text
MICROTASK: Antrean Verifikasi: rename toggle label and persist state
  EDIT:    src/features/attendance/RiwayatAbsensi.jsx (around line 58-65)
  FINDS:   F-09 (manual audit #029, #030 discoverability)
  RULES:   taste #11 (mirror existing button styling); per taste #16 (UI is convenience; persist via localStorage key so refresh keeps the state)
  DEPENDS: none
  OUTCOME: the toggle button reads `Tampilkan semua absensi` when `showAll=false` and `Hanya antrian verifikasi` when `showAll=true`; the toggle state is persisted in localStorage so it survives page refresh
  VERIFY:  Playwright `tests/antrean-toggle-label.spec.js` (new) opens Riwayat Absensi as Admin Cabang, asserts the toggle label matches the chosen phase, clicks the toggle, asserts the label flips, refreshes the page, asserts the toggle state survived; existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

### PM.5.15 Sidebar collapse: add overflow-hidden (F-14, single-line)

```text
MICROTASK: Sidebar collapse: add overflow-hidden (single-line fix)
  EDIT:    src/components/SidebarLayout.jsx (around line 60)
  FINDS:   F-14 (manual audit #013 sidebar collapse visual)
  RULES:   taste #11 (mirror existing sidebar styling); per taste #15 wire the fix to a real visual guard
  DEPENDS: none
  OUTCOME: when the desktop sidebar is collapsed (w-20), the toggle button and logo stay visually inside the rail; no overflow into the main content area
  VERIFY:  Playwright `tests/sidebar-collapse-overflow.spec.js` (new) opens the app as superadmin at 1280px viewport, clicks the collapse toggle, asserts the sidebar bounding box is exactly 80px wide and the toggle button's right edge is within the rail; existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

### PM.5.16 Sidebar: make desktop sidebar sticky top-0 self-start (F-15)

```text
MICROTASK: Sidebar: make desktop sidebar sticky top-0 self-start
  EDIT:    src/components/SidebarLayout.jsx (around line 60)
  FINDS:   F-15 (manual audit #013 sidebar stretch)
  RULES:   taste #11 (mirror existing sidebar styling); do not break the mobile drawer variant
  DEPENDS: PM.5.15
  OUTCOME: the desktop sidebar (variant=desktop) becomes sticky and does not stretch with the page content; the mobile drawer is unchanged
  VERIFY:  Playwright `tests/sidebar-sticky.spec.js` (new) opens the app as superadmin, scrolls a long Overview page (e.g. via `page.evaluate(() => window.scrollTo(0, 2000))`), asserts the sidebar's top edge is at viewport y=0 (sticky), and asserts the mobile drawer (375px viewport) still opens as an overlay
  DONE-IF: verify passes; only intended files changed
```

### PM.5.17 Trainer scroll-freeze: instrument + memoize (F-08)

```text
MICROTASK: Trainer scroll-freeze: instrument + memoize
  EDIT:    src/features/auth/TrainerDashboard.jsx (line 22, financialData call), src/features/attendance/TrainerHistory.jsx, src/features/attendance/RiwayatAbsensi.jsx; src/lib/finance.js (memoize financialData on its inputs)
  FINDS:   F-08 (manual audit #026, #027, #028); user evidence: 22-second stall, no transform/filter ancestor, only 716ms scripting
  RULES:   taste #56 (no fabrication — the diagnosis from the user's 22-second recording is `not a render loop, but a long idle/loop stall`); taste #15 (wire the memoization to a real perf guard)
  DEPENDS: none
  OUTCOME: the trainer can scroll the Siswa list to row 50 in <2s; the Riwayat Absensi toggle (showAll) re-renders in <500ms; the financialData() call is memoized on its inputs
  VERIFY:  Playwright `tests/trainer-scroll-perf.spec.js` (new) logs in as trainer, opens Data Siswa, asserts `page.evaluate(() => performance.now())` before and after scrolling 50 rows is <2000ms; opens Riwayat Absensi, clicks the toggle, asserts the re-render is <500ms; existing r3-verify.spec.js and stress-simulation.spec.js remain green
  DONE-IF: verify passes; only intended files changed
```

### PM.5.18 Scrollbar: add scrollbar-thin (F-12)

```text
MICROTASK: Scrollbar: add scrollbar-thin on the body
  EDIT:    src/index.css (add `scrollbar-width: thin` to body), or tailwind.config.js (extend with a scrollbar-thin utility)
  FINDS:   F-12 (manual audit #020 second occurrence)
  RULES:   taste #11 (mirror frontend-style reference if it exists); taste #15 (wire the fix to a real visual guard)
  DEPENDS: none
  OUTCOME: the body scrollbar is visually thin (or hidden via Tailwind's scrollbar-thin utility); other scrollable elements (modals, table cards) inherit the styling
  VERIFY:  Playwright `tests/scrollbar-thin.spec.js` (new) opens the app as superadmin, asserts `getComputedStyle(document.body).scrollbarWidth` is `thin` (or `none` if hidden); existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

### PM.5.19 Select chevron: add right margin (F-13)

```text
MICROTASK: Select chevron: add right margin
  EDIT:    src/index.css (add a global selector for `select { background-position: right 0.75rem center; padding-right: 2.25rem; }`)
  FINDS:   F-13 (manual audit #012)
  RULES:   taste #11 (mirror frontend-style reference); do not change every <select> individually
  DEPENDS: none
  OUTCOME: every <select> in the app has consistent right margin between the chevron and the right edge
  VERIFY:  visual check: open Data Sekolah and Data Cabang as superadmin, screenshot the dropdown chevron position; existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

### PM.5.20 SPP per Sekolah font: text-xs to text-sm (F-16)

```text
MICROTASK: SPP per Sekolah font: text-xs to text-sm in FinanceReport + OverviewCards
  EDIT:    src/features/reports/FinanceReport.jsx, src/features/overview/OverviewCards.jsx (find the SPP-per-Sekolah section)
  FINDS:   F-16 (manual audit #021)
  RULES:   taste #11 (mirror the existing text-sm in adjacent rows); do not change non-SPP rows
  DEPENDS: none
  OUTCOME: the Realisasi SPP per Sekolah section uses text-sm (or larger) for the SPP amounts; the heading remains text-xs (label); adjacent rows unchanged
  VERIFY:  visual check: open FinanceReport as Admin Cabang, screenshot the section; assert the SPP amount font-size is >= 14px (text-sm) via `getComputedStyle(el).fontSize`; existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

### PM.5.21 Trial-Siswa row button: reserve space (F-17)

```text
MICROTASK: Trial-Siswa row button: reserve space when hidden
  EDIT:    src/features/students/StudentList.jsx (around line 235-262, the row's button group)
  FINDS:   F-17 (manual audit #023)
  RULES:   taste #11 (mirror the existing row layout); use Tailwind `invisible` instead of removing the button from the DOM
  DEPENDS: none
  OUTCOME: when a Trial siswa's `Kirim Tagihan` button is hidden (because the siswa is not tunggakan), the row's other buttons (Catat Pembayaran, Edit, Hapus) stay anchored to the right and do not drift to the center
  VERIFY:  Playwright `tests/siswa-row-button-anchor.spec.js` (new) opens Data Siswa as Admin Cabang, locates a Trial siswa row, asserts the row's button group is right-aligned (button's `getBoundingClientRect().right` matches the row's right edge within 4px); existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

### PM.5.22 Tables: add row numbering (F-21)

```text
MICROTASK: Tables: add row numbering as first <th>/<td>
  EDIT:    src/features/students/StudentList.jsx (table thead around line 172, tbody around line 183-264), src/features/schools/SchoolList.jsx (cards — add a small number badge top-left if team prefers card layout over table), src/features/trainers/TrainerList.jsx (table if present)
  FINDS:   F-21 (manual audit #010, #011)
  RULES:   taste #11 (mirror existing <th> styling); do not change the existing column order; do not number empty rows
  DEPENDS: none
  OUTCOME: the siswa table renders a new first <th>`#`</th> column with 1-indexed row numbers; the column is <50px wide and the number is right-aligned
  VERIFY:  Playwright `tests/siswa-row-numbering.spec.js` (new) opens Data Siswa as superadmin, asserts the first <th> text is `#`, asserts the first <td> in each body row contains a number 1..N matching the row index
  DONE-IF: verify passes; only intended files changed
```

## Gate PM.5 (audit-appended) — closure evidence (2026-09-08)

**Status: VERIFIED / GATE CLOSED 2026-09-08** (implementation from commit 4850fca; verification gap closed in this session at HEAD f0fb18a).

Per-item verification (XAMPP MySQL + PHP 127.0.0.1:8000 + Vite 5173 up, DB reset to the canonical `afterschola_t3_test` seed via `npm run db:reset` first):

- **PM.5.11 (F-03)** — `tests/modal-positioning.spec.js` (new) → 3 passed (viewports 375/768/1280): the portaled backdrop is a direct child of `<body>`, carries `p-2 sm:p-4`, and covers the viewport exactly (0,0,vw,vh) both at rest and while scrolled; the panel is unclipped. NOTE: the plan's "panel top edge within 8px of viewport top" expectation contradicted the pinned OUTCOME — AppModal centers the panel vertically (`items-center`), so the falsifiable F-03 guard is the viewport-exact `fixed inset-0` backdrop (the pre-fix defect was the overlay trapped in a transformed ancestor's containing block); treated as a plan-side expectation fix (testing-taste #14), recorded here, app code unchanged.
- **PM.5.12 (F-07)** — `tests/trainer-honor-input.spec.js` (new) → 1 passed: Honor field is RupiahInput (type=text + inputmode=numeric + Rp adornment); `01000000` displays `1.000.000` and re-render proves plain-number storage; empty blur normalizes to `0`. The plan's pinned pair ("display `10.000` / stored `1000000`" for input `01000000`) is internally inconsistent (testing-taste #14); the display/storage split is what the spec falsifies.
- **PM.5.13 (F-06)** — `tests/salin-feedback.spec.js` (new) → 2 passed (Trainer + BranchManager initial-password dialogs): Salin → `Tersalin` → reverts to `Salin` after the 1.5s window. Headless clipboard friction is removed in-harness (permissions + writeText resolve stub — testing-taste #3/#32); buttons pinned by `aria-live` attribute because a name-based locator re-resolves to the sibling button when the label flips.
- **PM.5.14 (F-09)** — `tests/antrean-toggle-label.spec.js` (new) → 1 passed: label `Tampilkan semua absensi` ⇄ `Hanya antrian verifikasi`, heading `Antrian Verifikasi` ⇄ `Semua Absensi`, state persists via `afterschola_v4_riwayat_show_all` across reload; storage key left clean.
- **PM.5.15 (F-14)** — `tests/sidebar-collapse-overflow.spec.js` (new) → 1 passed: rail is exactly 80px collapsed / 256px expanded (aside, border-box), toggle right edge inside the rail, `overflow-hidden` present. **In-scope app fix carried:** 4850fca's `overflow-hidden` alone still left the toggle clipped (measured right edge 92 > 80) because the header kept `px-4 justify-between`; `SidebarLayout.jsx` collapsed/drawer header now uses `justify-center px-2` (taste #15 — wired to the visual guard, not a cosmetic no-op).
- **PM.5.16 (F-15)** — `tests/sidebar-sticky.spec.js` (new) → 1 passed: `<aside>` carries `sticky top-0 self-start`, top edge stays y≤1 after `window.scrollTo(0, 2000)`, height is viewport (h-screen) not document, mobile drawer still opens/closes at 375px.
- **PM.5.17 (F-08)** — `tests/trainer-scroll-perf.spec.js` (new) → 1 passed: fresh trainer account (API-created, password change completed in-flow) scrolls Data Siswa staying interactive (scroll+probe < 2000ms, post-scroll probe < 500ms) and the Riwayat Absensi showAll toggle re-render is < 500ms (driven as adminCabang — the toggle lives in RiwayatAbsensi, the admin view; the trainer's variant is TrainerHistory which has no toggle). Seeded `trainer@test.local` has no trainer row (payload NULL after db:reset), so the spec mints its own assigned trainer. **Hygiene purge carried:** the two `[PERF TrainerHistory]` `console.log` calls (TrainerHistory.jsx:37,41 — 859ea75 instrumentation, the pre-existing PM.5.17 hygiene item) are removed; `src/` is now grep-clean of `console.log/debug`.
- **PM.5.18 (F-12)** — `tests/scrollbar-thin.spec.js` (new) → 1 passed: `scrollbar-width: thin` on Firefox-standard; on Chromium (reports `auto`) the served `body::-webkit-scrollbar` companion rule (index.css:50-60) is asserted present.
- **PM.5.19 (F-13)** — `tests/select-chevron-margin.spec.js` (new) → 1 passed: live `<select>` paddingRight ≥ 36px (Data Sekolah BranchFilter), the global `select {}` CSS rule exists, screenshots captured (`test-results/pm519-select-*.png`). Data Cabang's current design renders no `<select>` (AssignSchoolPicker uses buttons), so its leg is the populated-tab screenshot + the global rule.
- **PM.5.20 (F-16)** — `tests/spp-font-size.spec.js` (new) → 1 passed: every Rincian Finansial Sekolah Mitra amount cell renders ≥ 14px (`text-sm`), screenshot captured. 4850fca implemented the bump as the per-school SPP chart percentage 9 → 11 (OverviewCards.jsx:298-302) plus the FinanceReport table's `text-sm`.
- **PM.5.21 (F-17)** — `tests/siswa-row-button-anchor.spec.js` (new) → 1 passed: Trial row's WA anchor is `visibility: hidden` (not unmounted), and its button group's right offset equals an Aktif row's offset within 2px (no center drift). The plan's absolute "within 4px of the row edge" pin missed the Aksi cell's intentional `px-6` (24px) padding; the falsifiable form compares Trial vs Aktif offsets (testing-taste #14), recorded here.
- **PM.5.22 (F-21)** — `tests/siswa-row-numbering.spec.js` (new) → 1 passed: first `<th>` is `#`, right-aligned, body `td`s are contiguous 1..N, Sekolah card badge numbering 1..N. **In-scope app fix carried:** 4850fca's `w-12 px-6` header measured ~56px, violating the pinned "<50px wide" OUTCOME; the `#` th/td pair now uses `px-3` (StudentList.jsx:232,274) → 48px.

Regression clauses:

- `npx playwright test tests/r3-verify.spec.js tests/audit2-crud-deep.spec.js --project=default --workers=1` → 10 passed, 0 page errors (the gate's PM.5 acceptance cross-check + every microtask's "r3-verify remains green" clause).
- Modal/school-affected specs: `npx playwright test tests/sekolah-foto-picker.spec.js tests/settings-logo-picker.spec.js tests/sekolah-jadwal-list.spec.js tests/school-list-actions.spec.js tests/school-form-validation.spec.js tests/sekolah-cabang-cache.spec.js tests/sekolah-delete-confirm.spec.js --project=default --workers=1` → 7 passed (A2.5 acceptance batch + PM.5.11-affected modal surfaces).
- Full gate batch: the 12 new specs (15 tests incl. PM.5.11's three viewports) → 15 passed after `npm run db:reset`.
- `npm test` → 54 passed (13 files). `npm run build` → ✓ built in 5.32s, PWA precache 6 entries.
- Source hygiene: grep `console.(log|debug)` in `src/` → 0 matches; `git status` clean of build artifacts (`test-results/` is gitignored).

Changed: `src/components/SidebarLayout.jsx` (PM.5.15 collapsed-header fit fix), `src/features/students/StudentList.jsx` (PM.5.22 `#` column <50px fix), `src/features/attendance/TrainerHistory.jsx` (PM.5.17 console.log purge), 12 new `tests/pm5-*.spec.js` gate specs, this closure record.

Remaining: full-suite state still carries the documented HYGIENE_MILESTONES 2026-09-03 cohorts (12 `e2e.spec.js` selector drifts, 6 class-3 app-level specs, class-4 `student-delete-absensi` count assertion) and the destructive-project items (`auth-login-page` cases 6/10, `phase567-exit-gate` `trn-test-1` seed, `stress-simulation` Tambah-Cabang overlay hang) — all pre-existing and outside this gate's scope, unchanged here.

## Ownership and final acceptance

- Product integration owns `tests/` migration (PM.0.1 → PM.3.1).
  Each microtask is one PR.
- Platform/auth owns `tests/fixtures.js` API helpers (PM.0.1).
- Product design owns the styling & UX parity chain
  (PM.5.1 → PM.5.10). Each microtask is one PR; pairs that
  depend on each other (e.g. PM.5.1 + PM.5.2, PM.5.1 + PM.5.6,
  PM.5.1 + PM.5.10) are clearly tagged in their `DEPENDS:` lines.
- Test ownership covers spec loadability + green run + zero page errors
  (gates PM.0 → PM.3) and the re-run of
  `tests/audit2-crud-deep.spec.js` after each PM.5 microtask
  (gate PM.5 acceptance check).
- The migration chain (PM.0 → PM.3) is complete when PM.3.1's
  `npx playwright test tests/` exits 0 against the current
  canonical app and the per-microtask cross-cutting finding in
  PRODUCTION_GATE_CONFIRMATION_MILESTONES.md is marked resolved.