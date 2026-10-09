# Excel Gap-Close Plan — E1 Penugasan, E2 Ledger, P1 Operasional

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Excel rows 46 (E1), 47 (E2), 50 (P1) with falsifiable verification gates so their Status Revisi `Selesai` is evidence-backed, not claimed.

**Architecture:** Verify-only chain. No new features, no schema changes. Re-run the existing contract suites that own each row and record `Verified:` lines in the companion MILESTONES file.

**Tech Stack:** PHP 8.1+ monolit + MySQL (`server/`), React 19 + Vite + PWA (`src/`), cPanel deploy via `npm run build:deploy`. Roles kanonis 3 (`superadmin, admin_cabang, trainer`).

**Spec:** `docs/EXCEL_DETAIL_PEKERJAAN_REVISI.md` rows 46/47/50 + `docs/exemplar/Sistem (Mobile_keuangan)_REVISI.xlsx` sheet `REVISI Detail Pekerjaan`. This plan argues from that spec; executors read both.

**Status:** OPEN — created for task B. Temporary gate-by-gate fixing plan per taste #40. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, `PENUGASAN_PLAN.md`, `AUTO_PENUGASAN_PLAN.md`, `PENUGASAN_SLOT_PLAN.md`, `COVER_SLOT_PLAN.md`, `DOUBLE_BOOKING_PLAN.md`, `SPP_BILLING_PLAN.md`, `OPERATIONS.md`, or `UNIVERSAL.md`.
**Contract order:** `docs/UNIVERSAL.md` (primary, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` → `docs/PENUGASAN_PLAN.md` + `docs/AUTO_PENUGASAN_PLAN.md` + `docs/PENUGASAN_SLOT_PLAN.md` + `docs/COVER_SLOT_PLAN.md` + `docs/DOUBLE_BOOKING_PLAN.md` → `docs/SPP_BILLING_PLAN.md` → `docs/OPERATIONS.md` → `docs/EXCEL_DETAIL_PEKERJAAN_REVISI.md` + REVISI xlsx → this file.
**Locked inputs (not re-decided here):** Q1(a) bill school + pay substitute (`EXEMPLAR_MIGRATION.md` G4c-2/F13, G5); D2 honor tiers Inti Senior 100k / Inti Newbie 75k / Asisten 50k (`EXEMPLAR_MIGRATION.md` D2); cash-basis D1 kept; 3 roles only (`src/lib/role.js:4`, `server/auth/authorize.php:13`); no bank/payroll/accounting integration by design (row 5 revisi); monolit, bukan microservices (row 9 revisi).

## Global Constraints

- Node ≥ 18, PHP ≥ 8.1 dengan `pdo_mysql,mbstring,json` (`scripts/setup-local.mjs:38-50`).
- `deploy/` generated only via `npm run build:deploy`, never hand-edited (R-RH2).
- No `console.log` in `src/` at handoff; `git status` clean of artifacts (taste #20).
- UI copy Indonesian pinned strings reused verbatim, never reworded.
- Server is authoritative for authz; client is filter-only (taste #61).
- Destructive steps run last; test DB (`afterschola_t3_test`) only, never prod (taste testing #55).
- Every claim recorded as `Verified: <command> -> <result>`; anything not run is `Unverified` (taste #26).

## Review Focus

- Cover session bills school but pays nobody because the gate regressed on HEAD — expect substitute write 201 with link, 403 without.
- Same person double-booked across two hosts at same school+slot+dates passes clean — expect client pre-check + server 422 with pinned copy.
- Correction row accepted but `sync.php` drops `correction_of` (SRS DRIFT-03) — expect latest-wins to diverge after legacy sync.
- Invoice deleted while SPP rows still reference it — expect 422, data preserved.
- Restore drill run against the wrong database name — expect operator to refuse and state the blocker instead of guessing.

---

## 1. Context and inputs

- Excel rows 46/47/50 are NEW (no counterpart in the original 45). Code already implements the underlying behavior (COVER_SLOT DONE 2026-09-27, DOUBLE_BOOKING DONE 2026-09-28, ledger guards + OPERATIONS runbook shipped), but this session has not re-verified them on current HEAD — so the Revisi `Selesai` is currently an inventory claim, not a gated fact.
- E1 (row 46): slot-pick auto-create + cover path + double-booking same/cross-host. Owners: `server/lib/assignments.php:219-251,285-318`, `server/validation/entities.php:61-97,116-150`, `server/auth/authorize.php:57-142`, `src/lib/penugasan.js`, `src/features/penugasan/PenugasanManager.jsx`.
- E2 (row 47): append-only ledgers + `correction_of` + invoice delete guard + optimistic `version` 409. Owners: `server/bootstrap.php:225-249`, `server/api/honorPayments.php:11-39`, `server/api/absensiPengajar.php:21-82`, `server/api/invoices.php:22-51`, `server/api/_master.php:114-120`.
- P1 (row 50): backup JSON + server snapshot + restore transaction + v4-import + reconcile CLI + audit_log. Owners: `server/lib/backupRestore.php:12-161`, `server/api/backup-*.php`, `server/api/restore.php:8-14`, `server/api/v4-import.php:10,44`, `bin/reconcile.php:1-33`, `server/schema.sql:33-46`.
- Known drift to watch (not fix in this chain): SRS DRIFT-03 (`sync.php` drops `absensiPengajar.correction_of`), DRIFT-05 (backup omits `absensiPengajar`), photos excluded from backup (`backupRestore.php:24-34`).

## 2. Goals and non-goals

**Goals**

1. G-E1: penugasan slot-pick + cover + same/cross-host guards re-verified green on HEAD.
2. G-E2: ledger append-only + correction + invoice guard + version-conflict re-verified green on HEAD.
3. G-P1: backup → restore (test DB) + reconcile MATCH + audit trail re-verified green, destructive last.

**Non-goals (stay out of this chain; owners in §8)**

- New penugasan/ledger/operasional features, schema changes, tariff changes.
- ERD diagram (row 10), per-feature flowcharts (row 11), Figma wireframes (row 12).
- Security pentest (row 26), performance/load plan (row 27), browser matrix doc (row 28).
- UAT sign-off sheet (row 30), go-live announcement (row 37), support rota (row 38), maintenance schedule (row 43).
- Bank/gateway/payroll integration (row 5/21 — decided: tetap tanpa).
- Native mobile app (row 19/28/34b — decided: web+PWA only).

## 3. Findings registry (F-EG)

| ID | Finding | Evidence |
|----|---------|----------|
| F-EG1 | Cover path exists but unproven on HEAD: substitute with `coverOf` should 201 where the same write 403s without it. | `COVER_SLOT_PLAN.md` D-CS2; `server/auth/authorize.php:103-142`; `EXEMPLAR_MIGRATION.md` G4c-2/F13 |
| F-EG2 | Cross-host double-booking guard exists but unproven on HEAD: same occupant, same school+slot+dates via two hosts should 422 both layers. | `DOUBLE_BOOKING_PLAN.md` D-DB1/D-DB2; `server/lib/assignments.php:285-318` |
| F-EG3 | Ledger correction rides `correction_of` but legacy `sync.php` drops the field, so latest-wins diverges after sync. | `SRS_INDEX.md` DRIFT-03; `server/api/absensiPengajar.php:52-64` vs `server/lib/backupRestore.php` sync path |
| F-EG4 | Invoice delete guard exists (superadmin + 422 on SPP ref) but unproven on HEAD. | `server/api/invoices.php:22-51` |
| F-EG5 | Backup/restore exists but omits `absensiPengajar` (DRIFT-05) and excludes photos; operator must state the boundary, not silently pass. | `SRS_INDEX.md` DRIFT-05; `server/lib/backupRestore.php:24-34` |
| F-EG6 | Reconcile CLI exists (MATCH/DRIFT signed report) but has no fresh run in this session. | `bin/reconcile.php:1-33` |

## 4. Decision set (D-EG)

| # | Decision | Status |
|---|----------|--------|
| D-EG1 | **Verify-only (concrete pick).** This chain adds zero production behavior. Any red check becomes a bounded follow-up doc entry, never a widened edit in this chain (taste #4/#13). | Locked |
| D-EG2 | **Privilege boundaries frozen (taste #33).** No role is broadened to make a check pass. A 403 that the matrix requires stays 403; the check expectation is fixed, not the gate. | Locked |
| D-EG3 | **Destructive last (taste testing #55).** Read-only suites (validation, protection, unit, build) run before any backup/restore drill; the drill targets the test DB only and runs once at the end. | Locked |

## 5. Rules (R-EG)

- R-EG1: Additive only; no renames of keys, routes, or pinned copy.
- R-EG2: Exact slot-triple equality everywhere; no interval matching (YAGNI, shared with D-CS2/D-PG9/D-DB2).
- R-EG3: No cover link, no pay — genuinely unassigned writes stay 403 (D-CS2 analog).
- R-EG4: `deploy/` untouched; all checks run from `server/` + `src/` + scripts.
- R-EG5: Every microtask ends with `Verified: <command> -> <result>`; unrelated failures labeled pre-existing with stash evidence (taste #9); original acceptance legs re-run before done (taste #10).

## 6. File map

- E1: `server/lib/assignments.php`, `server/validation/entities.php`, `server/auth/authorize.php`, `server/api/trainer.php`, `src/lib/penugasan.js`, `src/features/penugasan/PenugasanManager.jsx`, `src/lib/__tests__/penugasan-slot.test.js`.
- E2: `server/bootstrap.php`, `server/api/_master.php`, `server/api/honorPayments.php`, `server/api/sppPayments.php`, `server/api/absensiPengajar.php`, `server/api/invoices.php`, `server/api/invoices-generate.php`.
- P1: `server/lib/backupRestore.php`, `server/lib/v4Import.php`, `server/api/backup-*.php`, `server/api/restore.php`, `server/api/v4-import.php`, `bin/reconcile.php`, `src/lib/backup.js`, `src/components/BackupRestorePanel.jsx`, `docs/OPERATIONS.md`.

## 7. Gate exit criteria (chain closes when all hold)

1. Cover write with valid link 201s; same write without link 403s (F-EG1 closed, D-CS2/D-EG2).
2. Cross-host occupant overlap 422s server-side with pinned copy and is pre-checked client-side; cover pairs never block (F-EG2 closed, D-DB1/D-DB2).
3. Ledger correction appends (no inline edit); invoice delete with SPP ref 422s; version conflict 409s (F-EG3/F-EG4 closed).
4. Backup → restore round-trips on the test DB; reconcile reports MATCH (or DRIFT with a named owner); audit rows written (F-EG5/F-EG6 closed, D-EG3).
5. `npm test` + `npm run build` green; unrelated failures labeled pre-existing with stash evidence.
6. §10 write-back recorded: Revisi rows 46/47/50 flipped to gated-`Selesai` with command evidence, or left `On Progress` with the exact red owner.

## 8. Deferred with owners (not duplicated here)

| Item | Owner doc | Excel row |
|------|-----------|-----------|
| ERD diagram | `server/schema.sql` → new diagram task | 10 |
| Per-feature flowcharts | new flowchart task | 11 |
| Figma/wireframes | row 12 decision (no new Figma) | 12 |
| Security pentest harness | `PRODUCTION_PLAN.md` §7 → new task | 26 |
| Perf/load plan | new task | 27 |
| Browser+PWA matrix | new task | 28 |
| UAT sign-off sheet | `CLIENT_ROUND_PLAN.md` → sign-off task | 30 |
| Go-live announcement | new template task | 37 |
| Support rota | `OPERATIONS.md` §4 → rota task | 38 |
| Maintenance schedule | new schedule task | 43 |

## 9. Verification commands (run from repo root)

```text
php server/tests/entity.validation.php
php server/tests/endpoint.protection.php
npx vitest run src/lib/__tests__/penugasan-slot.test.js
npm test
node scripts/run-contract-battery.cjs
npm run build
php server/tests/reconcile.check.php
```

(Ruling 2026-10-07, Gate G-P1: §9 previously cited `php bin/reconcile.php --help` — wrong path. Real CLI is `server/bin/reconcile.php` and it requires a `<v4-export.json>` argument with no `--help` flag; the sanctioned executable proof is the `reconcile.check.php` harness. Cost if wrong: none — harness output recorded verbatim on the milestone lines.)

## 10. Write-back (when gates close)

1. Append one closure row per gate to `docs/SCOPE_EXPANSION_MILESTONES.md` (Gate EG) + mark rows 46/47/50 in `docs/EXCEL_DETAIL_PEKERJAAN_REVISI.md` gated-`Selesai` with the `Verified:` lines, or keep `On Progress` naming the red check + owner.
2. Record findings owned elsewhere into §8 (already done) rather than duplicating them here (taste #53).
3. Keep this pair as the temporary gate doc (taste #40); do not expand the long-term roadmap files with its microtasks.
