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

## Deferred with owners (taste rule #53)

| ID  | Finding | Owner / resolving milestone                    | Why deferred                                                            |
| --- | ------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| AF5 | School cross-branch move  | Data/release, future M-release                 | DF1; UI forbids move, server keeps capability; inverse-link cleanup unbuilt |
| AF8 | Local-cache Export within SettingsModal | Product integration (after M-A3.2 ships) | Already covered by M-A3.2 sidebar gate; verify during M-A3.2 acceptance |
| AF9 | Dead `users.failed_login_count` / `users.locked_until` columns | Platform/auth | DF4; YAGNI per taste #65                                                |
| AF11| Lockout backoff multiplier | Platform/auth | DF4; YAGNI per taste #65                                                |
