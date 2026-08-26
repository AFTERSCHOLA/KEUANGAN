# Afterschola Audit Plan

Source of truth for this document: the full three-role stress simulation (`tests/stress-simulation.spec.js`, run 2026-08-25) plus the code review and evaluation session that followed it. Every finding has a stable ID (`F1`…`F24`) that `AUDIT_MILESTONES.md` references, so fixes stay traceable end to end.

## 1. Scope and boundary

This plan covers defects, inconsistencies, permission gaps, UX/accessibility issues, and refinements discovered by simulating the Superadmin, Admin Cabang, and Trainer flows with synthetic data. It deliberately excludes new business capabilities (flexible honor matrices, real-time sync, cloud storage) — those remain governed by `PRODUCTION_PLAN.md`. Nothing here weakens an existing production invariant; where a fix touches a ledger or privilege rule, the stricter of the two documents wins.

## 2. Finding register

Severity: **P1** blocks or corrupts user work, **P2** wrong behavior or permission drift, **P3** polish/consistency.

### P1 — Broken or data-corrupting

| ID | Finding | Where |
|---|---|---|
| F1 | School-card edit button renders with empty children — invisible, untitled, unreachable by keyboard users | `src/features/schools/SchoolList.jsx` (~line 223) |
| F2 | Trainer delete-icon SVG path truncated (`M19 7l-.867 12.142A2 2 0 0116.138 21`) — renders a broken arc, not a trash can | `src/features/trainers/TrainerList.jsx` (~line 125) |
| F3 | Student delete-icon SVG path truncated the same way | `src/features/students/StudentList.jsx` (~line 223) |
| F4 | Honor-payroll ConfirmDialog never closes after confirm (`onConfirm` does not reset `confirmOpen`) — overlay blocks the entire app until Batal is clicked | `src/features/payments/PaymentTable.jsx` (`lunaskan`, `deletePayment`) |
| F5 | Honor overpayment accepted silently; Sisa Kewajiban displays negative balances (observed `-Rp 99.974.999`) with no credit concept or post-facto warning | `PaymentTable.jsx` + `src/lib/finance.js` |
| F6 | Same-day attendance silently overwrites: record id is `tanggal_sekolahId_trainerId`; `sesiKe` exists in schema but the form never increments it — second session destroys the first | `src/lib/constants.js` `newAbsensi()`, `AttendanceForm.jsx` |

### P2 — Logic, permissions, integrity

| ID | Finding | Where |
|---|---|---|
| F7 | Admin Cabang sees full honor-payroll write UI (Lunaskan / Bayar Manual / delete), but server policy denies `write_honor_payment`/`settle_honor` to `admin_cabang` — offline writes will queue then conflict on sync | `PaymentTable.jsx` vs `server/auth/authorize.php` |
| F8 | Deleting a trainer erases their unpaid liability from reports (beban = sessions × tarif of existing trainers) while their `honorPayments` survive — Laba/Rugi skews | `src/lib/finance.js` |
| F9 | Same pattern for students: delete a paying student → pemasukan stays, potensi drops; collection rate can exceed 100% | `src/lib/finance.js` |
| F10 | Invoice status (Draft→Terbit→Lunas) and the sppPayments ledger track payment independently; marking Lunas never reconciles with actual SPP entries | `src/lib/invoices.js`, `InvoiceModal.jsx` |
| F11 | Settings modal (global identity, bank account, invoice signer — affects every branch's printed invoices) is editable by admin_cabang and trainer | `src/components/SettingsModal.jsx`, sidebar in `App.jsx` |
| F12 | Backup & Restore (full export incl. other branches' locally cached records; destructive overwrite) reachable by all roles | `BackupRestorePanel.jsx`, `App.jsx` sidebar |
| F13 | Verification stamp records only the role (`statusVerifikasi.by = 'superadmin'`), never the person — "who verified?" is unanswerable | `RiwayatAbsensi.jsx` |
| F14 | Invoice numbers generated client-side via count+1 — concurrent admins mint duplicates | `src/lib/invoices.js` `generateInvoiceNumber()` |
| F15 | Server RBAC layer (`authorize.php`) is complete but never invoked by any data endpoint; only `/api/auth/*` authenticates | `server/api/*.php` |
| F16 | Backup/restore does not cover IndexedDB photos — restore silently loses attendance documentation and payment proof photos | `src/lib/backup.js` (localStorage entities only) |

### P3 — Consistency, UX, accessibility

| ID | Finding | Where |
|---|---|---|
| F17 | Jadwal duplication: free-text `jadwal` on both Sekolah and Trainer forms; only the school's string drives "Jadwal Hari Ini" (fragile substring match on Indonesian day names); trainer-level field is decorative | `SchoolList.jsx`, `TrainerList.jsx`, `TrainerDashboard.jsx` |
| F18 | Three competing money-input patterns: `RupiahInput` (schools), bare number input (SPP modal), ad-hoc formatted text (honor modal) | `RupiahInput.jsx`, `SppPaymentModal.jsx`, `PaymentTable.jsx` |
| F19 | Modal system has no Escape-to-close and no focus trap; a stuck dialog is escapable only by mouse (proven by simulation stalls) | `src/components/Modal.jsx`, `ConfirmDialog.jsx` |
| F20 | RolePicker trainer dropdown lacks aria-label while the cabang dropdown has one; icon-only buttons across lists lack labels/titles | `RolePicker.jsx`, list components |
| F21 | Student foto URL field adds no operational value, stores minors' photos without consent tracking, and duplicates the image-input paradigm; school foto URL field falls back to a hardcoded stock photo when broken/missing | `StudentList.jsx` `SiswaForm`, `SchoolList.jsx` `SchoolForm` |
| F22 | Validation inconsistency: Branch/School forms validate required fields; Trainer/Siswa forms save fully empty records | `TrainerList.jsx`, `StudentList.jsx` |
| F23 | No URL routing anywhere — invoice print view is pure component state; browser Back exits the app mid-flow | `App.jsx`, `InvoiceTemplate.jsx` |
| F24 | Dead code & duplicate icon: unused `bootstrapAuth/getCurrentUser/logout` imports, unreachable `comingSoon` nav branch, "Umur Piutang" reuses Riwayat's clock icon | `App.jsx` |

## 3. Product decisions

These resolve open questions raised by the findings; milestones depend on them.

- **D1 — Ledger immutability (resolves F5, relates F10):** payments are append-only. Overpayment is allowed but must be surfaced as a visible trainer credit, not a negative sisa. No clamping, no editing history.
- **D2 — Honor payroll authority (resolves F7):** payouts remain pusat-only per `PRODUCTION_PLAN.md` §5. Admin Cabang gets read-only payroll visibility; the UI must match the server matrix, not fight it.
- **D3 — Photo policy (resolves F21, F16):** images enter only through `PhotoSlot` (compressed, IndexedDB). The student foto field is deleted outright (privacy: minors' photos without consent tracking have no payoff). School foto becomes a PhotoSlot so branches can actually use it. Backup must include photos.
- **D4 — Jadwal model (resolves F17):** school jadwal becomes structured (day multi-select + time text); trainer jadwal field is removed as input and shown derived from assignments.
- **D5 — Attendance identity (relates F6, F13):** verification stamps carry username/displayName; same-day sessions append via `sesiKe` instead of overwriting.

## 4. Rules carried into implementation

- **RA:** Every dialog closes itself on confirm/cancel and supports Escape; focus returns to the trigger element.
- **RB:** Every icon-only button carries an accessible name (icon + `title` + `aria-label`).
- **RC:** Money entry uses `RupiahInput` everywhere; display uses `formatRupiah`.
- **RD:** Ledger rows are created or deleted-with-confirm, never edited in place; corrections re-enter.
- **RE:** Role-gated surfaces hide their actions for unauthorized roles at render time (hidden UI is not security, but visible-but-forbidden UI is a defect).
- **RF:** New Playwright coverage accompanies each fixed gate; `tests/stress-simulation.spec.js` must pass clean afterward.

## 5. Out of scope for this audit cycle

Server endpoint wiring (F15) is documented here but implemented under `PRODUCTION_MILESTONES.md` M3.3, which already owns it; this audit only verifies it stays tracked. Routing (F23) gets a hash-router feasibility note only — a real router migration is its own project. No new features beyond D1–D5.
