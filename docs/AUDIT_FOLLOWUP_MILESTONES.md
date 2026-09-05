# Afterschola Audit Follow-up Milestones

Fixes for the round-trip + CRUD audit (`AUDIT_FOLLOWUP_PLAN.md`). Each microtask is strictly ordered within its gate; do not start the next until the current `VERIFY` passes. A failing check becomes a bounded follow-up; do not patch unrelated files. Finding IDs (AF1–AF11) and decisions (DF1–DF4) reference `AUDIT_FOLLOWUP_PLAN.md`.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <AF/DF references>
  RULES:   <RA–RH + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

## Gate AF-A1 — Restore dead UI actions and broken test specs

### M-AF1.1 Restore school-card edit button icon

```text
MICROTASK: Restore school-card edit button icon
  EDIT:    src/features/schools/SchoolList.jsx
  FINDS:   AF1
  RULES:   RB (AUDIT_PLAN); visual parity with sibling Invoice (line 222) and Delete (line 224) icon buttons
  DEPENDS: none
  OUTCOME: every school card's middle action button renders a pencil SVG with `title="Edit"` and `aria-label="Edit sekolah"`; clicking it still calls openEdit(sch)
  VERIFY:  Playwright `tests/school-list-actions.spec.js` (new) loads Data Sekolah as superadmin and asserts the edit button has an `<svg>` child, a non-empty `title`, and a non-empty `aria-label`, then clicks it and asserts the edit modal opens
  DONE-IF: verify passes; only intended files changed
```

### M-AF1.2 Migrate legacy-picker specs to loginViaApi

```text
MICROTASK: Migrate legacy-picker specs to loginViaApi
  EDIT:    tests/flow-simulation.spec.js, tests/ki1-trainer-cabangid.spec.js, tests/fixtures.js
  FINDS:   AF2, AF3
  RULES:   matches m1-scope-shell-navigation.spec.js pattern (loginViaApi('admin_cabang', …))
  DEPENDS: M-AF1.1
  OUTCOME: flow-simulation.spec.js and ki1-trainer-cabangid.spec.js authenticate via the production API helper and never reference the deleted "Pilih peran Admin/Trainer" or "Ganti Peran" buttons
  VERIFY:  `grep -n "Pilih peran\|Ganti Peran" tests/flow-simulation.spec.js tests/ki1-trainer-cabangid.spec.js` returns no matches; `npx playwright test tests/flow-simulation.spec.js tests/ki1-trainer-cabangid.spec.js --workers=1` passes with zero page errors
  DONE-IF: verify passes; only intended files changed
```

### M-AF1.3 Nullify absensi siswaId on siswa delete

```text
MICROTASK: Nullify absensi siswaId on siswa delete
  EDIT:    src/features/students/StudentList.jsx, server/api/siswa.php
  FINDS:   AF4; DF2
  RULES:   RD (append-only sppPayments ledger preserved); mirror sekolah.php:31-33 known-gap comment for siswa
  DEPENDS: M-AF1.2
  OUTCOME: deleting a siswa also nullifies `absensi.entries[].siswaId` for that siswa and removes them from `financialData()` active count; sppPayments rows survive (ledger-immutability)
  VERIFY:  Playwright `tests/student-delete-absensi.spec.js` (new) deletes a seeded siswa with attendance + an SPP payment; reload and assert absensi entries for that siswaId are gone, finance rekap no longer counts the siswa, and the sppPayments row count is unchanged
  DONE-IF: verify passes; only intended files changed
```

## Gate AF-A2 — Permission coverage

### M-AF2.1 Cover honor-payment 403 path

```text
MICROTASK: Cover honor-payment 403 path
  EDIT:    tests/honor-delete-403.spec.js (new), tests/fixtures.js
  FINDS:   AF6
  RULES:   RG; matches server authorize.php:105-107 deny rule
  DEPENDS: none
  OUTCOME: a Playwright test logs in as trainer, calls `deleteRemote('honorPayments', id)` directly, and asserts the response is 403 (not 200) and the local cache is unchanged
  VERIFY:  `npx playwright test tests/honor-delete-403.spec.js --workers=1` passes; existing stress simulation and M-A3.1 tests remain green
  DONE-IF: verify passes; only intended files changed
```

### M-AF2.2 Close settings read-side leak

```text
MICROTASK: Close settings read-side leak
  EDIT:    src/components/SettingsModal.jsx, server/api/settings.php
  FINDS:   AF7
  RULES:   RE (role-gated render); PRODUCTION_PLAN matrix row "Global settings"
  DEPENDS: M-AF2.1
  OUTCOME: when a non-superadmin role invokes the SettingsModal (e.g., via a deep link or impersonation path), the modal renders a placeholder message ("Hanya Superadmin yang dapat mengubah pengaturan global") and never displays bank rekening, penandatangan, or alamatUsaha
  VERIFY:  Playwright `tests/settings-read-leak.spec.js` (new) as trainer opens SettingsModal directly and asserts no bank/penandatangan/alamat text appears in the DOM; superadmin path unchanged; M-A3.2 tests remain green
  DONE-IF: verify passes; only intended files changed
```

## Gate AF-A3 — UX polish

### M-AF3.1 Pre-submit cabangId sanity check

```text
MICROTASK: Pre-submit cabangId sanity check
  EDIT:    src/features/schools/SchoolList.jsx, src/lib/store.js
  FINDS:   AF10
  RULES:   Indonesian copy ("Cabang tidak valid"); one extra early-return before submit
  DEPENDS: M-AF1.3
  OUTCOME: clicking Save with a `cabangId` that does not resolve to a branch in the cached list shows the message "Cabang tidak valid" inline and never reaches the server
  VERIFY:  Playwright `tests/school-form-validation.spec.js` (new) as superadmin selects an invalid cabang via a devtools override and asserts the inline message appears and no /api/sekolah.php request is fired
  DONE-IF: verify passes; only intended files changed
```

## Gate AF-A4 — Multi-account CRUD sync (cross-feature)

Findings AF12–AF16 came out of the round-trip + CRUD audit. They are owned
by `docs/MULTI_ACCOUNT_SYNC.md` (M-MAS1.1 through M-MAS4.2) — see that
document for the planning prose and per-microtask VERIFY criteria. The
microtask ordering and explicit acceptance check are kept here so the gate
order stays contiguous (taste rule #74).

### M-AF4.1 Centralize per-entity `cabangId` policy in `prepareWritePayload`

```text
MICROTASK: Centralize per-entity cabangId policy in prepareWritePayload
  EDIT:    src/lib/store.js, src/features/trainers/TrainerList.jsx
  FINDS:   AF15
  RULES:   per-entity policy mirrors server rules (sekolah.php:46-49, trainer.php:41-43/50-52, siswa.php:21-23, users.php:80-82, honorPayments.php / sppPayments.php / absensi.php requireRecord); M-MAS1.1 owns the switch
  DEPENDS: M-AF3.1
  OUTCOME: writeRemote(key, record) internally invokes prepareWritePayload(key, record, getRoleContext()) before sending the body; admin_cabang sekolah/trainer/users payloads have no `cabangId` key; siswa payloads never have one; the one-off strip in TrainerList.jsx:178-180 is gone
  VERIFY:  vitest src/lib/__tests__/store-payload.test.js passes (11 cases) AND tests/multi-account-crud-sync.spec.js admin_cabang sekolah write with body `cabangId` returns 422 (server-side rule, AF15 server arm)
  DONE-IF: verify passes; only intended files changed
```

### M-AF4.2 Migrate `cabang` create/update/delete + `assignSchool` to `writeRemote`/`deleteRemote`

```text
MICROTASK: Migrate cabang CRUD + assignSchool to writeRemote/deleteRemote
  EDIT:    src/features/admin/BranchManager.jsx
  FINDS:   AF12, AF13
  RULES:   superadmin-only (authorize.php:87 deny-list); preserve forbidden/conflict branches; server-side default-cabang delete-block stays server-authoritative
  DEPENDS: M-AF4.1
  OUTCOME: save() create+update on writeRemote('cabang', prepareWritePayload(...)); doDelete() on await deleteRemote('cabang', id) with forbidden/conflict; assignSchool() on writeRemote('sekolah', ...) with forbidden/conflict; no local-only write()/upsert() for these entities
  VERIFY:  tests/multi-account-crud-sync.spec.js creates two Sim-* branches as superadmin, deletes them in cleanup, and asserts they are gone on the next superadmin read
  DONE-IF: verify passes; only intended files changed
```

### M-AF4.3 Trainer-with-account payload sanitization + cache mirror

```text
MICROTASK: Trainer-with-account sanitize body + adopt server response via pullRemote
  EDIT:    src/features/trainers/TrainerList.jsx
  FINDS:   AF14
  RULES:   prepareWritePayload('users', …) strips cabangId for admin_cabang (matches users.php:80-82); pullRemote('trainer') is the existing best-effort refresh at store.js:487-500; trainer-with-account path only
  DEPENDS: M-AF4.1
  OUTCOME: admin_cabang trainer-with-account request body has no `cabangId` key; superadmin path unchanged; the trainer record reaches the local cache via pullRemote after the server confirms; form.id adopts the server-issued trainer.id
  VERIFY:  tests/multi-account-crud-sync.spec.js admin_cabang trainer-with-account branch assignment lands in the admin's own branch; the captured POST /api/users.php body has no `cabangId` key
  DONE-IF: verify passes; only intended files changed
```

### M-AF4.4 `read.php` echoes the SQL-side `version` so client edits aren't 409'd

```text
MICROTASK: read.php echoes version alongside payload
  EDIT:    server/api/read.php, deploy/api/read.php
  FINDS:   AF16
  RULES:   optimistic concurrency preserved (write-without-version still 409s); no client-side change needed — writeRemote already passes through whatever `version` is on the record
  DEPENDS: M-AF4.2
  OUTCOME: GET /api/read.php?entity=X returns each record with a numeric `version` field merged into its payload; a subsequent UPDATE with that exact `version` succeeds (200) and bumps the server-side version; an UPDATE with `version` missing or stale returns 409 unchanged
  VERIFY:  tests/multi-account-crud-sync.spec.js phases 2, 4, 7 pass (read-back finds the just-created rows with a numeric `version`); probe at C:\Users\barak\AppData\Local\Temp\kilo\probe-crud-e2e.php proves the update-with-version succeeds and update-without-version 409s
  DONE-IF: verify passes; only intended files changed
```

### M-AF4.5 Multi-role CRUD sync E2E spec

```text
MICROTASK: Multi-role CRUD sync Playwright spec
  EDIT:    tests/multi-account-crud-sync.spec.js (new)
  FINDS:   — (new coverage)
  RULES:   taste #2 (deterministic), #7 (role-based locators), #8 (zero pageerror/console.error), #11 (soft-checked probes), #17 (date-aware dynamic), #21 (test name = milestone row label); follows the m1-scope-shell-navigation.spec.js pattern (loginViaApi); cleans up after itself (taste #33); uses 'Sim-' / 'Simulasi-' markers for easy manual cleanup
  DEPENDS: M-AF4.2, M-AF4.3, M-AF4.4
  OUTCOME: single Playwright spec logs in as superadmin, creates two Sim-* branches + their sekolahs + a trainer-with-account bound to branch A; logs in as the seeded admin.cabang@test.local and asserts none of the Sim-* data is visible; asserts admin_cabang cannot smuggle a client `cabangId` (server 422); asserts clean write lands in their own branch; logs back in as superadmin and asserts both branches' data are visible; logs back in as admin and asserts branch-isolation still holds; finally deletes the test branches
  VERIFY:  npx playwright test tests/multi-account-crud-sync.spec.js --workers=1 passes with zero pageerror/console.error; npm test (vitest) remains green; npm run build succeeds
  DONE-IF: verify passes; only intended files changed
```

## Gate AF-A5 — Manual-app-audit follow-ups (2026-09-04)

Source: `docs/log-doc/audit-app-vs-tests_2026-09-04_2249Z.md`. Each microtask closes one or more `F-###` findings from the audit.

### M-AF5.1 Always confirm Sekolah delete

```text
MICROTASK: Always confirm Sekolah delete (no silent delete)
  EDIT:    src/features/schools/SchoolList.jsx
  FINDS:   F-01 (manual audit #008)
  RULES:   RB; mirror the ConfirmDialog pattern at src/components/ConfirmDialog.jsx; do not delete ConfirmDialog usage from existing confirmed flows (Trainer, Student, Cabang, BackupRestore)
  DEPENDS: none
  OUTCOME: deleting a Sekolah (whether or not it has siswa) always opens a ConfirmDialog with `confirmLabel="Hapus"`; the existing re-assign flow at SchoolList.jsx:205-212 / 295-302 keeps its `confirmLabel="Reassign ke sekolah lain"` for the with-siswa case
  VERIFY:  Playwright `tests/sekolah-delete-confirm.spec.js` (new) logs in as superadmin, creates a Sekolah with no siswa, clicks delete, asserts a `role="dialog"` with `Hapus` button is visible, clicks Batal — asserts the row remains, clicks delete again, clicks Hapus, asserts the row is gone; existing stress-simulation and student-delete-absensi specs remain green
  DONE-IF: verify passes; only intended files changed
```

DONE 2026-09-05 — SchoolList.jsx routes the no-siswa branch of `remove()` through a new `ConfirmDialog` (`simpleConfirmOpen`, `confirmLabel="Hapus"`, `danger={true}`) that calls `doDelete(pendingDeleteId)` on confirm. The with-siswa re-assign flow (`confirmOpen`, `confirmLabel="Reassign ke sekolah lain"`) and the existing Trainer/Student/Cabang/BackupRestore ConfirmDialog usages are unchanged. `tests/sekolah-delete-confirm.spec.js` (new) green. `tests/school-list-actions.spec.js` + `tests/school-form-validation.spec.js` remain green. `tests/stress-simulation.spec.js` + `tests/student-delete-absensi.spec.js` failures are pre-existing on the baseline (verified via `git stash`) — recorded as pre-existing carry-over, not a regression.

```

### M-AF5.2 SchoolList cabang dropdown subscribes to store + storage

```text
MICROTASK: SchoolList cabang dropdown subscribes to store + storage
  EDIT:    src/features/schools/SchoolList.jsx
  FINDS:   F-02 (manual audit #017, #018)
  RULES:   mirror the `useBranch()` + `subscribeStore` pattern in src/lib/store.js:589-609; do not introduce a new state library; cross-tab BroadcastChannel is not required — the existing `afterschola_v4_changed` event is sufficient when paired with `window.addEventListener('storage', ...)`
  DEPENDS: M-AF5.1
  OUTCOME: when a Cabang is deleted (in the same tab or another tab) while the user is on Data Sekolah, the Sekolah form's Cabang dropdown refreshes within 1 second without a full page reload
  VERIFY:  Playwright `tests/sekolah-cabang-cache.spec.js` (new) opens Data Sekolah as superadmin in two contexts (same-origin multi-tab via `browser.newContext()`), deletes a Cabang in tab A, asserts tab B's Sekolah form's Cabang `<select>` no longer lists it within 1s of the delete ack; existing r3-verify.spec.js remains green
  DONE-IF: verify passes; only intended files changed
```

### M-AF5.3 Remove siswa.foto from form (privacy, per D-20 = A)

```text
MICROTASK: Remove siswa.foto from form (privacy)
  EDIT:    src/features/students/StudentList.jsx
  FINDS:   F-20 (manual audit #020 second occurrence); D-20 = A
  RULES:   taste #50 (privacy-as-removal); per taste #15 wire the field's removal as the validation guard (no value is collected, so the list-render fallback always shows the placeholder avatar); per taste #11 mirror the existing siswa list avatar pattern at StudentList.jsx:194-200
  DEPENDS: none
  OUTCOME: the SiswaForm no longer renders a Foto label + input; the siswa list still renders the placeholder avatar for every siswa regardless of legacy `foto` data
  VERIFY:  Playwright `tests/siswa-foto-removed.spec.js` (new) opens Data Siswa as superadmin, clicks Tambah Siswa Baru, asserts there is no label or input named/related to Foto; the legacy data assertion (pre-migration) is deferred to M-AF5.4
  DONE-IF: verify passes; only intended files changed
```

### M-AF5.4 One-time migration: siswa.foto → null

```text
MICROTASK: One-time migration: siswa.foto -> null
  EDIT:    server/migrations/<timestamp>-siswa-foto-purge.sql (new), server/bootstrap.php (register migration); src/lib/store.js (add `migrateSiswaFoto()` idempotent helper that runs on hydrate)
  FINDS:   F-20; D-20 = A
  RULES:   taste #35 (idempotent, collision-safe, reference-preserving); per taste #50 the foto field is removed for privacy, but the rest of the siswa record is preserved
  DEPENDS: M-AF5.3
  OUTCOME: every existing siswa row has `foto = null` in its payload; running the migration twice is a no-op (idempotence); no siswa data is lost beyond the foto field
  VERIFY:  SQL test: a temporary test DB seeded with 5 siswa rows (3 with foto, 2 without) is migrated twice; the second run is a no-op; the migrated rows have `JSON_EXTRACT(payload, '$.foto')` null for all 5; existing student-delete-absensi and r3-verify specs remain green
  DONE-IF: verify passes; only intended files changed
```

### M-AF5.5 Diagnose absensi outbox prune path (F-11)

```text
MICROTASK: Diagnose absensi outbox prune path (F-11)
  EDIT:    src/lib/store.js (around line 264 `queueSync`, line 462 `syncPending`); a new test file
  FINDS:   F-11 (manual audit #029, #030)
  RULES:   taste #56 (no fabrication); taste #16 (verification spec persists as a named regression file)
  DEPENDS: none
  OUTCOME: 5 simulated trainer save→sync cycles (via Playwright with the trainer role) do not lose a single absensi record; the new spec asserts the outbox length returns to 0 after each successful sync, and that a 4xx server response keeps the entry in the queue with a `failed` marker
  VERIFY:  Playwright `tests/absensi-outbox-prune.spec.js` (new) logs in as trainer, creates 5 absensi, runs sync 5 times, asserts all 5 records are visible in Riwayat Absensi under `Semua`; then forces a 422 server response and asserts the record remains in the queue and is visible after refresh; existing r3-verify.spec.js and stress-simulation.spec.js remain green
  DONE-IF: verify passes; only intended files changed
```

### M-AF5.6 Write docs/audit-sql-crud walkthrough (F-24)

```text
MICROTASK: Write docs/audit-sql-crud walkthrough
  EDIT:    docs/audit-sql-crud_2026-09-04.md (new)
  FINDS:   F-24 (team's `traverse by hand` ask)
  RULES:   taste #30 (cross-reference findings against docs); per entity, list the create/update/delete SQL path frontend → store.js → server/api/*.php → MySQL, and flag any FK or cascade gap
  DEPENDS: none
  OUTCOME: a single markdown file with one section per entity (cabang, sekolah, trainer, siswa, absensi, sppPayments, honorPayments, invoices, users, settings, audit_log), each section listing the SQL chain and any drift from PRODUCTION_PLAN.md {sect}6 or SCOPE_EXPANSION_PRIVILEGES.md
  VERIFY:  document inspection: every entity has a section, every section cites the file:line of each endpoint and the SQL it issues, every drift is flagged; the F-04 cascade gap (the one we already know about) is captured in the `users` section
  DONE-IF: verify passes; only intended files changed
```

### M-AF5.7 Remediate cascade gaps surfaced by M-AF5.6

```text
MICROTASK: Remediate cascade gaps surfaced by M-AF5.6
  EDIT:    server/api/*.php (any file M-AF5.6 identified)
  FINDS:   F-24 follow-ups
  RULES:   taste #35 (idempotent, reference-preserving); taste #30 (cross-ref docs); taste #50 (privacy)
  DEPENDS: M-AF5.6
  OUTCOME: any cascade gap M-AF5.6 surfaced (beyond F-04, which is in PRODUCTION_MILESTONES.md as D9.1) is remediated with a server-side fix that is idempotent, audit-trailed, and reference-preserving
  VERIFY:  per gap, a Playwright or SQL test asserts the cascade behaves as expected; existing stress-simulation and r3-verify specs remain green
  DONE-IF: verify passes; only intended files changed
```

## Deferred with owners (taste rule #53)

| ID  | Finding | Owner / resolving milestone                    | Why deferred                                                            |
| --- | ------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| AF5 | School cross-branch move  | Data/release, future M-release                 | DF1; UI forbids move, server keeps capability; inverse-link cleanup unbuilt |
| AF8 | Local-cache Export within SettingsModal | Product integration (after M-A3.2 ships) | Already covered by M-A3.2 sidebar gate; verify during M-A3.2 acceptance |
| AF9 | Dead `users.failed_login_count` / `users.locked_until` columns | Platform/auth | DF4; YAGNI per taste #65                                                |
| AF11| Lockout backoff multiplier | Platform/auth | DF4; YAGNI per taste #65                                                |
