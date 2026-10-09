# Docs Index — start here, link by file (never by line range)

**Goal:** any newcomer or agent finds the authoritative source in under 2 minutes without reading all 79 files.

**Falsifiable check:** every `*.md` directly under `docs/` appears at least once below (80/80 incl. this file; canonical section owns it, cross-refs allowed); every file-link resolves; this change adds only `docs/README.md` (no moves, no edits to other files).

**Rule (taste #39/#52/#69):** paired `*_PLAN.md` + `*_MILESTONES.md` stays paired and self-contained. This index links by **file**, never by `Line X-Y` — line ranges shift on every edit; `file:line` evidence lives inside the files themselves (taste #11/#45/#59).

**Decision 2026-10-07:** keep flat + README as the ordering layer (no moves/renames). Rationale: ~597 in-file `docs/*.md` refs assume flat paths; moves require bulk edits (taste #8). Revisit only per §C when a chain closes with write-back recorded.

## Read-first order (per taste: UNIVERSAL first, foremost)

1. `UNIVERSAL.md` — primary contract, checklist + verification language (`Verified:/Changed:/Unverified:/Remaining:`).
2. `IMPLEMENTATION_PLAN.md` — working roadmap (supersedes `PLANNING.md`; on conflict this wins over `PLANNING.md`).
3. `SCOPE_EXPANSION_PLAN.md` + `SCOPE_EXPANSION_MILESTONES.md` + `SCOPE_EXPANSION_PRIVILEGES.md` — scope-expansion first-reads for multi-branch work.
4. `SRS_INDEX.md` — read-only FR/NFR/C index of what the system does (no fixes here).
5. Task-specific pair below — then code.

## A. Authoritative — keep top-level, read often

| File | What it is | Status |
|------|------------|--------|
| `UNIVERSAL.md` | Primary guardrails contract | Living |
| `IMPLEMENTATION_PLAN.md` | Working roadmap, 5 tracks | Living |
| `SCOPE_EXPANSION_PLAN.md` | Scope-expansion roadmap (wins over IMPLEMENTATION on expansion intent) | Living |
| `SCOPE_EXPANSION_MILESTONES.md` | Expansion microtask chains M5-M7 | Living |
| `SCOPE_EXPANSION_PRIVILEGES.md` | Executable role privilege matrix | Living |
| `SRS_INDEX.md` | FR/NFR/C + DRIFT ledger, record-only | Living |
| `FEATURE_SLICES_PLAN.md` | 8-item request roadmap index (2026-10-03) | Roadmap-as-index |
| `FROZEN_SCOPE.md` | Jadwal/Kalender/Notif/Bell frozen 2026-10-05 | Scope guard |
| `DEFERRED_ITEMS.md` | Parked items with owner + status, synced 2026-10-03 | Living registry |
| `RUN_LOCALLY.md` | Run locally for everyone (Node 18+ + XAMPP) | Living |
| `LOCAL_SETUP.md` | `npm run setup` one-command setup | Implemented |
| `CONFIG.md` | `server/config.php` env-driven, safe to commit | Implemented |
| `DEPLOY_BUNDLE.md` | `deploy/` is generated via `scripts/build-deploy.cjs`, never hand-edited | Implemented |
| `DEPLOY_GUIDE_CPANEL.md` | cPanel step-by-step + login-500 matrix (companion to OPERATIONS) | Living |
| `OPERATIONS.md` | Operator runbook: deploy/rotate/backup/restore/incident/rollback | Implemented (RH.E.1) |
| `DATABASE_ERD.md` | ERD generated from `server/schema.sql:1-247` (19 tables), 2026-10-07 | Generated truth |
| `API_INTEGRATION.md` | Other-division guide: cookie+CSRF today, Bearer Gates AA.A-AA.D planned | Updated 2026-10-01 |
| `GO_LIVE_CHECKLIST.md` | Release-day execution page (Excel rows #37/#38) | Checklist |
| `PLANNING.md` | Original bug-fix plan (Projects.tsx era); audit record only, superseded by IMPLEMENTATION_PLAN | Historical — do not extend |

## B. Active temp chains — taste #40 (separate from roadmap, fold on close)

Each pair states its own `Status` + `Position: does NOT replace` + write-back section. Trust the header inside the file.

| Pair / file | Outcome | State per header |
|-------------|---------|------------------|
| `AUTH_API_PLAN.md` + `AUTH_API_MILESTONES.md` | Hybrid-Opaque cookie + Bearer (login/me/attendance done, AA.D gist open) | IN PROGRESS 2026-10-01 |
| `AUTO_PENUGASAN_PLAN.md` + `AUTO_PENUGASAN_MILESTONES.md` | Assignment auto-create + manager completion | DRAFT 2026-09-25 |
| `DRIFT_CLOSE_PLAN.md` + `DRIFT_CLOSE_MILESTONES.md` | Sync-queue drop + D2/D3b/D4 + full E2E | DRAFT 2026-09-27 |
| `EVAL_FINANCE_PLAN.md` + `EVAL_FINANCE_MILESTONES.md` | Honor Payable vs Payment + generator upgrade | DRAFT 2026-09-26 |
| `PENUGASAN_SLOT_PLAN.md` + `PENUGASAN_SLOT_MILESTONES.md` | Per-assignment HARI/JAM scope | DRAFT 2026-09-24 |
| `EXCEL_GAP_CLOSE_PLAN.md` + `EXCEL_GAP_CLOSE_MILESTONES.md` | Excel rows 46/47/50 evidence-backed Selesai | Gates open |
| `EXCEL_BACKLOG_TRIAGE.md` | Genuinely-missing rows → one slice each | Triage |
| `EXCEL_DETAIL_PEKERJAAN_REVISI.md` | 51 Excel rows conformed to web codebase | Paste-ready |
| `EVALUATION_LOG.md` | Q1-Q8 finals on EXEMPLAR_MIGRATION | Record |
| `EXEMPLAR_MIGRATION.md` | Ground-truth run log G0+G1 (`docs/exemplar/` authoritative) | Living ground truth |
| `EXEMPLAR_F6_CONFIRM.md` | School-name alias checklist | OPEN, awaiting owner sign-off |
| `REMEMBER_ME_PLAN.md` | Persistent login opt-in (D-RM1-D-RM5) | APPROVED 2026-09-28 |
| `MULTI_ACCOUNT_SYNC.md` | Every CRUD via server, per-entity cabangId policy | Implementation pending |
| `TRAINER_CABANGID_SESSION_AUTHORITY.md` | Trainer `cabangId`, session as authority | Implementation in progress |
| `USER_PROVISIONING.md` | Branch + trainer onboarding flow | Implementation in progress |
| `CLIENT_ROUND_PLAN.md` + `CLIENT_ROUND_MILESTONES.md` | Billing/invoice/approval/school-detail G1-G4 | Agreed 2026-09-11 |
| `TEAM_FEEDBACK_PLAN.md` + `TEAM_FEEDBACK_MILESTONES.md` | Dialog/thumbnail/jadwal/trainer/finance G1-G5 | Agreed 2026-09-18 |
| `RELEASE_GATES.md` | Go-live Gates G0-G5 | OPEN 2026-09-27 |
| `HYGIENE_PLAN.md` + `HYGIENE_MILESTONES.md` | Test-env + plan-doc sync precondition | Precondition |
| `PLAYWRIGHT_MIGRATION_PLAN.md` + `PLAYWRIGHT_MIGRATION_MILESTONES.md` | 13 pre-M4.2 specs off RolePicker | Migration chain |
| `AUDIT_PLAN.md` + `AUDIT_MILESTONES.md` | Stress-simulation findings F1-F24 | Source of truth for F-range |
| `AUDIT_FOLLOWUP_PLAN.md` + `AUDIT_FOLLOWUP_MILESTONES.md` | Round-trip+CRUD findings AF1-AF11 | Follow-up chain |
| `audit-sql-crud_2026-09-04.md` | SQL-CRUD walkthrough F-24 (source: `log-doc/`) | Walkthrough |
| `PRODUCTION_PLAN.md` + `PRODUCTION_MILESTONES.md` + `PRODUCTION_GATE_CONFIRMATION_MILESTONES.md` | Product boundary + ordered milestones + temp confirmation checklist | Authoritative + temp checklist |
| `TRAINER_ATTENDANCE_PLAN.md` + `TRAINER_ATTENDANCE_MILESTONES.md` + `TA_C2B_VALIDATION.md` | Instruktur+Asisten attendance, honor source sign-off | DONE 2026-09-23 (contract ref) |
| `PENUGASAN_PLAN.md` + `PENUGASAN_MILESTONES.md` | Assignment write + timetable + export (+PG.D guard) | DONE 2026-09-24 |
| `SPP_BILLING_PLAN.md` + `SPP_BILLING_MILESTONES.md` | Tarif per pertemuan, cicilan, pelunasan SB.A-SB.C | DRAFT 2026-09-16 |
| `INVOICE_DELETE_GUARD.md` | SPP-list delete popup carry-over | IN PROGRESS 2026-09-20 |
| `INVOICE_DOC_PARITY.md` | Server invoice doc matching `invoice-template.pdf` | IMPLEMENTED 2026-09-20 |

## C. Closed / archive candidates — PROPOSED ONLY, no moves in this change

Rule: move verbatim to `docs/archive/YYYY-MM-DD-<topic>/` only after write-back is recorded on the source doc named in the file's own close section. Do not renumber other chains (taste #74 N/A when no microtasks added).

| File | Close evidence in file | Write-back target |
|------|------------------------|-------------------|
| `COVER_SLOT_PLAN.md` + `COVER_SLOT_MILESTONES.md` | DONE 2026-09-27, Gates CS.A-CS.C | `SCOPE_EXPANSION_MILESTONES.md` |
| `DOUBLE_BOOKING_PLAN.md` + `DOUBLE_BOOKING_MILESTONES.md` | DONE 2026-09-28, Gate DB.A | `SCOPE_EXPANSION_MILESTONES.md` Gate DB |
| `BULK_RECONCILE_PLAN.md` | DONE 2026-09-29, BR.1-BR.3 | `SCOPE_EXPANSION_MILESTONES.md` Gate BR + `SPP_BILLING_PLAN.md` §10 |
| `TEAM_ROUND2_PLAN.md` + `TEAM_ROUND2_MILESTONES.md` | DONE 2026-09-29, T2.A-T2.E | `SCOPE_EXPANSION_MILESTONES.md` |
| `RELEASE_HYGIENE_PLAN.md` + `RELEASE_HYGIENE_MILESTONES.md` | IMPLEMENTED 2026-09-11, RH.A-RH.H | `PRODUCTION_MILESTONES.md` + confirmation doc |
| `LOGO_PORTABILITY_PLAN.md` + `LOGO_PORTABILITY_MILESTONES.md` | IMPLEMENTED 2026-09-12, LP-C | Source docs per §11 |
| `SB_FOLLOWUP_FIX.md` | CLOSED 2026-09-18 | `SPP_BILLING_MILESTONES.md` + `SCOPE_EXPANSION_MILESTONES.md` |
| `ASISTENIDS_SCOPE_FIX.md` | CLOSED 2026-09-28 | Stays as record, no renumber |

## D. Subfolders (not counted in 79)

- `docs/log-doc/` — session logs, audit reports, test-output logs (evidence, never edit).
- `docs/img-doc/` — audit screenshots (evidence).
- `docs/exemplar/` — ground-truth Excel/SQL for EXEMPLAR_MIGRATION (do not restructure).
- `docs/superpowers/` — specs produced via brainstorming skill (`YYYY-MM-DD-<topic>-design.md`).

## Verification / Remaining

- `Verified:` to run after write: `Test-Path docs/README.md`, node link-resolve check (80/80 present, no missing), `git status --porcelain docs/` inspected — pre-existing dirty/untracked files disclosed, not claimed as this change.
- `Changed:` `docs/README.md` only (this change). No moves, no content edits elsewhere.
- `Remaining:` owner approval of §C archive list; actual `docs/archive/` moves as a separate gated change.
