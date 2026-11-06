# Admin Dashboard Enhancement Milestones — Microtask Chain (E3.1 → E3.9)

**Companion to `docs/ADMIN_DASHBOARD_ENHANCEMENT_PLAN.md`.**  
Each microtask carries an explicit observable outcome + falsifiable VERIFY. Later work starts only after earlier gates pass.

---

## Gate Exit Criteria

Chain closes when:
1. "Harga Satuan" never displays `RpNaN` across all invoice views, and `formatRupiah` defensively handles non-numeric inputs.
2. Schools can be classified as `Aktif` or `Non-Aktif`, with inactive schools filtered out of active views, student registration, and automated invoice generation.
3. Superadmin and Admin Cabang can change their passwords on demand via the profile menu.
4. Unauthenticated users can request password resets on the login page via SMTP email with 1-hour expiration.
5. Invoices support multiple follow-up entries in a folded accordion with receipt proof uploads.
6. Follow-up payments reduce remaining balance, display unpaid remainder in red, and carry over to subsequent invoices.
7. Clean production build (`npm run build`) and full test suite passing.

---

### E3.1: Fix "Harga Satuan" NaN Bug & Currency Guard

```text
MICROTASK: Fix Harga Satuan NaN in templates and add defensive formatRupiah

EDIT: src/lib/format.js,
      src/features/reports/InvoiceTemplate.jsx,
      src/features/reports/InvoiceModal.jsx,
      server/lib/invoiceDoc.php,
      src/lib/__tests__/invoice-harga-satuan.test.js (new)

FINDS: Harga Satuan undefined for per-meeting invoices, resulting in RpNaN

RULES: R1, R2; multi-tier fallback; formatRupiah returns "Rp 0" for non-numbers

DEPENDS: none

OUTCOME: Invoice views correctly display unit price for both flat and per-meeting
         invoices; formatRupiah(undefined) returns "Rp 0".

VERIFY: npm test -- invoice-harga-satuan
        -> 4/4 pass

DONE-IF: verify passes; no RpNaN renders in invoice views
```

---

### E3.2: School Status "Aktif" & "Non-Aktif" with Operational Isolation

```text
MICROTASK: School status classification and operational filtering

EDIT: src/lib/constants.js,
      src/features/schools/SchoolList.jsx,
      server/validation/entities.php,
      server/lib/invoiceGenerator.php,
      src/lib/__tests__/school-status.test.js (new)

FINDS: Schools lack active/inactive status; inactive schools generate invoices

RULES: R1, R3; default 'Aktif'; filter pills [Aktif], [Non-Aktif], [Semua];
       inactive schools excluded from automated invoice generator

DEPENDS: E3.1

OUTCOME: School can be marked Aktif or Non-Aktif in form; Non-Aktif schools are
         hidden by default in SchoolList and skipped during invoice generation.

VERIFY: npm test -- school-status
        -> 4/4 pass

DONE-IF: verify passes; inactive schools hidden from active tab
```

---

### E3.3: Authenticated Change Password Modal in Profile Menu

```text
MICROTASK: Ubah Kata Sandi modal for Superadmin and Admin Cabang

EDIT: src/components/ChangePasswordModal.jsx (new),
      src/components/AccountMenu.jsx,
      src/App.jsx,
      src/components/__tests__/ChangePasswordModal.test.jsx (new)

FINDS: Logged-in admins have no UI to change password on demand

RULES: R1; password policy min 12 chars, upper, lower, digit; superadmin & admin_cabang

DEPENDS: E3.2

OUTCOME: "Ubah Kata Sandi" menu item opens modal; successfully calls change-password API
         and notifies user.

VERIFY: npm test -- ChangePasswordModal
        -> 3/3 pass

DONE-IF: verify passes; password change succeeds cleanly
```

---

### E3.4: Users Email Migration, SMTP Config, & Mailer Helper

```text
MICROTASK: DB migration, SMTP configuration template, and socket mailer

EDIT: server/migrations/2026-11-06-users-email-and-reset-token.sql (new),
      server/config.smtp.example.php (new),
      server/lib/mailer.php (new),
      server/tests/mailer.contract.php (new)

FINDS: users table has no email or reset tokens; no SMTP mailer helper

RULES: R5; zero dependencies (stream_socket_client); ready-to-edit config file

DEPENDS: E3.3

OUTCOME: users table migration file created; mailer sends compliant SMTP packets
         or logs when unconfigured.

VERIFY: php server/tests/mailer.contract.php
        -> pass

DONE-IF: verify passes; migration file syntactically valid
```

---

### E3.5: Forgot Password & Reset Password API Endpoints

```text
MICROTASK: Endpoints for forgot password token dispatch and expiration check

EDIT: server/api/auth/forgot-password.php (new),
      server/api/auth/reset-password.php (new),
      server/tests/forgot-password.lifecycle.php (new)

FINDS: No password reset endpoints with token lifecycle and expiration

RULES: 32-byte crypto random token; sha256 hash stored; 1-hour expiration;
       expired token returns 422 with informative message

DEPENDS: E3.4

OUTCOME: forgot-password generates token & expiry; reset-password enforces expiry,
         updates hash, and clears tokens.

VERIFY: php server/tests/forgot-password.lifecycle.php
        -> pass (token generation, expiry enforcement, password update)

DONE-IF: verify passes; expired tokens rejected
```

---

### E3.6: Forgot Password UI & User Email Configuration

```text
MICROTASK: Login page forgot password trigger, reset page, and email inputs

EDIT: src/features/auth/ForgotPasswordModal.jsx (new),
      src/features/auth/ResetPasswordPage.jsx (new),
      src/features/auth/LoginPage.jsx,
      src/features/admin/BranchManager.jsx,
      src/components/SettingsModal.jsx,
      src/App.jsx,
      src/features/auth/__tests__/ForgotPassword.test.jsx (new)

FINDS: No forgot password link on login page; no email field in branch manager

RULES: R1; text button below password; URL ?resetToken= renders reset page

DEPENDS: E3.5

OUTCOME: User can click "Lupa kata sandi?" on login page; enter username/email;
         Admins can configure email in BranchManager and SettingsModal.

VERIFY: npm test -- ForgotPassword
        -> 3/3 pass

DONE-IF: verify passes; reset screen responds to ?resetToken query
```

---

### E3.7: Multi-Entry Invoice Follow-Up Accordion & Receipt Upload

```text
MICROTASK: Invoice follow-up history accordion, photo upload, & branch authorization

EDIT: src/features/reports/InvoiceModal.jsx,
      src/lib/invoices.js,
      server/auth/authorize.php,
      server/api/invoices.php,
      src/features/reports/__tests__/invoice-followup-ui.test.jsx (new)

FINDS: followUp overwrites previous entry; no photo upload; admin_cabang denied

RULES: R4; followUps array on invoice payload; collapsible cards; admin_cabang
       allowed for own branch; server photo storage via photo-upload.php

DEPENDS: E3.6

OUTCOME: Previous follow-ups fold into cards with receipt thumbnails; new follow-up
         form below adds records without overwriting.

VERIFY: npm test -- invoice-followup-ui
        -> 4/4 pass

DONE-IF: verify passes; multiple follow-ups persist and expand/collapse
```

---

### E3.8: Follow-Up Payment Ledger Integration, Cash Revenue, & Carry-Over

```text
MICROTASK: Follow-up payment registration, settlement reduction, and carry-over

EDIT: src/lib/invoices.js,
      src/features/reports/InvoiceModal.jsx,
      src/lib/finance.js,
      src/lib/__tests__/invoice-followup-ledger.test.js (new)

FINDS: Follow-up nominal does not settle invoice or carry over remaining balance

RULES: R2; school-level sppPayment row created; settlement.dibayar reflects payment;
       unpaid remainder displayed in red; carryOverLines picks up unpaid balance

DEPENDS: E3.7

OUTCOME: Follow-up payment reduces invoice sisa, appears in FinanceReport income,
         displays red balance, and carries over to next invoice.

VERIFY: npm test -- invoice-followup-ledger
        -> 4/4 pass

DONE-IF: verify passes; carry-over lines contain correct leftover balance
```

---

### E3.9: Full Regression Suite & Production Build Verification

```text
MICROTASK: Full suite green and clean production build

EDIT: docs/ADMIN_DASHBOARD_ENHANCEMENT_PLAN.md (status update)

FINDS: none

RULES: Clean build, zero test failures, source hygiene

DEPENDS: E3.1..E3.8

OUTCOME: All Vitest & Playwright unit tests pass; npm run build succeeds.

VERIFY: npm test && npm run build
        -> all suites pass, dist generated

DONE-IF: 0 build errors, 0 test failures
```
