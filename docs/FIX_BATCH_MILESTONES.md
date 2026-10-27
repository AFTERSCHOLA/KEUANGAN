# Fix Batch Milestones

Fixes for `docs/FIX_BATCH_PLAN.md` F1–F8. Strictly ordered; do not start next until VERIFY passes.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F/D references>
  RULES:   <R + invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable check>
  DONE-IF: verify passes; only intended files changed
```

## Gate F-A — Auth correctness (P1)

### M-F1 Disclose lockout + clear on password change

```text
MICROTASK: Disclose lockout + clear on change
  EDIT:    server/auth/session.php, server/api/auth/login.php, server/api/auth/change-password.php, server/api/users.php
  FINDS:   F1; D1
  RULES:   R1, R3; keep 5-fails/15-min; never enumerate which field wrong
  DEPENDS: none
  OUTCOME: locked logins keep the generic 401 (AA.B.2), and change/reset clears login_attempts so the new password works on the next login
  VERIFY:  `php server/tests/lockout-disclosure.check.php` + `php server/tests/throttle-csrf.matrix.php` pass; manual: 5 wrong -> change-password -> immediate re-login 200
  DONE-IF: verify passes; only intended files changed
```

### M-F2 Add Admin Cabang reset for Trainer

```text
MICROTASK: Add Admin Cabang reset for Trainer
  EDIT:    src/features/trainers/TrainerList.jsx, src/lib/store.js (only if action missing)
  FINDS:   F2; D2
  RULES:   R1, R2; gate admin_cabang own-cabang trainer-only, mirror initialPasswordDialog copy
  DEPENDS: M-F1
  OUTCOME: admin_cabang sees Reset Kata Sandi on trainer card/edit, success shows username + temp password once with Saya sudah catat tutup, trainer forced to Ubah Kata Sandi
  VERIFY:  `npx playwright test tests/trainer-reset.spec.js --workers=1` passes (create trainer, reset as admin_cabang, login trainer -> MustChangePasswordPage, superadmin cross-cabang reset 403)
  DONE-IF: verify passes; only intended files changed
```

## Gate F-B — Invoice + login UX (P2)

### M-F3 Footer logo + Afterschola on Invoice

```text
MICROTASK: Footer logo + Afterschola on Invoice
  EDIT:    src/features/reports/InvoiceTemplate.jsx, server/lib/invoiceDoc.php
  FINDS:   F3; D3
  RULES:   R2; mirror header logo idiom, h-8 footer, Indonesian copy unchanged
  DEPENDS: M-F2
  OUTCOME: printed + Dokumen Resmi invoice shows bottom-left Official Logo and text Afterschola
  VERIFY:  `npx playwright test tests/invoice-footer.spec.js --workers=1` passes (footer img + Afterschola visible in .printable-report and invoices-doc HTML)
  DONE-IF: verify passes; only intended files changed
```

### M-F4 Search + grouping on Data Siswa

```text
MICROTASK: Search + grouping on Data Siswa
  EDIT:    src/features/students/StudentList.jsx
  FINDS:   F4; D4
  RULES:   R2; preserve Hanya yang menunggak + Riwayat (N) math, getByRole searchbox
  DEPENDS: M-F3
  OUTCOME: top bar has Cari input + Kelompokkan select, grouping renders headers with counts, empty shows Tidak ada siswa yang menunggak
  VERIFY:  `npx playwright test tests/siswa-search-group.spec.js --workers=1` passes
  DONE-IF: verify passes; only intended files changed
```

### M-F5 Show/hide password on login

```text
MICROTASK: Show/hide password on login
  EDIT:    src/features/auth/LoginPage.jsx, src/features/auth/MustChangePasswordPage.jsx, src/components/PasswordField.jsx (new only if shared)
  FINDS:   F5
  RULES:   R2; eye button aria-label Tampilkan/Sembunyikan, type password default
  DEPENDS: M-F4
  OUTCOME: password fields have eye toggle flipping type password/text without clearing value
  VERIFY:  `npx playwright test tests/login-toggle.spec.js --workers=1` passes
  DONE-IF: verify passes; only intended files changed
```

### M-F6 Single-page print for Invoice/Raport

```text
MICROTASK: Single-page print for Invoice/Raport
  EDIT:    src/print.css, src/features/reports/InvoiceTemplate.jsx (class only)
  FINDS:   F6; D6
  RULES:   R2; do not break .raport-sheet 794x1122, thead repeat, tr avoid-break
  DEPENDS: M-F5
  OUTCOME: 20-item invoice + settlement prints without orphan mid-row break, header repeats, footer pinned
  VERIFY:  `npx playwright test tests/print-single.spec.js --workers=1` passes (window.print intercept + long invoice 1-page assertion)
  DONE-IF: verify passes; only intended files changed
```

## Gate F-C — Polish (P3, optional but included)

### M-F7 Collapse Trainer Jadwal + CSV semicolon

```text
MICROTASK: Collapse Trainer Jadwal + CSV semicolon
  EDIT:    src/features/trainers/TrainerList.jsx, src/lib/csv.js, tests/csv-delimiter.test.js
  FINDS:   F7, F8; D5
  RULES:   R2, R3; mirror Riwayat (N) expand, keep BOM + quoting, ; delimiter all exports
  DEPENDS: M-F6
  OUTCOME: trainer card shows Lihat jadwal (N) collapsed by default, CSV opens split in Excel ID
  VERIFY:  `npm test -- csv-delimiter` + `npx playwright test tests/trainer-jadwal.spec.js tests/csv-export.spec.js --workers=1` passes; `npm run build` exit 0
  DONE-IF: verify passes; only intended files changed
```
