# Afterschola Audit Follow-up Plan

Source of truth: the round-trip + CRUD audit (audit report, 2026-09-01) covering the Superadmin → Branch → Admin Cabang → Trainer → logout → re-login flow against the production build. This document is the durable follow-up to `AUDIT_PLAN.md` (which already owns F1–F24). Every finding here carries a stable ID (`AF1`…`AF11`) that `AUDIT_FOLLOWUP_MILESTONES.md` references, so fixes stay traceable end to end.

## 1. Scope and boundary

This plan covers audit items that the round-trip surfaced beyond the original `AUDIT_PLAN.md` register: dead-column code paths, dead test specs, role-gate regressions, delete-cascade gaps, branch-move data-divergence, and test-coverage drift caused by the M-AUTH.5 login migration. It deliberately excludes:

- F1–F24 already owned by `AUDIT_MILESTONES.md`. Where this report restates a finding, it is only to record the current-source check (per taste rule #58 — "verify against the current source").
- New business capability work, which remains under `PRODUCTION_PLAN.md` / `SCOPE_EXPANSION_PLAN.md`.
- Anything that would change an existing production invariant; the stricter of this document and `PRODUCTION_PLAN.md` wins.

## 2. Triage against planning docs (taste rule #30, #31, #68)

Severity matches `AUDIT_PLAN.md`: **P1** blocks or corrupts user work, **P2** wrong behavior or permission drift, **P3** polish/consistency.

### P1 — Broken behavior, dead tests, data-integrity gaps

| ID  | Finding                                                                                   | Current status                                                                                          | Where                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| AF1 | Empty-children Edit button on every school card (no SVG, no `title`, no `aria-label`)     | **Re-confirmed in source** — `SchoolList.jsx:223` has only `onClick` + className                         | `src/features/schools/SchoolList.jsx:223`                                                      |
| AF2 | `tests/flow-simulation.spec.js` clicks non-existent `"Pilih peran Admin/Trainer"`/`"Ganti Peran"` buttons (legacy soft-login picker) | **Re-confirmed** — soft-login picker removed in M-AUTH.5 (`PRODUCTION_MILESTONES.md:94`) | `tests/flow-simulation.spec.js:194,206-207,251-252`                                            |
| AF3 | `tests/ki1-trainer-cabangid.spec.js` still uses the legacy picker (`Pilih peran Admin`)   | **Re-confirmed** — KI-1 was the trainer-cabangId fix; its regression test is broken                       | `tests/ki1-trainer-cabangid.spec.js:26`                                                        |
| AF4 | `siswa` delete leaves orphan `absensi.entries[].siswaId` references; finance/rekap count the deleted student as active | **Re-confirmed** — `StudentList.doRemove()` only `upsert('siswa', filtered)`; sekolah equivalent is acknowledged at `sekolah.php:31-33` but siswa equivalent is undocumented | `src/features/students/StudentList.jsx:80-87`, `server/api/siswa.php`                           |

### P2 — Permission / data-drift gaps

| ID  | Finding                                                                                   | Current status                                                                                          | Where                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| AF5 | `Sekolah.cabangId` mutable by superadmin post-creation; no inverse rewrite of `siswa.cabangId`, `absensi.cabang_id`, trainer denormalized scope → silent branch-move divergence | **Re-confirmed** — server UPDATE at `sekolah.php:99-105` accepts new `cabangId`; no UI exposes this today | `server/api/sekolah.php:99-105`                                                                |
| AF6 | Honor-payment `deleteRemote` is reachable from any caller; UI is gated but server 403 has no UI coverage | **Confirmed safe** — `authorize.php:105-107` denies trainer/admin_cabang; **coverage gap** not a vulnerability | `src/features/payments/PaymentTable.jsx:87-95`, `src/lib/store.js:355`, `server/api/honorPayments.php` |
| AF7 | Settings modal renders global app identity + bank/invoice info to `admin_cabang` and `trainer` (read returns the data; writes blocked) | **Already surfaced** — `tests/stress-simulation.spec.js:381`; not in `PRODUCTION_MILESTONES.md` KI list. Note: this is the same defect class as `AUDIT_PLAN.md` F11 (`AUDIT_MILESTONES.md` M-A3.2). Re-checked against source — the original `BackupRestorePanel` role-gate fix at M-A3.2 already covers `Pengaturan` entry, but **the read-side data still leaks into the form** when the entry is opened via impersonation or a stale local cache. | `src/components/AccountMenu.jsx`, `src/components/SettingsModal.jsx`, `server/api/settings.php:34,66,95-96` |
| AF8 | Backup & Restore entry exposed to every role; local-cache Export never hits the superadmin-only server endpoint | **Already surfaced** — `tests/stress-simulation.spec.js:388`; also `AUDIT_PLAN.md` F12 covered by M-A3.2 for the menu entry. **Residual:** the local-cache Export button is still rendered even after the sidebar entry is hidden, because `BackupRestorePanel` is rendered directly inside `SettingsModal`. Re-checked. | `src/components/BackupRestorePanel.jsx`, `src/components/SettingsModal.jsx`                     |
| AF9 | `users.failed_login_count` and `users.locked_until` columns are dead — read by login.php but never used for gating; real lockout is per-(username,IP) in `login_attempts` | **Re-confirmed** — schema columns unused; per-(user,IP) brute-force from a botnet never trips lockout | `server/schema.sql:25-26`, `server/api/auth/login.php:14,40`, `server/auth/session.php:137-139` |

### P3 — UX, polish, planning-doc drift

| ID  | Finding                                                                                   | Current status                                                                                          | Where                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| AF10| `SchoolList.save()` validates only `nama` client-side; admin_cabang can hand-edit `cabangId` in devtools and only see the generic server 422 message | **Re-confirmed** — server catches at `sekolah.php:47-49`; client never warns                          | `src/features/schools/SchoolList.jsx:51-56`, `server/api/sekolah.php:47-49,78-82`              |
| AF11| Lockout backoff cap doesn't extend: after the 5th failure, continued failures don't grow `locked_until`, but a patient attacker can re-lock every 15 min denying the legitimate user | **Re-confirmed** — `session.php:148-152` uses `IF(failed_count + 1 >= 5, …)` with no backoff multiplier. Per taste rule #65 (YAGNI), this is documented but not implemented in this cycle. | `server/auth/session.php:148-152`                                                              |
| AF12| `cabang` create/update/delete drift across accounts — client uses `write()` (local-only) for create + update; **no `deleteRemote('cabang', id)` path existed** for delete | **Resolved by MULTI_ACCOUNT_SYNC M-MAS2.1/2.2** — superadmin branch create/update already on `writeRemote`; `doDelete()` migrated to `await deleteRemote('cabang', id)` with `forbidden`/`conflict` branches | `src/features/admin/BranchManager.jsx:18,33,179-185`, `src/lib/store.js:219-237,355-370`        |
| AF13| `BranchManager.assignSchool()` reassigns a sekolah to a different branch via `upsert('sekolah', …)` — local-only; server `sekolah.php:99-105` UPDATE path never exercised client-side | **Resolved by MULTI_ACCOUNT_SYNC M-MAS2.3** — `assignSchool()` migrated to `await writeRemote('sekolah', …)` with forbidden/conflict branches; complements AF5 | `src/features/admin/BranchManager.jsx:191`                                                    |
| AF14| Trainer-with-account path sent a stray `cabangId` key in the request body for admin_cabang, plus mirrored the server response back into the local cache via `upsert('trainer', serverTrainer)` | **Resolved by MULTI_ACCOUNT_SYNC M-MAS3.1/3.2** — `prepareWritePayload('users', …)` strips `cabangId` for admin_cabang (matches `users.php:80-82` server rule); `upsert` mirror` replaced with `pullRemote('trainer')`; the one-off strip in `TrainerList.jsx:178-180` removed because `prepareWritePayload` now owns the policy | `src/features/trainers/TrainerList.jsx:94-100,122,178-180`                                     |
| AF15| One-off `delete payload.cabangId` strip in `TrainerList.jsx:178-180` — a workaround for the sekolah.php:46-49 server rule, but the policy belongs in one place, not in feature code | **Resolved by MULTI_ACCOUNT_SYNC M-MAS1.1/1.2** — `prepareWritePayload` is the single owner of the per-entity `cabangId` policy; `writeRemote` routes through it; the strip is deleted | `src/features/trainers/TrainerList.jsx:178-180`, `src/lib/store.js:285-323`                      |
| AF16| `read.php` returns only the payload column, never the SQL-side `version` — client edits on a cold-loaded record always sent `version: undefined`, which `_master.php:111-117` rejected with 409 as a false-positive version conflict | **Resolved by MULTI_ACCOUNT_SYNC M-MAS4.2** — `read.php` SELECT now joins `version` from the master table and merges it into each record's payload, so client-side edits echo the version they read; server-side optimistic concurrency is preserved (update-without-version still 409s) | `server/api/read.php:54-119`, `server/api/_master.php:111-117`                               |

## 3. Cross-reference vs planning docs (taste rule #30, #31, #68)

| ID  | Already planned?        | Where                                                                                                | Disposition in this plan                                |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| AF1 | Not planned (new)       | —                                                                                                    | New microtask M-AF1.1                                   |
| AF2 | Implicit (M-AUTH.5)     | `PRODUCTION_MILESTONES.md:94` notes stress findings F1–F22; spec rot is undocumented                  | New microtask M-AF1.2                                   |
| AF3 | KI-1 was the fix; rot   | `PRODUCTION_MILESTONES.md:443-471` (KI-1 entry, resolved)                                             | Bundled into M-AF1.2                                    |
| AF4 | KNOWN GAP for sekolah; **not** for siswa | `server/api/sekolah.php:31-33` admits the sekolah gap; siswa gap is undocumented           | New microtask M-AF1.3                                   |
| AF5 | Not planned (new)       | —                                                                                                    | Out-of-scope this cycle (server keeps capability; UI forbids move). Documented only.             |
| AF6 | Partial — UI gate exists, server gate exists, test coverage missing | `AUDIT_MILESTONES.md` M-A3.1 covers the UI gate; no test exercises 403    | New microtask M-AF2.1 (test-only)                       |
| AF7 | Partial — M-A3.2 covers the sidebar entry | `AUDIT_MILESTONES.md` M-A3.2                                                      | Resolved by M-A3.2 + new microtask M-AF2.2 (read-side leak) |
| AF8 | Partial — M-A3.2 covers the entry point | `AUDIT_MILESTONES.md` M-A3.2                                                      | Resolved by M-A3.2 (entry hidden ⇒ panel unreachable)    |
| AF9 | Partial — `USER_PROVISIONING.md` mentions lockout at user level | `USER_PROVISIONING.md` (referenced from `PRODUCTION_MILESTONES.md`)                  | Out-of-scope this cycle (YAGNI per taste #65). Documented only. |
| AF10| Not planned (new)       | —                                                                                                    | New microtask M-AF3.1                                   |
| AF11| Not planned (new)       | —                                                                                                    | Out-of-scope this cycle (YAGNI per taste #65). Documented only. |

## 4. Product decisions

These resolve open questions raised by the findings; milestones depend on them.

- **DF1 — School branch-move is operator-only (resolves AF5):** moving a `Sekolah` across branches stays an unsupported operation for this cycle. The server endpoint continues to accept the call (per the existing capability), but no UI exposes it. Inverse-link cleanup (siswa/absensi/trainer) is a separate task and is not implemented now; a future move flow must include it. Per taste rule #67 — drop the topic rather than persist with workarounds.
- **DF2 — `siswa` delete is hard and stays hard (resolves AF4):** per the existing audit, deleted trainers keep their `honorPayments` (append-only ledgers). For students, deletion remains hard, but a successful delete must nullify `absensi.entries[].siswaId` references so that `financialData()` and Rekap no longer count the deleted student. No cascade to `sppPayments` (ledger-immutability rule RD from `AUDIT_PLAN.md`).
- **DF3 — `admin_cabang` branch reassign stays a dead-end (resolves L2 from audit report):** the only path to give an existing `admin_cabang` a different branch is deactivate + recreate. Per taste rule #65 (YAGNI), no reassign flow is added.
- **DF4 — Lockout remains per-(username, IP) (resolves AF9, AF11):** the per-user columns (`users.failed_login_count`, `users.locked_until`) are documented dead code but not removed in this cycle; per-user brute-force protection and backoff multiplication are deferred (YAGNI per taste #65).

## 5. Rules carried into implementation

These reuse the `AUDIT_PLAN.md` rule set (RA–RF) plus one new rule for this cycle.

- **RG — Server contract is authoritative (taste rule #61):** if the backend enforces a rule correctly, the spec item is "solved" even when the frontend is incomplete. The remaining gap is reported as the only carry-over, not double-counted.
- **RH — Privilege boundaries are explicit (taste rule #33):** a new capability is never added by broadening an existing role's authority as a shortcut for a feature specified as restricted to a distinct role.

## 6. Out of scope for this follow-up cycle

- AF5 (school cross-branch move), AF9 (dead `users.*` columns), AF11 (lockout backoff), and DF3 (admin_cabang reassign) are documented only; no implementing microtasks. YAGNI per taste rule #65.
- AF6's coverage gap is filled by a single new test microtask (M-AF2.1); no app code change.
- F1–F24 remain owned by `AUDIT_MILESTONES.md`. This document does not redefine their disposition.
