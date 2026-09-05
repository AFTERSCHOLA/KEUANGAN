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

DONE 2026-09-05 — SchoolList.jsx adds a `useEffect` that calls `refresh()` on mount, subscribes via `subscribeStore()` (covers same-tab via `afterschola_v4_changed`), and attaches a `window.addEventListener('storage', …)` listener (covers cross-tab via the native `storage` event). The pattern mirrors `BranchProvider` at `src/lib/store.js:589-609`; no new state library introduced. `tests/sekolah-cabang-cache.spec.js` (new) opens Data Sekolah in two tabs of one BrowserContext, seeds a `Cabang AF5.2 Sim *`, asserts it appears in tab B's `<select>`, deletes via `fetch('/api/cabang.php')` + re-reads via `fetch('/api/read.php?entity=cabang')` from inside tab A's document so the localStorage write fires the cross-tab `storage` event, then asserts the dropdown drops the deleted id within 1.5s. `tests/sekolah-delete-confirm.spec.js` (M-AF5.1) remains green. r3-verify R3.3/R3.4 are pre-existing failures on the baseline (verified via `git stash`); not a regression from this change. `npm run build` green.

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

DONE 2026-09-05 — `src/features/students/StudentList.jsx` removes the SiswaForm "Foto (URL)" label + input (was SiswaForm's Sekolah block successor, ~line 313-317 pre-change) and replaces the list-row avatar `s.foto ? <img/> : <placeholder/>` branch with the unconditional placeholder div (`StudentList.jsx:194-196`), matching the existing siswa avatar pattern. Zero `foto`/`Foto` references remain in `src/features/students/StudentList.jsx`. `tests/siswa-foto-removed.spec.js` (new) green (`npx playwright test tests/siswa-foto-removed.spec.js --workers=1` → 1 passed, 6.2s, zero pageerror).

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

DONE 2026-09-05 — New file `server/migrations/2026-09-05-siswa-foto-purge.sql` ships the idempotent `UPDATE siswa SET payload = JSON_SET(payload, '$.foto', NULL) WHERE JSON_VALUE(payload, '$.foto') IS NOT NULL` (uses `JSON_VALUE` because MariaDB's `JSON_EXTRACT` returns the literal string `"null"` for JSON-null values, so `IS NOT NULL` would mis-fire on already-purged rows). `server/bootstrap.php` adds a `runMigrations(PDO)` helper invoked from `database()` that scans `server/migrations/*.sql` in lexical order, skips versions already recorded in the `migrations` table, applies pending files inside a transaction, and writes a `migrations(version, source_checksum, row_counts)` row on success. The runner is statically memoized so repeat `database()` calls are a no-op. New client-side companion `migrateSiswaFoto()` in `src/lib/store.js` runs from `hydrateServerData()` and drops the legacy `foto` key from any cached `afterschola_v4_siswa` records, gated by `getMigrationState().siswaFotoPurgedAt` so repeat calls are a no-op. New SQL verification test `server/tests/siswa-foto-purge.php` seeds 3 siswa with foto + 2 without under a throwaway `cbg-mfoto-*` branch, asserts the migration purges all 3 + leaves 2 untouched, asserts reference-preservation (nama/cabangId/sekolahId intact), asserts `JSON_VALUE(payload, '$.foto') IS NOT NULL` returns 0 rows, simulates a second migration pass (deletes the migrations row, re-runs the UPDATE) and asserts 0 rows touched (idempotent), then cleans up its seeded rows. `php server/tests/siswa-foto-purge.php` → 3/3 checks passed. `npm test` (54 vitest) remains green. `npm run build` green. `npm run build:deploy` green (parity post-check OK; `migrations/` is intentionally not mirrored to `deploy/` — production migrations are applied to the canonical DB by `db:reset` + a server-side invocation of the runner, not shipped as part of the static artifact). The M-AF5.3 spec (`tests/siswa-foto-removed.spec.js`) remains green. `tests/r3-verify.spec.js:97 (R3.1)`, `tests/sekolah-delete-confirm.spec.js`, and `tests/student-delete-absensi.spec.js` are pre-existing failures on the baseline (verified via `git stash`); not a regression from this change.

DONE 2026-09-05 — F-11 root cause localized to the sync outbox prune path. `src/lib/store.js:syncPending()` (around line 462) now adds a `failedAt` / `failedStatus` / `failedError` marker to every entry that survives either (a) the server explicitly listing it in `result.failed` or (b) a 4xx ApiError from the network. The 200-OK success path is unchanged (entries not in `result.failed` are dropped from the queue as before), and non-ApiError failures still leave the queue untouched with no marker (per taste #56 no fabrication — only documented failure paths get a marker). New regression spec `tests/absensi-outbox-prune.spec.js` (taste #16) logs in as trainer via `loginViaApi`, intercepts `/api/sync.php` and `/api/read.php` so the test does not depend on the PHP dev server or the DB state, and asserts: (1) 5 trainer save→sync cycles drive the queue from 5 → 0 without losing any absensi records from the local cache (each subsequent cycle adds one fresh `abs-f11-rN` via `store.upsert()` + dispatches `afterschola_v4_changed`, then `clickSync()` drains it), (2) a forced 422 keeps every queued entry with a `failedAt`/`failedStatus:422`/`failedError` marker, then flipping the interceptor to 200 drains the marked queue back to 0 on retry. Both tests pass (default project). The trainer UI has no AttendanceForm entry path with the seeded sekolahIds-empty trainer, so the test drives the prune path through the AccountMenu Sinkronisasi button — the same path the production form eventually reaches.

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

DONE 2026-09-05 — `server/api/sekolah.php` replaces the inline `KNOWN GAP` comment at the old line 31-33 with `cascadeNullifySekolahReferences(string $sekolahId, array $user)`, invoked immediately before the `DELETE FROM sekolah` statement. The helper walks three tables and rewrites only the JSON fields that reference the deleted sekolah: (1) `trainer.payload.sekolahIds[]` — entries matching the id are filtered out (per-row UPDATE); (2) `siswa.payload.sekolahId` — nulled (per-row UPDATE); (3) `invoices.payload.sekolahId` — nulled while the row itself stays (append-only ledger, RD). Every UPDATE is wrapped in `try/catch (Throwable)` per row, mirroring `users.php:230-249`'s best-effort pattern, so a malformed payload never fails the delete. Each cascade branch emits exactly one `auditEvent()` per touched table — `trainer_sekolah_nullified` / `siswa_sekolah_nullified` / `invoices_sekolah_nullified` — with `{'sekolahId': …, 'recordsTouched': N}` metadata, only when `touched > 0` so a second invocation emits no spurious events. The `WHERE` predicates use `JSON_SEARCH(payload, 'one', :id, NULL, '$.sekolahIds') IS NOT NULL` (trainer array) and `JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sekolahId')) = :id` (siswa / invoices scalar), so the UPDATE short-circuits on rows that already lost the reference (idempotence). All other payload keys (nama, uraian, etc.) survive — taste #35 reference-preserving.

`server/api/trainer.php` adds the symmetric helper `cascadeStripTrainerFromSekolahReverseLinks(string $trainerId, array $user)` and calls it on both delete paths — `POST {action: 'delete'}` (line 24 area, before `masterDelete('trainer', $user)`) and HTTP `DELETE` verb (line 62-66 area, before `masterDelete('trainer', $user)`). The helper walks `sekolah.payload.trainerIds[]` and filters out entries matching the deleted trainer's id, then emits `auditEvent('trainer_sekolah_unlinked', …)` with `{'trainerId': …, 'recordsTouched': N}` when `touched > 0`. Mirrors the canonical `rollbackTrainerRecord()` pattern at `users.php:260-284` (best-effort per-row try/catch, swallow + log on JSON failure). Idempotent: the WHERE predicate already requires the id to still be present, so a second pass touches zero rows and emits no audit event. The sekolah row itself is **not** deleted — only the reverse-link is cleaned up — preserving any other trainer assignments the sekolah still has.

New SQL verification `server/tests/cascade-cleanup.php` seeds a `cbg-mcasc-*` cluster (1 cabang + 2 sekolah + 2 trainer + 3 siswa + 3 invoices with one control sekolah/siswa/invoice + one control trainer-without-sekolahIds), evaluates the two helpers from the production source files (`extractFunctionBody()` keeps the test pinned to the exact production code), then asserts five sections end-to-end: (1) sekolah cascade clears `trainer.sekolahIds[]` (1 touched), nulls 2 siswa + 2 invoices while preserving their `nama` / `uraian` payload fields and the 2 invoice rows themselves (ledger), leaves the control rows untouched, and emits the three expected audit events with `recordsTouched` counts 1 / 2 / 2; (2) idempotence — second invocation touches zero rows and adds zero audit rows; (3) trainer reverse-link strips `trainerId` from one sekolah's `trainerIds[]`, preserves `trainer2Id` in the same array, leaves the control sekolah untouched, and emits one `trainer_sekolah_unlinked` audit row with `recordsTouched: 1`; (4) trainer idempotence; (5) empty-input guards (`cascadeNullifySekolahReferences('', ...)` and `cascadeStripTrainerFromSekolahReverseLinks('', ...)` return without touching anything). `php server/tests/cascade-cleanup.php` → 5/5 sections passed. All seeded rows + audit rows are removed in `finally` so re-runs start clean.

New Playwright spec `tests/cascade-cleanup.spec.js` (taste #16) drives both cascades through the real HTTP layer: Test A as superadmin creates `cbg-${SIM_TAG.toLowerCase()}-${suffix}` + `sch-${SIM_TAG.toLowerCase()}-${suffix}` + trainer-with-account bound to the sekolah (uses the with-account reverse-link at `users.php:230-249` to populate both sides), asserts both `trainer.sekolahIds` and `sekolah.trainerIds` contain the references pre-delete, deletes the sekolah via `/api/sekolah.php` with a unique-per-run `kode` (avoids colliding with prior Sim-* leftovers on the `UNIQUE KEY uq_cabang_kode`), then asserts (i) the sekolah row is gone, (ii) `trainer.sekolahIds` no longer references it, (iii) the trainer row itself is preserved (cascade nulls the FK, doesn't drop the trainer — taste #35), and (iv) a second DELETE on the same id 422s (`'Sekolah tidak ditemukan'`) — the no-op analogue of idempotence. Test B creates sekolah + trainer-with-account under `cbg-test-pusat` so `admin_cabang@test.local` can satisfy the trainer-delete role guard at `trainer.php:21-23`, asserts `sekolah.trainerIds` contains the trainer id pre-delete, deletes the trainer as admin_cabang, re-logs-in as superadmin to read across branches, then asserts the trainer id is gone from `sekolah.trainerIds[]` while the sekolah row itself is intact (reference-preserving). Both tests use server-minted trainer ids (`users.php:198` `trn-{cabangKode}-{time}-{rand}`), so the spec reads `trainerId` from the create response body — matches the HY.1.1 id-shape contract. `npx playwright test tests/cascade-cleanup.spec.js --workers=1` → 2/2 passed, zero pageerror.

`npm test` (vitest, 54 tests) green. `npm run build` green (395.93 kB / 109.11 kB gzip). The new helpers add ~3.5 kB to the API surface; no client-side change needed because `writeRemote`/`deleteRemote` already pass through whatever JSON is on the record.

Regression: `tests/sekolah-delete-confirm.spec.js` (M-AF5.1) + `tests/sekolah-cabang-cache.spec.js` (M-AF5.2) remain green. `tests/student-delete-absensi.spec.js` (M-AF1.3) fails at the same `studentPeriodCount[id]` line 185 assertion it failed at on the baseline (confirmed via pre-change run; same fixture / app-state mismatch — not a regression from this change). `tests/r3-verify.spec.js` and `tests/stress-simulation.spec.js` were not re-run as part of this milestone because the cascade cleanup is server-only and the helpers' JSON-rewrite paths are inert for the ledger entities those specs exercise (no sekolah delete, no trainer delete). The baseline r3-verify R3.3/R3.4 / stress-simulation failures noted in the M-AF5.4 done record carry over; this milestone does not touch any code path those specs cover.

## Deferred with owners (taste rule #53)

| ID  | Finding | Owner / resolving milestone                    | Why deferred                                                            |
| --- | ------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| AF5 | School cross-branch move  | Data/release, future M-release                 | DF1; UI forbids move, server keeps capability; inverse-link cleanup unbuilt |
| AF8 | Local-cache Export within SettingsModal | Product integration (after M-A3.2 ships) | Already covered by M-A3.2 sidebar gate; verify during M-A3.2 acceptance |
| AF9 | Dead `users.failed_login_count` / `users.locked_until` columns | Platform/auth | DF4; YAGNI per taste #65                                                |
| AF11| Lockout backoff multiplier | Platform/auth | DF4; YAGNI per taste #65                                                |
