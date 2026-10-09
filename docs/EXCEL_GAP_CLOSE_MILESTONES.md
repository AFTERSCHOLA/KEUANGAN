# Excel Gap-Close Milestones — Microtask Chain (G-E1 → G-P1)

**Companion to `docs/EXCEL_GAP_CLOSE_PLAN.md`.** Decomposes Excel rows 46 (E1), 47 (E2), 50 (P1) into strictly ordered verification microtasks. Each microtask must VERIFY before the next begins; a failing check becomes a bounded follow-up entry, not a widened edit (taste #3/#4). No app code changes in this pair yet — this chain is the build order for implementers.

**Source of truth for findings/decisions:** `EXCEL_GAP_CLOSE_PLAN.md` §3 (F-EG1–F-EG6) and §4 (D-EG1–D-EG3) + §5 (R-EG1–R-EG5). The chain below does not restate plan prose; each `FINDS`/`RULES` line cites the registry. Violated invariant for the whole chain (taste bug rule, one hypothesis): *rows 46/47/50 claim Selesai but have no fresh HEAD evidence — F-EG1/F-EG2/F-EG4 unproven, F-EG3/F-EG5 drift open, F-EG6 never run*; G-E1–G-P1 is the single slice that tests it.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s) — docs only unless a red check forces a follow-up>
  FINDS:   <F-EG references>
  RULES:   <R-EG codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all hold):**

1. Cover write with valid link 201s; same write without link 403s (F-EG1 closed).
2. Cross-host occupant overlap 422s with pinned copy both layers; cover pairs never block (F-EG2 closed).
3. Ledger corrections append-only; invoice delete with SPP ref 422s; version conflict 409s (F-EG3/F-EG4 closed).
4. Backup → restore round-trips on test DB; reconcile MATCH (or named-owner DRIFT); audit rows written (F-EG5/F-EG6 closed, D-EG3 destructive-last).
5. `npm test` + `npm run build` green; unrelated failures labeled pre-existing with stash evidence (taste #9); original acceptance legs re-run before done (taste #10).
6. Every microtask carries `Verified: <command> -> <result>`; §10 write-back recorded; no `console.log` in `src/`, no build artifacts in `git status`.

---

## Gate G-E1 — Penugasan verification (row 46; F-EG1/F-EG2; D-CS2/D-DB1 via D-EG1)

### G-E1.1 Re-prove cover path

```text
MICROTASK: Re-prove cover path
  EDIT:    docs/EXCEL_GAP_CLOSE_MILESTONES.md (append Verified line only)
  FINDS:   F-EG1; D-EG1, D-EG2
  RULES:   R-EG3, R-EG4, R-EG5; no cover link, no pay (403 preserved); coverOf immutable
  DEPENDS: none (COVER_SLOT CS.A–CS.C green is the entry assumption; if red, stop and re-plan per taste drift rule)
  OUTCOME: a substitute with a valid coverOf link writes absensiPengajar where the same write without the link is rejected.
  VERIFY:  php server/tests/entity.validation.php + php server/tests/endpoint.protection.php -> cover with valid origin validates/passes; dangling or foreign coverOf rejected; unassigned trainer write still 403
  DONE-IF: verify passes; only intended files changed
```

  G-E1.1 → Verified: php server/tests/entity.validation.php + php server/tests/endpoint.protection.php -> 15 checks passed (exit 0) + 275 checks, 0 failed (exit 0)

### G-E1.2 Re-prove double-booking guards

```text
MICROTASK: Re-prove double-booking guards
  EDIT:    docs/EXCEL_GAP_CLOSE_MILESTONES.md (append Verified line only)
  FINDS:   F-EG2; D-EG1, D-EG2
  RULES:   R-EG1, R-EG2, R-EG4, R-EG5; exact triple equality; cover-linked pairs never block either direction; branch authority session-only
  DEPENDS: G-E1.1
  OUTCOME: same occupant on same school+slot+overlapping dates via two hosts is rejected client-side and server-side while legal covers pass.
  VERIFY:  npx vitest run src/lib/__tests__/penugasan-slot.test.js + php server/tests/entity.validation.php -> occupant overlap rejected with pinned copy; cover-origin pair ignored; unscoped fans out; legacy unscoped accepted
  DONE-IF: verify passes; only intended files changed
```

  G-E1.2 → Verified: npx vitest run src/lib/__tests__/penugasan-slot.test.js + php server/tests/entity.validation.php -> 12 passed (exit 0) + 15 checks passed (exit 0)

---

## Gate G-E2 — Ledger verification (row 47; F-EG3/F-EG4)

### G-E2.1 Re-prove append-only corrections

```text
MICROTASK: Re-prove append-only corrections
  EDIT:    docs/EXCEL_GAP_CLOSE_MILESTONES.md (append Verified line only)
  FINDS:   F-EG3; D-EG1
  RULES:   R-EG1, R-EG4, R-EG5; INSERT-only ledgers; correction via correction_of negative entry, never inline edit; version 409 on master writes
  DEPENDS: G-E1.2
  OUTCOME: honor/spp/absensiPengajar corrections append new rows and history stays byte-identical except the correction leg.
  VERIFY:  php server/tests/entity.validation.php + node scripts/run-contract-battery.cjs -> correction_of accepted with matching trainer/sekolah scope; mismatched scope rejected; update-in-place rejected; version conflict 409
  DONE-IF: verify passes; only intended files changed
```

  G-E2.1 → Verified: php server/tests/entity.validation.php + node scripts/run-contract-battery.cjs -> 15 checks passed (exit 0) + test:server ALL 18 OK (exit 0; endpoint.protection 275 checks, 0 failed)
  G-E2.1 → Boundary (unproven at HEAD, follow-up): ledger update-reject; stale-version 409; correctionOf mismatch 422

### G-E2.2 Re-prove invoice guard

```text
MICROTASK: Re-prove invoice guard
  EDIT:    docs/EXCEL_GAP_CLOSE_MILESTONES.md (append Verified line only)
  FINDS:   F-EG4; D-EG1, D-EG2
  RULES:   R-EG1, R-EG4, R-EG5; superadmin-only delete; 422 when any spp_payments.payload.invoiceId references the invoice
  DEPENDS: G-E2.1
  OUTCOME: deleting a referenced invoice is refused with data preserved while deleting an unreferenced draft succeeds.
  VERIFY:  php server/tests/endpoint.protection.php -> referenced-invoice delete 422; unreferenced delete path gated superadmin-only; admin_cabang write denied
  DONE-IF: verify passes; only intended files changed
```

  G-E2.2 → Verified: php server/tests/endpoint.protection.php -> 275 checks, 0 failed (exit 0)
  G-E2.2 → Boundary (unproven at HEAD, follow-up): referenced-invoice 422

---

## Gate G-P1 — Operasional verification (row 50; F-EG5/F-EG6; D-EG3 destructive-last)

### G-P1.1 Run reconcile + audit check (read-only)

```text
MICROTASK: Run reconcile plus audit check
  EDIT:    docs/EXCEL_GAP_CLOSE_MILESTONES.md (append Verified line only)
  FINDS:   F-EG6; D-EG1
  RULES:   R-EG4, R-EG5; read-only CLI; signed report under private/reports
  DEPENDS: G-E2.2
  OUTCOME: the v4-export vs DB comparison reports MATCH, or DRIFT with a named owner and counts.
  VERIFY:  php server/tests/reconcile.check.php -> 18 checks incl. MATCH + 2 named DRIFTs (CLI real path server/bin/reconcile.php, requires <v4-export.json>)
   DONE-IF: verify passes; only intended files changed
```

  G-P1.1 → Verified: php server/tests/reconcile.check.php -> 18 checks, 0 failed (exit 0): MATCH probe exit 0 + sha256-signed report under private/reports, spp-drill + invoice-flip probes exit 1 naming sppPayments:spp-rct-1 / invoices:inv-rct-1 (brief `bin/reconcile.php` = server/bin/reconcile.php; bare/--help -> exit 2 usage, requires <v4-export.json>)

### G-P1.2 Drill backup restore last (destructive)

```text
MICROTASK: Drill backup restore last
  EDIT:    docs/EXCEL_GAP_CLOSE_MILESTONES.md (append Verified line + OPERATIONS §3 drill log reference)
  FINDS:   F-EG5; D-EG1, D-EG3
  RULES:   R-EG4, R-EG5; test DB (afterschola_t3_test) only, never prod; photos-excluded + absensiPengajar-omitted boundaries stated explicitly
  DEPENDS: G-P1.1 (all read-only gates green first)
  OUTCOME: a server snapshot restores into the test database and the app reads it back, with the photo/omission boundary logged.
  VERIFY:  npm run db:reset + backup-create + restore on test DB + npm test + npm run build -> restore round-trips; reads match; suite green (or red owned explicitly with stash evidence)
  DONE-IF: verify passes; only intended files changed
```

  G-P1.2 → Verified: npm run db:reset + POST /api/backup-create.php + POST /api/restore.php (test DB afterschola_t3_test) + npm test + npm run build -> BEFORE=AFTER {cabang:1,trainer:2,sekolah/siswa/absensi/spp/honor/invoices/settings 0}; backup 200 bkp-20261007-104301-f1334e3; restore 200 counts identical; audit backup_created + data_restored; npm test 49 files/322 passed (exit 0); build green (exit 0)
  G-P1.2 → Boundary (by code contract, server/lib/backupRestore.php:12-34): photos-excluded (photo_uploads rows + private/uploads/ bytes never in snapshot) + absensiPengajar-omitted (absensi_pengajar table not in BACKUP_ENTITY_TABLES); users/audit_log also never touched; drill log .superpowers/sdd/EXCEL_GAP_CLOSE_PLAN/gate-G-P1-report.md (OPERATIONS §3)

---

## Write-back record (§10 of PLAN)

- [x] G-E1 closed: row 46 gated-`Selesai` (cover 201/403 + double-booking 422 proven, review clean).
- [x] G-E2 closed as scoped: row 47 stays `On Progress` — positive legs proven, 4 legs parked (referenced-invoice 422, ledger update-reject, stale-version 409, correctionOf mismatch 422) as follow-up endpoint.protection legs.
  - [x] G-E2-FU follow-up (2026-10-07): 4 legs implemented as 14 `EG2-FU` checks (`endpoint.protection.php:1672-1745`), 289 checks 0 failed + battery ALL 18 OK. Row 47 flipped to gated-`Selesai`. Parked Medium finding: version-less `sekolah.php` update path (lost-update) — follow-up.
- [x] G-P1 closed: row 50 gated-`Selesai` within stated boundaries (reconcile 18/18, restore BEFORE=AFTER, suite+build green).
- [x] Closure row appended to `docs/SCOPE_EXPANSION_MILESTONES.md` (Gate EG) + `docs/EXCEL_DETAIL_PEKERJAAN_REVISI.md` statuses updated (closure section below).
