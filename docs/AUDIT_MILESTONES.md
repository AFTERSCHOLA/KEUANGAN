# Afterschola Audit Milestones

Fixes for the stress-simulation audit (`AUDIT_PLAN.md`). Each microtask is strictly ordered within its gate; do not start the next until the current `VERIFY` passes. A failing check becomes a bounded follow-up; do not patch unrelated files. Finding IDs (F1–F24) and decisions (D1–D5) reference `AUDIT_PLAN.md`.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F/D references>
  RULES:   <RA–RF + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

## Gate A1 — Visible, closing dialogs and icons

### M-A1.1 Restore dead action buttons

```text
MICROTASK: Restore dead action buttons
  EDIT:    src/features/schools/SchoolList.jsx, src/features/trainers/TrainerList.jsx, src/features/students/StudentList.jsx
  FINDS:   F1, F2, F3
  RULES:   RB; visual parity with sibling icon buttons
  DEPENDS: none
  OUTCOME: every school card shows a pencil edit button with icon+title, and trainer/student delete buttons render complete trash-can icons
  VERIFY:  Playwright asserts each card's action bar has no childless/titleless button and every delete SVG path contains the full glyph segments
  DONE-IF: verify passes; only intended files changed
```

### M-A1.2 Fix confirm dialog lifecycle

```text
MICROTASK: Fix confirm dialog lifecycle
  EDIT:    src/features/payments/PaymentTable.jsx
  FINDS:   F4
  RULES:   RA
  DEPENDS: M-A1.1
  OUTCOME: Lunaskan, Bayar Manual overpay-confirm, and payment-delete dialogs close themselves after their action runs
  VERIFY:  Playwright performs an honor payment then asserts the overlay is gone and Data Pembayaran is interactive without clicking Batal
  DONE-IF: verify passes; only intended files changed
```

### M-A1.3 Harden modal behavior

```text
MICROTASK: Harden modal behavior
  EDIT:    src/components/Modal.jsx, src/components/ConfirmDialog.jsx, AlertDialog consumers if needed
  FINDS:   F19
  RULES:   RA
  DEPENDS: M-A1.2
  OUTCOME: all three dialog types close on Escape (and ConfirmDialog on backdrop click), return focus to the trigger, and trap Tab while open
  VERIFY:  Playwright opens School/Branch/Payment modals, presses Escape, asserts closure and focus restoration in all cases
  DONE-IF: verify passes; only intended files changed
```

## Gate A2 — Financial integrity

### M-A2.1 Model overpayment as credit

```text
MICROTASK: Model overpayment as credit
  EDIT:    src/lib/finance.js, src/features/payments/PaymentTable.jsx, FinanceReport display cells
  FINDS:   F5; D1
  RULES:   RD; ledger stays append-only; no clamping of history
  DEPENDS: M-A1.2
  OUTCOME: sisa kewajiban floors at zero and any surplus appears as "Kredit Trainer" visible on the payroll row and in reports instead of a negative balance
  VERIFY:  unit tests pay 99.999.999 against 75.000 beban and assert sisa=0, credit=99.924.999, labaRugi unchanged; Playwright shows the credit chip
  DONE-IF: verify passes; only intended files changed
```

### M-A2.2 Preserve deleted-party liability

```text
MICROTASK: Preserve deleted-party liability
  EDIT:    src/lib/finance.js, delete confirms in TrainerList.jsx / StudentList.jsx
  FINDS:   F8, F9
  RULES:   finance memo invariants from PRODUCTION_PLAN §6
  DEPENDS: M-A2.1
  OUTCOME: deleting a trainer or student with open liability or paid history is blocked with a message naming the amount, or requires explicit acknowledge-and-archive confirmation
  VERIFY:  unit tests delete a trainer with unpaid beban and a student with sppPayments; both paths refuse or archive with preserved totals; reports stay balanced
  DONE-IF: verify passes; only intended files changed
```

### M-A2.3 Append same-day attendance sessions

```text
MICROTASK: Append same-day attendance sessions
  EDIT:    src/lib/constants.js (newAbsensi id/sesiKe), src/features/attendance/index.jsx loadForCorrection flow
  FINDS:   F6; D5
  RULES:   append-only absensi semantics; correction loads explicit record
  DEPENDS: none
  OUTCOME: saving a second session for the same tanggal+sekolah+trainer creates sesiKe=2 instead of overwriting, and Riwayat lists both
  VERIFY:  Playwright saves two same-day sessions for one school/trainer and asserts two distinct records with sesiKe 1 and 2 survive reload
  DONE-IF: verify passes; only intended files changed
```

## Gate A3 — Permission alignment

### M-A3.1 Restrict honor payroll to superadmin writes

```text
MICROTASK: Restrict honor payroll to superadmin writes
  EDIT:    src/features/payments/PaymentTable.jsx (role-aware actions), store scope notes
  FINDS:   F7; D2
  RULES:   RE; matches server authorize.php matrix (payouts pusat-only)
  DEPENDS: none
  OUTCOME: admin_cabang sees payroll figures read-only without Lunaskan/Bayar Manual/delete controls; superadmin keeps full actions
  VERIFY:  Playwright as admin_cabang asserts absence of write controls, as superadmin asserts presence; stress simulation phase B updated accordingly
  DONE-IF: verify passes; only intended files changed
```

### M-A3.2 Gate global settings and backup

```text
MICROTASK: Gate global settings and backup
  EDIT:    App.jsx sidebar rendering, SettingsModal.jsx, BackupRestorePanel.jsx
  FINDS:   F11, F12
  RULES:   RE; PRODUCTION_PLAN matrix rows "Global settings" and "Restore"
  DEPENDS: none
  OUTCOME: Pengaturan identity/invoice-info sections and restore/export actions render only for superadmin; other roles see neither entry point nor modal content
  VERIFY:  Playwright as admin_cabang and trainer asserts missing sidebar entries and denied deep-open; superadmin path unchanged
  DONE-IF: verify passes; only intended files changed
```

### M-A3.3 Attribute verification stamps

```text
MICROTASK: Attribute verification stamps
  EDIT:    src/features/attendance/RiwayatAbsensi.jsx, src/lib/store.js role context plumbing
  FINDS:   F13; D5
  RULES:   audit-style attribution; no PII beyond displayName
  DEPENDS: none
  OUTCOME: verifying an attendance record stores { byRole, byName, at } and the table displays the verifier's name
  VERIFY:  Playwright verifies as Superadmin then asserts tooltip/row shows display name, not just role
  DONE-IF: verify passes; only intended files changed
```

## Gate A4 — Input consistency and photo policy

### M-A4.1 Unify money inputs

```text
MICROTASK: Unify money inputs
  EDIT:    src/features/payments/SppPaymentModal.jsx, src/features/payments/PaymentTable.jsx pay modal
  FINDS:   F18
  RULES:   RC
  DEPENDS: M-A2.1
  OUTCOME: SPP nominal and honor nominal fields use RupiahInput with Rp prefix and grouped digits like every other money field
  VERIFY:  Playwright types into both modals and asserts formatted display plus raw numeric onChange values saved correctly
  DONE-IF: verify passes; only intended files changed
```

### M-A4.2 Remove student foto field

```text
MICROTASK: Remove student foto field
  EDIT:    src/features/students/StudentList.jsx (SiswaForm), src/lib/constants.js newSiswa
  FINDS:   F21; D3
  RULES:   D3 privacy decision; legacy records degrade gracefully
  DEPENDS: none
  OUTCOME: student form has no foto input; existing records with fotos still render their image but new students cannot add one
  VERIFY:  Playwright asserts the field is gone, saves a student, and legacy-foto fixture still renders avatar/img without errors
  DONE-IF: verify passes; only intended files changed
```

### M-A4.3 Convert school foto to picker

```text
MICROTASK: Convert school foto to picker
  EDIT:    src/features/schools/SchoolList.jsx SchoolForm, PhotoSlot reuse, backup module
  FINDS:   F21, F16; D3
  RULES:   D3 single image-input pattern; photos never in localStorage
  DEPENDS: M-A4.2
  OUTCOME: school form uses PhotoSlot (file pick, compress, IndexedDB) and backup export includes photo entries so restore preserves them
  VERIFY:  Playwright picks a local image, saves, exports backup, wipes storage, restores, and asserts the photo still renders
  DONE-IF: verify passes; only intended files changed
```

### M-A4.4 Structure jadwal input

```text
MICROTASK: Structure jadwal input
  EDIT:    src/features/schools/SchoolList.jsx SchoolForm + card chip, TrainerDashboard parser, TrainerList.jsx form
  FINDS:   F17; D4
  RULES:   D4; keep backward read of legacy free-text until migrated
  DEPENDS: none
  OUTCOME: school jadwal uses day multi-select + time text feeding a reliable matcher; trainer form drops its jadwal input and cards show assignment-derived schedule
  VERIFY:  unit tests match structured jadwal across day names; Playwright proves Rekap Saya lists today's schools without substring fragility
  DONE-IF: verify passes; only intended files changed
```

### M-A4.5 Enforce required-field validation

```text
MICROTASK: Enforce required-field validation
  EDIT:    src/features/trainers/TrainerList.jsx save(), src/features/students/StudentList.jsx save(), AlertDialog copy
  FINDS:   F22
  RULES:   consistent validation idiom matching Branch/School forms
  DEPENDS: none
  OUTCOME: trainer and student forms reject empty-name saves with the standard warning alert
  VERIFY:  Playwright attempts blank saves on both forms and asserts alert + no record created
  DONE-IF: verify passes; only intended files changed
```

## Gate A5 — Hygiene and follow-through

### M-A5.1 Clean dead code and duplicate icon

```text
MICROTASK: Clean dead code and duplicate icon
  EDIT:    src/App.jsx imports and comingSoon branch, Umur Piutang icon path
  FINDS:   F24
  RULES:   no functional changes beyond icon swap
  DEPENDS: none
  OUTCOME: unused auth imports and unreachable nav branch are removed; Umur Piutang gets a distinct chart-bar icon
  VERIFY:  npm run build passes and grep finds no bootstrapAuth/getCurrentUser/logout references outside lib/auth.js
  DONE-IF: verify passes; only intended files changed
```

### M-A5.2 Add accessibility linting

```text
MICROTASK: Add accessibility linting
  EDIT:    eslint config, package.json devDependencies, RolePicker.jsx trainer select aria-label
  FINDS:   F20
  RULES:   RB
  DEPENDS: M-A1.1
  OUTCOME: eslint-plugin-jsx-a11y runs in CI with alt-text and interactive-supports-focus rules active, and the trainer dropdown is labeled
  VERIFY:  npx eslint src --max-warnings=0 exits clean after fixes and fails when a labelless icon button is reintroduced (negative test)
  DONE-IF: verify passes; only intended files changed
```

### M-A5.3 Re-run regression suite

```text
MICROTASK: Re-run regression suite
  EDIT:    tests/stress-simulation.spec.js expectation updates only where gates intentionally changed UI (e.g., hidden payroll buttons)
  FINDS:   RF
  RULES:   all existing M5/Phase 5–7 exit gates remain mandatory
  DEPENDS: M-A1.x through M-A5.2
  OUTCOME: full vitest + focused Playwright + stress simulation pass with zero page errors against the fixed app
  VERIFY:  npm test, npx playwright test tests/stress-simulation.spec.js, npm run build all exit 0
  DONE-IF: verify passes; only intended files changed
```

## Deferred with owners

| Item | Owner | Resolves under |
|---|---|---|
| F10 invoice↔ledger reconciliation | Product integration | Needs business rule decision (auto-Lunas threshold); propose in next planning cycle |
| F14 server-side invoice numbering | Platform/auth | Blocked by PRODUCTION M3.4 domain endpoints |
| F15 endpoint authorization wiring | Platform/auth | Already owned by PRODUCTION_MILESTONES M3.3 |
| F23 hash routing feasibility | Product integration | Spike only; migration is out of audit scope |

The audit cycle is done when Gates A1–A5 verify green, `stress-simulation.spec.js` passes clean, and every finding in `AUDIT_PLAN.md` is either fixed or listed above with an owner.
